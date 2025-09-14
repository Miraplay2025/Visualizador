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

// Sessões em memória
const sessions = {};

// Função de log
function logRequest(route, msg) {
  console.log(`[${new Date().toISOString()}] ${route} → ${msg}`);
}

// Criar sessão
async function createSession(name) {
  if (sessions[name] && sessions[name].client) {
    return sessions[name].client;
  }

  const sessionDataDir = path.join(SESSION_FOLDER, name);
  if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

  sessions[name] = {
    client: null,
    connected: false,
    qrPath: null,      // caminho do QR code salvo
    qrValid: false,    // QR ainda válido
    sessionData: null,
  };

  const client = await wppconnect.create({
    session: name,
    catchQR: async (base64Qr) => {
      // Remove QR anterior se existir
      if (sessions[name].qrPath && fs.existsSync(sessions[name].qrPath)) {
        fs.unlinkSync(sessions[name].qrPath);
      }
      // Salva novo QR
      const qrBuffer = Buffer.from(base64Qr.split(",")[1], "base64");
      const qrFilePath = path.join(sessionDataDir, "qrcode.png");
      fs.writeFileSync(qrFilePath, qrBuffer);
      sessions[name].qrPath = qrFilePath;
      sessions[name].qrValid = true;
      logRequest("/session", `QR code atualizado para sessão "${name}"`);
    },
    statusFind: (statusSession) => {
      if (statusSession === "isLogged") {
        sessions[name].connected = true;
        client.getSessionTokenBrowser().then((token) => {
          sessions[name].sessionData = token;
        });
        logRequest("/session", `Sessão "${name}" conectada`);
      } else if (statusSession === "qrReadFail" || statusSession === "qrTimeout") {
        sessions[name].qrValid = false;
        if (sessions[name].qrPath && fs.existsSync(sessions[name].qrPath)) {
          fs.unlinkSync(sessions[name].qrPath);
          sessions[name].qrPath = null;
        }
        logRequest("/session", `QR code expirado para sessão "${name}"`);
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
      userDataDir: sessionDataDir,
      cacheDirectory: tmpDir,
    },
    autoClose: 0,
  });

  sessions[name].client = client;
  return client;
}

// ───── ROTAS ─────

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await createSession(name);
    res.json({ success: true, message: `Sessão "${name}" criada` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  logRequest("/sessions", `Sessões encontradas: ${Object.keys(sessions).join(", ")}`);
  res.json({ success: true, sessions: all });
});

// Retornar QR code
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  const session = sessions[name];

  // Se já existe QR e ainda é válido
  if (session.qrPath && fs.existsSync(session.qrPath) && session.qrValid) {
    logRequest("/qr", `QR code ainda válido para sessão "${name}"`);
    return res.sendFile(session.qrPath);
  }

  // Senão: força gerar novo QR
  try {
    await session.client.getQr(); // requisita QR do WppConnect
    if (session.qrPath && fs.existsSync(session.qrPath)) {
      logRequest("/qr", `Novo QR code gerado para sessão "${name}"`);
      return res.sendFile(session.qrPath);
    } else {
      return res.status(500).json({ success: false, error: "Erro ao gerar QR code" });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Excluir sessão
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  try {
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    delete sessions[name];
    logRequest("/session/delete", `Sessão "${name}" excluída`);
    res.json({ success: true, message: `Sessão "${name}" excluída` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
