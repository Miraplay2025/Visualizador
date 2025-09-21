# Base Node.js 18 slim
FROM node:18-slim

WORKDIR /app

# Instalar dependências do Chromium necessárias para Puppeteer
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

# Copia package.json e package-lock.json para aproveitar cache
COPY package*.json ./

# Instala dependências de produção
RUN npm install --omit=dev

# Instala Chromium do Puppeteer
RUN npx puppeteer install chrome

# Copia todo o projeto
COPY . .

# Expõe porta padrão do servidor Node.js
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]
