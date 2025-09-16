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
        // Enviar dados ao atualizar_sessao.php
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });
        return res.json({ success: true, message: "Sessão conectada" });
      }

      if (status === "PAIRING") {
        return res.json({ success: true, message: "QR atual ainda válido" });
      }

      // QR expirado → apagar
      fs.unlinkSync(caminhoQr);
    }

    // 5️⃣ Gerar novo QR
    const qrCode = await client.getQrCode();
    fs.writeFileSync(caminhoQr, qrCode.replace(/^data:image\/png;base64,/, ""), "base64");

    // 6️⃣ Retornar QR novo
    res.json({ success: true, message: "Novo QRCode gerado", qrUrl: `/qrcodes/${nome}.png` });

    // 7️⃣ Monitorar estado da sessão → ao conectar envia dados para atualizar_sessao.php
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        try {
          const tokens = await client.getSessionTokenBrowser();
          await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
          });
          console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" conectada e dados enviados ao servidor`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ❌ Erro ao atualizar sessão (${nome}): ${err.message}`);
        }
      }
    });

  } catch (err) {
    console.error(`Erro obter QRCode (${nome}):`, err.message);
    res.json({ success: false, error: err.message });
  }
};
