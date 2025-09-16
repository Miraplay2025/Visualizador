const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  const { nome, dados } = req.body;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Salvar dados → nome da sessão não passada`);
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  console.log(`[${new Date().toISOString()}] 🔹 Salvar dados (sessão: ${nome})`);

  try {
    const resposta = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados: JSON.stringify(dados) },
    });

    res.json(resposta);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};
