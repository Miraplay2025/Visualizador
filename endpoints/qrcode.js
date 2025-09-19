// qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Sessões e locks independentes
const sessions = {};
const locks = {};

// Função de log padronizada
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

// Limpa e fecha sessão
function cleanupSession(nome) {
  if (sessions[nome]) {
    try { sessions[nome].client?.close(); } catch {}
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

// Função para gerar QR com tentativas e reinício
async function generateQr(nome) {
  let attempts = 0;

  while (attempts < 6) {
    attempts++;
    cleanupSession(nome); // Remove sessão anterior
    log(`🔹 Criando nova instância (tentativa ${attempts}) para sessão "${nome}"...`);

    try {
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

      sessions[nome].client = client;

      startMonitor(nome, client);
      setupQrTimeout(nome);

      // Espera QR estar pronto ou conectar
      let waited = 0;
      while (!sessions[nome].qrBase64 && waited < 15) {
        await new Promise(r => setTimeout(r, 1000));
        waited++;
      }

      // Se QR expirou antes de usar, tenta novamente
      if (sessions[nome].qrStatus === "expired") {
        log(`QR expirado na tentativa ${attempts}, regenerando...`);
        continue;
      }

      // Se QR válido, retorna base64
      if (sessions[nome].qrBase64) {
        log(`QR Code pronto para sessão "${nome}"`);
        return sessions[nome].qrBase64;
      }

    } catch (err) {
      log(`❌ Erro na tentativa ${attempts}: ${err.message}`);
      cleanupSession(nome);
    }
  }

  // Se após 6 tentativas não conectar
  log(`❌ Falha ao gerar QR após 6 tentativas para sessão "${nome}"`);
  cleanupSession(nome);
  throw new Error("Não foi possível gerar QR após 6 tentativas");
}

// Endpoint principal
async function handleQRCode(req, res) {
  const nome = req.params.nome?.replace(".png", "");
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Operação em andamento" });
  locks[nome] = true;

  log(`➡️ Requisição QR iniciada para sessão "${nome}"`);

  try {
    const qrBase64 = await generateQr(nome);
    locks[nome] = false;
    return res.json({ success: true, message: "QR Code gerado", base64: qrBase64 });
  } catch (err) {
    locks[nome] = false;
    return res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;
