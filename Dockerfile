# Imagem base Node.js
FROM node:20-slim

# Diretório da aplicação
WORKDIR /app

# Copia package.json e instala dependências
COPY package.json ./
RUN npm install --production

# Copia todo o código
COPY . .

# Cria pasta para salvar sessões
RUN mkdir -p /app/sessions

# Porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
