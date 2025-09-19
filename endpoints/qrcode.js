const fs = require("fs");
const path = require("path");
const { createClient } = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer"); // Função auxiliar p/ enviar dados ao PHP

// Armazena sessões ativas
let sessions = {};
// Controle de lock para evitar duas operações concorrentes na mesma sessão
let locks = {};

// Função para logar com prefixo
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

// Função de monitoramento de status (reutilizável)
function startMonitor(nome, client) {
  client.onStateChange(async (status) => {
    log(`Status da sessão "${nome}": ${status}`);
    try {
      if (status === "isLogged" || status === "CONNECTED") {
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
        log(`QR da sessão "${nome}" expirou ou inválido`);
      }
    } catch (err) {
      log(`❌ Erro monitorando status: ${err.message}`);
      cleanupSession(nome);
    }
  });
}

async function handleQRCode(req, res) {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) {
    return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  }
  locks[nome] = true;

  try {
    // ============================================================
    // CASO A SESSÃO JÁ EXISTA
    // ============================================================
    if (sessions[nome]) {
      const sess = sessions[nome];

      if (sess.qrStatus === "valid" && sess.qrBase64) {
        locks[nome] = false;
        return res.json({ success: true, message: "QR Code atual ainda válido", base64: sess.qrBase64 });
      }

      if (sess.qrStatus === "connected") {
        locks[nome] = false;
        return res.json({ success: true, message: "Esta sessão já está conectada" });
      }

      if (sess.qrStatus === "expired") {
        log(`Gerando novo QR para sessão "${nome}"...`);

        // Pega um novo QR sem recriar client
        const newQR = await sess.client.getQrCode();
        sess.qrBase64 = newQR;
        sess.qrStatus = "valid";

        // Reinicia o timeout de 5 minutos
        if (sess.timeout) clearTimeout(sess.timeout);
        sess.timeout = setTimeout(() => {
          log(`Tempo expirado para sessão "${nome}" sem conectar (QR renovado). Limpando...`);
          cleanupSession(nome);
        }, 5 * 60 * 1000);

        // 🔄 Reativar monitorização de status para esse QR
        startMonitor(nome, sess.client);

        locks[nome] = false;
        return res.json({ success: true, message: "Novo QR Code gerado e monitorando novamente", base64: newQR });
      }
    }

    // ============================================================
    // CASO A SESSÃO NÃO EXISTA (CRIAR NOVA)
    // ============================================================
    log(`Iniciando criação da sessão "${nome}"...`);

    const client = await createClient({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });

    // Cria referência inicial da sessão
    sessions[nome] = { client, qrBase64: null, qrStatus: "pending", timeout: null };

    // 1️⃣ Obter primeiro QR imediatamente
    const qrCode = await client.getQrCode();
    sessions[nome].qrBase64 = qrCode;
    sessions[nome].qrStatus = "valid";

    // 2️⃣ Responder ao cliente imediatamente com o QR
    res.json({ success: true, message: "QR Code gerado com sucesso", base64: qrCode });

    // 3️⃣ Iniciar monitoramento do status
    startMonitor(nome, client);

    // 4️⃣ Iniciar timeout de 5 minutos
    sessions[nome].timeout = setTimeout(() => {
      log(`Tempo expirado para sessão "${nome}" sem conectar. Limpando...`);
      cleanupSession(nome);
    }, 5 * 60 * 1000);

    locks[nome] = false;
  } catch (err) {
    log(`❌ Erro ao gerar QR: ${err.message}`);
    cleanupSession(nome);
    return res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;
