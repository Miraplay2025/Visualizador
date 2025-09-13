// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("conectados")); // serve QR codes e JSON

const PORT = 10000;

// Pasta persistente para sessões
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// Sessões em memória
let sessions = {}; // { sessionName: { client, qrPath, qrTimestamp, connected, sessionData } }

// --------------------- FUNÇÃO AUXILIAR ---------------------
function logRequest(endpoint, info) {
  console.log(`[${new Date().toISOString()}] ${endpoint}: ${info}`);
}

// --------------------- Criar sessão ---------------------
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (POST)", `Solicitação de criação da sessão "${name}"`);

  if (!name) return res.json({ success: false, error: "Nome inválido" });
  if (sessions[name]) return res.json({ success: false, error: "Sessão já existe" });

  try {
    const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");
    const sessionDataDir = path.join("/tmp", `wppconnect-${name}`);
    if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

    const client = await wppconnect.create({
      session: name,
      catchQR: (qr, asciiQR, attempt) => {
        // Só atualiza se QR mudou ou expirou
        if (!sessions[name].qrTimestamp || Date.now() - sessions[name].qrTimestamp > 10000) {
          fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
          sessions[name].qrPath = sessionQRPath;
          sessions[name].qrTimestamp = Date.now();
          console.log(`[${name}] QR code gerado (tentativa ${attempt})`);
        }
      },
      statusFind: (statusSession) => {
        console.log(`[${name}] Status da sessão: ${statusSession}`);
        if (statusSession === "isLogged") {
          sessions[name].connected = true;
          sessions[name].sessionData = client.getSessionTokenBrowser();

          const jsonPath = path.join(SESSION_FOLDER, name + ".json");
          fs.writeFileSync(jsonPath, JSON.stringify({
            name,
            connected: true,
            sessionData: sessions[name].sessionData,
            timestamp: new Date().toISOString()
          }, null, 2));

          // Apaga QR após conectado
          if (sessions[name].qrPath && fs.existsSync(sessions[name].qrPath)) {
            fs.unlinkSync(sessions[name].qrPath);
            sessions[name].qrPath = null;
          }

          console.log(`[${name}] Sessão conectada e dados salvos`);
        }
      },
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        userDataDir: sessionDataDir,
      },
      autoClose: 0,
    });

    sessions[name] = {
      client,
      qrPath: null,
      qrTimestamp: null,
      connected: false,
      sessionData: null
    };

    res.json({ success: true, name, message: "Sessão criada, QR ainda não gerado" });

  } catch (err) {
    console.error(`[${name}] Erro ao criar sessão:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// --------------------- Excluir sessão ---------------------
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (DELETE)", `Solicitação de exclusão da sessão "${name}"`);

  if (!sessions[name]) return res.json({ success: false, error: "Sessão não encontrada" });

  try {
    await sessions[name].client.logout();
    delete sessions[name];

    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);

    res.json({ success: true });
    console.log(`[${name}] Sessão excluída com sucesso`);
  } catch (err) {
    console.error(`[${name}] Erro ao excluir sessão:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// --------------------- Listar todas as sessões ---------------------
app.get("/sessions", (req, res) => {
  logRequest("/sessions (GET)", "Listando todas as sessões");

  const list = Object.keys(sessions).map(name => ({
    name,
    connected: sessions[name].connected || false,
  }));

  res.json({ success: true, sessions: list });
});

// --------------------- Servir QR code apenas se novo ---------------------
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  logRequest("/qr/:name.png (GET)", `Solicitação do QR code da sessão "${name}"`);

  if (!sessions[name]) return res.status(404).json({ success: false, error: "Sessão não encontrada" });

  if (!sessions[name].qrPath || !fs.existsSync(sessions[name].qrPath)) {
    return res.status(404).json({ success: false, error: "QR code não disponível" });
  }

  // Retorna apenas se QR ainda válido (ex.: 30s)
  const qrAge = Date.now() - sessions[name].qrTimestamp;
  if (qrAge > 60000) {
    return res.status(404).json({ success: false, error: "QR code expirado" });
  }

  res.sendFile(sessions[name].qrPath);
});

// --------------------- Buscar dados da sessão conectada ---------------------
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/sessionData/:name (GET)", `Solicitação dos dados da sessão "${name}"`);

  if (!sessions[name] || !sessions[name].connected) {
    return res.json({ success: false, error: "Sessão não conectada" });
  }

  res.json({
    success: true,
    name,
    sessionData: sessions[name].sessionData,
  });
});

// --------------------- Enviar mensagem ---------------------
app.post("/sendMessage/:name", async (req, res) => {
  const { name } = req.params;
  const { to, message } = req.body;

  logRequest("/sendMessage/:name (POST)", `Solicitação de envio da sessão "${name}" para "${to}"`);

  if (!sessions[name] || !sessions[name].connected) {
    return res.json({ success: false, error: "Sessão não conectada" });
  }
  if (!to || !message) {
    return res.json({ success: false, error: "Campos 'to' e 'message' são obrigatórios" });
  }

  try {
    await sessions[name].client.sendText(to, message);
    res.json({ success: true, to, message });
    console.log(`[${name}] Mensagem enviada para ${to}`);
  } catch (err) {
    console.error(`[${name}] Erro ao enviar mensagem:`, err.message);
    res.json({ success: false, error: err.message });
  }
});

// --------------------- Inicialização ---------------------
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
