const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  try {
    const { nome, dados } = req.body;
    if (!nome || !dados) {
      return res.json({ success: false, error: "Nome e dados são obrigatórios" });
    }

    const resposta = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados: JSON.stringify(dados) }
    });

    res.json(resposta);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
