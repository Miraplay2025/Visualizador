const express = require("express");
const { handleQRCode } = require("./qrcodeHandler");
const { acessarServidor } = require("./utils/puppeteer");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ---------------- CRIAR SESSÃO ----------------
app.post("/criar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  try {
    const resposta = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, dados: JSON.stringify({ conectado: false }) },
    });

    if (resposta.success) return res.json({ success: true, nome: resposta.nome, arquivo: resposta.arquivo });
    else return res.json({ success: false, error: resposta.error || "Erro ao criar sessão" });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ---------------- LISTAR SESSÕES ----------------
app.get("/listar", async (req, res) => {
  try {
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    if (resposta.success && Array.isArray(resposta.sessoes)) return res.json({ success: true, sessoes: resposta.sessoes });
    else return res.json({ success: false, sessoes: [], message: resposta.message || "Nenhuma sessão encontrada" });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ---------------- QR CODE ----------------
app.get("/qrcode/:nome", handleQRCode);

// ---------------- DELETAR SESSÃO ----------------
app.delete("/deletar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  try {
    const resposta = await acessarServidor("deletar_sessao.php", {
      method: "POST",
      data: { nome },
    });

    if (resposta.success) return res.json({ success: true, message: resposta.message || `Sessão ${nome} excluída` });
    else return res.json({ success: false, error: resposta.error || "Erro ao deletar sessão" });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ---------------- START ----------------
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor rodando na porta ${PORT}`);
});
            
