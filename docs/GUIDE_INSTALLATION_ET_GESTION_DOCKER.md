# Guide d'installation et d'administration — Ma Badgeuse

> **Déploiement Proxmox / Linux avec Docker et le script `gestion-ma-badgeuse.sh`**  
> **Version :** 0.3.0 | **Date :** 23 novembre 2026 | **Port par défaut :** 3000  
> **Dépôt :** [https://github.com/yanfrance-droid/Ma-Badgeuse.git](https://github.com/yanfrance-droid/Ma-Badgeuse.git)

---

## 1. Principes

**Ma Badgeuse** (React 18 + Node.js + SQLite) tourne dans un conteneur Docker :
- **Rien à installer sur l'hôte** à part Docker, Docker Compose et Git.
- **Données persistantes** : la base `database.sqlite` est dans `data/`, les sauvegardes dans `backups/`, deux dossiers de l'hôte montés dans le conteneur. Reconstruire ou mettre à jour le conteneur ne touche pas à ces dossiers.
- **Conteneur durci** : il tourne avec l'utilisateur non privilégié `node` (uid 1000), sans capacités Linux, avec un système de fichiers en lecture seule hors données. Les dossiers `data/` et `backups/` doivent donc **appartenir à l'uid 1000** (le script s'en charge).
- **Coexistence** : Ma Badgeuse utilise le port 3000 ; une autre application (ex. Budget Pro sur 3001) peut tourner à côté.

---

## 2. Prérequis

| Outil | Vérification | Installation (Debian / Ubuntu) |
| :--- | :--- | :--- |
| **Docker Engine** | `docker --version` | `sudo apt update && sudo apt install -y docker.io` |
| **Docker Compose v2** | `docker compose version` | `sudo apt install -y docker-compose-plugin` |
| **Git** | `git --version` | `sudo apt install -y git` |

`sqlite3` sur l'hôte est facultatif (utile pour sauvegarder la base quand le conteneur est arrêté).

---

## 3. Arborescence

```text
/opt/Ma-Badgeuse/
├── docker-compose.yml        # Service, port, volumes, durcissement
├── Dockerfile                # Build frontend + backend, image Node 24
├── .env                      # Vos réglages (copié depuis .env.example)
├── gestion-ma-badgeuse.sh    # Script d'administration
├── data/                     # [PERSISTANT, uid 1000] database.sqlite
└── backups/                  # [PERSISTANT, uid 1000] sauvegardes
    ├── auto_backup_AAAAMMJJHHMMSSmmm.sqlite          # quotidiennes, heure UTC (14 gardées)
    ├── safety_...sqlite                              # de sécurité (20 gardées)
    └── tmp/                                          # fichiers temporaires (import)
```

---

## 4. Première installation

```bash
cd /opt
sudo git clone https://github.com/yanfrance-droid/Ma-Badgeuse.git
cd /opt/Ma-Badgeuse
sudo bash gestion-ma-badgeuse.sh      # puis choisir 1
```

L'option 1 :
1. crée `.env` à partir de `.env.example` s'il n'existe pas ;
2. crée `data/` et `backups/` et les attribue à l'uid 1000 ;
3. construit l'image et démarre le conteneur (`restart: unless-stopped`) ;
4. attend que le contrôle de santé réponde (échec affiché avec les journaux sinon).

Ouvrez ensuite **`http://IP_DU_SERVEUR:3000`** : l'écran propose de **créer le compte administrateur**. Faites-le tout de suite, avant que quelqu'un d'autre sur le réseau ne le fasse. L'inscription libre est ensuite fermée ; les autres comptes se créent dans *Réglages → Administration*.

### Installation manuelle (sans le script)
```bash
cd /opt/Ma-Badgeuse
cp .env.example .env
sudo mkdir -p data backups/tmp && sudo chown -R 1000:1000 data backups
docker compose up -d --build
```

---

## 5. Le script `gestion-ma-badgeuse.sh`

```bash
sudo bash /opt/Ma-Badgeuse/gestion-ma-badgeuse.sh
```

Le script travaille dans son propre dossier (ou dans `/opt/Ma-Badgeuse`, ou dans le dossier indiqué par `APP_DIR=/chemin sudo -E bash gestion-ma-badgeuse.sh`).

1. **Nouvelle installation** : voir ci-dessus.
2. **Mettre à jour depuis GitHub** : sauvegarde cohérente de la base (la mise à jour s'arrête si elle échoue), `git pull`, reconstruction, droits des dossiers, redémarrage, attente du contrôle de santé, suppression des anciennes images **du projet uniquement**.
3. **Sauvegarder la base maintenant** : `backups/safety_before_update_<date>.sqlite`, faite avec l'API de sauvegarde SQLite (jamais une copie d'un fichier en cours d'écriture).
4. **Voir l'état et les logs.**
5. **Redémarrer l'application.**
6. **Quitter.**

---

## 6. Réseau et configuration (`.env`)

| Variable | Rôle | Défaut |
| :--- | :--- | :--- |
| `PORT` | Port publié sur l'hôte | `3000` |
| `BIND_ADDRESS` | `0.0.0.0` = joignable depuis le réseau local ; `127.0.0.1` = seulement depuis l'hôte (proxy HTTPS) | `0.0.0.0` |
| `APP_TIMEZONE` | Fuseau horaire (dates, sauvegardes) | `Europe/Paris` |
| `COOKIE_SECURE` | `true` quand l'application est servie en HTTPS | `false` |
| `TRUST_PROXY` | `1` derrière un proxy HTTPS sur la même machine | vide |
| `ALLOWED_ORIGINS` | Autres adresses autorisées à modifier les données, séparées par des virgules | vide |

Adresse IP du serveur : `hostname -I` (ex. `192.168.1.50`).

### Accès en HTTPS

En HTTP simple, le mot de passe et le cookie de session circulent en clair sur le réseau local. **Recommandé** : placer un proxy HTTPS devant l'application, par exemple [Caddy](https://caddyserver.com/) sur la même machine :

```caddyfile
badgeuse.maison.lan {
    tls internal
    reverse_proxy 127.0.0.1:3000
}
```

puis dans `.env` :

```ini
BIND_ADDRESS=127.0.0.1
COOKIE_SECURE=true
TRUST_PROXY=1
```

et `docker compose up -d` pour appliquer. Avec `tls internal`, il faut faire confiance au certificat de Caddy sur chaque appareil (ou utiliser un vrai nom de domaine et un certificat Let's Encrypt).

---

## 7. Smartphone

L'application est conçue pour être utilisée **uniquement sur téléphone**.

- **Android (Chrome)** : à la première ouverture, une fenêtre propose d'installer l'application. **En HTTPS** (voir ci-dessus), le bouton « Installer l'application » l'installe en un geste et les rappels par notification fonctionnent. **En HTTP** sur l'adresse IP, Chrome n'autorise ni l'installation en un geste ni les notifications : la fenêtre explique l'ajout manuel (**⋮ → Ajouter à l'écran d'accueil**). Une fois installée ou refusée, elle n'est plus proposée.
- **iPhone (Safari)** : ouvrir l'adresse, **Partager → Sur l'écran d'accueil → Ajouter**.

L'application n'a pas de mode hors ligne : le téléphone doit joindre le serveur (sinon une page « Serveur injoignable » s'affiche, en HTTPS).

---

## 8. Sécurité, comptes et sauvegardes

### Comptes et rôles
- Pas de compte ni de code par défaut. Le premier compte créé est **administrateur** ; un administrateur peut en nommer d'autres.
- Les fonctions de serveur (sauvegardes, restauration, optimisation, comptes, effacement global) sont réservées aux administrateurs : bouton **Admin** de l'en-tête.
- **Mot de passe oublié** : un administrateur génère un mot de passe temporaire depuis l'interface. Si plus aucun administrateur ne peut se connecter :
  ```bash
  docker exec -it ma-badgeuse node backend/dist/scripts/resetPassword.js <identifiant> --admin
  ```
  Le script affiche un mot de passe temporaire (à changer à la connexion) ; `--admin` donne aussi le rôle administrateur.

### Sauvegardes automatiques
- Une sauvegarde par jour (`auto_backup_*`), 14 gardées.
- Une sauvegarde de sécurité (`safety_*`) avant chaque restauration, effacement ou mise à jour par le script ; 20 gardées.
- Copiez régulièrement le dossier `backups/` **hors du serveur** (autre disque, NAS) : une sauvegarde sur la même machine ne protège pas d'une panne de disque.

### Restaurer
- **Depuis l'interface** (recommandé) : *Admin → Sauvegardes → Restaurer*, ou importer un fichier `.sqlite`. Le fichier est vérifié avant, une sauvegarde de sécurité est faite, et l'ancienne base est remise automatiquement si la restauration échoue.
- **En ligne de commande** :
  ```bash
  cd /opt/Ma-Badgeuse
  docker compose down
  sudo rm -f data/database.sqlite-wal data/database.sqlite-shm
  sudo cp backups/<sauvegarde>.sqlite data/database.sqlite
  sudo chown 1000:1000 data/database.sqlite
  docker compose up -d
  ```
  Au démarrage, l'application applique les migrations nécessaires si la sauvegarde vient d'une version plus ancienne.

---

## 9. Dépannage

- **L'application répond-elle ?** `curl -fsS http://localhost:3000/api/health` doit renvoyer `{"status":"ok",...}`.
- **Le conteneur redémarre en boucle avec « SQLITE_CANTOPEN » ou « EACCES »** : les dossiers n'appartiennent pas à l'uid 1000. `sudo chown -R 1000:1000 data backups` puis `docker compose up -d`.
- **Port déjà utilisé** : `sudo ss -tulpn | grep 3000`, puis changer `PORT` dans `.env`.
- **« Requête refusée : origine non autorisée »** : l'adresse utilisée dans le navigateur n'est pas celle du serveur (proxy mal configuré) ; ajouter l'adresse dans `ALLOWED_ORIGINS`.
