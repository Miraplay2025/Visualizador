const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  const nome = req.params.nome;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Nome da sessão não recebido`);
    return res.json({ success: false, error: "Nome da sessão não passada" });
  }

  try {
    // 1️⃣ Verificar se a sessão existe
    console.log(`[${new Date().toISOString()}] 🔹 Verificando se a sessão "${nome}" existe no servidor`);
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessao = respostaServidor.sessoes?.find(s => s.nome === nome);
    if (!sessao) {
      console.log(`[${new Date().toISOString()}] ❌ Sessão "${nome}" não encontrada no servidor`);
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 2️⃣ Criar ou recuperar sessão
    const client = await verificarOuCriarSessao(nome);

    // 3️⃣ Pasta do QRCode
    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);
    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    // 4️⃣ QR existente
    if (fs.existsSync(caminhoQr)) {
      let status;
      try {
        status = await client.getConnectionState();
      } catch (err) {
        console.error(`[${new Date().toISOString()}] ⚠️ Erro ao verificar status: ${err.message}`);
        status = "UNKNOWN";
      }

      if (status === "CONNECTED") {
        const tokens = await client.getSessionTokenBrowser();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });
        console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" conectada`);
        return res.json({ success: true, message: "Sessão conectada" });
      }

      if (status === "PAIRING") {
        console.log(`[${new Date().toISOString()}] ℹ️ QR da sessão "${nome}" ainda válido`);
        console.log(`[${new Date().toISOString()}] 🔗 Link QR existente: /qrcodes/${nome}.png`);
        return res.json({
          success: true,
          message: "QR atual ainda válido",
          qrUrl: `/qrcodes/${nome}.png`,
        });
      }

      // QR expirado
      fs.unlinkSync(caminhoQr);
      console.log(`[${new Date().toISOString()}] ⚠️ QR expirado da sessão "${nome}" removido`);
    }

    // 5️⃣ Gerar novo QR
    console.log(`[${new Date().toISOString()}] ⏳ Gerando novo QR para sessão "${nome}"...`);
    let qrCode;
    try {
      qrCode = await client.getQrCode();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ❌ Erro ao gerar QR: ${err.message}`);
      return res.json({ success: false, error: "Erro ao gerar QR: " + err.message });
    }

    if (!qrCode) {
      console.error(`[${new Date().toISOString()}] ❌ Nenhum QR retornado para sessão "${nome}"`);
      return res.json({ success: false, error: "QR não retornado pelo client" });
    }

    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");
    console.log(`[${new Date().toISOString()}] ✅ QR salvo para sessão "${nome}"`);
    console.log(`[${new Date().toISOString()}] 🔗 Link QR: /qrcodes/${nome}.png`);

    // 6️⃣ Responder
    res.json({
      success: true,
      message: "Novo QRCode gerado",
      qrUrl: `/qrcodes/${nome}.png`,
    });

    // 7️⃣ Monitorar conexão
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        try {
          const tokens = await client.getSessionTokenBrowser();
          await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
          });
          console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" conectada e dados enviados`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ❌ Erro ao atualizar sessão (${nome}): ${err.message}`);
        }
      }
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro geral: ${err.message}`);
    return res.json({ success: false, error: err.message });
  }
};
