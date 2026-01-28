# Karuna Backend Server
# Multi-stage build for smaller production image

# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:25-alpine AS production

# Add labels
LABEL maintainer="Karuna Team"
LABEL description="Karuna AI Gateway Server"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S karuna -u 1001 -G nodejs

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=karuna:nodejs . .

# Remove development files
RUN rm -rf scripts/generate-assets.js \
    && rm -rf .env* \
    && rm -rf *.md

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Switch to non-root user
USER karuna

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "index.js"]
