# Imagem base oficial Node.js slim (mais leve)
FROM node:18-slim

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Instalar dependências do sistema necessárias para rodar o Chromium
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  xdg-utils \
  libu2f-udev \
  libvulkan1 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Copia arquivos de dependências do Node.js
COPY package*.json ./

# Instala dependências do Node e o Chromium compatível do Puppeteer
RUN npm install --production && \
    npx puppeteer@latest install chrome

# Copia o restante do código para dentro do container
COPY . .

# Expõe a porta da aplicação
EXPOSE 3000

# Comando padrão para iniciar a aplicação
CMD ["npm", "start"]
