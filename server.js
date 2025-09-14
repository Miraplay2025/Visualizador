// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
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

// Log controlado
function logRequest(route, msg) {
  console.log(`[${new Date().toISOString()}] ${route} → ${msg}`);
}

// Criar sessão (apenas quando requisitado)
async function createSession(name) {
  if (sessions[name] && sessions[name].client) {
    return sessions[name].client;
  }

  const sessionDataDir = path.join(SESSION_FOLDER, name);
  if (!fs.existsSync(sessionDataDir)) fs.mkdirSync(sessionDataDir, { recursive: true });

  const sessionQRPath = path.join(SESSION_FOLDER, name + ".png");

  sessions[name] = {
    client: null,
    connected: false,
    qrPath: null,
    sessionData: null,
  };

  const client = await wppconnect.create({
    session: name,
    catchQR: async (qr) => {
      // Remove QR antigo se existir
      if (fs.existsSync(sessionQRPath)) fs.unlinkSync(sessionQRPath);

      // Gera e salva QR Code
      const buffer = Buffer.from(qr, "base64");
      fs.writeFileSync(sessionQRPath, buffer);
      sessions[name].qrPath = sessionQRPath;
      logRequest("createSession", `QR Code atualizado para "${name}"`);
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
          logRequest("createSession", `Sessão "${name}" conectada e token salvo`);
        });
      }
    },
    puppeteerOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      userDataDir: sessionDataDir,
    },
    autoClose: 0,
  });

  sessions[name].client = client;
  return client;
}

// Rotas

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

// Retornar QR Code (apenas se requisitado)
app.get("/qr/:name.png", (req, res) => {
  const { name } = req.params;
  logRequest("/qr/:name.png (GET)", `Solicitado QR da sessão "${name}"`);

  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  const qrFile = path.join(SESSION_FOLDER, name + ".png");
  if (fs.existsSync(qrFile)) {
    return res.sendFile(qrFile);
  }

  return res.status(404).json({ success: false, error: "QR Code não gerado ainda" });
});

// Retornar dados de sessão (somente quando requisitado)
app.get("/sessionData/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/sessionData/:name (GET)", `Solicitado dados da sessão "${name}"`);

  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  res.json({
    success: true,
    session: {
      name,
      connected: sessions[name].connected,
      sessionData: sessions[name].sessionData,
    },
  });
});

// Excluir sessão
app.delete("/session/:name", (req, res) => {
  const { name } = req.params;
  logRequest("/session/:name (DELETE)", `Solicitado excluir sessão "${name}"`);

  if (!sessions[name]) {
    return res.status(404).json({ success: false, error: "Sessão não encontrada" });
  }

  try {
    const sessionDir = path.join(SESSION_FOLDER, name);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    const qrFile = path.join(SESSION_FOLDER, name + ".png");
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);

    const jsonFile = path.join(SESSION_FOLDER, name + ".json");
    if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);

    delete sessions[name];
    logRequest("/session/:name (DELETE)", `Sessão "${name}" excluída`);
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
