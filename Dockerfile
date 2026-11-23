# ==========================================
# Ma Badgeuse — image Docker multi-étapes
# ==========================================
# Node 24 (LTS) : Node 20 n'est plus maintenu depuis avril 2026.

# Étape 1 : build du frontend
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : build du backend TypeScript
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend
# Outils de compilation pour sqlite3 si aucun binaire précompilé n'est disponible
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Étape 3 : dépendances de production (compilées avec les mêmes outils)
FROM node:24-alpine AS backend-deps
WORKDIR /app/backend
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Étape 4 : image de production
FROM node:24-alpine AS runner

# curl pour le contrôle de santé, sqlite pour les sauvegardes du script de gestion,
# tzdata pour le fuseau horaire (variable TZ)
RUN apk add --no-cache curl sqlite tzdata

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/database.sqlite \
    BACKUP_DIR=/app/backups \
    FRONTEND_DIST=/app/frontend/dist \
    TZ=Europe/Paris

WORKDIR /app/backend
COPY --chown=node:node backend/package*.json ./
COPY --from=backend-deps --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=node:node /app/backend/dist ./dist
COPY --from=frontend-builder --chown=node:node /app/frontend/dist /app/frontend/dist

# Dossiers de données appartenant à l'utilisateur non privilégié « node » (uid 1000).
# Les dossiers montés depuis l'hôte doivent aussi lui appartenir : voir le guide d'installation.
RUN mkdir -p /app/data /app/backups/tmp && chown -R node:node /app/data /app/backups

USER node
WORKDIR /app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "backend/dist/index.js"]
