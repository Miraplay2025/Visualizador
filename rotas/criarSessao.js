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
    // Aqui já marcamos a sessão como "conectado = false" no início
    const respostaServidor = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { 
        nome, 
        dados: JSON.stringify({ conectado: false }) // status inicial
      },
    });

    if (!respostaServidor.success) {
      console.log(`[${new Date().toISOString()}] ❌ Erro salvar_sessao.php (${nome}): ${respostaServidor.error}`);
      return res.json(respostaServidor);
    }

    // Criar sessão no wppconnect
    await criarSessaoRender(respostaServidor.nome);

    // Atualizar servidor com "conectado = true" após criar com sucesso
    await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { 
        nome: respostaServidor.nome, 
        dados: JSON.stringify({ conectado: true }) 
      },
    });

    res.json({ success: true, nome: respostaServidor.nome });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro criarSessao (${nome}): ${err.message}`);
    res.json({ success: false, error: err.message });
  }
};
