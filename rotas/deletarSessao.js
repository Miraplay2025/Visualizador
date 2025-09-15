const { acessarServidor } = require("../utils/puppeteer");
const { excluirSessaoRender } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  try {
    const { nome } = req.params;

    // Exclui no servidor PHP
    const resposta = await acessarServidor("deletar_sessao.php", {
      method: "POST",
      data: { nome }
    });

    if (resposta.success) {
      await excluirSessaoRender(nome); // remove no Render
    }

    res.json(resposta);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
