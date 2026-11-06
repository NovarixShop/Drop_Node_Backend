# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package descriptors to install all dependencies (including devDependencies)
COPY package*.json ./

# Install all dependencies at the root (exact versions from package-lock.json)
RUN npm ci --no-audit --no-fund

# Copy source files
COPY api-gateway ./api-gateway

# Build the service
WORKDIR /app/api-gateway
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
COPY --from=builder /app/api-gateway/dist ./dist

# Run as the unprivileged "node" user, not root
USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
