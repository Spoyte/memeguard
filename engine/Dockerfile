FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY engine/package.json ./
RUN npm install --production=false

# Copy source
COPY engine/tsconfig.json ./
COPY engine/src/ ./src/

# Run with tsx (avoids ESM compilation issues with tsc)
ENV NODE_ENV=production

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S memeguard -u 1001
USER memeguard

CMD ["npx", "tsx", "src/index.ts"]
