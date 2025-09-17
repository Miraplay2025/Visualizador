const fs = require("fs");
const path = require("path");
const wppconnect = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("../utils/puppeteer");

const sessoes = {}; // armazenar instâncias ativas em memória

module.exports = async (req, res) => {
  const nome = req.params.nome;

  if (!nome) {
    console.log(`[${new Date().toISOString()}] ❌ Nome da sessão não recebido`);
    return res.json({ success: false, error: "Nome da sessão não passada" });
  }

  try {
    // 1️⃣ Verificar se sessão existe no servidor remoto
    console.log(`[${new Date().toISOString()}] 🔹 Verificando se a sessão "${nome}" existe no servidor`);
    const respostaServidor = await acessarServidor("listar_sessoes.php");
    const sessao = respostaServidor.sessoes?.find(s => s.nome === nome);

    if (!sessao) {
      console.log(`[${new Date().toISOString()}] ❌ Sessão "${nome}" não encontrada no servidor`);
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 2️⃣ Criar ou recuperar instância local da sessão
    let client = sessoes[nome];
    if (!client) {
      console.log(`[${new Date().toISOString()}] 🔹 Criando nova sessão "${nome}"`);
      client = await wppconnect.create({
        session: nome,
        headless: true,
        autoClose: 0,
        browserArgs: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer"
        ],
        catchQR: (qr) => console.log(`[${new Date().toISOString()}] 🔹 QR gerado para "${nome}"`),
        statusFind: (status) => console.log(`[${new Date().toISOString()}] 🔹 Sessão "${nome}" status: ${status}`)
      });
      sessoes[nome] = client;
      console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" criada`);
    }

    // 3️⃣ Garantir pasta qrcodes
    const qrFolder = path.join(__dirname, "../qrcodes");
    if (!fs.existsSync(qrFolder)) fs.mkdirSync(qrFolder);

    const qrPath = path.join(qrFolder, `${nome}.png`);

    // 4️⃣ Verificar se QR já existe
    if (fs.existsSync(qrPath)) {
      const estado = await client.getState();

      if (estado === "CONNECTED") {
        console.log(`[${new Date().toISOString()}] ✅ Sessão "${nome}" já conectada`);

        const tokens = await client.getSessionToken();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });

        // Limpar sessão e QR após resposta
        await client.close().catch(() => {});
        delete sessoes[nome];
        fs.unlinkSync(qrPath);

        return res.json({ success: true, message: "Sessão já conectada", qrcode: `/qrcodes/${nome}.png` });
      } else if (estado === "PAIRING") {
        console.log(`[${new Date().toISOString()}] 🔹 QR ainda válido para "${nome}"`);
        return res.json({ success: true, qrcode: `/qrcodes/${nome}.png` });
      } else {
        fs.unlinkSync(qrPath);
        console.log(`[${new Date().toISOString()}] ⚠️ QR expirado para "${nome}", gerando novo`);
      }
    }

    // 5️⃣ Gerar novo QR
    const qr = await client.qrCodeGenerate();
    if (!qr) throw new Error("Falha ao gerar QR");

    // Salvar QR em PNG
    const qrBase64 = qr.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(qrPath, qrBase64, "base64");
    console.log(`[${new Date().toISOString()}] ✅ Novo QR salvo: ${qrPath}`);

    res.json({ success: true, qrcode: `/qrcodes/${nome}.png` });

    // 6️⃣ Monitorar mudanças de estado
    client.onStateChange(async (novoEstado) => {
      console.log(`[${new Date().toISOString()}] 🔹 Sessão "${nome}" mudou estado: ${novoEstado}`);

      if (novoEstado === "CONNECTED") {
        const tokens = await client.getSessionToken();
        await acessarServidor("atualizar_sessao.php", {
          method: "POST",
          data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
        });
        console.log(`[${new Date().toISOString()}] ✅ Tokens atualizados no servidor para "${nome}"`);
      }
    });

  } catch (err) {
    console.log(`[${new Date().toISOString()}] ❌ Erro ao processar a sessão "${nome}": ${err.message}`);

    // ❌ Excluir sessão e QR local
    if (sessoes[nome]) {
      try {
        await sessoes[nome].close();
      } catch {}
      delete sessoes[nome];
    }
    if (fs.existsSync(path.join(__dirname, "../qrcodes", `${nome}.png`))) {
      fs.unlinkSync(path.join(__dirname, "../qrcodes", `${nome}.png`));
    }

    return res.json({ success: false, error: err.message });
  }
};
