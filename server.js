// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("conectados"));

const PORT = process.env.PORT || 10000;
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// ----------------- LOG -----------------
function logRequest(endpoint, message) {
  console.log(`[${new Date().toISOString()}] ${endpoint} → ${message}`);
}

// ----------------- SESSÕES EM MEMÓRIA -----------------
let sessions = {}; 
// Estrutura: { name: { client, qrPath, connected, sessionData } }

// ----------------- RESTAURAR SESSÕES -----------------
function restoreSessions() {
  try {
    const dirs = fs.readdirSync(SESSION_FOLDER, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of dirs) {
      const name = dir.name;
      const jsonFile = path.join(SESSION_FOLDER, name + ".json");
      let connected = false;
      let sessionData = null;
      if (fs.existsSync(jsonFile)) {
        const data = JSON.parse(fs.readFileSync(jsonFile));
        connected = data.connected || false;
        sessionData = data.sessionData || null;
      }
      sessions[name] = { client: null, qrPath: null, connected, sessionData };
      logRequest("restoreSessions", `Sessão "${name}" restaurada`);
    }
  } catch (err) {
    logRequest("restoreSessions", `Erro restaurando sessões: ${err.message}`);
  }
}
restoreSessions();

// ----------------- CRIAR SESSÃO -----------------
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/session/:name (POST)";
  logRequest(endpoint, `Solicitado criar sessão "${name}"`);

  if (!name) {
    const msg = "Nome inválido";
    res.json({ success: false, error: msg });
    return logRequest(endpoint, `Retorno: ${msg}`);
  }

  if (sessions[name] && sessions[name].client) {
    const msg = "Sessão já existe";
    res.json({ success: false, error: msg });
    return logRequest(endpoint, `Retorno: ${msg}`);
  }

  try {
    const sessionDataDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

    const client = await wppconnect.create({
      session: name,
      catchQR: () => {}, // QR será gerado apenas sob demanda
      statusFind: async (statusSession) => {
        if (statusSession === "isLogged") {
          sessions[name].connected = true;
          try {
            const token = await client.getSessionTokenBrowser();
            sessions[name].sessionData = token;
            const jsonPath = path.join(SESSION_FOLDER, name + ".json");
            fs.writeFileSync(
              jsonPath,
              JSON.stringify(
                { name, connected: true, sessionData: token, timestamp: new Date().toISOString() },
                null,
                2
              )
            );
            logRequest(endpoint, `Sessão "${name}" conectada e salva`);
          } catch (err) {
            logRequest(endpoint, `Erro salvando token da sessão "${name}": ${err.message}`);
          }
        }
        // Se WppConnect indicar QR expirado, limpa QR antigo
        if (statusSession === "qrCodeUnknown" || statusSession === "qrCodeExpired") {
          sessions[name].qrPath = null;
        }
      },
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        userDataDir: sessionDataDir,
      },
      autoClose: 0,
    });

    sessions[name] = {
      client,
      qrPath: null,
      connected: false,
      sessionData: null,
    };

    const msg = "Sessão criada. QR disponível somente quando solicitado.";
    res.json({ success: true, name, message: msg });
    logRequest(endpoint, `Retorno: ${msg}`);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logRequest(endpoint, `Erro: ${err.message}`);
  }
});

// ----------------- LISTAR SESSÕES -----------------
app.get("/sessions", (req, res) => {
  const endpoint = "/sessions (GET)";
  logRequest(endpoint, "Solicitado listar sessões");

  try {
    const list = Object.keys(sessions).map(name => ({
      name,
      connected: sessions[name].connected,
    }));

    const msg = list.length ? `Total de sessões: ${list.length}` : "Nenhuma sessão cadastrada";
    res.json({ success: true, sessions: list, message: msg });
    logRequest(endpoint, `Retorno: ${JSON.stringify(list)}`);
  } catch (err) {
    const msg = `Erro ao listar sessões: ${err.message}`;
    res.json({ success: false, error: msg });
    logRequest(endpoint, msg);
  }
});

// ----------------- GERAR QR CODE SOB DEMANDA -----------------
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/qr/:name.png (GET)";
  logRequest(endpoint, `Solicitado QR da sessão "${name}"`);

  try {
    if (!sessions[name]) throw new Error("Sessão não encontrada");
    const sessionDir = path.join(SESSION_FOLDER, name);
    const sessionQRPath = path.join(sessionDir, name + ".png");

    // Gera QR code via WppConnect
    const client = await wppconnect.create({
      session: name,
      catchQR: (qr) => {
        if (fs.existsSync(sessionQRPath)) fs.unlinkSync(sessionQRPath);
        fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
        sessions[name].qrPath = sessionQRPath;
      },
      statusFind: () => {},
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        userDataDir: sessionDir,
      },
      autoClose: 0,
    });

    // Aguarda QR ser gerado
    const waitForQR = () => new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (sessions[name]?.qrPath && fs.existsSync(sessions[name].qrPath)) {
          clearInterval(interval);
          resolve();
        }
      }, 300);
      setTimeout(() => reject("Timeout gerando QR"), 15000);
    });
    await waitForQR();

    res.setHeader("Content-Type", "image/png");
    res.sendFile(sessionQRPath);
    logRequest(endpoint, `QR code da sessão "${name}" retornado com sucesso`);
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
    logRequest(endpoint, `Retorno: ${err.message}`);
  }
});

// ----------------- RETORNAR DADOS DE UMA SESSÃO -----------------
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  const endpoint = "/sessionData/:name (GET)";
  logRequest(endpoint, `Solicitado dados da sessão "${name}"`);

  try {
    if (!sessions[name]) throw new Error("Sessão não encontrada");

    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    let connected = sessions[name].connected;
    let sessionData = sessions[name].sessionData;

    if (fs.existsSync(jsonFile)) {
      const data = JSON.parse(fs.readFileSync(jsonFile));
      connected = data.connected || connected;
      sessionData = data.sessionData || sessionData;
    }

    res.json({ success: true, name, connected, sessionData });
    logRequest(endpoint, `Dados da sessão "${name}" retornados com sucesso`);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logRequest(endpoint, `Retorno: ${err.message}`);
  }
});

// ----------------- EXCLUIR SESSÃO -----------------
app.delete("/delete/session/:name", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/delete/session/:name (DELETE)";
  logRequest(endpoint, `Solicitado excluir sessão "${name}"`);

  try {
    if (!sessions[name]) throw new Error("Sessão não encontrada");

    if (sessions[name]?.client) await sessions[name].client.logout();
    delete sessions[name];

    const sessionDir = path.join(SESSION_FOLDER, name);
    const qrFile = path.join(sessionDir, name + ".png");
    const jsonFile = path.join(sessionDir, name + ".json");

    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    const msg = `Sessão "${name}" excluída com sucesso`;
    res.json({ success: true, message: msg });
    logRequest(endpoint, msg);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logRequest(endpoint, `Erro: ${err.message}`);
  }
});

// ----------------- START -----------------
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});

