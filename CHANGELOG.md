# Journal des Modifications (CHANGELOG.md)

Toutes les modifications notables apportées au projet **Suivi Heures Pro (Ma Badgeuse)** seront consignées dans ce fichier.  
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère à la spécification [Semantic Versioning](https://semver.org/lang/fr/).

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
