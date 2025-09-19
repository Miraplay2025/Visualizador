// qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Sessões e locks
const sessions = {};
const locks = {};

// Cores no console
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

// Função de log padronizada
function log(msg, type = "info") {
  let color = colors.reset;
  if (type === "success") color = colors.green;
  if (type === "warn") color = colors.yellow;
  if (type === "error") color = colors.red;
  console.log(`${color}[${new Date().toISOString()}] 🔹 [QR] ${msg}${colors.reset}`);
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
  log(`Sessão "${nome}" removida/limpa`, "warn");
}

// Monitoramento de status da sessão
function startMonitor(nome, client) {
  client.removeAllListeners("stateChange");

  client.onStateChange(async (status) => {
    log(`Status da sessão "${nome}": ${status}`);
    try {
      if (status === "CONNECTED" || status === "isLogged") {
        sessions[nome].qrStatus = "connected";

        const tokens = await client.getSessionTokenBrowser();
        const resposta = await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });

        if (!resposta?.success) {
          throw new Error("Servidor não respondeu corretamente ao atualizar sessão");
        }

        log(`Sessão "${nome}" conectada com sucesso`, "success");
      }

      if (status === "qrReadSuccess") {
        log(`QR da sessão "${nome}" escaneado, aguardando conexão...`, "warn");
      }

      if (status === "qrReadFail" || status === "qrCodeSessionInvalid") {
        sessions[nome].qrStatus = "expired";
        log(`QR da sessão "${nome}" expirou/é inválido`, "error");
        regenerateQr(nome);
      }
    } catch (err) {
      log(`❌ Erro monitorando status: ${err.message}`, "error");
      cleanupSession(nome);
    }
  });
}

// Timeout de 5 minutos apenas se não gerar QR ou não houver resposta do servidor
function setupQrTimeout(nome) {
  if (sessions[nome]?.timeout) clearTimeout(sessions[nome].timeout);
  sessions[nome].timeout = setTimeout(() => {
    if (!sessions[nome]?.qrBase64 || sessions[nome]?.erroServidor) {
      log(`❌ Sessão "${nome}" será encerrada: QR não gerado ou sem resposta do servidor`, "error");
      cleanupSession(nome);
    }
  }, 5 * 60 * 1000);
}

// Envia QR para PHP e retorna resposta
async function enviarQrParaServidor(nome, base64) {
  try {
    const resposta = await acessarServidor("salvar_qrcod.php", {
      method: "POST",
      data: { nome, base64 },
    });

    if (!resposta?.success) {
      sessions[nome].erroServidor = true;
      throw new Error("Servidor não respondeu corretamente ao salvar QR");
    }

    log(`Servidor respondeu para sessão "${nome}": ${JSON.stringify(resposta)}`, "success");
    return resposta;
  } catch (err) {
    log(`❌ Erro ao enviar QR ao servidor: ${err.message}`, "error");
    sessions[nome].erroServidor = true;
    return { success: false, error: "Falha ao enviar QR ao servidor" };
  }
}

// Função para regenerar QR se expirar
async function regenerateQr(nome) {
  if (!sessions[nome]) return;
  const maxUpdates = 6;
  sessions[nome].updates = (sessions[nome].updates || 0) + 1;

  if (sessions[nome].updates > maxUpdates) {
    log(`❌ Sessão "${nome}" não conectada após ${maxUpdates} QRs. Será excluída.`, "error");
    cleanupSession(nome);
    sessions[nome] = { excluida: true }; // marca para retorno
    return;
  }

  log(`🔄 Gerando novo QR para sessão "${nome}" (tentativa ${sessions[nome].updates})...`, "warn");

  const qrBase64 = sessions[nome].qrBase64;
  if (qrBase64) {
    await enviarQrParaServidor(nome, qrBase64);
  }
}

// Função para gerar QR inicial
async function generateQr(nome) {
  cleanupSession(nome); // remove sessão anterior, se houver
  log(`🔹 Criando nova instância para sessão "${nome}"...`);

  const client = await wppconnect.create({
    session: nome,
    puppeteerOptions: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      userDataDir: `/app/tokens/${nome}-${Date.now()}`,
    },
    autoClose: 0,
    catchQR: async (base64Qr) => {
      sessions[nome] = {
        client,
        qrBase64: base64Qr,
        qrStatus: "valid",
        updates: 0,
        erroServidor: false,
      };
      log(`QR inicial gerado para sessão "${nome}"`, "success");
      await enviarQrParaServidor(nome, base64Qr);
    },
  });

  if (!sessions[nome]) sessions[nome] = {};
  sessions[nome].client = client;

  startMonitor(nome, client);
  setupQrTimeout(nome);

  return new Promise((resolve, reject) => {
    let waited = 0;
    const checkInterval = setInterval(() => {
      if (sessions[nome]?.excluida) {
        clearInterval(checkInterval);
        reject(new Error("Sessão excluída após 6 tentativas"));
      }
      if (sessions[nome]?.qrBase64) {
        clearInterval(checkInterval);
        resolve(sessions[nome].qrBase64);
      }
      if (waited++ > 15) {
        clearInterval(checkInterval);
        reject(new Error("QR não gerado em tempo hábil"));
      }
    }, 1000);
  });
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

    // Se foi excluída após 6 tentativas
    if (sessions[nome]?.excluida) {
      return res.json({ success: false, error: "Sessão excluída após 6 tentativas" });
    }

    // Envia QR ao servidor e retorna resposta do servidor ao HTML
    const respostaServidor = await enviarQrParaServidor(nome, qrBase64);
    if (!respostaServidor?.success) throw new Error("Servidor não respondeu ao salvar QR");

    return res.json(respostaServidor);
  } catch (err) {
    locks[nome] = false;
    cleanupSession(nome);
    return res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;
