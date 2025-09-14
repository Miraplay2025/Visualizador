   // server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());

const SESSIONS_DIR = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

const sessions = {}; // { name: { client, qrCode, qrTimestamp, connected } }

function logRequest(req, message) {
  console.log(
    `[${new Date().toISOString()}] ${req.originalUrl} → ${message}`
  );
}

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const name = req.params.name;
  if (sessions[name]) {
    logRequest(req, `Sessão "${name}" já existe`);
    return res.json({ success: true, session: name });
  }

  try {
    const sessionPath = path.join(SESSIONS_DIR, name);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

    const client = await wppconnect.create({
      session: name,
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        const buffer = Buffer.from(
          base64Qr.replace(/^data:image\/png;base64,/, ""),
          "base64"
        );
        const filePath = path.join(sessionPath, "qrcode.png");
        fs.writeFileSync(filePath, buffer);
        sessions[name].qrCode = buffer;
        sessions[name].qrTimestamp = Date.now();
        logRequest(req, `Novo QR gerado para sessão "${name}"`);
      },
      statusFind: (statusSession) => {
        if (statusSession === "isLogged") {
          sessions[name].connected = true;
        } else if (statusSession === "qrReadSuccess") {
          sessions[name].qrCode = null; // QR foi usado
        } else if (statusSession === "notLogged") {
          sessions[name].connected = false;
        } else if (statusSession === "qrTimeout") {
          // Forçar regenerar QR
          sessions[name].qrCode = null;
          logRequest(req, `QR expirado para sessão "${name}"`);
        }
      },
      headless: true,
      useChrome: false,
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
      puppeteerOptions: {
        userDataDir: sessionPath,
      },
    });

    sessions[name] = {
      client,
      qrCode: null,
      qrTimestamp: null,
      connected: false,
    };

    logRequest(req, `Sessão "${name}" criada`);
    res.json({ success: true, session: name });
  } catch (err) {
    logRequest(req, `Erro ao criar sessão "${name}": ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  const data = Object.entries(sessions).map(([name, s]) => ({
    name,
    connected: s.connected,
  }));
  logRequest(req, "Solicitado listar sessões");
  res.json(data);
});

// Retornar QR somente se for novo
app.get("/qr/:name.png", (req, res) => {
  const name = req.params.name;
  const session = sessions[name];
  if (!session) {
    logRequest(req, `Sessão "${name}" não encontrada`);
    return res.status(404).json({ error: "Sessão não encontrada" });
  }

  if (!session.qrCode) {
    logRequest(req, `QR da sessão "${name}" ainda não disponível ou já usado`);
    return res.status(204).end(); // Sem conteúdo
  }

  res.setHeader("Content-Type", "image/png");
  res.send(session.qrCode);
  logRequest(req, `QR da sessão "${name}" retornado`);
});

// Dados da sessão
app.get("/sessionData/:name", async (req, res) => {
  const name = req.params.name;
  const session = sessions[name];
  if (!session) {
    logRequest(req, `Sessão "${name}" não encontrada`);
    return res.status(404).json({ error: "Sessão não encontrada" });
  }

  const data = {
    name,
    connected: session.connected,
    hasQr: !!session.qrCode,
  };
  logRequest(req, `Dados da sessão "${name}" retornados com sucesso`);
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
 
