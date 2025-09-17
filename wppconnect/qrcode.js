// wppconnect/qrcode.js
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");

const QR_PATH = path.join(__dirname, "qrcodes");
if (!fs.existsSync(QR_PATH)) fs.mkdirSync(QR_PATH, { recursive: true });

const sessionLocks = new Map();

async function gerarqrcode(sessionName) {
  if (sessionLocks.get(sessionName)) {
    return { success: false, error: "Já existe uma requisição em andamento para essa sessão" };
  }
  sessionLocks.set(sessionName, true);

  const qrFile = path.join(QR_PATH, `${sessionName}.png`);
  let client;

  try {
    // Cria a sessão ou conecta se já existir
    client = await wppconnect.create({
      session: sessionName,
      headless: true,
      autoClose: 0,
      puppeteerOptions: { headless: true },
      browserArgs: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      catchQR: async (qrBase64) => {
        // Salva QR como PNG
        const buffer = Buffer.from(qrBase64, "base64");
        fs.writeFileSync(qrFile, buffer);
        console.log(`[${new Date().toISOString()}] QR code salvo: ${qrFile}`);
      },
      statusFind: (status) => {
        console.log(`[${new Date().toISOString()}] Status ${sessionName}: ${status}`);
      },
    });

    // Verifica se já está conectado
    const status = await client.getStatus();
    if (status.connected) {
      sessionLocks.delete(sessionName);
      console.log(`[${new Date().toISOString()}] Sessão ${sessionName} já está conectada`);
      return { success: true, message: "Sessão já conectada", link: fs.existsSync(qrFile) ? `/wppconnect/qrcodes/${sessionName}.png` : null };
    }

    // QR expirado ou não existente → gerar novo
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
      } finally {
        await limparSessao(client, qrFile, sessionName);
      }
    });

    // Retorna link do QR code
    const qrLink = `/wppconnect/qrcodes/${sessionName}.png`;
    sessionLocks.delete(sessionName);
    return { success: true, link: qrLink };

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Erro gerarqrcode:`, err.message);
    if (client) await client.close();
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    sessionLocks.delete(sessionName);
    return { success: false, error: err.message };
  }
}

async function limparSessao(client, qrFile, sessionName) {
  try {
    if (client) {
      await client.logout();
      await client.close();
    }
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    console.log(`[${new Date().toISOString()}] Sessão ${sessionName} e QR removidos`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Erro ao limpar sessão ${sessionName}:`, err.message);
  }
}

module.exports = { gerarqrcode };
