const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Função de log formatado
function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[LOG ${time}] ${msg}`);
}

// Pasta para salvar dados das sessões conectadas
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// Guardar sessões em memória
let sessions = {}; // { sessionName: { client, qr, connected } }

// 🔹 Criar nova sessão
async function createSession(sessionName) {
  if (sessions[sessionName]) {
    log(`Sessão ${sessionName} já existe`);
    return sessions[sessionName];
  }

  // Inicializa antes de qualquer callback
  sessions[sessionName] = { client: null, qr: null, connected: false };

  const sessionFile = path.join(SESSION_FOLDER, `${sessionName}.json`);
  let sessionData = null;
  if (fs.existsSync(sessionFile)) {
    sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    log(`🔄 Restaurando sessão existente: ${sessionName}`);
  }

  try {
    const client = await wppconnect.create({
      session: sessionName,
      sessionData,
      puppeteerOptions: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-gpu",
        ],
      },
      autoClose: 0,
      catchQR: (base64Qr) => {
        sessions[sessionName].qr = base64Qr;
        sessions[sessionName].connected = false;
        log(`📷 Novo QR gerado para sessão ${sessionName}`);
      },
      statusFind: (status) => {
        sessions[sessionName].connected = status === "inChat";
        log(`STATUS [${sessionName}]: ${status}`);

        if (status === "inChat") {
          client.getSessionTokenBrowser().then((data) => {
            fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
            log(`💾 Sessão ${sessionName} salva em ${sessionFile}`);
          });
        }
      },
      logQR: false,
    });

    sessions[sessionName].client = client;
    return sessions[sessionName];
  } catch (err) {
    log(`❌ Erro ao iniciar sessão ${sessionName}: ${err.message}`);
    throw err;
  }
}

// 🔹 Endpoint: Listar todas as sessões
app.get("/sessions", (req, res) => {
  log(`📋 Listando sessões (${Object.keys(sessions).length})`);
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  res.json(all);
});

// 🔹 Endpoint: Criar nova sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await createSession(name);
    res.json({ success: true, message: `Sessão ${name} iniciada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Endpoint: Excluir sessão
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });

  try {
    await sessions[name].client.close();
    delete sessions[name];

    const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);

    res.json({ success: true, message: `Sessão ${name} excluída` });
    log(`🗑️ Sessão ${name} excluída`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Endpoint: Pegar QR de uma sessão
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name] || !sessions[name].qr) return res.status(404).send("QR code ainda não gerado");

  const imgBuffer = Buffer.from(sessions[name].qr.replace(/^data:image\/png;base64,/, ""), "base64");
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": imgBuffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(imgBuffer);
  log(`📷 QR code enviado para sessão ${name}`);
});

// 🔹 Endpoint: Status de uma sessão
app.get("/status/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });
  res.json({ connected: sessions[name].connected });
});

// 🔹 Endpoint: Obter dados JSON da sessão
app.get("/data/:name", (req, res) => {
  const { name } = req.params;
  const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
  if (!fs.existsSync(sessionFile)) return res.status(404).json({ error: "Dados da sessão não encontrados" });

  const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  res.json(data);
  log(`📂 Dados da sessão ${name} enviados`);
});

// 🔹 Endpoint: Enviar mensagem
app.post("/send/:name", async (req, res) => {
  const { name } = req.params;
  const { number, message } = req.body;

  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });
  if (!sessions[name].connected) return res.status(400).json({ error: "Sessão não conectada ao WhatsApp" });

  try {
    await sessions[name].client.sendText(number + "@c.us", message);
    res.json({ success: true });
    log(`✉️ Mensagem enviada pela sessão ${name} para ${number}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Porta para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log(`Servidor rodando na porta ${PORT}`));
