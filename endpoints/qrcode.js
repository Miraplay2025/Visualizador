// endpoints/qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Sessões ativas
let sessions = {};
let locks = {};

// Log com prefixo
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

// Limpa sessão
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

// Monitoramento
function startMonitor(nome, client) {
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
        cleanupSession(nome);
      }

      if (status === "qrReadSuccess") {
        log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
      }

      if (status === "qrReadFail" || status === "qrCodeSessionInvalid") {
        sessions[nome].qrStatus = "expired";
        log(`QR da sessão "${nome}" expirou ou inválido`);
      }
    } catch (err) {
      log(`❌ Erro monitorando status: ${err.message}`);
      cleanupSession(nome);
    }
  });
}

// Endpoint principal
async function handleQRCode(req, res) {
  const nome = req.params.nome?.replace(".png",""); // remove .png se enviado
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Operação em andamento" });
  locks[nome] = true;

  try {
    // Se sessão existe
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

    // Criar nova sessão
    log(`Iniciando criação da sessão "${nome}"...`);

    const client = await wppconnect.create({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
      },
    });

    sessions[nome] = { client, qrBase64: null, qrStatus: "pending", timeout: null };

    // Primeiro QR
    const qrCode = await client.getQrCode();
    sessions[nome].qrBase64 = qrCode;
    sessions[nome].qrStatus = "valid";

    // Responde com QR
    res.json({ success: true, message: "QR Code gerado com sucesso", base64: qrCode });

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
