const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { acessarServidor } = require("../utils/puppeteer");

const MAX_TENTATIVAS = 6;

// Armazena clientes e tentativas por sessão
const clientes = {};
const tentativas = {};

// Cria ou reutiliza cliente WPPConnect
const createClient = async (nomeSessao) => {
    if (clientes[nomeSessao]) {
        console.log(`🔄 Cliente já existe para a sessão: ${nomeSessao}`);
        return clientes[nomeSessao];
    }

    console.log(`🔧 Criando cliente para a sessão: ${nomeSessao}`);
    const client = await wppconnect.create({
        session: nomeSessao,
        puppeteerOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        autoClose: 0,
        catchQR: true, // Permite capturar QR mesmo que a sessão exista
    });

    clientes[nomeSessao] = client;
    tentativas[nomeSessao] = 0;

    return client;
};

// Gera QR Code para autenticação
const generateQRCode = async (req, res) => {
    try {
        const nomeSessao = req.params.nome;

        if (!nomeSessao) {
            return res.status(400).json({ success: false, error: 'Nome da sessão é obrigatório' });
        }

        if (clientes[nomeSessao]) {
            return res.status(400).json({ success: false, error: 'Sessão já em execução' });
        }

        const client = await createClient(nomeSessao);

        // Função para enviar QR ao servidor
        const enviarQR = async (qrCode) => {
            try {
                const respostaServidor = await acessarServidor("salvar_qrcod.php", {
                    method: "POST",
                    data: { nome: nomeSessao, base64: qrCode },
                });
                return respostaServidor;
            } catch (err) {
                console.error('❌ Erro ao enviar QR Code para o servidor:', err);
                return { success: false, error: 'Erro ao salvar QR Code no servidor' };
            }
        };

        // Função para lidar com QR Code
        const handleQRCode = async (qrCode) => {
            console.log(`📸 QR Code gerado para sessão: ${nomeSessao}`);
            const resposta = await enviarQR(qrCode);
            if (!res.headersSent) {
                res.json(resposta); // Retorna pro HTML apenas na primeira vez
            }
        };

        // Tenta pegar QR imediatamente se existir
        if (client.hasQRCode) {
            const qr = await client.getQRCode();
            await handleQRCode(qr);
        }

        // Evento para QR novo (incluindo quando expira)
        client.on('qr', async (qrCode) => {
            await handleQRCode(qrCode);
        });

        // Monitoramento do status da conexão
        client.on('status', async (status) => {
            console.log(`🔄 Status da sessão (${nomeSessao}): ${status}`);

            if (status === 'QRCODE' || status === 'CONNECTION_LOST') {
                console.log(`⚠️ QR Code expirado ou conexão perdida na sessão: ${nomeSessao}`);
                tentativas[nomeSessao]++;

                if (tentativas[nomeSessao] >= MAX_TENTATIVAS) {
                    console.log(`❌ Número máximo de tentativas alcançado na sessão: ${nomeSessao}. Excluindo...`);
                    try {
                        await client.close();
                        delete clientes[nomeSessao];
                        fs.unlinkSync(path.join(__dirname, `${nomeSessao}.json`));
                    } catch (err) {
                        console.error('❌ Erro ao excluir sessão:', err);
                    }
                    return;
                }

                console.log(`💡 Tentativa ${tentativas[nomeSessao]}/${MAX_TENTATIVAS} para reconectar...`);
            } else if (status === 'CONNECTED') {
                console.log(`✔️ Sessão ${nomeSessao} conectada com sucesso!`);
                tentativas[nomeSessao] = 0;

                try {
                    const tokens = await client.getSessionTokenBrowser();

                    const respostaServidor = await acessarServidor("atualizar_sessao.php", {
                        method: "POST",
                        data: { nome: nomeSessao, dados: JSON.stringify({ conectado: true, tokens }) },
                    });

                    console.log(`📡 Sessão ${nomeSessao} atualizada no servidor.`);
                } catch (err) {
                    console.error('❌ Erro ao atualizar sessão no servidor:', err);
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Erro ao conectar ao WhatsApp' });
        }
    }
};

module.exports = generateQRCode;
