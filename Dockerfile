# Base image com Node.js e OpenCV
FROM node:20-bullseye

# Instalar dependências do OpenCV
RUN apt-get update && apt-get install -y \
    build-essential cmake git pkg-config libgtk-3-dev \
    libavcodec-dev libavformat-dev libswscale-dev \
    libv4l-dev libxvidcore-dev libx264-dev libjpeg-dev \
    libpng-dev libtiff-dev gfortran openexr libatlas-base-dev \
    python3-dev python3-numpy wget unzip && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /usr/src/app

# Copiar arquivos
COPY package*.json ./
COPY server.js ./
COPY public ./public

# Instalar dependências
RUN npm install

# Criar pasta uploads
RUN mkdir -p uploads

# Expor porta
EXPOSE 3000

# Iniciar aplicação
CMD ["npm", "start"]
