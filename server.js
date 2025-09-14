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

// Sessões em memória
const sessions = {};

// Log restrito → apenas quando o frontend solicita
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
    qr: null, // buffer do QR em memória
    sessionData: null,
  };

  const client = await wppconnect.create({
    session: name,
    catchQR: (qr) => {
      // guarda em memória apenas, não gera log
      sessions[name].qr = Buffer.from(qr, "base64");
    },
    statusFind: (statusSession) => {
      if (statusSession === "isLogged") {
        sessions[name].connected = true;
        client.getSessionTokenBrowser().then((token) => {
          sessions[name].sessionData = token;
        });
      } else if (statusSession === "qrReadFail" || statusSession === "qrTimeout") {
        sessions[name].qr = null; // QR expirou
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

// 📌 Rotas

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("POST /session/:name", `criar sessão "${name}"`);
  try {
    await createSession(name);
    res.json({ success: true, message: `Sessão "${name}" criada` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  logRequest("GET /sessions", "listar sessões");
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  res.json({ success: true, sessions: all });
});

// Buscar dados da sessão
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  logRequest("GET /sessionData/:name", `dados sessão "${name}"`);
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  res.json({
    success: true,
    session: {
      name,
      connected: sessions[name].connected,
      sessionData: sessions[name].sessionData,
    },
  });
});

// Retornar QR (PNG) apenas quando o frontend pedir
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  logRequest("GET /qr/:name.png", `QR da sessão "${name}"`);
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  if (!sessions[name].qr) {
    return res.status(204).end(); // sem QR disponível
  }
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": sessions[name].qr.length,
  });
  res.end(sessions[name].qr);
});

// Excluir sessão
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  logRequest("DELETE /session/:name", `excluir sessão "${name}"`);
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
