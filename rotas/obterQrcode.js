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
    // 1️⃣ Verificar no servidor se a sessão existe
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessao = respostaServidor.sessoes?.find(s => s.nome === nome);
    if (!sessao) {
      console.log(`[${new Date().toISOString()}] ❌ Sessão não encontrada (${nome})`);
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 2️⃣ Criar ou recuperar sessão no WPPConnect
    const client = await verificarOuCriarSessao(nome);

    // 3️⃣ Preparar pasta QRCode
    const pastaQr = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(pastaQr)) fs.mkdirSync(pastaQr);
    const caminhoQr = path.join(pastaQr, `${nome}.png`);

    // 4️⃣ Se já existe QR, checar status
    if (fs.existsSync(caminhoQr)) {
      const status = await client.getConnectionState();

      if (status === "CONNECTED") {
        console.log(`[${new Date().toISOString()}] ✅ Sessão conectada (${nome})`);

        // Atualizar servidor → conectado: true
        const tokens = await client.getSessionTokenBrowser();
        await acessarServidor("salvar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });

        return res.json({ success: true, message: "Sessão conectada com sucesso", tokens });
      }

      if (status === "PAIRING") {
        console.log(`[${new Date().toISOString()}] 🔹 QR atual ainda válido (${nome})`);
        return res.json({ success: true, message: "QR atual ainda válido" });
      }

      // Se expirado → apagar antigo QR
      fs.unlinkSync(caminhoQr);
      console.log(`[${new Date().toISOString()}] ⚠️ QRCode expirado deletado (${nome})`);
    }

    // 5️⃣ Gerar novo QR
    const qrCode = await client.getQrCode();
    fs.writeFileSync(
      caminhoQr,
      qrCode.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    console.log(`[${new Date().toISOString()}] 📲 Novo QRCode gerado (${nome})`);

    // 6️⃣ Retornar a imagem PNG para o HTML
    res.sendFile(caminhoQr);

    // 7️⃣ Monitorar estado da sessão → quando conectar, atualizar servidor
    client.onStateChange(async (state) => {
      if (state === "CONNECTED") {
        console.log(`[${new Date().toISOString()}] 🎉 Sessão "${nome}" conectada`);

        try {
          const tokens = await client.getSessionTokenBrowser();
          await acessarServidor("salvar_sessao.php", {
            method: "POST",
            data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
          });
          console.log(`[${new Date().toISOString()}] ✅ Tokens e status enviados ao servidor (${nome})`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] ❌ Erro ao enviar tokens (${nome}): ${err.message}`);
        }
      }
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro obter QRCode (${nome}): ${err.message}`);
    res.json({ success: false, error: err.message });
  }
};
