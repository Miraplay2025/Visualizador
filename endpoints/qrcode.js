const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

const app = express();
app.use(bodyParser.json());

const PORT = 3000;

// Sessões temporárias e travas
let sessions = {};
let locks = {};

// Tempo máximo de QR code ativo (5 minutos)
const QR_TIMEOUT = 5 * 60 * 1000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 ${msg}`);
}

function cleanupSession(nome) {
  if (sessions[nome]) {
    if (sessions[nome].client) {
      sessions[nome].client.close();
    }
    if (sessions[nome].timeout) clearTimeout(sessions[nome].timeout);
    delete sessions[nome];
    log(`Sessão "${nome}" removida`);
  }
}

// Função para reiniciar o timeout de QR code
function resetQRTimeout(nome, qrPath) {
  if (sessions[nome].timeout) clearTimeout(sessions[nome].timeout);
  sessions[nome].timeout = setTimeout(() => {
    log(`QR code da sessão "${nome}" expirou após 5 minutos`);
    cleanupSession(nome);
    if (qrPath && fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
  }, QR_TIMEOUT);
}

// Rota para gerar/retornar QR code
app.get("/qrcode/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  locks[nome] = true;

  const sessionDir = path.join(__dirname, "sessions", nome);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const qrPath = path.join(sessionDir, "qrcode.png");

  try {
    // Sessão já existe
    if (sessions[nome] && sessions[nome].client) {
      const state = await sessions[nome].client.getConnectionState();
      if (state === "CONNECTED") {
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      // Se QR ainda válido
      if (sessions[nome].qrStatus === "valid") {
        const qrBase64 = fs.readFileSync(qrPath, { encoding: "base64" });
        return res.json({ success: true, message: "QR code atual ainda válido", qrBase64 });
      }

      // Se QR expirou: gerar novo QR da mesma instância
      log(`QR code da sessão "${nome}" expirou. Solicitando novo QR...`);
      const qrBase64 = await sessions[nome].client.getQrCode(); // pega novo QR da instância
      fs.writeFileSync(qrPath, Buffer.from(qrBase64, "base64"));
      sessions[nome].qrStatus = "valid";
      resetQRTimeout(nome, qrPath);
      return res.json({ success: true, message: "Novo QR code gerado", qrBase64 });
    }

    // Sessão ainda não existe: criar nova instância
    const client = await createClient({
      session: nome,
      catchQR: (base64Qr) => {
        fs.writeFileSync(qrPath, Buffer.from(base64Qr, "base64"));
        sessions[nome] = {
          client,
          qrStatus: "valid",
        };
        resetQRTimeout(nome, qrPath);
        log(`QR code gerado para a sessão "${nome}"`);
      },
      statusFind: async (statusSession) => {
        log(`Status da sessão "${nome}": ${statusSession}`);
        try {
          if (statusSession === "isLogged" || statusSession === "CONNECTED") {
            clearTimeout(sessions[nome].timeout);

            const tokens = await client.getSessionTokenBrowser();

            const updateResp = await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
            });

            log(`Sessão "${nome}" conectada. updateResp => ${JSON.stringify(updateResp)}`);
            if (updateResp.success) cleanupSession(nome);
          }

          if (statusSession === "qrReadSuccess") log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
          if (statusSession === "qrReadFail" || statusSession === "qrCodeSessionInvalid") {
            sessions[nome].qrStatus = "expired";
            log(`QR da sessão "${nome}" expirou ou inválido`);
            if (sessions[nome].timeout) clearTimeout(sessions[nome].timeout);
          }
        } catch (err) {
          log(`❌ Erro monitorando status: ${err.message}`);
          cleanupSession(nome);
        }
      },
      directory: sessionDir,
      headless: true,
    });

    sessions[nome].client = client;

    // Espera até o QR code ser gerado
    const waitForQR = () =>
      new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (sessions[nome] && sessions[nome].qrStatus === "valid" && fs.existsSync(qrPath)) {
            clearInterval(interval);
            const qrBase64 = fs.readFileSync(qrPath, { encoding: "base64" });
            resolve(qrBase64);
          }
          if (attempts > 50) {
            clearInterval(interval);
            reject("Falha ao gerar QR code");
          }
        }, 100);
      });

    const qrBase64 = await waitForQR();
    res.json({ success: true, qrBase64 });

  } catch (err) {
    log(`❌ Erro geral: ${err.message}`);
    cleanupSession(nome);
    res.json({ success: false, error: err.message });
  } finally {
    delete locks[nome];
  }
});

app.listen(PORT, () => {
  log(`Servidor rodando na porta ${PORT}`);
});
