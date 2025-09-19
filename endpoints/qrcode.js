// qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Sessões e locks
const sessions = {};
const locks = {};

// Função de log padronizada
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

// Limpa e fecha sessão
function cleanupSession(nome) {
  if (sessions[nome]) {
    try {
      sessions[nome].client?.close();
    } catch {}
    delete sessions[nome];
  }
  delete locks[nome];
  log(`Sessão "${nome}" removida/limpa`);
}

// Monitoramento de status da sessão
function startMonitor(nome, client) {
  client.removeAllListeners("stateChange");

  client.onStateChange(async (status) => {
    log(`Status da sessão "${nome}": ${status}`);
    try {
      if (status === "CONNECTED" || status === "isLogged") {
        clearTimeout(sessions[nome]?.timeout);
        sessions[nome].qrStatus = "connected";

        const tokens = await client.getSessionTokenBrowser();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });

        log(`Sessão "${nome}" conectada com sucesso`);
      }

      if (status === "qrReadSuccess") {
        log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
      }

      if (status === "qrReadFail" || status === "qrCodeSessionInvalid") {
        sessions[nome].qrStatus = "expired";
        log(`QR da sessão "${nome}" expirou/é inválido`);
      }
    } catch (err) {
      log(`❌ Erro monitorando status: ${err.message}`);
      cleanupSession(nome);
    }
  });
}

// Timeout de 5 minutos para QRCode
function setupQrTimeout(nome) {
  if (sessions[nome]?.timeout) clearTimeout(sessions[nome].timeout);
  sessions[nome].timeout = setTimeout(() => {
    log(`❌ Tempo expirado para QR não conectado da sessão "${nome}"`);
    cleanupSession(nome);
  }, 5 * 60 * 1000);
}

// Função para gerar novo QR de uma sessão existente
async function regenerateQr(nome, client) {
  try {
    const newQr = await client.generateQrCode();
    sessions[nome].qrBase64 = newQr;
    sessions[nome].qrStatus = "valid";

    startMonitor(nome, client);
    setupQrTimeout(nome);

    log(`Novo QR regenerado para sessão "${nome}"`);
    return newQr;
  } catch (err) {
    log(`❌ Erro ao regenerar QR: ${err.message}`);
    cleanupSession(nome);
    throw err;
  }
}

// Endpoint principal
async function handleQRCode(req, res) {
  const nome = req.params.nome?.replace(".png", "");
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Operação em andamento" });
  locks[nome] = true;

  try {
    // Se sessão já existe
    if (sessions[nome]) {
      const sess = sessions[nome];

      if (sess.qrStatus === "valid" && sess.qrBase64) {
        locks[nome] = false;
        return res.json({ success: true, message: "QR ainda válido", base64: sess.qrBase64 });
      }

      if (sess.qrStatus === "connected") {
        locks[nome] = false;
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      if (sess.qrStatus === "expired") {
        log(`QR expirado — regenerando para sessão "${nome}"...`);
        const newQr = await regenerateQr(nome, sess.client);
        locks[nome] = false;
        return res.json({ success: true, message: "Novo QR gerado", base64: newQr });
      }
    }

    // Criar nova sessão
    log(`🔹 Criando nova instância para sessão "${nome}"...`);

    const client = await wppconnect.create({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        userDataDir: `/app/tokens/${nome}-${Date.now()}`,
      },
      autoClose: 0,
      catchQR: (base64Qr) => {
        sessions[nome] = {
          client,
          qrBase64: base64Qr,
          qrStatus: "valid",
        };
        log(`QR inicial gerado para sessão "${nome}"`);
      },
    });

    // Salva client
    if (!sessions[nome]) sessions[nome] = {};
    sessions[nome].client = client;

    startMonitor(nome, client);
    setupQrTimeout(nome);

    // Espera até QR estar pronto (no máximo 15s para não travar o render)
    let waited = 0;
    while (!sessions[nome].qrBase64 && waited < 15) {
      await new Promise((r) => setTimeout(r, 1000));
      waited++;
    }

    if (!sessions[nome]?.qrBase64) {
      // Se não gerou no tempo, tenta regenerar
      log(`QR não veio no catchQR — tentando regenerateQr("${nome}")`);
      const forcedQr = await regenerateQr(nome, client);
      locks[nome] = false;
      return res.json({ success: true, message: "QR gerado via regenerate", base64: forcedQr });
    }

    locks[nome] = false;
    return res.json({ success: true, message: "QR Code gerado", base64: sessions[nome].qrBase64 });

  } catch (err) {
    log(`❌ Erro ao gerar QR: ${err.message}`);
    cleanupSession(nome);
    locks[nome] = false;
    if (!res.headersSent) return res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;
