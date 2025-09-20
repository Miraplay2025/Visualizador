const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { acessarServidor } = require("../utils/puppeteer");

let tentativaContador = 0; // Contador para monitorar tentativas de reconexão
const MAX_TENTATIVAS = 6; // Limite máximo de tentativas

let client = null; // Variável global para o cliente do WhatsApp
let execucaoEmAndamento = {}; // Objeto para rastrear execuções em andamento de sessões

// Função para enviar QR para o servidor PHP
async function enviarQrParaServidor(nome, base64) {
    try {
        await acessarServidor("salvar_qrcod.php", {
            method: "POST",
            data: { nome, base64 },
        });
    } catch (err) {
        console.error('❌ Erro ao enviar QR para o servidor:', err);
    }
}

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
        },
        autoClose: 0, // Impede o fechamento automático do cliente
    });

    return client;
};

// Função que gera o QR Code para autenticação
const generateQRCode = async (req, res) => {
    const nomeSessao = req.params.nome;

    // Verifica se o nome da sessão foi passado
    if (!nomeSessao) {
        return res.status(400).json({ success: false, error: 'Nome da sessão não fornecido' });
    }

    // Verifica se já há uma execução em andamento para a mesma sessão
    if (execucaoEmAndamento[nomeSessao]) {
        return res.status(400).json({ success: false, error: 'Já existe uma execução em andamento para essa sessão.' });
    }

    // Marca que há uma execução em andamento para a sessão
    execucaoEmAndamento[nomeSessao] = true;

    try {
        // Cria ou reutiliza o cliente do WhatsApp
        client = await createClient(nomeSessao);

        // Evento para gerar e enviar QR Code
        client.on('qr', async (qrCode) => {
            console.log('📸 QR Code gerado!');

            // Envia o QR Code como base64 para o servidor PHP
            await enviarQrParaServidor(nomeSessao, qrCode);

            // Envia o QR Code como base64 para o cliente
            res.json({
                success: true,
                qrcode: qrCode,
                message: 'QR Code gerado com sucesso!',
            });
        });

        // Monitoramento do status da conexão
        client.on('status', async (status) => {
            console.log(`🔄 Status da sessão: ${status}`);

            // Verifica se o QR Code expirou ou se houve perda de conexão
            if (status === 'QRCODE' || status === 'CONNECTION_LOST') {
                console.log('⚠️ QR Code expirado ou conexão perdida.');

                tentativaContador++;

                if (tentativaContador >= MAX_TENTATIVAS) {
                    console.log('❌ Número máximo de tentativas alcançado. Excluindo sessão...');
                    try {
                        client.close(); // Fecha a sessão
                        fs.unlinkSync(path.join(__dirname, `${nomeSessao}.json`)); // Exclui o arquivo da sessão (se houver)
                    } catch (err) {
                        console.error('❌ Erro ao excluir sessão:', err);
                    }
                    // Marca a execução como finalizada
                    execucaoEmAndamento[nomeSessao] = false;
                    return res.status(500).json({ success: false, error: 'Erro ao conectar após várias tentativas. Sessão excluída.' });
                }

                console.log(`💡 Tentativa ${tentativaContador}/${MAX_TENTATIVAS} para reconectar...`);

                // Tenta gerar novo QR Code (manter a sessão aberta)
                client.emit('qr', client.getQRCode());

                // Envia o novo QR Code para o servidor PHP
                await enviarQrParaServidor(nomeSessao, client.getQRCode());
            } else if (status === 'CONNECTED') {
                console.log('✔️ Conexão estabelecida com sucesso!');
                tentativaContador = 0; // Reseta o contador de tentativas

                // Obtém o token de sessão do navegador
                const tokens = await client.getSessionTokenBrowser();
                
                // Envia os dados ao servidor
                await acessarServidor("atualizar_sessao.php", {
                    method: "POST",
                    data: { nome: nomeSessao, dados: JSON.stringify({ conectado: true, tokens }) },
                });

                // Marca a execução como finalizada
                execucaoEmAndamento[nomeSessao] = false;
            }
        });

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        res.status(500).json({ success: false, error: 'Erro ao conectar ao WhatsApp' });

        // Marca a execução como finalizada
        execucaoEmAndamento[nomeSessao] = false;
    }
};

module.exports = generateQRCode;
