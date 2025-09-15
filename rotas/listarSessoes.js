const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  try {
    const resposta = await acessarServidor("listar_sessoes.php");
    res.json(resposta);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
