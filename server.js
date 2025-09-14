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

let sessions = {}; // <- Armazena TODAS as sessões criadas

// Criar uma sessão
app.post("/session/:name", async (req, res) => {
  const name = req.params.name;

  if (sessions[name]) {
    return res.json({ success: true, message: "Sessão já existe" });
  }

  try {
    const client = await wppconnect.create({
      session: name,
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        const qrPath = path.join(SESSIONS_DIR, `${name}.png`);
        const base64Data = base64Qr.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(qrPath, base64Data, "base64");

        sessions[name].qrPath = qrPath;
        sessions[name].status = "qrcode";
      },
      statusFind: (statusSession, session) => {
        sessions[name].status = statusSession;
      },
      puppeteerOptions: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
      },
      logQR: false,
      autoClose: false, // <- NUNCA fecha automaticamente
    });

    sessions[name] = {
      client,
      status: "starting",
      qrPath: null,
    };

    res.json({ success: true, message: `Sessão ${name} criada.` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  const list = Object.keys(sessions).map((name) => ({
    name,
    status: sessions[name].status,
    hasQr: fs.existsSync(sessions[name].qrPath || ""),
  }));
  res.json({ success: true, sessions: list });
});

// Obter QR de uma sessão
app.get("/session/:name/qr", (req, res) => {
  const name = req.params.name;

  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  if (!sessions[name].qrPath || !fs.existsSync(sessions[name].qrPath)) {
    return res.json({ success: false, error: "QRCode não disponível" });
  }

  res.sendFile(sessions[name].qrPath);
});

// Excluir sessão
app.delete("/session/:name", async (req, res) => {
  const name = req.params.name;

  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  try {
    if (sessions[name].client) {
      await sessions[name].client.close();
    }

    // Excluir QR salvo
    if (sessions[name].qrPath && fs.existsSync(sessions[name].qrPath)) {
      fs.unlinkSync(sessions[name].qrPath);
    }

    delete sessions[name];

    res.json({ success: true, message: `Sessão ${name} removida.` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Enviar mensagem
app.post("/send", async (req, res) => {
  const { session, to, message } = req.body;

  if (!sessions[session]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  try {
    const client = sessions[session].client;
    const result = await client.sendText(to, message);
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
              
