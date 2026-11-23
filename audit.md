# Audit de « Ma Badgeuse » (Suivi Heures Pro)

- **Date de l'audit :** 23 novembre 2026
- **Version auditée :** `0.1.0` d'après le code (`package.json` ×3 et `/api/health`) ; la documentation annonce 0.2.0 et 0.2.1
- **Volume :** environ 13 400 lignes (backend ≈ 4 500, frontend ≈ 8 500)
- **Règle suivie :** aucun fichier du projet n'a été modifié. Ce fichier `audit.md` est la seule création. Les vérifications par exécution ont été faites sur une copie placée hors du projet.

> **Mise à jour du 23 novembre 2026 — version 0.3.0.** Les chapitres 1 à 10 et l'annexe décrivent la version **0.1.0 telle qu'auditée** ; ils sont conservés tels quels comme référence. L'état actuel de chaque constat, les défauts trouvés pendant les corrections et ce qui reste à faire sont au **[chapitre 11 — Suivi des corrections](#11-suivi-des-corrections-version-030)**.

---

## 1. Synthèse

L'application compile, se construit et passe son banc de tests (23/23). Le cœur métier (calcul des écarts, soldes, année scolaire) est lisible et les requêtes SQL sont paramétrées et filtrées par utilisateur.

**En l'état, elle ne doit pas être exposée sur un réseau qui n'est pas entièrement de confiance.** N'importe qui pouvant joindre le port 3000 peut, sans aucun identifiant :

1. prendre le contrôle du compte n°1 (`maman`) en réinitialisant son mot de passe avec la réponse secrète par défaut `famille` ;
2. ou créer un compte, puis utiliser le PIN administrateur par défaut `1234` (affiché en clair dans l'interface) pour télécharger toute la base, la remplacer ou l'effacer ;
3. modifier le catalogue des statuts, qui n'est protégé par aucune authentification.

Les protections annoncées dans la documentation (anti-force brute, « JWT », PWA hors-ligne, validation de mois) sont soit inopérantes, soit absentes du code. Ces points ont été **constatés par exécution**, pas seulement lus.

### Les 12 constats les plus graves

| # | Gravité | Constat | Preuve |
|---|---|---|---|
| 1 | Critique | Compte `maman` / `1234` et réponse secrète `famille` créés par défaut ; réinitialisation du mot de passe possible sans être connecté | `backend/src/database.ts:226-238` · sonde D2, D4 |
| 2 | Critique | PIN admin par défaut `1234`, affiché dans l'interface, accepté sans session et sans limite d'essais | `database.ts:403`, `frontend/src/App.tsx:3697` · sonde C1, C2 |
| 3 | Critique | Aucun rôle administrateur : tout compte (inscription libre) + le PIN = accès à toute la base | `middleware/adminAuth.ts` · sonde E1, E3 |
| 4 | Critique | `/api/status` monté avant le contrôle d'authentification : lecture, modification et création de statuts par un anonyme | `backend/src/index.ts:41-45` · sonde B1 à B4 |
| 5 | Critique | Restaurer un fichier qui n'est pas une base SQLite écrase la base active : tout le serveur répond 500 | `services/backupService.ts:95-122` · sonde K1, K2 |
| 6 | Élevée | L'anti-force brute ne se déclenche jamais (le compteur est remis à zéro à chaque essai) | `services/authService.ts:8-29` · sonde D1 |
| 7 | Élevée | Deux écritures transactionnelles simultanées : une seule aboutit, les autres échouent en 500 | connexion SQLite unique · sonde I1 |
| 8 | Élevée | Aucune validation sérieuse des saisies côté serveur (date `2026-13-45`, `-500` heures, clés de réglages arbitraires) | `routes/entries.ts:120-147`, `routes/settings.ts:38` · sonde F1 à F8 |
| 9 | Élevée | La « validation » d'un mois ne verrouille rien | `routes/targets.ts` · sonde G1 |
| 10 | Élevée | « Annuler » annonce un succès alors que rien n'est annulé (objectifs, périodes) | `services/auditService.ts` · sonde H1, H2 |
| 11 | Élevée | Documents transmis à l'employeur erronés : décompte de congés par identifiants magiques, heures en décimal brut, impression du mauvais document | `App.tsx:1249-1258`, `1291`, `2871`, `4730` |
| 12 | Élevée | `App.tsx` : un seul composant de 4 830 lignes et 70 états ; environ 1 800 lignes de composants jamais utilisés à côté | `frontend/src/App.tsx`, `frontend/src/components/` |

### Chiffres clés

| Mesure | Résultat réel |
|---|---|
| Compilation backend (`tsc --noEmit`) | OK |
| Build backend | OK |
| Banc de tests backend (`npm run test:audit`) | 23 / 23 |
| Compilation et build frontend | OK, un seul fichier JS de 351 ko (87 ko compressé), ni manifest ni service worker |
| `npm audit` backend (hors dev) | 7 vulnérabilités : 1 critique, 4 élevées, 2 faibles |
| `npm audit` frontend | 3 modérées |
| Tests frontend | aucun |
| Lint | aucun outil configuré |

---

## 2. Périmètre, méthode et limites

### Ce qui a été lu intégralement

- **Documentation :** `README.md`, `KNOWLEDGE_BASE.md`, `agent.md`, `CHANGELOG.md`, `USER_GUIDE.md`, `docs/GUIDE_INSTALLATION_ET_GESTION_DOCKER.md`.
- **Backend :** `index.ts`, `database.ts`, `types.ts`, les 2 middlewares, les 10 routes, les 4 services, les 2 fichiers de tests.
- **Frontend :** `App.tsx` (4 830 lignes), `api.ts`, `types.ts`, `main.tsx`, `index.css`, `services/notificationService.ts`, les 7 composants, `public/sw-custom.js`, `index.html`, les fichiers de configuration.
- **Infrastructure :** `Dockerfile`, `docker-compose.yml`, `gestion-ma-badgeuse.sh`, `.env.example`, `.dockerignore`.

Les fichiers `.env` n'ont pas été lus.

### Ce qui a été exécuté

Sur une copie hors projet, avec Node 26.8.2 et npm 11.19.1 :

1. `npm ci`, `tsc --noEmit`, `npm run build` pour le backend et le frontend ;
2. `npm run test:audit` ;
3. `npm audit` ;
4. une **sonde HTTP** d'une cinquantaine de requêtes contre le serveur de la copie, lancé sur `127.0.0.1` avec une base jetable. Ses résultats sont cités sous la forme « sonde A1 » à « sonde K4 » et détaillés en annexe.

### Ce qui n'a pas été vérifié

| Élément | Raison |
|---|---|
| Build et exécution Docker | non lancés |
| Script `gestion-ma-badgeuse.sh` | lu, jamais exécuté |
| Comportement sous Node 20 (version de l'image) | tests faits sous Node 26 |
| Interface dans un navigateur | tous les constats d'interface viennent de la lecture du code |
| `/api/backup/export-current` sans jeton | déduit du test E3 (même contrôle d'accès), non appelé |
| Longueur maximale des notes | le test F4 a échoué pour une autre raison |
| Attribution des modifications anonymes à l'utilisateur n°1 | test H3 non concluant, constat issu du code seul |
| Lint | aucun outil configuré dans le projet |

---

## 3. Écarts entre la documentation et le code

| # | Ce que dit la documentation | Ce que fait le code | Gravité |
|---|---|---|---|
| DOC-1 | Anti-force brute : 5 échecs → blocage 15 minutes | Jamais déclenché : 8 échecs puis connexion réussie (sonde D1, D2) | Élevée |
| DOC-2 | Authentification « JWT / Bearer » | Jetons opaques aléatoires stockés en clair dans `user_sessions`, valables 365 jours | Moyenne |
| DOC-3 | PWA, service worker, usage hors-ligne | `vite-plugin-pwa` installé mais absent de `vite.config.ts` ; `public/sw-custom.js` jamais enregistré ; le build ne contient ni manifest ni service worker | Élevée |
| DOC-4 | Version 0.2.0 (`KNOWLEDGE_BASE`, `agent.md`) ou 0.2.1 (`CHANGELOG`, guide Docker) | `0.1.0` partout dans le code | Faible |
| DOC-5 | Validation de mois présentée comme une étape de contrôle | Simple drapeau : on peut toujours saisir dans un mois validé (sonde G1). Aucun bouton dans l'interface | Élevée |
| DOC-6 | Remise à zéro personnelle : « efface uniquement vos propres pointages, congés et régularisations » | Efface aussi les objectifs mensuels, le journal d'audit et les réglages (`backupService.ts:213-218`) | Moyenne |
| DOC-7 | « Copie de sauvegarde d'urgence de vos données » | La copie contient la base entière, tous comptes confondus | Moyenne |
| DOC-8 | Variable `APP_TIMEZONE` | Jamais lue par le code. Seul `TZ` agit, alimenté par `docker-compose.yml`. Hors Docker, la variable n'a aucun effet | Faible |
| DOC-9 | Dossier d'installation `/opt/Ma-Badgeuse` | Le script utilise `/opt/ma-badgeuse` | Moyenne |
| DOC-10 | Mise à jour « sans cache » et « sans coupure » ; journaux « en temps réel » | Build avec cache, redémarrage avec interruption, `logs --tail 15` | Faible |
| DOC-11 | Noms de sauvegarde donnés en exemple | Format réel : `backup_AAAAMMJJHHMMSS.sqlite` | Faible |
| DOC-12 | Objectif mensuel d'exemple : 80 h | Défaut du code : 120 h (et replis à 80 et 800 dans l'interface) | Faible |
| DOC-13 | Installation en PWA sur `http://IP:3000` | Un service worker exige HTTPS (hors `localhost`) : impossible tel que décrit | Moyenne |
| DOC-14 | Pied de page « Connexion sécurisée… » (`AuthScreen.tsx`) | Trafic en HTTP clair, protections décrites ci-dessus inopérantes | Moyenne |

---

## 4. Sécurité

### 4.1 Chaînes d'attaque constatées

**Chaîne A — prise de contrôle du compte principal, sans aucun identifiant**

1. `GET /api/auth/security-question?username=maman` renvoie le nom, le nom affiché et la question (sonde D3).
2. `POST /api/auth/reset-password` avec la réponse par défaut `famille` et un nouveau mot de passe de 4 caractères : accepté (sonde D4).
3. Variante encore plus directe : connexion avec `maman` / `1234` (sonde D2).

**Chaîne B — vol ou destruction de toutes les données**

1. Inscription libre avec un mot de passe de 4 caractères (sonde E1).
2. PIN admin `1234` : valeur par défaut, écrite dans l'interface (`App.tsx:3697`). S'il a été changé, 30 essais faux d'affilée ne déclenchent aucun blocage (sonde C2) : un PIN à 4 chiffres tombe en 10 000 requêtes au plus.
3. Avec un jeton quelconque et le PIN : création puis téléchargement d'une sauvegarde contenant **toute** la base — 106 496 octets, en-tête « SQLite format 3 », données de `maman` incluses (sonde E2, E3).
4. La base contient les empreintes de mots de passe, les réponses secrètes, le PIN et **les jetons de session en clair de tous les comptes**, réutilisables pendant un an.
5. Avec le même PIN : restauration d'un fichier arbitraire, remise à zéro du serveur, suppression de comptes.

**Chaîne C — sabotage sans compte**

`PUT /api/status/:id` et `POST /api/status` sans authentification : un statut système renommé, un autre créé avec une couleur invalide (sonde B2, B4). Ces statuts pilotent le calcul des heures de tous les comptes.

### 4.2 Constats détaillés

| ID | Gravité | Constat | Emplacement | Vérifié par |
|---|---|---|---|---|
| SEC-01 | Critique | Identifiants par défaut : `maman` / `1234`, réponse secrète `famille`, PIN admin `1234`. Aucun changement forcé au premier lancement. Repli codé en dur sur `1234` si le PIN est absent de la base | `database.ts:226-238`, `database.ts:403`, `authService.ts:295-302` | sonde C1, D2, D4 |
| SEC-02 | Critique | `/api/status` (lecture, modification, création) public | `index.ts:41-45`, `routes/status.ts` | sonde B1-B4 |
| SEC-03 | Critique | Le PIN est le seul privilège : pas de rôle admin en base. `GET /api/auth/users`, `DELETE /api/auth/users/:id`, `POST /api/auth/change-admin-pin` fonctionnent sans session, avec le PIN seul | `routes/auth.ts`, `middleware/adminAuth.ts` | sonde C1, C3 |
| SEC-04 | Critique | Restauration sans aucune validation du fichier (ni type, ni en-tête SQLite, ni `integrity_check`, ni schéma). La base active est fermée puis écrasée ; aucun retour arrière automatique | `routes/backup.ts`, `backupService.ts:95-122` | sonde K1, K2 |
| SEC-05 | Élevée | Anti-force brute inopérant : `checkRateLimit` supprime l'entrée dès que `Date.now() >= lockUntil`, or `lockUntil` vaut 0 après le premier échec. Le compteur ne dépasse jamais 1. Stockage en mémoire, perdu au redémarrage | `authService.ts:8-29` | sonde D1 |
| SEC-06 | Élevée | Aucune limite d'essais sur le PIN admin ni sur la question secrète | `routes/auth.ts`, `adminAuth.ts` | sonde C2 |
| SEC-07 | Élevée | PIN accepté dans l'URL (`?adminPin=`) : il finit dans l'historique du navigateur, les journaux de proxy et l'en-tête `Referer` | `adminAuth.ts` | sonde C3, E3 |
| SEC-08 | Élevée | Inscription ouverte à tous, mot de passe de 4 caractères minimum, aucune règle de complexité | `authService.ts:83`, `:260` | sonde E1 |
| SEC-09 | Élevée | Jetons de session stockés en clair, valables 365 jours, jamais purgés à l'expiration | `database.ts`, `authService.ts:180-189` | lecture + sonde E3 |
| SEC-10 | Élevée | Empreintes faibles : PBKDF2-SHA256 à 10 000 itérations (recommandation OWASP actuelle : 600 000, ou Argon2id) ; SHA-256 **sans sel** pour le PIN et la réponse secrète. Un PIN à 4 chiffres se retrouve instantanément à partir de la base volée | `authService.ts:42`, `:55`, `:64-66`, `:304-318` | lecture |
| SEC-11 | Élevée | Aucune en-tête de sécurité (pas de `helmet`, pas de CSP), `X-Powered-By: Express` exposé, CORS ouvert à toute origine | `index.ts:25` | sonde A1 |
| SEC-12 | Élevée | Trafic en HTTP clair sur le port 3000 : mots de passe, jetons et PIN circulent lisibles | `docker-compose.yml` | lecture |
| SEC-13 | Élevée | Le PIN admin est conservé en clair dans `sessionStorage` et renvoyé dans **toutes** les requêtes, y compris celles qui n'en ont pas besoin | `frontend/src/api.ts:25-27`, `:135`, `:149` | lecture |
| SEC-14 | Élevée | La déconnexion ne vide ni le PIN ni le drapeau admin : la personne suivante sur le même navigateur hérite du mode administrateur | `App.tsx:386-393` | lecture |
| SEC-15 | Moyenne | Jeton de session dans `localStorage` : lisible par tout script injecté. Aggravé par l'absence de CSP | `api.ts` | lecture |
| SEC-16 | Moyenne | Énumération des comptes : messages distincts pour compte inconnu, et `security-question` renvoie le profil | `authService.ts:96`, `:230`, `:249` | sonde D3 |
| SEC-17 | Moyenne | Messages d'erreur internes renvoyés au client (contraintes SQLite, noms de colonnes) | toutes les routes (`err.message`), `index.ts:67-70` | sonde B3, F4-F6 |
| SEC-18 | Moyenne | Affectation de masse sur les réglages : `updates = req.body`, clés et valeurs arbitraires, sans liste blanche ni limite de taille | `routes/settings.ts:38` | sonde F7 |
| SEC-19 | Moyenne | `const userId = req.userId \|\| 1` partout : dès qu'une route échappe au contrôle d'accès (cas de `/api/status`), l'action est imputée au compte n°1 au lieu d'être refusée | toutes les routes | lecture |
| SEC-20 | Moyenne | `GET /api/backup/status` accessible sans PIN : état d'intégrité, tailles, nombre et date des sauvegardes | `routes/backup.ts` | sonde E5 |
| SEC-21 | Moyenne | Lien `?quick_badge=auto` : un simple lien ouvert par une personne connectée enregistre un pointage sans confirmation | `App.tsx:423-437` | lecture |
| SEC-22 | Moyenne | Données du navigateur non cloisonnées par compte (`agent_name`, horaires habituels, téléphone et e-mail du responsable) : le second compte hérite du nom du premier sur les relevés imprimés | `App.tsx:369-372` | lecture |
| SEC-23 | Moyenne | Conteneur exécuté en `root`, sans `read_only`, `cap_drop` ni `no-new-privileges` ; images de base non épinglées | `Dockerfile`, `docker-compose.yml` | lecture |
| SEC-24 | Moyenne | `limit` du journal d'audit non borné ; pas de limite de débit globale | `routes/audit.ts:13` | lecture |
| SEC-25 | Faible | Comparaisons de secrets avec `===` (non à temps constant) | `authService.ts` | lecture |
| SEC-26 | Faible | `VACUUM INTO '${…}'` construit par concaténation. Le chemin vient du serveur aujourd'hui ; le motif reste fragile | `backupService.ts` | lecture |
| SEC-27 | Faible | `window.open(url, '_blank')` sans `noopener` | `App.tsx:1350` | lecture |
| SEC-28 | Faible | `.dockerignore` n'exclut pas `.env` | `.dockerignore` | lecture |
| SEC-29 | Faible | Dépendances : 7 alertes côté backend via `sqlite3 5.1.7` → `node-gyp` → `tar` (outils d'installation, non exécutés en service) ; 3 côté frontend via `vite-plugin-pwa`, qui n'est pas utilisé | `package.json` | `npm audit` |

### 4.3 Ce qui tient

- Requêtes SQL paramétrées ; filtrage systématique par `user_id` dans les routes de données (lecture du code).
- Traversée de chemin bloquée sur le téléchargement et la restauration grâce à `path.basename` (sonde E4 : 404).
- Téléchargement de sauvegarde refusé sans jeton (sonde E3 : 401) ; liste des sauvegardes refusée sans PIN (sonde E2 : 403).
- Sauvegarde de sécurité créée avant chaque restauration et chaque remise à zéro : c'est elle qui permet de se relever du cas SEC-04.
- Le compte n°1 ne peut pas être supprimé par l'administration.

---

## 5. Audit module par module

### 5.1 Backend

#### `backend/src/index.ts` (91 lignes)

| Ligne | Constat | Gravité |
|---|---|---|
| 25 | `cors()` sans restriction | Élevée |
| 26 | Corps JSON trop gros → **500** au lieu de 413 (sonde J2), car le gestionnaire d'erreurs ignore `err.status` | Faible |
| 34 | Version `0.1.0` en dur, en doublon de `package.json` | Faible |
| 41-45 | `/api/status` déclaré avant `authMiddleware` | Critique |
| 58-64 | `app.get('*')` renvoie `index.html` pour une route d'API inconnue : `GET /api/inconnu` → 200 `text/html` (sonde J1). Le frontend reçoit alors du HTML là où il attend du JSON | Moyenne |
| 67-70 | `err.message` renvoyé au client | Moyenne |
| 73-89 | Pas d'arrêt propre (`SIGTERM`) : la base n'est pas fermée, les minuteries de sauvegarde ne sont pas arrêtées | Moyenne |

#### `backend/src/database.ts` (407 lignes)

- **Une seule connexion partagée** pour toute l'application : cause directe du défaut de concurrence (voir CON-1).
- Migrations (l. 244-342) : suite d'`ALTER TABLE` dont les erreurs sont avalées, sans table de versions. Impossible de savoir quelles migrations ont été appliquées, ni de distinguer « colonne déjà présente » d'une vraie panne. `catch` vide l. 345-349.
- `reopenDatabase()` (l. 35-47) ne réapplique pas les `PRAGMA` : c'est l'appelant qui doit y penser.
- Compte et PIN par défaut créés à l'initialisation (l. 226-238, 403).
- Schéma : `user_id … DEFAULT 1` sur les tables de données (une insertion qui oublie l'utilisateur atterrit chez le compte n°1) ; `app_settings` fait doublon avec `user_settings` ; `status_catalog` est global à tous les comptes ; index redondant l. 121.
- Aucune purge des sessions expirées.

#### `backend/src/services/authService.ts` (339 lignes)

- Anti-force brute cassé (l. 8-29, SEC-05).
- `pbkdf2Sync` : appel **synchrone** qui bloque tout le serveur pendant le calcul. Tolérable à 10 000 itérations, bloquant si on monte au niveau recommandé : passer à la version asynchrone en même temps.
- `hashString` (l. 64-66) : SHA-256 sans sel, avec `trim().toLowerCase()`, utilisé pour la réponse secrète et le PIN.
- `resetPassword` (l. 239-289) : vérifie la réponse **avant** la longueur du nouveau mot de passe ; ce contrôle tardif permet de tester une réponse sans rien changer.
- Création de session écrite trois fois (inscription, connexion l. 180-189, réinitialisation l. 270-279).
- `deleteUserByAdmin` (l. 320-339) : transaction sur la connexion partagée.

#### `backend/src/middleware/auth.ts` (26 lignes) et `adminAuth.ts` (34 lignes)

- Extraction du jeton écrite trois fois (ici et deux fois dans `routes/auth.ts`).
- `adminAuth` lit le PIN dans l'en-tête, le corps **ou l'URL**. Il n'exige pas d'utilisateur authentifié et ne limite pas les essais.

#### `backend/src/routes/auth.ts` (132 lignes)

Dix routes publiques, dont trois d'administration protégées par le seul PIN (liste des comptes, suppression d'un compte, changement de PIN). Toutes renvoient 400 avec le message d'erreur interne.

#### `backend/src/routes/status.ts` (86 lignes)

Entièrement public. Aucune validation (couleur, libellé, longueur). Le drapeau `is_system` n'est pas respecté : un statut système est modifiable. Pas de suppression. `display_order` fixé à 99. Une règle comptable invalide renvoie le message brut de la contrainte SQLite (sonde B3). Les modifications ne laissent pas de trace dans le journal du compte appelant (sonde H0).

#### `backend/src/routes/entries.ts` (276 lignes)

| Ligne | Constat |
|---|---|
| 120 | L'expression régulière de date accepte `2026-13-45` (sonde F1) |
| 145-147 | `manual_actual_hours` non validé : `-500` accepté (sonde F2), `"abc"` enregistré comme `null` (sonde F3) |
| 177, 208 | `status_id` non vérifié : un identifiant inexistant provoque une erreur 500 de clé étrangère (sonde F4) |
| 178, 209 | Notes sans limite de longueur |
| 139-223 | Lecture, écriture et journalisation sans transaction |
| 166, 198 | `is_override = 1` dans tous les cas : le drapeau ne distingue plus rien |
| 240 | `computeDailyDelta(updated)` sans le paramètre `isUnworkedFuture`, contrairement aux deux `GET` : pour un jour futur, l'écart renvoyé à l'enregistrement diffère de celui renvoyé à la lecture |
| 23-36, 64-76, 226-238 | Même requête enrichie copiée trois fois |
| 15-19, 82-83 | Calcul de la date du jour écrit deux fois |
| — | Aucun contrôle du mois validé |

#### `backend/src/routes/periods.ts` (225 lignes)

Seule la durée (366 jours) est bornée. Heures, libellé, couleur et statut ne sont pas validés. Les chevauchements entre périodes ne sont pas contrôlés à la création, alors que `/check-conflicts` existe. Les week-ends sont exclus en dur ; les jours fériés ne sont pas gérés. Pas de modification (`PUT`). La suppression n'est pas transactionnelle. La création exécute une boucle d'écritures dans une transaction sur la connexion partagée.

#### `backend/src/routes/regularizations.ts` (146 lignes)

`reg_date` non validée. Le montant est contrôlé avec `parseFloat` (l. 62) mais inséré avec `Number()` (l. 76) : `"5abc"` passe le contrôle puis provoque une erreur 500 `NOT NULL` (sonde F5). Aucun plafond.

#### `backend/src/routes/targets.ts` (117 lignes)

`year_month` et `target_hours` non validés : `"nimporte"` / `"abc"` → erreur 500 (sonde F6). La validation est un drapeau sans effet (sonde G1). Le journal écrit `{is_validated: 0}` en dur comme ancienne valeur (l. 88), ce qui rend l'annulation fausse. Quatrième variante du calcul de l'objectif par défaut (l. 76).

#### `backend/src/routes/backup.ts` (204 lignes)

- `multer` écrit dans `backups/tmp` à côté du code, hors de `BACKUP_DIR` (sonde K4) : en Docker, ce dossier n'est pas dans le volume. Limite de 50 Mo, aucun filtre de type.
- `/export-current` crée une nouvelle sauvegarde sur le disque à chaque export.
- `/status` sans PIN (SEC-20).
- `/reset` (l. 192-204) fait exactement la même chose que `/reset-my-data` (l. 160-172).

#### `backend/src/routes/audit.ts` (37 lignes), `settings.ts`, `summary.ts`

`limit` non borné (`audit.ts:13`). `settings.ts:38` accepte tout le corps de la requête. `summary.ts` : `start_year` et `month` non validés (l. 14, 31).

#### `backend/src/services/hoursService.ts` (474 lignes)

- `computeDailyDelta` (l. 42-85) traite `NEUTRAL`, `MAINTAINED` et `DEDUCTED`. Les règles `VARIABLE` et `CUSTOM`, pourtant autorisées par la contrainte de la base et déclarées dans les types, tombent dans le cas par défaut sans traitement propre.
- Le commentaire d'en-tête (l. 88-94) annonce « Aucune fusion / Zéro compensation automatique » ; le code, vingt lignes plus bas (l. 217-219), compense les heures dues par les heures supplémentaires. L'un des deux est faux.
- `Math.max(0, …)` (l. 214-215) : une régularisation supérieure au solde est absorbée sans avertissement.
- Paramètre `userId = 1` par défaut (l. 95).
- Chaque appel recharge toutes les entrées de l'utilisateur depuis l'origine : coût croissant avec les années.
- Résolution des réglages (réglage utilisateur → réglage global → valeur en dur) écrite trois fois (dont l. 198-210).
- Heures en nombres flottants arrondis au centième : des écarts d'un centième sont possibles sur les cumuls.

#### `backend/src/services/backupService.ts` (316 lignes)

- Horodatage à la seconde : deux sauvegardes dans la même seconde portent le même nom.
- `restoreBackupFromFile` (l. 95-122) : aucune validation, aucun mode maintenance pendant l'opération, pas d'appel à `initDatabase()` ensuite. Restaurer une sauvegarde plus ancienne laisse donc un schéma non migré jusqu'au redémarrage.
- `resetUserData` (l. 202-236) : le message affirme que les autres comptes sont intacts — c'est exact pour les suppressions — mais la sauvegarde préalable copie toute la base, et le périmètre effacé dépasse ce qu'annonce le guide (DOC-6).
- `resetServerAll` (l. 241-274) ne supprime ni les comptes, ni les sessions, ni les réglages, ni les statuts modifiés : « remise à zéro complète » est exagéré.
- Deux blocs `catch {}` vides (l. 229, 267).
- Les sauvegardes `safety_…` ne sont jamais purgées : le disque se remplit.
- `getDatabaseStatus` renvoie le message d'exception comme valeur d'`integrity` (l. 146).

#### `backend/src/services/auditService.ts` (219 lignes)

- `JSON.parse` sans protection sur les anciennes valeurs.
- `undoLastAction` : retrouve l'action à annuler avec une expression régulière `/#(\d+)/` appliquée au texte libre du motif ; fenêtre limitée aux 30 derniers journaux ; pas de transaction.
- Pour les périodes et les objectifs mensuels, rien n'est restauré, mais la réponse est « annulée avec succès » (sonde H1, H2).
- Les modifications de statuts ne sont pas annulables.

#### `backend/src/types.ts` (174 lignes)

Recopié à la main dans `frontend/src/types.ts` (138 lignes) : les deux divergent déjà.

### 5.2 Frontend

#### `frontend/src/api.ts` (496 lignes)

- Le même enchaînement `res.json()` puis `if (!json.success) throw` répété une quarantaine de fois, sans fonction commune.
- Aucun traitement du 401 : une session expirée laisse l'interface affichée, avec des erreurs en console.
- `apiListUsers` (l. 115-124) appelle `/auth/users` sans PIN : toujours 403 (sonde C4). La liste des comptes de l'écran de connexion reste vide.
- PIN joint à toutes les requêtes (SEC-13).
- `triggerResetDatabase` fait doublon avec `triggerResetMyData`.
- Paramètres d'URL non encodés.
- `fetchSettings` avale l'erreur et renvoie un résultat vide.
- Fonctions sans interface correspondante : validation de mois, journal d'audit, liste et suppression des périodes, détection de conflits, gestion des statuts.

#### `frontend/src/services/notificationService.ts` (182 lignes)

- `(hStr || 14)` et `(mStr || 45)` : `0` est traité comme une valeur absente. Un rappel réglé sur `15:00` sonne à `15:45` ; minuit devient 14 h.
- `await navigator.serviceWorker.ready` ne se termine jamais puisqu'aucun service worker n'est enregistré : le rappel reste bloqué.
- « Valider mes 4h » en dur, icône `/vite.svg`.
- `isAlreadyBadged` (l. 166) regarde les entrées du **mois affiché**, pas du mois courant (voir FRO-B5).

#### `frontend/src/components/AuthScreen.tsx` (633 lignes)

Seul composant réellement affiché en dehors d'`App`. Une vingtaine de `useState`, champs dupliqués entre les trois formulaires, messages qui révèlent l'existence d'un compte, mention de sécurité trompeuse en pied de page (DOC-14).

#### `frontend/src/App.tsx` (4 830 lignes)

**Structure.** Un seul composant de la ligne 132 à la ligne 4828 : 70 `useState`, 7 `useEffect`, les gestionnaires de 310 à 1386, le rendu de 1388 à 4825 (en-tête, cinq blocs, six fenêtres modales et la zone d'impression). Chaque frappe au clavier relance le rendu de l'ensemble, zone d'impression comprise.

**Bugs fonctionnels**

| ID | Ligne | Constat | Gravité |
|---|---|---|---|
| FRO-B1 | 1249-1258 | Le décompte des congés envoyé à l'employeur repose sur les identifiants de statut 1, 2 et 7 et sur la présence des textes `0h` ou `cp` dans les notes. Tout statut renommé, ajouté ou réordonné fausse le chiffre | Élevée |
| FRO-B2 | 1291, 4476-4478, 4637, 4730 | Heures affichées en décimal brut (`7.25 h`, `+12.5 h`) sur le message à l'employeur, le bilan annuel et le relevé à signer, alors que des fonctions de mise en forme existent | Élevée |
| FRO-B3 | 2871 | Le bouton d'impression appelle `window.print()` sans régler le mode sur « mensuel », contrairement aux autres chemins (l. 637-646) : il peut imprimer le bilan annuel | Élevée |
| FRO-B4 | 440-443 | Un effet réinitialise le formulaire du jour à chaque changement des entrées ou des horaires habituels : une saisie en cours est effacée par un rechargement en arrière-plan | Élevée |
| FRO-B5 | 446-464 | Si le mois affiché n'est pas le mois courant, l'application croit que le jour n'est pas pointé, envoie un faux rappel, puis note le rappel comme envoyé — ce qui bloque le vrai | Moyenne |
| FRO-B6 | 544 | `.replace(/^[ -:]+/, '')` : l'intervalle « espace → deux-points » contient tous les chiffres. La note « 3 jours d'arrêt » devient « jours d'arrêt » | Moyenne |
| FRO-B7 | 524-526 | Le motif d'absence est retrouvé en cherchant son libellé dans les notes, avec repli sur le premier motif de la liste : un mauvais motif s'affiche sans bruit | Moyenne |
| FRO-B8 | 3436 | Le lien « Télécharger (.sqlite) » pointe sur `/api/backup/export-current` sans jeton ni PIN : le bouton renvoie 401 (déduit de la sonde E3) | Moyenne |
| FRO-B9 | 3393 | `integrity === 'ok' ? 'Base saine' : 'Vérifiée'` : le badge reste vert et dit « Vérifiée » quand l'intégrité est mauvaise ou pas encore chargée | Moyenne |
| FRO-B10 | 1848 | « ● À jour » écrit en dur : affiché même si le chargement a échoué. Les erreurs ne vont qu'en console | Moyenne |
| FRO-B11 | 887-906 | Le pointage rapide envoie à la fois des horaires et des heures forcées : le serveur ignore les horaires et marque la journée comme saisie manuelle | Moyenne |
| FRO-B12 | 572-594 | Aucune protection contre des réponses qui arrivent dans le désordre lors d'un changement rapide de mois | Moyenne |
| FRO-B13 | 3462 | `backupsList.slice(0, 5)` : seules les cinq dernières sauvegardes sont visibles, les autres ne sont ni restaurables ni supprimables depuis l'interface | Moyenne |
| FRO-B14 | 2012-2017 | Suppression d'un règlement sans gestion d'erreur | Faible |
| FRO-B15 | 1156 | Le bouton dit « Effacer les notes » alors que toute l'entrée est supprimée | Moyenne |
| FRO-B16 | 529-538, 565-567, 263-265, 104 | L'impact d'une absence est déduit des heures au lieu d'être stocké, avec trois valeurs par défaut contradictoires | Moyenne |
| FRO-B17 | — | Périodes créées sans contrôle de dates ni de conflits ; objectifs et règlements sans bornes cohérentes (maximum 999 h) | Moyenne |
| FRO-B18 | — | Pas de rechargement complet après restauration ou remise à zéro ; pas de `disabled` sur les opérations longues (double clic possible) | Moyenne |
| FRO-B19 | 850-851 | `id === 1` et « Maman » en dur pour décider de ce qui est affichable ou supprimable | Faible |
| FRO-B20 | — | Trois replis différents pour l'objectif (800, 80, 120) ; le nom de l'agent n'existe que dans le navigateur | Faible |

**Code mort dans le fichier.** Imports inutilisés : `triggerResetDatabase`, `formatSimpleHours`, `CalendarPlus`, `Send`, `Database`, `ShieldAlert`. Fonctions jamais appelées : `handleOpenSettle` (l. 1199-1201), `handleUpdateReminderTime` (l. 928-932). Variables calculées pour rien : `monthDelta` (l. 1247), `y` (l. 1306). États écrits mais jamais lus : `loadingDbStatus`, `loadingAnnual`, `savingTarget`.

**Accessibilité.** Six fenêtres modales sans `role="dialog"`, sans `aria-modal`, sans capture du focus ni fermeture par Échap. Boutons à icône seule sans `aria-label`. `<label>` non reliés à leur champ. Onglets, tableaux et jauges sans rôles ARIA. Textes de 9 à 11 px. `user-scalable=no` dans `index.html` interdit le zoom, et `user-select: none` sur `body` interdit de copier un chiffre.

#### Composants jamais utilisés (≈ 1 800 lignes)

| Fichier | Lignes | Remarque |
|---|---|---|
| `SettingsAndBackup.tsx` | 359 | refait dans `App.tsx` |
| `DayEntryModal.tsx` | 377 | refait dans `App.tsx` |
| `AuditAndRegularization.tsx` | 299 | journal d'audit absent de l'interface réelle |
| `CalendarView.tsx` | 210 | vue calendrier absente de l'interface ; contient un bug de fuseau (`toISOString()`) |
| `PeriodsManager.tsx` | 319 | liste et suppression de périodes absentes de l'interface |
| `CockpitVignette` (composant) | 274 | seules ses cinq fonctions de mise en forme sont importées |
| `public/sw-custom.js` | 21 | jamais enregistré |

Ces fichiers sont compilés et vérifiés à chaque build, donnent une fausse image de l'application à qui lit le dépôt, et expliquent en partie pourquoi la documentation décrit des écrans qui n'existent pas.

#### Configuration et build

- `vite.config.ts` : seulement `react()`. Serveur de développement ouvert sur `0.0.0.0`.
- `tsconfig.json` : `strict: true`, mais `noUnusedLocals` et `noUnusedParameters` à `false` — c'est ce qui laisse passer le code mort ci-dessus.
- Un seul fichier JS de 351 ko, sans découpage.
- `main.tsx` : pas de garde-fou d'erreur (`ErrorBoundary`) ; une exception de rendu donne une page blanche.

### 5.3 Infrastructure

#### `Dockerfile` (58 lignes)

Construction en plusieurs étapes, correcte. Manques : pas d'utilisateur non-root, images `node:20-alpine` non épinglées par empreinte, `HEALTHCHECK` écrit en double avec `docker-compose.yml`.

#### `docker-compose.yml` (28 lignes)

Clé `version: '3.8'` obsolète. Port publié sur toutes les interfaces en HTTP clair. Aucun durcissement (`read_only`, `cap_drop`, `security_opt`), aucune limite de ressources.

#### `gestion-ma-badgeuse.sh` (236 lignes)

| Constat | Gravité |
|---|---|
| `wait_for_health` renvoie 0 après expiration du délai : une mise à jour ratée est annoncée comme réussie | Élevée |
| Repli par `cp` d'une base SQLite en mode WAL pendant qu'elle est en service : copie potentiellement incohérente | Élevée |
| `git pull origin main` puis build exécutés en `root`, sans vérifier ce qui est récupéré | Moyenne |
| La sauvegarde d'avant mise à jour s'appelle `safety-before-update-…` (tiret) alors que le reste utilise `safety_` : elle n'est pas reconnue comme sauvegarde de sécurité et peut être purgée par la rotation | Moyenne |
| `TEMP_DIR` utilisée mais jamais définie | Moyenne |
| `docker image prune -f` nettoie les images de **tout** l'hôte, pas seulement celles de l'application | Moyenne |
| Chemin `/opt/ma-badgeuse` différent du guide | Moyenne |

#### `.env.example`, `.dockerignore`, outillage

`.env.example` (6 lignes) documente `APP_TIMEZONE`, que le code ne lit pas. `.dockerignore` n'exclut pas `.env`. Pas de fichier de verrouillage à la racine, pas d'ESLint, pas de Prettier, pas d'intégration continue, pas de script `lint` ni `test` standard.

### 5.4 Tests

`backend/src/tests/comprehensiveAudit.test.ts` (487 lignes) et `runAuditIsolated.ts` (52 lignes).

- Banc maison, sans bibliothèque de test : pas de rapport standard, pas de couverture.
- **Aucun test HTTP** : aucune des failles du chapitre 4 ne peut être détectée par ce banc. Le « 23/23 » ne dit rien de la sécurité.
- Le test 2.3 est tautologique (il vérifie ce qu'il vient d'écrire).
- Dates écrites en dur : certains tests changeront de sens avec le temps.
- Le banc force le PIN à `1234` et supprime des utilisateurs : dangereux s'il est lancé sur une vraie base.
- Les tests compilés se retrouvent dans `dist/tests/`, donc dans l'image de production.
- Aucun test côté frontend.

---

## 6. Erreurs de conception

| ID | Constat | Conséquence |
|---|---|---|
| CON-1 | Transactions `BEGIN … COMMIT` entrecoupées d'`await` sur une connexion unique | Deux requêtes simultanées se mélangent : 12 écritures en parallèle → 1 réussite, 11 erreurs « cannot start a transaction within a transaction » (sonde I1). Pire, les écritures d'une requête peuvent être validées ou annulées par la transaction d'une autre |
| CON-2 | L'administration repose sur un secret partagé (le PIN) et non sur un rôle | Impossible de savoir qui a fait quoi ; tout détenteur du PIN est administrateur |
| CON-3 | La logique métier est calculée deux fois : serveur (`hoursService`) et navigateur (`App.tsx`) | Deux résultats possibles pour le même chiffre ; le relevé imprimé n'est pas garanti identique à ce que le serveur calcule |
| CON-4 | Composant unique de 4 830 lignes | Toute modification risque une régression ailleurs ; aucun test possible ; performances dégradées |
| CON-5 | Le catalogue des statuts est global alors que les données sont par compte | Un compte (ou un anonyme, SEC-02) change les règles de calcul de tous |
| CON-6 | L'impact d'une absence et son motif ne sont pas stockés : ils sont devinés à partir des heures et du texte des notes | Affichages faux (FRO-B6, FRO-B7, FRO-B16) |
| CON-7 | État éparpillé entre serveur, `localStorage` et `sessionStorage`, sans cloisonnement par compte | Fuites entre comptes (SEC-22), réglages perdus en changeant d'appareil |
| CON-8 | Pas de système de migrations versionnées | Schéma réel inconnu après une restauration ou une mise à jour partielle |
| CON-9 | Restauration « à chaud » qui ferme et rouvre la connexion globale sous les requêtes en cours | Erreurs pendant l'opération ; base écrasée avant toute vérification (SEC-04) |
| CON-10 | Journal d'audit utilisé comme mécanisme d'annulation, en retrouvant la cible dans un texte libre | Annulation fragile et faussement réussie |
| CON-11 | Validation de mois sans effet de verrouillage | La fonction promise n'existe pas réellement |
| CON-12 | Valeurs par défaut métier (10:45, 14:45, 4 h, 120 h, 800 h) écrites à la fois côté serveur et côté navigateur | Divergences déjà visibles (80, 120, 800) |
| CON-13 | Heures stockées en nombres flottants | Erreurs d'arrondi sur les cumuls ; des minutes entières éviteraient le problème |
| CON-14 | Texte métier d'un cas particulier en dur (« mairie », « Restauration scolaire & Entretien des locaux », « Agent de cantine et service scolaire », « Maman ») dans une application multi-comptes | Les autres comptes impriment des documents au mauvais intitulé |
| CON-15 | Mentions « officiel » et « légale » sur des documents que rien ne certifie | Risque de malentendu avec l'employeur |
| CON-16 | Zone destructive (remise à zéro) placée sous les réglages courants, confirmations par `alert` / `confirm` du navigateur | Risque de fausse manipulation |

---

## 7. Qualité d'écriture

| ID | Constat | Emplacement |
|---|---|---|
| QUA-1 | `catch (err: any)` partout, plus de 20 fois côté interface ; `db.get<any>` généralisé côté serveur : le typage strict est contourné là où il serait utile | toutes les routes, `App.tsx` |
| QUA-2 | Blocs `catch` vides ou qui se contentent d'un message en console | `database.ts:345-349`, `backupService.ts:229`, `:267`, `api.ts` |
| QUA-3 | Codes HTTP incohérents : 400 pour une erreur interne, 500 pour une saisie invalide, 500 pour un corps trop gros, 200 HTML pour une route inconnue | routes, `index.ts` |
| QUA-4 | Commentaires qui contredisent le code ou promettent plus qu'il ne tient | `hoursService.ts:88-94` contre `:217-219` ; `backupService.ts:199-200` (« GARANTIE ABSOLUE » d'isolation, alors que la transaction partagée de CON-1 peut emporter les écritures d'un autre compte) ; `backupService.ts:271` (« Toutes les données de tous les comptes » alors que comptes, sessions, réglages et statuts sont conservés) |
| QUA-5 | Nombres et identifiants magiques : statuts 1, 2 et 7 ; `99` ; `360` ; `366` ; `999` ; `id === 1` | `App.tsx`, routes |
| QUA-6 | Mélange français / anglais dans les noms et les messages ; deux vocabulaires pour la même notion (`NEUTRAL \| TO_RECOVER \| COUNTED_AS_WORKED` dans l'interface, `AccountingRule` côté serveur) | `App.tsx`, `types.ts` |
| QUA-7 | Fonctions anonymes immédiatement exécutées dans le rendu (IIFE), utilitaires de date définis dans un fichier de composant, double export | `App.tsx:113-130` et rendu |
| QUA-8 | Plus de 40 `alert` et `confirm` natifs | `App.tsx` |
| QUA-9 | Dates construites avec `toISOString()` (UTC) dans du code qui raisonne en heure locale | `CalendarView.tsx` |
| QUA-10 | Aucun outil de lint ni de mise en forme ; options TypeScript de détection du code inutilisé désactivées | `frontend/tsconfig.json` |
| QUA-11 | Journalisation par `console.log` sans niveau ni horodatage ; rien ne trace les connexions, les échecs de PIN ou les restaurations | backend |
| QUA-12 | Cinq fonctions de mise en forme des heures presque identiques | `CockpitVignette.tsx` |

---

## 8. Doublons et code mort

### Doublons entre fichiers

| Élément dupliqué | Emplacements |
|---|---|
| Types partagés | `backend/src/types.ts` ↔ `frontend/src/types.ts` |
| Calcul des écarts et des soldes | `hoursService.ts` ↔ `App.tsx` |
| Valeurs par défaut métier | `database.ts`, `hoursService.ts`, `targets.ts`, `App.tsx` |
| Requête enrichie des entrées | `entries.ts` ×3 |
| Extraction du jeton | `middleware/auth.ts`, `routes/auth.ts` ×2 |
| Création de session | `authService.ts` ×3 |
| Résolution d'un réglage (utilisateur → global → défaut) | `hoursService.ts` ×3, `targets.ts` |
| Remise à zéro personnelle | `/api/backup/reset` ↔ `/api/backup/reset-my-data` ; `triggerResetDatabase` ↔ `triggerResetMyData` |
| Traitement des réponses d'API | `api.ts` ×40 environ |
| `HEALTHCHECK` | `Dockerfile` ↔ `docker-compose.yml` |
| Tables de réglages | `app_settings` ↔ `user_settings` |
| Numéro de version | 3 `package.json`, `index.ts`, 4 documents |

### Copier-coller à l'intérieur d'`App.tsx`

| Bloc | Lignes |
|---|---|
| En-têtes, identification, synthèse et signatures des deux documents imprimés | 4565-4616 ↔ 4686-4742 ; 4659-4681 ↔ 4800-4822 |
| Tableau des 12 mois, écran et impression | 4435-4528 ↔ 4619-4656 |
| Boutons d'impact d'absence | 2445-2485 ↔ 3945-3985 |
| Blocs et gestionnaires de remise à zéro | 3343-3378 ↔ 3514-3546 ; 756-776 ↔ 780-800 |
| Sélecteur de pause | 2249-2313 ↔ 3012-3089 |
| Compteur plus / moins | 2494-2519 ↔ 3101-3140 |
| Boutons d'envoi | 2806-2878 ↔ 4107-4154 |
| Fonctions d'impression | 636-641 ↔ 643-648 |
| Noms des mois | 970-973 ↔ 1262-1265 |

### Code mort

- Six composants et un service worker jamais utilisés (≈ 1 800 lignes, détail en 5.2).
- Dépendance `vite-plugin-pwa` installée, non utilisée, et source des 3 alertes `npm audit` du frontend.
- Imports, fonctions, variables et états inutilisés dans `App.tsx` (détail en 5.2).
- Routes serveur sans interface : validation de mois, journal d'audit, liste / suppression / conflits de périodes, gestion des statuts.
- Règles comptables `VARIABLE` et `CUSTOM` déclarées mais non traitées.

---

## 9. Propositions d'amélioration

Chaque proposition renvoie aux constats qu'elle corrige.

### Priorité 0 — avant toute mise en service sur un réseau partagé

| # | Action | Corrige |
|---|---|---|
| P0-1 | Supprimer les identifiants par défaut. Au premier lancement, afficher un écran de création du premier compte, qui devient administrateur. Retirer la mention du PIN de l'interface | SEC-01, top 1 et 2 |
| P0-2 | Déplacer `/api/status` derrière `authMiddleware` ; réserver l'écriture à l'administrateur ; respecter `is_system` | SEC-02 |
| P0-3 | Remplacer le PIN partagé par un rôle `is_admin` sur le compte. Exiger une session valide **et** ce rôle sur toutes les routes d'administration, y compris celles de `routes/auth.ts` | SEC-03, CON-2 |
| P0-4 | Corriger l'anti-force brute et l'étendre au PIN (si conservé) et à la réinitialisation ; le rendre persistant ou utiliser `express-rate-limit` | SEC-05, SEC-06 |
| P0-5 | Valider tout fichier restauré avant de toucher à la base : en-tête SQLite, ouverture en lecture seule, `PRAGMA integrity_check`, présence des tables attendues. Restaurer automatiquement la sauvegarde de sécurité en cas d'échec | SEC-04, CON-9 |
| P0-6 | Fermer l'inscription par défaut (variable d'environnement ou invitation par l'administrateur) ; exiger des mots de passe d'au moins 10 caractères | SEC-08 |
| P0-7 | Supprimer la réinitialisation par question secrète, ou la remplacer par une réinitialisation par l'administrateur | SEC-01, SEC-06, SEC-16 |
| P0-8 | Ne plus accepter le PIN dans l'URL ; ne plus l'envoyer dans toutes les requêtes ; vider PIN, drapeau admin et état à la déconnexion | SEC-07, SEC-13, SEC-14 |
| P0-9 | Mettre l'application derrière un proxy HTTPS (Caddy, Traefik, Nginx Proxy Manager) et n'écouter que sur `127.0.0.1` ou le réseau Docker | SEC-12 |

### Priorité 1 — fiabilité des données

| # | Action | Corrige |
|---|---|---|
| P1-1 | Remplacer `sqlite3` par `better-sqlite3` (transactions synchrones, donc atomiques) ou sérialiser les écritures dans une file | CON-1, SEC-29 |
| P1-2 | Valider toutes les entrées avec un schéma (`zod`) : dates réelles, bornes d'heures, statut existant, longueur des notes, liste blanche des réglages | SEC-18, sonde F1-F8 |
| P1-3 | Verrouiller réellement un mois validé (refus d'écriture côté serveur) et ajouter le bouton dans l'interface | CON-11, DOC-5 |
| P1-4 | Refaire l'annulation : stocker la table et l'identifiant visés dans des colonnes, exécuter dans une transaction, répondre « non annulable » quand c'est le cas | CON-10 |
| P1-5 | Supprimer `req.userId \|\| 1` : sans utilisateur, répondre 401 | SEC-19 |
| P1-6 | Hacher les jetons de session en base, réduire leur durée (30 jours glissants), purger les expirés ; passer à Argon2id ou PBKDF2 ≥ 600 000 itérations en asynchrone, avec re-hachage à la connexion | SEC-09, SEC-10 |
| P1-7 | Ajouter `helmet` avec une CSP, restreindre CORS à l'origine de l'application, masquer `X-Powered-By` | SEC-11 |
| P1-8 | Gestionnaire d'erreurs unique : message générique au client, détail dans les journaux, codes HTTP corrects, 404 JSON pour `/api/*` inconnu | SEC-17, QUA-3 |
| P1-9 | Corriger les documents sortants : heures en `h min` partout, décompte des congés fondé sur la règle comptable du statut, mode d'impression fixé avant `window.print()` | FRO-B1, B2, B3 |
| P1-10 | Corriger le script : `wait_for_health` doit échouer à l'expiration ; sauvegarde par `VACUUM INTO` ou `sqlite3 .backup`, jamais par `cp` ; préfixe `safety_` ; `TEMP_DIR` défini ; nettoyage limité aux images de l'application | 5.3 |
| P1-11 | Mettre en place des migrations numérotées avec table de suivi, rejouées après chaque restauration | CON-8 |

### Priorité 2 — structure et maintenabilité

| # | Action | Corrige |
|---|---|---|
| P2-1 | Découper `App.tsx` en écrans et composants (tableau de bord, formulaire du jour, livre de preuves, réglages, administration, impression), avec des hooks de données (`useMonthData`, `useSettings`) | CON-4, FRO-B4, B12 |
| P2-2 | Supprimer ou rebrancher les six composants orphelins ; retirer `vite-plugin-pwa` et `sw-custom.js` tant que la PWA n'est pas réellement faite | chapitre 8 |
| P2-3 | Un seul lieu de calcul : le serveur renvoie tous les chiffres, l'interface les affiche | CON-3 |
| P2-4 | Partager les types et les constantes métier entre serveur et interface (dossier `shared/` ou espace de travail npm) | chapitre 8, CON-12 |
| P2-5 | Stocker le motif et l'impact d'une absence dans des colonnes dédiées | CON-6 |
| P2-6 | Rendre les statuts propres à chaque compte, ou réserver leur modification à l'administrateur | CON-5 |
| P2-7 | Déplacer en base les réglages aujourd'hui dans le navigateur (nom de l'agent, employeur, intitulé de poste, contacts) et les rendre modifiables par compte | CON-7, CON-14, SEC-22 |
| P2-8 | Factoriser `api.ts` autour d'une fonction `request()` qui gère le 401 par un retour à l'écran de connexion | 5.2 |
| P2-9 | Stocker les durées en minutes entières | CON-13 |
| P2-10 | Installer ESLint, Prettier, activer `noUnusedLocals` et `noUnusedParameters`, ajouter des scripts `lint` et `test` | QUA-10 |
| P2-11 | Adopter Vitest : tests HTTP du serveur avec `supertest` (authentification, droits, validation, concurrence) et tests des composants ; exclure les tests de l'image de production | 5.4 |
| P2-12 | Mettre la documentation en accord avec le code : versions, PWA, « JWT », chemins, périmètre des remises à zéro | chapitre 3 |
| P2-13 | Conteneur : utilisateur `node`, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, images épinglées, `.env` dans `.dockerignore`, arrêt propre sur `SIGTERM` | SEC-23 |
| P2-14 | Rotation des sauvegardes `safety_…` ; nom de fichier à la milliseconde ; dossier temporaire de `multer` dans `BACKUP_DIR` | 5.1 |

### Priorité 3 — confort

| # | Action | Corrige |
|---|---|---|
| P3-1 | Remplacer `alert` / `confirm` par des fenêtres et des notifications intégrées | QUA-8 |
| P3-2 | Accessibilité : rôles ARIA et gestion du focus sur les fenêtres modales, `aria-label`, labels reliés, taille de texte minimale, zoom autorisé | 5.2 |
| P3-3 | Indicateur d'état réel (chargement, erreur, hors-ligne) à la place de « ● À jour » ; garde-fou d'erreur global | FRO-B10 |
| P3-4 | Corriger le rappel : `??` à la place de `\|\|`, ne plus attendre un service worker absent, vérifier le pointage sur le mois courant | 5.2, FRO-B5 |
| P3-5 | Confirmation avant le pointage par lien `?quick_badge=auto` | SEC-21 |
| P3-6 | Découpage du build et chargement différé de la zone d'impression | 5.2 |

---

## 10. Propositions de nouvelles fonctionnalités

Aucune de ces fonctions n'existe aujourd'hui dans l'interface réellement affichée.

### Déjà à moitié écrites dans le dépôt

| Fonction | État actuel |
|---|---|
| Vue calendrier mensuelle | composant `CalendarView.tsx` présent mais non branché |
| Journal des modifications consultable | route et composant présents, non branchés |
| Liste, modification et suppression des périodes, avec alerte de conflit | routes présentes, sans écran |
| Gestion des statuts (création, couleur, règle comptable) | routes présentes, sans écran |
| Validation et réouverture d'un mois | route présente, sans écran ni verrouillage |
| Vraie PWA : installation, lecture hors-ligne, pointage hors-ligne synchronisé au retour du réseau | dépendance installée, rien de câblé |

### Nouvelles

**Saisie**
1. Pointage en direct : boutons « J'arrive » / « Je pars » qui prennent l'heure courante, avec gestion de la pause.
2. Semaine type par jour (horaires différents le mercredi, par exemple) au lieu d'un horaire unique.
3. Jours fériés français et calendrier des vacances scolaires par zone, préremplis automatiquement — particulièrement utile pour un poste en milieu scolaire.
4. Plusieurs plages horaires dans une même journée (service du midi puis ménage du soir).
5. Modèles de journée réutilisables et duplication d'une semaine.
6. Pièces jointes aux absences (photo d'un arrêt, d'un planning).

**Suivi**
7. Graphiques d'évolution : solde mois par mois, heures faites contre objectif, comparaison d'une année sur l'autre.
8. Projection de fin de mois et de fin d'année : « à ce rythme, il manquera 6 h ».
9. Suivi des congés : droits acquis, pris, restants.
10. Alertes de seuil : solde dû trop élevé, objectif annuel hors d'atteinte.
11. Recherche et filtres dans l'historique (par statut, par mot dans les notes, par période).

**Échanges avec l'employeur**
12. Export CSV et Excel du mois et de l'année.
13. Vrai PDF généré par le serveur, identique sur tous les appareils, avec empreinte du document pour prouver qu'il n'a pas été modifié.
14. Lien de consultation en lecture seule, à durée limitée, pour le responsable.
15. Historique des relevés transmis (date, destinataire, contenu figé).
16. Modèles de message personnalisables.

**Comptes et sécurité**
17. Authentification sans mot de passe par passkey (WebAuthn), ou second facteur TOTP.
18. Liste des appareils connectés avec déconnexion à distance.
19. Journal de sécurité visible par l'administrateur : connexions, échecs, restaurations, suppressions.
20. Export personnel de ses propres données (JSON ou CSV) et suppression de son compte, sans passer par la base entière.

**Exploitation**
21. Sauvegardes chiffrées et copie automatique hors du serveur (partage réseau, WebDAV, S3).
22. Test de restauration automatique : chaque sauvegarde est rouverte et vérifiée.
23. Notifications push serveur pour le rappel de pointage, qui fonctionnent application fermée.
24. Page d'état pour l'administrateur : espace disque, dernière sauvegarde réussie, version, migrations appliquées.
25. Flux iCal des absences et périodes, à ajouter à un agenda.

---

## 11. Suivi des corrections (version 0.3.0)

État au 23 novembre 2026, recoupé avec le code de la version 0.3.0. Détail des commits : `MISE_A_JOUR_GIT.md` ; changements visibles : `CHANGELOG.md`.

Légende : ✅ corrigé • 🟡 corrigé en partie ou autrement que proposé • ⏳ non fait.

### 11.1 Chiffres clés, avant et après

| Mesure | 0.1.0 (audit) | 0.3.0 |
|---|---|---|
| Compilation backend et frontend | OK | OK, avec `noUnusedLocals` / `noUnusedParameters` |
| Tests backend | 23 / 23 | **42 / 42** (métier et HTTP, `npm test`) |
| `npm audit` backend (hors dev) | 7 vulnérabilités dont 1 critique | 0 |
| `npm audit` frontend | 3 modérées | 0 |
| Build frontend | 351 ko (87 ko compressé), ni manifest ni service worker | 348 ko (90 ko compressé), manifest + `sw.js` |
| `App.tsx` | 4 830 lignes, ≈ 70 états | **83 lignes** (session uniquement) ; écrans dans 17 composants (le plus long : `DayFormSection`, 611 lignes), logique dans `useWorkspace` (1 061 lignes) |
| Composants jamais utilisés | 6 (≈ 1 800 lignes) + `sw-custom.js` | 0 |
| Volume total | ≈ 13 400 lignes | ≈ 10 530 lignes (backend 4 170, frontend 6 360 dont ≈ 700 d'imports et de déstructurations dus au découpage) |

### 11.2 Les 12 constats les plus graves

| # | Constat (résumé) | État | Ce qui a été fait |
|---|---|---|---|
| 1 | Compte `maman` / `1234` et question secrète par défaut | ✅ | Plus aucun compte par défaut : le premier compte créé devient administrateur. Question secrète supprimée. |
| 2 | PIN admin `1234` affiché et sans limite | ✅ | PIN supprimé (en-tête, routes, interface). |
| 3 | Aucun rôle administrateur | ✅ | Rôle `is_admin` vérifié par le serveur (`requireAdmin`) sur toutes les routes d'administration. |
| 4 | `/api/status` accessible sans authentification | ✅ | Lecture réservée aux comptes connectés, écriture aux administrateurs (test HTTP). |
| 5 | Restauration d'un fichier quelconque qui écrase la base | ✅ | En-tête SQLite, `integrity_check`, tables attendues vérifiés avant remplacement ; retour automatique à la sauvegarde de sécurité en cas d'échec (test HTTP). |
| 6 | Anti-force brute inopérant | ✅ | 5 échecs par compte → 15 min, même avec le bon mot de passe ensuite ; limites par adresse IP (test HTTP). |
| 7 | Écritures simultanées en échec | ✅ | Connexion unique sérialisée, transactions (tests : 12 écritures simultanées). |
| 8 | Saisies non validées | ✅ | Validation de chaque champ (`backend/src/http.ts`), liste blanche des réglages, messages 400 clairs. |
| 9 | Mois « validé » sans verrouillage | ✅ | Mois verrouillé côté serveur (journées, périodes, règlements, objectif) ; bouton valider / rouvrir dans l'interface. |
| 10 | « Annuler » qui n'annule pas | ✅ | Annulation marquée (`undone_at`), étendue aux objectifs et périodes, refus explicite quand rien n'est annulable. |
| 11 | Documents transmis erronés | ✅ | Durées en heures et minutes partout, congés comptés par statut, en-têtes d'impression issus du compte. |
| 12 | `App.tsx` géant et composants morts | ✅ | Composants morts supprimés. `App.tsx` ne gère plus que la session ; chaque bloc d'écran, fenêtre et relevé est un composant (`components/workspace/`), la logique est dans des hooks (`useWorkspace`, `useTheme`, `useReminders`). |

### 11.3 Propositions d'amélioration (chapitre 9)

**Priorité 0** : toutes traitées.

| # | État | Remarque |
|---|---|---|
| P0-1 à P0-3 | ✅ | Premier compte administrateur, rôle `is_admin`, `/api/status` protégé. |
| P0-4 | ✅ | Compteur persistant par compte + limites par IP. Le PIN n'existe plus. |
| P0-5 | ✅ | Voir constat 5. |
| P0-6 | ✅ | Inscription fermée après le premier compte (réglable par l'administrateur) ; 10 caractères minimum. |
| P0-7 | ✅ | Réinitialisation par l'administrateur (mot de passe temporaire) ou script `resetPassword`. |
| P0-8 | ✅ | Plus de PIN ; session en cookie `HttpOnly` / `SameSite=Strict`, rien n'est stocké en JavaScript. |
| P0-9 | 🟡 | Documenté (guide d'installation, exemple Caddy, `BIND_ADDRESS`, `COOKIE_SECURE`, `TRUST_PROXY`) ; la mise en place du proxy HTTPS reste à faire sur le serveur. |

**Priorité 1**

| # | État | Remarque |
|---|---|---|
| P1-1 | 🟡 | `sqlite3` conservé (version 6) mais connexion unique et écritures sérialisées dans une file. |
| P1-2 | 🟡 | Validation écrite à la main (`http.ts`) plutôt qu'avec `zod`. |
| P1-3, P1-4, P1-5 | ✅ | Plus aucun `req.userId \|\| 1` : sans session, réponse 401. |
| P1-6 | ✅ | Jetons hachés, 30 jours glissants, purge ; mots de passe en scrypt, anciens hachages convertis à la connexion. |
| P1-7 | 🟡 | En-têtes (CSP, anti-cadre, `nosniff`…) posés sans `helmet` (`security.ts`) ; CORS retiré (même origine) ; `X-Powered-By` masqué. |
| P1-8 | ✅ | `HttpError` et gestionnaire unique ; 404 JSON pour une route d'API inconnue. |
| P1-9 | ✅ | Voir constat 11. |
| P1-10 | ✅ | Script : santé en échec à l'expiration, sauvegarde cohérente bloquante, préfixe `safety_`, nettoyage limité aux images du projet. Non exécuté en conditions réelles. |
| P1-11 | ✅ | Migrations `PRAGMA user_version` (v1, v2), rejouées à la réouverture après restauration. |

**Priorité 2**

| # | État | Remarque |
|---|---|---|
| P2-1 | 🟡 | Écrans découpés (17 composants, voir constat 12), comportement inchangé (captures identiques au pixel avant / après). La logique reste regroupée dans un seul hook `useWorkspace` de 1 061 lignes au lieu de hooks par domaine (`useMonthData`, `useSettings`…) : seuls le thème, les rappels et le message de transmission en sont sortis. |
| P2-2 | ✅ | Composants orphelins, `sw-custom.js` et `vite-plugin-pwa` supprimés ; une PWA minimale a ensuite été ajoutée (11.5). |
| P2-3 | 🟡 | Les soldes viennent du serveur ; quelques totaux d'affichage restent calculés dans l'interface. |
| P2-4 | ⏳ | Types et constantes toujours dupliqués entre serveur et interface. |
| P2-5 | ✅ | Colonnes `absence_reason` et `absence_impact`. |
| P2-6 | ✅ | Modification des statuts réservée aux administrateurs. |
| P2-7 | ✅ | Nom, employeur, poste et contacts stockés dans le compte. |
| P2-8 | ✅ | `request()` unique, retour à la connexion sur 401. |
| P2-9 | ⏳ | Durées toujours stockées en heures décimales (affichées en h/min). |
| P2-10 | 🟡 | `noUnusedLocals` / `noUnusedParameters` activés, scripts `test` et `typecheck` ; pas d'ESLint ni de Prettier. |
| P2-11 | 🟡 | Tests HTTP avec `node:test` (sans Vitest ni supertest) ; aucun test de composant frontend. |
| P2-12 | ✅ | Documentation réécrite (voir 11.4). |
| P2-13 | 🟡 | Utilisateur `node`, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `.env` exclu, arrêt propre sur `SIGTERM` ; images épinglées par version majeure (`node:24-alpine`), pas par empreinte. |
| P2-14 | ✅ | Rotation des sauvegardes `safety_` (20 gardées), noms de fichier à la milliseconde, dossier temporaire de `multer` sous `BACKUP_DIR/tmp`. |

**Priorité 3**

| # | État | Remarque |
|---|---|---|
| P3-1 | 🟡 | Plus aucun `alert()` (messages Toaster) ; 9 `window.confirm()` gardés pour les actions destructives. |
| P3-2 | ✅ | Fenêtres accessibles (rôle dialog, Échap, focus), libellés, zoom et sélection de texte rétablis, zones tactiles d'au moins 44 px. |
| P3-3 | 🟡 | Écran d'erreur global (`ErrorBoundary`) et état « Chargement / Erreur de chargement » ; pas de détection hors ligne. |
| P3-4 | ✅ | Rappel limité au mois en cours, sans attente d'un service worker absent ; sur Android, la notification passe par `sw.js` (HTTPS requis). |
| P3-5 | ✅ | Pointage par lien confirmé avant enregistrement. |
| P3-6 | ⏳ | Un seul fichier JS de 348 ko. |

### 11.4 Écarts entre documentation et code (chapitre 3)

DOC-1 à DOC-12 et DOC-14 : ✅, la documentation a été réécrite à partir du code (README, guide utilisateur, guide d'installation, base de connaissances, `agent.md`, CHANGELOG) et versionnée 0.3.0 partout.

DOC-13 (installation PWA sur `http://IP:3000`) : 🟡. La documentation explique maintenant la contrainte : installation en un geste et notifications Android en **HTTPS** uniquement, ajout manuel par le menu de Chrome en HTTP.

Captures d'écran refaites sur téléphone et guides disponibles en PDF, régénérés depuis le Markdown (`docs/GUIDE_UTILISATEUR.pdf`, `docs/GUIDE_INSTALLATION_ET_GESTION_DOCKER.pdf`).

### 11.5 Changements demandés après l'audit : usage exclusif sur téléphone

| Changement | Détail |
|---|---|
| Ergonomie | En-tête compact, barre de navigation en bas (Pointer, Congés, Bilan, Envoyer, Plus), menu « Plus » en panneau bas, zones tactiles agrandies, marges des écrans à encoche, `touch-action: manipulation`. |
| PWA minimale | `manifest.webmanifest` et `sw.js` **sans cache** (page « Serveur injoignable », clic sur les notifications). |
| Fenêtre d'installation Android | Installation native en HTTPS, instructions manuelles en HTTP ; plus proposée une fois installée ou refusée (`localStorage.install_prompt_state`), toujours accessible dans « Plus ». |

### 11.6 Défauts trouvés pendant les corrections

Absents de l'audit initial, trouvés en vérifiant l'application à l'écran :

| Réf. | Défaut | Gravité | État |
|---|---|---|---|
| NEW-1 | Solde net du mois (et de chaque mois du bilan annuel) calculé comme « fait − prévu » : une absence neutre apparaissait comme une dette (ex. « -3 h (Je dois) » au lieu de « +1 h (On me doit) »), en contradiction avec les compteurs | Élevée (chiffre faux affiché et transmis) | ✅ Calcul selon les règles du jour ; test ajouté |
| NEW-2 | Cartes du livre de preuves illisibles sur téléphone (écart affiché lettre par lettre) | Moyenne | ✅ Mise en page sur deux lignes |
| NEW-3 | Bandeau « Aujourd'hui non pointé » à l'étroit sur téléphone | Faible | ✅ Bouton pleine largeur |

### 11.7 Ce qui reste à faire ou à vérifier

**À faire**
- Mettre le proxy HTTPS en service (P0-9) : il conditionne aussi l'installation en un geste et les notifications sur Android.
- Scinder `useWorkspace` en hooks par domaine (P2-1), partager les types (P2-4), durées en minutes entières (P2-9), ESLint (P2-10), tests frontend (P2-11), découpage du build (P3-6).

**Non vérifié en conditions réelles**
- Construction de l'image Docker et exécution du script `gestion-ma-badgeuse.sh` (syntaxe contrôlée seulement).
- Sur un vrai téléphone Android : installation native, service worker, notifications, page « Serveur injoignable ». Le navigateur utilisé pour les tests refuse les service workers.
- Impression papier, partage WhatsApp / SMS.

**Fonctionnalités du chapitre 10 désormais disponibles** : journal des modifications consultable (onglet Historique), liste et suppression des périodes, validation et réouverture du mois, export CSV (proposition 12, sans Excel natif), installation PWA (sans hors-ligne). La vue calendrier a été retirée avec les composants morts ; la gestion des statuts n'a toujours pas d'écran.

---

## Annexe — Résultats de la sonde HTTP

Serveur de la copie lancé sur `127.0.0.1:3987`, base jetable, arrêté en fin de script.

| Réf. | Requête | Résultat |
|---|---|---|
| A1 | `GET /api/health` avec `Origin: http://evil.example` | 200, version `0.1.0`, `Access-Control-Allow-Origin: *`, `X-Powered-By: Express`, pas de CSP |
| B1 | `GET /api/status` sans authentification | 200, 9 statuts, tous `is_system: 1` |
| B2 | `PUT /api/status/:id` sans authentification | 200, libellé d'un statut système modifié |
| B3 | Idem avec une règle comptable invalide | 500, message de contrainte SQLite renvoyé tel quel |
| B4 | `POST /api/status` sans authentification, couleur invalide | 200, statut n°10 créé |
| C1 | `verify-admin-pin` avec `1234`, sans session | 200 |
| C2 | 30 PIN faux puis le bon | 30 × 401, puis 200 |
| C3 | `GET /api/auth/users?adminPin=1234`, sans session | 200, `["maman"]` |
| C4 | `GET /api/auth/users` sans PIN (appel réel de l'interface) | 403 |
| D1 | 8 connexions erronées sur `maman` | 8 × 400, jamais de blocage |
| D2 | Connexion `maman` / `1234` juste après | 200, jeton délivré |
| D3 | `security-question` pour `maman`, puis pour un inconnu | 200 avec profil et question ; 400 « Aucun compte trouvé » |
| D4 | `reset-password` de `maman` avec `famille`, nouveau mot de passe de 4 caractères | 200 |
| E1 | Inscription libre, mot de passe de 4 caractères | 200, jeton délivré |
| E2 | `backup/list` sans PIN ; `backup/create` avec le PIN | 403 ; 200 |
| E3 | Téléchargement de la sauvegarde sans jeton ; puis avec le jeton du compte tout juste créé et le PIN | 401 ; 200, 106 496 octets, base complète |
| E4 | Traversée de chemin sur le téléchargement | 404 |
| E5 | `backup/status` sans PIN | 200 |
| F1 | Entrée datée `2026-13-45` | 200, enregistrée |
| F2 | `manual_actual_hours: -500` | 200, écart de −504 h |
| F3 | `manual_actual_hours: "abc"` | 200, `actual_hours: null` |
| F4 | `status_id: 99999` | 500, erreur de clé étrangère |
| F5 | Régularisation `amount_hours: "5abc"` | 500, erreur `NOT NULL` |
| F6 | Objectif `year_month: "nimporte"`, `target_hours: "abc"` | 500, erreur `NOT NULL` |
| F7 | Réglages : clé inventée et heure invalide | 200, relus tels quels |
| F8 | Synthèse après ces saisies | solde négatif de 508 h |
| G1 | Mois validé, puis saisie dans ce mois | 200, 200 |
| H0 | Journal du compte de test | aucune trace des modifications de statuts |
| H1-H2 | Annulation de la validation du mois | « annulée avec succès », le mois reste validé |
| H3 | Attribution des modifications anonymes | non concluant |
| I1 | 12 écritures simultanées (6 périodes, 6 régularisations) | 1 × 200, 11 × 500 |
| J1 | `GET /api/inconnu` authentifié | 200 `text/html` |
| J2 | Corps JSON de plus de 100 ko | 500 |
| K1 | Restauration d'un fichier texte nommé `photo.jpg` | 500 « file is not a database » |
| K2 | Requêtes suivantes | toutes en 500 : base active écrasée |
| K3 | Fichiers restants | la sauvegarde manuelle et `safety_pre_restore_…` |
| K4 | Dossier temporaire de `multer` | créé hors de `BACKUP_DIR` |
