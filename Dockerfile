FROM node:20-alpine
RUN apk add --no-cache python3 make g++   # sqlite3 native build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/library.db
EXPOSE 8080
CMD ["npm", "start"]
