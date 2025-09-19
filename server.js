const express = require("express");
const cors = require("cors");
const path = require("path");

const listar = require("./endpoints/listar");
const criar = require("./endpoints/criar");
const deletar = require("./endpoints/deletar");
const qrcode = require("./endpoints/qrcode");

const { acessarServidor } = require("./utils/puppeteer"); // Função para PHP

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------
// Tratamento global
// -------------------
process.on("uncaughtException", err => console.error("[Global Exception]", err));
process.on("unhandledRejection", err => console.error("[Global Rejection]", err));

// -------------------
// Middlewares
// -------------------
app.use(cors());
app.use(express.json());

// Log detalhado
app.use((req, res, next) => {
  const nomeSessao = req.params?.nome || req.body?.nome || "-";
  console.log(`[${new Date().toISOString()}] 🔹 Requisição recebida: ${req.method} ${req.path} | Sessão: ${nomeSessao}`);
  next();
});

// -------------------
// Rotas padrão
// -------------------
app.get("/listar", listar);
app.post("/criar/:nome", criar);
app.delete("/deletar/:nome", deletar);

// -------------------
// Rota QR Code com verificação de sessão
// -------------------
app.get("/qrcode/:nome.png", async (req, res) => {
  try {
    const nomeParam = req.params.nome;
    if (!nomeParam) return res.json({ success: false, error: "Nome da sessão não enviado" });

    const nome = nomeParam.replace(".png", ""); // ignora extensão

    // 1️⃣ Chama listar_sessoes.php via Puppeteer
    const response = await acessarServidor("listar_sessoes.php");
    if (!response || !response.success || !Array.isArray(response.sessoes)) {
      return res.json({ success: false, error: "Erro ao listar sessões do servidor" });
    }

    // 2️⃣ Verifica se a sessão requisitada existe
    const sessaoExiste = response.sessoes.some(s => s.nome === nome);
    if (!sessaoExiste) {
      return res.json({ success: false, error: `Sessão "${nome}" não existe` });
    }

    // 3️⃣ Chama o endpoint QR Code
    const qrcodeHandler = qrcode; // require do arquivo qrcode.js
    return qrcodeHandler(req, res);

  } catch (err) {
    console.error(`[Erro QR Route]`, err);
    return res.json({ success: false, error: "Erro interno ao processar QR Code" });
  }
});

// -------------------
// Inicia servidor
// -------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
