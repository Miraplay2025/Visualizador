const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

/* Logs recentes (máx 100 caracteres) */
let recentLogs = "";
function log(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}\n`;
  recentLogs += entry;
  if (recentLogs.length > 100) {
    recentLogs = recentLogs.slice(recentLogs.length - 100);
  }
  console.log(entry.trim());
}

const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

/* Sessões em memória */
let sessions = {}; 
// { sessionName: { client, qr, qrFile, connected, valid } }

/* Criar sessão */
async function createSession(sessionName) {
  if (sessions[sessionName]) return sessions[sessionName];

  sessions[sessionName] = { client: null, qr: null, qrFile: null, connected: false, valid: false };

  const sessionFile = path.join(SESSION_FOLDER, `${sessionName}.json`);
  let sessionData = null;
  if (fs.existsSync(sessionFile)) {
    sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  }

  try {
    const client = await wppconnect.create({
      session: sessionName,
      sessionData,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
      autoClose: 0,
      catchQR: (base64Qr) => {
        if (!sessions[sessionName].valid) {
          if (sessions[sessionName].qrFile && fs.existsSync(sessions[sessionName].qrFile)) {
            fs.unlinkSync(sessions[sessionName].qrFile);
          }
          const qrFileName = path.join(SESSION_FOLDER, `${sessionName}_qr.png`);
          const qrBuffer = Buffer.from(base64Qr.replace(/^data:image\/png;base64,/, ""), "base64");
          fs.writeFileSync(qrFileName, qrBuffer);

          sessions[sessionName].qr = base64Qr;
          sessions[sessionName].qrFile = qrFileName;
          sessions[sessionName].valid = true;
          log(`🔹 Novo QR gerado (${sessionName})`);
        }
      },
      statusFind: (status) => {
        if (status === "qrReadFail" || status === "notLogged") {
          sessions[sessionName].valid = false; // força próxima geração
          log(`⚠️ QR expirado ou não lido (${sessionName})`);
        }

        sessions[sessionName].connected = status === "inChat";

        if (status === "inChat") {
          client.getSessionTokenBrowser()
            .then((data) => fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2)))
            .catch((err) => log(`❌ Erro salvar sessão ${sessionName}: ${err.message}`));
        }
      },
      logQR: false,
    });

    sessions[sessionName].client = client;
    return sessions[sessionName];
  } catch (err) {
    delete sessions[sessionName];
    throw err;
  }
}

/* Listar sessões */
app.get("/sessions", (req, res) => {
  const all = Object.keys(sessions).map((n) => ({ name: n, connected: sessions[n].connected }));
  res.json(all);
});

/* Criar nova sessão */
app.post("/session/:name", async (req, res) => {
  try {
    await createSession(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Excluir sessão */
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });

  try {
    await sessions[name].client.close();
    if (sessions[name].qrFile && fs.existsSync(sessions[name].qrFile)) {
      fs.unlinkSync(sessions[name].qrFile);
    }
    delete sessions[name];
    const sessionFile = path.join(SESSION_FOLDER, `${name}.json`);
    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* QR Code */
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  const sess = sessions[name];
  if (!sess || !sess.qr || !sess.qrFile || !fs.existsSync(sess.qrFile)) {
    return res.status(404).send("QR code ainda não disponível");
  }
  try {
    const imgBuffer = fs.readFileSync(sess.qrFile);
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(imgBuffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* Status da sessão */
app.get("/status/:name", (req, res) => {
  const { name } = req.params;
  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });
  res.json({ connected: sessions[name].connected });
});

/* Enviar mensagem */
app.post("/send/:name", async (req, res) => {
  const { name } = req.params;
  const { number, message } = req.body;

  if (!sessions[name]) return res.status(404).json({ error: "Sessão não encontrada" });
  if (!sessions[name].connected) return res.status(400).json({ error: "Sessão não conectada" });

  try {
    await sessions[name].client.sendText(number + "@c.us", message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Logs */
app.get("/logs", (req, res) => res.send(recentLogs));

/* Porta */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => log(`🚀 Servidor rodando na porta ${PORT}`));
