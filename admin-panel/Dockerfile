FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN cat package.json | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); delete p.optionalDependencies; require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" && npm install --force && npx next telemetry disable
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
