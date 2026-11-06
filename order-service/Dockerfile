# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package descriptors to install all dependencies (including devDependencies)
COPY package*.json ./

# Install all dependencies at the root (exact versions from package-lock.json)
RUN npm ci --no-audit --no-fund

# Copy source files
COPY shared ./shared
COPY order-service ./order-service

# Build the service
WORKDIR /app/order-service
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
COPY --from=builder /app/order-service/dist ./dist

# Run as the unprivileged "node" user, not root
USER node

EXPOSE 5004

CMD ["node", "dist/order-service/src/server.js"]
