const wppconnect = require('@wppconnect-team/wppconnect'); // Biblioteca para conexão com WhatsApp
const fs = require('fs');
const path = require('path');

// Caminho onde as sessões serão armazenadas
const sessionsDir = path.join(__dirname, 'sessions');

// Garante que a pasta de sessões existe
const ensureSessionsDirExists = () => {
  if (!fs.existsSync(sessionsDir)) {
    console.log(`🛠️ O diretório de sessões não existe. Criando diretório: ${sessionsDir}`);
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
};

// Verifica se a sessão está em andamento
const isSessionInProgress = (sessionName) => {
  const sessionPath = path.join(sessionsDir, `${sessionName}.json`);
  return fs.existsSync(sessionPath) && require(sessionPath).status === 'running';
};

// Cria nova instância
const createNewInstance = async (sessionName, res) => {
  ensureSessionsDirExists();
  const sessionPath = path.join(sessionsDir, `${sessionName}.json`);

  console.log(`\n🚀 Iniciando o processo de conexão para a sessão: "${sessionName}"`);

  if (isSessionInProgress(sessionName)) {
    console.log(`❌ A sessão "${sessionName}" já está em andamento.`);
    return res.json({ success: false, error: `A sessão "${sessionName}" já está em andamento.` });
  }

  if (fs.existsSync(sessionPath)) {
    console.log(`🧹 Sessão anterior encontrada. Excluindo "${sessionName}"...`);
    fs.unlinkSync(sessionPath);
  }

  try {
    console.log(`💾 Criando arquivo de sessão para "${sessionName}"...`);
    fs.writeFileSync(sessionPath, JSON.stringify({ status: 'running', attempts: 0 }));
  } catch (error) {
    console.error(`❌ Erro ao criar o arquivo de sessão`, error);
    return res.json({ success: false, error: 'Erro ao tentar criar o arquivo de sessão.' });
  }

  try {
    console.log(`💻 Criando nova instância do WppConnect para a sessão "${sessionName}"...`);

    const client = await wppconnect.create({
      session: sessionName,
      puppeteerOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    console.log(`✅ Instância criada com sucesso para "${sessionName}"!`);

    // Evento QR Code
    client.on('qr', (qrCode) => {
      console.log(`🔑 QR Code gerado para "${sessionName}"`);
      return res.json({
        success: true,
        message: 'QR Code gerado com sucesso.',
        qrCode: `data:image/png;base64,${qrCode}`,
      });
    });

    // Evento autenticado
    client.on('authenticated', () => {
      console.log(`✅ QR Code escaneado com sucesso para "${sessionName}"!`);
      const sessionData = require(sessionPath);
      sessionData.status = 'authenticated';
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

      return res.json({ success: true, message: 'Sessão conectada com sucesso!' });
    });

    // Evento desconectado
    client.on('disconnected', (reason) => {
      console.log(`⚠️ Sessão "${sessionName}" desconectada. Motivo: ${reason}`);
      if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    });

    // Sessão pronta
    client.on('ready', () => {
      console.log(`📱 Sessão "${sessionName}" está pronta para uso.`);
    });

  } catch (error) {
    console.error(`❌ Erro ao criar a instância`, error);
    return res.json({ success: false, error: 'Erro ao tentar criar a instância do WppConnect.' });
  }
};

module.exports = { createNewInstance };
