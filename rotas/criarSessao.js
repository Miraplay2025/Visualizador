const { acessarServidor } = require("../utils/puppeteer");
const { criarSessaoRender } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.json({ success: false, error: "Nome da sessão é obrigatório" });

    // Salva no servidor PHP
    const respostaServidor = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados: JSON.stringify({ status: "criando" }) }
    });

    if (!respostaServidor.success) {
      return res.json(respostaServidor);
    }

    // Cria cópia no Render (wppconnect)
    await criarSessaoRender(respostaServidor.nome);

    res.json({ success: true, nome: respostaServidor.nome });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
