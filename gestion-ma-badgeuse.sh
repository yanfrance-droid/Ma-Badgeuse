#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/ma-badgeuse"
REPO_URL="https://github.com/yanfrance-droid/Ma-Badgeuse.git"
PROJECT="ma-badgeuse"
SERVICE="ma-badgeuse"
CONTAINER="ma-badgeuse"
PORT=3000
BRANCH="main"
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

backup_database() {
    local timestamp backup running
    timestamp="$(date +%Y%m%d-%H%M%S)"
    backup="safety-before-update-${timestamp}.sqlite"

    running="$(docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null)" || running="false"
    [[ "$running" == "true" ]] || {
        echo "ℹ️ Conteneur arrêté : copie directe du fichier database.sqlite..."
        if [[ -f "$APP_DIR/data/database.sqlite" ]]; then
            mkdir -p "$APP_DIR/backups"
            cp "$APP_DIR/data/database.sqlite" "$APP_DIR/backups/$backup"
            echo "✓ Sauvegarde créée : $APP_DIR/backups/$backup"
        fi
        return 0
    }

    mkdir -p "$APP_DIR/backups" || return 1

    echo "📦 Création d'une sauvegarde de sécurité SQLite avant mise à jour..."
    docker exec "$CONTAINER" sqlite3 /app/data/database.sqlite \
        ".backup '/app/backups/${backup}'" || true

    if docker exec "$CONTAINER" test -s "/app/backups/${backup}"; then
        echo "✓ Sauvegarde d'urgence réussie : $APP_DIR/backups/$backup"
    else
        echo "⚠️ Sauvegarde à chaud non disponible, tentative de copie locale..."
        if [[ -f "$APP_DIR/data/database.sqlite" ]]; then
            cp "$APP_DIR/data/database.sqlite" "$APP_DIR/backups/$backup"
            echo "✓ Sauvegarde fichier réussie : $APP_DIR/backups/$backup"
        fi
    fi
}

wait_for_health() {
    echo "⏳ Attente du démarrage de Ma Badgeuse..."
    for i in $(seq 1 40); do
        local state
        state="$(docker inspect "$CONTAINER" \
            --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            2>/dev/null)" || state="inconnu"

        [[ "$state" == "healthy" || "$state" == "running" ]] && {
            echo "✅ Ma Badgeuse est opérationnelle !"
            local ip
            ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip="IP_DE_VOTRE_SERVEUR"
            echo "📍 Adresse locale d'accès : http://${ip}:${PORT}"
            return 0
        }

        if [[ "$state" == "exited" ]]; then
            echo "❌ Erreur au démarrage du conteneur :"
            docker logs --tail 40 "$CONTAINER" || true
            return 1
        fi
        sleep 3
    done

    echo "⚠️ Le conteneur met du temps à démarrer. Vérification des logs :"
    docker logs --tail 30 "$CONTAINER" || true
    return 0
}

new_install() {
    echo "=========================================="
    echo "       NOUVELLE INSTALLATION"
    echo "=========================================="

    if [[ -d "$APP_DIR" && -f "$APP_DIR/docker-compose.yml" ]]; then
        echo "⚠️ Le dossier $APP_DIR existe déjà."
        echo "Si vous souhaitez le mettre à jour, choisissez l'option 2 (Mise à jour)."
        return 1
    fi

    echo "📥 Téléchargement du projet depuis GitHub..."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" || return 1

    if [[ ! -f "$APP_DIR/.env" && -f "$APP_DIR/.env.example" ]]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env" || return 1
    fi

    mkdir -p "$APP_DIR/data" "$APP_DIR/backups" || return 1

    echo "🔨 Construction de l'image Docker (frontend + backend)..."
    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --build "$SERVICE" || return 1

    wait_for_health || return 1
    echo
    echo "🎉 Installation terminée avec succès !"
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

    echo "🔄 Redémarrage sans coupure..."
    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --force-recreate "$SERVICE" || return 1

    wait_for_health || return 1

    echo "🧹 Nettoyage des anciennes images Docker inutilisées..."
    docker image prune -f || true
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
            3) backup_database; pause ;;
            4) show_status; pause ;;
            5) compose -f "$APP_DIR/docker-compose.yml" --project-directory "$APP_DIR" restart "$SERVICE"; wait_for_health; pause ;;
            6) echo "Au revoir !"; exit 0 ;;
            *) echo "Choix invalide."; pause ;;
        esac
    done
}

require_root
check_tools
main_menu
