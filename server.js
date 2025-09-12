const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core"); // usar o Chromium do Puppeteer

const app = express();
app.use(cors());
app.use(express.json());

// Função de log controlado (mantém últimos 100 caracteres)
let lastLogs = "";
function log(msg) {
  const time = new Date().toLocaleTimeString();
  lastLogs = (lastLogs + `[${time}] ${msg}\n`).slice(-100);
  console.log(`[LOG ${time}] ${msg}`);
}

// Pasta persistente para sessões
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// Sessões em memória
let sessions = {}; // { sessionName: { client, qr, connected, qrTimestamp } }

// Criar sessão
async function createSession(sessionName) {
  if (sessions[sessionName]) {
    return sessions[sessionName];
  }

  sessions[sessionName] = { client: null, qr: null, connected: false, qrTimestamp: 0 };
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
        executablePath: puppeteer.executablePath(), // usar Chromium embutido
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
        // Garante que só envia novo QR se o anterior já expirou
        const now = Date.now();
        if (!sessions[sessionName].qr || now - sessions[sessionName].qrTimestamp > 25000) {
          sessions[sessionName].qr = base64Qr;
          sessions[sessionName].qrTimestamp = now;
          sessions[sessionName].connected = false;
          log(`QR atualizado (${sessionName})`);
        }
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

// Listar sessões
app.get("/sessions", (req, res) => {
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  res.json(all);
});

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await createSession(name);
    res.json({ success: true, message: `Sessão ${name} iniciada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir sessão
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
    res.json({ success: true, message: `Sessão ${name} excluída` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QR Code
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name] || !sessions[name].qr) {
    return res.status(404).send("QR code ainda não gerado ou já expirado");
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
});

// Status da sessão
app.get("/status/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  res.json({ connected: sessions[name].connected });
});

// Dados persistentes
app.get("/data/:name", (req, res) => {
  const { name } = req.params;
  const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: "Dados não encontrados" });
  }
  const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  res.json(data);
});

// Enviar mensagem
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logs recentes
app.get("/logs", (req, res) => {
  res.type("text/plain").send(lastLogs);
});

// Porta
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log(`Servidor rodando na porta ${PORT}`));
