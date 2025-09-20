  const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const { acessarServidor } = require("../utils/puppeteer");

const MAX_TENTATIVAS = 6; // Limite máximo de tentativas

// Armazena clientes por sessão
const clientes = {};
const tentativas = {};

// Função que cria o cliente WPPConnect
const createClient = async (nomeSessao) => {
    if (clientes[nomeSessao]) {
        console.log(`🔄 Reutilizando cliente existente para a sessão: ${nomeSessao}`);
        return clientes[nomeSessao];
    }

    console.log(`🔧 Criando cliente para a sessão: ${nomeSessao}`);
    const client = await wppconnect.create({
        session: nomeSessao,
        puppeteerOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        autoClose: 0, // Mantém a sessão aberta
    });

    clientes[nomeSessao] = client;
    tentativas[nomeSessao] = 0;

    return client;
};

// Função que gera o QR Code para autenticação
const generateQRCode = async (req, res) => {
    try {
        const nomeSessao = req.params.nome;

        if (!nomeSessao) {
            return res.status(400).json({ success: false, error: 'Nome da sessão é obrigatório' });
        }

        // Se já existe sessão em execução, impedir duplicação
        if (clientes[nomeSessao]) {
            return res.status(400).json({ success: false, error: 'Sessão já em execução' });
        }

        const client = await createClient(nomeSessao);

        // Evento para gerar e enviar QR Code
        client.on('qr', async (qrCode) => {
            console.log(`📸 QR Code gerado para sessão: ${nomeSessao}`);

            try {
                // Envia QR Code para o servidor PHP
                const respostaServidor = await acessarServidor("salvar_qrcod.php", {
                    method: "POST",
                    data: { nome: nomeSessao, base64: qrCode },
                });

                // Retorna para o HTML a resposta do servidor
                res.json(respostaServidor);
            } catch (err) {
                console.error('❌ Erro ao enviar QR Code para o servidor:', err);
                res.status(500).json({ success: false, error: 'Erro ao salvar QR Code no servidor' });
            }
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
                    // Obtém tokens da sessão
                    const tokens = await client.getSessionTokenBrowser();

                    // Envia dados de conexão para o servidor PHP
                    const respostaServidor = await acessarServidor("atualizar_sessao.php", {
                        method: "POST",
                        data: { nome: nomeSessao, dados: JSON.stringify({ conectado: true, tokens }) },
                    });

                    console.log(`📡 Sessão ${nomeSessao} atualizada no servidor.`);
                    // Opcional: se quiser devolver essa resposta pro HTML também
                    // mas como a conexão já está estabelecida, não existe mais o "res" do QR.
                } catch (err) {
                    console.error('❌ Erro ao atualizar sessão no servidor:', err);
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        res.status(500).json({ success: false, error: 'Erro ao conectar ao WhatsApp' });
    }
};

module.exports = generateQRCode;
   
