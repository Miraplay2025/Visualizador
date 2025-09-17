const express = require("express");
const fs = require("fs");
const path = require("path");
const { acessarServidor } = require("./utils/puppeteer");
const { createClient } = require("@wppconnect-team/wppconnect");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Sessões temporárias
let sessions = {};
let locks = {};

function logRequest(route, msg) {
  console.log(`[${new Date().toISOString()}] 🔹 [${route}] ${msg}`);
}

// ===================== ENDPOINT CRIAR =====================
app.post("/criar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  try {
    const resposta = await acessarServidor("salvar_sessao.php", {
      method: "POST",
      data: { nome, conectado: false },
    });

    logRequest("/criar", `Resposta salvar_sessao.php => ${JSON.stringify(resposta)}`);
    return res.json(resposta);
  } catch (err) {
    logRequest("/criar", `❌ Erro ao criar sessão: ${err.message}`);
    return res.json({ success: false, error: err.message });
  }
});

// ===================== ENDPOINT LISTAR =====================
app.get("/listar", async (req, res) => {
  try {
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    logRequest("/listar", `Resposta listar_sessoes.php => ${JSON.stringify(resposta)}`);
    return res.json(resposta);
  } catch (err) {
    logRequest("/listar", `❌ Erro ao listar sessões: ${err.message}`);
    return res.json({ success: false, error: err.message });
  }
});

// ===================== ENDPOINT QRCODE =====================
app.get("/qrcode/:nome.png", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) {
    return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  }
  locks[nome] = true;

  try {
    // 1️⃣ Verifica se a sessão existe no servidor
    const resposta = await acessarServidor("listar_sessoes.php", { method: "GET" });
    logRequest("/qrcode", `Resposta listar_sessoes.php => ${JSON.stringify(resposta)}`);

    if (!resposta.success || !resposta.sessoes?.includes(nome)) {
      return res.json({ success: false, error: "Sessão não encontrada" });
    }

    const sessionDir = path.join(__dirname, "qrcodes");
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);
    const qrPath = path.join(sessionDir, `${nome}.png`);

    // 2️⃣ Se já existe sessão, checa status do WPPConnect
    if (sessions[nome] && sessions[nome].client) {
      try {
        const state = await sessions[nome].client.getConnectionState();
        logRequest("/qrcode", `Status atual da sessão "${nome}" => ${state}`);

        if (state === "CONNECTED") {
          return res.json({ success: true, message: "Sessão já conectada" });
        }

        if (sessions[nome].qrStatus === "valid") {
          return res.json({ success: true, message: "QR code atual ainda válido" });
        }

        if (sessions[nome].qrStatus === "expired") {
          logRequest("/qrcode", `QR da sessão "${nome}" expirado → gerar novo`);
          if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
          delete sessions[nome];
        }
      } catch (err) {
        logRequest("/qrcode", `Erro ao verificar status da sessão: ${err.message}`);
      }
    }

    // 3️⃣ Criar nova sessão
    sessions[nome] = { client: null, qrPath, qrStatus: "pending" };

    const client = await createClient({
      session: nome,
      catchQR: async (base64Qr) => {
        try {
          const qrBuffer = Buffer.from(base64Qr.replace("data:image/png;base64,", ""), "base64");
          fs.writeFileSync(qrPath, qrBuffer);
          sessions[nome].qrStatus = "valid";

          logRequest("/qrcode", `QR code gerado para sessão "${nome}"`);
          res.setHeader("Content-Type", "image/png");
          res.send(qrBuffer);
          logRequest("/qrcode", `✅ QR code enviado com sucesso`);
        } catch (err) {
          logRequest("/qrcode", `❌ Erro ao salvar QR: ${err.message}`);
          res.json({ success: false, error: "Falha ao gerar QR" });

          // Remove sessão temporária em caso de erro
          if (sessions[nome]) {
            try { if (sessions[nome].client) await sessions[nome].client.close(); } catch {}
            delete sessions[nome];
            if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
            logRequest("/qrcode", `Sessão "${nome}" removida devido a erro no QR`);
          }
        }
      },
      statusFind: async (statusSession) => {
        logRequest("/qrcode", `Status da sessão "${nome}" => ${statusSession}`);

        try {
          if (statusSession === "isLogged" || statusSession === "CONNECTED") {
            const tokens = await client.getSessionTokenBrowser();
            const updateResp = await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, conectado: true, tokens },
            });
            logRequest("/qrcode", `Sessão "${nome}" conectada. updateResp => ${JSON.stringify(updateResp)}`);

            // Remove sessão temporária após conexão
            if (sessions[nome]) {
              try { if (sessions[nome].client) await sessions[nome].client.close(); } catch {}
              delete sessions[nome];
              if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
              logRequest("/qrcode", `Sessão "${nome}" conectada → sessão temporária removida`);
            }
          }

          if (statusSession === "qrReadSuccess") {
            logRequest("/qrcode", `QR da sessão "${nome}" foi escaneado, aguardando conexão...`);
          }

          if (statusSession === "qrReadFail" || statusSession === "qrCodeSessionInvalid") {
            sessions[nome].qrStatus = "expired";
            logRequest("/qrcode", `QR da sessão "${nome}" expirou ou inválido`);
          }
        } catch (err) {
          logRequest("/qrcode", `❌ Erro durante monitoramento do status: ${err.message}`);
          if (sessions[nome]) {
            try { if (sessions[nome].client) await sessions[nome].client.close(); } catch {}
            delete sessions[nome];
            if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
            logRequest("/qrcode", `Sessão "${nome}" removida devido a erro no status`);
          }
        }
      },
    });

    sessions[nome].client = client;
  } catch (err) {
    logRequest("/qrcode", `❌ Erro geral: ${err.message}`);
    res.json({ success: false, error: err.message });

    if (sessions[nome]) {
      try { if (sessions[nome].client) await sessions[nome].client.close(); } catch {}
      delete sessions[nome];
      logRequest("/qrcode", `Sessão "${nome}" removida devido a erro`);
    }
  } finally {
    delete locks[nome];
  }
});

// ===================== ENDPOINT DELETAR =====================
app.delete("/deletar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  try {
    const resposta = await acessarServidor("deletar_sessao.php", {
      method: "POST",
      data: { nome },
    });

    logRequest("/deletar", `Resposta deletar_sessao.php => ${JSON.stringify(resposta)}`);
    return res.json(resposta);
  } catch (err) {
    logRequest("/deletar", `❌ Erro ao deletar sessão: ${err.message}`);
    return res.json({ success: false, error: err.message });
  }
});

// ===================== START =====================
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor rodando na porta ${PORT}`);
});
