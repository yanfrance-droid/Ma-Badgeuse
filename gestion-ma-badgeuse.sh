#!/usr/bin/env bash
set -Eeuo pipefail

# Dossier d'installation : celui du script s'il fait partie du projet cloné,
# sinon /opt/Ma-Badgeuse (chemin du guide). Modifiable : APP_DIR=/chemin sudo -E ./gestion-ma-badgeuse.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${APP_DIR:-}" ]]; then
    if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
        APP_DIR="$SCRIPT_DIR"
    else
        APP_DIR="/opt/Ma-Badgeuse"
    fi
fi
REPO_URL="https://github.com/yanfrance-droid/Ma-Badgeuse.git"
PROJECT="ma-badgeuse"
SERVICE="ma-badgeuse"
CONTAINER="ma-badgeuse"
PORT=3000
BRANCH="main"
# Utilisateur du conteneur (image node:*-alpine, utilisateur « node »)
APP_UID=1000
APP_GID=1000
TEMP_DIR=""

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT

pause() {
    echo
    read -r -p "Appuyez sur Entrée pour revenir au menu..."
}

require_root() {
    [[ "$EUID" -eq 0 ]] || {
        echo "❌ Erreur : Ce script doit être lancé avec les droits root (ex: sudo ./gestion-ma-badgeuse.sh)."
        exit 1
    }
}

check_tools() {
    for tool in git docker; do
        command -v "$tool" >/dev/null 2>&1 || {
            echo "❌ Outil manquant sur le serveur : $tool"
            echo "Installez-le avec : apt update && apt install -y $tool"
            return 1
        }
    done
    docker compose version >/dev/null 2>&1 || {
        echo "❌ Docker Compose v2 manquant."
        return 1
    }
    docker info >/dev/null 2>&1 || {
        echo "❌ Le démon Docker n'est pas actif."
        return 1
    }
}

compose() {
    docker compose -p "$PROJECT" "$@"
}

verify_existing_install() {
    [[ -d "$APP_DIR/.git" && -f "$APP_DIR/docker-compose.yml" ]] || {
        echo "❌ Installation Git ou fichier docker-compose.yml introuvable dans $APP_DIR."
        return 1
    }

    local remote
    remote="$(git -C "$APP_DIR" remote get-url origin 2>/dev/null)" || return 1
    [[ "$remote" == "$REPO_URL" || "$remote" == *"/Ma-Badgeuse.git" || "$remote" == *"/ma-badgeuse.git" ]] || {
        echo "⚠️ Dépôt Git inattendu : $remote"
    }

    docker inspect "$CONTAINER" >/dev/null 2>&1 || {
        echo "⚠️ Le conteneur $CONTAINER n'est pas encore créé."
        return 1
    }

    echo "✓ Installation vérifiée."
}

# Le conteneur tourne avec l'utilisateur « node » (uid 1000) : les dossiers montés doivent lui appartenir.
fix_data_permissions() {
    mkdir -p "$APP_DIR/data" "$APP_DIR/backups/tmp" || return 1
    chown -R "$APP_UID:$APP_GID" "$APP_DIR/data" "$APP_DIR/backups" || return 1
}

# Sauvegarde cohérente de la base (API de sauvegarde SQLite, jamais une simple copie
# d'un fichier en cours d'écriture). Échoue plutôt que de produire une copie douteuse.
backup_database() {
    local timestamp backup running db
    timestamp="$(date +%Y%m%d_%H%M%S)"
    backup="safety_before_update_${timestamp}.sqlite"
    db="$APP_DIR/data/database.sqlite"

    if [[ ! -f "$db" ]]; then
        echo "ℹ️ Aucune base existante à sauvegarder."
        return 0
    fi
    mkdir -p "$APP_DIR/backups" || return 1

    running="$(docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null)" || running="false"
    if [[ "$running" == "true" ]]; then
        echo "📦 Sauvegarde à chaud de la base..."
        docker exec "$CONTAINER" sqlite3 /app/data/database.sqlite ".backup '/app/backups/${backup}'" || {
            echo "❌ La sauvegarde à chaud a échoué : opération interrompue."
            return 1
        }
    elif command -v sqlite3 >/dev/null 2>&1; then
        echo "📦 Conteneur arrêté : sauvegarde avec sqlite3..."
        sqlite3 "$db" ".backup '$APP_DIR/backups/${backup}'" || return 1
    else
        echo "📦 Conteneur arrêté : copie de la base et de son journal (WAL)..."
        cp "$db" "$APP_DIR/backups/$backup" || return 1
        for suffix in -wal -shm; do
            [[ -f "${db}${suffix}" ]] && cp "${db}${suffix}" "$APP_DIR/backups/${backup}${suffix}"
        done
    fi

    [[ -s "$APP_DIR/backups/$backup" ]] || {
        echo "❌ Sauvegarde vide ou absente : opération interrompue."
        return 1
    }
    chown "$APP_UID:$APP_GID" "$APP_DIR/backups/$backup"* 2>/dev/null || true
    echo "✓ Sauvegarde créée : $APP_DIR/backups/$backup"
}

wait_for_health() {
    echo "⏳ Attente du démarrage de Ma Badgeuse..."
    for i in $(seq 1 40); do
        local state
        state="$(docker inspect "$CONTAINER" \
            --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            2>/dev/null)" || state="inconnu"

        [[ "$state" == "healthy" ]] && {
            echo "✅ Ma Badgeuse est opérationnelle !"
            local ip
            ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip="IP_DE_VOTRE_SERVEUR"
            echo "📍 Adresse locale d'accès : http://${ip}:${PORT}"
            return 0
        }

        if [[ "$state" == "exited" || "$state" == "unhealthy" ]]; then
            echo "❌ Erreur au démarrage du conteneur ($state) :"
            docker logs --tail 40 "$CONTAINER" || true
            return 1
        fi
        sleep 3
    done

    echo "❌ L'application n'est pas devenue opérationnelle en 2 minutes. Derniers logs :"
    docker logs --tail 30 "$CONTAINER" || true
    return 1
}

new_install() {
    echo "=========================================="
    echo "       NOUVELLE INSTALLATION"
    echo "=========================================="

    if docker inspect "$CONTAINER" >/dev/null 2>&1; then
        echo "⚠️ Le conteneur $CONTAINER existe déjà."
        echo "Pour mettre à jour, choisissez l'option 2 (Mise à jour)."
        return 1
    fi

    if [[ -d "$APP_DIR/.git" && -f "$APP_DIR/docker-compose.yml" ]]; then
        echo "ℹ️ Projet déjà présent dans $APP_DIR : pas de nouveau téléchargement."
    else
        echo "📥 Téléchargement du projet depuis GitHub dans $APP_DIR..."
        git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" || return 1
    fi

    if [[ ! -f "$APP_DIR/.env" && -f "$APP_DIR/.env.example" ]]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env" || return 1
    fi

    fix_data_permissions || return 1

    echo "🔨 Construction de l'image Docker (frontend + backend)..."
    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --build "$SERVICE" || return 1

    wait_for_health || return 1
    echo
    echo "🎉 Installation terminée avec succès !"
    echo "👉 Ouvrez l'application : le premier compte créé devient administrateur."
}

update_install() {
    echo "=========================================="
    echo "             MISE À JOUR"
    echo "=========================================="

    verify_existing_install || return 1
    backup_database || return 1

    echo "📥 Récupération des dernières modifications sur GitHub..."
    git -C "$APP_DIR" fetch --tags --force || return 1
    git -C "$APP_DIR" pull origin "$BRANCH" || return 1

    echo "🔨 Reconstruction de l'application..."
    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" build "$SERVICE" || return 1

    fix_data_permissions || return 1

    echo "🔄 Redémarrage de l'application..."
    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --force-recreate "$SERVICE" || return 1

    wait_for_health || return 1

    echo "🧹 Nettoyage des anciennes images de Ma Badgeuse..."
    docker image prune -f --filter "label=com.docker.compose.project=$PROJECT" || true
    echo "✓ Mise à jour terminée avec succès !"
}

show_status() {
    echo "=========================================="
    echo "          ÉTAT DE MA BADGEUSE"
    echo "=========================================="
    if docker inspect "$CONTAINER" >/dev/null 2>&1; then
        docker ps --filter "name=$CONTAINER" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo
        echo "--- Derniers logs (15 dernières lignes) ---"
        docker logs --tail 15 "$CONTAINER" || true
    else
        echo "❌ Le conteneur $CONTAINER n'est pas encore installé ou démarré."
    fi
}

main_menu() {
    while true; do
        echo
        echo "=========================================="
        echo "   🕒 GESTION DE MA BADGEUSE (DOCKER)"
        echo "=========================================="
        echo "1. Nouvelle installation"
        echo "2. Mettre à jour depuis GitHub"
        echo "3. Sauvegarder la base de données maintenant"
        echo "4. Voir l'état et les logs du conteneur"
        echo "5. Redémarrer l'application"
        echo "6. Quitter"
        echo

        read -r -p "Votre choix (1-6) : " choice

        case "$choice" in
            1) if new_install; then :; else echo "❌ Installation interrompue."; fi; pause ;;
            2) if update_install; then :; else echo "❌ Mise à jour interrompue."; fi; pause ;;
            3) backup_database || echo "❌ Sauvegarde échouée."; pause ;;
            4) show_status; pause ;;
            5) compose -f "$APP_DIR/docker-compose.yml" --project-directory "$APP_DIR" restart "$SERVICE" && wait_for_health || echo "❌ Redémarrage en échec."; pause ;;
            6) echo "Au revoir !"; exit 0 ;;
            *) echo "Choix invalide."; pause ;;
        esac
    done
}

require_root
check_tools
main_menu
