const { acessarServidor } = require("../utils/puppeteer");
const { criarSessaoRender } = require("../utils/gerenciarRender");

module.exports = async (req, res) => {
  const nome = req.body.nome;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Criar sessão → nome da sessão não passada`);
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  console.log(`[${new Date().toISOString()}] 🔹 Criar sessão solicitada: ${nome}`);

  try {
    const respostaServidor = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados: JSON.stringify({ status: "criando" }) },
    });

    if (!respostaServidor.success) return res.json(respostaServidor);

    await criarSessaoRender(respostaServidor.nome);

    res.json({ success: true, nome: respostaServidor.nome });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
