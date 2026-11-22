# Base de Connaissances & Spécifications Métier (KNOWLEDGE_BASE.md)
**Application :** Suivi Heures Pro (Ma Badgeuse)  
**Version :** 0.2.0  
**Date :** Novembre 2026  
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

Le statut de la journée module le calcul de l'écart :
- **`MAINTAINED` (Congé payé, Arrêt maladie avec maintien) :**
  Les heures attendues sont réputées faites : $H_{\text{effectuées}} \ge H_{\text{attendues}} \implies \Delta_{\text{négatif}} = 0$.
- **`NEUTRAL` (Journée de repos, Jour à 0h) :**
  Aucun impact, $\Delta_{\text{négatif}} = 0$.
- **`DEDUCTED` (Absence non rémunérée / À rattraper) :**
  Génère un passif égal aux heures manquées.

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
- Traçabilité intégrale dans `audit_logs`.

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

### 3.2. Remise à Zéro Personnelle Sécurisée (`resetUserData`)
- Accessible à tout utilisateur pour son propre compte.
- **Sauvegarde d'urgence immédiate :** Crée un fichier `safety_user_{id}_{timestamp}.sqlite` avant toute suppression.
- **Exclusion de purge :** Ces sauvegardes `safety_` sont exemptées de la rotation automatique des 14 jours.
- Supprime uniquement les enregistrements appartenant à l'utilisateur connecté (`WHERE user_id = ?`). Les autres comptes restent 100% intacts.

### 3.3. Hachage des Mots de Passe & Protection Anti-Bruteforce
- **Algorithme PBKDF2 salé :** 10 000 itérations SHA-256 avec sel aléatoire de 16 octets (`salt:hash`).
- **Préservation de la casse :** Majuscules et minuscules strictement respectées.
- **Rétrocompatibilité transparente :** Reconnait les anciens hash SHA-256 et les migre automatiquement vers PBKDF2 lors de la connexion.
- **Rate Limiting :** 5 tentatives infructueuses entraînent un blocage temporaire de 15 minutes.

### 3.4. Mode Administrateur Verrouillé par PIN
- Authentification par header HTTP `x-admin-pin`.
- Verrouille l'accès aux opérations serveur :
  - Création et liste des sauvegardes globales Proxmox.
  - Export direct de la base SQLite active.
  - Restauration de sauvegardes et upload de fichiers `.sqlite` (limité à 50 Mo).
  - Suppression de comptes utilisateurs (compte #1 protégé).
  - Remise à zéro totale du serveur (`RESET_SERVEUR`).

---

## 4. APPLICATION MOBILE (PWA) & INSTALLATION

L'application intègre le standard PWA (Progressive Web App) :
- **Icônes natives générées :**
  - `pwa-192x192.png` : Grille d'applications Android.
  - `pwa-512x512.png` : Écran de démarrage (*splash screen*) haute définition.
  - `apple-touch-icon.png` : Raccourci Safari iOS (180x180).
  - `favicon-64x64.png` : Onglet navigateur desktop.
- **Mode Standalone :** Fonctionne en plein écran sans barre d'adresse de navigateur.
- **Thème Sombre / Clair :** Détection automatique des préférences système ou sélection manuelle.
- **Notifications de Rappel de Pointage :** Rappel configurable (délai après la fin de poste) pour ne jamais oublier de badger.
