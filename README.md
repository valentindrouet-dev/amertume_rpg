# Amertume — Inventaire & Lancer de dés

Outil web pour jouer en **solo** au JdR **Amertume**. Gère l'**inventaire**, les **armes équipables**
et un **lanceur de dés** respectant les règles d'Amertume. 100 % côté navigateur, sans serveur.

> Les arbres de talents et les feuilles de personnage sont gérés ailleurs (hors de cet outil).

## Fonctionnalités

### Combat (zones abstraites)
- **Préparation** : sélection des héros engagés + ajout d'adversaires depuis le bestiaire (avec quantité).
- **Tours de combat** : phase des Héros (activation manuelle) puis phase des Adversaires (IA automatique).
- **Activation** : 1 Action (attaque) + 1 Mouvement/Analyse + 1 Objet, suivis par carte.
- **Attaques** : résolues par le moteur de dés (DEF, dégâts, critique, échec…), cibles unique ou multiples,
  portée contact/distance avec **dégâts-choc**.
- **États** : Affaibli, Au sol (annule la DEF), Feu, Blindage, Onde, Ciblage — appliqués par les attaques
  ou à la main (clic). Au sol impossible sur un Boss / un socle plus grand ; Boss ignore Au sol.
- **IA des adversaires** : choix de cible par **Menace** (plus proche, PV bas/haut, DEF basse).
- **Fuite** selon le type (Standard fin T1, Solitaire/Alpha fin T2, Boss ≥T3 manuel), **Esquive 6+**, **coma**.
- **XP** : cumulée (adversaires au coma + Analyses) et distribuée en fin de combat.
- **Journal de combat** détaillé.

### Héros & Bestiaire
- **Roster de héros** : Vie, Endu, bonus PV, DEF, Dégâts, attaques (dés + effets), PV max calculés.
- **Bestiaire** éditable : PV, DEF, Dégâts, XP, Type, socle, Menace, Esquive, Rapide, attaques. 4 monstres d'exemple fournis.

### Inventaire & dés

- **Inventaire** : ajout/édition/suppression d'objets (armes, munitions, armures, objets, divers),
  quantités, consommables, notes, recherche et filtres par catégorie.
- **Armes équipables** : 1 main / 2 mains. Deux armes à 1 main **cumulent leurs dés** ;
  une arme à 2 mains occupe les deux emplacements.
- **Lanceur de dés Amertume** : un bouton qui lance les dés des armes équipées (+ dés
  supplémentaires pour talents/objets) et résout l'attaque selon les règles :
  - 7 couleurs de dés : ⬜ Simple, 🟧 Léger, 🟥 Lourd, 🟦 Mystique, 🟩 Soin, ⬛ Mortel, 🟨 Phase.
  - **Critique** (double 6 → relance bonus en chaîne), **Échec** (double 1 → action ratée).
  - Légers retirés du total sur double, Mystiques doublés sur double (DEF comparée à la valeur brute),
    dés Phase multipliés par le tour de combat (max ×3).
  - Comparaison à la **DEF** de la cible, ajout des **dégâts de l'attaquant**, calcul des **PV** infligés / soignés.
  - Historique des derniers lancers.
- **Sauvegarde** : automatique dans le navigateur (`localStorage`) + **export/import** d'un fichier `.json`.

## Lancer en local

Ouvre simplement `index.html` dans un navigateur (aucune dépendance, aucun build).

## Déployer sur GitHub Pages

1. Pousser ces fichiers à la racine du dépôt.
2. Dans **Settings → Pages**, choisir la branche à publier (racine `/`).
3. Le site sera servi sur `https://<utilisateur>.github.io/amertume_rpg/`.

Le fichier `.nojekyll` évite que GitHub Pages ignore certains fichiers.

## Structure

```
index.html        Structure et onglets
css/style.css     Thème sombre
js/dice.js        Moteur de dés (résolution des règles)
js/store.js       Persistance localStorage
js/inventory.js   Inventaire + équipement + modale d'édition
js/roller.js      Interface du lanceur de dés
js/main.js        Navigation, export/import
```

## Notes sur l'interprétation des règles

Le total de PV est calculé comme la **somme des valeurs des dés qui dépassent la DEF**
(les Lourds/Mortels/Soins ignorent la DEF), plus les dégâts de l'attaquant si au moins un
dé offensif a touché. Si ton barème exact diffère, le détail de chaque dé reste affiché
pour ajuster, et le moteur (`js/dice.js`) est facile à adapter.
