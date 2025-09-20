const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');

// Importa o módulo receber_dados.js
const receberDados = require('./receber_dados');

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
        autoClose: 0,
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

        // Cria ou reutiliza o cliente
        client = await createClient(nomeSessao);

        // Evento para gerar QR Code
        client.on('qr', (qrCode) => {
            console.log('📸 QR Code gerado!');

            // Chama o receber_dados.js passando qrCode e nomeSessao
            try {
                receberDados(qrCode, nomeSessao);
            } catch (err) {
                console.error('❌ Erro ao chamar receber_dados.js:', err);
            }
        });

        // Monitoramento do status da conexão
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

                // Atualiza o QR Code chamando novamente receber_dados.js
                try {
                    const novoQRCode = await client.getQRCode();
                    receberDados(novoQRCode, nomeSessao);
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

        // Retorna resposta inicial ao cliente HTTP
        res.json({ success: true, message: 'Processo de geração de QR Code iniciado!' });

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        res.status(500).json({ success: false, error: 'Erro ao conectar ao WhatsApp' });
    }
};

module.exports = generateQRCode;
