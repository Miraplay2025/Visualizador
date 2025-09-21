const { makeWASocket, useSingleFileAuthState, fetchLatestBaileysVersion } = require("@adiwajshing/baileys");
const fs = require("fs");
const path = require("path");
const { criarSessao, removerSessao, existeSessao } = require("../utils/sessions");

module.exports = async function (req, res) {
  try {
    const nome = req.params?.nome || req.body?.nome;
    if (!nome) {
      console.log(`[${new Date().toISOString()}] ❌ Nenhum nome de sessão fornecido`);
      return res.json({ success: false, error: "Nome da sessão não informado" });
    }

    console.log(`[${new Date().toISOString()}] 🔹 Iniciando QR Code para sessão: "${nome}"`);

    // Verifica se já existe sessão em andamento
    if (existeSessao(nome)) {
      console.log(`[${new Date().toISOString()}] ⚠️ Sessão "${nome}" já está em andamento`);
      return res.json({ success: false, error: `Sessão "${nome}" já está em andamento` });
    }

    // Configura arquivo de sessão
    const sessionFile = path.join(__dirname, `../sessions/${nome}.json`);
    const { state, saveState } = useSingleFileAuthState(sessionFile);

    // Remove sessão antiga se existir
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      console.log(`[${new Date().toISOString()}] 🔹 Sessão anterior "${nome}" apagada`);
    }

    console.log(`[${new Date().toISOString()}] 🔹 Obtendo versão do WhatsApp Web...`);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[${new Date().toISOString()}] 🔹 Versão encontrada: ${version.join(".")}`);

    // Cria a conexão
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      version,
      browser: ["WhatsApp-Server", "Server", "1.0.0"]
    });

    // Salva sessão na memória
    criarSessao(nome, sock);
    console.log(`[${new Date().toISOString()}] 🔹 Sessão "${nome}" criada e registrada em memória`);

    let qrSent = false; // evita múltiplas respostas

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && !qrSent) {
        console.log(`[${new Date().toISOString()}] 🔹 QR Code gerado para "${nome}"`);

        // Retorna HTML com QR Code embutido
        const html = `
          <html>
            <body style="text-align:center; font-family:sans-serif;">
              <h2>Escaneie o QR Code</h2>
              <img src="data:image/png;base64,${qr}" alt="QR Code"/>
              <p>Verifique o console para logs detalhados.</p>
            </body>
          </html>
        `;
        res.setHeader("Content-Type", "text/html");
        res.send(html);
        qrSent = true;
        console.log(`[${new Date().toISOString()}] 🔹 Resposta enviada com QR Code`);
      }

      if (connection === "open") {
        console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" autenticada com sucesso`);
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode || "desconhecido";
        console.log(`[${new Date().toISOString()}] ❌ Sessão "${nome}" desconectada. Motivo: ${reason}`);
        removerSessao(nome);
      }
    });

    sock.ev.on("creds.update", () => {
      saveState();
      console.log(`[${new Date().toISOString()}] 🔹 Credenciais atualizadas para "${nome}"`);
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] [Erro QR Code]`, err);
    return res.json({ success: false, error: "Erro interno ao gerar QR Code" });
  }
};

