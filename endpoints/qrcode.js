// endpoints/qrcode.js
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Sessões ativas e locks
let sessions = {};
let locks = {};

// Função de log com prefixo
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

// Limpa e fecha sessão
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
  // Remove listeners antigos para garantir que monitore apenas o QR atual
  client.removeAllListeners("stateChange");

  client.onStateChange(async (status) => {
    log(`Status da sessão "${nome}": ${status}`);
    try {
      if (status === "CONNECTED" || status === "isLogged") {
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

// Função para criar/atualizar timeout de 5 minutos de QR não conectado
function setupQrTimeout(nome) {
  if (sessions[nome]?.timeout) clearTimeout(sessions[nome].timeout);
  sessions[nome].timeout = setTimeout(() => {
    log(`❌ Tempo expirado para QR não conectado da sessão "${nome}"`);
    cleanupSession(nome);
  }, 5 * 60 * 1000); // 5 minutos
}

// Endpoint principal para gerar/obter QRCode
async function handleQRCode(req, res) {
  // Remove ".png" do nome da sessão se existir
  const nome = req.params.nome?.replace(".png", "");
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  // Evita concorrência em operações simultâneas na mesma sessão
  if (locks[nome]) return res.json({ success: false, error: "Operação em andamento" });
  locks[nome] = true;

  try {
    // ====================================================
    // Caso a sessão já exista
    // ====================================================
    if (sessions[nome]) {
      const sess = sessions[nome];

      // QR ainda válido: retorna apenas mensagem, não base64
      if (sess.qrStatus === "valid" && sess.qrBase64) {
        locks[nome] = false;
        return res.json({ success: true, message: "QR ainda válido" });
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

        setupQrTimeout(nome); // Atualiza timeout para novo QR
        startMonitor(nome, sess.client); // Atualiza monitoramento para QR atual

        locks[nome] = false;
        return res.json({ success: true, message: "Novo QR gerado", base64: newQR });
      }
    }

    // ====================================================
    // Caso a sessão não exista: criar nova instância
    // ====================================================
    log(`[${nome}] 🔹 Criando nova instância...`);

    const qrCodePromise = new Promise((resolve, reject) => {
      wppconnect
        .create({
          session: nome,
          puppeteerOptions: {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          },
          // Callback que retorna o base64 do QR
          catchQR: (base64Qr) => {
            try {
              log(`[${nome}] 🔹 QRCode gerado (base64)`);
              resolve(base64Qr); // Retorna base64 direto ao cliente
            } catch (err) {
              reject(err);
            }
          },
        })
        .then((client) => {
          // Salva client e inicia monitoramento
          sessions[nome] = { client, qrBase64: null, qrStatus: "pending", timeout: null };
          startMonitor(nome, client);
          setupQrTimeout(nome); // Timeout de 5 minutos para QR não conectado
        })
        .catch((err) => {
          log(`❌ Erro criando instância WPPConnect: ${err.message}`);
          cleanupSession(nome);
          if (!res.headersSent) res.json({ success: false, error: err.message });
        });
    });

    // Aguarda o QR ser gerado
    const base64Qr = await qrCodePromise;
    sessions[nome].qrBase64 = base64Qr;
    sessions[nome].qrStatus = "valid";

    // Retorna QRCode diretamente ao cliente
    if (!res.headersSent) res.json({ success: true, message: "QR Code gerado com sucesso", base64: base64Qr });

    locks[nome] = false;
  } catch (err) {
    log(`❌ Erro ao gerar QR: ${err.message}`);
    cleanupSession(nome);
    locks[nome] = false;
    if (!res.headersSent) res.json({ success: false, error: err.message });
  }
}

module.exports = handleQRCode;

