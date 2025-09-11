FROM node:20-slim

# Instalar dependências do sistema
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-dev build-essential libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 && \
    apt-get clean

# Atualizar pip
RUN pip3 install --upgrade pip

WORKDIR /app

# Copiar arquivos
COPY package.json package-lock.json* ./ 
COPY requirements.txt ./ 
COPY server.js ./ 
COPY ocr.py ./ 
COPY public ./public

# Limpar cache npm
RUN npm cache clean --force

# Instalar dependências Node
RUN npm install

# Instalar dependências Python
RUN pip3 install --no-cache-dir -r requirements.txt

EXPOSE 3000

CMD ["node", "server.js"]
