const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  const nome = req.params.nome;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Obter QRCode → nome da sessão não passada`);
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  console.log(`[${new Date().toISOString()}] 🔹 Solicitação QRCode (sessão: ${nome})`);

  try {
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessao = respostaServidor.sessoes?.find(s => s.nome === nome);
    if (!sessao) return res.json({ success: false, error: "Sessão não encontrada" });

    const client = await verificarOuCriarSessao(nome);

    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);
    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    if (fs.existsSync(caminhoQr)) {
      const status = await client.getConnectionState();
      if (["CONNECTED", "PAIRING"].includes(status)) {
        return res.json({ success: true, message: "QR atual ainda válido" });
      }
      fs.unlinkSync(caminhoQr);
    }

    const qrCode = await client.getQrCode();
    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");

    res.sendFile(caminhoQr);

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
