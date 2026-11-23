# Directives & Règles Strictes pour l'IA (agent.md)
**Application :** Ma Badgeuse  
**Version :** 0.3.0  
**Environnement cible :** Auto-hébergement Docker sur Proxmox (Debian LXC / VM)  
**Date :** 23 novembre 2026

---

## 1. INTERDICTIONS STRICTES & SÉCURITÉ DU REPOSITORY

> [!CAUTION]
> **RÈGLE N°1 ABSOLUE - CONTRÔLE DE VERSION GIT :**
> **Il est STRICTEMENT INTERDIT à l'IA d'exécuter toute commande Git (`git init`, `git add`, `git commit`, `git push`, `git checkout`, `git branch`, etc.) sans l'accord explicite et préalable de l'utilisateur.**  
> Toute gestion du dépôt de code est sous la responsabilité directe de l'utilisateur.

- **Aucune dépendance externe non maîtrisée :** Toutes les dépendances (npm/Docker) doivent être documentées, stables et adaptées à Node.js ≥ 20.17 (image Docker : Node 24 LTS) et React 18+.
- **Aucune commande destructive sans confirmation :** Tout nettoyage de volume, suppression de table ou reset de base de données nécessite une confirmation préalable.
- **Vérifier avant de livrer :** `npm test` (backend), `npm run typecheck` et `npm run build:all` doivent passer. Toute évolution du schéma passe par une nouvelle migration dans `backend/src/database.ts` (incrémenter `SCHEMA_VERSION`), jamais par une modification d'une migration existante.

---

## 2. RÈGLES MÉTIER VERROUILLÉES (NON NÉGOCIABLES)

L'IA doit se conformer rigoureusement aux principes métier validés par l'utilisateur :

### 2.1. Compensation Directe & Rattrapage Automatique des Heures
- **Logique de bon sens métier :** Les heures supplémentaires effectuées viennent **éteindre immédiatement et prioritairement la dette d'heures** due à l'employeur (ou inversement).
- **Formule mathématique nette :**
  - Si $\text{Brut Positif} \ge \text{Brut Négatif}$ :
    $$\text{Solde Positif Net} = \text{Brut Positif} - \text{Brut Négatif}, \quad \text{Solde Négatif Net} = 0$$
  - Si $\text{Brut Négatif} > \text{Brut Positif}$ :
    $$\text{Solde Négatif Net} = \text{Brut Négatif} - \text{Brut Positif}, \quad \text{Solde Positif Net} = 0$$
- **Exemple concret :** Si la salariée doit 4h et effectue 6h supplémentaires, sa dette s'éteint (0h due) et son compteur d'heures sup affiche **+2h00**.
- **Persistance infinie :** Aucun compteur n'est remis à zéro arbitrairement à la fin du mois civil. Le solde suit la salariée.
- **Transparence brute :** Le bandeau sous la vignette conserve la visibilité des totaux bruts historiques cumulés pour traçabilité paie.

### 2.2. Les Trois Niveaux Horaires
L'application doit toujours distinguer clairement :
1. **Objectif mensuel employeur (Fixe) :** Défini par contrat (ex. 80h ou mensualisation annualisée), indépendant du calendrier réel du mois.
2. **Heures attendues au planning (Variable jour par jour) :** Saisie librement jour après jour par l'utilisatrice en fonction des besoins de la cantine et de l'école (pas de grille rigide hebdomadaire imposée).
3. **Heures réellement effectuées :** Calculées à partir de l'heure d'arrivée et de l'heure de départ (ou saisie directe d'un bloc de durée en mode rapide).

### 2.3. Saisie Ultra-Simple & Mobile-First
- L'écran d'accueil est conçu pour un smartphone : gros pavés tactiles, lisibilité optimale en conditions de fatigue après le service de cantine ou d'entretien.
- Saisie quotidienne en 3 champs : `Heures prévues (attendues)` + `Heure d'arrivée` + `Heure de départ` (avec pause déductible si applicable).
- Calcul temps réel de la durée et de l'écart.
- Gestion propre du passage de minuit ($T_{\text{départ}} < T_{\text{arrivée}}$).

### 2.4. Statuts Calendrier & Règles Comptables
- 9 statuts métier par défaut avec palette chromatique spécifique (voir `KNOWLEDGE_BASE.md`).
- Chaque statut pilote le calcul via sa règle comptable `accounting_rule` :
  - `MAINTAINED` (Congé payé, Maladie avec maintien) : heures prévues réputées faites, écart négatif forcé à 0.
  - `NEUTRAL` (Jour 0h, repos) et `VARIABLE` (vacances scolaires) : aucune dette ; les heures travaillées comptent en plus.
  - `DEDUCTED` (Absence à rattraper / non payée) et `CUSTOM` : écart brut, les heures manquées créent une dette.
- Le motif et l'impact d'une absence sont enregistrés dans `daily_entries.absence_reason` / `absence_impact` ; ne jamais les déduire du texte de la note.
- Un mois validé est verrouillé : toute écriture datée de ce mois est refusée (`assertMonthsOpen`).
- **Vacances scolaires :** Ne suppriment jamais automatiquement les heures de travail prévues et ne constituent pas des congés personnels (des journées de grand nettoyage ou de préparation peuvent être travaillées).

### 2.5. Périodes & Règle de Priorité Anti-Écrasement
- Définition de plages de dates (ex. congés, fermeture, stage).
- **Règle d'or :** La modification individuelle d'une journée a **toujours la priorité** sur la période globale.
- Détection des conflits (`preserve_overrides: true`) avec alerte obligatoire avant tout écrasement.

### 2.6. Étanchéité Multi-Utilisateurs & Remise à Zéro Personnelle
- Chaque utilisateur possède son propre espace strictement étanche via `user_id`.
- La **Remise à Zéro personnelle (RAZ)** d'un utilisateur supprime **exclusivement ses propres données** (journées, périodes, régularisations, objectifs, historique) et conserve ses réglages ; les autres comptes ne sont jamais touchés.
- Une sauvegarde de sécurité (`safety_user_X`) est systématiquement créée avant effacement (rotation séparée : 20 sauvegardes de sécurité gardées).

---

## 3. ARCHITECTURE TECHNIQUE & SÉCURITÉ

### 3.1. Base de Données SQLite WAL
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
- Données dans `/app/data/database.sqlite`.
- Sauvegardes à chaud via SQLite `VACUUM INTO` dans `/app/backups`.
- **Une seule connexion**, opérations sérialisées ; toute écriture multiple passe par `db.transaction(...)`. Schéma versionné par `PRAGMA user_version` (migrations dans `database.ts`).
- Valeurs par défaut des réglages : un seul endroit, `backend/src/defaults.ts`.

### 3.2. Sécurité des Accès & Administration
- **Mots de passe :** scrypt, 10 caractères minimum ; anciens hachages (PBKDF2, SHA-256) convertis à la connexion.
- **Session :** cookie `HttpOnly` / `SameSite=Strict` ; aucun jeton ni secret stocké côté navigateur.
- **Anti-Bruteforce :** 5 échecs par compte → 15 minutes ; limites par adresse IP.
- **Administration :** rôle `is_admin` vérifié par le serveur (`requireAdmin`) ; aucun code PIN. Pas de compte par défaut : le premier compte créé est administrateur.
- **Entrées :** toute donnée reçue est validée avec les fonctions de `backend/src/http.ts` ; erreurs via `HttpError`, jamais de message interne renvoyé au client.

### 3.3. Utilisation sur smartphone (usage exclusif)
- L'application est utilisée **uniquement sur téléphone** : concevoir chaque écran pour une largeur de 360 à 430 px, au pouce. Zones tactiles d'au moins 44 px, actions principales dans la **barre de navigation du bas** (Pointer, Congés, Bilan, Envoyer, Plus), le reste dans le menu « Plus ». Respecter les marges `env(safe-area-inset-*)`.
- PWA installable : `frontend/public/manifest.webmanifest` + `frontend/public/sw.js`. Le service worker **ne met rien en cache** (il affiche seulement une page « Serveur injoignable » hors réseau et gère le clic sur les notifications) : ne pas y ajouter de cache sans stratégie de mise à jour.
- Fenêtre d'installation Android : `components/InstallPrompt.tsx` + `services/pwa.ts`. Une fois l'application installée ou la proposition refusée (`localStorage.install_prompt_state`), elle n'est plus affichée automatiquement ; elle reste accessible dans « Plus ».
- L'installation en un geste et les notifications Android exigent **HTTPS** (ou `localhost`). En HTTP sur le réseau local, la fenêtre explique l'ajout manuel par le menu de Chrome.
- Aucun script en ligne dans `index.html` (la CSP l'interdit) : utiliser un fichier dans `frontend/public/`.

### 3.4. Organisation du frontend
- `App.tsx` : session uniquement (vérification, connexion, changement de mot de passe imposé), puis `components/workspace/Workspace.tsx`.
- `hooks/useWorkspace.ts` : tout l'état et les actions de l'espace connecté (chargements, formulaire du jour, compteurs, objectifs, réglages, périodes, transmission). Il retourne un objet `WorkspaceModel` passé aux écrans sous la prop `app`. `hooks/useTheme.ts` et `hooks/useReminders.ts` gèrent le thème et les rappels.
- `components/workspace/` : un composant par bloc d'écran (`AppHeader`, `BottomNav`, `MoreMenu`, `QuickBadgeBanner`, `MonthOverview`, `CountersSection`, `DayFormSection`, `ProofBook`, `ShareSection`), par fenêtre (`SettingsModal`, `AdjustmentModal`, `PeriodModal`, `ShareModal`, `AnnualModal`) et par relevé imprimable (`MonthlyPrint`, `AnnualPrint`). Ils affichent et déclenchent les actions du modèle, sans logique métier propre.
- `domain.ts` : motifs d'absence, valeurs par défaut, fonctions pures (motif et impact d'une journée, libellés de l'historique). `utils/shareMessage.ts` : texte du récapitulatif envoyé au responsable.
- Ajouter un nouvel état ou une action dans `useWorkspace` (et l'ajouter à l'objet retourné), jamais dans un composant d'écran, sauf état purement visuel local.
