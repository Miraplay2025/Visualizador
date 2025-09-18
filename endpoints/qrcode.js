const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

const sessions = new Map(); // instâncias por sessão
const locks = new Set(); // evita execuções concorrentes

function limparSessao(nome, client) {
  try {
    if (sessions.has(nome)) sessions.delete(nome);
    if (locks.has(nome)) locks.delete(nome);

    const qrcodePath = path.join(__dirname, `../qrcodes/${nome}.png`);
    if (fs.existsSync(qrcodePath)) fs.unlinkSync(qrcodePath);

    if (client) {
      client.close();
      console.log(`[${nome}] 🔴 Cliente WppConnect fechado e sessão limpa`);
    }
  } catch (err) {
    console.error(`[${nome}] ⚠ Erro ao limpar sessão: ${err.message}`);
  }
}

module.exports = async (req, res) => {
  const { nome } = req.params;

  if (!nome) return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  if (locks.has(nome)) return res.status(429).json({ success: false, error: "Já existe um processo em andamento para esta sessão" });

  try {
    const respostaListar = await acessarServidor("listar_sessoes.php");
    const lista = Array.isArray(respostaListar.sessoes) ? respostaListar.sessoes : [];
    const existe = lista.find((s) => s.nome === nome);

    if (!existe) return res.status(404).json({ success: false, error: "Sessão não existe no servidor" });

    locks.add(nome);
    let client = sessions.get(nome);

    // Se já existe instância
    if (client) {
      const status = await client.getConnectionState();
      console.log(`[${nome}] 🔹 Status atual:`, status);

      if (status === "CONNECTED") {
        limparSessao(nome, client);
        return res.json({ success: true, message: "Sessão já conectada" });
      }
    }

    console.log(`[${nome}] 🔹 Criando nova instância...`);

    // Promise para esperar QR code ser gerado
    const qrPromise = new Promise((resolve, reject) => {
      wppconnect.create({
        session: nome,
        puppeteerOptions: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
        catchQR: (base64Qr) => {
          try {
            const qrcodePath = path.join(__dirname, `../qrcodes/${nome}.png`);
            fs.writeFileSync(qrcodePath, base64Qr.split(",")[1], "base64");
            console.log(`[${nome}] 🔹 QRCode gerado e salvo em ${qrcodePath}`);
            resolve(qrcodePath); // Resolve a Promise aqui
          } catch (err) {
            reject(err);
          }
        },
        statusFind: async (statusSession) => {
          console.log(`[${nome}] 🔹 Status atualizado: ${statusSession}`);
          if (statusSession === "CONNECTED") {
            try {
              const tokens = await client.getSessionTokenBrowser();
              console.log(`[${nome}] ✅ Sessão conectada! Tokens:`, tokens);
              const dados = JSON.stringify({ conectado: true, tokens });
              await acessarServidor("atualizar_sessao.php", { data: { nome, dados } });
              limparSessao(nome, client);
            } catch (err) {
              console.error(`[${nome}] ❌ Erro ao atualizar sessão conectada:`, err.message);
              limparSessao(nome, client);
            }
          }
        },
      }).then((c) => (client = c))
        .catch((err) => reject(err));
    });

    // Aguarda QR code ser gerado
    const qrcodePath = await qrPromise;

    sessions.set(nome, client);
    locks.delete(nome);

    return res.json({
      success: true,
      message: "QR code gerado e disponível",
      qrcode: `/qrcode/${nome}.png`,
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em qrcode.js:`, err.message);
    limparSessao(nome, sessions.get(nome));
    return res.status(500).json({ success: false, error: err.message });
  }
};
