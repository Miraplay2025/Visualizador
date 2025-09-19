// qrcode.js
const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

// Armazena sessões ativas e status do QR Code
const sessions = {}; // { nome: { inProgress: bool, qrStatus: "pending/connected", client, qrCount } }

// Função para enviar QR para o servidor PHP
async function enviarQrParaServidor(nome, base64) {
  try {
    const resposta = await acessarServidor("salvar_qrcod.php", {
      method: "POST",
      data: { nome, base64 },
    });
    console.log(`[${nome}] QR enviado para servidor:`, resposta);
    return resposta;
  } catch (err) {
    console.error(`[${nome}] [enviarQrParaServidor] Erro ao enviar QR:`, err);
    return { success: false, error: "Erro ao enviar QR para o servidor" };
  }
}

// Handler principal da rota QR Code
module.exports = async function qrcodeHandler(req, res) {
  const nome = req.params?.nome || req.body?.nome;

  if (!nome) {
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  if (sessions[nome]?.inProgress) {
    return res.json({
      success: false,
      error: "Há um processo ainda em andamento para essa sessão",
    });
  }

  sessions[nome] = sessions[nome] || {};
  sessions[nome].inProgress = true;
  sessions[nome].qrStatus = "pending";
  sessions[nome].qrCount = 0;

  console.log(`[${nome}] Iniciando processo de geração de QR Code`);

  if (sessions[nome].client) {
    try { await sessions[nome].client.close(); } catch (err) {}
  }

  try {
    const client = await wppconnect.create({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
      autoClose: 0, // ⚠️ impede fechamento automático
      catchQR: async (base64QR, asciiQR, attempt, urlCode) => {
        sessions[nome].qrCount++;
        console.log(`[${nome}] QR Code gerado (tentativa ${sessions[nome].qrCount})`);

        // Envia QR para o servidor sempre que for gerado
        await enviarQrParaServidor(nome, base64QR);

        // Limite de 6 tentativas
        if (sessions[nome].qrCount >= 6) {
          console.warn(`[${nome}] Limite de 6 QR atingido, encerrando sessão`);
          try { await client.close(); } catch (err) {}
          sessions[nome].inProgress = false;
          sessions[nome].client = null;
          if (!res.headersSent) {
            res.json({ success: false, error: "Sessão excluída após 6 QR Code" });
          }
        }
      },
      statusFind: async (statusSession) => {
        console.log(`[${nome}] Status da sessão:`, statusSession);

        if (statusSession === "CONNECTED" || statusSession === "isLogged") {
          console.log(`[${nome}] Sessão conectada com sucesso`);
          sessions[nome].qrStatus = "connected";

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
            console.error(`[${nome}] Erro ao atualizar sessão no servidor:`, err);
            if (!res.headersSent) {
              res.json({ success: false, error: "Erro ao atualizar sessão" });
            }
          } finally {
            try { await client.close(); } catch (err) {}
            sessions[nome].inProgress = false;
            sessions[nome].client = null;
          }
        }
      },
    });

    sessions[nome].client = client;

  } catch (err) {
    console.error(`[${nome}] Erro ao criar sessão WPPConnect:`, err);
    sessions[nome].inProgress = false;
    sessions[nome].client = null;
    if (!res.headersSent) {
      res.json({ success: false, error: "Erro interno ao criar sessão" });
    }
  }
};
