# Base Python completa para evitar problemas de pip
FROM python:3.12-slim

# Instalar Node.js 20 LTS e dependências do sistema
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    git \
    && apt-get clean

# Instalar Node.js LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Diretório da app
WORKDIR /app

# Copiar arquivos
COPY package.json package-lock.json* ./ 
COPY requirements.txt ./ 
COPY server.js ./ 
COPY ocr.py ./ 
COPY public ./public

# Atualizar pip
RUN python3 -m pip install --upgrade pip

# Instalar dependências Node
RUN npm install

# Instalar dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Expor porta
EXPOSE 3000

# Rodar app
CMD ["node", "server.js"]
