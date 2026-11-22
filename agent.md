# Directives & Règles Strictes pour l'IA (agent.md)
**Application :** Suivi Heures Pro (Ma Badgeuse)  
**Version :** 0.2.0  
**Environnement cible :** Auto-hébergement Docker sur Proxmox (Debian LXC / VM)  
**Date :** Novembre 2026

---

## 1. INTERDICTIONS STRICTES & SÉCURITÉ DU REPOSITORY

> [!CAUTION]
> **RÈGLE N°1 ABSOLUE - CONTRÔLE DE VERSION GIT :**
> **Il est STRICTEMENT INTERDIT à l'IA d'exécuter toute commande Git (`git init`, `git add`, `git commit`, `git push`, `git checkout`, `git branch`, etc.) sans l'accord explicite et préalable de l'utilisateur.**  
> Toute gestion du dépôt de code est sous la responsabilité directe de l'utilisateur.

- **Aucune dépendance externe non maîtrisée :** Toutes les dépendances (npm/Docker) doivent être documentées, stables et adaptées à Node.js 20+ LTS et React 18+.
- **Aucune commande destructive sans confirmation :** Tout nettoyage de volume, suppression de table ou reset de base de données nécessite une confirmation préalable.

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
  - `NEUTRAL` (Jour 0h, repos) : aucune dette générée.
  - `DEDUCTED` (Absence à rattraper / non payée) : génère un écart négatif équivalent aux heures manquées.
- **Vacances scolaires :** Ne suppriment jamais automatiquement les heures de travail prévues et ne constituent pas des congés personnels (des journées de grand nettoyage ou de préparation peuvent être travaillées).

### 2.5. Périodes & Règle de Priorité Anti-Écrasement
- Définition de plages de dates (ex. congés, fermeture, stage).
- **Règle d'or :** La modification individuelle d'une journée a **toujours la priorité** sur la période globale.
- Détection des conflits (`preserve_overrides: true`) avec alerte obligatoire avant tout écrasement.

### 2.6. Étanchéité Multi-Utilisateurs & Remise à Zéro Personnelle
- Chaque utilisateur possède son propre espace strictement étanche via `user_id`.
- La **Remise à Zéro personnelle (RAZ)** d'un utilisateur supprime **exclusivement ses propres pointages** sans jamais altérer ceux des autres membres de la famille.
- Une sauvegarde d'urgence (`safety_user_X`) est systématiquement créée avant effacement et sanctuarisée contre la purge de rotation.

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

### 3.2. Sécurité des Accès & Administration
- **Mots de passe :** Hachage cryptographique **PBKDF2 avec sel aléatoire de 16 octets** et 10 000 itérations SHA-256. Rétrocompatibilité avec mise à niveau automatique des anciens hachages.
- **Anti-Bruteforce :** Verrouillage automatique de 15 minutes après 5 échecs consécutifs.
- **Mode Administrateur :** Protégé par code PIN administrateur (`x-admin-pin`). Les actions globales (sauvegardes serveur, restauration, reset total, suppression de compte) requièrent impérativement ce PIN.

### 3.3. PWA & Installation Smartphone
- Manifeste PWA complet avec icônes dédiées :
  - `pwa-192x192.png` (grille d'applications Android)
  - `pwa-512x512.png` (écran de démarrage / splash screen)
  - `apple-touch-icon.png` (iOS Safari)
  - `favicon-64x64.png` (navigateurs desktop)
- Service Worker assurant le cache applicatif et le fonctionnement hors-ligne.
