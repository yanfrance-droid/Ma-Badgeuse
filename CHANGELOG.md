# Journal des Modifications (CHANGELOG.md)

Toutes les modifications notables apportées au projet **Ma Badgeuse** sont consignées dans ce fichier.  
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère à la spécification [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.3.0] - 2026-11-23

Version issue de l'audit complet du code (voir `audit.md`). **Mise à jour à lire avant de déployer** : voir `MISE_A_JOUR_GIT.md`, section « Après le déploiement ».

### Sécurité (changements incompatibles)
- **Rôle administrateur** à la place du code PIN : le PIN, son en-tête `x-admin-pin` et ses routes sont supprimés. Le compte le plus ancien devient administrateur à la migration.
- **Plus de compte par défaut** : le premier compte créé devient administrateur, puis l'inscription libre est fermée (réglable par l'administrateur).
- **Session en cookie `HttpOnly` / `SameSite=Strict`** (plus de jeton dans `localStorage`), jetons stockés hachés : toutes les sessions existantes sont fermées par la migration.
- **Mots de passe** : scrypt, 10 caractères minimum ; un ancien mot de passe trop court doit être changé à la connexion.
- **Question secrète supprimée** : réinitialisation par l'administrateur (mot de passe temporaire) ou par le script `resetPassword`.
- Limitation des essais par compte (5 → 15 min) et par adresse IP, limitation des inscriptions.
- En-têtes de sécurité (CSP…), contrôle de l'origine des requêtes d'écriture, taille des requêtes limitée, erreurs internes jamais renvoyées telles quelles.
- Toutes les routes de sauvegarde, restauration et maintenance réservées aux administrateurs ; fichiers restaurés vérifiés (`integrity_check`, tables attendues) et retour automatique en arrière en cas d'échec.
- Dépendances : sqlite3 6, multer 2 (`npm audit` : 0 vulnérabilité en production). cors retiré (inutile, même origine).

### Corrigé
- Migrations versionnées (`PRAGMA user_version`), une seule connexion SQLite sérialisée, transactions sur toutes les écritures multiples.
- Validation stricte des données reçues (vraies dates, heures, nombres) avec messages d'erreur clairs ; 404 JSON pour une route d'API inconnue.
- Solde net du mois et des mois du bilan annuel calculé selon les règles du jour : une absence neutre n'apparaît plus comme une dette.
- Règles de calcul : statuts « VARIABLE » traités comme « NEUTRAL », « CUSTOM » comme « DEDUCTED » ; une absence « maintenue » ne crée jamais de dette.
- Régularisations : impossible de régler plus que le solde ou de dater un règlement dans le futur.
- « Annuler » couvre les journées, régularisations, objectifs et périodes, et ne rejoue jamais deux fois la même action.
- Une période qui chevauche une autre est refusée ; sa suppression est annulable.
- La remise à zéro personnelle ne supprime plus les réglages du compte.
- Frontend : le formulaire du jour n'est plus effacé par un rechargement des données, réponses obsolètes ignorées lors d'un changement de mois rapide, rappel de notification limité au mois en cours, pointage rapide par lien confirmé avant enregistrement, durées toujours affichées en heures et minutes, motif et impact d'absence enregistrés (plus déduits du texte de la note).

### Ajouté
- **Interface pensée pour le téléphone** (usage exclusif) : en-tête compact, barre de navigation en bas (Pointer, Congés, Bilan, Envoyer, Plus), menu « Plus » en panneau bas, zones tactiles agrandies, marges des écrans à encoche.
- **Fenêtre « Installer l'application » sur Android** : installation en un geste en HTTPS, explication de l'ajout manuel en HTTP ; plus jamais proposée une fois installée ou refusée (reste disponible dans « Plus »). Manifeste `manifest.webmanifest` et service worker minimal `sw.js` (sans cache : page « Serveur injoignable », clic sur les notifications).
- Notifications de rappel envoyées par le service worker quand il est actif (seule méthode acceptée par Chrome sur Android).
- **Validation / réouverture du mois** (mois verrouillé).
- **Historique** des 100 dernières modifications (onglet des réglages).
- **Export CSV** des journées (mois ou année scolaire), compatible Excel.
- **Administration** : comptes (création, mot de passe temporaire, rôle, suppression), inscription ouverte/fermée, liste complète des sauvegardes avec téléchargement.
- Réglages du compte stockés sur le serveur (nom, employeur, poste, contacts) au lieu du navigateur.
- Changement de mot de passe dans l'application ; messages non bloquants au lieu des `alert()` ; fenêtres accessibles (Échap, rôle dialog) ; écran d'erreur au lieu d'une page blanche.
- Tests automatisés (`npm test`, node:test) : 42 tests métier et sécurité sur une base temporaire isolée.
- Documentation : captures d'écran refaites sur téléphone, guide utilisateur illustré, guides disponibles en PDF (`docs/GUIDE_UTILISATEUR.pdf`, `docs/GUIDE_INSTALLATION_ET_GESTION_DOCKER.pdf`).

### Code
- `App.tsx` découpé (4 800 → 83 lignes) : un composant par bloc d'écran, fenêtre et relevé imprimable (`frontend/src/components/workspace/`), logique dans `hooks/useWorkspace.ts`, `useTheme.ts` et `useReminders.ts`, règles d'affichage dans `domain.ts`. Aucun changement visible.

### Infrastructure
- Image Docker Node 24, exécution en utilisateur non privilégié, système de fichiers en lecture seule ; `BIND_ADDRESS`, `COOKIE_SECURE`, `TRUST_PROXY`, `ALLOWED_ORIGINS` configurables.
- Script de gestion : sauvegarde cohérente avant mise à jour (échec bloquant), droits des dossiers, délai de démarrage en erreur, nettoyage limité aux images du projet.

### Retiré
- Composants frontend inutilisés, ancien service worker jamais enregistré (`sw-custom.js`) et dépendance `vite-plugin-pwa` (remplacés par le manifeste et `sw.js` ci-dessus).
- Export HTML du guide d'installation (le Markdown fait foi ; le PDF est régénéré à partir de lui) et capture d'écran sur ordinateur.

---

## [0.2.1] - 2026-11-22

### Amélioré (Compatibilité Mobile & Installation Android / iOS)
- **Installation Mobile Universelle sans échec sur réseau local :**
  - Remplacement de la contrainte WebAPK (qui échouait sous Chrome Android sur IP locale HTTP avec le message "Impossible d'installer cette application") par le mode direct « Ajouter à l'écran d'accueil ».
  - Intégration des balises `mobile-web-app-capable` et liens d'icônes haute résolution (192x192, 512x512) permettant une installation instantanée en 10 secondes sur tous les smartphones Android (Xiaomi MIUI/HyperOS, Samsung, Pixel) et iPhone Safari.
  - Expérience plein écran préservée sur smartphone sans barre d'adresse superflue.

---

## [0.2.0] - 2026-11-22

### Ajouté & Renforcé (Sécurité, Multi-Utilisateurs & PWA)
- **Authentification & Mots de Passe Cryptographiques Haute Sécurité :**
  - Hachage des mots de passe en **PBKDF2 salé** (sel aléatoire de 16 octets, 10 000 itérations SHA-256) avec conservation exacte de la casse.
  - Système de rétrocompatibilité et mise à niveau automatique des anciens hachages SHA-256 lors de la connexion.
  - Protection anti-force brute (rate limiting) : 5 échecs consécutifs bloquent l'accès pendant 15 minutes.
  - Gestion de session persistante avec jetons sécurisés (`user_sessions`).
- **Mode Administrateur Verrouillé par PIN (`x-admin-pin`) :**
  - Cadenassage strict de toutes les routes sensibles : création de sauvegardes serveur, export direct, restauration, upload `.sqlite`, suppression de comptes, et remise à zéro totale serveur.
  - Code PIN administrateur par défaut `1234` modifiable via l'interface.
- **Étanchéité Multi-Utilisateurs & Remise à Zéro (RAZ) Personnelle 100% Sécurisée :**
  - Isolation stricte des données par `user_id` sur toutes les tables (`daily_entries`, `periods`, `regularizations`, `user_settings`, `audit_logs`).
  - Fonctionnalité de **Remise à zéro personnelle** (`/api/backup/reset-my-data`) : efface exclusivement les données du compte connecté sans impacter les autres utilisateurs.
  - Création systématique d'une sauvegarde d'urgence `safety_user_X` avant effacement, protégée contre la rotation automatique.
- **Icônes d'Application Natives PWA (Progressive Web App) :**
  - Génération des icônes officielles au design de Ma Badgeuse (cadran d'horloge cyan et badge de validation émeraude sur fond bleu marine `#0D2B52`).
  - Fichiers intégrés : `pwa-192x192.png` (grille Android), `pwa-512x512.png` (splash screen), `apple-touch-icon.png` (iOS Safari) et `favicon-64x64.png`.
- **Validation Stricte des Entrées API :**
  - Contrôle par expressions régulières des dates (`YYYY-MM-DD`) et heures (`HH:mm`).
  - Bornes de sécurité sur les pauses (0-360 min), les heures journalières (0-24h) et les périodes (max 366 jours).
- **Stabilisation & Réaffirmation de la Compensation Directe (Rattrapage Automatique) :**
  - Conformité stricte avec le besoin métier réel : les heures supplémentaires travaillées éteignent directement et prioritairement la dette d'heures due à l'employeur.
  - Conservation du double rappel brut pour le contrôle de la paie.
- **Suite de Tests d'Audit Isolée :**
  - Banc de test automatisé exécuté dans une base temporaire dédiée `data/test_audit.sqlite` avec nettoyage automatique, garantissant la préservation de la base de production.

---

## [0.1.3] - 2026-11-21

### Corrigé & Perfectionné (Audit Calculs Métier)
- **Correction Capitale du Calcul des Heures Faites et Dues :**
  - Suppression définitive du calcul trompeur « X heures faites sur 80h ».
  - Alignement strict avec la réalité professionnelle de la collectivité / cantine : valorisation des heures faites en plus, des heures dues et du solde net compensé.
  - Correction comptable sur les absences (Congés Payés et Arrêt Maladie traités en journées régulières neutralisées).

---

## [0.1.2] - 2026-11-21

### Ajouté
- **Feuille d'Impression Officielle Homologuée (@media print - Code du Travail Art. L. 3171-4) :**
  - Document officiel A4 complet avec en-tête réglementaire, identification de l'établissement et horaires contractuels habituels (10h45 - 14h45, 4h00/j).
  - Double cadre de signatures et de visas légaux (visa de l'agent et visa de l'employeur).
- **Module « Poser une période » Multi-Jours en 1 Clic :**
  - Modale dédiée avec exclusion automatique des week-ends et détection des conflits (`preserve_overrides: true`).
- **Sécurité Anti-Inversion Arrivée / Départ :**
  - Détection dynamique des durées supérieures à 12h et confirmation de sécurité.

---

## [0.1.1] - 2026-11-21

### Ajouté
- **Gestion des Horaires Habituels (10h45 - 14h45, 4h00/jour) & Pauses jusqu'à 1 heure.**
- **Navigation Temporelle Complète & Synchronisée (Passé, Présent, Futur).**
- **Résolution du blocage en « Mode Modification en cours ».**

---

## [0.1.0] - 2026-11-21

### Ajouté
- **Socle Initial Complet :** Backend Node.js TypeScript sous SQLite WAL, Frontend React 18 PWA, conteneurisation Docker Proxmox et documentation de base.
