const express = require('express');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const cv = require('@u4/opencv4nodejs-prebuilt');

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

// Função para detectar contornos/botões e extrair texto
async function extractButtonText(imagePath) {
  const image = cv.imread(imagePath);
  const gray = image.bgrToGray();
  const edges = gray.canny(50, 150);
  const contours = edges.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  for (let contour of contours) {
    const rect = contour.boundingRect();
    const buttonRegion = image.getRegion(rect);
    const buttonPath = path.join(uploadDir, 'button_area.jpg');
    cv.imwrite(buttonPath, buttonRegion);

    try {
      const { data: { text } } = await Tesseract.recognize(buttonPath, 'por');
      fs.unlinkSync(buttonPath);
      return text.trim();
    } catch (err) {
      if (fs.existsSync(buttonPath)) fs.unlinkSync(buttonPath);
    }
  }
  return null;
}

// Endpoint para extrair texto
app.post('/extract-text', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const imagePath = req.file.path;

  try {
    const buttonText = await extractButtonText(imagePath);
    fs.unlinkSync(imagePath);
    if (buttonText) res.json({ text: buttonText });
    else res.status(404).json({ error: 'Botão não encontrado' });
  } catch (err) {
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    res.status(500).json({ error: 'Erro ao extrair texto' });
  }
});

// Iniciar servidor
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
