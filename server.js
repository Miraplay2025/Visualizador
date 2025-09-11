const express = require('express');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const cv = require('opencv4nodejs'); // OpenCV para manipulação de imagens

const app = express();
const PORT = process.env.PORT || 3000;

// Cria a pasta uploads se não existir
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Servir arquivos estáticos
app.use(express.static('public'));

// Função para detectar as bordas e recortar a área do botão
async function extractButtonText(imagePath) {
  const image = cv.imread(imagePath);

  // Convertendo a imagem para escala de cinza
  const gray = image.bgrToGray();

  // Aplicar o filtro de Canny para detectar bordas
  const edges = gray.canny(50, 150);

  // Encontrar os contornos nas bordas detectadas
  const contours = edges.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  for (let contour of contours) {
    // Obter o retângulo delimitador de cada contorno
    const rect = contour.boundingRect();

    // Filtrar apenas as áreas que provavelmente são botões (baseado em critérios de borda)
    // Você pode adicionar condições aqui se necessário, mas aqui vamos usar apenas os contornos
    const buttonRegion = image.getRegion(rect);  // Recorta a área

    // Salvar a imagem recortada da área detectada
    const buttonPath = path.join(uploadDir, 'button_area.jpg');
    cv.imwrite(buttonPath, buttonRegion);

    // Agora, passe a imagem recortada para o Tesseract
    const { data: { text } } = await Tesseract.recognize(buttonPath, 'por');
    fs.unlinkSync(buttonPath); // Apagar a imagem recortada após o OCR
    return text;
  }

  return null; // Caso não encontre um botão
}

// Endpoint para extrair texto
app.post('/extract-text', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const imagePath = req.file.path;

  try {
    // Extrair o texto da área do botão
    const buttonText = await extractButtonText(imagePath);

    if (buttonText) {
      // Apagar a imagem original após o processamento
      fs.unlinkSync(imagePath);
      res.json({ text: buttonText });
    } else {
      // Caso não consiga encontrar um botão
      res.status(404).json({ error: 'Botão não encontrado' });
    }
  } catch (err) {
    // Apagar a imagem original mesmo em caso de erro
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    res.status(500).json({ error: 'Erro ao extrair texto' });
  }
});

// Iniciar servidor
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
