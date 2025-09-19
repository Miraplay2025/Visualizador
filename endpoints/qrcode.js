const wppconnect = require("wppconnect");

/**
 * Endpoint para gerar e retornar o QR Code de uma sessão.
 * Retorna JSON com sucesso/falha e QR Code em base64.
 */
module.exports = async (req, res) => {
  try {
    const nomeSessao = req.params.nome || req.body.nome;

    // 1️⃣ Verificação obrigatória
    if (!nomeSessao) {
      return res.json({ success: false, error: "Nome da sessão é obrigatório" });
    }

    console.log(`[${new Date().toISOString()}] 🔹 Solicitação de QR Code para sessão: ${nomeSessao}`);

    // 2️⃣ Cria a instância do wppconnect
    await wppconnect.create({
      session: nomeSessao,
      catchQR: (base64Qr) => {
        // Loga somente no servidor
        console.log(`[${new Date().toISOString()}] ✅ QR Code gerado para sessão: ${nomeSessao}`);

        // 3️⃣ Retorna para o frontend em JSON
        res.json({
          success: true,
          qrcode: base64Qr, // QR em base64
        });
      },
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    }).then((client) => {
      client.isLoggedIn().then((logged) => {
        if (logged) {
          console.log(`[${new Date().toISOString()}] 🔹 Sessão já autenticada: ${nomeSessao}`);
          res.json({
            success: true,
            message: `Sessão "${nomeSessao}" já está autenticada.`,
          });
        }
      });
    });
  } catch (err) {
    console.error(`[Erro QRCode Handler]`, err);
    return res.json({
      success: false,
      error: "Erro interno ao gerar QR Code",
      details: err.message,
    });
  }
};

