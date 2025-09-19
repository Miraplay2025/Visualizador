// endpoints/qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Armazena sessões ativas e locks para evitar concorrência
let sessions = {};
let locks = {};

// Função de log com prefixo
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

// Limpa e fecha uma sessão
function cleanupSession(nome) {
  if (sessions[nome]) {
    try {
      sessions[nome].client.close();
    } catch {}
    delete sessions[nome];
  }
  delete locks[nome];
  log(`Sessão "${nome}" removida/limpa`);
}

// Monitoramento de status da sessão
function startMonitor(nome, client) {
  client.onStateChange(async (status) => {
    log(`Status da sessão "${nome}": ${status}`);
    try {
      if (status === "CONNECTED" || status === "isLogged") {
        // Sessão conectada com sucesso
        clearTimeout(sessions[nome]?.timeout);
        sessions[nome].qrStatus = "connected";

        // Obter tokens da sessão
        const tokens = await client.getSessionTokenBrowser();

        // Atualizar servidor PHP
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });

        log(`Sessão "${nome}" conectada com sucesso`);
        cleanupSession(nome);
      }

      if (status === "qrReadSuccess") {
        log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
      }

      if (status === "qrReadFail" || status === "qrCodeSessionInvalid") {
        sessions[nome].qrStatus = "expired";
        log(`QR da sessão "${nome}" expirou ou é inválido`);
      }
    } catch (err) {
      log(`❌ Erro monitorando status: ${err.message}`);
      cleanupSession(nome);
    }
  });
}

// Endpoint principal para gerar/obter QR Code
async function handleQRCode(req, res) {
  const nome = req.params.nome?.replace(".png",""); // Remove .png se enviado
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Operação em andamento" });
  locks[nome] = true;

  try {
    // ====================================================
    // Caso a sessão já exista
    // ====================================================
    if (sessions[nome]) {
      const sess = sessions[nome];

      // QR ainda válido, retorna imediatamente
      if (sess.qrStatus === "valid" && sess.qrBase64) {
        locks[nome] = false;
        return res.json({ success: true, message: "QR ainda válido", base64: sess.qrBase64 });
      }

      // Sessão já conectada
      if (sess.qrStatus === "connected") {
        locks[nome] = false;
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      // QR expirado, gerar novo
      if (sess.qrStatus === "expired") {
        log(`Gerando novo QR para sessão "${nome}"...`);
        const newQR = await sess.client.getQrCode();
        sess.qrBase64 = newQR;
        sess.qrStatus = "valid";

        if (sess.timeout) clearTimeout(sess.timeout);
        sess.timeout = setTimeout(() => cleanupSession(nome), 5 * 60 * 1000);

        startMonitor(nome, sess.client);

        locks[nome] = false;
        return res.json({ success: true, message: "Novo QR gerado", base64: newQR });
      }
    }

    // ====================================================
    // Caso a sessão não exista: criar nova
    // ====================================================
    log(`Iniciando criação da sessão "${nome}"...`);

    const client = await wppconnect.create({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
      },
    });

    // Cria referência inicial da sessão
    sessions[nome] = { client, qrBase64: null, qrStatus: "pending", timeout: null };

    // Timeout de 5 minutos caso QR não seja gerado
    const failTimeout = setTimeout(() => {
      log(`❌ Tempo expirado para gerar QR da sessão "${nome}"`);
      cleanupSession(nome);
      if (!res.headersSent) res.json({ success: false, error: "Não foi possível gerar QRCode (timeout 5min)" });
    }, 5 * 60 * 1000);

    // Gera primeiro QR e espera até estar disponível
    const qrCode = await client.getQrCode();
    sessions[nome].qrBase64 = qrCode;
    sessions[nome].qrStatus = "valid";

    // Limpa timeout de falha pois QR foi gerado
    clearTimeout(failTimeout);

    // Responde ao cliente somente quando QR estiver pronto
    res.json({ success: true, message: "QR Code gerado com sucesso", base64: qrCode });

    // Inicia monitoramento de status e timeout da sessão
    startMonitor(nome, client);
    sessions[nome].timeout = setTimeout(() => cleanupSession(nome), 5 * 60 * 1000);

    locks[nome] = false;
  } catch (err) {
    log(`❌ Erro ao gerar QR: ${err.message}`);
    cleanupSession(nome);
    locks[nome] = false;
    return res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;
