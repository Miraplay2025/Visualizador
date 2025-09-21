FROM node:20-slim

WORKDIR /app

# Instala Git e dependências básicas
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copia package.json e instala dependências
COPY package.json ./
RUN npm install --production

# Copia o restante do código
COPY . .

# Cria pasta para salvar sessões
RUN mkdir -p /app/sessions

EXPOSE 3000

CMD ["npm", "start"]
