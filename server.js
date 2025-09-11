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
  puppeteerOptions: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // necessário no Render
  },
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
  .catch((err) => console.error("Erro ao iniciar WPPConnect:", err));

// Endpoint para pegar QR como imagem
app.get("/qr.png", (req, res) => {
  if (!qrCodeBase64) {
    return res.status(404).send("QR code ainda não gerado");
  }
  const img = Buffer.from(
    qrCodeBase64.replace(/^data:image\/png;base64,/, ""),
    "base64"
  );
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": img.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(img);
});

// Endpoint para verificar conexão
app.get("/status", (req, res) => {
  res.json({ connected });
});

// Endpoint para enviar mensagem
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!connected) {
      return res.status(400).json({ error: "Não conectado ao WhatsApp" });
    }

    await client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res
      .status(500)
      .json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Render precisa ouvir na porta 10000+
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
