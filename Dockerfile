# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-lc", "npm run db:migrate && node dist/server.js"]
