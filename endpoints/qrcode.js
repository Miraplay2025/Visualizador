const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');

let tentativaContador = 0; // Contador para monitorar tentativas de reconexão
const MAX_TENTATIVAS = 6; // Limite máximo de tentativas

let client = null; // Variável global para o cliente do WhatsApp

// Função que envia a mensagem via WhatsApp
const sendMessage = async (nomeSessao, numero, mensagem) => {
    try {
        // Verifica se o cliente já está criado
        if (!client) {
            console.error('Cliente não está criado.');
            return;
        }

        console.log('🌐 Enviando mensagem via WhatsApp...');

        // Envia a mensagem
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
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Necessário em ambientes sem interface gráfica
        }
    });

    return client;
};

// Função que gera o QR Code para autenticação
const generateQRCode = async (req, res) => {
    try {
        const nomeSessao = req.params.nome;

        if (!nomeSessao) {
            return res.status(400).json({ success: false, error: 'Nome da sessão não fornecido' });
        }

        // Cria ou reutiliza o cliente do WhatsApp
        client = await createClient(nomeSessao);

        // Evento para gerar e enviar QR Code
        client.on('qr', (qrCode) => {
            // Retorna o QR Code como base64
            console.log('📸 QR Code gerado!');

            // Envia o QR Code como base64 para o cliente
            res.json({
                success: true,
                qrcode: qrCode,
                message: 'QR Code gerado com sucesso!',
            });
        });

        // Monitoramento do status da conexão
        client.on('status', (status) => {
            console.log(`🔄 Status da sessão: ${status}`);

            // Verifica se o QR Code expirou ou se houve perda de conexão
            if (status === 'QRCODE' || status === 'CONNECTION_LOST') {
                console.log('⚠️ QR Code expirado ou conexão perdida.');

                tentativaContador++;

                if (tentativaContador >= MAX_TENTATIVAS) {
                    console.log('❌ Número máximo de tentativas alcançado. Excluindo sessão...');
                    client.close(); // Fecha a sessão
                    fs.unlinkSync(path.join(__dirname, `${nomeSessao}.json`)); // Exclui o arquivo da sessão (se houver)
                    return res.status(500).json({ success: false, error: 'Erro ao conectar após várias tentativas. Sessão excluída.' });
                }

                console.log(`💡 Tentativa ${tentativaContador}/${MAX_TENTATIVAS} para reconectar...`);

                // Tenta gerar novo QR Code (manter a sessão aberta)
                client.emit('qr', client.getQRCode());
            } else if (status === 'CONNECTED') {
                console.log('✔️ Conexão estabelecida com sucesso!');
                tentativaContador = 0; // Reseta o contador de tentativas

                // Envia a mensagem assim que a conexão for bem-sucedida
                const numero = '1234567890@c.us'; // Número de WhatsApp do destinatário, no formato E.164
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
