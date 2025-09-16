const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão é obrigatório" });

  try {
    // 1️⃣ Verificar se a sessão existe no servidor
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessao = respostaServidor.sessoes?.find(s => s.nome === nome);
    if (!sessao) return res.json({ success: false, error: "Sessão não encontrada" });

    // 2️⃣ Criar ou recuperar sessão WPPConnect
    const client = await verificarOuCriarSessao(nome);

    // 3️⃣ Preparar pasta QRCode
    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);
    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    // 4️⃣ Verifica se QR atual existe
    if (fs.existsSync(caminhoQr)) {
      const status = await client.getConnectionState();

      if (status === "CONNECTED") {
        const tokens = await client.getSessionTokenBrowser();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });
        console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" conectada, dados enviados ao servidor`);
        return res.json({ success: true, message: "Sessão conectada" });
      }

      if (status === "PAIRING") {
        console.log(`[${new Date().toISOString()}] ℹ️ QR atual da sessão "${nome}" ainda válido`);
        return res.json({ success: true, message: "QR atual ainda válido" });
      }

      // QR expirado → apagar
      fs.unlinkSync(caminhoQr);
    }

    // 5️⃣ Gerar novo QR
    const qrCode = await client.getQrCode();
    // Garantir que seja PNG válido
    const base64Data = qrCode.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(caminhoQr, base64Data, "base64");

    const qrLink = `/qrcodes/${nome}.png`;
    console.log(`[${new Date().toISOString()}] ✅ QR da sessão "${nome}" gerado com sucesso: ${qrLink}`);

    // 6️⃣ Retornar QR novo
    res.json({ success: true, message: "Novo QRCode gerado", qrUrl: qrLink });

    // 7️⃣ Monitorar estado da sessão
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        try {
          const tokens = await client.getSessionTokenBrowser();
          await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
          });
          console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" conectada, dados enviados ao servidor`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ❌ Erro ao atualizar sessão (${nome}): ${err.message}`);
        }
      }
    });

  } catch (err) {
    console.error(`Erro ao gerar QRCode (${nome}):`, err);
    res.json({ success: false, error: err.message });
  }
};
