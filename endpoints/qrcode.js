const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

const sessions = new Map(); // Map para instâncias de cada sessão
const locks = new Set(); // Set para evitar execuções concorrentes

const qrcodeDir = path.join(__dirname, "../qrcodes");
if (!fs.existsSync(qrcodeDir)) fs.mkdirSync(qrcodeDir, { recursive: true });

// Função auxiliar para limpar sessão e arquivos temporários
function limparSessao(nome, client) {
  try {
    if (sessions.has(nome)) sessions.delete(nome);
    if (locks.has(nome)) locks.delete(nome);

    const qrcodePath = path.join(qrcodeDir, `${nome}.png`);
    if (fs.existsSync(qrcodePath)) fs.unlinkSync(qrcodePath);

    if (client) {
      client.close();
      console.log(`[${nome}] 🔴 Cliente WppConnect fechado e sessão limpa`);
    }
  } catch (err) {
    console.error(`[${nome}] ⚠ Erro ao limpar sessão: ${err.message}`);
  }
}

// Função principal para criar ou retornar QR code da sessão
module.exports = async (req, res) => {
  const { nome } = req.params;

  if (!nome) return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  if (locks.has(nome)) return res.status(429).json({ success: false, error: "Processo já em andamento para esta sessão" });

  locks.add(nome);

  try {
    // 1️⃣ Verifica no servidor se a sessão existe
    const respostaListar = await acessarServidor("listar_sessoes.php");
    const lista = Array.isArray(respostaListar.sessoes) ? respostaListar.sessoes : [];
    const existe = lista.find((s) => s.nome === nome);

    if (!existe) {
      locks.delete(nome);
      return res.status(404).json({ success: false, error: "Sessão não existe no servidor" });
    }

    let client = sessions.get(nome);

    // 2️⃣ Reutiliza instância existente se QR code ainda válido
    const qrcodePath = path.join(qrcodeDir, `${nome}.png`);
    if (client) {
      const status = await client.getConnectionState();
      if (status === "CONNECTED") {
        limparSessao(nome, client);
        locks.delete(nome);
        return res.json({ success: true, message: "Sessão já conectada" });
      }
      if (status === "QRCODE" && fs.existsSync(qrcodePath)) {
        const qrBase64 = fs.readFileSync(qrcodePath, { encoding: "base64" });
        locks.delete(nome);
        return res.json({ success: true, message: "QR code ainda válido", qrcode: `data:image/png;base64,${qrBase64}` });
      }
    }

    // 3️⃣ Cria nova instância e garante QR code
    console.log(`[${nome}] 🔹 Criando nova instância...`);

    const qrCodePromise = new Promise((resolve, reject) => {
      wppconnect
        .create({
          session: nome,
          puppeteerOptions: {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            userDataDir: `/app/tokens/${nome}-${Date.now()}`, // Pasta única para evitar conflito
          },
          autoClose: 0, // Não fecha antes do scan
          catchQR: (base64Qr) => {
            try {
              fs.writeFileSync(qrcodePath, base64Qr.split(",")[1], "base64");
              const qrBase64Final = fs.readFileSync(qrcodePath, { encoding: "base64" });
              console.log(`[${nome}] 🔹 QRCode gerado em ${qrcodePath}`);
              resolve(`data:image/png;base64,${qrBase64Final}`);
            } catch (err) {
              reject(err);
            }
          },
          statusFind: async (statusSession) => {
            console.log(`[${nome}] 🔹 Status atualizado: ${statusSession}`);

            if (statusSession === "CONNECTED") {
              try {
                const tokens = await client.getSessionTokenBrowser();
                const dados = JSON.stringify({ conectado: true, tokens });
                await acessarServidor("atualizar_sessao.php", { data: { nome, dados } });
                console.log(`[${nome}] ✅ Sessão conectada e servidor atualizado`);
                limparSessao(nome, client);
              } catch (err) {
                console.error(`[${nome}] ❌ Erro ao atualizar sessão conectada:`, err.message);
                limparSessao(nome, client);
              }
            }
          },
        })
        .then((c) => {
          client = c;
          sessions.set(nome, client);
        })
        .catch((err) => reject(err));
    });

    const qrCodeBase64 = await qrCodePromise;
    locks.delete(nome);

    return res.json({
      success: true,
      message: "Nova sessão criada. QRCode disponível",
      qrcode: qrCodeBase64,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em qrcode.js:`, err.message);
    limparSessao(nome, sessions.get(nome));
    locks.delete(nome);
    return res.status(500).json({ success: false, error: err.message });
  }
};
          
