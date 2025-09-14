// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const wppconnect = require("@wppconnect-team/wppconnect");
const qrCode = require("qrcode"); // para gerar QR code em PNG

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

// Sessões em memória
const sessions = {};

// Função para logs sob demanda
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
    sessionData: null,
  };

  const client = await wppconnect.create({
    session: name,
    catchQR: async (qr) => {
      // Apaga QR anterior se existir
      if (sessions[name].qrPath && fs.existsSync(sessions[name].qrPath)) {
        fs.unlinkSync(sessions[name].qrPath);
      }
      // Gera QR code em PNG e salva
      const qrFilePath = path.join(sessionDataDir, "qrcode.png");
      await qrCode.toFile(qrFilePath, qr, { type: "png", margin: 2, scale: 6 });
      sessions[name].qrPath = qrFilePath;
    },
    statusFind: (statusSession) => {
      if (statusSession === "isLogged") {
        sessions[name].connected = true;
        client.getSessionTokenBrowser().then((token) => {
          sessions[name].sessionData = token;
        });
      } else if (statusSession === "qrReadFail" || statusSession === "qrTimeout") {
        sessions[name].qrPath = null;
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
  res.json({ success: true, sessions: all });
});

// Retornar QR code (somente quando solicitado pelo frontend)
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  if (!sessions[name].qrPath || !fs.existsSync(sessions[name].qrPath)) {
    return res.status(204).end(); // sem QR disponível
  }
  res.sendFile(sessions[name].qrPath);
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
    res.json({ success: true, message: `Sessão "${name}" excluída` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
