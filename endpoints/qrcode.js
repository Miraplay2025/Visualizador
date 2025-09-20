// qrcode.js
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Controle de sessões
const sessions = {}; // { nome: { client, qrCount, inProgress } }

// Função para enviar QR para o servidor PHP
async function enviarQrParaServidor(nome, base64) {
  try {
    await acessarServidor("salvar_qrcod.php", {
      method: "POST",
      data: { nome, base64 },
    });
    console.log(`[${nome}] ✅ QR enviado para servidor`);
  } catch (err) {
    console.error(`[${nome}] ❌ Erro ao enviar QR:`, err.message);
  }
}

module.exports = async function qrcodeHandler(req, res) {
  const nome = req.params?.nome || req.body?.nome;
  if (!nome) {
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  if (sessions[nome]?.inProgress) {
    return res.json({ success: false, error: "Sessão já em andamento" });
  }

  console.log(`[${nome}] 🚀 Iniciando processo de geração de QR Code`);
  sessions[nome] = { inProgress: true, qrCount: 0, client: null };

  try {
    const client = await wppconnect.create({
      session: nome,
      autoClose: 0, // nunca fecha sozinho
      disableWelcome: true,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },

      // ⚡ Força o QR aparecer
      qrTimeout: 0,
      qrLogSkip: false,
      logQR: false,

      catchQR: async (base64QR, asciiQR, attempt, urlCode) => {
        sessions[nome].qrCount++;
        console.log(`[${nome}] 📲 QR capturado (tentativa ${sessions[nome].qrCount})`);

        // Envia QR ao servidor PHP
        await enviarQrParaServidor(nome, base64QR);

        // Retorna no 1º QR para o HTML
        if (sessions[nome].qrCount === 1 && !res.headersSent) {
          res.json({
            success: true,
            message: "QR gerado",
            caminho: `qrcod/${nome}.png`,
          });
        }

        // Se passar de 6 tentativas, encerra
        if (sessions[nome].qrCount >= 6) {
          console.warn(`[${nome}] ❌ Limite de 6 QRs atingido, encerrando sessão`);
          try { await client.close(); } catch {}
          sessions[nome] = { inProgress: false, client: null };
        }
      },

      statusFind: async (statusSession) => {
        console.log(`[${nome}] 📡 Status: ${statusSession}`);

        if (statusSession === "CONNECTED" || statusSession === "isLogged") {
          console.log(`[${nome}] ✅ Sessão conectada`);

          try {
            const tokens = await client.getSessionTokenBrowser();
            await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
            });

            if (!res.headersSent) {
              res.json({ success: true, message: "Sessão conectada", dados: tokens });
            }
          } catch (err) {
            console.error(`[${nome}] ❌ Erro ao salvar sessão:`, err.message);
            if (!res.headersSent) {
              res.json({ success: false, error: "Erro ao salvar sessão" });
            }
          } finally {
            try { await client.close(); } catch {}
            sessions[nome] = { inProgress: false, client: null };
          }
        }
      },
    });

    sessions[nome].client = client;

  } catch (err) {
    console.error(`[${nome}] ❌ Erro ao criar sessão:`, err.message);
    sessions[nome] = { inProgress: false, client: null };
    if (!res.headersSent) {
      res.json({ success: false, error: "Falha ao criar sessão" });
    }
  }
};
