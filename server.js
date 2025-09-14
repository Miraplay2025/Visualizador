// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("conectados")); // QR codes e dados

const PORT = 10000;

// ----------------- PASTA GLOBAL -----------------
const SESSION_FOLDER = path.join(__dirname, "conectados");
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

// ----------------- LOG SIMPLES -----------------
function logResponse(endpoint, message) {
  console.log(`[${new Date().toISOString()}] ${endpoint} → ${message}`);
}

// ----------------- SESSÕES EM MEMÓRIA -----------------
let sessions = {}; 
// Estrutura: { name: { client, qrPath, qrTimestamp, connected, sessionData } }

// ----------------- RESTAURAR SESSÕES EM MEMÓRIA -----------------
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
      logResponse("restoreSessions", `Sessão "${name}" restaurada na memória`);
    }
  } catch (err) {
    logResponse("restoreSessions", `Erro ao restaurar sessões: ${err.message}`);
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
      catchQR: () => {}, // QR gerado somente quando solicitado
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

// ----------------- EXCLUIR SESSÃO -----------------
app.delete("/session/:name", async (req, res) => {
  const { name } = req.params;
  const endpoint = "/session/:name (DELETE)";
  logResponse(endpoint, `Solicitado excluir sessão "${name}"`);

  if (!sessions[name]) {
    const msg = "Sessão não encontrada";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  try {
    if (sessions[name].client) await sessions[name].client.logout();
    delete sessions[name];

    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    const sessionDir = path.join(SESSION_FOLDER, name);

    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    res.json({ success: true, message: `Sessão "${name}" excluída` });
    logResponse(endpoint, `Sessão "${name}" excluída com sucesso`);
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
          } catch (err) {
            logResponse(endpoint, `Erro lendo JSON da sessão ${sessionName}: ${err.message}`);
          }
        }
        list.push({ name: sessionName, connected });
      }
    }

    const msg = list.length ? `Total de sessões encontradas: ${list.length}` : "Nenhuma sessão cadastrada";
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

  if (!sessions[name]) {
    const msg = "Sessão não encontrada";
    res.status(404).json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  try {
    const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");

    await wppconnect.create({
      session: name,
      catchQR: (qr) => {
        fs.writeFileSync(sessionQRPath, Buffer.from(qr, "base64"));
        sessions[name].qrPath = sessionQRPath;
        sessions[name].qrTimestamp = Date.now();
      },
      puppeteerOptions: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
      autoClose: 0,
    });

    if (!fs.existsSync(sessionQRPath)) {
      const msg = "QR não disponível";
      res.status(404).json({ success: false, error: msg });
      return logResponse(endpoint, `Retorno: ${msg}`);
    }

    res.sendFile(sessionQRPath);
    logResponse(endpoint, `QR code da sessão "${name}" enviado`);
  } catch (err) {
    const msg = `Erro geração QR: ${err.message}`;
    res.status(500).json({ success: false, error: msg });
    logResponse(endpoint, msg);
  }
});

// ----------------- DADOS DA SESSÃO -----------------
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  const endpoint = "/sessionData/:name (GET)";
  logResponse(endpoint, `Solicitado dados da sessão "${name}"`);

  if (!sessions[name]) {
    const msg = "Sessão não encontrada";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  const data = {
    success: true,
    name,
    connected: sessions[name].connected || false,
    sessionData: sessions[name].sessionData || null,
  };
  res.json(data);
  logResponse(endpoint, `Retorno: Dados da sessão enviados`);
});

// ----------------- ENVIAR MENSAGEM -----------------
app.post("/sendMessage/:name", async (req, res) => {
  const { name } = req.params;
  const { to, message } = req.body;
  const endpoint = "/sendMessage/:name (POST)";
  logResponse(endpoint, `Solicitado enviar mensagem pela sessão "${name}"`);

  if (!sessions[name] || !sessions[name].connected) {
    const msg = "Sessão não conectada";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  if (!to || !message) {
    const msg = "Campos 'to' e 'message' são obrigatórios";
    res.json({ success: false, error: msg });
    return logResponse(endpoint, `Retorno: ${msg}`);
  }

  try {
    await sessions[name].client.sendText(to, message);
    res.json({ success: true, to, message });
    logResponse(endpoint, `Mensagem enviada para ${to}: "${message}"`);
  } catch (err) {
    const msg = `Erro envio: ${err.message}`;
    res.json({ success: false, error: msg });
    logResponse(endpoint, msg);
  }
});

// ----------------- START -----------------
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
