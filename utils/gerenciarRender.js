const wppconnect = require("@wppconnect-team/wppconnect");
const sessoes = {};

async function criarSessaoRender(nome) {
  if (sessoes[nome]) return sessoes[nome];

  const client = await wppconnect.create({
    session: nome,
    catchQR: (qr) => {
      console.log(`QR Code gerado para sessão ${nome}`);
    },
    statusFind: (status) => {
      console.log(`Sessão ${nome} - status: ${status}`);
    }
  });

  sessoes[nome] = client;
  return client;
}

async function verificarOuCriarSessao(nome) {
  return sessoes[nome] || await criarSessaoRender(nome);
}

async function excluirSessaoRender(nome) {
  if (sessoes[nome]) {
    await sessoes[nome].close();
    delete sessoes[nome];
  }
}

module.exports = { criarSessaoRender, verificarOuCriarSessao, excluirSessaoRender };
