FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run передаёт порт через переменную PORT, но 8080 — дефолт
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
