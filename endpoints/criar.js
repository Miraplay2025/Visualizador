const { acessarServidor } = require("../utils/puppeteer");

module.exports = async (req, res) => {
  const { nome } = req.params;

  // Verificação do parâmetro obrigatório
  if (!nome) {
    return res.status(400).json({ success: false, error: "Nome da sessão é obrigatório" });
  }

  try {
    // Cria os dados iniciais da sessão: sempre conectado=false
    const dados = JSON.stringify({ conectado: false });

    // Chama o Puppeteer para interagir com o PHP (salvar_sessao.php)
    const resposta = await acessarServidor("salvar_sessao.php", {
      data: { nome, dados }
    });

    // Log detalhado para monitoramento
    console.log(`[${new Date().toISOString()}] 🔹 Resposta criar sessão:`, resposta);

    // Retorna a resposta do servidor ao cliente
    res.json(resposta);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro em criar.js: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};
