# Guide d'Installation & Administration Serveur — Ma Badgeuse

> **Sous-titre :** Déploiement Proxmox / Linux avec Docker & Script Interactif `gestion-ma-badgeuse.sh`  
> **Version :** 0.2.1 | **Date :** 22 Novembre 2026 | **Port par défaut :** 3000 (HTTP)  
> **Dépôt officiel :** [https://github.com/yanfrance-droid/Ma-Badgeuse.git](https://github.com/yanfrance-droid/Ma-Badgeuse.git)

---

## 1. Introduction & Principes Clés

**Ma Badgeuse** est une application web moderne (React 18 + Node.js 20 + SQLite 3) conçue pour enregistrer et calculer avec rigueur le temps de travail des agents scolaires et périscolaires.

Le déploiement est intégralement conteneurisé avec **Docker & Docker Compose**. Cela garantit :
- **Zéro dépendance complexe sur l'hôte :** Aucun besoin d'installer Node, npm, python ou des compilateurs sur votre serveur Proxmox / Debian. Tout est isolé dans le conteneur.
- **Persistance absolue des données :** La base de données SQLite (`database.sqlite`) vit dans un dossier monté sur votre machine hôte (`/opt/Ma-Badgeuse/data/`). Les mises à jour du conteneur ne détruisent **jamais** vos heures pointées.
- **Coexistence parfaite avec Budget Pro :** Ma Badgeuse utilise le port **3000** tandis que Budget Pro utilise le port **3001**. Les deux tournent simultanément sur le même serveur sans aucun conflit.

---

## 2. Prérequis sur votre Serveur Linux / Proxmox

Votre serveur (qu'il s'agisse d'une VM Debian/Ubuntu ou d'un conteneur LXC Proxmox) doit disposer des éléments suivants :

| Outil | Commande de vérification | Commande d'installation (si manquant) |
| :--- | :--- | :--- |
| **Docker Engine** | `docker --version` | `sudo apt update && sudo apt install -y docker.io` |
| **Docker Compose** | `docker compose version` | `sudo apt install -y docker-compose-plugin` |
| **Git** | `git --version` | `sudo apt install -y git` |
| **Curl** | `curl --version` | `sudo apt install -y curl` |

---

## 3. Répertoire Recommandé & Arborescence

Conformément aux standards Linux, l'application doit être installée dans le répertoire dédié aux logiciels tiers :
`/opt/Ma-Badgeuse`.

```text
/opt/Ma-Badgeuse/
├── docker-compose.yml        # Orchestration Docker (port 3000, volumes, healthcheck)
├── Dockerfile                # Recette multi-stage (build React + backend Node.js)
├── gestion-ma-badgeuse.sh    # Le script interactif tout-en-un d'administration
├── README.md                 # Documentation d'accueil et captures d'écran
├── USER_GUIDE.md             # Guide utilisateur métier complet
├── data/                     # [PERSISTANT] Contient database.sqlite (vos données)
│   └── database.sqlite
└── backups/                  # [PERSISTANT] Sauvegardes horodatées automatiques
    ├── backup_2026-11-22_21-00.sqlite
    └── ...
```

> ⚠️ **Règle d'or de la persistance des données :**  
> Les dossiers `/opt/Ma-Badgeuse/data/` et `/opt/Ma-Badgeuse/backups/` sont des volumes montés depuis l'hôte. Vous pouvez mettre à jour l'application, détruire l'image Docker ou reconstruire le conteneur 100 fois : vos données restent **toujours intactes** sur le disque dur.

---

## 4. Première Installation Pas-à-Pas (En 3 minutes)

Connectez-vous en SSH à votre serveur Proxmox / Linux, puis copiez-collez simplement les 4 commandes suivantes :

### Étape 1 : Cloner le projet GitHub dans `/opt`
```bash
cd /opt
sudo git clone https://github.com/yanfrance-droid/Ma-Badgeuse.git
cd /opt/Ma-Badgeuse
```

### Étape 2 : Rendre le script exécutable
```bash
sudo chmod +x gestion-ma-badgeuse.sh
```

### Étape 3 : Lancer le script de gestion
```bash
sudo bash gestion-ma-badgeuse.sh
```

### Étape 4 : Choisir l'option 1 dans le menu
Tapez `1` puis validez avec **Entrée**. Le script s'occupe de tout :
1. Création automatique des dossiers de données (`data/` et `backups/`) avec les bonnes permissions.
2. Génération du fichier `.env` s'il n'existe pas.
3. Téléchargement des images de base et compilation du code source.
4. Démarrage du conteneur en arrière-plan avec redémarrage automatique en cas de reboot du serveur (`restart: unless-stopped`).
5. Vérification de santé avec le Healthcheck HTTP.

> ✅ **Installation terminée avec succès !**  
> L'application est immédiatement accessible dans votre navigateur à l'adresse :  
> **`http://IP_DE_VOTRE_SERVEUR:3000`**

---

## 5. Le Script Interactif : `gestion-ma-badgeuse.sh`

Pour administrer votre application au quotidien sans avoir à retenir de commandes Docker compliquées, lancez simplement à tout moment :

```bash
sudo bash /opt/Ma-Badgeuse/gestion-ma-badgeuse.sh
```

### Les 6 fonctionnalités du menu :
1. **Option 1 : Nouvelle Installation**  
   Construit l'image Docker, configure les ports et démarre l'application pour la première fois.
2. **Option 2 : Mettre à jour l'application**  
   Récupère automatiquement les dernières modifications depuis GitHub (`git pull`), recompile le conteneur sans cache et redémarre proprement sans perte de données.
3. **Option 3 : Sauvegarder la base de données**  
   Crée une copie de sécurité immédiate et horodatée de `database.sqlite` dans le dossier `backups/`.
4. **Option 4 : Voir l'état et les logs**  
   Affiche l'état en direct du conteneur (UP, HEALTHY, Uptime) et fait défiler les journaux d'activité en temps réel.
5. **Option 5 : Redémarrer l'application**  
   Relance le conteneur en 5 secondes en cas de besoin ou après une modification réseau.
6. **Option 6 : Quitter**  
   Ferme le menu interactif et vous redonne la main sur votre terminal bash.

---

## 6. Accès Réseau & Configuration des Ports

### Comment trouver l'adresse IP locale de votre serveur ?
Sur votre serveur Linux, tapez :
```bash
hostname -I
```
Votre adresse ressemble généralement à `192.168.1.50` ou `10.0.0.25`.

### Tableau des Ports Réseau :
| Application | Port Hôte | URL d'accès | Statut |
| :--- | :--- | :--- | :--- |
| **Ma Badgeuse** | **3000** | `http://192.168.1.X:3000` | **Actif** |
| **Budget Pro** | **3001** | `http://192.168.1.X:3001` | **Indépendant (aucun conflit)** |

---

## 7. Installation sur Smartphone (iPhone & Android)

### 📱 Sur iPhone (Safari)
1. Ouvrez **Safari** et allez sur : `http://IP_SERVEUR:3000`
2. Touchez le bouton de **Partage** (le carré avec la flèche vers le haut en bas).
3. Touchez **« Sur l'écran d'accueil »**.
4. Touchez **« Ajouter »**.  
*L'icône s'installe en 10 secondes et s'ouvre en plein écran sans barre Safari.*

### 🤖 Sur Android (Chrome)
1. Ouvrez **Chrome** et tapez : `http://IP_SERVEUR:3000`
2. Touchez les **3 petits points verticaux ⋮** en haut à droite.
3. Touchez **« Ajouter à l'écran d'accueil »** (ou l'étoile **⭐ Favoris**).
4. Confirmez en touchant **« Ajouter »**.

---

## 8. Sécurité, Sauvegardes & Restauration

### Code PIN Administrateur par défaut : `1234`
Toutes les fonctions critiques (création de sauvegarde immédiate, téléchargement de la base `.sqlite`, restauration et réinitialisation) sont protégées par un **Code PIN Administrateur**.  
Le code PIN par défaut est **`1234`**. Vous pouvez le modifier à tout moment directement depuis l'interface web dans *Paramètres ➔ Sécurité*.

### Comment restaurer une sauvegarde en ligne de commande ?
En cas de fausse manipulation ou si vous souhaitez revenir à un état antérieur :
```bash
# 1. Arrêter le conteneur
cd /opt/Ma-Badgeuse
docker compose down

# 2. Remplacer la base courante par votre sauvegarde
sudo cp backups/backup_2026-11-22_18-00.sqlite data/database.sqlite

# 3. Relancer l'application
docker compose up -d
```

---

## 9. FAQ & Dépannage

- **Q : Comment vérifier que l'application répond correctement ?**  
  Tapez depuis votre terminal : `curl -I http://localhost:3000/api/health`. Le serveur doit répondre avec le code HTTP `200 OK`.
- **Q : Le conteneur refuse de démarrer (erreur port déjà utilisé) ?**  
  Vérifiez qu'une autre application n'utilise pas déjà le port 3000 : `sudo ss -tulpn | grep 3000`. Si besoin, changez le port dans `.env` (`PORT=3005`).
