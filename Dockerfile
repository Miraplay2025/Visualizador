FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Atualiza npm
RUN npm install -g npm@11.6.0

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
