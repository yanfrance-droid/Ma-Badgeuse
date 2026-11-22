# ==========================================
# Multi-stage Dockerfile pour Suivi Heures Pro
# ==========================================

# Étape 1 : Build du Frontend PWA
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : Build du Backend Node.js TypeScript
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
# Installer les dépendances système pour compiler sqlite3 si nécessaire
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Étape 3 : Image de Production légère
FROM node:20-alpine AS runner
WORKDIR /app

# Installation de curl pour le healthcheck, tzdata pour le fuseau horaire et sqlite3
RUN apk add --no-cache curl sqlite tzdata

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/database.sqlite
ENV BACKUP_DIR=/app/backups
ENV TZ=Europe/Paris
ENV APP_TIMEZONE=Europe/Paris

# Création des dossiers de données et permissions
RUN mkdir -p /app/data /app/backups /app/frontend/dist

# Copie des dépendances de prod backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copie du code compilé backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copie des fichiers statiques frontend compilés
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

WORKDIR /app
EXPOSE 3000

# Vérification de l'état de santé du conteneur
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "backend/dist/index.js"]
