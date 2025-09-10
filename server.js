const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const PORT = process.env.PORT || 3000;

// Pasta uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(express.json());

// Inicializa BLIP-2 pipeline
let blipPipeline;
(async () => {
  console.log("Carregando BLIP-2...");
  blipPipeline = await pipeline('image-to-text', 'Salesforce/blip2-flan-t5-xl');
  console.log("BLIP-2 carregado!");
})();

// Pergunta sobre imagem existente
app.post('/ask-image', async (req, res) => {
  const { filename, question } = req.body;
  if (!filename || !question) return res.status(400).json({ error: 'Faltando arquivo ou pergunta' });

  const imagePath = path.join(uploadDir, filename);
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Imagem não encontrada' });

  try {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const output = await blipPipeline(canvas, question);
    res.json({ answer: output.text || 'Nenhuma resposta' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

// Upload de nova imagem
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  res.json({ filename: req.file.filename });
});

// Excluir imagem
app.post('/delete-image', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Faltando nome do arquivo' });

  const imagePath = path.join(uploadDir, filename);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
    return res.json({ success: true });
  } else {
    return res.status(404).json({ error: 'Imagem não encontrada' });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
