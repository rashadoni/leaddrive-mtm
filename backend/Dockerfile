FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && npx tsx src/index.ts"]
