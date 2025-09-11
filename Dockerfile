FROM node:20-bullseye

# Dependências básicas
RUN apt-get update && apt-get install -y \
    libgtk-3-dev libjpeg-dev libpng-dev libtiff-dev build-essential \
    python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY server.js ./
COPY public ./public

# Criar pasta uploads
RUN mkdir -p uploads

EXPOSE 3000

CMD ["npm", "start"]
