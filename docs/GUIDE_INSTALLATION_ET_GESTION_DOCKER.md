# Guide d'Installation & Administration — Ma Badgeuse 0.3.0

> **Déploiement complet, script de gestion interactif, sécurité par rôle et maintenance pas-à-pas**  
> **Version :** 0.3.0 | **Date :** Novembre 2026 | **Port par défaut :** 3000 (HTTP)  
> **Dépôt officiel :** [https://github.com/yanfrance-droid/Ma-Badgeuse.git](https://github.com/yanfrance-droid/Ma-Badgeuse.git)

---

## 1. Introduction & Principes Clés

**Ma Badgeuse** est une application web moderne (React 18 + Node.js 24 Alpine + SQLite 3 en mode WAL) conçue pour enregistrer et calculer avec rigueur le temps de travail des agents scolaires et périscolaires.

Le déploiement est intégralement conteneurisé avec **Docker & Docker Compose**. Cela garantit :
- **Zéro dépendance complexe sur l'hôte :** Aucun besoin d'installer Node, npm, python ou des compilateurs sur votre serveur Proxmox / Debian. Tout est isolé dans le conteneur.
- **Persistance absolue des données :** La base SQLite (`database.sqlite`) vit dans un dossier monté sur votre machine hôte (`/opt/ma-badgeuse/data/`). Les mises à jour du conteneur ne détruisent **jamais** vos heures pointées.
- **Sécurité renforcée (Conteneur non-root) :** Le conteneur s'exécute avec l'utilisateur standard `node` (UID 1000) et un système de fichiers en lecture seule (`read_only`), sans privilèges d'administration sur l'hôte.
- **Coexistence parfaite avec Budget Pro :** Ma Badgeuse utilise le port **3000** tandis que Budget Pro utilise le port **3001**. Les deux tournent simultanément sur le même serveur sans aucun conflit.

---

## 2. Prérequis sur votre Serveur Linux / Proxmox

Votre serveur (qu'il s'agisse d'une VM Debian/Ubuntu ou d'un conteneur LXC Proxmox) doit disposer des éléments suivants :

| Outil | Commande de vérification | Commande d'installation (si manquant) |
| :--- | :--- | :--- |
| **Docker Engine** | `docker --version` | `sudo apt update && sudo apt install -y docker.io` |
| **Docker Compose v2** | `docker compose version` | `sudo apt install -y docker-compose-plugin` |
| **Git** | `git --version` | `sudo apt install -y git` |
| **Curl** | `curl --version` | `sudo apt install -y curl` |

---

## 3. Répertoire Recommandé & Arborescence

Conformément aux standards Linux et pour assurer une compatibilité parfaite avec **Dockage**, l'application s'installe dans le répertoire : `/opt/ma-badgeuse` (tout en minuscules).

```text
/opt/ma-badgeuse/
├── docker-compose.yml        # Orchestration Docker (port 3000, volumes, durcissement)
├── Dockerfile                # Recette multi-stage (Node 24 Alpine, build React + backend)
├── .env                      # Configuration d'environnement (copié depuis .env.example)
├── gestion-ma-badgeuse.sh    # Le script interactif tout-en-un d'administration
├── README.md & USER_GUIDE.md # Documentations technique et utilisateur
├── data/                     # [PERSISTANT, uid 1000] Contient database.sqlite (vos données)
│   └── database.sqlite
└── backups/                  # [PERSISTANT, uid 1000] Sauvegardes horodatées
    ├── auto_backup_*.sqlite  # Sauvegardes quotidiennes automatiques (14 conservées)
    ├── safety_*.sqlite       # Sauvegardes de sécurité avant mise à jour (20 conservées)
    └── tmp/                  # Dossier tampon des imports et restaurations
```

> [!WARNING]
> **Règle d'or des droits et de la persistance :**  
> Les dossiers `data/` et `backups/` sont des volumes montés depuis l'hôte. Comme le conteneur tourne avec l'utilisateur sécurisé non-root `node`, ces dossiers doivent appartenir à l'**UID 1000** (commande : `chown -R 1000:1000 data backups`). Vos données restent **toujours intactes** lors des mises à jour.

---

## 4. Première Installation Pas-à-Pas (En 3 minutes)

Connectez-vous en SSH à votre serveur Proxmox / Linux, puis copiez-collez simplement les 4 commandes suivantes :

```bash
# 1. Cloner le projet GitHub dans /opt (en minuscules) :
cd /opt
sudo git clone https://github.com/yanfrance-droid/Ma-Badgeuse.git /opt/ma-badgeuse
cd /opt/ma-badgeuse

# 2. Rendre le script exécutable :
sudo chmod +x gestion-ma-badgeuse.sh

# 3. Lancer le script de gestion :
sudo ./gestion-ma-badgeuse.sh

# 4. Choisir l'option 1 dans le menu interactif
```

Le script initialise les permissions UID 1000, compile l'image Docker Node 24 Alpine, démarre le conteneur et vérifie son bon fonctionnement.

> [!IMPORTANT]
> **Création immédiate du compte Administrateur :**  
> Dès la première ouverture sur `http://IP_DE_VOTRE_SERVEUR:3000`, créez votre compte principal. **Le premier compte créé reçoit automatiquement le rôle Administrateur** (remplace l'ancien code PIN 1234). Choisissez un mot de passe sécurisé d'au moins 10 caractères. L'inscription libre se ferme ensuite automatiquement pour protéger votre serveur.

---

## 5. Le Script Interactif : `gestion-ma-badgeuse.sh`

Pour administrer votre application au quotidien sans commande compliquée, lancez simplement :
```bash
sudo /opt/ma-badgeuse/gestion-ma-badgeuse.sh
```

- **Option 1 : Nouvelle Installation** — Construit l'image Docker, initialise les permissions UID 1000, configure l'environnement et démarre l'application.
- **Option 2 : Mettre à jour depuis GitHub** — Sauvegarde SQLite à chaud, téléchargement du nouveau code, rebuild sur Node 24, vérification des droits et redémarrage propre.
- **Option 3 : Sauvegarder la base** — Génère une copie cohérente immédiate (API SQLite `.backup`) dans `backups/safety_before_update_*.sqlite`.
- **Option 4 : Voir l'état et les logs** — Affiche l'état en direct du conteneur (UP, HEALTHY, Uptime) et fait défiler les journaux récents du serveur.
- **Option 5 : Redémarrer l'application** — Relance le conteneur en quelques secondes avec réévaluation du contrôle de santé en cas de besoin.
- **Option 6 : Quitter** — Ferme le menu d'administration interactif et vous redonne la main sur votre terminal bash.

---

## 6. Accès Réseau, Ports & Connexion Nomade

### Trouver l'adresse IP locale de votre serveur :
```bash
hostname -I   # ou : ip -brief address show
```

### Tableau des Ports Réseau :
| Application | Port Hôte | URL d'accès local | Statut |
| :--- | :--- | :--- | :--- |
| **Ma Badgeuse** | **3000** | `http://192.168.1.X:3000` | ● Actif |
| **Budget Pro** | **3001** | `http://192.168.1.X:3001` | ● Indépendant (aucun conflit) |

> [!TIP]
> **Recommandation : Accès nomade ultra-sécurisé avec WireGuard**  
> Si vous utilisez un VPN WireGuard (intégré à votre Freebox ou hébergé chez vous) : **vous n'avez aucun port web à ouvrir sur Internet !** Dès que WireGuard est actif sur votre smartphone en 4G/5G, vous êtes comme à la maison : ouvrez simplement `http://192.168.1.X:3000`. Le trafic est intégralement chiffré de bout en bout.

---

## 7. Installation sur Smartphone (PWA — Application Mobile)

Ma Badgeuse est spécialement ergonomisée pour être utilisée **comme une application native sur smartphone** :

- **Sur iPhone (Safari) :**
  1. Ouvrez Safari sur `http://IP_SERVEUR:3000`.
  2. Touchez le bouton de **Partage** (carré avec la flèche vers le haut).
  3. Faites défiler et touchez **« Sur l'écran d'accueil »**.
  4. Touchez **« Ajouter »** en haut à droite.
- **Sur Android (Chrome) :**
  1. Ouvrez Chrome sur `http://IP_SERVEUR:3000`.
  2. Touchez les **3 petits points verticaux ⋮** en haut à droite.
  3. Touchez **« Ajouter à l'écran d'accueil »** (ou « Installer l'application »).
  4. Confirmez en touchant **« Ajouter »**.

---

## 8. Sécurité, Rôles Administrateurs, Sauvegardes & Restauration

### Rôles et Sécurité (Fin du code PIN 1234)
- **Rôle Administrateur :** Donne accès au menu *« Plus ➔ Administration »* pour consulter la santé de la base, gérer les sauvegardes, créer des comptes pour les collègues, et ouvrir/fermer les inscriptions.
- **Mots de passe Scrypt :** Les mots de passe sont salés et hachés avec `scrypt` (minimum 10 caractères). Les sessions sont protégées par cookie sécurisé HttpOnly.
- **Secours mot de passe administrateur oublié :**  
  ```bash
  docker exec -it ma-badgeuse node backend/dist/scripts/resetPassword.js <identifiant> --admin
  ```

### Sauvegardes automatiques & Restauration
- **Sauvegardes quotidiennes :** Déclenchées automatiquement une fois par jour (`auto_backup_*.sqlite`, 14 conservées).
- **Sauvegardes de sécurité :** Créées avant chaque mise à jour ou restauration (`safety_*.sqlite`, 20 conservées).
- **Restauration depuis l'interface web :** Rendez-vous dans *Plus ➔ Administration ➔ Sauvegardes*.
- **Restauration en ligne de commande (Secours) :**
  ```bash
  # 1. Arrêter le conteneur
  cd /opt/ma-badgeuse && docker compose down

  # 2. Supprimer les fichiers temporaires WAL et restaurer la sauvegarde
  sudo rm -f data/database.sqlite-wal data/database.sqlite-shm
  sudo cp backups/safety_before_update_XXXX.sqlite data/database.sqlite
  sudo chown 1000:1000 data/database.sqlite

  # 3. Relancer l'application
  docker compose up -d
  ```

---

## 9. FAQ, Dépannage & Commandes Utiles

- **Comment vérifier que l'application répond correctement ?**  
  `curl -I http://localhost:3000/api/health` ➔ Doit renvoyer `HTTP 200 OK`.
- **Le conteneur plante au démarrage avec « EACCES: permission denied, mkdir '/app/backups/tmp' » ?**  
  Exécutez : `sudo chown -R 1000:1000 /opt/ma-badgeuse/data /opt/ma-badgeuse/backups && docker compose restart`.
- **Dans Dockage, je vois « ma-badgeuse » et « Ma-Badgeuse » ?**  
  Linux est sensible à la casse. Utilisez toujours `/opt/ma-badgeuse` en minuscules et supprimez l'ancien doublon : `rm -rf /opt/Ma-Badgeuse`.
- **Promouvoir un utilisateur Administrateur directement en console :**  
  `docker exec ma-badgeuse sqlite3 /app/data/database.sqlite "UPDATE users SET is_admin = 1 WHERE username = 'yann';"`
