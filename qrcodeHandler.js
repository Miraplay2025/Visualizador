const fs = require("fs");
const path = require("path");
const { createClient } = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("./utils/puppeteer");

// Sessões temporárias e travas
let sessions = {};
let locks = {};

function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

async function handleQRCode(req, res) {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  locks[nome] = true;

  const sessionDir = path.join(__dirname, "qrcodes");
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);
  const qrPath = path.join(sessionDir, `${nome}.png`);

  try {
    // 1️⃣ Verifica se a sessão existe no servidor
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    if (!resposta.success || !resposta.sessoes.some(s => s.nome === nome)) {
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 2️⃣ Se já existe sessão temporária
    if (sessions[nome] && sessions[nome].client) {
      const state = await sessions[nome].client.getConnectionState();
      if (state === "CONNECTED") return res.json({ success: true, message: "Sessão já conectada" });
      if (sessions[nome].qrStatus === "valid") return res.json({ success: true, message: "QR code atual ainda válido", qrUrl: `/qrcodes/${nome}.png` });
      if (sessions[nome].qrStatus === "expired") {
        if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
        delete sessions[nome];
      }
    }

    // 3️⃣ Criar nova sessão temporária
    sessions[nome] = { client: null, qrPath, qrStatus: "pending" };

    const client = await createClient({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox","--disable-setuid-sandbox","--disable-setuid-sandbox"]
      },

      // Callback para gerar QR code
      catchQR: async (base64Qr) => {
        try {
          const qrBuffer = Buffer.from(base64Qr.replace("data:image/png;base64,", ""), "base64");
          fs.writeFileSync(qrPath, qrBuffer);
          sessions[nome].qrStatus = "valid";

          log(`QR code gerado para sessão "${nome}"`);
          res.json({ success: true, message: "QR code gerado", qrUrl: `/qrcodes/${nome}.png` });
        } catch (err) {
          log(`❌ Erro ao salvar QR: ${err.message}`);
          res.json({ success: false, error: "Falha ao gerar QR" });
          cleanupSession(nome, qrPath);
        }
      },

      // Callback para monitorar status
      statusFind: async (statusSession) => {
        log(`Status da sessão "${nome}" => ${statusSession}`);
        try {
          if (statusSession === "isLogged" || statusSession === "CONNECTED") {
            const tokens = await client.getSessionTokenBrowser();
            
            // Atualiza sessão no servidor
            const updateResp = await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
            });

            // Retorna resposta final ao HTML
            log(`Sessão "${nome}" conectada. updateResp => ${JSON.stringify(updateResp)}`);
            if (updateResp.success) {
              // Remove sessão temporária e QR code APÓS enviar a resposta
              cleanupSession(nome, qrPath);
            }
          }

          if (statusSession === "qrReadSuccess") log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
          if (statusSession === "qrReadFail" || statusSession === "qrCodeSessionInvalid") {
            sessions[nome].qrStatus = "expired";
            log(`QR da sessão "${nome}" expirou ou inválido`);
          }
        } catch (err) {
          log(`❌ Erro monitorando status: ${err.message}`);
          cleanupSession(nome, qrPath);
        }
      }
    });

    sessions[nome].client = client;

  } catch (err) {
    log(`❌ Erro geral: ${err.message}`);
    res.json({ success: false, error: err.message });
    cleanupSession(nome, qrPath);
  } finally {
    delete locks[nome];
  }
}

// Função para remover sessão temporária e QR code
function cleanupSession(nome, qrPath) {
  if (sessions[nome]) {
    try { if(sessions[nome].client) sessions[nome].client.close(); } catch {}
    delete sessions[nome];
  }
  if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
  log(`Sessão temporária "${nome}" removida`);
}

module.exports = { handleQRCode };
