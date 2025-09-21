FROM node:18-slim

WORKDIR /app

# Instala dependências básicas
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências do projeto
RUN npm install --production

# Copia todo o projeto
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
