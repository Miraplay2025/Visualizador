const wppconnect = require("@wppconnect-team/wppconnect");
const sessoes = {};

async function criarSessaoRender(nome) {
  if (sessoes[nome]) return sessoes[nome];

  const client = await wppconnect.create({
    session: nome,
    headless: true, // roda sem interface gráfica
    autoClose: 0,   // não fecha sozinho
    browserArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer"
    ],
    catchQR: () => 
      console.log(`[${new Date().toISOString()}] 🔹 QR gerado (sessão: ${nome})`),
    statusFind: (status) => 
      console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} - status: ${status}`),
  });

  sessoes[nome] = client;
  console.log(`[${new Date().toISOString()}] ✅ Sessão ${nome} criada`);
  return client;
}

async function verificarOuCriarSessao(nome) {
  return sessoes[nome] || await criarSessaoRender(nome);
}

async function excluirSessaoRender(nome) {
  if (sessoes[nome]) {
    await sessoes[nome].close();
    delete sessoes[nome];
    console.log(`[${new Date().toISOString()}] 🔹 Sessão ${nome} excluída`);
  }
}

module.exports = { criarSessaoRender, verificarOuCriarSessao, excluirSessaoRender };
