FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --production=false

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
