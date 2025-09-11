const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let client = null;
let qrCodeBase64 = null;
let connected = false;

// Inicia sessão
wppconnect.create({
  session: "render-session",
  catchQR: (base64Qr) => {
    qrCodeBase64 = base64Qr;
    connected = false;
  },
  statusFind: (statusSession) => {
    console.log("STATUS:", statusSession);
    if (statusSession === "inChat") {
      connected = true;
    }
  },
})
.then((cli) => {
  client = cli;
})
.catch((err) => console.error(err));

// Endpoint para pegar QR Code
app.get("/qr", (req, res) => {
  if (connected) {
    return res.json({ connected: true });
  }
  res.json({ connected: false, qr: qrCodeBase64 });
});

// Endpoint para enviar mensagem
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!connected) return res.status(400).json({ error: "Não conectado" });

    await client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Render precisa ouvir na porta 10000+
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

