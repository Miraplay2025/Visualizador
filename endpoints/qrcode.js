const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { acessarServidor } = require('../utils/puppeteer');

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

// Função que cria o cliente WPPConnect
const createClient = async (nomeSessao) => {
    if (client) {
        console.log('🔄 Reutilizando cliente existente...');
        return client;
    }

    console.log(`🔧 Criando cliente para a sessão: ${nomeSessao}`);
    client = await wppconnect.create({
        session: nomeSessao,
        puppeteerOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        autoClose: 0, // Impede fechamento automático
    });

    return client;
};

// Função que envia QR Code para o servidor
const enviarQRCodeServidor = async (nomeSessao, qrCode) => {
    try {
        const respostaServidor = await acessarServidor('salvar_qrcod.php', {
            method: 'POST',
            data: { nome: nomeSessao, base64: qrCode },
        });
        return respostaServidor;
    } catch (err) {
        console.error('❌ Erro ao enviar QR Code para o servidor:', err);
        return { success: false, error: 'Erro ao salvar QR Code no servidor' };
    }
};

// Função principal para gerar e monitorar QR Code
const generateQRCode = async (req, res) => {
    try {
        const nomeSessao = req.params.nome;
        if (!nomeSessao) {
            return res.status(400).json({ success: false, error: 'Nome da sessão não fornecido' });
        }

        client = await createClient(nomeSessao);

        // Evento de QR Code
        client.on('qr', async (qrCode) => {
            console.log('📸 QR Code gerado! Enviando para o servidor...');
            const resposta = await enviarQRCodeServidor(nomeSessao, qrCode);

            if (resposta.success) {
                console.log('✔️ QR Code salvo no servidor com sucesso!');
            } else {
                console.error('❌ Falha ao salvar QR Code no servidor:', resposta.error);
            }

            // Envia a resposta final ao HTML
            res.json(resposta);
        });

        // Monitoramento do status da sessão
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
                    return res.status(500).json({ success: false, error: 'Erro ao conectar após várias tentativas. Sessão excluída.' });
                }

                console.log(`💡 Tentativa ${tentativaContador}/${MAX_TENTATIVAS} para reconectar...`);

                // Atualiza QR Code e envia novamente ao servidor
                const novoQRCode = await client.getQRCode();
                await enviarQRCodeServidor(nomeSessao, novoQRCode);
            } else if (status === 'CONNECTED') {
                console.log('✔️ Conexão estabelecida com sucesso!');
                tentativaContador = 0;

                // Envia a mensagem assim que conectado
                const numero = '1234567890@c.us';
                const mensagem = 'Olá! Esta é uma mensagem enviada via WPPConnect.';
                sendMessage(nomeSessao, numero, mensagem);
            }
        });

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        res.status(500).json({ success: false, error: 'Erro ao conectar ao WhatsApp' });
    }
};

module.exports = generateQRCode;
