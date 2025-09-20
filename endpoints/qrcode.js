const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { acessarServidor } = require("../utils/puppeteer"); // Certifique-se que o caminho está correto

let tentativaContador = 0; // Contador para monitorar tentativas de reconexão
const MAX_TENTATIVAS = 6; // Limite máximo de tentativas

let client = null; // Variável global para o cliente do WhatsApp

// Função que envia a mensagem via WhatsApp
const sendMessage = async (nomeSessao, numero, mensagem) => {
    try {
        if (!client) {
            console.error('Cliente não está criado.');
            return;
        }

        console.log('🌐 Enviando mensagem via WhatsApp...');
        await client.sendText(numero, mensagem);
        console.log(`✔️ Mensagem enviada para ${numero}: "${mensagem}"`);

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
    }
};

/**
 * Função para enviar QR Code para o servidor PHP
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

/**
 * Função interna que processa o QR Code e envia para o servidor
 * @param {string} qrCode 
 * @param {string} nomeSessao 
 */
const processarQrCode = async (qrCode, nomeSessao) => {
    if (!qrCode || !nomeSessao) {
        console.error("❌ QR Code ou nome da sessão não fornecido");
        return;
    }
    console.log(`[${nomeSessao}] 📸 QR Code recebido, enviando para servidor...`);
    await enviarQrParaServidor(nomeSessao, qrCode);
};

/**
 * Função principal que inicia a sessão do WPPConnect
 * @param {string} nomeSessao 
 */
const startWppConnect = async (nomeSessao) => {
    try {
        client = await wppconnect.create({
            session: nomeSessao,
            puppeteerOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            autoClose: 0,
            onLoadingScreen: (percent, message) => {
                console.log(`${percent}% - ${message}`);
            },
            onQrCode: (qr) => {
                console.log('📸 QR Code gerado. Escaneie com o WhatsApp:');
                console.log(qr);
                processarQrCode(qr, nomeSessao).catch(err => {
                    console.error('❌ Erro ao processar QR Code:', err);
                });
            }
        });

        console.log(`[${nomeSessao}] Bot conectado com sucesso!`);

        // Monitoramento de status
        client.on('status', async (status) => {
            console.log(`🔄 Status da sessão: ${status}`);

            if (status === 'QRCODE' || status === 'CONNECTION_LOST') {
                console.log('⚠️ QR Code expirado ou conexão perdida.');

                tentativaContador++;

                if (tentativaContador >= MAX_TENTATIVAS) {
                    console.log('❌ Número máximo de tentativas alcançado. Excluindo sessão...');
                    try {
                        client.close();
                        fs.unlinkSync(path.join(__dirname, `${nomeSessao}.json`));
                    } catch (err) {
                        console.error('❌ Erro ao excluir sessão:', err);
                    }
                    return;
                }

                console.log(`💡 Tentativa ${tentativaContador}/${MAX_TENTATIVAS} para reconectar...`);

                // Tenta gerar novo QR Code
                try {
                    const novoQRCode = await client.getQRCode();
                    processarQrCode(novoQRCode, nomeSessao).catch(err => {
                        console.error('❌ Erro ao processar novo QR Code:', err);
                    });
                } catch (err) {
                    console.error('❌ Erro ao gerar novo QR Code:', err);
                }

            } else if (status === 'CONNECTED') {
                console.log('✔️ Conexão estabelecida com sucesso!');
                tentativaContador = 0;

                const numero = '1234567890@c.us';
                const mensagem = 'Olá! Esta é uma mensagem enviada via WPPConnect.';
                sendMessage(nomeSessao, numero, mensagem);
            }
        });

    } catch (erro) {
        console.error('❌ Erro ao criar a sessão:', erro);
    }
};

module.exports = startWppConnect;
