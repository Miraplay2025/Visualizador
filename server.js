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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
    ],
  },
  autoClose: 0, // nunca fecha a página automaticamente
  catchQR: (base64Qr) => {
    qrCodeBase64 = base64Qr;
    connected = false;
    console.log("Novo QR gerado");
  },
  statusFind: (statusSession) => {
    console.log("STATUS:", statusSession);
    connected = statusSession === "inChat";
    if (connected) console.log("✅ Conectado ao WhatsApp");
  },
  logQR: false,
})
  .then((cli) => {
    client = cli;
  })
  .catch((err) => console.error("Erro ao iniciar WPPConnect:", err));

// Endpoint para pegar QR como imagem PNG
app.get("/qr.png", (req, res) => {
  if (!qrCodeBase64) {
    // Retorna status 404 mas com mensagem de texto no HTML
    return res.status(404).send("QR code ainda não gerado");
  }

  const imgBuffer = Buffer.from(
    qrCodeBase64.replace(/^data:image\/png;base64,/, ""),
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

// Endpoint para enviar mensagem
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!connected)
      return res.status(400).json({ error: "Não conectado ao WhatsApp" });

    await client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res
      .status(500)
      .json({ error: "Erro ao enviar mensagem", details: err.message });
  }
});

// Endpoint para verificar status
app.get("/status", (req, res) => {
  res.json({ connected });
});

// Porta para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
       
