const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  try {
    const resposta = await acessarServidor("listar_sessoes.php");

    console.log(`[${new Date().toISOString()}] 🔹 Resposta listar sessões:`, resposta);

    res.json(resposta);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em listar.js: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};
