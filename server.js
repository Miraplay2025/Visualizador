// server.js
const express = require("express");
const cors = require("cors");

const listar = require("./endpoints/listar");
const criar = require("./endpoints/criar");
const deletar = require("./endpoints/deletar");
const handleQRCode = require("./endpoints/qrcode");
const { acessarServidor } = require("./utils/puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de log
app.use((req, res, next) => {
  const nomeSessao = req.params?.nome || req.body?.nome || "-";
  console.log(`[${new Date().toISOString()}] 🔹 Requisição recebida: ${req.method} ${req.path} | Sessão: ${nomeSessao}`);
  next();
});

// Rotas padrão
app.get("/listar", listar);
app.post("/criar/:nome", criar);
app.delete("/deletar/:nome", deletar);

// Rota QRCode com verificação de existência no servidor PHP
app.get("/qrcode/:nome.png", async (req, res) => {
  try {
    let nome = req.params.nome || "";
    nome = nome.replace(".png", ""); // Ignora .png

    // 1️⃣ Verifica se a sessão existe no servidor PHP
    const phpResponse = await acessarServidor("listar_sessoes.php", {
      method: "GET",
    });

    // phpResponse.sessoes é array de objetos { nome: "Ga", conectado: false }
    const sessoes = Array.isArray(phpResponse.sessoes) ? phpResponse.sessoes : [];

    // Checa se existe alguma sessão com esse nome
    const sessaoExiste = sessoes.some(s => s.nome === nome);

    if (!sessaoExiste) {
      return res.json({ success: false, error: `Sessão "${nome}" não existe` });
    }

    // 2️⃣ Se existe, chama o handler do QRCode
    return handleQRCode(req, res);
  } catch (err) {
    console.error("❌ Erro ao verificar sessão no PHP:", err);
    return res.json({ success: false, error: "Erro ao verificar sessão no servidor" });
  }
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
