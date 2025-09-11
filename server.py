const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Criar pasta uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Arquivos estáticos
app.use(express.static('public'));

// Endpoint OCR
app.post('/extract-text', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const imagePath = req.file.path;

  const py = spawn('python3', ['ocr.py', imagePath]);

  let dataString = '';
  let errorString = '';

  py.stdout.on('data', (data) => dataString += data.toString());
  py.stderr.on('data', (data) => errorString += data.toString());

  py.on('close', (code) => {
    // Apaga a imagem mesmo em caso de erro
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    if (code !== 0) {
      console.error('Erro OCR:', errorString);
      return res.status(500).json({ error: 'Erro ao processar OCR' });
    }

    try {
      const result = JSON.parse(dataString);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao processar OCR' });
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
