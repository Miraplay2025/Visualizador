const { acessarServidor } = require("../utils/puppeteer");
const { excluirSessaoRender } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  const nome = req.params.nome;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Deletar sessão → nome da sessão não passada`);
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  console.log(`[${new Date().toISOString()}] 🔹 Deletar sessão solicitada: ${nome}`);

  try {
    const resposta = await acessarServidor("deletar_sessao.php", {
      method: "POST",
      data: { nome },
    });

    if (resposta.success) await excluirSessaoRender(nome);

    res.json(resposta);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
