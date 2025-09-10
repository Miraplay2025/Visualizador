const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PythonShell } = require('python-shell');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

// Cria uploads se não existir
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Upload de imagem
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  res.json({ filename: req.file.filename });
});

// Fazer pergunta
app.post('/ask', (req, res) => {
  const { filename, question } = req.body;
  const imagePath = path.join(uploadDir, filename);
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Imagem não encontrada' });

  // Chamando script Python com InstructBLIP
  let options = {
    mode: 'text',
    pythonOptions: ['-u'],
    args: [imagePath, question]
  };

  PythonShell.run('instruct_blip_vqa.py', options, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ answer: results.join(' ') });
  });
});

// Excluir imagem
app.post('/delete', (req, res) => {
  const { filename } = req.body;
  const imagePath = path.join(uploadDir, filename);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Imagem não encontrada' });
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));

