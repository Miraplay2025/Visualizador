const express = require("express");
const cors = require("cors");

const listar = require("./endpoints/listar");
const criar = require("./endpoints/criar");
const deletar = require("./endpoints/deletar");
const qrcode = require("./endpoints/qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Habilita CORS para qualquer origem
app.use(express.json());

// Middleware para log de requisições
app.use((req, res, next) => {
  const nomeSessao = req.params?.nome || req.body?.nome || "-";
  console.log(`[${new Date().toISOString()}] 🔹 Requisição recebida: ${req.method} ${req.path} | Sessão: ${nomeSessao}`);
  next();
});

// Rotas
app.get("/listar", listar);
app.post("/criar/:nome", criar);
app.delete("/deletar/:nome", deletar);
app.get("/qrcode/:nome.png", qrcode);

// Inicia servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
