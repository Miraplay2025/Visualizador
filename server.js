const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Função de log controlado
function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[LOG ${time}] ${msg}`);
}

// Pasta para salvar dados persistentes das sessões
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// Sessões em memória (estado atual)
let sessions = {}; // { sessionName: { client, qr, connected } }

// 🔹 Criar nova sessão
async function createSession(sessionName) {
  if (sessions[sessionName]) {
    return sessions[sessionName];
  }

  sessions[sessionName] = { client: null, qr: null, connected: false };

  const sessionFile = path.join(SESSION_FOLDER, `${sessionName}.json`);
  let sessionData = null;
  if (fs.existsSync(sessionFile)) {
    sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  }

  try {
    const client = await wppconnect.create({
      session: sessionName,
      sessionData,
      puppeteerOptions: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-gpu",
          "--single-process",
          "--disable-background-timer-throttling",
        ],
      },
      autoClose: 0,
      catchQR: (base64Qr) => {
        sessions[sessionName].qr = base64Qr;
        sessions[sessionName].connected = false;
      },
      statusFind: (status) => {
        sessions[sessionName].connected = status === "inChat";

        if (status === "inChat") {
          client.getSessionTokenBrowser().then((data) => {
            fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
          }).catch(() => {});
        }
      },
      logQR: false,
    });

    sessions[sessionName].client = client;
    return sessions[sessionName];
  } catch (err) {
    throw new Error(`Erro ao iniciar sessão ${sessionName}: ${err.message}`);
  }
}

// 🔹 Listar todas as sessões
app.get("/sessions", (req, res) => {
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  log("📋 /sessions requisitado");
  res.json(all);
});

// 🔹 Criar nova sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await createSession(name);
    log(`✅ Sessão ${name} criada`);
    res.json({ success: true, message: `Sessão ${name} iniciada` });
  } catch (err) {
    log(`❌ Erro criar sessão ${name}`);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Excluir sessão
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }

  try {
    await sessions[name].client.close();
    delete sessions[name];

    const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);

    log(`🗑️ Sessão ${name} excluída`);
    res.json({ success: true, message: `Sessão ${name} excluída` });
  } catch (err) {
    log(`❌ Erro excluir sessão ${name}`);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 QR Code da sessão
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name] || !sessions[name].qr) {
    return res.status(404).send("QR code ainda não gerado");
  }

  const imgBuffer = Buffer.from(sessions[name].qr.replace(/^data:image\/png;base64,/, ""), "base64");
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": imgBuffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(imgBuffer);
  log(`📷 QR enviado (${name})`);
});

// 🔹 Status da sessão
app.get("/status/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  log(`ℹ️ Status requisitado (${name})`);
  res.json({ connected: sessions[name].connected });
});

// 🔹 Dados persistentes (json)
app.get("/data/:name", (req, res) => {
  const { name } = req.params;
  const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: "Dados não encontrados" });
  }

  const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  log(`📂 Dados enviados (${name})`);
  res.json(data);
});

// 🔹 Enviar mensagem
app.post("/send/:name", async (req, res) => {
  const { name } = req.params;
  const { number, message } = req.body;

  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  if (!sessions[name].connected) {
    return res.status(400).json({ error: "Sessão não conectada" });
  }

  try {
    await sessions[name].client.sendText(number + "@c.us", message);
    log(`✉️ Mensagem enviada (${name}) -> ${number}`);
    res.json({ success: true });
  } catch (err) {
    log(`❌ Erro envio mensagem (${name})`);
    res.status(500).json({ error: err.message });
  }
});

// Porta para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log(`🚀 Servidor rodando na porta ${PORT}`));
