// receber_dados.js

const { acessarServidor } = require("../utils/puppeteer");

/**
 * Função principal que recebe o QR Code e o nome da sessão
 * @param {string} qrCode - QR Code em base64
 * @param {string} nomeSessao - Nome da sessão do WhatsApp
 */
const receberDados = async (qrCode, nomeSessao) => {
    if (!qrCode || !nomeSessao) {
        console.error("❌ QR Code ou nome da sessão não fornecido");
        return;
    }

    console.log(`[${nomeSessao}] 📸 QR Code recebido, enviando para servidor...`);

    try {
        await enviarQrParaServidor(nomeSessao, qrCode);
    } catch (err) {
        console.error(`[${nomeSessao}] ❌ Erro ao processar QR Code:`, err);
    }
};

/**
 * Envia o QR Code para o servidor PHP
 * @param {string} nome - Nome da sessão
 * @param {string} base64 - QR Code em base64
 */
async function enviarQrParaServidor(nome, base64) {
    try {
        await acessarServidor("salvar_qrcod.php", {
            method: "POST",
            data: { nome, base64 },
        });
        console.log(`[${nome}] ✅ QR enviado para servidor`);
    } catch (err) {
        console.error(`[${nome}] ❌ Erro ao enviar QR:`, err.message);
    }
}

module.exports = receberDados;
