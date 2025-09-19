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
    return resposta; // Retorna o JSON recebido do PHP
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

  // Bloqueia requisições simultâneas para a mesma sessão
  if (sessions[nome]?.inProgress) {
    return res.json({
      success: false,
      error: "Há um processo ainda em andamento para essa sessão",
    });
  }

  // Inicializa a sessão na memória
  sessions[nome] = sessions[nome] || {};
  sessions[nome].inProgress = true;
  sessions[nome].qrStatus = "pending";
  sessions[nome].qrCount = 0;

  console.log(`[${nome}] Iniciando processo de geração de QR Code`);

  // Fecha sessão antiga se existir
  if (sessions[nome].client) {
    try {
      await sessions[nome].client.close();
      console.log(`[${nome}] Sessão antiga fechada com sucesso`);
    } catch (err) {
      console.warn(`[${nome}] Falha ao fechar sessão antiga:`, err.message);
    }
  }

  try {
    // Criação da nova sessão WPPConnect
    const client = await wppconnect.create({
      session: nome,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
      catchQR: async (base64QR, asciiQR, attempt, urlCode) => {
        // Atualiza contador de QR
        sessions[nome].qrCount++;

        console.log(
          `[${nome}] QR Code gerado (tentativa ${sessions[nome].qrCount})`
        );

        // Envia QR para o servidor
        const resposta = await enviarQrParaServidor(nome, base64QR);
        console.log(`[${nome}] Resposta do servidor ao enviar QR:`, resposta);

        // Se passou do limite de 6 tentativas
        if (sessions[nome].qrCount >= 6) {
          console.warn(
            `[${nome}] Limite de 6 atualizações de QR atingido, encerrando sessão`
          );
          try {
            await client.close();
          } catch (err) {}
          sessions[nome].inProgress = false;
          sessions[nome].client = null;
          return res.json({
            success: false,
            error: "Sessão excluída após 6 atualizações do QR Code",
          });
        }
      },
      statusFind: async (statusSession, session) => {
        console.log(`[${nome}] Status da sessão:`, statusSession);

        if (statusSession === "CONNECTED" || statusSession === "isLogged") {
          console.log(`[${nome}] Sessão conectada com sucesso`);

          sessions[nome].qrStatus = "connected";

          // Obtém tokens e envia para atualizar sessão no servidor
          try {
            const tokens = await client.getSessionTokenBrowser();
            const resposta = await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
            });

            console.log(`[${nome}] Resposta do servidor ao atualizar sessão:`, resposta);

            // Envia sucesso ao HTML
            res.json({
              success: true,
              message: "Sessão de WhatsApp conectada com sucesso",
              dados: tokens,
            });
          } catch (err) {
            console.error(`[${nome}] Erro ao enviar tokens para o servidor:`, err);
            res.json({
              success: false,
              error: "Erro ao atualizar sessão no servidor",
            });
          } finally {
            // Fecha sessão e libera memória
            try {
              await client.close();
            } catch (err) {}
            sessions[nome].inProgress = false;
            sessions[nome].client = null;
            console.log(`[${nome}] Sessão finalizada após conexão`);
          }
        }
      },
    });

    // Salva client na memória
    sessions[nome].client = client;
  } catch (err) {
    console.error(`[${nome}] Erro ao criar sessão WPPConnect:`, err);
    sessions[nome].inProgress = false;
    sessions[nome].client = null;
    return res.json({ success: false, error: "Erro interno ao criar sessão" });
  }
};
