const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require("@wppconnect-team/wppconnect");
const { acessarServidor } = require("./utils/puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(bodyParser.json());

// Sessões temporárias e travas
let sessions = {};
let locks = {};

// Tempo máximo de QR code ativo (5 minutos)
const QR_TIMEOUT = 5 * 60 * 1000;

// Função de log
function log(msg) {
  console.log(`[${new Date().toISOString()}] 🔹 ${msg}`);
}

// Limpar sessão e fechar client
function cleanupSession(nome) {
  if (sessions[nome]) {
    if (sessions[nome].client) {
      sessions[nome].client.close();
    }
    if (sessions[nome].timeout) clearTimeout(sessions[nome].timeout);
    delete sessions[nome];
    log(`Sessão "${nome}" removida`);
  }
}

// Reinicia timeout do QR code
function resetQRTimeout(nome, qrPath) {
  if (sessions[nome].timeout) clearTimeout(sessions[nome].timeout);
  sessions[nome].timeout = setTimeout(() => {
    log(`QR code da sessão "${nome}" expirou após 5 minutos`);
    cleanupSession(nome);
    if (qrPath && fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
  }, QR_TIMEOUT);
}

// -------------------- ROTAS -------------------- //

// Exemplo: listar sessões (simples, pode ser expandido)
app.get("/listar", (req, res) => {
  const lista = Object.keys(sessions).map(nome => ({
    nome,
    conectado: sessions[nome]?.client ? true : false
  }));
  res.json({ success: true, sessoes: lista });
});

// Criar nova sessão
app.post("/criar/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (sessions[nome]) return res.json({ success: false, error: "Sessão já existe" });

  sessions[nome] = {}; // marca sessão criada, client será adicionado ao gerar QR
  res.json({ success: true, nome });
});

// Excluir sessão
app.delete("/deletar/:nome", (req, res) => {
  const nome = req.params.nome;
  if (!nome || !sessions[nome]) return res.json({ success: false, error: "Sessão não encontrada" });
  cleanupSession(nome);
  res.json({ success: true, nome });
});

// Gerar/obter QR code
app.get("/qrcode/:nome", async (req, res) => {
  const nome = req.params.nome;
  if (!nome) return res.json({ success: false, error: "Nome da sessão não enviado" });

  if (locks[nome]) return res.json({ success: false, error: "Já existe uma operação em andamento para esta sessão" });
  locks[nome] = true;

  const sessionDir = path.join(__dirname, "sessions", nome);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  const qrPath = path.join(sessionDir, "qrcode.png");

  try {
    // -------------------- Sessão já existe -------------------- //
    if (sessions[nome]?.client) {
      const state = await sessions[nome].client.getConnectionState();
      if (state === "CONNECTED") {
        return res.json({ success: true, message: "Sessão já conectada" });
      }

      // QR ainda válido
      if (sessions[nome].qrStatus === "valid" && fs.existsSync(qrPath)) {
        const qrBase64 = fs.readFileSync(qrPath, { encoding: "base64" });
        resetQRTimeout(nome, qrPath);
        return res.json({ success: true, message: "QR code atual ainda válido", qrBase64 });
      }

      // QR expirou: gerar novo QR na mesma instância
      log(`QR code da sessão "${nome}" expirou. Solicitando novo QR...`);
      const qrBase64 = await sessions[nome].client.getQrCode();
      fs.writeFileSync(qrPath, Buffer.from(qrBase64, "base64"));
      sessions[nome].qrStatus = "valid";
      resetQRTimeout(nome, qrPath);
      return res.json({ success: true, message: "Novo QR code gerado", qrBase64 });
    }

    // -------------------- Sessão não existe: criar nova instância -------------------- //
    const client = await createClient({
      session: nome,
      directory: sessionDir,
      headless: true,
      catchQR: (base64Qr) => {
        fs.writeFileSync(qrPath, Buffer.from(base64Qr, "base64"));
        sessions[nome] = { client, qrStatus: "valid" };
        resetQRTimeout(nome, qrPath);
        log(`QR code gerado para a sessão "${nome}"`);
      },
      statusFind: async (status) => {
        log(`Status da sessão "${nome}": ${status}`);
        try {
          if (status === "isLogged" || status === "CONNECTED") {
            clearTimeout(sessions[nome]?.timeout);
            const tokens = await client.getSessionTokenBrowser();
            await acessarServidor("atualizar_sessao.php", {
              method: "POST",
              data: { nome, dados: JSON.stringify({ conectado: true, tokens }) },
            });
            log(`Sessão "${nome}" conectada`);
            cleanupSession(nome);
          }

          if (status === "qrReadSuccess") log(`QR da sessão "${nome}" escaneado, aguardando conexão...`);
          if (status === "qrReadFail" || status === "qrCodeSessionInvalid") {
            sessions[nome].qrStatus = "expired";
            log(`QR da sessão "${nome}" expirou ou inválido`);
          }
        } catch (err) {
          log(`❌ Erro monitorando status: ${err.message}`);
          cleanupSession(nome);
        }
      },
    });

    sessions[nome].client = client;

    // Espera QR ser gerado
    const waitForQR = () =>
      new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (sessions[nome]?.qrStatus === "valid" && fs.existsSync(qrPath)) {
            clearInterval(interval);
            const qrBase64 = fs.readFileSync(qrPath, { encoding: "base64" });
            resolve(qrBase64);
          }
          if (attempts > 50) {
            clearInterval(interval);
            reject("Falha ao gerar QR code");
          }
        }, 100);
      });

    const qrBase64 = await waitForQR();
    res.json({ success: true, qrBase64 });

  } catch (err) {
    log(`❌ Erro geral: ${err.message}`);
    cleanupSession(nome);
    res.json({ success: false, error: err.message });
  } finally {
    delete locks[nome];
  }
});

// Inicia servidor
app.listen(PORT, () => log(`Servidor rodando na porta ${PORT}`));
