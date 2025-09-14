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

const PORT = 10000;
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// ----------------- LOG -----------------
function logResponse(endpoint, message) {
  console.log(`[${new Date().toISOString()}] ${endpoint} → ${message}`);
}

// ----------------- SESSÕES EM MEMÓRIA -----------------
let sessions = {}; 
// Estrutura: { name: { client, qrPath, qrTimestamp, connected, sessionData } }

// ----------------- RESTAURAR SESSÕES -----------------
function restoreSessions() {
  try {
    const files = fs.readdirSync(SESSION_FOLDER).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(SESSION_FOLDER, file)));
      const name = data.name;
      sessions[name] = {
        client: null,
        qrPath: null,
        qrTimestamp: null,
        connected: data.connected || false,
        sessionData: data.sessionData || null,
      };
      logResponse("restoreSessions", `Sessão "${name}" restaurada`);
    }
  } catch (err) {
    logResponse("restoreSessions", `Erro restaurando sessões: ${err.message}`);
  }
}
restoreSessions();

// ----------------- CRIAR SESSÃO -----------------
app.post("/session/:name", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/session/:name (POST)";
  logResponse(endpoint, `Solicitado criar sessão "${name}"`);

  if (!name) {
    const msg = "Nome inválido";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  if (sessions[name] && sessions[name].client) {
    const msg = "Sessão já existe";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  try {
    const sessionDataDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

    const client = await wppconnect.create({
      session: name,
      catchQR: () => {}, // QR somente quando solicitado
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
            logResponse(endpoint, `Sessão "${name}" conectada e salva`);
          } catch (err) {
            logResponse(endpoint, `Erro salvando token da sessão "${name}": ${err.message}`);
          }
        }
      },
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        userDataDir: sessionDataDir,
      },
      autoClose: 0,
    });

    sessions[name] = {
      client,
      qrPath: null,
      qrTimestamp: null,
      connected: false,
      sessionData: null,
    };

    const msg = "Sessão criada. QR disponível somente quando solicitado.";
    res.json({ success: true, name, message: msg });
    logResponse(endpoint, `Retorno: ${msg}`);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logResponse(endpoint, `Erro: ${err.message}`);
  }
});

// ----------------- LISTAR TODAS AS SESSÕES -----------------
app.get("/sessions", (req, res) => {
  const endpoint = "/sessions (GET)";
  logResponse(endpoint, "Solicitado listar sessões");

  try {
    let list = [];
    const items = fs.readdirSync(SESSION_FOLDER, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const sessionName = item.name;
        const jsonFile = path.join(SESSION_FOLDER, sessionName + ".json");
        let connected = false;
        if (fs.existsSync(jsonFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(jsonFile));
            connected = data.connected || false;
          } catch {}
        }
        list.push({ name: sessionName, connected });
      }
    }

    const msg = list.length ? `Total de sessões: ${list.length}` : "Nenhuma sessão cadastrada";
    res.json({ success: true, sessions: list, message: msg });
    logResponse(endpoint, `Retorno: ${JSON.stringify(list)}`);
  } catch (err) {
    const msg = `Erro ao listar sessões: ${err.message}`;
    res.json({ success: false, error: msg });
    logResponse(endpoint, msg);
  }
});

// ----------------- GERAR QR CODE SOB DEMANDA -----------------
app.get("/qr/:name.png", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/qr/:name.png (GET)";
  logResponse(endpoint, `Solicitado QR da sessão "${name}"`);

  try {
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDir)) throw new Error("Sessão não encontrada");

    const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");

    await wppconnect.create({
      session: name,
      catchQR: (qr) => {
        fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
        if (!sessions[name]) sessions[name] = {};
        sessions[name].qrPath = sessionQRPath;
        sessions[name].qrTimestamp = Date.now();
      },
      puppeteerOptions: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"], userDataDir: sessionDir },
      autoClose: 0,
    });

    if (!fs.existsSync(sessionQRPath)) throw new Error("QR não disponível");

    res.sendFile(sessionQRPath);
    logResponse(endpoint, `QR code da sessão "${name}" retornado com sucesso`);
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
    logResponse(endpoint, `Retorno: ${err.message}`);
  }
});

// ----------------- RETORNAR DADOS DE UMA SESSÃO ESPECÍFICA -----------------
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  const endpoint = "/sessionData/:name (GET)";
  logResponse(endpoint, `Solicitado dados da sessão "${name}"`);

  try {
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDir)) throw new Error("Sessão não encontrada");

    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    let connected = false;
    let sessionData = null;
    if (fs.existsSync(jsonFile)) {
      const data = JSON.parse(fs.readFileSync(jsonFile));
      connected = data.connected || false;
      sessionData = data.sessionData || null;
    }

    if (!sessions[name]) sessions[name] = {};
    sessions[name].connected = connected;
    sessions[name].sessionData = sessionData;

    res.json({ success: true, name, connected, sessionData });
    logResponse(endpoint, `Dados da sessão "${name}" retornados com sucesso`);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logResponse(endpoint, `Retorno: ${err.message}`);
  }
});

// ----------------- EXCLUIR SESSÃO -----------------
app.delete("/delete/session/:name", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/delete/session/:name (DELETE)";
  logResponse(endpoint, `Solicitado excluir sessão "${name}"`);

  try {
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (!fs.existsSync(sessionDir)) throw new Error("Sessão não encontrada");

    // Logout e remover da memória
    if (sessions[name]?.client) await sessions[name].client.logout();
    delete sessions[name];

    // Remover arquivos
    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    const jsonFile = path.join(SESSION_FOLDER, name + ".json");

    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    res.json({ success: true, message: `Sessão "${name}" excluída com sucesso` });
    logResponse(endpoint, `Sessão "${name}" excluída com sucesso`);
  } catch (err) {
    res.json({ success: false, error: err.message });
    logResponse(endpoint, `Erro: ${err.message}`);
  }
});

// ----------------- START -----------------
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
