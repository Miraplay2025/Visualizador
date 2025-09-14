// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

// 🔹 Sessões em memória
const sessions = new Map();
// 🔹 Locks por sessão
const sessionLocks = new Map();

// ────────── Funções utilitárias ──────────
function log(route, msg) {
  console.log(`[${new Date().toISOString()}] ${route} → ${msg}`);
}

// Mutex por sessão → garante que requisições simultâneas da mesma sessão não se sobreponham
async function runWithLock(name, fn) {
  if (!sessionLocks.has(name)) {
    sessionLocks.set(name, Promise.resolve());
  }
  const lock = sessionLocks.get(name);
  const newLock = lock
    .then(() => fn())
    .catch((err) => log("LOCK", `Erro em sessão "${name}": ${err.message}`));
  sessionLocks.set(name, newLock);
  return newLock;
}

// ────────── Criar sessão ──────────
async function createSession(name) {
  if (sessions.has(name) && sessions.get(name).client) {
    return sessions.get(name).client;
  }

  const sessionDir = path.join(SESSION_FOLDER, name);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

  const sessionInfo = {
    client: null,
    connected: false,
    qrPath: null,
    qrValid: false,
    sessionData: null,
  };
  sessions.set(name, sessionInfo);

  const client = await wppconnect.create({
    session: name,
    folderNameToken: SESSION_FOLDER, // 🔹 salva tokens persistentes
    createPathFileToken: true,
    catchQR: async (base64Qr) => {
      try {
        if (!sessions.has(name)) return;
        const session = sessions.get(name);

        // sobrescreve QR anterior
        if (session.qrPath && fs.existsSync(session.qrPath)) {
          fs.unlinkSync(session.qrPath);
        }

        const qrBuffer = Buffer.from(base64Qr.split(",")[1], "base64");
        const qrFilePath = path.join(sessionDir, "qrcode.png");
        fs.writeFileSync(qrFilePath, qrBuffer);

        session.qrPath = qrFilePath;
        session.qrValid = true;
        log("catchQR", `QR atualizado para sessão "${name}"`);
      } catch (err) {
        log("catchQR", `Erro ao salvar QR da sessão "${name}": ${err.message}`);
      }
    },
    statusFind: (statusSession) => {
      if (!sessions.has(name)) return;
      const session = sessions.get(name);

      if (statusSession === "isLogged") {
        session.connected = true;
        client.getSessionTokenBrowser().then((token) => {
          if (sessions.has(name)) sessions.get(name).sessionData = token;
        });
        log("statusFind", `Sessão "${name}" conectada`);
      } else if (statusSession === "qrReadSuccess") {
        session.qrValid = false;
        log("statusFind", `QR lido para sessão "${name}"`);
      } else if (statusSession === "qrReadFail" || statusSession === "qrTimeout") {
        session.qrValid = false;
        if (session.qrPath && fs.existsSync(session.qrPath)) {
          fs.unlinkSync(session.qrPath);
          session.qrPath = null;
        }
        log("statusFind", `QR expirado para sessão "${name}"`);
      }
    },
    puppeteerOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
      userDataDir: sessionDir,
      cacheDirectory: tmpDir,
    },
    autoClose: 0, // 🔴 nunca fechar sozinho
    disableWelcome: true,
    deleteSessionDataOnLogout: false, // 🔴 não excluir dados
    restartOnCrash: false, // 🔴 não reiniciar sozinho
  });

  sessionInfo.client = client;
  return client;
}

// ────────── ROTAS ──────────

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await runWithLock(name, async () => {
      await createSession(name);
    });
    res.json({ success: true, message: `Sessão "${name}" criada` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  const all = Array.from(sessions.keys()).map((name) => {
    const s = sessions.get(name);
    return { name, connected: s.connected };
  });
  res.json({ success: true, sessions: all });
});

// QR de uma sessão (com lock)
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  if (!sessions.has(name)) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  const session = sessions.get(name);

  await runWithLock(name, async () => {
    if (!session.client) throw new Error("Cliente não inicializado");
    if (!session.qrPath || !fs.existsSync(session.qrPath) || !session.qrValid) {
      await session.client.getQr();
    }
  });

  if (session.qrPath && fs.existsSync(session.qrPath)) {
    return res.sendFile(session.qrPath);
  } else {
    return res.status(500).json({ success: false, error: "QR não disponível" });
  }
});

// Excluir sessão manual
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions.has(name)) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  try {
    const session = sessions.get(name);
    if (session.client) session.client.close();

    const sessionDir = path.join(SESSION_FOLDER, name);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    sessions.delete(name);
    sessionLocks.delete(name);

    res.json({ success: true, message: `Sessão "${name}" excluída` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dados da sessão
app.get("/session-data/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions.has(name)) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  const s = sessions.get(name);
  res.json({
    success: true,
    data: {
      name,
      connected: s.connected,
      qrValid: s.qrValid,
      qrPath: s.qrPath ? `/qr/${name}.png` : null,
      sessionData: s.sessionData,
    },
  });
});

// ────────── Start ──────────
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
