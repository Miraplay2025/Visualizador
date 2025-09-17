// wppconnect/qrcode.js
/**
 * Gerador e monitor de QR Code para sessões WPPConnect
 * - Gera QR novo caso não exista ou esteja expirado
 * - Monitora status até conectar
 * - Envia tokens ao servidor PHP atualizar_sessao.php
 * - Limpa tudo após finalizar (sucesso ou erro)
 */

const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");

const QR_PATH = path.join(__dirname, "qrcodes");
if (!fs.existsSync(QR_PATH)) fs.mkdirSync(QR_PATH, { recursive: true });

// Lock de sessões em andamento
const sessionLocks = new Map();

/**
 * Função para gerar QR Code de uma sessão
 * @param {string} sessionName
 */
async function gerarqrcode(sessionName) {
  if (sessionLocks.get(sessionName)) {
    return { success: false, error: "Já existe uma requisição em andamento para essa sessão" };
  }
  sessionLocks.set(sessionName, true);

  let client;
  const qrFile = path.join(QR_PATH, `${sessionName}.png`);

  try {
    // 🔎 Verifica se já existe instância
    const existingSessions = await wppconnect.listSessions();
    const existing = existingSessions.find(s => s.session === sessionName);

    if (existing) {
      console.log(`[${new Date().toISOString()}] Sessão ${sessionName} já existe`);

      client = await wppconnect.getSession(sessionName);

      if (client) {
        const status = await client.getStatus();

        if (status.connected) {
          sessionLocks.delete(sessionName);
          return { success: true, message: "Essa sessão já está conectada" };
        }

        // QR expirado ou inexistente → gerar novo
        if (!status.qr || status.qr === "" || status.qrExpired) {
          if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
          return await gerarNovoQr(client, sessionName, qrFile);
        }

        // QR válido → retornar link
        sessionLocks.delete(sessionName);
        return { success: true, message: "QR code atual ainda válido", link: `/wppconnect/qrcodes/${sessionName}.png` };
      }
    }

    // 🆕 Não existe instância → criar
    client = await wppconnect.create({
      session: sessionName,
      headless: true,
      autoClose: 0,
      browserArgs: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      puppeteerOptions: { headless: true },
      qrCodeData: false,
    });

    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    return await gerarNovoQr(client, sessionName, qrFile);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Erro gerarqrcode:`, err.message);
    await limparSessao(client, qrFile, sessionName);
    sessionLocks.delete(sessionName);
    return { success: false, error: err.message };
  }
}

/**
 * Função auxiliar para gerar novo QR e monitorar conexão
 */
async function gerarNovoQr(client, sessionName, qrFile) {
  try {
    const qrCodeBase64 = await new Promise((resolve, reject) => {
      let resolved = false;

      client.onQRCode((base64Qr) => {
        if (!resolved) {
          resolved = true;
          resolve(base64Qr);
        }
      });

      setTimeout(() => {
        if (!resolved) reject(new Error("Tempo esgotado para geração do QR code"));
      }, 30000);
    });

    // Salva QR como PNG
    const qrBuffer = Buffer.from(qrCodeBase64, "base64");
    fs.writeFileSync(qrFile, qrBuffer);
    console.log(`QR code salvo em: ${qrFile}`);

    // Monitora até conectar
    client.onReady(async () => {
      console.log(`[${new Date().toISOString()}] Sessão conectada: ${sessionName}`);

      try {
        const sessionData = await client.getSessionToken();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: {
            nome: sessionName,
            conectado: true,
            tokens: sessionData,
          },
        });
        console.log("Sessão atualizada no servidor com sucesso");
      } catch (err) {
        console.error("Erro ao atualizar sessão no servidor:", err.message);
      }

      await limparSessao(client, qrFile, sessionName);
      sessionLocks.delete(sessionName);
    });

    const qrLink = `/wppconnect/qrcodes/${sessionName}.png`;
    return { success: true, qrcode: qrBuffer, link: qrLink };

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Erro gerarNovoQr:`, err.message);
    await limparSessao(client, qrFile, sessionName);
    sessionLocks.delete(sessionName);
    return { success: false, error: err.message };
  }
}

/**
 * Limpeza da sessão e QR
 */
async function limparSessao(client, qrFile, sessionName) {
  try {
    if (client) {
      await client.logout();
      await client.close();
    }
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    console.log(`Sessão ${sessionName} e QR removidos`);
  } catch (err) {
    console.error(`Erro ao limpar sessão ${sessionName}:`, err.message);
  }
}

module.exports = { gerarqrcode };
