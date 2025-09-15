const express = require("express");
const cors = require("cors");
const path = require("path");

// Importa rotas
const criarSessao = require("./rotas/criarSessao");
const listarSessoes = require("./rotas/listarSessoes");
const obterQrcode = require("./rotas/obterQrcode");
const deletarSessao = require("./rotas/deletarSessao");
const salvarDados = require("./rotas/salvarDados");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/qrcodes", express.static(path.join(__dirname, "qrcodes")));

// Rotas
app.post("/criar", criarSessao);
app.get("/listar", listarSessoes);
app.get("/qrcode/:nome", obterQrcode);
app.delete("/deletar/:nome", deletarSessao);
app.post("/salvar", salvarDados);

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
