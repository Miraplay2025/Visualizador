const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  const { nome } = req.params;
  if (!nome) {
    return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  try {
    const dados = JSON.stringify({ conectado: false });

    const resposta = await acessarServidor("salvar_sessao.php", {
      data: { nome, dados }
    });

    console.log(`[${new Date().toISOString()}] 🔹 Resposta criar sessão:`, resposta);

    res.json(resposta);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em criar.js: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};
