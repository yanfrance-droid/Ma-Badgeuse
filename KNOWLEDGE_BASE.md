# Base de Connaissances & Spécifications Métier (KNOWLEDGE_BASE.md)
**Application :** Ma Badgeuse  
**Version :** 0.3.0  
**Date :** 23 novembre 2026  
**Cible :** Salariée de cantine scolaire & entretien communal (horaires variables, annualisation, forte saisonnalité)

---

## 1. CONTEXTE MÉTIER & PROBLÉMATIQUE

Le secteur de la restauration scolaire et de l'entretien des locaux communaux présente des spécificités organisationnelles majeures :
- **Planning ultra-variable :** Les horaires changent selon les jours (ex. présence renforcée les mardis et jeudis, service de cantine le midi, entretien le soir, fermetures exceptionnelles le mercredi).
- **Semaines scolaires vs Vacances :** Certaines périodes de vacances scolaires sont non travaillées, tandis que d'autres comportent des journées intenses de grand nettoyage, d'inventaire ou d'entretien des locaux.
- **Régime des heures complémentaires et supplémentaires :** La salariée effectue souvent des dépassements (retard des parents, nettoyage imprévu, remplacement d'un collègue) ou à l'inverse des départs anticipés si l'effectif d'enfants est réduit.
- **La logique de compensation directe (Rattrapage automatique) :** Les heures supplémentaires travaillées viennent prioritairement **éteindre la dette d'heures** due à l'employeur (ou inversement). L'utilisatrice doit voir en un clin d'œil son solde net réel tout en conservant la traçabilité de ses totaux bruts.

---

## 2. SPÉCIFICATIONS FONCTIONNELLES DÉTAILLÉES

### 2.1. Les Trois Niveaux Horaires

L'application distingue strictement 3 notions indépendantes :

1. **Objectif Mensuel Employeur (Théorique & Contractuel) :**
   - Heures contractuelles mensuelles définies par le contrat de travail ou l'arrêté de titularisation (ex. 80 h pour un temps partiel, ou quota annualisé de 800h).
   - Paramétrable mois par mois ou reconductible par défaut.
   - Il sert de repère macroscopique mais ne bloque en rien le planning réel.

2. **Heures Attendues au Planning (Jour après Jour) :**
   - Volume horaire que la salariée **doit** effectuer un jour donné selon le planning de l'école/cantine.
   - Exemple par défaut : 4h00 par jour (10h45 - 14h45 sans pause).
   - Ajustable librement au jour le jour.

3. **Heures Réellement Effectuées :**
   - Temps de présence effectif au poste de travail.
   - Calculé automatiquement à partir de `Heure d'arrivée` et `Heure de départ` (déduction faite d'une pause non rémunérée si renseignée), ou saisie directe de la durée totale.

---

### 2.2. Formules Mathématiques & Gestion du Temps

#### 2.2.1. Calcul de la Durée Travaillée d'une Journée
Soient :
- $T_{\text{arr}}$ : Heure d'arrivée (format `HH:mm`)
- $T_{\text{dép}}$ : Heure de départ (format `HH:mm`)
- $P$ : Durée de pause non payée en minutes

$$D_{\text{brute}} = \begin{cases} 
T_{\text{dép}} - T_{\text{arr}} & \text{si } T_{\text{dép}} \ge T_{\text{arr}} \\
(24\text{h}00 - T_{\text{arr}}) + T_{\text{dép}} & \text{si } T_{\text{dép}} < T_{\text{arr}} \quad \text{(passage de minuit)}
\end{cases}$$

$$H_{\text{effectuées}} = \max\left(0, D_{\text{brute}} - \frac{P}{60}\right)$$

#### 2.2.2. Écart Journalier & Règles Comptables des Statuts
$$\Delta_{\text{jour}} = H_{\text{effectuées}} - H_{\text{attendues}}$$

Le statut de la journée module le calcul de l'écart (`backend/src/services/hoursService.ts`) :
- **`MAINTAINED` (congé payé, arrêt maladie, férié, fermeture…) :** jamais de dette ; les heures faites au-delà du prévu comptent en plus.
- **`NEUTRAL` (jour à 0 h) et `VARIABLE` (vacances scolaires) :** aucune dette ; toute heure travaillée ce jour-là compte en plus.
- **`DEDUCTED` (congé sans solde) et `CUSTOM` :** écart brut, les heures manquées créent une dette.

Pour une absence, l'utilisatrice choisit aussi l'**impact**, enregistré avec la journée (`absence_reason`, `absence_impact`) :
- **Neutre** : 0 h prévue, 0 h faite.
- **À rattraper** : X h prévues, 0 h faite (dette de X h, sauf statut `MAINTAINED`).
- **Compté travaillé** : X h prévues et faites (avance l'objectif du mois).

> Les heures sont stockées en décimal (4.25 = 4 h 15) et toujours affichées en heures et minutes. Le passage au stockage en minutes entières n'a pas été fait (voir `audit.md`).

#### 2.2.3 bis. Mois validé
Un mois validé (`monthly_targets.is_validated`) est verrouillé : le serveur refuse (409) toute création, modification ou suppression de journée, période, régularisation ou objectif datée de ce mois, jusqu'à sa réouverture.

#### 2.2.3. Compensation Directe des Soldes (Rattrapage Automatique)
Soient $\text{Brut}_{\text{pos}}$ la somme de tous les dépassements positifs historiques (plus les ajouts manuels) et $\text{Brut}_{\text{nég}}$ la somme de toutes les absences (plus les déductions manuelles) :

$$\text{Si } \text{Brut}_{\text{pos}} \ge \text{Brut}_{\text{nég}} \implies \begin{cases} \text{Solde Heures Sup Affiché} = \text{Brut}_{\text{pos}} - \text{Brut}_{\text{nég}} \\ \text{Solde À Rattraper Affiché} = 0 \end{cases}$$

$$\text{Si } \text{Brut}_{\text{nég}} > \text{Brut}_{\text{pos}} \implies \begin{cases} \text{Solde Heures Sup Affiché} = 0 \\ \text{Solde À Rattraper Affiché} = \text{Brut}_{\text{nég}} - \text{Brut}_{\text{pos}} \end{cases}$$

> [!TIP]
> **Transparence Paie :** L'écran d'accueil affiche les deux soldes nets compensés, et rappelle en petit les cumuls bruts totaux pour le contrôle avec la fiche de paie.

#### 2.2.4. Module de Régularisation Manuelle
Si l'employeur paie directement des heures sup sur la fiche de paie (sans repos compensateur) :
- Saisie d'une régularisation explicite (`SETTLE` pour déduire du solde, ou `ADD` pour ajouter un reliquat).
- Motif obligatoire (ex. « Paiement fiche de paie octobre »).
- Un règlement (`SETTLE`) ne peut pas dépasser le solde affiché ni être daté dans le futur.
- Traçabilité intégrale dans `audit_logs` ; « Annuler » rétablit la dernière action non encore annulée (`undone_at`).

---

### 2.3. Vignette Phare sur l'Accueil (Cockpit Mobile)

L'accueil mobile présente en haut d'écran la **Vignette Phare** :
1. **Bloc Positif (Vert / Émeraude) :**
   - Libellé : *"Heures Sup / Dues par l'employeur"*
   - Valeur en grand format : `+ X h Y min`
   - Bouton d'action rapide : "Régulariser / Récupérer"
2. **Bloc Négatif (Rose / Rouge) :**
   - Libellé : *"À Rattraper / Dues à l'employeur"*
   - Valeur en grand format : `- X h Y min` (ou `0 h 00` si compensé)
   - Bouton d'action rapide : "Régulariser / Rattraper"

---

## 3. SÉCURITÉ & MULTI-UTILISATEURS

### 3.1. Étanchéité Stricte par Utilisateur
- Toutes les tables métier (`daily_entries`, `periods`, `regularizations`, `monthly_targets`, `audit_logs`, `user_settings`) comportent une colonne `user_id`.
- Chaque requête SQL du backend filtre obligatoirement sur `user_id = req.userId`.

### 3.2. Effacement de ses propres données (`resetUserData`)
- Accessible à tout utilisateur pour son propre compte (onglet *Mon compte*, confirmation `RESET`).
- Crée d'abord une sauvegarde `safety_user_{id}_{horodatage}.sqlite`.
- Efface les journées, périodes, régularisations, objectifs mensuels et l'historique du compte ; **conserve les réglages** et le compte. Les autres comptes ne sont pas touchés.

### 3.3. Comptes, rôles et mots de passe
- **Rôle administrateur** (`users.is_admin`) ; le premier compte créé est administrateur, le dernier administrateur ne peut être ni supprimé ni rétrogradé.
- **Inscription** fermée après le premier compte (`app_settings.registration_open`), réouvrable par un administrateur.
- **Hachage scrypt** (N=16384, r=8, p=1, clé 32 octets, format `scrypt$N$r$p$sel$hash`) ; anciens formats PBKDF2 et SHA-256 acceptés puis convertis à la connexion. 10 caractères minimum.
- **Mot de passe temporaire** donné par l'administrateur ou par `node backend/dist/scripts/resetPassword.js <identifiant> [--admin]` : changement obligatoire à la connexion (`must_change_password`).
- **Limitation des essais** : 5 échecs par compte → 15 min ; 20 échecs par adresse IP / 15 min ; 5 inscriptions par IP / heure.

### 3.4. Sessions et protections HTTP
- Cookie `mb_session` `HttpOnly`, `SameSite=Strict`, `Secure` si `COOKIE_SECURE=true` ou requête HTTPS ; 30 jours glissants ; jeton stocké en SHA-256.
- Requêtes d'écriture acceptées seulement depuis la même origine (ou `ALLOWED_ORIGINS`).
- En-têtes CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` ; corps JSON limité à 100 Ko.

### 3.5. Administration du serveur (administrateurs)
- État de la base, optimisation (`VACUUM`), sauvegardes (création, liste, téléchargement), restauration depuis le serveur ou un fichier (vérifié avant remplacement, sauvegarde de sécurité, retour arrière automatique en cas d'échec), effacement des données de tous les comptes (`RESET_SERVEUR`).
- Rotation : 14 sauvegardes quotidiennes, 20 sauvegardes de sécurité.

---

## 4. UTILISATION SUR SMARTPHONE

- L'application est utilisée **exclusivement sur téléphone** : en-tête compact, **barre de navigation en bas** (Pointer, Congés, Bilan, Envoyer, Plus), menu « Plus » (réglages, historique, compte, administration, impression, thème, installation, déconnexion).
- **PWA installable** (`manifest.webmanifest`, icônes `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`). Sur Android, une fenêtre propose l'installation : en un geste en HTTPS, sinon explication de l'ajout par le menu de Chrome. Une fois l'application installée ou la proposition refusée, elle n'est plus proposée automatiquement.
- Le service worker `sw.js` ne met rien en cache : une connexion au serveur reste nécessaire (hors réseau, il affiche « Serveur injoignable »). Il n'est actif qu'en HTTPS ou sur `localhost`.
- **Thème** clair, sombre ou automatique (préférence mémorisée sur l'appareil).
- **Rappel de pointage** par notification, uniquement quand l'application est ouverte ; réglage mémorisé sur l'appareil. Sur Android, la notification passe par le service worker, donc exige HTTPS.
