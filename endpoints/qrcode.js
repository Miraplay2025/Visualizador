const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

const sessions = new Map(); // instâncias por sessão
const locks = new Set(); // evita execuções concorrentes

// Função auxiliar para limpar sessão temporária
function limparSessao(nome, client, fecharBrowser = true) {
  try {
    if (sessions.has(nome)) sessions.delete(nome);
    if (locks.has(nome)) locks.delete(nome);

    const qrcodeDir = path.join(__dirname, "../qrcodes");
    const qrcodePath = path.join(qrcodeDir, `${nome}.png`);
    if (fs.existsSync(qrcodePath)) fs.unlinkSync(qrcodePath);

    if (client && fecharBrowser) {
      client.close();
      console.log(`[${nome}] 🔴 Cliente WppConnect fechado e sessão limpa`);
    }
  } catch (err) {
    console.error(`[${nome}] ⚠ Erro ao limpar sessão: ${err.message}`);
  }
}

module.exports = async (req, res) => {
  const { nome } = req.params;

  if (!nome) {
    return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  if (locks.has(nome)) {
    return res.status(429).json({ success: false, error: "Já existe um processo em andamento para esta sessão" });
  }

  locks.add(nome);

  try {
    // 1️⃣ Verifica no servidor se a sessão existe
    const respostaListar = await acessarServidor("listar_sessoes.php");
    console.log(`[${new Date().toISOString()}] 🔹 Sessões retornadas:`, respostaListar);

    const lista = Array.isArray(respostaListar.sessoes) ? respostaListar.sessoes : [];
    const existe = lista.find((s) => s.nome === nome);

    if (!existe) {
      locks.delete(nome);
      return res.status(404).json({ success: false, error: "Sessão não existe no servidor" });
    }

    let client = sessions.get(nome);

    // 2️⃣ Se já existe instância, só valida o status
    if (client) {
      const status = await client.getConnectionState();
      console.log(`[${nome}] 🔹 Status atual:`, status);

      if (status === "CONNECTED") {
        limparSessao(nome, client);
        locks.delete(nome);
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      if (status === "QRCODE") {
        locks.delete(nome);
        return res.json({ success: true, message: "QRCode ainda válido" });
      }
    }

    // 3️⃣ Criar instância nova
    console.log(`[${nome}] 🔹 Criando nova instância...`);

    const qrcodeDir = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(qrcodeDir)) fs.mkdirSync(qrcodeDir, { recursive: true });

    // Promise para esperar QR code ser gerado
    const qrPath = await new Promise(async (resolve, reject) => {
      try {
        client = await wppconnect.create({
          session: nome,
          puppeteerOptions: {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            userDataDir: `/app/tokens/${nome}`, // pasta exclusiva
          },
          autoClose: 0, // desabilita auto close temporário
          catchQR: (base64Qr) => {
            try {
              const qrcodePath = path.join(qrcodeDir, `${nome}.png`);
              fs.writeFileSync(qrcodePath, base64Qr.split(",")[1], "base64");
              console.log(`[${nome}] 🔹 QRCode gerado e salvo em ${qrcodePath}`);
              resolve(`/qrcode/${nome}.png`);
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
                await acessarServidor("atualizar_sessao.php", {
                  data: { nome, dados },
                });

                // Limpa sessão e fecha browser
                limparSessao(nome, client);
              } catch (err) {
                console.error(`[${nome}] ❌ Erro ao atualizar sessão conectada:`, err.message);
                limparSessao(nome, client);
              }
            }
          },
        });

        sessions.set(nome, client);
      } catch (err) {
        reject(err);
      }
    });

    locks.delete(nome);
    return res.json({
      success: true,
      message: "Nova sessão criada. QRCode disponível",
      qrcode: qrPath,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em qrcode.js:`, err.message);
    limparSessao(nome, sessions.get(nome));
    locks.delete(nome);
    return res.status(500).json({ success: false, error: err.message });
  }
};
