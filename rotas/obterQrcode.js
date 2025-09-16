const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("../utils/puppeteer");
const { verificarOuCriarSessao } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  try {
    const { nome } = req.params;
    console.log(`[${new Date().toISOString()}] 🔹 Solicitação QR recebida para sessão "${nome}"`);

    // 1️⃣ Verifica se a sessão existe no servidor
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessaoServidor = respostaServidor.sessoes?.find(s => s.nome === nome);

    if (!sessaoServidor) {
      console.log(`[${new Date().toISOString()}] ❌ Sessão "${nome}" não encontrada no servidor`);
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
        console.log(`[${new Date().toISOString()}] ✅ QR atual da sessão "${nome}" ainda válido`);
        return res.json({ success: true, message: "QR atual ainda válido" });
      }
      fs.unlinkSync(caminhoQr); // remove expirado
      console.log(`[${new Date().toISOString()}] ⚠️ QR expirado removido para sessão "${nome}"`);
    }

    // 5️⃣ Gera novo QR
    const qrCode = await client.getQrCode();
    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");
    console.log(`[${new Date().toISOString()}] 🆕 Novo QR gerado para sessão "${nome}"`);

    // Retorna QR PNG para HTML
    res.sendFile(caminhoQr);

    // 6️⃣ Monitora sessão para enviar dados ao PHP após conexão
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        console.log(`[${new Date().toISOString()}] 🎉 Sessão "${nome}" conectada com sucesso`);
        try {
          const dadosSessao = await client.getSessionTokenBrowser();

          // Envia dados atualizados para o servidor PHP
          const respostaAtualizacao = await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify(dadosSessao) }
          });

          if (respostaAtualizacao.success) {
            console.log(`[${new Date().toISOString()}] ✅ Dados da sessão "${nome}" atualizados no servidor`);
          } else {
            console.error(`[${new Date().toISOString()}] ❌ Erro ao atualizar sessão "${nome}": ${respostaAtualizacao.error}`);
          }
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ❌ Erro ao obter/enviar dados da sessão "${nome}": ${err.message}`);
        }
      }
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro na requisição QR para sessão "${req.params.nome}": ${err.message}`);
    res.json({ success: false, error: err.message });
  }
};

