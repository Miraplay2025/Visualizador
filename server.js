// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SESSION_FOLDER = path.join(__dirname, "conectados");

// Garante a pasta
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

// Memória local das sessões
const sessions = {};

// Função utilitária para log controlado
function logRequest(route, msg) {
  console.log(`[${new Date().toISOString()}] ${route} → ${msg}`);
}

// Criar sessão
async function createSession(name) {
  if (sessions[name] && sessions[name].client) {
    return sessions[name].client; // já existe
  }

  const sessionDataDir = path.join(SESSION_FOLDER, name);
  if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");

  sessions[name] = {
    client: null,
    connected: false,
    qrPath: null,
    sessionData: null,
  };

  const client = await wppconnect.create({
    session: name,
    catchQR: (qr, asciiQR, attempt) => {
      fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
      sessions[name].qrPath = sessionQRPath;
      sessions[name].qrTimestamp = Date.now();
    },
    statusFind: (statusSession) => {
      if (statusSession === "isLogged") {
        sessions[name].connected = true;
        client.getSessionTokenBrowser().then((token) => {
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
        });
      } else if (statusSession === "qrReadFail" || statusSession === "qrTimeout") {
        // força atualização do QR
        if (fs.existsSync(sessionQRPath)) fs.unlinkSync(sessionQRPath);
        sessions[name].qrPath = null;
      }
    },
    puppeteerOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--remote-debugging-port=0",
      ],
      userDataDir: sessionDataDir,
      cacheDirectory: tmpDir,
    },
    autoClose: 0, // nunca fecha sozinho
  });

  sessions[name].client = client;
  return client;
}

// 📌 Rotas

// Criar sessão
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (POST)", `Solicitado criar sessão "${name}"`);
  try {
    await createSession(name);
    res.json({ success: true, message: `Sessão "${name}" criada` });
  } catch (err) {
    logRequest("/session/:name (POST)", `Erro: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar sessões
app.get("/sessions", (req, res) => {
  logRequest("/sessions (GET)", "Solicitado listar sessões");
  const all = Object.keys(sessions).map((name) => ({
    name,
    connected: sessions[name].connected,
  }));
  logRequest("/sessions (GET)", `Retorno: ${JSON.stringify(all)}`);
  res.json({ success: true, sessions: all });
});

// Buscar dados de uma sessão
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/sessionData/:name (GET)", `Solicitado dados da sessão "${name}"`);
  if (!sessions[name]) {
    logRequest("/sessionData/:name (GET)", `Retorno: Sessão "${name}" não encontrada`);
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  logRequest("/sessionData/:name (GET)", `Dados da sessão "${name}" retornados com sucesso`);
  res.json({
    success: true,
    session: {
      name,
      connected: sessions[name].connected,
      sessionData: sessions[name].sessionData,
    },
  });
});

// Retornar QR de uma sessão
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  logRequest("/qr/:name.png (GET)", `Solicitado QR da sessão "${name}"`);
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }
  if (!sessions[name].qrPath || !fs.existsSync(sessions[name].qrPath)) {
    return res.status(404).json({ success: false, error: "QR não disponível" });
  }
  res.sendFile(sessions[name].qrPath);
});

// Excluir sessão
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (DELETE)", `Solicitado excluir sessão "${name}"`);
  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  try {
    // Apaga arquivos da sessão
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);

    delete sessions[name];
    logRequest("/session/:name (DELETE)", `Sessão "${name}" excluída com sucesso`);
    res.json({ success: true, message: `Sessão "${name}" excluída` });
  } catch (err) {
    logRequest("/session/:name (DELETE)", `Erro: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
