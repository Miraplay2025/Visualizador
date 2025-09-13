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
let sessions = {}; // { sessionName: { client, qr, connected, sessionData, qrTimestamp } }

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
        // Se houver QR antigo, apagar
        if (sessions[name] && sessions[name].qr && fs.existsSync(sessions[name].qr)) {
          fs.unlinkSync(sessions[name].qr);
        }

        fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
        if (!sessions[name]) sessions[name] = {};
        sessions[name].qr = sessionQRPath;
        sessions[name].qrTimestamp = new Date().getTime();

        console.log(`[${name}] QR code gerado (tentativa ${attempt})`);
      },
      statusFind: (statusSession) => {
        console.log(`[${name}] Status da sessão: ${statusSession}`);
        if (!sessions[name]) sessions[name] = {};

        if (statusSession === "isLogged") {
          sessions[name].connected = true;
          sessions[name].sessionData = client.getSessionTokenBrowser();

          // Salvar JSON persistente
          const jsonPath = path.join(SESSION_FOLDER, name + ".json");
          fs.writeFileSync(
            jsonPath,
            JSON.stringify({
              name,
              connected: true,
              sessionData: sessions[name].sessionData,
              timestamp: new Date().toISOString(),
            }, null, 2)
          );

          // Apagar QR após conectado
          if (sessions[name].qr && fs.existsSync(sessions[name].qr)) {
            fs.unlinkSync(sessions[name].qr);
            sessions[name].qr = null;
          }

          console.log(`[${name}] Sessão conectada e dados salvos`);
        } else if (statusSession === "qrReadFail") {
          console.log(`[${name}] QR expirou, gerando novo QR...`);
          // O próximo catchQR será chamado automaticamente pelo WPPConnect
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
      qr: sessionQRPath,
      connected: false,
      sessionData: null,
      qrTimestamp: new Date().getTime(),
    };

    // Retorna imediatamente o QR code atual (se existir)
    let qrBuffer = fs.existsSync(sessionQRPath) ? fs.readFileSync(sessionQRPath) : null;
    res.setHeader("Content-Type", "image/png");
    if (qrBuffer) {
      return res.send(qrBuffer);
    } else {
      return res.json({ success: true, name, message: "Sessão criada, QR ainda não gerado" });
    }

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

    // Remove QR e JSON persistente
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
    qr: sessions[name].qr || null
  }));

  res.json({ success: true, sessions: list });
});

// --------------------- Servir QR code ---------------------
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  logRequest("/qr/:name.png (GET)", `Solicitação do QR code da sessão "${name}"`);

  if (!sessions[name]) return res.status(404).json({ success: false, error: "Sessão não encontrada" });

  const qrFile = sessions[name].qr;
  if (!qrFile || !fs.existsSync(qrFile)) return res.status(404).json({ success: false, error: "QR não encontrado" });

  res.sendFile(qrFile);
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

  logRequest("/sendMessage/:name (POST)", `Solicitação de envio de mensagem da sessão "${name}" para "${to}"`);

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
