const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const { createCanvas } = require("canvas"); // Para criar imagem de texto

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
    qrCodeBase64 = base64Qr; // sempre atualiza
    connected = false;
    console.log("Novo QR gerado");
  },
  statusFind: (statusSession) => {
    console.log("STATUS:", statusSession);
    connected = statusSession === "inChat";
    if (connected) console.log("✅ Conectado ao WhatsApp");
  },
})
  .then((cli) => {
    client = cli;
  })
  .catch((err) => console.error("Erro ao iniciar WPPConnect:", err));

// Função para criar imagem de "Aguardando QR Code"
function generateWaitingImage() {
  const canvas = createCanvas(300, 300);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(0, 0, 300, 300);
  ctx.fillStyle = "#333";
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Aguardando QR Code...", 150, 150);
  return canvas.toBuffer("image/png");
}

// Endpoint para pegar QR como imagem PNG
app.get("/qr.png", (req, res) => {
  let imgBuffer;
  if (qrCodeBase64) {
    imgBuffer = Buffer.from(qrCodeBase64.replace(/^data:image\/png;base64,/, ""), "base64");
  } else {
    imgBuffer = generateWaitingImage();
  }
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": imgBuffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(imgBuffer);
});

// Endpoint para enviar mensagem
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!connected) return res.status(400).json({ error: "Não conectado ao WhatsApp" });

    await client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Status da sessão
app.get("/status", (req, res) => {
  res.json({ connected });
});

// Porta para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

