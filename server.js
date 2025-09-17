// server.js
const express = require("express");
const bodyParser = require("body-parser");
const { acessarServidor } = require("./utils/puppeteer"); // PHP interactions
const { gerarqrcode } = require("./wppconnect/qrcode.js"); // QR code generator

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== Helper: logar resposta formatada =====
function logResposta(endpoint, resposta) {
  console.log(
    `[${new Date().toISOString()}] 🔹 Resposta ${endpoint}:\n${JSON.stringify(resposta, null, 2)}`
  );
}

// ===== Listar Sessões =====
app.get("/listar", async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] 🔹 Listando sessões`);
    const resposta = await acessarServidor("listar_sessoes.php", { method: "POST", data: {} });
    logResposta("listar_sessoes.php", resposta);
    return res.json(resposta); // devolve exatamente o JSON recebido
  } catch (err) {
    console.error("Erro listar sessões:", err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ===== Criar Sessão =====
app.post("/criar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão é obrigatório" });

  try {
    console.log(`[${new Date().toISOString()}] 🔹 Criando sessão: ${nome}`);
    const dados = JSON.stringify({ conectado: false });
    const resposta = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados }
    });
    logResposta("salvar_sessao.php", resposta);
    return res.json(resposta);
  } catch (err) {
    console.error("Erro criar sessão:", err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ===== Deletar Sessão =====
app.delete("/deletar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão é obrigatório" });

  try {
    console.log(`[${new Date().toISOString()}] 🔹 Deletando sessão: ${nome}`);
    const resposta = await acessarServidor("deletar_sessao.php", {
      method: "POST",
      data: { nome }
    });
    logResposta("deletar_sessao.php", resposta);
    return res.json(resposta);
  } catch (err) {
    console.error("Erro deletar sessão:", err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ===== Gerar QR Code =====
app.get("/qrcode/:nome.png", async (req, res) => {
  const nome = req.params.nome.replace(".png", "");
  if (!nome) return res.json({ success: false, error: "Nome da sessão é obrigatório" });

  try {
    console.log(`[${new Date().toISOString()}] 🔹 Verificando sessão: ${nome}`);

    // 1️⃣ Listar todas as sessões
    const listar = await acessarServidor("listar_sessoes.php", { method: "POST", data: {} });
    logResposta("listar_sessoes.php", listar);

    if (!listar.success || !Array.isArray(listar.sessoes)) {
      return res.json({ success: false, error: "Não foi possível listar sessões", raw: listar });
    }

    // 2️⃣ Procurar a sessão desejada
    const sessao = listar.sessoes.find(s => s.nome === nome);
    if (!sessao) {
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 3️⃣ Verificar status conectado
    if (sessao.conectado) {
      return res.json({ success: true, message: "Sessão já está conectada", sessao });
    }

    // 4️⃣ Gerar QR code via qrcode.js
    console.log(`[${new Date().toISOString()}] 🔹 Gerando QR code para sessão: ${nome}`);
    const resultado = await gerarqrcode(nome);
    logResposta("qrcode.js", resultado);

    if (!resultado.success) {
      return res.json({ success: false, error: resultado.error || "Erro ao gerar QR code", raw: resultado });
    }

    // ✅ Caso qrcode.js já retorne link da imagem PNG
    if (resultado.link && resultado.link.endsWith(".png")) {
      return res.json({
        success: true,
        message: "QR code gerado com sucesso",
        qrcode: resultado.link,
        detalhes: resultado
      });
    }

    // ✅ Caso qrcode.js retorne buffer/base64
    if (resultado.qrcode) {
      const imgBuffer = Buffer.isBuffer(resultado.qrcode)
        ? resultado.qrcode
        : Buffer.from(resultado.qrcode, "base64");

      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(imgBuffer);
    }

    // Caso nenhum formato válido
    return res.json({ success: false, error: "Formato de QR code inválido", raw: resultado });

  } catch (err) {
    console.error("Erro QR code:", err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor iniciado na porta ${PORT}`);
});
  
