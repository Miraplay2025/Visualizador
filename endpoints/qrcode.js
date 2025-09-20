//// qrcode.js
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Controle de sessões
const sessions = {}; // { nome: { client, qrCount, inProgress } }

// Função para enviar QR para o servidor PHP
async function enviarQrParaServidor(nome, base64) {
  try {
    const resposta = await acessarServidor("salvar_qrcod.php", {
      method: "POST",
      data: { nome, base64 },
    });
    console.log(`[${nome}] ✅ QR enviado para servidor`);
    return resposta;
  } catch (err) {
    console.error(`[${nome}] ❌ Erro ao enviar QR para servidor:`, err);
    return null;
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
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },

      // ⚡ Opções necessárias para que catchQR dispare
      qrTimeout: 0,      // nunca expira
      qrLogSkip: false,  // não pula logs
      logQR: true,       // mostra QR em ascii

      catchQR: async (base64QR, asciiQR, attempt, urlCode) => {
        sessions[nome].qrCount++;
        console.log(
          `[${nome}] 📲 QR capturado (tentativa ${sessions[nome].qrCount})`
        );

        // Envia QR ao PHP
        await enviarQrParaServidor(nome, base64QR);

        // Responde ao HTML no primeiro QR
        if (sessions[nome].qrCount === 1 && !res.headersSent) {
          res.json({ success: true, message: "QR gerado", caminho: `qrcod/${nome}.png` });
        }

        // Fecha após 6 QRs
        if (sessions[nome].qrCount >= 6) {
          console.warn(`[${nome}] ❌ Limite de 6 QRs atingido, encerrando sessão`);
          try { await client.close(); } catch {}
          sessions[nome] = { inProgress: false, client: null };
        }
      },

      statusFind: async (statusSession) => {
        console.log(`[${nome}] 📡 Status: ${statusSession}`);

        if (statusSession === "CONNECTED" || statusSession === "isLogged") {
          console.log(`[${nome}] ✅ Sessão conectada com sucesso`);

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
            console.error(`[${nome}] ❌ Erro ao salvar sessão:`, err);
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
    console.error(`[${nome}] ❌ Erro ao criar sessão:`, err);
    sessions[nome] = { inProgress: false, client: null };
    if (!res.headersSent) {
      res.json({ success: false, error: "Falha ao criar sessão" });
    }
  }
};
