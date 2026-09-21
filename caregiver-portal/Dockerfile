# Karuna Caregiver Portal — production image
# Multi-stage build: compile the SPA with node, serve the static bundle with nginx.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# VITE_API_URL is baked into the bundle at build time. The production
# server.js also proxies /api to API_URL at runtime as a fallback.
ARG VITE_API_URL=https://karuna-api-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/caregiver.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
