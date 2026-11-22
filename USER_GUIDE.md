# Guide Utilisateur Simple & Quotidien (USER_GUIDE.md)
**Application :** Suivi Heures Pro (Ma Badgeuse)  
**Pour qui ?** Personnel de cantine scolaire, d'entretien des locaux et de garderie.  
**Sur quoi ?** Optimisé pour smartphone (Android, iPhone) et ordinateur.

---

## 👋 Bienvenue sur Ma Badgeuse !

Ce guide a été conçu pour vous accompagner pas à pas. L'application est faite pour vous simplifier la vie, sans jargon technique ni calculs compliqués à faire de tête.

---

## 📲 1. Installer l'application sur votre smartphone (PWA)

Pour ouvrir l'application comme n'importe quelle vraie application mobile de votre téléphone (sans ouvrir le navigateur à chaque fois) :

### Sur Android (Google Chrome) :
1. Ouvrez l'adresse de votre application dans **Google Chrome**.
2. Souvent, Chrome affiche automatiquement un bandeau en bas de l'écran :  
   👉 **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.  
   *(Sinon : touchez les **3 petits points** en haut à droite de Chrome, puis cliquez sur **« Installer l'application »**)*.
3. Validez : le beau logo officiel **Ma Badgeuse** apparaît immédiatement sur votre écran d'accueil parmi vos autres applications.

### Sur iPhone (Safari) :
1. Ouvrez l'adresse de votre application dans **Safari**.
2. Appuyez sur le bouton **Partager** (le carré avec une flèche vers le haut en bas de l'écran).
3. Faites défiler vers le bas et touchez **« Sur l'écran d'accueil »**.
4. Appuyez sur **« Ajouter »** en haut à droite.
5. L'icône officielle **Ma Badgeuse** est prête sur votre écran d'accueil !

---

## ⏱️ 2. Pointer sa journée en 10 secondes (Horaires habituels par défaut)

Vos horaires habituels de travail sont configurés par défaut sur **10h45 - 14h45** (soit **4h00** par jour sans pause repas) :

1. Ouvrez l'application et choisissez la date du jour.
2. **Pré-remplissage automatique :** Les champs sont déjà remplis avec vos horaires habituels :
   - Heure d'arrivée : `10:45`
   - Heure de départ : `14:45`
   - Pause repas : `0 min`
   - Heures prévues : `4.0 h`
   - Résultat direct : **4.0 h faites, écart = 0h00**.
3. **Si vous avez fait des heures différentes ce jour-là :** Modifiez simplement l'heure d'arrivée ou de départ (ex. départ à `15h15` pour un nettoyage exceptionnel $\implies$ l'application calcule automatiquement `+ 0 h 30` de dépassement).
4. **Modifier vos horaires habituels :**
   - Cliquez sur **`⚙️ Modifier`** dans la barre des horaires habituels ou dans l'en-tête bleu.
   - Vous pouvez ajuster votre arrivée, votre départ, votre pause repas (jusqu'à 1h ou plus) et vos heures attendues.

---

## ⚖️ 3. Comprendre vos deux compteurs (La Vignette Phare)

En haut de l'écran d'accueil, la **Vignette Phare** présente vos deux compteurs :

```
┌─────────────────────────────────┬─────────────────────────────────┐
│          HEURES SUP             │           À RATTRAPER           │
│     Dues par l'employeur        │       Dues à l'employeur        │
│                                 │                                 │
│           + 2 h 00              │             0 h 00              │
└─────────────────────────────────┴─────────────────────────────────┘
```

### Comment fonctionne le rattrapage automatique (Compensation directe) ?
C'est le bon sens même pour votre planning :
- **Vos heures supplémentaires comblent immédiatement vos heures d'absence dues :** Si vous devez 4h d'absence (-4h) et effectuez 4h supplémentaires (+4h), vos heures supplémentaires remboursent immédiatement votre absence. Votre dette retombe à **0 h 00** ! Vous ne devez plus rien.
- **Si vous faites plus d'heures supplémentaires que d'absence :** Ex. vous aviez 4h à rattraper et faites 6h sup $\implies$ votre dette est entièrement effacée (0h) et il vous reste **+ 2 h 00** en heures sup.
- **Si vos heures sup ne suffisent pas :** Ex. vous aviez 4h à rattraper et faites 2h sup $\implies$ votre dette diminue et il ne vous reste que **- 2 h 00** à rattraper.
- **Régularisation manuelle si payé :** Si l'employeur vous paie directement des heures sup sur votre fiche de paie (sans repos compensateur), cliquez sur **« Régulariser / Récupérer »**.

---

## 🧹 4. Remise à Zéro Personnelle de ses Heures (RAZ 100% Sécurisée)

Si vous souhaitez repartir sur une base propre ou réinitialiser vos données :

1. Cliquez sur le bouton **`⚙️` (Réglages)** en haut de l'écran.
2. Restez sur l'onglet **« Mes horaires & Mon compte »**.
3. Faites défiler jusqu'en bas : vous trouverez l'encadré rouge intitulé :  
   **« Remise à zéro de MON espace personnel »**.
4. **Garantie d'étanchéité absolue :**
   - Cette action efface **uniquement vos propres pointages, congés et régularisations**.
   - Les heures et les comptes des autres membres de la famille restent **100% intacts et protégés**.
   - Une copie de sauvegarde d'urgence de vos données est automatiquement enregistrée sur le serveur avant l'effacement.
5. Pour confirmer, tapez le mot `RESET` dans la case et appuyez sur **« Effacer uniquement mes pointages personnels »**.

---

## 🔐 5. Mode Administrateur & Sauvegardes Serveur

Pour protéger le serveur contre les mauvaises manipulations, les options techniques sont verrouillées par un code PIN administrateur :

1. Cliquez sur **`⚙️ Réglages`** puis sur le bouton **`🔒 Mode Admin`**.
2. Entrez votre code PIN (par défaut : `1234`, modifiable à tout moment).
3. Une fois déverrouillé, l'onglet **« 🛠️ Maintenance & Serveur »** vous permet de :
   - Consulter la santé de la base SQLite.
   - Télécharger une copie de sauvegarde `.sqlite` sur votre PC ou téléphone.
   - Restaurer un point de sauvegarde Proxmox en 1 clic.
   - Gérer les comptes utilisateurs.
