# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package descriptors to install all dependencies (including devDependencies)
COPY package*.json ./

# Install all dependencies at the root (exact versions from package-lock.json)
RUN npm ci --no-audit --no-fund

# Copy source files
COPY shared ./shared
COPY catalog-service ./catalog-service

# Build the service
WORKDIR /app/catalog-service
RUN npm run build

# --- Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy root package descriptors to install production dependencies
COPY package*.json ./

# Install production dependencies at the root (exact versions from package-lock.json)
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy compiled JavaScript output from the builder stage
COPY --from=builder /app/catalog-service/dist ./dist

# Uploaded product images live here (mounted as a named volume in docker-compose.yml)
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
ENV UPLOAD_DIR=/app/uploads

# Run as the unprivileged "node" user, not root
USER node

EXPOSE 5002

CMD ["node", "dist/catalog-service/src/server.js"]
