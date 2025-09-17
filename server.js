const express = require("express");
const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("./utils/puppeteer");
const { createClient } = require("@wppconnect-team/wppconnect");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Armazena sessões temporárias só durante a execução do QR
let sessions = {};
let locks = {}; // trava requisições simultâneas

function logRequest(route, msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [${route}] ${msg}`);
}

// ===================== ENDPOINT CRIAR =====================
app.post("/criar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  const resposta = await acessarServidor("salvar_sessao.php", {
    method: "POST",
    data: { nome, conectado: false },
  });

  logRequest("/criar", `Resposta salvar_sessao.php => ${JSON.stringify(resposta)}`);
  return res.json(resposta);
});

// ===================== ENDPOINT LISTAR =====================
app.get("/listar", async (req, res) => {
  const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
  logRequest("/listar", `Resposta listar_sessoes.php => ${JSON.stringify(resposta)}`);
  return res.json(resposta);
});

// ===================== ENDPOINT QRCODE =====================
app.get("/qrcode/:nome.png", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  // 🔒 Evita requisições simultâneas para mesma sessão
  if (locks[nome]) {
    return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  }
  locks[nome] = true;

  try {
    // 1️⃣ Verifica se a sessão existe no servidor
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    logRequest("/qrcode", `Resposta listar_sessoes.php => ${JSON.stringify(resposta)}`);

    if (!resposta.success || !resposta.sessoes?.includes(nome)) {
      delete locks[nome];
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    // 2️⃣ Cria sessão temporária localmente
    const sessionDir = path.join(__dirname, "qrcodes");
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);
    const qrPath = path.join(sessionDir, `${nome}.png`);

    sessions[nome] = { client: null, qrPath, qrStatus: "pendente" };

    const client = await createClient({
      session: nome,
      catchQR: async (base64Qr) => {
        try {
          const qrBuffer = Buffer.from(base64Qr.replace("data:image/png;base64,", ""), "base64");
          fs.writeFileSync(qrPath, qrBuffer);
          sessions[nome].qrStatus = "gerado";
          logRequest("/qrcode", `QR code gerado para sessão "${nome}"`);

          res.setHeader("Content-Type", "image/png");
          res.send(qrBuffer);
          logRequest("/qrcode", `✅ QR code enviado com sucesso: /qrcodes/${nome}.png`);
        } catch (err) {
          logRequest("/qrcode", `❌ Erro ao salvar QR: ${err.message}`);
          res.json({ success: false, error: "Falha ao gerar QR" });
        }
      },
      statusFind: async (statusSession) => {
        if (statusSession === "CONNECTED") {
          const tokens = await client.getSessionTokenBrowser();
          const updateResp = await acessarServidor("atualizar_sessao.php", {
            method: "POST",
            data: { nome, conectado: true, tokens },
          });
          logRequest("/qrcode", `Sessão "${nome}" conectada. updateResp => ${JSON.stringify(updateResp)}`);
        }
      },
    });

    sessions[nome].client = client;
  } catch (err) {
    logRequest("/qrcode", `❌ Erro geral: ${err.message}`);
    res.json({ success: false, error: err.message });
  } finally {
    // 🔴 Sempre limpar sessão temporária e liberar lock
    if (sessions[nome]) {
      try {
        if (sessions[nome].client) await sessions[nome].client.close();
      } catch {}
      delete sessions[nome];
    }
    delete locks[nome];
    logRequest("/qrcode", `Sessão "${nome}" removida do Render`);
  }
});

// ===================== ENDPOINT DELETAR =====================
app.delete("/deletar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  const resposta = await acessarServidor("deletar_sessao.php", {
    method: "POST",
    data: { nome },
  });

  logRequest("/deletar", `Resposta deletar_sessao.php => ${JSON.stringify(resposta)}`);
  return res.json(resposta);
});

// ===================== START =====================
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor rodando na porta ${PORT}`);
});
