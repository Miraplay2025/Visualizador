# Base PyTorch com CUDA
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

# Instala dependências do sistema
RUN apt-get update && apt-get install -y git wget libgl1 libglib2.0-0

# Define diretório
WORKDIR /app

# Copia arquivos
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expõe porta do Render
ENV PORT=10000

# Comando para rodar
CMD ["python", "server.py"]

