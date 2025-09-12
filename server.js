const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());

// Guardar sessões
let sessions = {}; // { sessionName: { client, qr, connected } }

// Criar nova sessão
async function createSession(sessionName) {
  if (sessions[sessionName]) {
    console.log(`Sessão ${sessionName} já existe`);
    return sessions[sessionName];
  }

  console.log(`🔄 Iniciando sessão: ${sessionName}`);
  return wppconnect
    .create({
      session: sessionName,
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
        console.log(`Novo QR gerado para sessão ${sessionName}`);
      },
      statusFind: (statusSession) => {
        console.log(`STATUS [${sessionName}]:`, statusSession);
        sessions[sessionName].connected = statusSession === "inChat";
      },
      logQR: false,
    })
    .then((client) => {
      sessions[sessionName] = { client, qr: null, connected: false };
      return sessions[sessionName];
    })
    .catch((err) => console.error(`Erro ao iniciar sessão ${sessionName}:`, err));
}

// 🔹 Endpoint: Listar todas as sessões
app.get("/sessions", (req, res) => {
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
    res.status(500).json({ error: "Erro ao criar sessão", details: err.message });
  }
});

// 🔹 Endpoint: Excluir sessão
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }

  try {
    await sessions[name].client.close();
    delete sessions[name];
    res.json({ success: true, message: `Sessão ${name} excluída` });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir sessão", details: err.message });
  }
});

// 🔹 Endpoint: Pegar QR de uma sessão
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  if (!sessions[name] || !sessions[name].qr) {
    return res.status(404).send("QR code ainda não gerado");
  }

  const imgBuffer = Buffer.from(
    sessions[name].qr.replace(/^data:image\/png;base64,/, ""),
    "base64"
  );

  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": imgBuffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(imgBuffer);
});

// 🔹 Endpoint: Status de uma sessão
app.get("/status/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  res.json({ connected: sessions[name].connected });
});

// 🔹 Endpoint: Enviar mensagem por sessão
app.post("/send/:name", async (req, res) => {
  const { name } = req.params;
  const { number, message } = req.body;

  if (!sessions[name]) {
    return res.status(404).json({ error: "Sessão não encontrada" });
  }
  if (!sessions[name].connected) {
    return res.status(400).json({ error: "Sessão não conectada ao WhatsApp" });
  }

  try {
    await sessions[name].client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    console.error(`Erro ao enviar mensagem [${name}]:`, err);
    res.status(500).json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Porta para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
