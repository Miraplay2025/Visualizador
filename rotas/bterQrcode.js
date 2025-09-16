const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  try {
    const { nome } = req.params;

    // 1️⃣ Verifica se a sessão existe no servidor
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessaoServidor = respostaServidor.sessoes?.find(s => s.nome === nome);

    if (!sessaoServidor) {
      return res.json({ success: false, error: "Sessão não encontrada no servidor" });
    }

    // 2️⃣ Verifica/Cria sessão no Node (Render)
    const client = await verificarOuCriarSessao(nome);

    // 3️⃣ Prepara pasta do QR
    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);
    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    // 4️⃣ Verifica se já existe QR salvo e se ainda é válido
    if (fs.existsSync(caminhoQr)) {
      const status = await client.getConnectionState();
      if (status === "CONNECTED" || status === "PAIRING") {
        return res.json({ success: true, message: "QR atual ainda válido" });
      }
      fs.unlinkSync(caminhoQr); // remove expirado
    }

    // 5️⃣ Gera novo QR
    const qrCode = await client.getQrCode();
    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");

    // Retorna QR PNG para HTML
    res.sendFile(caminhoQr);

    // 6️⃣ Monitora sessão para enviar dados ao PHP após conexão
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        try {
          // Obter dados completos da sessão
          const dadosSessao = await client.getSessionTokenBrowser();

          // Envia dados atualizados para o servidor PHP
          const respostaAtualizacao = await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify(dadosSessao) }
          });

          if (respostaAtualizacao.success) {
            console.log(`Sessão ${nome} conectada e dados atualizados no servidor.`);
          } else {
            console.error(`Erro ao atualizar sessão ${nome}: ${respostaAtualizacao.error}`);
          }
        } catch (err) {
          console.error(`Erro ao obter/enviar dados da sessão ${nome}: ${err.message}`);
        }
      }
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
