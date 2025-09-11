# Base Node LTS
FROM node:20-slim

# Instalar Python e dependências
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean

# Diretório da app
WORKDIR /app

# Copiar arquivos essenciais
COPY package.json package-lock.json* ./ 
COPY requirements.txt ./ 
COPY server.js ./ 
COPY ocr.py ./ 
COPY public ./public

# Limpar cache do npm antes de instalar
RUN npm cache clean --force

# Instalar dependências Node
RUN npm install

# Instalar dependências Python
RUN pip3 install --no-cache-dir -r requirements.txt

# Expor porta
EXPOSE 3000

# Iniciar servidor
CMD ["node", "server.js"]
