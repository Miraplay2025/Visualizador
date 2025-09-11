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

// Inicia sessão WPPConnect
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

// Endpoint para retornar QR como PNG
app.get("/qr.png", (req, res) => {
  if (qrCodeBase64) {
    const imgBuffer = Buffer.from(qrCodeBase64.replace(/^data:image\/png;base64,/, ""), "base64");
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": imgBuffer.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.end(imgBuffer);
  } else {
    // Se ainda não houver QR, apenas retorna 204 No Content
    res.status(204).send();
  }
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
