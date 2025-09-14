// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("conectados")); // Pasta pública

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, "conectados");

// Garante que a pasta de sessões existe
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Função para log detalhado
function logRequest(req, resBody, sessionName = "desconhecida") {
  const log = {
    data: new Date().toISOString(),
    metodo: req.method,
    url: req.originalUrl,
    sessao: sessionName,
    entrada: req.body || {},
    saida: resBody || {},
  };
  console.log("📥 Requisição recebida:", JSON.stringify(log, null, 2));
}

// Função para criar sessão do WhatsApp
async function createSession(sessionName) {
  console.log(`🚀 Iniciando sessão: ${sessionName}`);
  return wppconnect.create({
    session: sessionName,
    catchQR: (base64Qr) => {
      const qrFile = path.join(SESSIONS_DIR, `${sessionName}_qrcode.png`);
      fs.writeFileSync(qrFile, base64Qr.split(",")[1], "base64");
      console.log(`📸 QR Code salvo em: ${qrFile}`);
    },
    statusFind: (statusSession, session) => {
      console.log(`📡 Status da sessão ${session}: ${statusSession}`);
    },
    headless: true,
    useChrome: false,
    puppeteerOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
    logQR: false,
  });
}

// Rota para iniciar uma sessão
app.post("/session/start", async (req, res) => {
  const { session } = req.body;
  if (!session) {
    const resposta = { success: false, error: "Nome da sessão é obrigatório" };
    logRequest(req, resposta);
    return res.status(400).json(resposta);
  }

  try {
    const client = await createSession(session);
    const resposta = { success: true, message: `Sessão ${session} iniciada` };
    logRequest(req, resposta, session);
    return res.json(resposta);
  } catch (err) {
    const resposta = { success: false, error: err.message };
    logRequest(req, resposta, session);
    return res.status(500).json(resposta);
  }
});

// Rota para enviar mensagem
app.post("/send-message", async (req, res) => {
  const { session, number, message } = req.body;

  if (!session || !number || !message) {
    const resposta = { success: false, error: "Parâmetros faltando" };
    logRequest(req, resposta, session);
    return res.status(400).json(resposta);
  }

  try {
    const client = await createSession(session); // reutiliza ou cria se não existir
    await client.sendText(number + "@c.us", message);
    const resposta = { success: true, message: "Mensagem enviada com sucesso" };
    logRequest(req, resposta, session);
    return res.json(resposta);
  } catch (err) {
    const resposta = { success: false, error: err.message };
    logRequest(req, resposta, session);
    return res.status(500).json(resposta);
  }
});

// Rota para listar sessões (baseada nos arquivos da pasta)
app.get("/sessions", (req, res) => {
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith("_qrcode.png"));
  const resposta = { success: true, sessions: files.map(f => f.replace("_qrcode.png", "")) };
  logRequest(req, resposta);
  res.json(resposta);
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando em http://localhost:${PORT}`);
});
