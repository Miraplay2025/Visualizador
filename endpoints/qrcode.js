const WppConnect = require('@wppconnect-team/wppconnect'); // biblioteca para conexão com WhatsApp
const fs = require('fs');
const path = require('path');

// Caminho onde as sessões serão armazenadas (Você pode personalizar isso)
const sessionsDir = path.join(__dirname, 'sessions');

// Função para verificar se a sessão está em andamento
const isSessionInProgress = (sessionName) => {
  const sessionPath = path.join(sessionsDir, `${sessionName}.json`);
  return fs.existsSync(sessionPath) && require(sessionPath).status === 'running';
};

// Função para criar uma nova instância do WppConnect
const createNewInstance = async (sessionName, res) => {
  const sessionPath = path.join(sessionsDir, `${sessionName}.json`);

  console.log(`\n🚀 Iniciando o processo de conexão para a sessão: "${sessionName}"`);

  // Se já existe uma instância em andamento, retorna erro
  if (isSessionInProgress(sessionName)) {
    console.log(`❌ A sessão "${sessionName}" já está em andamento. Não é possível iniciar uma nova instância.`);
    return res.json({
      success: false,
      error: `A sessão "${sessionName}" já está em andamento.`,
    });
  }

  // Se existe uma instância salva, exclua e reinicie
  if (fs.existsSync(sessionPath)) {
    console.log(`🧹 Sessão anterior encontrada. Excluindo a sessão existente "${sessionName}"...`);
    fs.unlinkSync(sessionPath); // Exclui a sessão existente
  }

  // Cria um novo arquivo de sessão para manter o estado
  fs.writeFileSync(sessionPath, JSON.stringify({ status: 'running', attempts: 0 }));

  // Cria a nova instância do WppConnect
  try {
    console.log(`💻 Criando nova instância do WppConnect para a sessão "${sessionName}"...`);

    const client = await WppConnect.create({
      session: sessionName,
      headless: true, // Modo headless para rodar sem interface gráfica
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Adicionando argumentos necessários para o Render
    });

    console.log(`✅ Instância do WppConnect criada com sucesso para a sessão "${sessionName}"!`);

    // Configura o evento do QR Code
    client.on('qr', (qrCode) => {
      console.log(`🔑 QR Code gerado para a sessão "${sessionName}":`);

      // Exibe o QR Code no log
      const qrCodeBase64 = `data:image/png;base64,${qrCode}`;
      // Aqui você pode salvar ou retornar esse QR Code base64 conforme necessário
      return res.json({
        success: true,
        message: 'QR Code gerado com sucesso.',
        qrCode: qrCodeBase64, // Retorna o QR Code em base64
      });
    });

    // Lida com a conexão e expiração do QR Code
    client.on('qrExpired', async () => {
      let attempts = require(sessionPath).attempts || 0;
      attempts++;

      if (attempts >= 6) {
        // Exclui a sessão após 6 tentativas sem conexão
        console.log(`❌ 6 tentativas falhas para escanear o QR Code na sessão "${sessionName}". Excluindo sessão...`);
        fs.unlinkSync(sessionPath);
        client.close();
        return res.json({
          success: false,
          message: 'Sessão excluída após 6 tentativas sem conexão.',
        });
      }

      // Atualiza o número de tentativas
      const sessionData = require(sessionPath);
      sessionData.attempts = attempts;
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

      // Tenta gerar um novo QR Code
      console.log(`⏳ QR Code expirado na sessão "${sessionName}". Tentativa ${attempts}/6.`);
      client.restart();
    });

    // Lida com a conexão do WhatsApp
    client.on('authenticated', () => {
      console.log(`✅ QR Code escaneado com sucesso para a sessão "${sessionName}"! Conexão estabelecida.`);
      const sessionData = require(sessionPath);
      sessionData.status = 'authenticated';
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

      return res.json({
        success: true,
        message: 'QR Code escaneado com sucesso e conectado!',
      });
    });

    // Evento de desconexão
    client.on('disconnected', (reason) => {
      console.log(`⚠️ A sessão "${sessionName}" foi desconectada. Razão: ${reason}`);
      fs.unlinkSync(sessionPath); // Exclui a sessão
    });
  } catch (error) {
    console.error(`❌ Erro ao tentar criar a instância do WppConnect para a sessão "${sessionName}"`, error);
    return res.json({
      success: false,
      error: 'Erro ao tentar criar a instância do WppConnect.',
    });
  }
};

// Função principal que será chamada no endpoint
const handleQrcode = async (req, res) => {
  const { nome } = req.params;

  if (!nome) {
    console.log("❌ Nome da sessão não fornecido.");
    return res.json({
      success: false,
      error: 'Nome da sessão não fornecido.',
    });
  }

  console.log(`🔄 Verificando o status da sessão: "${nome}"...`);

  // Verifica se já existe uma sessão em andamento
  return createNewInstance(nome, res);
};

module.exports = handleQrcode;
