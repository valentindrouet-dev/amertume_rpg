# GUIDE COMPLET — Créer une aventure Amertüme Solo RPG au format importable

> **À qui s'adresse ce guide ?** À une IA (Claude, ChatGPT…) ou à un humain qui veut
> écrire une aventure complète pour l'application **Amertüme Solo RPG**, prête à
> être importée en un clic. Il décrit **exhaustivement** le format JSON attendu :
> aventures, chapitres, scènes/salles, tous les types de blocs, connecteurs de
> donjon, zones de combat, barrières, monstres, objets, talents et leurs effets.
>
> **Ce que tu dois produire : UN SEUL fichier JSON** au format
> `amertume-adventure-bundle` (décrit au §2). L'utilisateur l'importera via
> *Mode MJ → onglet Aventures → « ⇧ Import JSON »*.

---

## 1. Concepts du jeu (résumé indispensable)

- **Amertüme** est un JdR **solo** en français : le joueur incarne un groupe de
  1 à 4 **aventuriers** qui traversent une **aventure** faite de **chapitres**,
  eux-mêmes faits de **scènes** (appelées **salles** dans les donjons).
- Les scènes contiennent des **blocs** ordonnés : textes, tests de compétence,
  actions, énigmes à écrire, dialogues, combats.
- **Compétences** (8, fixes) : `Agilité`, `Force`, `Mysticisme`, `Perception`,
  `Robustesse`, `Ruse`, `Savoir`, `Technique`.
  Un test lance `1 + valeur de compétence` dés à 6 faces ; chaque `4+` est une
  réussite, chaque `6` relance un dé. La **difficulté** est le nombre de
  réussites requises.
- **Difficultés** (valeurs autorisées du champ `difficulty`) :
  `auto` (0, réussite automatique), `facile` (1), `moyen` (2), `difficile` (3),
  `tresdifficile` (4), `insurmontable` (5), `impossible` (6).
- **Barème d'XP OBLIGATOIRE pour un test réussi** (`xpReward` selon `difficulty`) :
  | Difficulté | `xpReward` |
  |---|---|
  | `auto` | 0 |
  | `facile` | 1 |
  | `moyen` | 2 |
  | `difficile` | 5 |
  | `tresdifficile` | 10 |
  | `insurmontable` | 20 |
  | `impossible` | 50 |
- **XP** : commun au groupe, fait monter de niveau tout le groupe.
- **États de combat** (valeurs du moteur, à utiliser telles quelles) :
  `affaibli`, `auSol`, `feu`, `gele`, `poison`, `brise`, `faille` (négatifs) ;
  `blindage`, `onde`, `ciblage`, `garde`, `prepare`, `invisible` (positifs).
  `feu`, `gele` et `poison` sont **cumulables** (Feu 2, Gelé 3…).
- **Dés d'attaque** (clés des pools `dice`) :
  | Clé | Nom | Particularité |
  |---|---|---|
  | `white` | Simple ⬜ | bloqué par la DEF |
  | `bone` | Léger 🟧 | retiré du total sur un double |
  | `red` | Lourd 🟥 | **ignore la DEF** |
  | `blue` | Mystique 🟦 | dé magique |
  | `green` | Soin 🟩 | soigne au lieu de blesser |
  | `black` | Mortel ⬛ | **ignore la DEF** |
  | `yellow` | Phase 🟨 | dé spécial |
  | `pink` | Faille 🟪 | dé spécial |
  Un pool de dés s'écrit : `{ "white": 2, "black": 1 }` (clés absentes = 0).
- **Expressions de dés** : partout où une *valeur* est demandée (XP, PV, or…),
  tu peux donner un nombre (`3`) **ou** une expression (`"1d6"`, `"2d6+1"`).

---

## 2. LE FICHIER À PRODUIRE : le bundle d'aventure

```json
{
  "format": "amertume-adventure-bundle",
  "version": 2,
  "adventure": { ... voir §3 ... },
  "monsters": [ ... voir §7 — TOUS les monstres référencés ... ],
  "advTalents": [ ... voir §9.4 — talents adverses référencés par ces monstres ... ],
  "items": [ ... voir §8 — TOUS les objets référencés par itemId ... ],
  "parchTalents": [ ... voir §9.5 — talents de parchemin référencés ... ]
}
```

**Règles d'or :**
1. **Tous les `id` sont des chaînes uniques** dans le fichier ET **préfixées par
   le slug de l'aventure** : pour une aventure `adv_oasis`, écris
   `"oasis_sc_dunes"`, `"oasis_mon_chameau"`, `"oasis_it_cimeterre"`,
   `"oasis_b1"`… Ce préfixe évite toute collision avec les contenus des autres
   aventures déjà présentes chez l'utilisateur — c'est OBLIGATOIRE.
2. **Toute référence doit pointer sur un objet présent** : chaque `monsterId`
   cité dans une zone de combat doit exister dans `monsters[]` ; chaque `itemId`
   d'une récompense doit exister dans `items[]` ; chaque id de `advTalentIds`
   d'un monstre doit exister dans `advTalents[]`.
3. Le JSON doit être **valide strict** (pas de commentaires, pas de virgule finale).
4. Les textes sont en **français**, avec `\n` pour les sauts de ligne.
   `**gras**` et `*italique*` sont acceptés dans les textes narratifs.

### 2.1 Ce qui se passe à l'import (pour comprendre les contraintes)

- Les monstres, objets et talents du bundle sont fusionnés dans les
  bibliothèques **globales** de l'utilisateur (bestiaire, armurerie…), et
  **automatiquement affiliés à l'aventure** (`adventureId`) : l'utilisateur peut
  les filtrer par aventure et ils sont proposés à la suppression quand
  l'aventure est supprimée.
- Fusion **par `id`** : un id inconnu est ajouté ; un id appartenant déjà à
  CETTE aventure est mis à jour (ré-import d'une version corrigée) ; un id déjà
  pris par le contenu d'une AUTRE aventure est **renommé automatiquement**
  (aucun écrasement), mais le renommage pollue les identifiants — d'où la règle
  du préfixe.
- **Ne réinvente pas ce qui existe déjà** dans le catalogue de base : les armes
  courantes (Dague, Épée…) existent chez l'utilisateur. Pour une récompense
  générique, préfère un `treasureRewards` (créé à la volée, sans référence) à un
  nouvel item. Ne crée un item que s'il est spécifique à ton aventure.

---

## 3. L'AVENTURE

```json
{
  "id": "adv_desert",
  "title": "Les Chameaux Maléfiques",
  "password": "",
  "duration": "1 h",
  "difficulty": "Moyenne",
  "summary": "Une caravane a disparu dans les dunes…",
  "chapters": [ ... ]
}
```

| Champ | Type | Rôle |
|---|---|---|
| `id` | string | unique |
| `title` | string | titre affiché à l'accueil |
| `password` | string | optionnel — mot de passe pour lancer l'aventure |
| `duration` | string | texte libre (« 1 h », « 2-3 h ») |
| `difficulty` | string | texte libre (« Facile », « Moyenne »…) |
| `summary` | string | résumé d'accueil |
| `chapters` | array | les chapitres, joués dans l'ordre |

---

## 4. LES CHAPITRES — trois modes

```json
{
  "id": "desert_ch1", "title": "Les Dunes Hurlantes",
  "mode": "linear",
  "scenes": [ ... ],
  "links": [],
  "entryId": null
}
```

`mode` ∈ :

### 4.1 `"linear"` — Narratif
Les scènes se jouent via `choices` / `nextSceneId` / `targetSceneId` des blocs
(voir §5.1 et §6.2). `links` et `entryId` sont ignorés.

⚠️ **RÈGLE DE PROGRESSION (chapitre narratif)** : l'ordre du tableau ne fait
PAS avancer le joueur tout seul. **Chaque scène (sauf le type `fin`) DOIT
offrir une sortie** : soit `nextSceneId`, soit au moins un `choices[]`, soit un
`targetSceneId` de bloc — sinon le joueur est BLOQUÉ définitivement.
- La **dernière scène d'un chapitre** doit pointer (`nextSceneId` ou un choix)
  vers une scène du **chapitre suivant** : l'application corrige d'elle-même
  l'arrivée vers la vraie entrée du chapitre (salle d'entrée d'un donjon
  structuré, première salle tirée d'un donjon aléatoire). N'oublie JAMAIS ce
  lien de fin de chapitre.
- Un `targetSceneId` débloqué par un test réussi ne suffit que si le test est
  toujours réussissable : ajoute `"retryMode": "always"` (ou une alternative)
  quand c'est l'unique sortie.

### 4.2 `"dungeon"` — Donjon structuré (carte de salles)
Le joueur explore librement une **carte** de salles reliées par des
**connecteurs**. Champs supplémentaires :

- Chaque scène porte une **position de carte** : `mapX`, `mapY` (entiers ≥ 0,
  grille ; (0,0) en haut à gauche). Deux salles ne partagent pas la même case.
- `entryId` : id de la salle de départ (obligatoire).
- `links` : les connecteurs (couloirs/portes) :

```json
{
  "id": "desert_l1", "from": "desert_sc_entree", "to": "desert_sc_puits",
  "label": "porte de fer rouillée",
  "eventSceneId": null,
  "eventRepeat": false,
  "revealTestId": null,
  "randomEnabled": false,
  "locked": false
}
```

| Champ | Rôle |
|---|---|
| `from`, `to` | ids des deux salles reliées (navigation dans les deux sens) |
| `label` | description du passage, affichée sur le bouton de sortie |
| `eventSceneId` | id d'une **scène d'événement** jouée quand on emprunte le passage (combat d'embuscade, texte…). La scène d'événement est une scène normale du chapitre avec `"transition": true` (hors carte) |
| `eventRepeat` | `true` = l'événement rejoue à CHAQUE passage ; `false` = une seule fois |
| `revealTestId` | id d'un **bloc de test** : le passage est SECRET, invisible tant que ce test n'est pas réussi |
| `randomEnabled` | `true` = ce passage peut déclencher une **rencontre aléatoire** du chapitre (voir 4.4) |

### 4.3 `"random"` — Donjon aléatoire
Les salles pré-écrites sont enchaînées dans un **ordre tiré au sort**. Chaque
scène peut porter `roomRole` : `"normal"` (dans la rotation aléatoire),
`"entry"` (toujours première), `"exit"` (toujours dernière). Une scène avec
`"transition": true` est **hors rotation** (utilisable comme événement).

### 4.4 Rencontres aléatoires (chapitre)
Tableau commun au chapitre, tiré quand le joueur emprunte un connecteur coché
`randomEnabled` :

```json
"randomEncounters": [
  { "sceneId": "desert_sc_embuscade", "chance": 25 }
]
```
`chance` = pourcentage. Les scènes visées sont des scènes du chapitre (souvent
`"transition": true`).

---

## 5. LES SCÈNES (= salles)

```json
{
  "id": "desert_sc_puits",
  "title": "Le Puits Asséché",
  "type": "exploration",
  "mapX": 1, "mapY": 0,
  "fait": "A découvert le puits maudit",
  "blocks": [ ... §6 ... ],
  "combatZones": [ ... §5.2 ... ],
  "barriers": { ... §5.2 ... },
  "choices": [],
  "nextSceneId": null,
  "xpReward": 0,
  "goldReward": 0,
  "itemRewards": [],
  "treasureRewards": []
}
```

### 5.1 Champs
| Champ | Rôle |
|---|---|
| `type` | couleur/icône de la scène : `description`, `exploration`, `interaction`, `combat`, `reward`, `danger`, `repos`, `commerce`, `boss`, `temps`, `vide`, `fin` |
| `fait` | « Haut Fait » ajouté au journal du joueur en arrivant (optionnel) |
| `mapX`, `mapY` | position sur la carte (donjons structurés uniquement) |
| `roomRole` | donjon aléatoire : `normal` / `entry` / `exit` |
| `transition` | `true` = scène d'événement, hors carte/rotation |
| `blocks` | le CONTENU de la scène, dans l'ordre (voir §6) |
| `combatZones` | le combat de la salle, déclenché à l'arrivée s'il contient des monstres |
| `barriers` | barrières entre zones de combat |
| `choices` | navigation narrative : `[{ "id", "label", "targetSceneId", "type" }]` — `type` ∈ `neutre`, `violence`, `calme`, `ruse`, `enquete`, `discussion` (couleur du bouton) |
| `nextSceneId` | enchaînement automatique sans choix (mode narratif) |
| `xpReward`, `goldReward` | récompenses à la fin de la scène (nombre ou `"1d6"`) |
| `itemRewards` | `[{ "itemId": "...", "qty": 1 }]` — objets de l'Armurerie donnés |
| `treasureRewards` | `[{ "name": "Gemme du désert", "qty": 1, "kind": "treasure", "value": 25 }]` — trésors créés à la volée. `kind` ∈ `"treasure"` (revendable, `value` = prix en or) ou `"rare"` (Objet Rare d'aventure, ne se vend pas, sert de clé — voir §6.7) |

### 5.2 Zones de combat & barrières
Un combat se joue sur **1 à 4 zones** disposées en grille. Format :

```json
"combatZones": [
  { "name": "Dune ouest", "monsterRefs": [ { "monsterId": "oasis_mon_chameau", "count": 2 } ], "heroStart": true },
  { "name": "Dune est",   "monsterRefs": [ { "monsterId": "oasis_mon_chef", "count": 1 } ] }
],
"barriers": {
  "0-1": { "type": "difficile", "diff": "moyen", "name": "éboulis" }
}
```

- `monsterRefs` : monstres présents (référence + nombre). Une zone sans monstre
  est possible (zone tactique vide).
- `heroStart: true` : zone de départ des aventuriers (défaut : zone 1).
- `barriers` : clés `"i-j"` (indices de zones, 0-based, i<j). Types :
  | `type` | Effet |
  |---|---|
  | `infranchissable` | aucun passage |
  | `mur` | aucun passage NI tir à distance au travers |
  | `difficile` | test d'**Agilité** (`diff` : `facile`=1, `moyen`=2, `difficile`=3) pour passer, sinon le mouvement est perdu |
  | `instable` | on passe toujours, mais Agilité 1 raté = on arrive **Au sol** |
  `name` : nom affiché (« sol glissant », « herse brisée »…).

---

## 6. LES BLOCS — le cœur du contenu

`scene.blocks` est un tableau ordonné. Chaque bloc a un `id` unique et un `type`.
**Varie et MÉLANGE librement les types** au sein d'une même scène selon ses
besoins : un texte d'ambiance, puis un dialogue, puis un test qui révèle un
combat, puis un texte de conclusion chaîné… Toute combinaison est valide — une
scène monotone (un seul bloc narratif) est une scène ratée.

### 6.1 Blocs de TEXTE
```json
{ "id": "oasis_b1", "type": "narrative", "content": "Le vent hurle entre les dunes…" }
```
`type` ∈ :
- `narrative` — italique (narration)
- `technical` — normal (règles, infos)
- `alert` — gras (danger)
- `tip` — encadré (conseil)
- `combat` — visible UNIQUEMENT tant que le combat de la scène n'est pas gagné

Champ optionnel commun à TOUS les blocs :
```json
"reqSkill": "Perception", "reqVal": 2
```
→ le bloc n'est affiché que si un aventurier a `Perception ≥ 2`.

### 6.2 Bloc TEST (`type: "test"`)
Un test de compétence avec bouton.

```json
{
  "id": "desert_b_test", "type": "test",
  "label": "Fouiller le puits",
  "skill": "Perception", "difficulty": "moyen",
  "who": "best",
  "altSkill": "Force", "altDifficulty": "difficile",
  "successText": "Vous trouvez une corde !",
  "failText": "Rien, sinon du sable.",
  "xpReward": 3,
  "itemRewards": [ { "itemId": "desert_it_corde", "qty": 1 } ],
  "goldReward": 0,
  "treasureRewards": [],
  "deedReward": "A exploré le puits maudit",
  "winEffect": { "kind": "none" },
  "failEffect": { "kind": "pv", "val": "1d6" },
  "targetSceneId": null,
  "chainSuccessIds": [], "chainFailIds": [],
  "mandatory": false, "mandatoryNarrative": false,
  "retryMode": "none",
  "rareKeyName": "", "rareConsume": false,
  "validatesParent": false
}
```

| Champ | Rôle |
|---|---|
| `who` | qui teste : `best` (meilleur aventurier), `random` (aléatoire), `group` (TOUS testent), `concerned` (seulement ceux ayant réussi/échoué le test parent d'une chaîne) |
| `groupMode` | seuil d'un test collectif : `all` (unanimité), `majority`, `one` |
| `altSkill`/`altDifficulty` | 2ᵉ bouton alternatif (le joueur choisit la compétence) ; sur un test de GROUPE à 2 compétences, chaque aventurier teste sa colonne |
| `mandatory` | `true` = 🔒 test obligatoire : bloque les sorties vers les salles non visitées tant qu'il n'est pas tenté |
| `mandatoryNarrative` | avec `mandatory` : bloque AUSSI le demi-tour (interrompt l'histoire) |
| `retryMode` | en cas d'échec : `none`, `always` (à volonté), `other` (1× par aventurier), `levelup` (après une montée de niveau) |
| `targetSceneId` | id de scène dont l'accès est débloqué par la réussite |
| `chainSuccessIds` / `chainFailIds` | ids de blocs de la MÊME scène **révélés** par l'issue (chaînage — les blocs chaînés sont invisibles au départ) |
| `validatesParent` | sur un bloc chaîné : le réussir valide rétroactivement le test parent |
| `rareKeyName` / `rareConsume` | nom d'un Objet Rare (`treasureRewards` de kind `rare`) qui résout automatiquement le test si le groupe le possède ; `rareConsume: true` le consomme |

**`failEffect`** (conséquence d'échec) — `kind` ∈ :
| `kind` | Champs | Effet |
|---|---|---|
| `none` | — | rien |
| `pv` | `val` (nombre ou dés) | perte de PV |
| `vie` | `val` | perte de VIE |
| `xp` | `val` | perte d'XP |
| `state` | `state` ∈ `affaibli`, `auSol`, `feu`, `gele`, `poison`, `brise`, `faille` | état subi au prochain combat |
| `item` | `slot` ∈ `mainG`, `mainD`, `randhand`, `armor`, `object` | perte d'un objet équipé |
| `death` | — | mort de l'aventurier |
| `deed` | `text` | Haut Fait négatif inscrit au journal |
| `combat` | `combat`: `{ "combatZones": [...], "barriers": {...} }` | **déclenche un combat** (même format que §5.2) — la salle est verrouillée tant qu'il n'est pas gagné |

**`winEffect`** (effet de réussite) — `kind` ∈ `none`, `prepare` (Préparé au
prochain combat), `pv` (soin, `val`), `vie` (gain de VIE, `val`),
`state` (`state` ∈ `blindage`, `onde`), `combat` (comme ci-dessus).

### 6.3 Bloc ACTION (`type: "test"` + `"actionMode": true`)
Même structure que le TEST mais **sans jet de dés** : le joueur choisit
l'« Action 1 » (`label`, applique l'issue *réussite* : récompenses, `winEffect`,
`chainSuccessIds`…) ou l'« Action 2 » optionnelle (`altLabel`, applique la
*conséquence d'échec* : `failEffect`, `failText`, `chainFailIds`).

```json
{ "id": "desert_b_act", "type": "test", "actionMode": true,
  "label": "Boire l'eau du puits", "altLabel": "Verser l'eau dans le sable",
  "successText": "L'eau est pure.", "failText": "Le sable crisse, furieux.",
  "failEffect": { "kind": "state", "state": "affaibli" } }
```

### 6.4 Bloc ÉCRITURE (`type: "test"` + `"writeMode": true`)
Énigme : la réussite dépend d'un mot écrit par le joueur (tolérant à la casse,
aux accents et au pluriel).

```json
{ "id": "desert_b_enigme", "type": "test", "writeMode": true,
  "label": "L'énigme du sphinx",
  "writeDesc": "Je brille la nuit et guide les caravanes. Que suis-je ?",
  "writeInstruction": "Écrivez exactement 1 mot",
  "writeAnswers": "étoile, étoiles",
  "successText": "Le sphinx s'écarte.", "failText": "Un souffle brûlant vous frappe.",
  "failEffect": { "kind": "pv", "val": 2 } }
```
`writeAnswers` : réponses acceptées, séparées par des virgules.

### 6.5 Bloc DIALOGUE (`type: "test"` + `"actionMode": true` + `"dialogueMode": true`)
Bulles de discussion dévoilées une à une, puis un choix à 1 ou 2 options avec
**exactement les mêmes conséquences qu'un bloc Action**.

```json
{ "id": "desert_b_dlg", "type": "test", "actionMode": true, "dialogueMode": true,
  "dialogueTitle": "Le Chamelier Fantôme",
  "lines": [
    { "id": "desert_l1", "speaker": "Chamelier", "avatar": "https://exemple.com/chamelier.png",
      "text": "Mes bêtes… rendez-moi mes bêtes…" },
    { "id": "desert_l2", "speaker": "Chamelier", "avatar": "",
      "text": "Ou rejoignez-les dans le sable." }
  ],
  "nextLabel": "Écouter la suite…",
  "label": "« Nous ramènerons vos chameaux »",
  "altLabel": "« Écarte-toi, spectre »",
  "successText": "Le fantôme s'apaise.", "failText": "Il hurle et disparaît.",
  "chainFailIds": ["desert_b_combat_fantome"] }
```
- `lines[]` : les répliques — `speaker` (nom), `avatar` (URL d'image affichée en
  pastille ronde, `""` = icône par défaut), `text`.
- `dialogueTitle` : titre de la fenêtre de discussion.
- `nextLabel` : libellé du bouton « suite » (défaut « Suite… »).

### 6.6 Bloc COMBAT jouable (`type: "fight"`)
Un combat posé dans le fil de la salle, révélable par un test/action/dialogue et
qui révèle à son tour d'autres blocs selon l'issue.

```json
{ "id": "desert_b_fight", "type": "fight",
  "label": "Les chameaux chargent !",
  "content": "Le sable tremble sous leurs sabots.",
  "combat": {
    "combatZones": [ { "name": "Dunes", "monsterRefs": [ { "monsterId": "oasis_mon_chameau", "count": 3 } ] } ],
    "barriers": {}
  },
  "winText": "Les bêtes s'effondrent en poussière.",
  "failText": "Vous fuyez, ensablés.",
  "chainSuccessIds": ["desert_b_tresor"], "chainFailIds": [] }
```
Tant qu'un bloc de combat révélé n'est pas résolu, le reste de la salle est gelé.

### 6.6bis RÉCOMPENSES — la règle la plus importante des blocs

⚠️ **Le TEXTE ne donne JAMAIS rien.** Si un texte narratif ou une réplique de
dialogue annonce que le groupe gagne de l'or, une potion, une arme ou de l'XP,
le bloc DOIT porter les champs structurés correspondants — sinon le joueur ne
reçoit RIEN et l'aventure est cassée :

| Ce que le texte annonce | Champ à renseigner sur le bloc |
|---|---|
| de l'XP | `"xpReward": 3` (ou `"1d6"`) |
| de l'or | `"goldReward": 20` (ou `"2d6"`) |
| un objet de l'Armurerie (potion, arme…) | `"itemRewards": [{ "itemId": "oasis_it_potion", "qty": 1 }]` — l'objet doit exister dans `items[]` |
| un trésor revendable | `"treasureRewards": [{ "name": "Gemme", "qty": 1, "kind": "treasure", "value": 25 }]` |
| un Objet Rare / une clé | `"treasureRewards": [{ "name": "Clé du portail", "qty": 1, "kind": "rare" }]` |
| un Haut Fait | `"deedReward": "A sauvé le chamelier"` |
| un soin / un état positif | `"winEffect": { "kind": "pv", "val": "1d6" }` |

Ces champs fonctionnent sur TOUS les blocs interactifs : **test, action,
écriture ET dialogue** (un dialogue est un bloc action : les récompenses
s'appliquent au Choix 1 / issue « réussite »). Ils existent aussi au niveau de
la SCÈNE (donnés en la quittant). Relis chaque texte écrit : toute promesse de
gain doit avoir son champ structuré.

### 6.7 Chaînage et révélation — récapitulatif
- Un bloc listé dans le `chainSuccessIds`/`chainFailIds` d'un autre bloc est
  **invisible** tant que ce parent n'a pas produit l'issue correspondante.
- Tous les types de blocs sont chaînables (textes compris : parfait pour révéler
  un paragraphe de conséquence).
- Les **Objets Rares** (`treasureRewards` kind `rare`) servent de **clés** : un
  bloc portant `rareKeyName` est résolu automatiquement si le groupe possède
  l'objet du même nom.

---

## 7. LES MONSTRES (`monsters[]`)

```json
{
  "id": "oasis_mon_chameau",
  "name": "Chameau maléfique",
  "type": "standard",
  "socle": "large",
  "family": "Morts du désert",
  "pv": 10, "def": 2, "damage": 3, "xp": 6,
  "menace": "closest",
  "esquive": false, "rapide": true,
  "attacks": [
    { "name": "Ruade", "dice": { "white": 2, "bone": 1 }, "range": "contact",
      "targets": "one", "useOwnDamage": true,
      "effects": { "affaibli": false, "auSol": true, "feu": false, "gele": false },
      "uses": 0, "freeAction": false }
  ],
  "advTalentIds": ["desert_at_crachat"],
  "behaviors": [],
  "loot": [], "equipment": [],
  "notes": "Crache du sable brûlant."
}
```

| Champ | Valeurs |
|---|---|
| `type` | `standard` (sbire), `alpha`, `solitaire`, `boss` — les boss sont immunisés à Au sol ; alpha/solitaire/boss ont plus d'Agilité/Force/Perception innées |
| `socle` | `small`, `medium`, `large`, `huge` — taille (Au sol ne s'applique pas depuis un attaquant plus petit) |
| `menace` | cible prioritaire de l'IA : `closest`, `pvLow`, `pvHigh`, `defLow`, `defHigh`, `dmgHigh`, `ranged`, `isolated` |
| `esquive` | `true` = esquive sur 6+ |
| `rapide` | `true` = agit au pré-tour, avant les aventuriers |
| `attacks[].range` | `contact` ou `distance` |
| `attacks[].targets` | `one` ou `all` (toutes les cibles à portée) |
| `attacks[].useOwnDamage` | `true` = ajoute le bonus `damage` du monstre |
| `attacks[].effects` | états infligés : booléens `affaibli`, `auSol`, `feu`, `gele` + `poison` (NOMBRE de crans) |
| `attacks[].uses` | utilisations par combat (0 = illimité) |
| `attacks[].freeAction` | `true` = ne consomme pas l'action |
| `advTalentIds` | ids de talents adverses (voir §9.4) |
| `behaviors` | comportements d'IA, dans l'ordre de priorité : `roam` (change de zone chaque tour), `still` (ne bouge jamais), `fleeHeroes`, `toCrowd`, `toLonely`, `useAtk`, `useAct1`, `useAct2`, `useAct3` |

**Équilibrage indicatif** (groupe de 2-3 aventuriers niveau 1) : sbire 6-10 PV /
DEF 1-2 / 2-3 dégâts / 5-8 XP ; alpha ~15-20 PV ; solitaire ~20-25 PV ;
boss 25-40 PV / DEF 2-3 / XP 15-30. 2 à 4 sbires par combat courant.

---

## 8. LES OBJETS (`items[]`)

```json
{ "id": "desert_it_cimeterre", "name": "Cimeterre des sables", "category": "weapon",
  "qty": 1, "hands": 1, "ranged": false, "price": 25,
  "dice": { "white": 2 }, "traits": [], "effects": "", "notes": "" }
```

| `category` | Champs spécifiques |
|---|---|
| `weapon` | `hands` (1/2), `ranged` (bool), `dice` (pool), `traits` (ex. `["jetable"]`, `["vicieuse"]`), `usesAmmo` |
| `armor` | `def` (nombre), `slot` : `body` (armure) ou `shield` (bouclier) |
| `object` | consommable équipable : `effects` (clé d'effet du catalogue §9.2 OU texte libre), `parchEffect` (pour les PARCHEMINS : clé d'effet OU `"par:<id d'un parchTalent>"`), `outOfCombat` (utilisable hors combat), `anyHero` (applicable à n'importe quel aventurier), `value` (valeur de revente) |
| `ammo` | munitions |
| `misc` | divers |

> **Trésors & Objets Rares** ne sont PAS des items : ils se donnent via
> `treasureRewards` (voir §5.1) et n'existent que dans l'inventaire du groupe.

---

## 9. TALENTS & CLASSES

### 9.1 Structure d'un talent
```json
{
  "id": "mystique_tal_orbes_feu",
  "name": "Orbes de Feu",
  "level": 1,
  "usage": "combat",
  "kind": "upgrade",
  "effects": [ { "effect": "orbe_element", "choice": "feu" } ],
  "effect": "orbe_element",
  "prereq": null,
  "branch": "Orbes",
  "startMastery": false,
  "description": "Vos orbes s'embrasent.",
  "hidden": false
}
```

| Champ | Rôle |
|---|---|
| `level` | niveau de groupe requis pour le choisir (1 = création) |
| `usage` | `combat`, `out` (hors combat), `both` |
| `kind` | vignette : `action`, `reaction`, `passive`, `critique`, `garde`, `upgrade` (amélioration), `mastery` (maîtrise) — si omis, déduit du 1ᵉʳ effet |
| `effects[]` | 1..n effets du catalogue (§9.2). Chaque entrée : `effect` (clé), et selon l'effet : `val` (nombre ou `"1d6"`), `dice` (pool), `range`, `choice`, `side`, `scope` |
| `effect` | recopie de `effects[0].effect` (rétro-compatibilité, toujours renseigner) |
| `prereq` | id d'un autre talent requis (arborescence : la version supérieure masque l'inférieure en combat) |
| `branch` | **groupe de choix exclusif** : les talents portant le même `branch` sont concurrents — en prendre un verrouille les autres (ex. Orbes de Feu / de Gel / de Poison, tous `"branch": "Orbes"`). Les talents dérivés d'une option s'y rattachent par `prereq` |
| `startMastery` | `true` sur UNE maîtrise de niveau 1 d'une classe = Maîtrise de départ accordée d'office à la création |
| `hidden` | `true` = masqué aux joueurs |

### 9.2 CATALOGUE COMPLET DES EFFETS
Les clés `effect` ci-dessous sont les SEULES reconnues par le moteur.
Colonnes : variables = champs à renseigner dans l'entrée d'`effects[]`.

#### ⚔️ Attaques spéciales

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `double_attaque` | Double Attaque | action | `val` (nombre), défaut 2 · `scope` ("count"|"zone"|"all") + `val` = nb de cibles | Action : frappez X adversaires d'une même zone avec les Dégâts de votre arme. |
| `attaque_zone` | Attaque de Zone | action | `val` (nombre), défaut 2 · `dice` (pool de dés) · `range` ("contact"|"distance") · `choice` ∈ ["", "feu", "gele", "auSol", "affaibli", "brise", "faille", "poison"] · `side` ("monsters"|"heroes"|"all") · `scope` ("count"|"zone"|"all") + `val` = nb de cibles | Action : infligez les dés indiqués dans une zone — à X cibles, à toute la zone ou à tout le combat, aux Aventuriers, aux Adversaires ou à tous les Combattants, avec un état au choix. |
| `mort_explosive` | Mort Explosive | passive | `val` (nombre), défaut 2 · `dice` (pool de dés) · `range` ("contact"|"distance") · `choice` ∈ ["", "feu", "gele", "auSol", "affaibli", "brise", "faille", "poison"] · `side` ("monsters"|"heroes"|"all") · `scope` ("count"|"zone"|"all") + `val` = nb de cibles | En mourant, vous infligez les dés indiqués — à X cibles, à toute la zone ou à tout le combat, aux Aventuriers, aux Adversaires ou à tous les Combattants, avec un état au choix. |
| `assaut_mobile` | Assaut Mobile | action | — | Action : 1 mouvement gratuit + 1 attaque. |
| `frappe_puissante` | Frappe Puissante | action | `val` (nombre OU dés "1d6+1"), défaut 2 | Action : 1 attaque de contact à +X Dégâts. |
| `tir_charge` | Tir Chargé | action | `val` (nombre OU dés "1d6+1"), défaut 2 | Action : 1 attaque à distance à +X Dégâts. |
| `frappe_tournoyante` | Frappe Tournoyante | action | — | Action : frappez TOUS les adversaires de votre zone. |
| `attaque_furieuse` | Attaque Furieuse | action | — | Action : 1 attaque ; si la cible meurt, attaque gratuite sur un autre adversaire de la zone. |
| `attaque_blindee` | Attaque Blindée | action | — | Action : 1 attaque, puis vous gagnez Blindage. |
| `deluge` | Déluge | action | — | Action : 1 attaque, relançable sur la même cible tant qu'aucun dé ne produit de 1. |
| `provocation` | Provocation | action | — | Action : attirez un adversaire dans votre zone et attaquez-le. |
| `bousculade` | Bousculade | action | — | Action : 1 attaque de contact, puis la cible est poussée dans une autre zone (attaques d'opportunité de votre zone). |
| `eclipse` | Éclipse | action | — | Action : téléportez-vous dans une autre zone (franchit tout, même les MURS) et effectuez 1 attaque. |

#### 💥 Bonus de dégâts

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `frappe_lourde` | Frappe Lourde | passive | `val` (nombre OU dés "1d6+1"), défaut 1 | +X Dégâts à toutes vos attaques. |
| `maitre_contact` | Maître au Contact | passive | `val` (nombre OU dés "1d6+1"), défaut 2 | +X Dégâts à vos attaques de contact. |
| `maitre_distance` | Maître à Distance | passive | `val` (nombre OU dés "1d6+1"), défaut 2 | +X Dégâts à vos attaques à distance. |
| `tueur_au_sol` | Tueur au Sol | passive | `val` (nombre OU dés "1d6+1"), défaut 2 | +X Dégâts contre une cible AU SOL. |
| `tueur_affaibli` | Achèvement | passive | `val` (nombre OU dés "1d6+1"), défaut 2 | +X Dégâts contre une cible AFFAIBLI. |
| `tueur_etat` | Prédateur d'État | passive | `val` (nombre OU dés "1d6+1"), défaut 2 · `choice` ∈ ["feu", "gele", "brise", "faille", "poison", "auSol", "affaibli"] | +X Dégâts contre une cible affectée par l'état choisi. |
| `meute` | Meute | passive | `val` (nombre OU dés "1d6+1"), défaut 1 | +X Dégâts par allié présent dans la zone de la cible. |
| `assassinat` | Assassinat | passive | `choice` ∈ ["Bonus vs Seul", "Bonus vs Solitaire", "Bonus vs Alpha", "Bonus vs Boss", "Attaque vs Seul", "Attaque vs Solitaire", "Attaque vs Alpha", "Attaque vs Boss"] | Double votre bonus de Dégâts (« Bonus ») ou tous les Dégâts de l'attaque (« Attaque ») contre la cible choisie. |
| `bourreau_rapides` | Bourreau des Rapides | upgrade | — | Dégâts doublés contre les adversaires rapides. |
| `coup_bouclier` | Coup de Bouclier | passive | — | Bouclier équipé : +1 dé rouge (Lourd) à toutes vos attaques. |
| `force_blindee` | Force Blindée | passive | — | Tant que vous avez Blindage : +1 dé rouge (Lourd) à toutes vos attaques. |
| `survivaliste` | Survivaliste | mastery | — | Ajoutez votre VIE à votre bonus de Dégâts. |
| `perce_blindage` | Perce-Blindage | upgrade | — | Vos attaques ignorent Blindage (les Dégâts passent, sans le retirer). |

#### 🔥 États

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `coup_renversant` | Coup Renversant | action | — | Action : 1 attaque de contact qui met la cible AU SOL. |
| `attaque_affaiblissante` | Attaque Affaiblissante | action | — | Action : 1 attaque qui inflige AFFAIBLI. |
| `attaque_enflammee` | Attaque Enflammée | action | — | Action : 1 attaque de contact qui inflige FEU. |
| `attaque_etat` | Attaque Altérante | action | `choice` ∈ ["feu", "gele", "auSol", "affaibli", "brise", "faille", "poison"] | Action : 1 attaque de contact qui inflige l'état choisi. |
| `arme_enflammee` | Arme Enflammée | upgrade | — | Vos attaques de contact infligent FEU. |
| `arme_affaiblissante` | Arme Vampirique | upgrade | — | Toutes vos attaques infligent AFFAIBLI. |
| `arme_etat` | Arme Altérante | upgrade | `choice` ∈ ["feu", "gele", "auSol", "affaibli", "brise", "faille", "poison"] | Toutes vos attaques infligent l'état choisi. |
| `charge_etat` | Assaut Handicapant | upgrade | `choice` ∈ ["feu", "gele", "auSol", "affaibli"] | Vous infligez l'état choisi en arrivant au contact d'un adversaire. |
| `ignore_def_etat` | Faille Tactique | upgrade | `choice` ∈ ["feu", "gele", "affaibli", "auSol", "brise", "faille", "poison"] | Vos attaques ignorent la DEF des cibles affectées par l'état choisi. |
| `bonus_bleu_feu` | Résonance Élémentaire | upgrade | `choice` ∈ ["feu", "gele", "poison", "affaibli", "brise", "faille", "auSol"] | +1 dé bleu (Mystique) à vos attaques contre les cibles affectées par l'état choisi (FEU par défaut). Anciennement « Combustion ». |
| `feu_double` | Aggravation | passive | `choice` ∈ ["feu", "poison"] | Les Dégâts de l'état choisi (FEU en fin de tour, POISON avant d'agir) subis par les adversaires sont doublés. Anciennement « Embrasement ». |
| `epuisement` | Épuisement | passive | — | Les adversaires de votre zone subissent DEF −1. |
| `brasier` | Déchaînement | action | `choice` ∈ ["feu", "gele", "poison", "affaibli", "brise", "faille", "auSol"] | Action : 1 attaque qui touche TOUS les adversaires affectés par l'état choisi (FEU par défaut). Anciennement « Brasier ». |
| `surcouche_etat` | Surcouche Élémentaire | upgrade | `val` (nombre), défaut 2 · `choice` ∈ ["feu", "gele", "poison"] | Toutes vos attaques et talents qui infligent l'état choisi (cumulable) posent X crans au lieu de 1 (ex : FEU 2 au lieu de FEU 1). |
| `pas_echec_ausol` | Coup de Grâce | passive | — | Pas d'Échec (double 1) contre les cibles AU SOL — les 1 comptent comme des Dégâts normaux. |

#### 🎯 Critiques

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `accentuation` | Accentuation | passive | — | Vos Critiques infligent le double de votre bonus de Dégâts. |
| `mvt_critique` | Mouvement Critique | passive | — | Après un Critique : 1 mouvement gratuit. |
| `allie_critique` | Allié Critique | passive | — | Après un Critique : un allié de votre zone effectue une attaque gratuite. |
| `critique_explosif` | Critique Explosif | passive | — | Après un Critique : votre bonus de Dégâts frappe tous les adversaires de votre zone. |
| `cri_de_rage` | Cri de Rage | passive | — | Après un Critique : forcez un adversaire à se déplacer dans votre zone. |
| `bain_de_sang` | Bain de Sang | passive | — | Chaque adversaire tué par un de vos Critiques vous soigne de votre ENDU en PV. |
| `implosion` | Implosion | reaction | — | Réaction — après un Critique : 1 Action supplémentaire (1×/tour). |
| `critique_destructeur` | Destructeur | mastery | — | Critique sur tout double (sauf les 1), qui explose tant que la même face se reproduit. Chaque dé doit passer la DEF (sauf rouge/noir). |

#### ⚡ Ripostes

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `contre_attaque` | Contre-Attaque | reaction | — | Réaction — après avoir subi des Dégâts : 1 attaque gratuite contre l'assaillant. |
| `riposte2` | Riposte 2 | reaction | — | Votre Contre-Attaque est utilisable 2 fois par tour adverse. |
| `riposte_distance` | Riposte à Distance | upgrade | — | Votre Contre-Attaque fonctionne aussi contre les attaques à distance. |
| `execution` | Exécution | reaction | `val` (nombre OU dés "1d6+1"), défaut 0 | Réaction — avant qu'un adversaire de votre zone ne fuie : il subit votre bonus de Dégâts. |

#### 🛡️ Défense & protection

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `cuirasse` | Cuirasse | passive | `val` (nombre OU dés "1d6+1"), défaut 1 | Réduit de X les Dégâts que vous subissez (minimum 0). |
| `esquive_innee` | Esquive Innée | upgrade | — | Vous gagnez Esquive : un 6+ annule tous les Dégâts d'une attaque subie. |
| `garde_imprenable` | Garde Imprenable | upgrade | — | La 1ʳᵉ source de Dégâts de chaque tour est annulée. |
| `bouclier_mystique` | Bouclier Mystique | upgrade | — | Vous ignorez les Dégâts des dés bleus (Mystiques). |
| `solidite` | Solidité | upgrade | — | Votre DEF bloque normalement les dés rouges (Lourds). |
| `blindage_initial` | Blindage Initial | upgrade | — | Vous débutez chaque combat avec Blindage. |
| `crit_en_echec` | Mur Imbrisable | passive | — | Les Critiques adverses contre vous deviennent des Échecs. |
| `immun_etat` | Immunité | upgrade | `choice` ∈ ["feu", "gele", "affaibli", "auSol", "brise", "faille", "poison"] | Vous ne subissez jamais l'état choisi. |
| `camouflage` | Camouflage | passive | — | Les attaques à distance ne peuvent pas vous cibler depuis une autre zone. |
| `invisibilite` | Invisibilité | passive | — | Vous êtes INVISIBLE : impossible de vous cibler directement et vous n'apparaissez pas sur le terrain. On ne peut vous atteindre qu'en visant votre zone, avec un test de Perception 2. |
| `dephasage` | Déphasage | action | — | Action : aucun Dégât ni état subi durant le prochain tour adverse. |
| `dernier_souffle` | Dernier Souffle | passive | — | 1×/combat : vous ignorez les Dégâts qui vous feraient tomber au coma. |
| `epines` | Épines | passive | `val` (nombre OU dés "1d6+1"), défaut 0 | Tout adversaire qui arrive dans votre zone subit X Dégâts (fixe ou dés ; 0 = votre bonus de Dégâts). |

#### ❤️ Soins & survie

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `soin_fixe` | Premiers Soins | action | `val` (nombre OU dés "1d6+1"), défaut 3 | Action : vous récupérez X PV. |
| `soin_endu` | Second Souffle | action | `val` (nombre OU dés "1d6+1"), défaut 1 | Action : vous récupérez ENDU + X PV. |
| `soin_des` | Convalescence | action | `val` (nombre OU dés "1d6+1"), défaut 2 | Action : vous récupérez X dés de soin (🟩). |
| `regeneration` | Régénération | passive | `val` (nombre OU dés "1d6+1"), défaut 2 | À la fin de chaque tour, vous récupérez X PV (valeur fixe ou dés, ex. 1d6). |
| `guerison` | Guérison | action | `val` (nombre), défaut 1 | Action : vous récupérez X VIE perdue (jamais au-delà de votre VIE de départ). |
| `reanimation` | Réanimation | reaction | `val` (nombre OU dés "1d6+1"), défaut 5 | Réaction — un adversaire meurt dans la zone d'un allié au coma : relevez cet allié à X PV. |
| `renforcement` | Renforcement | upgrade | — | Votre maximum de PV augmente de votre bonus de Dégâts. |
| `endurcissement` | Endurcissement | upgrade | — | Votre ENDU augmente de +1 par Niveau. |
| `regain` | Regain | passive | — | Quand une attaque adverse ne vous inflige aucun Dégât : vous récupérez votre ENDU en PV. |

#### 🏃 Mouvement & position

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `action_mouvement` | Course | action | — | Action : 1 mouvement. |
| `rebond` | Rebond | action | — | 2 mouvements gratuits ce tour, puis vous pouvez encore attaquer (l'Action n'est pas consommée). |
| `pas_leger` | Pas Léger | mastery | — | 1 mouvement gratuit avant le début de chaque tour. |
| `franchissement_libre` | Pieds Sûrs | upgrade | — | Vous franchissez les terrains DIFFICILES sans test d'Agilité. |
| `teleportation` | Téléportation | upgrade | — | Vos mouvements franchissent toutes les barrières, même MURS et INFRANCHISSABLES. |
| `acrobatie` | Acrobatie | passive | — | +1 dé noir à l'attaque effectuée juste après avoir franchi une barrière DIFFICILE. |
| `ignore_opportunite` | Insaisissable | passive | — | Vous ignorez les Dégâts des attaques d'opportunité (tir en zone occupée, ou sortie de zone). |
| `attaque_opportunite` | Attaque d'Opportunité | passive | `val` (nombre OU dés "1d6+1"), défaut 0 | Vous infligez votre bonus de Dégâts à tout adversaire qui quitte votre zone ou y tire à distance. |
| `frayeur` | Frayeur | action | `val` (nombre), défaut 1 · `scope` ("count"|"zone"|"all") + `val` = nb de cibles | Action : un adversaire de votre zone doit fuir vers une autre zone (il subit les attaques d'opportunité). |
| `a_bout_portant` | À Bout Portant | upgrade | — | Tirer à distance dans la zone d'un adversaire ne déclenche pas d'attaque d'opportunité. |
| `charge_devastatrice` | Charge Dévastatrice | mastery | `val` (nombre), défaut 1 · `dice` (pool de dés) · `scope` ("count"|"zone"|"all") + `val` = nb de cibles | Votre bonus de Dégâts frappe X adversaires quand vous arrivez dans leur zone. |

#### 🤝 Alliés & Garde

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `gardien` | Gardien | mastery | `val` (nombre), défaut 1 | Au Pré-Tour 1 : désignez X allié(s) — chacun reçoit Blindage et l'état GARDÉ. |
| `protection` | Protection | reaction | — | Réaction — un allié GARDÉ va subir une attaque : déplacez-vous dans sa zone et attaquez l'assaillant. |
| `rempart` | Rempart | reaction | — | Réaction — un allié de votre zone va subir des Dégâts : vous les subissez à sa place (avec votre DEF). |
| `cooperation` | Coopération | action | — | Action : 1 attaque ; un allié GARDÉ de votre zone attaque gratuitement. |
| `assaut` | Assaut | action | — | Action : tous les AUTRES aventuriers de votre zone attaquent gratuitement (vous n'attaquez pas). |
| `ralliement` | Ralliement | passive | — | Les alliés qui se déplacent vers votre zone ne dépensent pas leur mouvement. |
| `menace` | Menace | mastery | `choice` ∈ ["sbire", "elite"] | Les adversaires de votre zone du type choisi sont obligés de vous cibler. |
| `garde_secrete` | Garde Secrète | mastery | — | Un allié GARDÉ qui conserve son Blindage jusqu'à la fin du combat rapporte +2 XP au groupe. |

#### 🔮 Orbes & Mysticisme

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `orbes_mystiques` | Orbes Mystiques | mastery | — | Chaque tour, lancez vos Orbes Mystiques (1 dé bleu, à distance, séparément) : 2 au départ, +1 par niveau impair. |
| `deflagration` | Déflagration | action | — | Action : lancez tous vos Orbes Mystiques restants sur une même cible à distance. |
| `orbe_partage` | Orbes Partagés | action | — | Action : répartissez vos Orbes sur des alliés — chacun gagne +1 dé bleu et l'élément de vos Orbes (FEU par défaut) à sa prochaine attaque. |
| `orbe_pretour` | Préparation Arcanique | mastery | — | Vos Orbes sont utilisables dès le Pré-Tour 1 (et restent disponibles au Tour 1). |
| `orbe_double` | Orbes Renforcés | mastery | — | Vos Orbes lancent 2 dés bleus chacun. |
| `orbe_bonus_dmg` | Maîtrise des Orbes | mastery | — | Votre bonus de Dégâts s'ajoute aux Dégâts de vos Orbes. |
| `orbe_element` | Orbes Élémentaires | upgrade | `choice` ∈ ["feu", "gele", "poison", "affaibli", "brise", "faille", "auSol"] | Vos Orbes infligent l'état choisi (Feu, Glace, Poison…) au lieu d'être de simples Orbes Mystiques. |
| `orbe_ignore_def` | Orbe Perforant | upgrade | — | Vos Orbes ignorent la DEF des cibles. |
| `orbe_critique` | Orbe Critique | passive | — | Vos Orbes peuvent réaliser des Critiques (double 6). |
| `orbe_zone` | Orbe à Dispersion | passive | — | Déflagration à 3 Orbes ou plus : les Dégâts touchent TOUS les adversaires de la zone. |

#### ⏱️ Tempo & initiative

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `pretour_first` | Initiative | passive | — | Vous agissez au Pré-Tour, AVANT les adversaires rapides. |
| `prepare_initial` | Vivacité | upgrade | — | Vous débutez chaque combat Préparé : +1 Action OU +1 Mouvement au premier tour. |
| `survitamine` | Survitaminé | upgrade | — | 2 Actions par tour. |

#### 🧭 Hors combat

| `effect` | Nom | Type | Variables | Description |
|---|---|---|---|---|
| `boost_competence` | Expertise | upgrade | `val` (nombre), défaut 1 · `choice` ∈ ["Agilité", "Force", "Mysticisme", "Perception", "Robustesse", "Ruse", "Savoir", "Technique"] | +X réussites à tous vos tests de la compétence choisie. |

### 9.3 Classes (jouables)
`Destructeur` (PV +16), `Gardien` (PV +18), `Lamevent` (PV +14), `Mystique`
(PV +10, la classe aux Orbes). Une aventure importée n'a PAS besoin de définir
les classes : elles existent déjà chez l'utilisateur. Si tu fournis des talents
de classe, mets-les dans un export « classes-talents » séparé (format §10.3).

**Espèces** (création d'aventurier — informatif) : Humain (VIE +1, Perception +1,
Savoir +1), Nain (PV +8, Robustesse +1, Technique +1), Goliath (Dégâts +2,
Force +1, Robustesse +1), Elfe (ENDU +1, Dégâts +1, Agilité +1, Mysticisme +1).

### 9.4 Talents ADVERSES (`advTalents[]`)
Talents des monstres, mêmes effets que §9.2 (le camp visé par défaut s'inverse
automatiquement). Structure réduite :

```json
{ "id": "desert_at_crachat", "name": "Crachat de sable", "kind": "action",
  "usage": "combat", "effect": "attaque_etat",
  "effects": [ { "effect": "attaque_etat", "choice": "affaibli" } ],
  "description": "Aveugle sa proie." }
```
Référencés par `monsters[].advTalentIds`.

### 9.5 Talents de PARCHEMIN (`parchTalents[]`)
Même structure qu'un talent (sans `level`). Un objet `category: "object"` avec
`"parchEffect": "par:<id>"` devient un **Parchemin** utilisable qui applique ce
talent. `parchEffect` peut aussi être directement une clé d'effet du catalogue.

---

## 10. AUTRES FORMATS D'IMPORT (contexte)

L'import (*Aventures → ⇧ Import JSON*) reconnaît aussi :

### 10.1 `amertume-adventures-all`
```json
{ "format": "amertume-adventures-all", "version": 2,
  "bundles": [ ...bundles d'aventure §2... ],
  "sagas": [], "homeOrder": [] }
```

### 10.2 Sauvegardes d'onglet
```json
{ "format": "amertume-monsters",  "monsters": [...], "advTalents": [...] }
{ "format": "amertume-items",     "items": [...], "parchTalents": [...] }
{ "format": "amertume-heroes",    "heroes": [...] }
{ "format": "amertume-tutorials", "tutorials": [ { "id", "title", "content" } ] }
```

### 10.3 `amertume-talents`
```json
{ "format": "amertume-talents",
  "classes": [ { "name": "Mystique", "talents": [ ...talents §9.1... ] } ],
  "genericTalents": [ ... ], "advTalents": [ ... ], "parchTalents": [ ... ] }
```

### 10.4 `amertume-global`
Sauvegarde intégrale du navigateur (générée par « 🌍 Export GLOBAL ») — ne pas
générer à la main.

---

## 11. RECETTE POUR UNE AVENTURE D'1 HEURE (recommandations)

- **1 chapitre donjon structuré** de **6 à 9 salles** (ou 2 chapitres : 1 narratif
  court d'intro + 1 donjon), OU un chapitre narratif de 8-12 scènes.
- **2 à 4 combats** (dont 1 boss final), 1-2 zones de combat par combat courant,
  2-3 zones + barrières pour le boss.
- **4 à 8 tests/actions/dialogues** variés ; 1 énigme (bloc Écriture) ; 1 passage
  secret (`revealTestId`) ; 1 Objet Rare servant de clé (`rareKeyName`).
- Récompenses : ~10-20 XP au total (montée au niveau 2 vers la fin), 20-60 or,
  1-3 objets, 1-2 trésors.
- Textes narratifs : 2-6 phrases par bloc, ambiance forte, en français.
- TOUJOURS donner un `label` parlant aux tests (« Escalader la dune », pas « Test »).

### Checklist finale avant de rendre le JSON
1. `format` = `"amertume-adventure-bundle"`, `version` = 2.
2. TOUS les ids portent le préfixe de l'aventure (règle d'or n°1).
3. Tous les ids uniques ; toutes les références résolues (monsterId → monsters[],
   itemId → items[], advTalentIds → advTalents[], chainIds → blocs de la même
   scène, targetSceneId/eventSceneId/sceneId → scènes existantes).
4. Chapitre donjon : `entryId` défini, chaque salle a `mapX`/`mapY` uniques, le
   graphe des `links` est connexe (toutes les salles atteignables).
5. Difficultés ∈ liste du §1 ; états ∈ liste du §1 ; clés d'effets ∈ §9.2.
6. JSON strictement valide (à tester mentalement : pas de virgules finales).
7. **PROGRESSION** : parcours mentalement l'aventure du début à la fin — chaque
   scène narrative a une sortie (`nextSceneId` / `choices` / `targetSceneId`
   retentable), la dernière scène de chaque chapitre pointe vers le chapitre
   suivant, et aucun échec de test ne peut bloquer définitivement le joueur.
8. **RÉCOMPENSES** : chaque gain annoncé dans un texte (or, objet, XP…) est
   porté par le champ structuré correspondant (§6.6bis) ; `xpReward` des tests
   suit le barème du §1.

---

## 12. EXEMPLE MINIMAL COMPLET (à imiter)

```json
{
  "format": "amertume-adventure-bundle",
  "version": 2,
  "adventure": {
    "id": "adv_oasis", "title": "L'Oasis des Chameaux Maléfiques",
    "duration": "1 h", "difficulty": "Moyenne",
    "summary": "Une caravane a disparu près de l'oasis d'Al-Rassif.",
    "chapters": [{
      "id": "oasis_ch1", "title": "L'Oasis", "mode": "dungeon", "entryId": "oasis_sc_dunes",
      "scenes": [
        { "id": "oasis_sc_dunes", "title": "Les Dunes", "type": "exploration", "mapX": 0, "mapY": 0,
          "blocks": [
            { "id": "oasis_b1", "type": "narrative", "content": "*Le sable crisse. Au loin, des palmiers.*" },
            { "id": "oasis_b2", "type": "test", "label": "Lire les traces", "skill": "Perception",
              "difficulty": "moyen", "who": "best",
              "successText": "Des empreintes de chameaux… à reculons.",
              "failText": "Le vent a tout effacé.", "xpReward": 2,
              "failEffect": { "kind": "none" }, "chainSuccessIds": ["oasis_b3"] },
            { "id": "oasis_b3", "type": "narrative", "content": "Quelque chose cloche avec ces bêtes." }
          ],
          "combatZones": [], "barriers": {} },
        { "id": "oasis_sc_oasis", "title": "L'Oasis", "type": "boss", "mapX": 1, "mapY": 0,
          "blocks": [
            { "id": "oasis_b4", "type": "combat", "content": "**Trois chameaux aux yeux rouges vous fixent.**" }
          ],
          "combatZones": [
            { "name": "Rive", "monsterRefs": [ { "monsterId": "oasis_mon_chameau", "count": 2 } ], "heroStart": true },
            { "name": "Palmeraie", "monsterRefs": [ { "monsterId": "oasis_mon_chef", "count": 1 } ] }
          ],
          "barriers": { "0-1": { "type": "difficile", "diff": "moyen", "name": "eaux vaseuses" } },
          "xpReward": 8,
          "treasureRewards": [ { "name": "Perle de l'oasis", "qty": 1, "kind": "treasure", "value": 40 } ] }
      ],
      "links": [ { "id": "oasis_l1", "from": "oasis_sc_dunes", "to": "oasis_sc_oasis", "label": "sentier de sable durci" } ],
      "randomEncounters": []
    }]
  },
  "monsters": [
    { "id": "oasis_mon_chameau", "name": "Chameau maléfique", "type": "standard", "socle": "large",
      "family": "Morts du désert", "pv": 9, "def": 1, "damage": 2, "xp": 5,
      "menace": "closest", "esquive": false, "rapide": false,
      "attacks": [ { "name": "Ruade", "dice": { "white": 2 }, "range": "contact",
        "targets": "one", "useOwnDamage": true,
        "effects": { "affaibli": false, "auSol": true, "feu": false, "gele": false },
        "uses": 0, "freeAction": false } ],
      "advTalentIds": [], "behaviors": [], "loot": [], "equipment": [], "notes": "" },
    { "id": "oasis_mon_chef", "name": "Meneur cauchemardesque", "type": "alpha", "socle": "large",
      "family": "Morts du désert", "pv": 18, "def": 2, "damage": 3, "xp": 12,
      "menace": "pvLow", "esquive": false, "rapide": true,
      "attacks": [ { "name": "Morsure spectrale", "dice": { "white": 1, "black": 1 }, "range": "contact",
        "targets": "one", "useOwnDamage": true,
        "effects": { "affaibli": true, "auSol": false, "feu": false, "gele": false },
        "uses": 0, "freeAction": false } ],
      "advTalentIds": ["oasis_at_hurlement"], "behaviors": ["toCrowd"], "loot": [], "equipment": [], "notes": "" }
  ],
  "advTalents": [
    { "id": "oasis_at_hurlement", "name": "Hurlement des sables", "kind": "action", "usage": "combat",
      "effect": "frayeur", "effects": [ { "effect": "frayeur", "val": 1, "scope": "count" } ],
      "description": "Force un aventurier à fuir la zone." }
  ],
  "items": [],
  "parchTalents": []
}
```

Bonne création ! Le MJ importera ton fichier via
**Mode MJ → Aventures → « ⇧ Import JSON »**, et l'aventure apparaîtra sur
l'écran d'accueil, jouable immédiatement.
