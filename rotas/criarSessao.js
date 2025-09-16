const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  const nome = req.body.nome;
  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Criar sessão → nome da sessão não passada`);
    return res.json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  console.log(`[${new Date().toISOString()}] 🔹 Criar sessão solicitada: ${nome}`);

  try {
    // Salva no servidor PHP com status inicial "conectado: false"
    const respostaServidor = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { 
        nome, 
        dados: JSON.stringify({ conectado: false }) 
      },
    });

    if (!respostaServidor.success) {
      console.log(`[${new Date().toISOString()}] ❌ Erro salvar_sessao.php (${nome}): ${respostaServidor.error}`);
      return res.json(respostaServidor);
    }

    // Retorna sucesso ao HTML
    res.json({ success: true, nome: respostaServidor.nome });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro criarSessao (${nome}): ${err.message}`);
    res.json({ success: false, error: err.message });
  }
};
