const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const sessoes = {};
const pastaQRCodes = path.join(__dirname, "qrcodes");

// cria a pasta se não existir
if (!fs.existsSync(pastaQRCodes)) {
  fs.mkdirSync(pastaQRCodes);
}

async function criarSessaoRender(nome) {
  if (sessoes[nome]) {
    console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} já existe`);
    return sessoes[nome];
  }

  const client = await wppconnect.create({
    session: nome,
    headless: true,
    autoClose: 0,
    browserArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer"
    ],
    catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
      try {
        const base64Data = base64Qr.replace(/^data:image\/png;base64,/, "");
        const filePath = path.join(pastaQRCodes, `${nome}.png`);
        fs.writeFileSync(filePath, base64Data, "base64");

        sessoes[nome].ultimoQRCode = filePath;
        sessoes[nome].qrCodeValido = true;

        console.log(`[${new Date().toISOString()}] 🔹 QRCode salvo em ${filePath} (sessão: ${nome}, tentativa: ${attempts})`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] ❌ Erro ao salvar QRCode:`, err);
      }
    },
    statusFind: (status) => {
      console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} - status: ${status}`);

      if (status === "isLogged" || status === "qrReadSuccess") {
        sessoes[nome].qrCodeValido = false;
        console.log(`[${new Date().toISOString()}] ✅ Sessão ${nome} autenticada`);
      }
    }
  });

  sessoes[nome] = client;
  sessoes[nome].ultimoQRCode = null;
  sessoes[nome].qrCodeValido = false;

  console.log(`[${new Date().toISOString()}] ✅ Sessão ${nome} criada`);
  return client;
}

async function verificarOuCriarSessao(nome) {
  if (sessoes[nome]) {
    if (sessoes[nome].qrCodeValido && sessoes[nome].ultimoQRCode) {
      console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} - QRCode atual ainda válido`);
    }
    return sessoes[nome];
  }
  return await criarSessaoRender(nome);
}

async function excluirSessaoRender(nome) {
  if (sessoes[nome]) {
    await sessoes[nome].close();
    delete sessoes[nome];
    console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} excluída`);

    // remove arquivo do QRCode
    const filePath = path.join(pastaQRCodes, `${nome}.png`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[${new Date().toISOString()}] 🗑️ QRCode da sessão ${nome} removido`);
    }
  }
}

module.exports = { criarSessaoRender, verificarOuCriarSessao, excluirSessaoRender, sessoes, pastaQRCodes };
