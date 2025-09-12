const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Pasta para salvar dados das sessões conectadas
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// Sessões em memória
let sessions = {}; // { sessionName: { client, qr, connected } }

// Função para log no console com prefixo
function log(msg) {
  console.log(`[LOG ${new Date().toLocaleTimeString()}] ${msg}`);
}

// Criar nova sessão
async function createSession(sessionName) {
  if (sessions[sessionName]) {
    log(`Sessão ${sessionName} já existe`);
    return sessions[sessionName];
  }

  log(`🔄 Iniciando sessão: ${sessionName}`);

  const sessionFile = path.join(SESSION_FOLDER, `${sessionName}.json`);
  let sessionData = null;
  if (fs.existsSync(sessionFile)) {
    sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    log(`🔄 Restaurando sessão existente: ${sessionName}`);
  }

  return wppconnect.create({
    session: sessionName,
    sessionData,
    puppeteerOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-extensions", "--disable-gpu"],
    },
    autoClose: 0,
    catchQR: (base64Qr) => {
      sessions[sessionName].qr = base64Qr;
      sessions[sessionName].connected = false;
      log(`📷 Novo QR gerado para sessão ${sessionName}`);
    },
    statusFind: (status) => {
      const connected = status === "inChat";
      sessions[sessionName].connected = connected;
      log(`STATUS [${sessionName}]: ${status} (${connected ? "Conectado" : "Desconectado"})`);

      if (connected) {
        const client = sessions[sessionName].client;
        client.getSessionTokenBrowser().then((data) => {
          fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
          log(`💾 Sessão ${sessionName} salva em ${sessionFile}`);
        });
      }
    },
    logQR: false,
  })
    .then((client) => {
      sessions[sessionName] = { client, qr: null, connected: false };
      return sessions[sessionName];
    })
    .catch((err) => {
      log(`❌ Erro ao iniciar sessão ${sessionName}: ${err.message}`);
      throw err;
    });
}

// Listar sessões
app.get("/sessions", (req, res) => {
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  log(`📋 Listando sessões (${all.length})`);
  res.json(all);
});

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await createSession(name);
    log(`✅ Sessão ${name} criada`);
    res.json({ success: true, message: `Sessão ${name} iniciada` });
  } catch (err) {
    log(`❌ Erro ao criar sessão ${name}: ${err.message}`);
    res.status(500).json({ error: "Erro ao criar sessão", details: err.message });
  }
});

// Excluir sessão
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    log(`❌ Tentativa de excluir sessão não existente: ${name}`);
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
    log(`❌ Erro ao excluir sessão ${name}: ${err.message}`);
    res.status(500).json({ error: "Erro ao excluir sessão", details: err.message });
  }
});

// Obter QR code
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name] || !sessions[name].qr) {
    log(`⏳ QR code ainda não disponível para sessão ${name}`);
    return res.status(404).send("QR code ainda não gerado");
  }

  const imgBuffer = Buffer.from(sessions[name].qr.replace(/^data:image\/png;base64,/, ""), "base64");
  log(`📷 QR code enviado para sessão ${name}`);

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
    log(`❌ Status solicitado para sessão não existente: ${name}`);
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  res.json({ connected: sessions[name].connected });
});

// Enviar mensagem
app.post("/send/:name", async (req, res) => {
  const { name } = req.params;
  const { number, message } = req.body;

  if (!sessions[name]) {
    log(`❌ Tentativa de enviar mensagem em sessão não existente: ${name}`);
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  if (!sessions[name].connected) {
    log(`❌ Tentativa de enviar mensagem em sessão desconectada: ${name}`);
    return res.status(400).json({ error: "Sessão não conectada ao WhatsApp" });
  }

  try {
    await sessions[name].client.sendText(number + "@c.us", message);
    log(`✅ Mensagem enviada na sessão ${name} para ${number}`);
    res.json({ success: true });
  } catch (err) {
    log(`❌ Erro ao enviar mensagem [${name}]: ${err.message}`);
    res.status(500).json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Obter dados da sessão JSON
app.get("/conectados/:name.json", (req, res) => {
  const { name } = req.params;
  const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
  if (!fs.existsSync(sessionFile)) {
    log(`❌ Tentativa de acessar dados não existentes: ${name}`);
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  log(`📄 Dados da sessão ${name} enviados`);
  res.sendFile(sessionFile);
});

// Inicia o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log(`Servidor rodando na porta ${PORT}`));
