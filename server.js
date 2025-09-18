const express = require("express");
const cors = require("cors");

// Endpoints
const listar = require("./endpoints/listar");
const criar = require("./endpoints/criar");
const deletar = require("./endpoints/deletar");
const qrcode = require("./endpoints/qrcode"); // Deve exportar função (req,res)=>{}

// Inicializa app
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); 
app.use(express.json());

// Middleware para log de requisições
app.use((req, res, next) => {
  const nomeSessao = req.params?.nome || req.body?.nome || "-";
  console.log(`[${new Date().toISOString()}] 🔹 Requisição recebida: ${req.method} ${req.path} | Sessão: ${nomeSessao}`);
  next();
});

// Rotas
app.get("/listar", (req, res) => listar(req, res));
app.post("/criar/:nome", (req, res) => criar(req, res));
app.delete("/deletar/:nome", (req, res) => deletar(req, res));
app.get("/qrcode/:nome", (req, res) => qrcode(req, res)); // QR sem extensão, facilita base64

// Inicializa servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
