const express = require("express");
const cors = require("cors");
const path = require("path");

const criarSessao = require("./rotas/criarSessao");
const listarSessoes = require("./rotas/listarSessoes");
const obterQrcode = require("./rotas/obterQrcode");
const deletarSessao = require("./rotas/deletarSessao");
const salvarDados = require("./rotas/salvarDados");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/qrcodes", express.static(path.join(__dirname, "qrcodes")));

// Middleware de log global
app.use((req, res, next) => {
  const nomeSessao = req.params.nome || req.body.nome || "nome da sessão não passada";
  console.log(`[${new Date().toISOString()}] 🔹 Requisição recebida: ${req.method} ${req.originalUrl} | Sessão: ${nomeSessao}`);

  const originalJson = res.json;
  res.json = function (data) {
    console.log(`[${new Date().toISOString()}] ✅ Resposta enviada (${nomeSessao}): ${JSON.stringify(data)}`);
    originalJson.call(this, data);
  };

  next();
});

// Rotas
app.post("/criar", criarSessao);
app.get("/listar", listarSessoes);
app.get("/qrcode/:nome", obterQrcode);
app.delete("/deletar/:nome", deletarSessao);
app.post("/salvar", salvarDados);

// PORT obrigatória no Render
const PORT = process.env.PORT;
if (!PORT) {
  console.error("⚠️ PORT não definida no ambiente");
  process.exit(1);
}

app.listen(PORT, () => console.log(`[${new Date().toISOString()}] 🔥 Servidor rodando na porta ${PORT}`));
