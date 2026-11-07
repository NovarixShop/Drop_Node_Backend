# --- STAGE 1: Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for compilation)
RUN npm ci

# Copy source files
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# --- STAGE 2: Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package descriptors
COPY package*.json ./

# Install ONLY production-grade dependencies
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy compiled JavaScript output from the builder stage
COPY --from=builder /app/dist ./dist

# Create a directory for winston logs
RUN mkdir -p logs && chown -R node:node logs

# Use unprivileged node user for security
USER node

# Expose server port
EXPOSE 5000

# Start server
CMD ["node", "dist/server.js"]
