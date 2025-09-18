const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  const { nome } = req.params;
  if (!nome) {
    return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  try {
    const resposta = await acessarServidor("deletar_sessao.php", {
      data: { nome }
    });

    console.log(`[${new Date().toISOString()}] 🔹 Resposta deletar sessão:`, resposta);

    res.json(resposta);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em deletar.js: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};
