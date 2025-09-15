const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  try {
    const { nome } = req.params;

    // Verifica se a sessão existe no servidor
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessaoServidor = respostaServidor.sessoes?.find(s => s.nome === nome);

    if (!sessaoServidor) {
      return res.json({ success: false, error: "Sessão não encontrada no servidor" });
    }

    // Verifica/Cria sessão no Render
    const client = await verificarOuCriarSessao(nome);

    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);

    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    // Se já existir QR salvo, verificar status
    if (fs.existsSync(caminhoQr)) {
      const status = await client.getConnectionState();
      if (status !== "DISCONNECTED" && status !== "UNPAIRED") {
        return res.sendFile(caminhoQr);
      }
      fs.unlinkSync(caminhoQr); // remove expirado
    }

    // Gera novo QR
    const qrCode = await client.getQrCode();
    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");

    res.sendFile(caminhoQr);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
