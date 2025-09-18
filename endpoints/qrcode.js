const fs = require("fs");
const path = require("path");
const { createClient } = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("./utils/puppeteer");

let sessions = {};
let locks = {};

function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [QR] ${msg}`);
}

async function cleanupSession(nome) {
  if (sessions[nome]) {
    try {
      if (sessions[nome].client) {
        await sessions[nome].client.close();
        log(`WppConnect fechado para sessão "${nome}"`);
      }
    } catch (err) {
      log(`Erro ao fechar cliente da sessão "${nome}": ${err.message}`);
    }
    if (sessions[nome].expireTimer) clearTimeout(sessions[nome].expireTimer);
    delete sessions[nome];
    log(`Sessão "${nome}" removida da memória`);
  }
}

function startQrExpirationTimer(nome) {
  if (!sessions[nome]) return;
  if (sessions[nome].expireTimer) clearTimeout(sessions[nome].expireTimer);

  sessions[nome].expireTimer = setTimeout(async () => {
    if (
      sessions[nome] &&
      sessions[nome].qrStatus === "valid" &&
      Date.now() - sessions[nome].qrGeneratedAt >= 5 * 60 * 1000
    ) {
      log(`⏳ QR da sessão "${nome}" expirou após 5 minutos. Encerrando sessão...`);
      await cleanupSession(nome);
    }
  }, 5 * 60 * 1000 + 1000);
}

// ------------------- MAIN HANDLER -------------------

async function handleQRCode(req, res) {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  locks[nome] = true;

  try {
    // Verificar se sessão existe no servidor PHP
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    if (!resposta.success || !resposta.sessoes.some(s => s.nome === nome)) {
      delete locks[nome];
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // Se já existe cliente em memória
    if (sessions[nome] && sessions[nome].client) {
      const state = await sessions[nome].client.getConnectionState();
      if (state === "CONNECTED") {
        delete locks[nome];
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      if (sessions[nome].qrStatus === "valid") {
        delete locks[nome];
        return res.json({ success: true, message: "QR code atual ainda válido" });
      }

      if (sessions[nome].qrStatus === "expired") {
        log(`♻️ Gerando novo QR para sessão existente "${nome}"...`);
        try {
          const base64Qr = await sessions[nome].client.getQrCode();
          const resp = await acessarServidor("Imagem_qrcode.php", {
            method: "POST",
            data: { nome, qrcode: base64Qr },
          });

          if (resp.success && resp.url) {
            sessions[nome].qrStatus = "valid";
            sessions[nome].qrGeneratedAt = Date.now();
            startQrExpirationTimer(nome);
            log(`✅ Novo QR salvo: ${resp.url}`);

            delete locks[nome];
            res.json({
              success: true,
              message: "Novo QR code gerado com sucesso",
              qrUrl: resp.url,
            });
          } else {
            throw new Error(resp.error || "Erro ao salvar novo QR");
          }
        } catch (err) {
          log(`❌ Erro ao gerar novo QR: ${err.message}`);
          delete locks[nome];
          return res.json({ success: false, error: "Erro ao gerar novo QR" });
        }
      }
    } else {
      // Criar nova sessão temporária
      log(`Iniciando criação da sessão "${nome}"...`);

      const client = await createClient({
        session: nome,
        puppeteerOptions: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        },

        // Callback para gerar QR code
        catchQR: async (base64Qr) => {
          try {
            log(`QR gerado para sessão "${nome}"`);

            const resp = await acessarServidor("Imagem_qrcode.php", {
              method: "POST",
              data: { nome, qrcode: base64Qr },
            });

            if (resp.success && resp.url) {
              sessions[nome].qrStatus = "valid";
              sessions[nome].qrGeneratedAt = Date.now();
              startQrExpirationTimer(nome);
              log(`✅ QR salvo em: ${resp.url}`);

              res.json({
                success: true,
                message: "QR code gerado com sucesso",
                qrUrl: resp.url,
              });
            } else {
              throw new Error(resp.error || "Erro salvando QR no servidor PHP");
            }
          } catch (err) {
            log(`❌ Erro ao salvar QR: ${err.message}`);
            sessions[nome].qrStatus = "expired";
            res.json({ success: false, error: "Erro ao salvar QR code" });
          }
        },

        // Callback de status da sessão
        statusFind: async (statusSession) => {
          log(`Status da sessão "${nome}" => ${statusSession}`);
          try {
            if (statusSession === "isLogged" || statusSession === "CONNECTED") {
              const tokens = await client.getSessionTokenBrowser();

              const updateResp = await acessarServidor("atualizar_sessao.php", {
                method: "POST",
                data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
              });

              log(`Sessão "${nome}" conectada. updateResp => ${JSON.stringify(updateResp)}`);
              if (updateResp.success) {
                await cleanupSession(nome);
              }
            }

            if (statusSession === "qrReadSuccess") {
              log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
            }

            if (statusSession === "qrReadFail" || statusSession === "qrCodeSessionInvalid") {
              sessions[nome].qrStatus = "expired";
              log(`QR da sessão "${nome}" expirou ou inválido`);
            }
          } catch (err) {
            log(`❌ Erro monitorando status: ${err.message}`);
            await cleanupSession(nome);
          }
        },
      });

      sessions[nome] = { client, qrStatus: "pending", qrGeneratedAt: null, expireTimer: null };
    }
  } catch (err) {
    log(`❌ Erro geral: ${err.message}`);
    res.json({ success: false, error: err.message });
    await cleanupSession(nome);
  } finally {
    delete locks[nome];
  }
}

module.exports = { handleQRCode };
