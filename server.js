// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("conectados")); // Pasta de QR e dados

const PORT = 10000;

// ----------------- PASTA GLOBAL -----------------
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// ----------------- SESSÕES EM MEMÓRIA -----------------
let sessions = {}; 
// Estrutura: { name: { client, qrPath, qrTimestamp, connected, sessionData } }

// ----------------- LOG SIMPLES -----------------
function logRequest(endpoint, info, data = {}) {
  console.log(`[${new Date().toISOString()}] ${endpoint}: ${info}`);
}

// ----------------- RESTAURAR SESSÕES -----------------
function restoreSessions() {
  const files = fs.readdirSync(SESSION_FOLDER).filter(f => f.endsWith(".json"));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SESSION_FOLDER, file)));
      const name = data.name;
      sessions[name] = {
        client: null, // será recriado ao conectar
        qrPath: null,
        qrTimestamp: null,
        connected: data.connected || false,
        sessionData: data.sessionData || null,
      };
      console.log(`[${name}] Sessão restaurada`);
    } catch (err) {
      console.error(`Erro ao restaurar sessão de ${file}:`, err.message);
    }
  }
}
restoreSessions();

// ----------------- CRIAR SESSÃO -----------------
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (POST)", `Solicitado criar sessão "${name}"`);

  if (!name) return res.json({ success: false, error: "Nome inválido" });
  if (sessions[name] && sessions[name].client) {
    return res.json({ success: false, error: "Sessão já existe" });
  }

  try {
    const sessionDataDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

    const client = await wppconnect.create({
      session: name,
      catchQR: () => {}, // Não gerar QR automaticamente
      statusFind: (statusSession) => {
        if (statusSession === "isLogged") {
          sessions[name].connected = true;
          client.getSessionTokenBrowser().then(token => {
            sessions[name].sessionData = token;
            const jsonPath = path.join(SESSION_FOLDER, name + ".json");
            fs.writeFileSync(
              jsonPath,
              JSON.stringify(
                { name, connected: true, sessionData: token, timestamp: new Date().toISOString() },
                null,
                2
              )
            );
            console.log(`[${name}] Sessão conectada e salva`);
          });
        }
      },
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        userDataDir: sessionDataDir,
      },
      autoClose: 0, // nunca fecha sozinho
    });

    sessions[name] = {
      client,
      qrPath: null,
      qrTimestamp: null,
      connected: false,
      sessionData: null,
    };

    res.json({ success: true, name, message: "Sessão criada. QR disponível apenas quando solicitado." });
  } catch (err) {
    console.error(`[${name}] Erro criação:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// ----------------- EXCLUIR SESSÃO -----------------
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (DELETE)", `Solicitado excluir sessão "${name}"`);

  if (!sessions[name]) return res.json({ success: false, error: "Sessão não encontrada" });

  try {
    if (sessions[name].client) await sessions[name].client.logout();
    delete sessions[name];

    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    const sessionDir = path.join(SESSION_FOLDER, name);

    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    res.json({ success: true });
    console.log(`[${name}] Sessão excluída`);
  } catch (err) {
    console.error(`[${name}] Erro exclusão:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// ----------------- LISTAR TODAS AS SESSÕES -----------------
app.get("/sessions", (req, res) => {
  logRequest("/sessions (GET)", "Solicitado listar sessões");
  const list = Object.keys(sessions).map(name => ({
    name,
    connected: sessions[name].connected || false,
  }));
  res.json({ success: true, sessions: list });
});

// ----------------- GERAR QR CODE SOB DEMANDA -----------------
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  logRequest("/qr/:name.png (GET)", `Solicitado QR da sessão "${name}"`);

  if (!sessions[name]) return res.status(404).json({ success: false, error: "Sessão não encontrada" });

  try {
    const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");
    // Gerar QR somente se não existir ou se for solicitado
    await wppconnect.create({
      session: name,
      catchQR: (qr) => {
        fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
        sessions[name].qrPath = sessionQRPath;
        sessions[name].qrTimestamp = Date.now();
      },
      puppeteerOptions: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
      autoClose: 0,
    });

    if (!fs.existsSync(sessionQRPath)) {
      return res.status(404).json({ success: false, error: "QR não disponível" });
    }
    res.sendFile(sessionQRPath);
  } catch (err) {
    console.error(`[${name}] Erro geração QR:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------- DADOS DA SESSÃO -----------------
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/sessionData/:name (GET)", `Solicitado dados da sessão "${name}"`);

  if (!sessions[name]) return res.json({ success: false, error: "Sessão não encontrada" });

  res.json({
    success: true,
    name,
    connected: sessions[name].connected || false,
    sessionData: sessions[name].sessionData || null,
  });
});

// ----------------- ENVIAR MENSAGEM -----------------
app.post("/sendMessage/:name", async (req, res) => {
  const { name } = req.params;
  const { to, message } = req.body;

  logRequest("/sendMessage/:name (POST)", `Solicitado enviar msg pela sessão "${name}"`);

  if (!sessions[name] || !sessions[name].connected) {
    return res.json({ success: false, error: "Sessão não conectada" });
  }
  if (!to || !message) {
    return res.json({ success: false, error: "Campos 'to' e 'message' são obrigatórios" });
  }

  try {
    await sessions[name].client.sendText(to, message);
    res.json({ success: true, to, message });
  } catch (err) {
    console.error(`[${name}] Erro envio:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// ----------------- START -----------------
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
