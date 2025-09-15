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

// Mutex por sessão
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
  log("POST /session", `Requisição recebida para criar sessão "${name}"`);
  try {
    await runWithLock(name, async () => {
      await createSession(name);
    });
    const resposta = { success: true, message: `Sessão criada com sucesso`, name };
    log("POST /session", JSON.stringify(resposta));
    res.json(resposta);
  } catch (err) {
    const resposta = { success: false, error: err.message };
    log("POST /session", JSON.stringify(resposta));
    res.status(500).json(resposta);
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  log("GET /sessions", "Requisição recebida");
  const all = Array.from(sessions.keys()).map((name) => {
    const s = sessions.get(name);
    return { name, status: s.connected ? "Conectado" : "Não conectado" };
  });
  if (all.length === 0) {
    const resposta = { success: true, message: "Nenhuma sessão encontrada" };
    log("GET /sessions", JSON.stringify(resposta));
    return res.json(resposta);
  }
  const resposta = { success: true, sessions: all };
  log("GET /sessions", JSON.stringify(resposta));
  res.json(resposta);
});

// QR de uma sessão
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  log("GET /qr", `Requisição recebida para sessão "${name}"`);
  if (!sessions.has(name)) {
    const resposta = { success: false, error: "Sessão não encontrada" };
    log("GET /qr", JSON.stringify(resposta));
    return res.status(404).json(resposta);
  }

  const session = sessions.get(name);
  await runWithLock(name, async () => {
    if (!session.client) throw new Error("Cliente não inicializado");
    if (!session.qrPath || !fs.existsSync(session.qrPath) || !session.qrValid) {
      await session.client.getQr();
    }
  });

  if (session.qrPath && fs.existsSync(session.qrPath)) {
    log("GET /qr", `QR retornado para sessão "${name}"`);
    return res.sendFile(session.qrPath);
  } else {
    const resposta = { success: false, error: "QR não disponível" };
    log("GET /qr", JSON.stringify(resposta));
    return res.status(500).json(resposta);
  }
});

// Excluir sessão manual
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  log("DELETE /session", `Requisição recebida para excluir sessão "${name}"`);
  if (!sessions.has(name)) {
    const resposta = { success: false, error: "Sessão não encontrada" };
    log("DELETE /session", JSON.stringify(resposta));
    return res.status(404).json(resposta);
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

    const resposta = { success: true, message: `Sessão "${name}" excluída` };
    log("DELETE /session", JSON.stringify(resposta));
    res.json(resposta);
  } catch (err) {
    const resposta = { success: false, error: err.message };
    log("DELETE /session", JSON.stringify(resposta));
    res.status(500).json(resposta);
  }
});

// Dados da sessão
app.get("/session-data/:name", (req, res) => {
  const { name } = req.params;
  log("GET /session-data", `Requisição recebida para sessão "${name}"`);
  if (!sessions.has(name)) {
    const resposta = { success: false, error: "Sessão não encontrada" };
    log("GET /session-data", JSON.stringify(resposta));
    return res.status(404).json(resposta);
  }
  const s = sessions.get(name);
  const resposta = {
    success: true,
    data: {
      name,
      status: s.connected ? "Conectado" : "Não conectado",
      qrValid: s.qrValid,
      qrPath: s.qrPath ? `/qr/${name}.png` : null,
      sessionData: s.sessionData,
    },
  };
  log("GET /session-data", JSON.stringify(resposta));
  res.json(resposta);
});

// ────────── Start ──────────
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
 
