/* Historique des versions — genere depuis l'historique Git (outils/gen-versions.js). */
window.VERSIONS = [
  {
    "v": "v2.5.41",
    "date": "2026-08-25",
    "title": "Révélation progressive désactivée",
    "changes": [
      "Le bouton 👁 Révélation disparaît de la barre de scène et le déroulé bloc par bloc n'est plus jamais déclenché, même pour les navigateurs où l'ancienne préférence était à ON. Le code de startCinematic reste en place, dormant, pour une future version retravaillée."
    ]
  },
  {
    "v": "v2.5.40",
    "date": "2026-08-25",
    "title": "Choix des aventuriers : un Pré-Tiré reste un Pré-Tiré",
    "changes": [
      "Un aventurier déjà tiré d'un modèle (prebuiltId) apparaissait dans la section « Aventuriers » — celle des personnages créés par le joueur — tandis que les modèles non encore tirés restaient dans « Pré-Tirés » : un même lot de Pré-Tirés semblait donc scindé en deux.",
      "Les aventuriers issus d'un modèle rejoignent désormais la section « 🎲 Aventuriers Pré-Tirés », devant les modèles encore disponibles ; la section « Aventuriers » ne contient plus que les créations du joueur (son titre le précise)."
    ]
  },
  {
    "v": "v2.5.39",
    "date": "2026-08-25",
    "title": "Choix des aventuriers : carte strictement identique à l'onglet Groupe",
    "changes": [
      "heroCardHtml (utilisé uniquement par l'écran de choix) reprend exactement la structure de la carte du Groupe : plus de pastille d'initiales, retour des étiquettes Genre et Espèce, et blason de DEF via heroDefStatHtml (la vignette dédiée) au lieu d'une icône dans une vignette ordinaire. La section Attaques, absente côté Groupe, ne s'y trouve plus non plus.",
      "La section « 🎲 Aventuriers Pré-Tirés » reste toujours affichée : quand tous les modèles sont déjà dans le groupe, on l'explique au lieu de faire disparaître le titre."
    ]
  },
  {
    "v": "v2.5.38",
    "date": "2026-08-25",
    "title": "Écran de choix des aventuriers : mêmes cartes que l'onglet Groupe",
    "changes": [
      "Les cartes du lancement d'aventure adoptent la refonte v2.5.32-37 (surfaces sombres, liseré de classe, vignettes identiques, chips de compétence calibrées) : les règles sont partagées via :is(#hero-list, .hero-pick-list).",
      "Grille de cartes homogène, croix de suppression posée DANS la carte (elle mordait sur la pastille de classe, tronquée en « LAMEVEN. »), et surbrillance de sélection à la couleur de la classe.",
      "Phrase explicative sous le niveau de départ supprimée (passée en infobulle du sélecteur).",
      "Les Aventuriers Pré-Tirés passent SOUS les aventuriers créés par le joueur."
    ]
  },
  {
    "v": "v2.5.37",
    "date": "2026-08-25",
    "title": "Onglet Groupe : lisibilité des pastilles",
    "changes": [
      "Intérieur des vignettes de caractéristique et des chips de compétence nettement éclairci (mélange couleur/fond 42 % au lieu de 30 %, base #3a3126 au lieu de #251e17).",
      "Espace fine insécable entre le + et la valeur : « + 2 » au lieu de « +2 » (compétences et Dégâts).",
      "Valeurs de caractéristique agrandies (1,15 → 1,5 rem) et blason de DEF réduit (2,05 → 1,72 rem) ; vignettes légèrement plus hautes."
    ]
  },
  {
    "v": "v2.5.36",
    "date": "2026-08-25",
    "title": "Pré-Tirés : n'afficher que les talents réellement choisis",
    "changes": [
      "En Mode MJ, displayHero() renvoyait l'aventurier tel quel : sans liste de talents choisis, le moteur retombait sur le fallback « niveau de groupe » et créditait chaque Pré-Tiré de TOUS les talents de TOUTES les classes (d'où une Lame du Vent dotée d'Orbes Mystiques). La fiche s'appuie désormais sur les talents de départ (startTalents) retenus dans l'assistant ou l'éditeur."
    ]
  },
  {
    "v": "v2.5.35",
    "date": "2026-08-25",
    "title": "Pré-Tirés créés avec l'assistant du mode Aventure",
    "changes": [
      "La création d'un aventurier passe désormais par l'assistant en 6 étapes (nom/genre/espèce, classe, caractéristiques, équipement, talents, compétences) en Mode MJ comme en mode Joueur ; sans aventure, l'aventurier créé est un Pré-Tiré. L'ancien formulaire détaillé reste l'écran d'ÉDITION.",
      "Corrige au passage un blocage de l'assistant : l'étape Talents exigeait un choix même quand aucun talent de niveau 1 n'était disponible, rendant la création impossible."
    ]
  },
  {
    "v": "v2.5.34",
    "date": "2026-08-25",
    "title": "Groupe : lisibilité des cartes · Pré-Tirés sans XP · talent d'Espèce",
    "changes": [
      "Fond des cartes d'aventurier éclairci (#382e23 → #2b231a) pour se détacher du fond de page ; survol plus contrasté.",
      "Libellés courts et sur UNE seule ligne, tous à la même hauteur : VIE · ENDU · PV · DEF · DÉGÂTS, avec plus d'air entre le mot et sa valeur.",
      "Onglet Pré-Tirés : plus de bandeau d'XP ni de niveau — les modèles sont toujours de niveau 1 avec les talents de départ choisis par le MJ ; la progression appartient ensuite aux joueurs.",
      "Talent d'Espèce (onglet Talents) : même languette claire que les autres talents, bordée d'or, et « Niv. 0 » au lieu de « Offert ». Sa case à cocher, sans classe, s'étirait et écrasait le nom du talent.",
      "Talents : réalignement des Pré-Tirés aussi au rendu de cet onglet."
    ]
  },
  {
    "v": "v2.5.33",
    "date": "2026-08-25",
    "title": "Onglet Pré-Tirés (MJ) et lien vivant avec les copies",
    "changes": [
      "Nouvel onglet « Pré-Tirés » en Mode MJ/Admin (panneau des aventuriers modèles, création illimitée), proposé dans TOUTES les aventures via la section « Aventuriers Pré-Tirés » de l'écran de lancement.",
      "Store.syncPrebuilts() : toute copie tirée d'un modèle (prebuiltId) suit désormais son modèle en direct — nom, classe, espèce, caractéristiques, compétences, talents, notes — y compris pendant une partie. Appelé au rendu du Groupe, de l'aventure et après réception d'un partage.",
      "Restent au joueur : identité de la copie, PV courants et équipement qu'il a modifié en jeu (le butin équipé n'est jamais écrasé) ; l'équipement de base suit toujours le modèle.",
      "Les Pré-Tirés étaient déjà publiés dans le partage : vérifié de bout en bout, republication comprise."
    ]
  },
  {
    "v": "v2.5.32",
    "date": "2026-08-25",
    "title": "Onglet Groupe : refonte visuelle façon HUD de combat",
    "changes": [
      "Cartes sombres à liseré de classe, en-tête aligné (nom, classe, boutons de même gabarit), vignettes de caractéristique STRICTEMENT identiques (libellé « Défense » rétabli sous le blason), chips de compétence en grille de largeur égale avec valeur en pastille, bandeau d'XP retravaillé et badges d'attaque/équipement accordés côté MJ.",
      "Palettes conservées (Vie violet, Endurance teal, PV vert, Défense gris, Dégâts rouge, une couleur par compétence), valeurs retendues pour fond sombre. Tout est scopé à l'onglet : aucun autre écran n'est touché."
    ]
  },
  {
    "v": "v2.5.31",
    "date": "2026-08-25",
    "title": "Révélation : le bloc se dévoile de gauche à droite",
    "changes": [
      "Le déroulé vertical est remplacé par un rideau horizontal (clip-path), dont la durée suit la longueur du texte (0,35 s à 1,1 s) pour que la lecture accompagne le dévoilement."
    ]
  },
  {
    "v": "v2.5.30",
    "date": "2026-08-25",
    "title": "Révélation progressive des blocs d'une salle (option)",
    "changes": [
      "Bascule 👁 Révélation dans la barre du haut, à gauche de ✕ Quitter, mémorisée dans le navigateur (amertume_reveal_v1).",
      "Une salle déjà déroulée (ses.cineDone) ne rejoue jamais la séquence."
    ]
  },
  {
    "v": "v2.5.29",
    "date": "2026-08-25",
    "title": "Partage : publier TOUS les catalogues de talents du MJ",
    "changes": [
      "buildBundle v2 : genericTalents (+ pierres tombales), parchTalents, advTalents, monsterTalents, speciesTalents, tutorials.",
      "applyBundle remplace ces catalogues à l'identique (pas de fusion), les pierres tombales explicites empêchant la résurrection des talents supprimés par le MJ.",
      "Store expose load/saveGenTombstones.",
      "Export JSON « Classes & Talents » : ajout des talents d'espèce et du catalogue adverse, à l'export comme à l'import.",
      "Modale de partage : liste à jour de ce qui est publié."
    ]
  },
  {
    "v": "v2.5.28",
    "date": "2026-08-25",
    "title": "Niveau de départ : un seul sélecteur, pour tout le groupe",
    "changes": [
      "L'expérience étant commune, le niveau l'est aussi : le sélecteur par aventurier laissait croire à des niveaux différents. Il est remplacé par un choix unique au-dessus du bouton de lancement, appliqué à tous les aventuriers engagés."
    ]
  },
  {
    "v": "v2.5.27",
    "date": "2026-08-25",
    "title": "Montée de niveau : le message n'apparaît qu'au clic sur Continuer",
    "changes": [
      "Bouton Continuer toujours cliquable ; s'il manque des choix, le clic affiche les manques au lieu d'avancer.",
      "Le message et le liseré d'attention restent masqués avant cette tentative, et disparaissent dès que tout est choisi."
    ]
  },
  {
    "v": "v2.5.26",
    "date": "2026-08-25",
    "title": "Montée de niveau : expliquer pourquoi Continuer est grisé",
    "changes": [
      "Message sous le bouton listant, par aventurier, les choix manquants (caractéristique, compétences, talent).",
      "Compteur 0/2 dans l'en-tête des compétences, vert une fois complet.",
      "Liseré ambré sur la colonne d'un aventurier incomplet."
    ]
  },
  {
    "v": "v2.5.25",
    "date": "2026-08-25",
    "title": "Colonne Especes du MJ : en-tete accorde, pastille compacte, oeil et crayon",
    "changes": [
      "L'en-tete de la colonne « 🧬 Especes » avait recu un fond dore plein, unique dans l'onglet : il reprend le traitement des autres colonnes (fond transparent, simple couleur de texte et lisere assorti).",
      "La pastille de l'espece passe d'un long libelle (« GNOME ») a une pastille ronde d'une lettre (« G »), le nom complet restant en infobulle.",
      "L'OEIL et le CRAYON sont de retour : ces talents ne sont plus en lecture seule. Ils vivent desormais dans leur propre liste, comme les parchemins et les talents adverses, avec leur cle d'espece — le MJ peut donc les renommer, changer leur effet, ecrire leur descriptif, en ajouter, et les masquer.",
      "Un talent d'espece masque n'est plus accorde en combat ni affiche cote joueur ; le reactiver le retablit. Verifie dans les deux sens, ainsi que la persistance et l'affichage cote joueur."
    ]
  },
  {
    "v": "v2.5.24",
    "date": "2026-08-25",
    "title": "Niveau de depart choisi pour chaque aventurier au lancement",
    "changes": [
      "L'ecran de lancement d'une aventure porte desormais un selecteur « DEPART : Niveau X » sous CHAQUE carte d'aventurier (crees comme pre-tires), du niveau 1 au niveau maximum. Le selecteur ne coche plus la carte quand on l'ouvre.",
      "Le niveau choisi est reporte sur le clone d'un pre-tire (son identifiant change au lancement).",
      "La session enregistre les niveaux de depart. L'XP de groupe etant commune, elle part du niveau LE PLUS HAUT du groupe ; chaque aventurier ne fait ensuite ses montees que jusqu'a SON niveau : il choisit normalement ses caracteristiques, ses competences et ses talents, palier par palier. Un palier que personne n'atteint est enregistre et passe sans ecran.",
      "Verifie de bout en bout : Agone lance au niveau 3 et Bergil au niveau 1 donnent une XP de groupe de 250 (niveau 3), et l'ecran de montee de niveau au lancement n'affiche qu'Agone."
    ]
  },
  {
    "v": "v2.5.23",
    "date": "2026-08-25",
    "title": "Le Talent d'Espece s'affiche partout : creation, Talents, fiche, cote MJ",
    "changes": [
      "VIGNETTE D'ESPECE a la creation : sous les bonus de competence, une pastille « ESP · Discretion » avec son effet en infobulle.",
      "ONGLET TALENTS (mode Joueur) : une section « Espece » en tete de la liste de chaque aventurier, avec le talent coche et VERROUILLE — il est toujours actif et n'occupe aucun des six emplacements, d'ou la mention « Offert ».",
      "FICHE DE L'ONGLET GROUPE : l'infobulle de l'espece rappelle « Talent d'Espece : Discretion » a la suite des bonus.",
      "COTE MJ, onglet Classes : nouvelle colonne « 🧬 Especes » listant les talents d'espece en LECTURE SEULE (ils sont definis avec leur espece, pas editables ici), chacun etiquete du nom de son espece. L'effet figure aussi dans la bibliotheque des effets."
    ]
  },
  {
    "v": "v2.5.22",
    "date": "2026-08-25",
    "title": "Nouvelle Espece : Gnome, avec le Talent d'Espece Discretion",
    "changes": [
      "Espece GNOME (🍄) ajoutee a la creation d'aventurier : Ruse +1, Technique +1, et un Talent d'Espece.",
      "Nouvel effet DISCRETION (genre « Espece ») dans le catalogue : « Vous n'etes jamais cible en priorite par les adversaires tant qu'un autre aventurier se trouve dans votre zone. »",
      "Le Talent d'Espece est accorde d'office au lancement du combat, SANS occuper d'emplacement de talent : les six emplacements restent libres pour les talents de classe. Il apparait dans les bonus de l'espece a la creation.",
      "Cablage du ciblage adverse : un aventurier discret accompagne est retire du choix des cibles, aussi bien pour l'attaque que pour la designation de PROIE — sauf s'il ne reste que des discrets a viser, et sauf si un allie force le ciblage par MENACE (qui prime).",
      "Verifie en combat reel : avec les deux aventuriers dans la meme zone, le Rodeur frappe le Nain (20 PV) et ignore le Gnome a 1 PV, qu'il aurait cible sans Discretion ; le Gnome isole dans sa zone redevient la cible."
    ]
  },
  {
    "v": "v2.5.21",
    "date": "2026-08-25",
    "title": "Niveau de l'aventurier dans le bandeau, titre ATTAQUE agrandi",
    "changes": [
      "La fiche du bandeau affiche desormais le NIVEAU de l'aventurier, dans une pastille ambre posee devant sa classe (« NIV. 4 · Gardien »). Le niveau est celui du groupe, fige sur l'instance au lancement du combat : il reste juste meme apres un rechargement de page. Les combats deja en cours, qui ne le portent pas, affichent le niveau 1.",
      "Le titre « ATTAQUE » de la boite de des repasse en plus grand (14,7 px au lieu de 11,5) avec son icone d'arme agrandie, sans jamais toucher les des ni les blasons de DEF poses dans leur coin : 13 px de degagement mesures dans le cas le plus serre (tous les des bloques)."
    ]
  },
  {
    "v": "v2.5.20",
    "date": "2026-08-25",
    "title": "Journal resserre : « X attaque Y : N Degats. »",
    "changes": [
      "Les lignes d'attaque sont ramenees a l'essentiel : plus de recit du deplacement (« se deplace Zone 2 et… »), plus de nom d'arme (il est lisible dans la boite de des du bandeau). Reste « <Aventurier> attaque <Adversaire> : N Degats. », avec la mention CRITIQUE ou Echec quand elle s'applique, et le detail des des toujours replie sous le 🎲.",
      "Meme traitement pour l'attaque annulee (« : annule (Blindage) ») et pour les degats moyens (« (moyenne) : N Degats. »).",
      "Le compteur du bouton ORBES ne se colle plus a son nom dans la case Description : elle affiche « Orbes (2 restants) » au lieu de « ORBES2 RESTANTS »."
    ]
  },
  {
    "v": "v2.5.19",
    "date": "2026-08-25",
    "title": "Onglets d'etat cales sur le bandeau, leur regle passe dans la case Description",
    "changes": [
      "La rangee d'etats etait accrochee au conteneur PLEINE LARGEUR du bandeau : sur un ecran large, ou le bandeau est centre, les onglets demarraient tout a gauche de l'ecran. Elle est desormais posee dans le bandeau lui-meme et commence pile au-dessus de son bord gauche, juste avant le nom de l'aventurier (mesure a 2200 px : onglet 362, fiche 361 ; a 1500 px : 24 et 23).",
      "Le bandeau ne rogne plus ses debordements, sans quoi la rangee, posee au-dessus de lui, se retrouvait invisible. Chaque case garde son propre decoupage et la hauteur reste constante.",
      "La bulle flottante des etats disparait : survoler un onglet affiche sa REGLE dans la case Description, avec son icone, son nom (crans compris) et la couleur de l'etat."
    ]
  },
  {
    "v": "v2.5.18",
    "date": "2026-08-25",
    "title": "Cmd + survol : la visee passe en ANALYSE ; bonus de degats sans cadre",
    "changes": [
      "Maintenir Cmd (ou Ctrl sous Windows/Linux) en survolant un adversaire remplace la visee d'attaque par une visee d'ANALYSE : fleche violette (la couleur du bouton Analyse) et icone loupe. Le clic lance alors l'analyse au lieu de l'attaque — elle revele tout le groupe du meme nom, consomme le mouvement, laisse l'action intacte et rapporte +2 XP la premiere fois.",
      "Si l'analyse est impossible (mouvement deja depense, aventurier Au sol, hors phase des heros), la fleche vire au rouge avec l'icone d'interdiction.",
      "La touche est suivie meme sans bouger la souris : appuyer ou relacher Cmd bascule la visee sur-le-champ, et quitter la fenetre la remet a l'attaque.",
      "Le bonus de degats affiche dans le pool n'a plus aucun cadre : « +X » avec « degats » en plus petit dessous, dans le rouge des degats."
    ]
  },
  {
    "v": "v2.5.17",
    "date": "2026-08-25",
    "title": "Titres de description colores, Killam sur tous les titres, Pre-Tour rejoue au redemarrage",
    "changes": [
      "Le titre de la case Description prend la COULEUR de ce qu'il decrit : classe de l'aventurier, type de l'adversaire, genre du bouton survole, couleur du de, teinte de la barriere, ambre pour une zone. Les couleurs sont assombries juste ce qu'il faut pour rester lisibles sur le fond parchemin. Les degrades rendant `background-color` transparent, la teinte est prise sur la bordure du bouton en priorite — sans ce repli le titre sortait en noir.",
      "Killam habille desormais TOUS les intitules speciaux de l'application, et plus seulement le combat : titres de cartes et de fenetres, en-tetes de sections, noms d'aventures, de classes, d'adversaires, d'objets, de talents, historique des versions. Les libelles fonctionnels (boutons, champs, journal, textes de salle) restent en Inter.",
      "RECOMMENCER LE COMBAT rejoue l'ouverture : annonce des invisibles, designation de la Proie et PRE-TOUR avec ses pouvoirs. L'instantane etant pris avant l'ouverture, le combat repartait sinon directement en phase heros, sans Pre-Tour. Verifie : phase=pretour et bouton « Tour 1 → » de retour.",
      "Le blason de DEF pose sur un de bloque n'est plus grise avec lui : le voile est un calque sous le blason, qui reste net et colore.",
      "Le bonus de degats redevient un vrai CARRE en pointillés, au format d'un de (mesure : 35x35, bordure 2 px tiretee)."
    ]
  },
  {
    "v": "v2.5.16",
    "date": "2026-08-25",
    "title": "Blason de DEF sur les des bloques, titre degage, Orbes enchaines",
    "changes": [
      "Les des arretes par la Defense portent desormais le BLASON de DEF (la meme image que sur les fiches d'adversaires), pose dans leur coin superieur droit, a la place de la pastille de texte.",
      "Le titre « ATTAQUE » est resserre et la boite laisse passer les blasons : ils ne sont plus rognes par le haut (16 px de degagement mesures entre le bas du titre et le blason le plus haut).",
      "ORBES : le bouton RESTE arme apres un tir tant qu'il reste des orbes — on enchaine les lancers sans recliquer — et se desarme des que le dernier est parti. Le Pre-Tour garde sa regle : un seul orbe avant le tour. Verifie sur une Mystique a 2 orbes : arme apres le 1er tir, desarme apres le 2e, le 3e clic ne fait rien."
    ]
  },
  {
    "v": "v2.5.14",
    "date": "2026-08-25",
    "title": "Fiches au survol, des bloques par la DEF, Recommencer le combat, sorties agrandies",
    "changes": [
      "Fin des infobulles jaunes du navigateur : chaque `title` du bandeau et des vignettes est deplace dans un attribut lu par la case Description, qui reste seule a documenter l'interface.",
      "La case Description devient une VRAIE fiche au survol du plateau :",
      "adversaire — type, et s'il est analyse ses PV, sa DEF, ses degats, son XP, ses talents et ses notes ; sinon un rappel qu'il faut l'analyser ;",
      "aventurier — classe, PV, DEF, degats, etats en cours et ce qui lui reste a jouer (action, action bonus, mouvement) ;",
      "zone — son nom et qui s'y trouve ;",
      "barriere — son nom et sa regle exacte (mur, infranchissable, difficile, instable).",
      "PREPARATION ARCANIQUE : un seul Orbe avant le tour. Les Orbes ne consommant pas l'action, le Pre-Tour les rearmait aussitot et deux clics de suite en lancaient deux.",
      "Des arretes par la Defense : grises, avec un cartouche « DEF X » dans leur coin — on voit d'un coup d'oeil ce qui est passe et ce qui a ete bloque.",
      "Cliquer la vignette d'un aventurier dans le COMA affiche bien SA fiche : la selection automatique ne remplace plus un combattant choisi a la main.",
      "Nouveau bouton « ↺ Recommencer le Combat », a gauche de « Fuir le Combat » : il remet PV, positions, etats, journal et tour dans leur etat de depart grace a un instantane pris au lancement. Absent en mode partage.",
      "Sorties de donjon : la FLECHE de direction reste toujours affichee (plus de cadenas ni de cle qui la remplacent), seule sa couleur distingue une sortie ouverte, verrouillee ou reservee au MJ ; le nom des salles passe en plus gros et plus gras."
    ]
  },
  {
    "v": "v2.5.12",
    "date": "2026-08-25",
    "title": "Pastilles d'action et de mouvement, loupe des adversaires analyses",
    "changes": [
      "Coin haut-droit des vignettes d'aventurier : un point BLEU par action encore disponible — deux points quand le combattant est PREPARE et dispose donc d'une action supplementaire — et un point AMBRE (couleur du mouvement) tant que le deplacement du tour n'a pas ete utilise. Le point de mouvement tient compte des mouvements gratuits (Pas Leger, Rebond) et disparait si le combattant est Au sol ou Gele.",
      "Une petite loupe s'affiche a cote du nom d'un adversaire DEJA ANALYSE : d'un coup d'oeil on sait quelles fiches sont revelees."
    ]
  },
  {
    "v": "v2.5.11",
    "date": "2026-08-25",
    "title": "Deselection au re-clic, dans les marges et par Echap ; cadre du pool de des fige",
    "changes": [
      "Trois nouvelles facons de deselecter un combattant : recliquer celui qui est deja selectionne, cliquer N'IMPORTE OU sur la page (y compris hors du plateau, dans les marges perdues), ou appuyer sur Echap. Les ecouteurs sont poses sur le document et ignorent les elements interactifs (vignettes, zones, boutons, champs, bandeau, journal) ; ils restent inactifs quand aucun plateau n'est affiche ou qu'une fenetre modale est ouverte.",
      "Le cadre du pool de des ne bouge plus apres une attaque : le titre reste « ATTAQUE » avec l'icone du type d'arme, et l'arme employee reste dans sa pastille en bas. Seules les faces des des changent. Le detail du jet (degats, DEF, critique) se lit dans le journal de combat et sur la cible."
    ]
  },
  {
    "v": "v2.5.10",
    "date": "2026-08-25",
    "title": "Police de titrage Killam Bold, fournie et embarquee dans le depot",
    "changes": [
      "Le fichier Killam Bold est ajoute au depot dans assets/fonts/, converti en WOFF2 (65 Ko contre 184 Ko pour le TTF, soit ~65 % de moins). Le TTF est conserve en repli pour les navigateurs anciens.",
      "Declaration @font-face locale : plus aucune dependance a un service externe pour le titrage. La plage font-weight: 400 900 evite que le navigateur rajoute un gras synthetique par-dessus une police deja grasse.",
      "--font-display passe a « Killam », avec Fraunces puis Cinzel puis Georgia en repli. Tout le titrage suit : noms des combattants, noms de zones, pastille TOUR, titres des cases du bandeau, onglets d'etat, titres de salle, en-tete des sorties, journal et marque de l'application.",
      "Couverture verifiee avant integration : 291 glyphes, TOUS les accents francais presents (a e i o u avec accents, cedille, trema, guillemets, apostrophe typographique). Chargement verifie dans le navigateur."
    ]
  },
  {
    "v": "v2.5.09",
    "date": "2026-08-25",
    "title": "Deselection au clic dans le vide, regle des des au survol, journal en blanc creme",
    "changes": [
      "Un clic dans le VIDE du plateau (hors vignette, zone, bouton, bandeau, journal) deselectionne le combattant et annule l'action armee. La selection automatique est mise en pause tant que le joueur n'a pas repris la main sur un combattant : sans cela, la fiche se re-selectionnait aussitot. Elle reprend au tour suivant.",
      "Survoler un de du pool affiche SA REGLE dans la case Description : simple, leger, lourd, mystique, soin, mortel, phase et faille — chacun avec son effet exact (depasser la DEF, retire sur un double, ignore la DEF, valeur doublee, multipliee par le tour, faces exclues…).",
      "Journal en blanc creme pour le texte ordinaire : l'orange ne sert plus qu'aux informations marquantes. Etats en ambre, talents et reactions en violet, armes et attaques en bleu acier, degats en rouge clair, soins en vert, critique et echec en exergue.",
      "Les onglets d'etat commencent au-dessus du NOM de l'aventurier, au bord gauche du bandeau (mesure : 11 px contre 12 px pour le bandeau), et ne debordent plus de la fenetre de combat."
    ]
  },
  {
    "v": "v2.5.08",
    "date": "2026-08-25",
    "title": "Police de titrage nettement plus grasse : Fraunces 900",
    "changes": [
      "Noms des combattants (plateau et fiche du bandeau), noms de zones, titre de la boite de des, titre de la case Description, pastille TOUR, onglets d'etat, titre de salle, en-tete des sorties et marque de l'application.",
      "Interlettrages reajustes : Fraunces porte plus que Cinzel, les capitales sont donc un peu resserrees.",
      "Cinzel reste en repli, puis Georgia : aucun ecran ne se retrouve sans police de titrage si le chargement echoue."
    ]
  },
  {
    "v": "v2.5.07",
    "date": "2026-08-25",
    "title": "Plateau : pierre, barrieres d'un seul trait, pastilles et Orbes violets",
    "changes": [
      "Objet et Analyse : icone et libelle sur la MEME ligne.",
      "Boite de des sur fond nettement plus clair (pierre chaude), liseré renforce.",
      "L'arme equipee s'affiche dans une pastille arrondie sous les des.",
      "Barrieres refaites : bouts francs au lieu d'arrondis, meme hachure, meme epaisseur et meme lisere sombre pour les segments droits et la diagonale — elles forment desormais UN SEUL trait continu, y compris dans les angles. Les libelles (MUR, DIFFICILE…) passent en pastille sombre lisible.",
      "Fond des zones en ton PIERRE, sensiblement plus clair que le plateau, avec un degrade doux ; nom de zone et mention « Zone vide » reaccordes.",
      "Les Orbes Mystiques redeviennent VIOLETS (le bouton avait ete uniformise en bleu avec les attaques a la version precedente).",
      "Les libelles d'action trop longs passent a la ligne (deux lignes centrees) au lieu d'etre coupes.",
      "Fenetre de description : texte plus gras et un peu plus grand."
    ]
  },
  {
    "v": "v2.5.06",
    "date": "2026-08-25",
    "title": "Bandeau : une seule typographie, boutons d'action denses, lueur du selectionne",
    "changes": [
      "Ordre des sorties impose : GAUCHE, HAUT, BAS, DROITE (les diagonales suivent leur cote : nord-ouest et sud-ouest avec la gauche, nord-est et sud-est avec la droite). Verifie sur une salle a quatre sorties.",
      "Typographie UNIQUE pour tous les boutons du bandeau. Mesure avant : 12,8 / 16,8 / 17,28 px, graisses 600 et 700, capitales tantot oui tantot non. Apres : Inter 0,78 rem, gras 700, capitales, meme interlettrage pour les talents, les attaques, les Orbes, les outils et leurs libelles — seules les icones (fiole, loupe) gardent leur taille d'icone.",
      "Boutons d'action nettement plus DENSES, avec un degrade par genre : action et attaque en bleu franc, maitrise en or, reaction en violet, amelioration en vert, passif en gris chaud, garde en bleu marine, objet en vert profond, analyse en violet, se relever/liberer en ambre. Le rouge des libelles est desormais reserve aux talents d'ADVERSAIRE : il ecrasait la couleur de genre des talents d'aventurier.",
      "L'aventurier selectionne LUIT doucement (pulsation ambree de 2,4 s, coupee si le systeme demande moins d'animations)."
    ]
  },
  {
    "v": "v2.5.05",
    "date": "2026-08-24",
    "title": "Sorties dans le fil de la salle en boutons clairs, PV et Blindage alternes",
    "changes": [
      "La navigation de donjon quitte le bandeau flottant : le bloc « Sorties & acces » se pose desormais A LA SUITE des paragraphes de la salle, dans la carte de scene, separe par un filet et titre en petites capitales.",
      "Boutons de sortie CLAIRS, dans le ton des cases d'action : fond parchemin, texte brun, pastille directionnelle ambre (verte pour une salle deja visitee, grise pour un acces verrouille, violette en passe-droit MJ). Toute la logique (verrous, acces dissimules, demi-tour seul pendant un test obligatoire, combat engageant les sorties) est inchangee.",
      "Titre de salle dans la police d'identite (Cinzel), comme les noms en combat.",
      "BLINDAGE ne cache plus les PV : le texte de la barre alterne en fondu entre « x/x PV » et « BLINDAGE » (fige sur les PV si le systeme demande moins d'animations).",
      "Nettoyage : plus de reservation de bas de page ni de repositionnement au redimensionnement pour la navigation."
    ]
  },
  {
    "v": "v2.5.04",
    "date": "2026-08-24",
    "title": "HUD de combat, seconde passe : visee rouge si impossible, envolee des des, journal epure",
    "changes": [
      "La fleche de visee passe au ROUGE des que l'attaque est impossible : cible derriere un mur ou une barriere infranchissable, tir bloque, attaque de contact sans mouvement disponible pour rejoindre la cible (Eclipse, Teleportation et attaques a deplacement gratuit restent bleues).",
      "Vignette selectionnee lisible : fin des fonds clairs satures — fond sombre reflete ambre, anneau de selection net, nom garde sa couleur de classe.",
      "La disponibilite suit la VRAIE action (nouvelle classe act-ready) : des que l'aventurier a agi, sa vignette s'eteint immediatement, meme selectionnee — l'etat Prepare ne maintient plus le halo a tort.",
      "Onglets d'etat agrandis et COLORES par etat : feu orange, gel bleu glace, poison vert, blindage acier, prepare ambre, invisible mauve… icone plus grande, petites capitales Cinzel.",
      "Les etats ne s'affichent plus sur les vignettes du plateau : ils vivent sur les onglets du bandeau (bulle d'explication au survol conservee).",
      "Hierarchie de polices unifiee : Cinzel pour les identites et titres (noms, zones, TOUR, onglets, titres de cases), Inter pour tout le fonctionnel.",
      "Boutons outils avec libelles OBJET et ANALYSE sous leur icone.",
      "Case de description sur fond parchemin clair, texte brun fonce.",
      "ENVOLEE DES DES : les des du jet apparaissent en grand au centre de l'ecran puis glissent en retrecissant jusqu'au pool du bandeau (transformations seules, respect de prefers-reduced-motion).",
      "Journal recentre sur l'essentiel : plus de lignes de deplacement ni de changement de tour, degats et soins en gros et gras, et le detail du calcul (les des) est replie — un clic sur la ligne 🎲 l'ouvre.",
      "Allegement : suppression des flous d'arriere-plan du bandeau, de la navigation de donjon et des modales (fonds opaques), flou de la barre superieure reduit — la cause probable des saccades."
    ]
  },
  {
    "v": "v2.5.03",
    "date": "2026-08-24",
    "title": "HUD de combat « jeu video » : vignettes sombres teintees, signal d'action, onglets d'etats",
    "changes": [
      "Vignettes de combattant refondues : fond sombre voile de la couleur de classe (heros) ou de dangerosite (adversaires), nom en petites capitales Cinzel a la couleur de sa classe, pastilles d'etat sombres a bord colore.",
      "Lecture immediate de qui peut agir : lisiere lumineuse bleue autour des aventuriers dont l'ACTION est disponible, vignette eteinte (opacite et saturation reduites) une fois l'action depensee — sauf selection en cours.",
      "Zones identifiees : plaque de titre en capitales espacees, liseret superieur colore selon l'occupant (bleu aventuriers, ambre alpha, rouge solitaire, violet boss), hauteur minimale qui remplit l'espace, « Zone vide » en filigrane.",
      "Barre de tour en bandeau HUD : TOUR en cartouche dore Cinzel, phase en pastille teintee, XP en badge ambre.",
      "Journal de combat : titre « Journal de combat », lignes espacees et separees, changements de tour sur fond ambre a liseret, colonne collante qui ne passe plus sous le bandeau.",
      "Bandeau du bas accorde : fiche et actions sombres teintees classe, boutons de talent sombres (emplacements vides en pointilles), attaque en bleu action, grand bouton Se relever / Se liberer sur deux lignes avec fiole et loupe empilees a cote.",
      "Les etats deviennent des ONGLETS DE LIVRE poses sur le bandeau : forme d'onglet a coins hauts arrondis, icone dediee par etat (feu, gel, poison, blindage, garde…), petites capitales Cinzel, liseret superieur vert ou rouge, survol qui souleve l'onglet — la bulle de description est conservee.",
      "Le nom garde sa couleur de classe meme quand l'action est disponible (l'ancien bleuissement v2.49 est neutralise). Aucune information retiree ; verification Playwright sur un combat a quatre aventuriers, etats multiples, attaque et mise a mort."
    ]
  },
  {
    "v": "v2.5.02",
    "date": "2026-08-24",
    "title": "Navigation de donjon : la barre n'est plus masquee par un combat reste dans un onglet cache",
    "changes": [
      "La regle CSS ne considere plus que le bandeau de l'ONGLET ACTIF (body:has(.tab-panel.active #cbdock)).",
      "Filet en supplement : au rendu de la barre de navigation, tout bandeau de combat orphelin hors de l'onglet actif est retire du DOM."
    ]
  },
  {
    "v": "v2.5.01",
    "date": "2026-08-24",
    "title": "Refonte visuelle complete de l'interface",
    "changes": [
      "Jetons repenses : palette sombre chaleureuse plus contrastee, rayons 12-18px, ombres douces a trois niveaux, anneau de focus visible. Polices Inter (corps et titres) et Cinzel (marque), chargees via Google Fonts.",
      "Primitives unifiees : boutons (primaire degrade, fantome, tailles normees), champs avec anneau de focus, cartes en surfaces elevees, modales floutees, barres d'outils import/export, onglets en pastilles avec etat actif ambre, barres de defilement fines, fond de page en degrades radiaux discrets.",
      "Barre superieure translucide (flou d'arriere-plan), fin du double lisere magenta du mode MJ, pastilles de contexte accordees a la palette.",
      "Accueil : marque Cinzel en degrade dore, cartes d'aventures elevees.",
      "Combat : barre de tour, journal et zones en cartes nettes, vignettes adoucies, bandeau du bas et fenetres d'etats accordes au nouveau langage.",
      "Lecture des salles : blocs narratifs plus grands (interligne 1.68), titres de scene modernises, quinze usages residuels de Georgia remplaces."
    ]
  },
  {
    "v": "v2.4.63",
    "date": "2026-08-24",
    "title": "Fleche effacee des qu'on agit, titre d'attaque avec icone d'arme, libelles des outils",
    "changes": [
      "Une action jouee (attaque, deplacement, objet, analyse, designation) efface la fleche de visee sur-le-champ ; elle ne revient qu'au prochain mouvement de souris. Mesure : plus aucune fleche 80 ms apres le clic.",
      "Le titre de la boite de des occupe toute la bande entre le haut du bandeau et les des : le mot ATTAQUE precede de l'icone du type d'arme (contact, tir ou sort), centre. Apres un jet, le titre annonce l'arme employee et sa cible, toujours avec son icone.",
      "Le nom des armes est centre dans toute la bande situee sous les des, comme le resultat du jet.",
      "La case Description affiche un vrai titre pour les boutons a icone : ANALYSE et OBJET au lieu de l'emoji. Les titres y sont desormais en capitales."
    ]
  },
  {
    "v": "v2.4.62",
    "date": "2026-08-24",
    "title": "Fin du roulement des des, outils au format des boutons d'action, PV et DEF pleine largeur",
    "changes": [
      "Le roulement des des est supprime : les faces s'affichent immediatement avec leur valeur, accompagnees d'une simple pose. Le gel du plateau qui attendait la fin du roulage disparait avec lui — degats, morts, animations et journal s'appliquent aussitot (mesure : faces finales et resultat presents 60 ms apres le clic).",
      "Les boutons Objet et Analyse occupent desormais une colonne entiere de la grille d'actions : ils ont exactement la taille d'un bouton de talent.",
      "Dans la fiche, la barre de PV et le blason de DEF prennent toute la largeur de la case : barre plus haute (30 px), valeur en plus gros et sur une seule ligne, blason agrandi."
    ]
  },
  {
    "v": "v2.4.61",
    "date": "2026-08-24",
    "title": "Bandeau de combat cale : quatre cases, des sur une ligne, huit talents, panneau de description",
    "changes": [
      "Le bandeau est desormais une grille de quatre colonnes a hauteur fixe : fiche de l'aventurier · des d'attaque · boutons d'action · description. Tout ce qu'elles contiennent est borne : plus rien ne deborde ni ne se chevauche, verifie de 1000 a 1500 px de large.",
      "Les des tiennent TOUJOURS sur une seule ligne : leur taille est calculee apres la mise en page d'apres la largeur reelle de la boite et leur nombre (de 40 px pour deux des a 16 px pour un tres gros pool), cartouche « +X degats » compris.",
      "Rangee d'actions : les deux boutons carres (fiole, loupe) puis HUIT emplacements de talents sur deux lignes de quatre. Les boutons remplissent toute la hauteur de leur cellule et les libelles trop longs sont coupes par une ellipse au lieu d'etre rognes des deux cotes.",
      "Quatrieme case, tout a droite : la description de l'action survolee ou cliquee (nom en tete, effet en dessous). Elle fonctionne aussi pour les boutons desactives, qui n'emettent aucun evenement."
    ]
  },
  {
    "v": "v2.4.60",
    "date": "2026-08-24",
    "title": "Bandeau en trois cases : fiche, des d'attaque, actions",
    "changes": [
      "Le bandeau du bas suit desormais le croquis : a gauche une case carree avec la fiche de l'aventurier (nom, barre de PV + blason de DEF, classe), au centre la boite des des d'attaque, a droite les boutons d'action.",
      "La boite de des porte un titre « ATTAQUE » au-dessus des des et, sous eux, le nom de l'arme (ou des armes combinees). Apres un jet, le titre annonce l'attaque jouee et sa cible, et le pied affiche le resultat.",
      "Les deux outils carres (fiole et loupe) forment une colonne devant la grille des talents."
    ]
  },
  {
    "v": "v2.4.59",
    "date": "2026-08-24",
    "title": "Etats en fenetres au-dessus du bandeau, visee sans scintillement, pool centre",
    "changes": [
      "Les etats du combattant selectionne ne sont plus tasses dans la fiche : ils s'affichent en petites fenetres posees juste au-dessus du bandeau, au-dessus de la fiche de l'aventurier. Le survol d'un etat ouvre une bulle qui decrit son effet de jeu (Feu, Gele, Poison, Blindage, Onde, Au sol, Brise, Faille, Affaibli, Garde, Prepare, Invisible, Ciblage).",
      "Fin du scintillement de la visee : le lisere entre le bord d'une zone et une vignette de combattant n'est plus une cible de deplacement. Une zone n'est visable qu'a l'ecart des vignettes (12 px) et pas collee a son propre bord (8 px) — a la souris comme au clic, pour ne pas partir par accident.",
      "Bandeau du bas : le pool de des est centre dans sa boite ; a sa droite viennent le nom de l'aventurier, sa barre de PV avec la DEF, puis sa classe."
    ]
  },
  {
    "v": "v2.4.58",
    "date": "2026-08-24",
    "title": "Pre-Tour automatique, visee plus lisible, bandeau epure et de hauteur fixe",
    "changes": [
      "PRÉ-TOUR : quand un seul pouvoir est disponible (Gardien, Orbe de Preparation Arcanique, mouvement libre), il est arme d'office — il ne reste qu'a cliquer la cible. Quand plusieurs pouvoirs sont en concurrence (identiques ou non, chez un ou plusieurs aventuriers), une fenetre legere demande par quoi commencer ; les suivants s'arment ensuite tout seuls, un a un, jusqu'au dernier. Bouton « Passer le Pre-Tour » toujours accessible.",
      "La fleche de visee couvre desormais TOUTES les actions ciblees, avec une icone parlante : bouclier pour Gardien, fiole pour un objet, loupe pour une analyse, orbe pour les Orbes Partages, epee / arc / sort pour les attaques, empreintes pour un deplacement, interdiction pour un geste impossible. Une cible invalide passe au rouge.",
      "La fleche s'efface au survol d'un autre aventurier, sauf si celui-ci est une cible valide (soutien, soin, Gardien…) : plus de trait qui traverse le groupe sans raison.",
      "Le bandeau du bas garde exactement la meme hauteur en toutes circonstances, quels que soient les etats du combattant, le nombre de des ou les boutons presents.",
      "Boutons Mouvement et Attaque retires du bandeau : viser a la souris suffit. Le bouton d'attaque ne reapparait que s'il y a un vrai choix d'armes. Restent « Se relever » / « Se liberer », et deux boutons carres : fiole (objet) et loupe (analyse)."
    ]
  },
  {
    "v": "v2.4.57",
    "date": "2026-08-24",
    "title": "Fleche de visee fluide et coloree comme le bouton arme, roulage deux fois plus rapide",
    "changes": [
      "La pointe de la fleche suit desormais EXACTEMENT le curseur au lieu de sauter d'une cible a l'autre : le geste est continu. Le trait s'arrete a la base de la pointe, il ne depasse plus dessous.",
      "Couleur de la visee : celle du bouton arme, lue directement sur le bouton (bleu des attaques, violet des Orbes, brun du deplacement…). Sans action armee, bleu vers un adversaire et beige vers une zone. Le ROUGE ne sert plus qu'a l'impossible : barriere infranchissable, action deja depensee, plus de mouvement — avec l'icone d'interdiction. La cible survolee s'illumine de la meme couleur.",
      "Roulage des des deux fois plus rapide (0,5 s au lieu de 1 s, faces qui defilent deux fois plus vite).",
      "Le resultat n'est plus applique a l'ecran avant la fin du roulage : degats, morts, animations et lignes de journal attendent que les des soient poses. Seule la boite de des vit pendant ce temps."
    ]
  },
  {
    "v": "v2.4.56",
    "date": "2026-08-24",
    "title": "Pastille de visee au milieu de la ligne, des du pool agrandis, bonus de degats en rouge",
    "changes": [
      "Pastille d'icone de la fleche de visee : fond blanc creme (le pictogramme ressort au lieu de se fondre dans le brun), cercle nettement plus grand, et surtout posee au MILIEU de la courbe et non plus sur la pointe — elle ne masque plus la fleche ni la cible.",
      "Des du pool nettement agrandis (54 px, chiffres a 1,7 rem) et boite elargie pour aligner une main complete sur une seule ligne.",
      "La phrase « Des en attente du lancer » disparait : les des parlent d'eux-memes.",
      "Le bonus de Degats devient un cartouche ROUGE portant le +X en gros et le mot « degats » en petit, centre dessous."
    ]
  },
  {
    "v": "v2.4.55",
    "date": "2026-08-24",
    "title": "Des du pool en couleurs pleines, fleche rouge si le passage est barre, icones de ciblage",
    "changes": [
      "Les des affiches avant le lancer ont exactement l'aspect qu'ils auront au moment du jet : fond plein de leur couleur, plus de contour en pointilles ni de transparence. Seule la face reste inconnue.",
      "La fleche de deplacement passe au ROUGE quand la zone visee est separee par un mur ou une barriere infranchissable (sauf Teleportation) : la zone s'illumine en rouge et le clic ne tente rien.",
      "Une pastille d'icone se pose sur la pointe de la fleche et annonce le type de ciblage : epee au contact, arc a distance, sort pour un Orbe ou un talent, empreintes de pas pour un deplacement, panneau d'interdiction pour un passage barre. L'icone suit l'attaque reellement armee."
    ]
  },
  {
    "v": "v2.4.54",
    "date": "2026-08-24",
    "title": "Visee a la souris, des du heros toujours visibles, animation du lancer fiable",
    "changes": [
      "VISÉE : on clique un aventurier, on deplace la souris, et une fleche courbe se dessine de sa vignette vers ce que survole le curseur — ROUGE vers un adversaire (attaque) ou une zone visee, BEIGE en pointilles vers une autre zone (deplacement). La cible survolee s'illumine de la meme couleur. Le clic execute directement l'action : plus besoin de passer par le bouton Attaque ou Mouv. (ils restent disponibles). Les regles habituelles s'appliquent (arme jouable, action deja depensee, mouvement disponible, barrieres, opportunites), un clic sur une vignette d'allie continue de le selectionner, et une action deja armee (Orbe, talent, Objet, Analyse) garde la priorite.",
      "Le pool de des affiche EN PERMANENCE les des de l'attaque du combattant selectionne, meme sans lancer : des colores en pointilles a face inconnue, bonus de degats compris, mis a jour des qu'on arme une autre attaque. Les figurines de des disparaissent donc des boutons d'attaque, qui gagnent en lisibilite.",
      "Correctif : on ne voyait pas les des tourner. Le bandeau flottant etait reconstruit a chaque re-rendu du plateau (tres frequent pendant une attaque), ce qui recreait la boite de des et coupait l'animation avant qu'elle soit visible. Le bandeau et le calque de visee sont desormais conserves d'un rendu a l'autre, et le pool n'est redessine que lorsque son contenu change vraiment."
    ]
  },
  {
    "v": "v2.4.53",
    "date": "2026-08-24",
    "title": "Bandeau de combat flottant en bas d'ecran + boite de lancer de des",
    "changes": [
      "Le bandeau d'action quitte le flux du plateau : il est desormais ancre en bas de la fenetre et reste visible pendant tout le defilement du combat. Meme habillage que le reste de l'appli (cadre brun, liseré bronze), le plateau reserve la hauteur necessaire, et les autres elements fixes (bouton de rapport de bug, rose des directions) lui laissent la place.",
      "Nouvelle boite de lancer de des a gauche du bandeau, les boutons d'action a sa droite : elle affiche le dernier jet des sous forme de des colores (une couleur par type de de) portant des CHIFFRES. Les des tournent une seconde en changeant de face, se posent en cascade, puis les marques de resultat apparaissent : 6 souligne en bronze, 1 en rouge, des retires ou arretes par la DEF estompes, bonus de degats en pointilles.",
      "Sous les des : le total de degats ou de soins, les cartouches Critique / Echec et la DEF de la cible — masques tant que les des tournent pour ne pas vendre la meche. L'en-tete rappelle qui frappe, avec quoi, et qui est vise.",
      "Le pool se remplit a chaque attaque et a chaque souffle de zone, ne rejoue son animation que sur un nouveau jet (les re-rendus du plateau sont frequents) et repart vide a chaque nouveau combat."
    ]
  },
  {
    "v": "v2.4.52",
    "date": "2026-08-15",
    "title": "Onglet Versions en Mode MJ : historique complet des mises a jour",
    "changes": [
      "Nouvel onglet « 🗒 Versions » (Mode MJ) : page « Historique des versions » avec la version courante en tete, puis une carte par version — numero, date en clair, badge « version actuelle » sur la plus recente et la liste a puces des modifications poussees.",
      "337 versions referencees, de la v2.10 a aujourd'hui. Affichage par paquets de 25 avec un bouton « Voir les versions precedentes », et une recherche plein texte qui filtre sur le numero, le titre et le detail des changements.",
      "Les donnees viennent de js/versions-data.js, regenere depuis l'historique Git par outils/gen-versions.js (les deux conventions de titre de commit sont reconnues). Aucun acces au stockage local : l'ecran est en lecture seule."
    ]
  },
  {
    "v": "v2.4.51",
    "date": "2026-08-02",
    "title": "Plateau de combat : fin du chevauchement avec le journal",
    "changes": [
      "Les pistes de grille en 1fr ont un min-width implicite de 'auto' : une vignette au contenu large (nom long, pastilles Blindage/Garde/Au sol/Feu) elargissait sa colonne, la zone debordait de son cadre et le plateau passait sous la colonne du journal de combat.",
      "Toutes les pistes sont bornees en minmax(0, 1fr) — grille des zones (inline, generee par zonesGridStyle) comme grilles internes hero-grid et monster-grid — et chaque niveau (zone, conteneur de cartes, carte, en-tete, barre de PV) peut desormais se reduire. Les noms trop longs sont coupes par une ellipse et les cartouches d'etat passent a la ligne au lieu d'elargir la vignette.",
      "Verifie a 1200, 1400, 1600 et 2000 px, en 2 et 4 zones avec barrieres : aucun debordement de colonne, aucune carte hors de sa zone, chevauchement avec le journal nul."
    ]
  },
  {
    "v": "v2.4.50",
    "date": "2026-08-02",
    "title": "Bouton de dialogue lisible + guide : verrouillage narratif et zones de combat",
    "changes": [
      "Bouton de suite du dialogue refait : il etait minuscule, brun sur brun, et son libelle « Suite… » paraissait tronque a cause des points de suspension. Il devient un bouton pleine largeur au liseré bleu de la fenetre de dialogue, libelle « Continuer la discussion », avec un compteur de repliques (1/3) et une fleche.",
      "Guide IA, section 6.8 VERROUILLER LA PROGRESSION : les trois leviers pour imposer l'ordre d'une scene (mandatory / mandatoryNarrative, chainage des blocs, verrouillage de la sortie par targetSceneId ou revealTestId), la regle de conception (si une scene porte l'histoire, la suite doit en dependre), le schema type en trois etapes, et deux garde-fous : tout test commandant une sortie doit etre retentable ou double d'une alternative, et les scenes de simple transition restent ouvertes.",
      "Guide IA, section 5.2 : encadre UTILISE PLUSIEURS ZONES — un combat a une seule zone rend inertes les talents de deplacement, d'opportunite, de charge, de tir et l'etat Gele. 2 zones en standard, 3-4 pour un boss, zones nommees d'apres des lieux reels, repartition des adversaires, heroStart, barrieres signifiantes, avec exemple a 3 zones.",
      "Deux points de checklist ajoutes."
    ]
  },
  {
    "v": "v2.4.49",
    "date": "2026-08-02",
    "title": "Courbe d'XP divisee par 2, ecran de talents de niveau 1, guide de progression",
    "changes": [
      "Table des niveaux divisee par deux : niveau 2 a 50 XP, 3 a 250, 4 a 500, 10 a 7 500, 20 a 100 000. Points de talent et de competence inchanges.",
      "Nouvel ecran 'Choix des Talents de depart — Niveau 1' au lancement d'une aventure avec des aventuriers pre-tires depourvus de talents : reutilise l'ecran de montee de niveau en mode talents seuls (ni caracteristiques ni competences, les valeurs fixees par l'auteur restent intactes). La Maitrise de classe est accordee d'office, le joueur choisit 1 talent par aventurier. L'ecran ne s'affiche qu'une fois par sauvegarde.",
      "Guide IA, nouvelle section 10bis : courbe d'XP complete, budget d'XP a distribuer selon le nombre de montees voulues, detail des trois sources (adversaires, tests selon bareme, scenes comme variable d'ajustement), exemple chiffre pour 2 niveaux, rappel du fonctionnement des talents de depart des pre-tires, et point de checklist dedie."
    ]
  },
  {
    "v": "v2.4.48",
    "date": "2026-08-02",
    "title": "Guide IA : rencontres aleatoires, evenements de passage et zero cul-de-sac",
    "changes": [
      "une rencontre n'est JAMAIS une salle de la carte, c'est une scene isTransition (hors carte, hors rotation, sortie automatique via le bouton Continuer vers ...) ;",
      "donjon structure : table chapter.randomEncounters (chance > 0) + connecteurs randomEnabled, ou eventSceneId pour un evenement scripte ;",
      "donjon aleatoire : meme table, mais le drapeau randomEnabled est porte par les salles ;",
      "chapitre narratif : pas de table, combat pose dans la scene ou bloc fight ;",
      "chaque rencontre ne se declenche qu'une fois par partie ; interdiction de cibler une scene isTransition par entryId / nextSceneId / connecteur."
    ]
  },
  {
    "v": "v2.4.47",
    "date": "2026-08-01",
    "title": "Import des pre-tires plus tolerant + indication a l'ecran de groupe",
    "changes": [
      "L'import d'un bundle accepte aussi les pre-tires ranges sous 'heroes' ou 'adventure.prebuilts' (variantes produites par certaines IA). L'ecran 'Creez votre groupe' explique desormais que les pre-tires apparaissent ici apres re-import d'un fichier qui en contient."
    ]
  },
  {
    "v": "v2.4.46",
    "date": "2026-08-01",
    "title": "Les aventuriers pre-tires apparaissent a la constitution du groupe",
    "changes": [
      "L'ecran Votre groupe (mode Joueur) ne listait que les aventuriers crees pour l'aventure : les pre-tires fournis par un import n'apparaissaient nulle part. Nouvelle section 'Aventuriers Pre-Tires' avec les memes cartes selectionnables ; les choisir les clone au lancement (le modele reste reutilisable), et l'ecran de creation ne s'impose plus quand des pre-tires existent."
    ]
  },
  {
    "v": "v2.4.45",
    "date": "2026-08-01",
    "title": "Aventuriers pre-tires dans les bundles d'aventure + guide",
    "changes": [
      "Le bundle d'aventure accepte un tableau prebuilts[] : les aventuriers pre-tires sont fusionnes a l'import (anti-collision par id), rendus disponibles au lancement via + Aventurier Pre-Construit, traces par sourceAdventureId (re-export dans le bundle, proposes au nettoyage a la suppression de l'aventure).",
      "L'equipement des pre-tires se declare par NOM (equipmentNames : mainD, mainG, armor, object), resolu automatiquement contre l'Armurerie a l'import — l'IA n'a pas besoin de connaitre les ids d'objets locaux.",
      "Guide IA : nouvelle section 8bis obligatoire — 4 pre-tires par aventure (un par classe), regles completes de creation (base VIE 3/ENDU 0/Degats 0 + 3 points + bonus d'espece, 3 points de competences max 2, PV vises 18-30), noms du catalogue d'equipement de base, compositions types par classe, et point de checklist dedie."
    ]
  },
  {
    "v": "v2.4.44",
    "date": "2026-08-01",
    "title": "Guide IA : mise en garde sur le type de scene 'fin'",
    "changes": [
      "Le type 'fin' termine totalement l'aventure : reserve a la toute derniere scene de l'histoire ou a une fin tragique volontaire, jamais a la fin d'un chapitre intermediaire. Ajoute au tableau des types, en encadre dedie et dans la checklist de progression.",
      "Orbes Elementaires : l'etat choisi n'est inflige que si l'Orbe cause des Degats — un Orbe absorbe par la DEF ne pose plus d'etat (message au journal).",
      "Guide IA, quatre renforts issus des retours de jeu : 1) Section RECOMPENSES : le texte ne donne jamais rien — tout gain annonce (or, objet, XP, tresor, Haut Fait, soin) doit etre porte par le champ structure du bloc, avec table de correspondance ; valable pour test, action, ecriture ET dialogue. Rappel que les types de blocs se melangent librement dans une scene. 2) Bareme d'XP obligatoire par difficulte de test (auto 0, facile 1, moyen 2, difficile 5, tres difficile 10, insurmontable 20, impossible 50). 3) Regle de PROGRESSION : chaque scene narrative doit offrir une sortie (nextSceneId / choices / targetSceneId retentable), et la derniere scene d'un chapitre doit pointer vers le chapitre suivant (l'app redirige vers l'entree du donjon automatiquement). Jamais de cul-de-sac. 4) Checklist finale completee : parcours mental de la progression et verification texte/recompenses."
    ]
  },
  {
    "v": "v2.4.43",
    "date": "2026-08-01",
    "title": "Guide IA : tous les exemples alignes sur la regle du prefixe d'ids",
    "changes": [
      "1) Affiliation automatique : les monstres, objets et talents importes via un bundle sont rattaches a leur aventure (adventureId) — filtrables dans le bestiaire, identifiables partout. 2) Anti-collision : un id entrant deja pris par le contenu d'une AUTRE aventure est renomme automatiquement (advId__id), toutes les references du bundle reecrites (monsterId, itemId, advTalentIds, parchEffect). Plus aucun ecrasement silencieux ; le re-import de la meme aventure reste une mise a jour propre sans doublon. 3) Guide IA : regle d'or du prefixe d'ids par aventure (obligatoire), nouveau paragraphe expliquant la fusion a l'import, consigne de ne pas recreer les objets de base, exemple final prefixe. 4) Suppression d'aventure : les contenus affilies devenus orphelins (plus references par aucune autre aventure) sont proposes a la suppression, jamais retires sans confirmation."
    ]
  },
  {
    "v": "v2.4.42",
    "date": "2026-08-01",
    "title": "Guide IA lisible en PDF",
    "changes": [
      "Nouveau bouton 'Guide PDF' dans l'onglet Aventures : le guide GUIDE_IA.md est rendu en version imprimable (titres, tableaux, blocs de code, listes, citations) via un convertisseur Markdown minimal integre, puis ouvert dans la fenetre d'impression pour enregistrement en PDF."
    ]
  },
  {
    "v": "v2.4.41",
    "date": "2026-08-01",
    "title": "Exports complets : JSON par onglet, bundle d'aventure, export global, PDF, guide IA",
    "changes": [
      "1) Export d'aventure COMPLET : nouveau bundle JSON qui embarque l'aventure entiere (chapitres, scenes, tous les blocs — test, action, ecriture, dialogue, combat —, connecteurs, zones, barrieres, rencontres aleatoires) PLUS tout ce qu'elle reference : monstres, talents adverses, objets et talents de parchemin. La collecte parcourt l'arbre JSON entier, aucun champ present ou futur ne peut etre oublie. Reimport fusionnant par id. 2) Export PDF par onglet via fenetre d'impression : aventure (une page par salle avec tous les blocs detailles), bestiaire, armurerie, classes & talents, encyclopedie, aventuriers. 3) Export GLOBAL : toutes les cles amertume_* du localStorage en chaines brutes, restauration integrale sur un autre navigateur (double confirmation avant ecriture). 4) Boutons JSON / Import JSON / PDF dans chaque onglet (Groupe, Bestiaire, Armurerie, Classes, Talents Adv., Encyclopedie, Aventures) + boutons par aventure (bundle + PDF). 5) GUIDE_IA.md : guide exhaustif du format (828 lignes) — bundle, chapitres 3 modes, scenes, tous les blocs, connecteurs, combats, barrieres, monstres, objets, talents avec le catalogue d'effets complet genere depuis l'application — telechargeable via le bouton Guide IA.",
      "Les exports ne modifient JAMAIS le localStorage ; seuls les imports explicitement declenches ecrivent, apres confirmation."
    ]
  },
  {
    "v": "v2.4.40",
    "date": "2026-07-30",
    "title": "Effet Surcouche Elementaire",
    "changes": [
      "Nouvel effet de talent (categorie Etats) : toutes les attaques et talents de la source qui infligent l'etat cumulable choisi (Feu, Gele ou Poison) posent X crans au lieu de 1 (2 par defaut, valeur ou des configurables). Cable sur tous les points d'application : attaques d'armes et de monstres, Orbes Elementaires, Orbes Partages, Assaut Handicapant, Attaques de Zone et Mort Explosive — pour les aventuriers comme pour les adversaires."
    ]
  },
  {
    "v": "v2.4.39",
    "date": "2026-07-30",
    "title": "Choix exclusifs de talents : groupes de branches",
    "changes": [
      "Nouveau champ « Choix exclusif (groupe) » dans l'editeur de talents : les talents portant le meme groupe (ex : Orbes pour Orbes de Feu / de Gel / de Poison) sont des options concurrentes — en prendre une verrouille definitivement les autres. Les talents derives d'une option s'y rattachent par le prerequis existant et se ferment avec elle.",
      "A la creation comme a la montee de niveau, l'exclusivite est explicite : chaque option affiche « Choix definitif — renoncera a : ... » avant d'etre prise, et les options fermees restent visibles, grisees, avec la raison (« exclu par Orbes de Feu ») — jamais retirees en silence. Une etiquette violette rappelle le groupe dans l'onglet Classes et cote joueur."
    ]
  },
  {
    "v": "v2.4.38",
    "date": "2026-07-30",
    "title": "Etoile de Maitrise de depart rendue discrete",
    "changes": [
      "Seule l'etoile de la Maitrise designee reste visible ; les autres sont entierement escamotees et n'apparaissent qu'au survol de leur languette, pour ne plus alourdir la lecture de la liste des talents. Sur ecran tactile, elles restent presentes mais tres attenuees."
    ]
  },
  {
    "v": "v2.4.37",
    "date": "2026-07-30",
    "title": "Maitrise de depart d'une classe designee explicitement",
    "changes": [
      "L'assistant de creation accordait d'office la PREMIERE Maitrise de niveau 1 trouvee, generiques d'abord : le choix dependait de l'ordre de la liste. Une etoile dans l'onglet Classes permet desormais de designer la Maitrise de depart de chaque classe (une seule a la fois). Sans designation, on retombe sur la premiere Maitrise de niveau 1 de la CLASSE, et seulement en dernier recours sur une Maitrise generique."
    ]
  },
  {
    "v": "v2.4.36",
    "date": "2026-07-30",
    "title": "Mystique : couleur amethyste, effets FEU rendus elementaires, correctif creation",
    "changes": [
      "Palette du Mystique passee de l'orange feu du Pyromane a un amethyste pastel, dans le meme registre que les autres classes (fond, liseres, badges, bouton ORBES, avatar, couleurs de journal).",
      "Combustion devient Resonance Elementaire, Embrasement devient Aggravation et Brasier devient Dechainement : chacun recoit un selecteur d'etat et n'est plus verrouille sur le FEU. Aggravation double aussi les degats de Poison.",
      "Correctif : le Mystique reapparait dans la creation d'aventurier. L'assistant proposait uniquement les classes ayant une fiche enregistree ; il liste desormais toutes les classes jouables et complete les fiches manquantes.",
      "Le renommage Pyromane -> Mystique se fait exclusivement a la LECTURE : aucune ecriture ni suppression dans le stockage local. Une fiche de classe ou un aventurier encore enregistres en Pyromane sont lus comme Mystique et gardent leurs talents, PV et couleurs."
    ]
  },
  {
    "v": "v2.4.35",
    "date": "2026-07-30",
    "title": "Le Pyromane devient le Mystique, Orbes Elementaires",
    "changes": [
      "Renomme la classe Pyromane en Mystique partout (listes de classes, description, PV, couleurs CSS) avec migration automatique des aventuriers et des talents de classe deja enregistres.",
      "L'effet de talent 'Pyromane' devient 'Orbes Mystiques' et 'Orbe de Feu' devient 'Orbes Elementaires' : l'etat inflige par les Orbes est desormais au choix (Feu, Gele, Poison, Affaibli, Brise, Faille, Au sol). Le nom de l'attaque suit l'element (2 Orbes de Glace) et Orbes Partages transmet le meme element. Les anciennes cles restent resolues via des alias, avec Feu par defaut."
    ]
  },
  {
    "v": "v2.4.34",
    "date": "2026-07-30",
    "title": "Etats cumulables : Feu N et nouvel etat Gele N",
    "changes": [
      "Feu devient un compteur : Feu N inflige N des noirs en fin de tour, puis perd un cran (les flammes s'eteignent peu a peu). Chaque nouvelle application monte d'un cran.",
      "Nouvel etat Gele N : plus aucun deplacement. Le combattant depense son mouvement pour tenter un test de Force N ; chaque reussite retire un cran, et N reussites le liberent completement. Cable pour les aventuriers (bouton Se liberer) comme pour les adversaires (IA), et propose partout ou un etat peut etre choisi : attaques d'armes et de monstres, talents Attaque/Arme Alterante, Assaut Handicapant, Attaque de Zone, Mort Explosive, Faille Tactique, Immunite, ainsi que les consequences d'echec des blocs de scene."
    ]
  },
  {
    "v": "v2.4.33",
    "date": "2026-07-28",
    "title": "Editeur de donjons : cadrage de la carte conserve, modale de scene ouverte en haut",
    "changes": []
  },
  {
    "v": "v2.4.32",
    "date": "2026-07-28",
    "title": "Blocs Dialogue dans l'editeur de salles",
    "changes": [
      "Nouveau type de bloc en bulles de discussion : plusieurs repliques avec un portrait rond (lien image) et un nom de locuteur, devoilees une a une via un bouton de suite. Une fois le dialogue termine, les choix s'affichent avec exactement les memes consequences qu'un bloc Action : textes de resultat, XP, objets, tresors, hauts faits, effets, passage debloque et chainage vers d'autres blocs."
    ]
  },
  {
    "v": "v2.4.31",
    "date": "2026-07-28",
    "title": "Bestiaire : Attaques/Talents pleine largeur et cartouches lisibles",
    "changes": []
  },
  {
    "v": "v2.4.30",
    "date": "2026-07-28",
    "title": "Bestiaire en colonnes repliables",
    "changes": [
      "Reprend le design des classes/armurerie/talents adv : vignettes nom seul triees en 4 colonnes (sbires, alphas, solitaires, boss), depliables au clic pour afficher PV/DEF/Degats/XP, attaques et talents."
    ]
  },
  {
    "v": "v2.4.29",
    "date": "2026-07-28",
    "title": "de Faille visible, cartouches d'etat lisibles, secousse des blocs de combat",
    "changes": [
      "Le « second de noir » de l'editeur de talents etait le de FAILLE (rose) : il n'avait aucune regle de couleur et retombait sur le fond sombre. Il est desormais rose partout (steppers, badges, mini-des).",
      "Cartouches d'etat des vignettes de combat : fond clair opaque et texte en gras (rouge sombre sur creme pour les etats negatifs, vert sombre sur verdatre pour les positifs).",
      "Un bloc de combat declenche la meme secousse d'ecran + texte flottant « ⚔ Un combat se declenche ! » que les rencontres d'evenement entre deux salles : a sa revelation par un test ou une action, et en arrivant dans une salle qui en contient un pas encore mene."
    ]
  },
  {
    "v": "v2.4.28",
    "date": "2026-07-28",
    "title": "camp vise par defaut selon le groupe du talent",
    "changes": [
      "Un talent cree dans le groupe Adversaires vise par defaut les Aventuriers ; tous les autres groupes visent par defaut les Adversaires. Changer le groupe met a jour le defaut des lignes d'effet dont le camp n'a pas ete fixe a la main ; un choix manuel (ou une valeur enregistree) est toujours conserve."
    ]
  },
  {
    "v": "v2.4.27",
    "date": "2026-07-28",
    "title": "camp vise ABSOLU — Aventuriers / Adversaires / tous les Combattants",
    "changes": [
      "Aventuriers (les gentils), Adversaires (les mechants), Tous les Combattants.",
      "Retro-compat : un talent enregistre avec une ancienne valeur relative garde son comportement (allies = camp du porteur, adversaires = camp oppose) tant qu'il n'est pas re-enregistre ; l'editeur presente alors l'equivalent absolu."
    ]
  },
  {
    "v": "v2.4.26",
    "date": "2026-07-28",
    "title": "variables generalisees sur les effets de talents + editeur reorganise",
    "changes": [
      "Tous les bonus de degats acceptent une valeur fixe OU une expression de des, tiree a CHAQUE coup : Frappe Lourde, Maitre au Contact / a Distance, Tueur au Sol, Achevement, Predateur d'Etat, Meute, Frappe Puissante, Tir Charge.",
      "Epines, Attaque d'Opportunite, Execution : degats parametrables (fixe ou des, 0 = bonus de Degats comme avant — les talents existants sont inchanges).",
      "Epines devient symetrique : un adversaire porteur pique aussi les aventuriers qui arrivent dans sa zone.",
      "Charge Devastatrice : des de degats optionnels a la place du bonus.",
      "Frayeur : X cibles ou toute la zone (la cible cliquee fuit d'abord, puis les autres occupants adverses jusqu'au quota).",
      "Le camp vise (adversaires / allies / tout le monde) est conserve tout au long de la chaine (stockage -> resolution -> moteur).",
      "Parametres d'un effet en grille de champs uniformes : libelle au-dessus de son controle, largeurs alignees, aucun chevauchement, des sur une ligne pleine largeur. Nouveau selecteur « Camp vise ». Option « — Aucun — » lisible pour l'etat facultatif."
    ]
  },
  {
    "v": "v2.4.25",
    "date": "2026-07-28",
    "title": "effets Attaque de Zone et Mort Explosive, camp visé dans l'editeur",
    "changes": [
      "Nouveau selecteur « Camp » dans l'editeur de talents : adversaires / allies / tout le monde, pour les effets de zone.",
      "Attaque de Zone (action) : des au choix (nombre et couleurs), X cibles, toute la zone ou tout le combat, camp visé, etat inflige facultatif, dans SA zone (contact) ou dans une zone choisie au clic (distance). Remplace « Salve de Zone », conservee comme alias : les talents existants sont convertis sans perte et gagnent les nouvelles variables.",
      "Mort Explosive (passif) : meme jeu de variables, declenchee quand le porteur tombe (une seule fois). Le Blindage absorbe le souffle ; la DEF ne s'y oppose pas, comme pour le Feu.",
      "Cuirasse accepte desormais une valeur en des (sa reduction passait deja par le tirage a l'execution)."
    ]
  },
  {
    "v": "v2.4.24",
    "date": "2026-07-28",
    "title": "combat engage — lisibilite conservee, sorties grisees, bloc de combat luisant",
    "changes": [
      "Les blocs de texte, de test et d'action ne sont plus grises : leur contenu reste parfaitement lisible. Seuls leurs CONTROLES (boutons, menus, champs) sont grises, desaturés et desactives.",
      "La rose des acces reste AFFICHEE pendant un combat, sorties desactivees et grisees, avec ⚔ a la place de la fleche et une infobulle explicite — elle disparaissait entierement auparavant. Le passe-droit MJ ne s'applique pas pendant un combat.",
      "Le bloc de combat en attente prend une lueur rouge sourde et pulsee (desactivee si l'utilisateur a demande des animations reduites)."
    ]
  },
  {
    "v": "v2.4.23",
    "date": "2026-07-27",
    "title": "bloc Action sans doublon, nouvelle barriere Instable",
    "changes": [
      "Bloc ACTION : le bandeau n'affiche plus que le nom du bloc quand c'est l'Action 1 qui a ete jouee (son intitule EST le titre du bloc — c'etait un doublon). Une Action 2 distincte reste precisee, sans quoi on ne saurait plus laquelle des deux options a ete choisie.",
      "Nouveau type de barriere « Instable » (nommable, ex. « Sol glissant ») : le passage a toujours lieu, mais il faut reussir un test d'Agilite 1 pour arriver debout — sinon on arrive AU SOL dans la zone visee. « Pieds Surs » (aventurier) et « Agile » (adversaire) traversent sans test. Le tir n'est pas gene.",
      "Au passage : deux verifications d'accessibilite d'une zone appelaient la routine de franchissement, ce qui declenchait un jet d'Agilite parasite ; elles lisent desormais la barriere sans la franchir."
    ]
  },
  {
    "v": "v2.4.22",
    "date": "2026-07-27",
    "title": "mini-carte centree, blocs Action sans verdict, passe-droit MJ sur les acces",
    "changes": [
      "La mini-carte du donjon defile automatiquement pour centrer la salle en cours, a chaque changement de salle (et la carte agrandie s'ouvre deja centree).",
      "Bloc ACTION : choisir l'Action 1 ou 2 n'est ni une reussite ni un echec. Le bandeau affiche le NOM de l'option jouee, dans un encadre neutre (ambre), au lieu de « Reussite » / « Echec ».",
      "Rose des acces, mode MJ : les acces verrouilles restent franchissables et les acces dissimules apparaissent — reperes par 🗝 et 👁, bord violet, nom en italique, infobulle explicite. Le MJ voit aussi le nom des salles inconnues. En partie partagee, rien ne change pour les joueurs : le dissimule reste invisible et le verrouille reste bloque."
    ]
  },
  {
    "v": "v2.4.21",
    "date": "2026-07-27",
    "title": "les tresors supprimes ne reviennent plus",
    "changes": [
      "Meme cause que le soin invisible corrige en v2.4.19 : une modification faite sur `activeSession` etait perdue quand cette reference n'etait plus l'instance presente dans la liste des parties enregistree. La suppression d'un tresor ecrivait donc dans le vide et l'objet reapparaissait au passage suivant.",
      "L'enregistrement reinjecte desormais `activeSession` dans la liste avant d'ecrire, en complement de la re-liaison faite au rechargement."
    ]
  },
  {
    "v": "v2.4.20",
    "date": "2026-07-27",
    "title": "valeur en Or retiree des languettes de tresor",
    "changes": [
      "La languette d'un tresor affiche seulement « Tresor » (et « Objet Rare » pour un objet rare) ; la valeur unitaire passe en infobulle. La somme totale reste affichee en haut, a cote de l'Or du groupe."
    ]
  },
  {
    "v": "v2.4.19",
    "date": "2026-07-27",
    "title": "effet d'objet visible immediatement, cible libre, cases a cocher alignees",
    "changes": [
      "Correction : apres l'usage d'un objet hors combat, la VIE (ou les PV) restaient a l'ancienne valeur jusqu'a un rechargement de page. Recharger les parties laissait `activeSession` pointer sur l'ANCIENNE instance : l'ecriture allait dans la partie rechargee, l'affichage lisait l'ancienne. load() re-lie desormais activeSession a l'instance fraiche de la meme partie.",
      "Editeur d'objet : nouvelle option « Applicable sur tous les Aventuriers ». La vignette propose alors un selecteur de beneficiaire (tout aventurier engage) ; l'objet reste consomme dans l'inventaire de son PORTEUR.",
      "Les cases a cocher des formulaires reviennent a gauche de leur libelle (les etiquettes de formulaire empilent leur intitule au-dessus du champ, ce qui poussait la case au-dessus du texte)."
    ]
  },
  {
    "v": "v2.4.18",
    "date": "2026-07-27",
    "title": "les languettes d'objet des recompenses ouvrent leur descriptif",
    "changes": [
      "Cliquer la vignette d'un objet ou d'un parchemin dans une recompense ouvre sa mini-fenetre de description, comme dans l'inventaire. Le menu du destinataire reste insensible au clic. Le bouton « Utiliser » n'apparait pas : l'objet n'appartient encore a personne."
    ]
  },
  {
    "v": "v2.4.17",
    "date": "2026-07-27",
    "title": "un seul encadre de butin",
    "changes": [
      "L'encadre « 🎁 Decouverte » / « 🎁 Equipement » disparait : les objets trouves rejoignent la case « Butin », avec l'Or et les tresors.",
      "Case Butin : « BUTIN » sans point d'exclamation, halo et reflet en diagonale supprimes (encadre sobre, la couleur doree suffit).",
      "Les objets de recompense reprennent le code couleur et le 📜 des parchemins, comme dans l'inventaire.",
      "Languette de l'objet et menu du destinataire ramenes sur une seule ligne (le menu portait une classe qui n'etait pas dimensionnee et passait a la ligne) ; ils ne se replient qu'en dessous de 560 px de large."
    ]
  },
  {
    "v": "v2.4.16",
    "date": "2026-07-27",
    "title": "objets et parchemins utilisables hors combat",
    "changes": [
      "Editeur d'objet : case « Utilisable hors combat ».",
      "Inventaire du joueur : cliquer l'objet ouvre sa vignette, qui propose alors un bouton « ✨ Utiliser ». Une alerte previent que l'objet est consomme, l'effet s'applique a l'aventurier proprietaire, puis un exemplaire quitte son inventaire (et son emplacement d'equipement s'il n'en reste plus).",
      "Effets applicables hors combat : soin en des de PV, et parchemins portant un talent de soin — PV (Premiers Soins, Convalescence, Second Souffle) ou VIE (Guerison). Les autres effets n'ont pas de sens sans plateau : le bouton n'est pas propose et rien n'est consomme. Idem si l'aventurier est deja au maximum ou n'a aucune VIE perdue : un message l'explique et l'objet est conserve.",
      "Le bouton disparait pendant un combat."
    ]
  },
  {
    "v": "v2.4.15",
    "date": "2026-07-27",
    "title": "nouvel effet de talent Guerison",
    "changes": [
      "Guerison (Action) : l'aventurier recupere X VIE perdue (1 par defaut), sans jamais depasser sa VIE de depart.",
      "La VIE etant une statistique d'AVENTURE — elle se perd au coma et vit dans la sauvegarde, pas dans le combat — l'action ecrit dans la partie en cours via Session.restoreVie. Sans partie (Combat Test), sans VIE perdue, ou pour un aventurier definitivement elimine, l'action n'est pas consommee et un message l'explique."
    ]
  },
  {
    "v": "v2.4.14",
    "date": "2026-07-27",
    "title": "emoji parchemin devant le nom des Parchemins",
    "changes": [
      "Un 📜 precede automatiquement le nom de tout objet porteur d'un effet de Parchemin — pose par le style, donc present partout ou l'objet apparait (armurerie, inventaire, languettes de recompense) et ajoute au titre de sa fiche."
    ]
  },
  {
    "v": "v2.4.13",
    "date": "2026-07-27",
    "title": "les objets Parchemin ont leur propre couleur",
    "changes": [
      "Un objet porteur d'un effet de Parchemin prend un code couleur brun beige au lieu du vert des objets ordinaires, partout ou il apparait : armurerie, inventaire des aventuriers, languettes de recompense et fiche d'objet (dont l'etiquette de categorie affiche « Parchemin »)."
    ]
  },
  {
    "v": "v2.4.12",
    "date": "2026-07-27",
    "title": "valeur en Or des tresors",
    "changes": [
      "Editeur de recompenses : chaque TRESOR recoit un champ « valeur en Or » (par exemplaire). Les Objets Rares n'en ont pas — ils servent a l'aventure et ne se vendent pas ; la ligne affiche « non vendable » a la place du champ.",
      "La valeur suit le tresor jusqu'a l'inventaire : elle est enregistree dans le butin de la partie, rappelee sous le nom du tresor dans l'encadre « Butin ! » et sur sa languette d'inventaire (« Tresor · 35 Or l'unite »).",
      "L'en-tete « Or, Tresors et Objets Rares » affiche en plus la valeur marchande totale des tresors detenus, quantites comprises, hors Objets Rares."
    ]
  },
  {
    "v": "v2.4.11",
    "date": "2026-07-27",
    "title": "bouton « Resultat du Combat » aligne sur les autres",
    "changes": [
      "Dans la barre du haut, il n'heritait d'aucun rayon de bordure (coins carres, seul bouton dans ce cas). Il reprend desormais le gabarit des autres boutons de la barre — coins arrondis a 8 px, meme hauteur et meme padding — et reste mis en avant par la couleur d'accent. Le grand bouton sous le plateau passe au meme gras, pour que les deux se repondent."
    ]
  },
  {
    "v": "v2.4.10",
    "date": "2026-07-27",
    "title": "bulles d'annonce affinees",
    "changes": [
      "Aventurier, attaque d'ARME : « ⚔ Attaque au contact ! » ou « 🏹 Attaque a distance ! », en gris acier — l'arme n'est plus nommee.",
      "Aventurier, ACTION / talent : le nom de l'action, en bleu acier.",
      "Pyromane : « 🔮 Orbes Mystiques », sans le nombre d'orbes, en violet mystique.",
      "Adversaire : inchange (nom de l'attaque, en rouge)."
    ]
  },
  {
    "v": "v2.4.09",
    "date": "2026-07-27",
    "title": "les bulles de combat couvrent plus de situations",
    "changes": [
      "nom de l'attaque ou de l'action jouee — bleu pour un aventurier (⚔), rouge pour un adversaire (☠) ; les actions de talent passent par le meme chemin et sont donc annoncees elles aussi ;",
      "💥 CRITIQUE ! en or ;",
      "💢 Echec critique ! en rouge (et « 🛡 Critique annule ! » quand un talent transforme le critique adverse en echec)."
    ]
  },
  {
    "v": "v2.4.08",
    "date": "2026-07-27",
    "title": "resume du combat dans la barre du haut, « Fuir le Combat »",
    "changes": [
      "Une fois le combat termine, « 📊 Resultat du Combat » apparait aussi dans la barre du haut, en plus du grand bouton sous le plateau.",
      "« Terminer le combat » devient « ⚠️ Fuir le Combat », avec une infobulle qui precise la consequence (les adversaires agissent une derniere fois et le groupe subit les suites d'une defaite) ; les confirmations sont reformulees en consequence."
    ]
  },
  {
    "v": "v2.4.07",
    "date": "2026-07-27",
    "title": "suppression des commandes de phase sous le plateau",
    "changes": [
      "« Activer les adversaires (auto) » et « Fin du tour de combat » etaient d'anciennes commandes manuelles, doublons de la barre du haut : le bouton « Tour des Adversaires » joue deja la sequence adverse ET enchaine sur le tour suivant.",
      "Elles restaient toutefois le seul recours quand la phase adverse restait en plan (rechargement de la page en pleine activation des adversaires, la sequence n'etant pas reprise automatiquement). Ce filet est conserve mais deplace dans la barre du haut, sous la forme d'un unique bouton « Reprendre le Tour → » affiche seulement dans ce cas. Code mort retire (monsterAI), endTurn reutilise."
    ]
  },
  {
    "v": "v2.4.06",
    "date": "2026-07-27",
    "title": "rose des directions plus compacte, avec un titre",
    "changes": [
      "Titre « Salles & Acces » en tete de la rose.",
      "Boutons et cases reduits de 46 a 32 px de haut, gouttieres et marge interieure resserrees : la rose occupe 135 px au lieu de 167, titre compris, et le padding reserve en bas de page suit automatiquement.",
      "Sur mobile, les cibles tactiles restent a 44 px."
    ]
  },
  {
    "v": "v2.4.05",
    "date": "2026-07-27",
    "title": "Double Action effective pour les adversaires, cartouches d'espece lisibles",
    "changes": [
      "L'effet Survitamine / Double Action etait reserve aux aventuriers : useAction ne l'accordait qu'au camp des heros, et la sequence adverse n'activait chaque adversaire qu'une fois. Un adversaire qui porte l'effet est desormais reactive apres que tout le monde a joue, et sa 2e Action redevient disponible a chaque tour.",
      "Regle « pas 2x la meme Action » : cote adversaire, une attaque d'arme ordinaire joue le role de l'Attaque de Base des aventuriers et reste repetable — un adversaire a Double Action peut donc frapper deux fois, ou enchainer deux actions differentes.",
      "Bonus d'espece : les cartouches de competence passent sur fond ivoire avec le texte et la bordure a la couleur de la competence (ils etaient sombres sur sombre, donc illisibles)."
    ]
  },
  {
    "v": "v2.4.04",
    "date": "2026-07-27",
    "title": "bandeau de ciblage retire, blocs de texte enchaines, verrous de suppression, affichage des bonus d'espece",
    "changes": [
      "Le bandeau « Clique un adversaire ou une zone en surbrillance » est supprime : son apparition faisait sauter la page en hauteur. Les zones visables restent surlignees et portent desormais l'explication en infobulle.",
      "Un bloc de TEXTE revele par un test ou une action recoit la fleche de consequence, le decalage et l'animation d'apparition, comme les blocs test.",
      "Suppression d'un aventurier : impossible pendant une aventure en cours (le bouton disparait), et impossible tant qu'il est engage dans une sauvegarde active (bouton desactive, infobulle nommant la sauvegarde, garde-fou aussi a l'action). L'ecran de selection du groupe applique la meme regle.",
      "La liste des sauvegardes indique les aventuriers engages dans chaque partie.",
      "Choix de l'espece : les bonus de competence passent sous les bonus de caracteristique, apres une ligne d'espace, en cartouches a la couleur de la competence.",
      "Etape Competences : plus de cartouche « +1 espece » (il decalait les boutons) ; la valeur affichee est directement le total, en orange quand l'espece y contribue. Largeur de rangee identique pour toutes les competences."
    ]
  },
  {
    "v": "v2.4.03",
    "date": "2026-07-27",
    "title": "adversaire introuvable entre deux fenetres, et jonction propre des barrieres",
    "changes": [
      "L'etat du jeu n'est lu qu'au chargement de la page. Une fiche creee dans une AUTRE fenetre (bestiaire ouvert a cote de la partie) n'existait donc pas pour la fenetre de jeu, quel que soit le contenu du stockage. Store.findMonster relit desormais le stockage quand une recherche echoue et rapatrie la fiche.",
      "La comparaison par nom ignore accents, casse, ponctuation et espaces (y compris insecables), pour survivre a un copier-coller ou a un renommage cosmetique.",
      "Chaque barriere deborde jusqu'au centre de la grille : deux barrieres perpendiculaires forment un angle plein et se lisent comme une seule ligne qui entoure la zone. Le libelle reste centre sur la portion visible entre les deux zones.",
      "La diagonale devient un court segment qui comble le carrefour, passe sous les barrieres droites et ne depasse plus en moignons ; son nom passe en infobulle.",
      "Applique a l'apercu de disposition comme au plateau de combat, sans debordement."
    ]
  },
  {
    "v": "v2.4.02",
    "date": "2026-07-27",
    "title": "bonus de competence de depart par espece",
    "changes": [
      "Humain +1 Perception / +1 Savoir · Elfe +1 Agilite / +1 Mysticisme · Goliath +1 Force / +1 Robustesse · Nain +1 Robustesse / +1 Technique.",
      "Ces bonus s'AJOUTENT aux points repartis par le joueur : un +2 Force choisi sur un Goliath donne bien +3 au total. Ils apparaissent des le choix de l'espece (une ligne par bonus, a la couleur de la competence), sont rappeles a l'etape Caracteristiques, et l'etape Competences affiche pour chaque ligne concernee le bonus d'espece et le total resultant."
    ]
  },
  {
    "v": "v2.4.01",
    "date": "2026-07-27",
    "title": "adversaire manquant dans un bloc de combat — resolution tolerante et alerte explicite",
    "changes": [
      "Resolution partagee id -> nom pour l'apercu, le decompte et le combat impose.",
      "Une reference vraiment introuvable est desormais signalee : vignette rouge, message nommant l'adversaire manquant, et bouton de lancement desactive au lieu d'un combat vide."
    ]
  },
  {
    "v": "v2.4.00",
    "date": "2026-07-27",
    "title": "genre et espece sur leur propre ligne, selecteur de talents adverses en deux lignes",
    "changes": [
      "Onglet Groupe : les pastilles genre / espece quittent la ligne du nom et de la classe, qui debordait, et occupent une ligne dediee juste en dessous.",
      "Editeur de monstre, talents adverses : case a cocher a gauche du titre, et une seule ligne de description en dessous, tronquee par « … » (intitule et description complets en infobulle). Hauteur de ligne uniforme."
    ]
  },
  {
    "v": "v2.3.99",
    "date": "2026-07-27",
    "title": "Regeneration devient un soin de fin de tour, commun aux deux camps",
    "changes": [
      "L'effet existait deja dans la bibliotheque mais s'appliquait au DEBUT du tour des aventuriers, et aux aventuriers seulement. Il est desormais applique en fin de tour a tous les combattants qui le portent, adversaires compris, sur tous les chemins de fin de tour. La valeur accepte un nombre ou une expression de des (« 1d6 »), tiree a chaque tour, et le soin est plafonne aux PV maximum."
    ]
  },
  {
    "v": "v2.3.98",
    "date": "2026-07-26",
    "title": "pastille de localisation a gauche du nom, balayage directionnel entre salles",
    "changes": [
      "Rose des directions : la pastille 📍 passe a gauche du nom de la salle courante, sur la meme ligne.",
      "Deplacement depuis la rose : le contenu de la salle glisse dans le sens inverse du trajet, la nouvelle salle arrive du cote vise (8 directions). Animation uniquement en transform + opacity, appliquee au seul conteneur de contenu — la rose et le bandeau ne bougent pas, aucun recalcul de mise en page. La navigation part meme si l'animation n'aboutit pas, et prefers-reduced-motion la desactive."
    ]
  },
  {
    "v": "v2.3.97",
    "date": "2026-07-26",
    "title": "plus de de devant les boutons des blocs Action",
    "changes": [
      "Le de venait d'une regle CSS (`.ses-choice-btn.skill-test::before`) appliquee a tous les boutons portant la classe skill-test, y compris ceux des blocs Action qui la partagent pour la mise en page. La regle exclut desormais les boutons d'action et les boutons sans jet (difficulte « Automatique », classe `ses-noroll` posee a la construction du bouton)."
    ]
  },
  {
    "v": "v2.3.96",
    "date": "2026-07-26",
    "title": "l'attaque au contact sur une zone engage le deplacement, meme sans cible",
    "changes": [
      "Frapper une zone au contact deplace l'aventurier dans cette zone y compris quand elle ne contient personne — pas seulement quand la fouille d'une cible invisible echoue. Les attaques d'opportunite du depart s'appliquent normalement, et l'attaque reste consommee."
    ]
  },
  {
    "v": "v2.3.95",
    "date": "2026-07-26",
    "title": "le de ne s'affiche que lorsqu'un jet est reellement effectue",
    "changes": [
      "Regle centralisee (helper diceTag) appliquee a toutes les vignettes de testeur et cartouches de competence : pas de 🎲 pour un bloc Action, ni pour une difficulte « Automatique » qui ne lance aucun de. Le marqueur « au hasard » de la designation aleatoire perd aussi son de : c'est une designation, pas un jet."
    ]
  },
  {
    "v": "v2.3.94",
    "date": "2026-07-26",
    "title": "deplacement au contact sur cible invisible, salle gelee par un bloc de combat, emoji decoratifs retires",
    "changes": [
      "Attaque au CONTACT visant une zone abritant une cible invisible : l'aventurier se deplace dans la zone meme quand le test de Perception echoue (il va bien au corps a corps), et l'attaque reste consommee.",
      "Un bloc de combat revele et pas encore mene met la salle en pause : la rose des acces ne propose plus de sortie et les autres tests / actions sont grises, jusqu'a l'issue du combat.",
      "Suppression des pictogrammes decoratifs devant les noms de salles et les intitules / boutons de blocs (le tag « Salle x/N », l'eclair des blocs Action, la loupe des blocs Test). Les des restent la ou un jet est reellement effectue : cartouches de competence des tests."
    ]
  },
  {
    "v": "v2.3.93",
    "date": "2026-07-26",
    "title": "les blocs de combat affichent la disposition avant de commencer",
    "changes": [
      "L'apercu de disposition (zones, placement des combattants, barrieres) est extrait de renderCombatScene dans une fonction partagee combatPreviewHtml, et les blocs de combat l'affichent desormais comme n'importe quel autre combat, avec la meme mention « vous ne pouvez pas changer votre position de depart »."
    ]
  },
  {
    "v": "v2.3.92",
    "date": "2026-07-26",
    "title": "couleurs de bord retrouvees dans la rose des sorties",
    "changes": [
      "Bord vert (#6aab6a) pour les salles deja explorees, brun (#8a6d4a) pour celles qui ne le sont pas — les couleurs de l'ancien bloc « Sorties & acces ». Le liseret vert en ombre interieure est remplace par un vrai bord de 2 px."
    ]
  },
  {
    "v": "v2.3.91",
    "date": "2026-07-26",
    "title": "l'editeur de combat manquait dans les blocs de combat",
    "changes": [
      "Le rendu de l'editeur de zones etait place dans une boucle filtrant les blocs de test (`if (blk.type !== 'test') return;`), donc jamais atteint pour un bloc de combat : le conteneur restait vide. Il est desormais traite avant ce filtre."
    ]
  },
  {
    "v": "v2.3.90",
    "date": "2026-07-26",
    "title": "rose des directions alignee sur les blocs de texte, cases vides invisibles, sorties sur une ligne",
    "changes": [
      "La grille et les boutons de la rose ont exactement la largeur des blocs de texte de la salle (calage sur la boite de contenu de la carte de scene, le cadre debordant de sa propre marge interieure).",
      "Les cases sans sortie (salle inexistante ou passage encore dissimule) n'ont plus aucun contour : la place reste reservee, mais rien ne s'affiche.",
      "Fleche de direction et nom de salle sur une seule ligne, nom tronque par « … » ; le libelle du connecteur passe en infobulle."
    ]
  },
  {
    "v": "v2.3.89",
    "date": "2026-07-26",
    "title": "blocs de combat jouables et chainage vers tout type de bloc",
    "changes": [
      "Nouveau « + Bloc Combat » dans l'editeur de salle : un combat pose dans le fil de la salle, avec son intitule, son texte de mise en scene, ses zones et ses adversaires (meme editeur de combat que partout ailleurs), un texte de consequence en cas de victoire et un autre en cas de defaite.",
      "Un bloc test ou action peut reveler un bloc de combat, et le bloc de combat revele a son tour d'autres blocs selon la victoire ou la defaite : les embranchements peuvent donc repartir apres un combat.",
      "Le selecteur « Bloc revele si … » accepte desormais TOUS les types de blocs (texte, test, action, combat), avec une icone par type ; un bloc de texte chaine reste masque tant que son issue n'est pas survenue et beneficie de l'animation de revelation.",
      "L'issue d'un bloc de combat revient au bloc : elle ne « nettoie » pas la salle et ne declenche pas les scenes de suite / de defaite de la salle."
    ]
  },
  {
    "v": "v2.3.88",
    "date": "2026-07-26",
    "title": "rose des directions fixe, genre et espece sur l'onglet Groupe, pliage global de l'editeur de scene",
    "changes": [
      "Le bloc « Sorties & acces » est remplace par une rose des directions : grille 3x3 invariable (salle courante au centre, 8 directions autour), barre fixe en bas d'ecran centree sous la colonne principale, padding-bas reserve pour ne jamais recouvrir le contenu. Cases sans sortie discretes et non cliquables, fleche + nom de salle sur chaque sortie, navigation et verrous inchanges, remontee automatique en haut de page apres un deplacement. Sur mobile la rose occupe presque toute la largeur avec des boutons de 44 px minimum.",
      "Survoler une sortie surligne la salle de destination sur la carte laterale.",
      "Onglet Groupe : genre et espece affiches en pastilles, bonus d'espece en infobulle.",
      "Editeur de scene : case « Tout enrouler », numero de chaque bloc, et clic sur le bandeau d'un bloc pour le plier / deplier."
    ]
  },
  {
    "v": "v2.3.87",
    "date": "2026-07-26",
    "title": "salle utilisable pendant un combat impose, attaque dans le vide consommee, liste fixe des blocs reveles",
    "changes": [
      "Un combat declenche par un test ou une action n'escamote plus la salle : l'encadre « Combat impose » s'affiche en tete et le reste de la salle reste cliquable (tests, actions, recompenses). Seule la progression vers une autre salle demeure verrouillee tant que le combat n'est pas mene.",
      "Frapper une zone sans adversaire consomme desormais l'attaque / l'action, comme une fouille ratee contre une cible invisible.",
      "Editeur de salle, « Bloc revele si … » : liste fixe (plus de defilement), case a cocher a gauche, une seule ligne par bloc avec troncature par « … » et intitule complet en infobulle."
    ]
  },
  {
    "v": "v2.3.86",
    "date": "2026-07-26",
    "title": "couleurs des bonus d'espece, sauvegarde courante persistee, badge NEW en superposition, nom bleu en combat",
    "changes": [
      "Assistant de creation : chaque bonus d'espece reprend la couleur habituelle de sa caracteristique (VIE violet, PV vert, ENDU turquoise, Degats rouge)",
      "Sauvegardes : la partie en cours est memorisee (amertume_current_session_v1) ; un rafraichissement ou un changement d'onglet reprend la meme sauvegarde",
      "Badge NEW : superpose dans l'angle superieur gauche de la languette, et limite aux exemplaires reellement acquis par l'aventurier concerne",
      "Test de competence : suppression du caractere etoile a droite du meilleur",
      "Combat : nom de l'aventurier en bleu Action tant que son action/attaque n'est pas consommee (vignette de zone et bandeau)",
      "Le bloc « Un combat se declenche ! » disparait une fois le combat mene"
    ]
  },
  {
    "v": "v2.3.85",
    "date": "2026-07-26",
    "title": "retour a la ligne Prepare, historique de combat chronologique, animation Blindage, demi-tour autorise malgre un test obligatoire",
    "changes": [
      "Recompense « Prepare » : saut de ligne avant le detail (+1 Action ou +1 Mouvement)",
      "Historique de combat inverse (les dernieres lignes s'affichent en bas, scroll auto)",
      "Blindage absorbant une attaque : eclat metallique « tschiing » + texte BLINDAGE !",
      "Un test obligatoire ne bloque plus le demi-tour, sauf s'il est marque Narratif (nouvelle case « Narratif » dans l'editeur de bloc de test)"
    ]
  },
  {
    "v": "v2.3.84",
    "date": "2026-07-26",
    "title": "joystick des sorties ramené dans la colonne principale, centré sous les blocs de la scène ; bonus d'espèce multiples sur des lignes séparées (Elfe) ; suppression de « (vous pouvez ajuster avant de valider) » ; compétences remises en languettes colorées de taille uniforme avec la description placée sous la languette",
    "changes": []
  },
  {
    "v": "v2.3.83",
    "date": "2026-07-26",
    "title": "accords genrés branchés sur les formulations existantes — pronoms il/lui (homme), elle/elle (femme), on (autre) ; le genre est porté par le combattant en combat et applique les accords aux messages du journal (touché·e, vaincu·e, démasqué·e, terrifié·e, perte d'invisibilité, dernière VIE, attaque d'opportunité, cible Proie), au badge Mort de la fiche, au coma des tests et au texte de l'assistant",
    "changes": []
  },
  {
    "v": "v2.3.82",
    "date": "2026-07-26",
    "title": "sauvegardes renommables ; assistant de création — texte d'intro, champ Genre (Femme/Homme/Autre) avec helpers d'accord exposés, champ Espèce (Humain VIE+1 / Nain PV+8 / Goliath Dégâts+2 / Elfe ENDU+1 Dégâts+1) appliqué aux caractéristiques et à la formule de PV, descriptions Destructeur et Gardien, vouvoiement et retours à la ligne sur toutes les étapes, infos dés/défense en Équipement, descriptions de talents dépliées d'office (clic = sélection), description d'usage par compétence",
    "changes": []
  },
  {
    "v": "v2.3.81",
    "date": "2026-07-26",
    "title": "joystick des sorties déplacé dans la colonne de droite, sous la carte du donjon (modes structuré et aléatoire) — boutons compactés sur deux lignes avec noms tronqués pour tenir dans les 280px sans élargir la colonne, structure HAUT / GAUCHE-DROITE / BAS conservée",
    "changes": []
  },
  {
    "v": "v2.3.80",
    "date": "2026-07-26",
    "title": "« Blocs révélés si … » — un test ou une action peut révéler PLUSIEURS blocs par issue (réussite / échec, Action 1 / Action 2), via des cases à cocher dans l'éditeur ; ancien format mono-bloc toujours lu, report des ids à la duplication de scène",
    "changes": []
  },
  {
    "v": "v2.3.79",
    "date": "2026-07-26",
    "title": "tout dégât subi dissipe l'état Invisible (aventuriers comme adversaires, sur les 10 points d'application de dégâts) — le combattant redevient visible et ciblable, avec message journal et toast ; le déplacement d'un adversaire invisible ne révèle plus sa zone (« Vous sentez un mouvement non loin de vous… ») y compris sur les lignes fusionnées déplacement+attaque",
    "changes": []
  },
  {
    "v": "v2.3.78",
    "date": "2026-07-26",
    "title": "messages flottants du combat mis en file et affichés APRÈS le rendu (ils étaient effacés aussitôt) — « Adversaire Invisible ! », « Attaque dans le vide ! », « Adversaire Introuvable », « Démasqué ! » ; zones visables mises en surbrillance pendant un ciblage + barre d'aide au ciblage ; 4 comportements d'adversaire supplémentaires (Attaque / Action 1 / 2 / 3 en priorité)",
    "changes": []
  },
  {
    "v": "v2.3.77",
    "date": "2026-07-26",
    "title": "gestionnaire de comportements par adversaire (fiche du bestiaire) — liste ordonnée et cumulable de règles de déplacement appliquées en combat (bouge chaque tour, immobile, fuit les zones occupées vers une zone vide, rejoint la zone la plus/moins peuplée), la première applicable l'emporte ; indépendant de la Menace",
    "changes": []
  },
  {
    "v": "v2.3.76",
    "date": "2026-07-26",
    "title": "trois effets de talent partagés aventuriers/adversaires — Invisibilité (nouvel état : non ciblable, masqué du terrain adverse, atteignable en visant la zone avec un test de Perception 2, alertes flottante et journal), Frayeur (action : la cible de la zone fuit et subit les attaques d'opportunité), Attaque d'Opportunité (passif) ; attaque possible en visant une ZONE (frappe le premier adversaire, mouvement au contact inclus)",
    "changes": []
  },
  {
    "v": "v2.3.75",
    "date": "2026-07-25",
    "title": "sorties du donjon en disposition « joystick » (grille 3×3 directionnelle : haut au centre-haut, gauche/droite au milieu, bas au centre-bas, diagonales aux coins) ; titre + compétence/difficulté des boutons de test sur une seule ligne",
    "changes": []
  },
  {
    "v": "v2.3.74",
    "date": "2026-07-25",
    "title": "animation de révélation des blocs débloqués par un test ; trait pointillé des blocs enchaînés supprimé (flèche ↳ conservée) ; dégâts de test létaux → coma (perte 1 VIE, réussite automatique du test, réanimation à 50 % des PV, élimination sur dernière VIE) ; tests de GROUPE à 2 compétences répartissables aventurier par aventurier (bascule ⇄, défaut = meilleure compétence, re-répartition possible avant chaque relance)",
    "changes": []
  },
  {
    "v": "v2.3.73",
    "date": "2026-07-25",
    "title": "désignation « meilleur aventurier » stabilisée par test (les ex æquo ne sont tirés qu'une fois — changer un menu ne déplace plus les testeurs des autres tests) ; vignette du choix de testeur sur une ligne, fond parchemin clair, nom en gras",
    "changes": []
  },
  {
    "v": "v2.3.72",
    "date": "2026-07-25",
    "title": "« Meilleur aventurier » toujours modifiable par le joueur (menu déroulant, meilleur marqué ★ ; Aléatoire/Groupe/Concernés restent figés) ; « 🔄 Salle » purge désormais TOUT l'état de la scène, visites précédentes incluses (tests, chaînes, combat nettoyé, récompenses, hauts faits, rencontres) — la salle se rejoue comme à la première entrée",
    "changes": []
  },
  {
    "v": "v2.3.71",
    "date": "2026-07-25",
    "title": "tests de compétence — 5e option « 🙋 Au choix du joueur » (menu déroulant d'aventuriers dans la vignette du test) ; bouton MJ « 🔄 Salle » qui restaure intégralement la salle courante (tests, combats, butin, XP, PV, hauts faits) via une photo d'entrée de salle — absent de la version partagée",
    "changes": []
  },
  {
    "v": "v2.3.70",
    "date": "2026-07-23",
    "title": "dés du bandeau Pyromane remontés à 18px (taille maximale vérifiée sans débordement, fenêtres étroites incluses)",
    "changes": []
  },
  {
    "v": "v2.3.69",
    "date": "2026-07-22",
    "title": "bandeau Pyromane — libellés de talents sur 2 lignes max (« Orbes Renforcés » ne déborde plus), dés de dégâts et icône d'attaque réduits sur la carte à Orbes pour tenir sur la ligne du bouton ; tailles standard inchangées pour les autres classes",
    "changes": []
  },
  {
    "v": "v2.3.68",
    "date": "2026-07-22",
    "title": "bouton ORBES exactement à la hauteur de la grille d'actions (2×40px + gouttière), bords haut et bas alignés au pixel",
    "changes": []
  },
  {
    "v": "v2.3.67",
    "date": "2026-07-22",
    "title": "vignettes de zone sans pastille d'initiale devant les noms (toute la largeur au nom/PV) ; bouton ORBES calé exactement sur la hauteur de la grille de boutons du bandeau",
    "changes": []
  },
  {
    "v": "v2.3.66",
    "date": "2026-07-22",
    "title": "le halo pulsé des boutons activables du bandeau n'est plus rogné (fin des lignes scintillantes au survol) — overflow visible, colonnes resserrées sur écran étroit",
    "changes": []
  },
  {
    "v": "v2.3.65",
    "date": "2026-07-22",
    "title": "badge « NEW » sur les équipements arrivés dans l'inventaire depuis la dernière visite de l'onglet (affiché une seule visite) ; encadré « ✨ Butin ! » compacté et espacé du bouton Continuer",
    "changes": []
  },
  {
    "v": "v2.3.64",
    "date": "2026-07-22",
    "title": "toutes les vignettes de combattants (aventuriers ET adversaires, y compris grands socles) font strictement la même largeur — grille demi-largeur commune, les grands socles se distinguent par la hauteur",
    "changes": []
  },
  {
    "v": "v2.3.63",
    "date": "2026-07-22",
    "title": "barre de PV du bandeau ré-élargie (+20 %, texte des PV réduit pour tenir), icônes de dés agrandies à 22px ; récompenses « à l'issue du combat » également retenues tant qu'un test obligatoire n'est pas résolu (elles ne s'affichent plus à l'arrivée dans la scène)",
    "changes": []
  },
  {
    "v": "v2.3.62",
    "date": "2026-07-22",
    "title": "bandeau — barre de PV raccourcie de 40 % (Pyromane inchangé), boutons élargis d'autant, icônes de dés/type ré-agrandies (19px), « Analyse » tient dans son bouton ; espaces entre zones réduits (gouttière fine sans barrière)",
    "changes": []
  },
  {
    "v": "v2.3.61",
    "date": "2026-07-22",
    "title": "bandeau de combat — libellés des boutons sur 2 lignes max (plus de débordement), icônes de dés et de type réduites (5+ icônes tiennent dans le bouton d'attaque) ; vignettes sans espace réservé quand aucun état ; zones vides compactes (rangées dimensionnées au contenu)",
    "changes": []
  },
  {
    "v": "v2.3.60",
    "date": "2026-07-22",
    "title": "ajustements du module de combat — journal à taille fixe (300px, ne grandit plus), textes du journal condensés, avatar retiré du bandeau d'action, boutons du bandeau à largeur minimale lisible et polices réajustées, vignettes de zone moins hautes (ligne d'états conservée)",
    "changes": []
  },
  {
    "v": "v2.3.59",
    "date": "2026-07-22",
    "title": "œil pour masquer/réafficher chaque aventure et Grande Aventure sur l'écran d'accueil ; journal de combat déplacé dans une colonne à droite du plateau (330px, collée au défilement), repassant en bandeau compact au-dessus sur écran étroit — proportions des zones inchangées",
    "changes": []
  },
  {
    "v": "v2.3.58",
    "date": "2026-07-22",
    "title": "bouton « ✉ Envoyer par e-mail » dans la liste des bugs (mailto pré-rempli avec le rapport complet, troncature au-delà de la limite des liens mailto)",
    "changes": []
  },
  {
    "v": "v2.3.57",
    "date": "2026-07-22",
    "title": "rapports de bug — capture des fenêtres flottantes ouvertes (modales, avec contenu clé : talent édité + effets) et données techniques compactées au format diagnostic",
    "changes": []
  },
  {
    "v": "v2.3.56",
    "date": "2026-07-22",
    "title": "défaite sur un événement de passage → l'aventure continue vers la salle de destination (événement consommé, combat non relancé) ; valeurs de soin en dés (1d6) pour Premiers Soins/Second Souffle/Convalescence/Régénération/Réanimation ; vignettes de combat à hauteur normalisée (nom sur une ligne) ; noms de monstres résolus dans les rapports de bug",
    "changes": []
  },
  {
    "v": "v2.3.55",
    "date": "2026-07-22",
    "title": "rapports de bug enrichis — position exacte (chapitre/scène), contenu de la scène (tests, écriture, combats, sorties), état du combat en cours et dernières erreurs JS jointes automatiquement",
    "changes": []
  },
  {
    "v": "v2.3.54",
    "date": "2026-07-21",
    "title": "refonte de la bibliothèque d'effets de talent (12 catégories, descriptions normalisées, doublons fusionnés par alias, 4 nouveaux effets câblés) + sélecteur d'effet structuré avec recherche dans l'éditeur de talents",
    "changes": []
  },
  {
    "v": "v2.3.53",
    "date": "2026-07-21",
    "title": "onglet de suivi des bugs accessible aussi en mode Joueur (copie/suppression/partage)",
    "changes": []
  },
  {
    "v": "v2.3.52",
    "date": "2026-07-21",
    "title": "bouton flottant de signalement de bug (toutes pages) + page MJ/Admin de suivi des bugs (copie/suppression)",
    "changes": []
  },
  {
    "v": "v2.3.51",
    "date": "2026-07-12",
    "title": "lignes du tableau de rencontres aléatoires colorées par type + emoji dé sur les connecteurs aléatoires du plan",
    "changes": []
  },
  {
    "v": "v2.3.50",
    "date": "2026-07-11",
    "title": "Rencontres aléatoires : chaque rencontre au plus une fois par partie",
    "changes": [
      "Une rencontre aléatoire déjà survenue ne se reproduit JAMAIS dans la même partie (suivi par ses.usedRandomEncounters).",
      "Si le jet tombe sur la tranche d'une rencontre déjà vue, on redirige vers une rencontre ENCORE DISPONIBLE (au hasard, pondérée) : la probabilité globale qu'un événement survienne (~10-15%) reste donc identique tant qu'il en reste.",
      "Vérifié par simulation : 10 rencontres à 1% → 0 répétition, ~10% par passage."
    ]
  },
  {
    "v": "v2.3.49",
    "date": "2026-07-11",
    "title": "Rencontres aléatoires : tirage unique, % = probabilité de la rencontre précise",
    "changes": [
      "Un SEUL jet par passage : chaque entrée occupe une tranche = sa chance (%). Le % est exactement la probabilité que CETTE rencontre survienne. Au plus une rencontre se déclenche (jamais deux simultanément). « Aucun événement » = 100 − somme des %. Ex. 5 % + 7 % → 5 % / 7 % / 88 % rien (vérifié par simulation).",
      "Indicateur de total dans l'éditeur : « X% qu'une rencontre survienne · Y% aucun », avec avertissement si la somme dépasse 100 %."
    ]
  },
  {
    "v": "v2.3.48",
    "date": "2026-07-11",
    "title": "Rencontres aléatoires : rencontres SPÉCIFIQUES créées à la volée",
    "changes": [
      "Le tableau de rencontres aléatoires du chapitre ne référence plus des scènes existantes : « + Nouvelle rencontre » CRÉE une rencontre dédiée (scène d'événement propre au tableau, hors rotation/navigation) et ouvre directement son éditeur de scène complet (texte, combat, tests, récompenses…).",
      "Chaque ligne : nom éditable + « ✎ Éditer » (menu de scène) + % + suppression (retire aussi la scène dédiée).",
      "Ces rencontres n'apparaissent QUE dans le tableau aléatoire ; elles se déclenchent sur les connecteurs cochés « 🎲 » (structuré) ou en quittant une salle sujette (aléatoire)."
    ]
  },
  {
    "v": "v2.3.47",
    "date": "2026-07-11",
    "title": "Rencontres aléatoires : case par connecteur + tableau unique du chapitre",
    "changes": [
      "Chaque connecteur (liste « Connecteurs » de la carte du donjon, et section « Connecteurs de la salle » de l'éditeur de scène) porte une simple case « 🎲 Aléatoire ».",
      "Un TABLEAU UNIQUE par chapitre (« 🎲 Rencontres aléatoires du chapitre »), affiché sous la liste des connecteurs : liste de rencontres nommées (scènes d'événement) avec un % chacune.",
      "En jeu : à chaque passage sur un connecteur coché, une chance (par entrée) de dérouter vers l'une des rencontres du tableau du chapitre (animation de secousse rouge).",
      "Donjon aléatoire : même tableau de chapitre, avec une case « sujette aux rencontres » par salle (éditable dans la fenêtre de scène, faute de carte)."
    ]
  },
  {
    "v": "v2.3.46",
    "date": "2026-07-11",
    "title": "Rencontres aléatoires accessibles en donjon aléatoire + scènes d'événement",
    "changes": [
      "Donjon ALÉATOIRE : le tableau de rencontres aléatoires n'était accessible que sur les connecteurs (donjons structurés). Ajout d'une section « 🎲 Rencontres aléatoires » dans l'éditeur de scène pour les donjons aléatoires : une chance (%) de dérouter vers un événement à chaque passage vers la salle suivante.",
      "Nouvelle case « ⚡ Scène d'événement » (visible en donjon aléatoire) : marque une scène comme événement hors rotation des salles, utilisable comme rencontre aléatoire.",
      "Rappel : en donjon STRUCTURÉ, la case « 🎲 Rencontres aléatoires » est déjà présente sous chaque connecteur (section « Connecteurs de la salle » de l'éditeur de scène, ouvert depuis la carte du donjon)."
    ]
  },
  {
    "v": "v2.3.45",
    "date": "2026-07-11",
    "title": "Soin ciblé, animation de rencontre, rencontres aléatoires, récompenses tirées affichées",
    "changes": [
      "Écran de fin de combat : on ne soigne (et n'affiche) que les aventuriers auxquels il manque des PV ; ceux au maximum restent « Actifs » sans ligne de soin.",
      "Événement de connecteur (donjon structuré/aléatoire) : petite animation de « rencontre » (secousse d'écran + flash rouge d'alerte « ⚠ Événement ! »).",
      "Rencontres aléatoires par connecteur : case « 🎲 Rencontres aléatoires » + tableau d'événements avec un % de déclenchement par passage (une entrée touchée déroute vers sa scène d'événement, rejouable à chaque traversée).",
      "Récompenses/butin en dés (ex. « 3d12 ») : les aventuriers voient désormais le RÉSULTAT tiré (« +11 Or », « ×4 »), tiré une seule fois et cohérent avec ce qui est effectivement remis (Or, trésors, objets — scènes et tests)."
    ]
  },
  {
    "v": "v2.3.44",
    "date": "2026-07-07",
    "title": "Objet Rare utilisable après échec + fix combat sans adversaire",
    "changes": [
      "Objet Rare : le bouton de résolution automatique apparaît DÉSORMAIS aussi après un échec (même si le test n'est pas retentable, ou après un retour dans la salle). Typiquement : trouver la clé APRÈS avoir échoué à ouvrir la porte permet de la déverrouiller ensuite.",
      "Fix : un combat déclenché par un test n'affichait aucun adversaire quand l'id du monstre référencé ne correspondait plus (partage / import / duplication / recréation d'un adversaire). Les références de combat mémorisent maintenant AUSSI le nom de l'adversaire et le combat le retrouve par son nom à défaut d'id (avertissement en console si introuvable)."
    ]
  },
  {
    "v": "v2.3.43",
    "date": "2026-07-07",
    "title": "Nouveau bloc Écriture (énigme / mot de passe)",
    "changes": [
      "Nouveau bloc « ✍️ Écriture » dans l'éditeur de scènes (à côté de Texte / Test / Action).",
      "Champs : description (énigme), consigne (défaut « Écrivez exactement 1 mot »), mot(s) attendu(s), textes de réussite et d'échec. Fonctionne comme un bloc Test (récompenses, effets, chaînage, obligatoire) mais la réussite dépend du mot écrit.",
      "En jeu : un champ de saisie + bouton Valider ; réessai possible en cas d'échec.",
      "Correspondance TOLÉRANTE : insensible à la casse, aux accents et au pluriel simple (Étoiles = étoiLe = Etoile). Plusieurs réponses acceptées séparées par des virgules."
    ]
  },
  {
    "v": "v2.3.42",
    "date": "2026-07-07",
    "title": "Bestiaire compact/cliquable, DEF blason, Or & quantités en dés, Objet Rare, connecteurs verrouillés, boutons de test",
    "changes": [
      "Bestiaire : vignettes toujours à la taille minimale (nom tronqué), clic sur la vignette repliée pour déplier, bouton Éditer remplacé par une plume (icônes compactes).",
      "Onglet Groupe : la Défense s'affiche via le blason de sa valeur (DEF 0..6), sans texte.",
      "Or lâché des adversaires : accepte les dés (1d6, 3d12), tiré une fois à la victoire.",
      "Quantités d'objets en récompense (scènes, tests, butin de combat) : acceptent les dés.",
      "Blocs Test/Action : champ « Objet Rare » — si le groupe possède l'objet, un bouton à vignette réussit automatiquement le test (option « consommé à l'usage »).",
      "Connecteurs de donjon : menu Visible / Dissimulé / Verrouillé (cadenas visible, ouvert par un test).",
      "Boutons de test à 2 compétences : compétence + difficulté sur la même ligne, « ou » centré à mi-hauteur."
    ]
  },
  {
    "v": "v2.3.41",
    "date": "2026-07-07",
    "title": "Verrou combat des connecteurs, récompense après combat déclenché, anti-tremblement du journal",
    "changes": [
      "Navigation verrouillée : impossible d'emprunter un passage / de continuer tant que le combat de la scène n'est pas remporté OU qu'un test obligatoire n'a pas été tenté (les sorties, la scène suivante et les choix sont masqués ; message de verrou affiché).",
      "Récompense « Gagné à l'issue du combat » : s'applique désormais aussi aux combats DÉCLENCHÉS par un test / une action (en réussite comme en échec), pas seulement au combat de zone de la scène — la récompense est retenue tant que ce combat n'est pas gagné.",
      "Journal de combat : scrollbar-gutter stable pour supprimer le tremblement de deux liserés sombres autour du bandeau (barres de défilement en va-et-vient)."
    ]
  },
  {
    "v": "v2.3.40",
    "date": "2026-07-07",
    "title": "Bestiaire repliable + duplication, hauteur languettes récompense",
    "changes": [
      "Vignettes du bestiaire repliables (bouton ▸/▾). Repliées : nom / type / boutons. Repliées par défaut ; l'état replié/déplié est conservé au changement d'onglet.",
      "Bouton Dupliquer (⧉) sur chaque adversaire : crée immédiatement « <Nom> 2 ».",
      "Récompenses de scène : le blason DEF du bouclier est ramené à la hauteur des dés de l'arme, pour que les languettes d'une colonne aient toutes la même taille."
    ]
  },
  {
    "v": "v2.3.39",
    "date": "2026-07-07",
    "title": "Relance test multi-compétences, libellés chaînage Action, coche verte minimap donjon",
    "changes": [
      "Test à plusieurs compétences : la relance « avec un autre aventurier » ré-affiche les deux boutons de choix de compétence (au lieu d'un simple bouton de relance).",
      "Blocs Action : les sélecteurs de chaînage s'intitulent « 🔗 Test révélé si Action 1 / Action 2 » au lieu de « si réussite / si échec ».",
      "Éditeur de donjons structurés : coche verte ✅ par salle sur la minimap pour marquer une salle terminée (repère d'organisation, aucun effet de jeu)."
    ]
  },
  {
    "v": "v2.3.38",
    "date": "2026-07-07",
    "title": "boutons de test côte à côte (pills alignées), notes uniformisées (récompense dorée / combat vert), nouveau Bloc Action (sans jet, 1-2 choix)",
    "changes": []
  },
  {
    "v": "v2.3.37",
    "date": "2026-07-07",
    "title": "nouveaux niveaux de difficulté des tests — Automatique (0), Très Difficile (4), Insurmontable (5), Impossible (6)",
    "changes": []
  },
  {
    "v": "v2.3.36",
    "date": "2026-07-07",
    "title": "Relance du déploiement Pages",
    "changes": []
  },
  {
    "v": "v2.3.35",
    "date": "2026-07-07",
    "title": "relance des tests collectifs — les réussites sont acquises, seuls les aventuriers ayant échoué relancent (résultats fusionnés)",
    "changes": []
  },
  {
    "v": "v2.3.34",
    "date": "2026-07-07",
    "title": "vignette PAR (Parchemin) pour les talents + tri alphabétique du sélecteur de parchemins (groupe Parchemins en tête)",
    "changes": []
  },
  {
    "v": "v2.3.33",
    "date": "2026-07-07",
    "title": "Relance du déploiement Pages",
    "changes": []
  },
  {
    "v": "v2.3.32",
    "date": "2026-07-07",
    "title": "pastille d'Or lisible, languettes trésors homogènes, badge quantité sur le coin de la languette, encadré Butin doré et coloré par type",
    "changes": []
  },
  {
    "v": "v2.3.31",
    "date": "2026-07-07",
    "title": "éditeur d'objet — champs Cible/Nombre de dés réservés au Soin, résumé d'effet jamais réimposé (suggestion seulement)",
    "changes": []
  },
  {
    "v": "v2.3.30",
    "date": "2026-07-07",
    "title": "munitions (5 flèches), objets cumulables (badge qté + stock en combat), parchemins à effet de talent, Or/Trésors/Objets Rares (inventaire + récompenses scènes/tests/combat)",
    "changes": []
  },
  {
    "v": "v2.3.29",
    "date": "2026-07-06",
    "title": "cartouches ÉCHEC/RÉUSSITE plus lisibles (fond clair, texte foncé)",
    "changes": []
  },
  {
    "v": "v2.3.28",
    "date": "2026-07-06",
    "title": "Relance du déploiement Pages",
    "changes": []
  },
  {
    "v": "v2.3.27",
    "date": "2026-07-06",
    "title": "version compacte au retour conserve le texte narratif du test (masque récompenses et jets)",
    "changes": []
  },
  {
    "v": "v2.3.26",
    "date": "2026-07-06",
    "title": "récompense de scène « Gagné à l'issue du combat » (remise seulement après victoire)",
    "changes": []
  },
  {
    "v": "v2.3.25",
    "date": "2026-07-06",
    "title": "résultats de test compacts au retour dans une salle ; placement de départ dédié aux aventuriers ayant échoué (combat imposé)",
    "changes": []
  },
  {
    "v": "v2.3.24",
    "date": "2026-07-06",
    "title": "effet de test 'Démarrer un Combat' (échec/réussite) — combat imposé non contournable avec éditeur de zones dédié",
    "changes": []
  },
  {
    "v": "v2.3.23",
    "date": "2026-07-06",
    "title": "minimap montre les connecteurs vers salles accessibles non découvertes ; test Aventurier Aléatoire (figé) ; fix Préparé déplacement auto d'attaque",
    "changes": []
  },
  {
    "v": "v2.3.22",
    "date": "2026-07-06",
    "title": "Préparé accorde +1 Action OU +1 Mouvement ; règle 'jamais 2x la même Action' (sauf Attaque de Base)",
    "changes": []
  },
  {
    "v": "v2.3.21",
    "date": "2026-07-06",
    "title": "Relance du déploiement Pages",
    "changes": []
  },
  {
    "v": "v2.3.20",
    "date": "2026-07-06",
    "title": "nouvel état Préparé (+1 Action au prochain tour) — talent Vivacité, récompense de scène et de test de compétence",
    "changes": []
  },
  {
    "v": "v2.3.19",
    "date": "2026-07-06",
    "title": "Relance du déploiement Pages",
    "changes": []
  },
  {
    "v": "v2.3.18",
    "date": "2026-07-06",
    "title": "tests enchaînés — maintien de la visibilité du second test, différenciation renforcée, parent 'rattrapé' distinct",
    "changes": []
  },
  {
    "v": "v2.3.17",
    "date": "2026-07-06",
    "title": "condense la hauteur des blocs de tests + décalage/flèche pour les tests enchaînés",
    "changes": []
  },
  {
    "v": "v2.3.16",
    "date": "2026-07-06",
    "title": "récompense Haut Fait aux tests, renommage Hauts Faits, mise en page récompense XP",
    "changes": []
  },
  {
    "v": "v2.3.15",
    "date": "2026-07-06",
    "title": "nom des salles coloré selon leur type dans l'éditeur de donjon",
    "changes": []
  },
  {
    "v": "v2.3.14",
    "date": "2026-07-06",
    "title": "Inventaire (armes 2M/suppression), blocs pliables + « OK », tests de groupe en chaîne, couleurs",
    "changes": [
      "Les armes à DISTANCE (2 mains) n'apparaissent qu'en un seul exemplaire (comme les armures) ; seules les armes de contact (1 main) peuvent s'afficher en double. Plafond d'acquisition ajusté (distance = 1).",
      "Petit ✕ sur chaque équipement pour en jeter un exemplaire (confirmation) — déséquipe les copies en trop, décrémente le stock, gagne de la place.",
      "Blocs de texte / test / zones de combat pliables (▾/▸), état conservé après fermeture de la fenêtre d'édition.",
      "Coche « OK » par bloc (et pour le combat) : le titre passe au vert, la coche reste visible même replié.",
      "Section « Zones de combat » masquée derrière « + ⚔ Combat » (v2.3.13), désormais pliable et validable.",
      "Testeur « 🎯 Aventuriers concernés (chaîne) » : un test enchaîné n'est tenté que par les aventuriers ayant réussi/échoué le test qui l'a révélé (issu d'un test de groupe ou individuel).",
      "Option « ✅ Réussir ce test valide le test précédent » sur un test enchaîné : le réussir valide rétroactivement le parent (débloque son passage / connecteur secret).",
      "Les tests RÉUSSIS affichent aussi le détail des jets (comme les échoués).",
      "Languette (bouton) de test colorée selon la compétence testée ; cartouche de difficulté recoloré (vert facile · orange moyen · rouge difficile), sur le bouton comme sur les vignettes.",
      "Nouveaux types de scènes (Danger/Repos/Commerce/Boss/Temps/Vide) affichés en fond plein sur la carte, comme les types d'origine.",
      "Connecteurs (donjon) : bascule « à chaque passage » remplacée par une icône 🔁 mise en évidence quand active — plus de coche illisible superposée."
    ]
  },
  {
    "v": "v2.3.13",
    "date": "2026-07-06",
    "title": "Connecteurs lisibles/colorés, passages secrets, 4 modes de re-test, section Combat repliable",
    "changes": [
      "La ligne d'un connecteur est réagencée : contrôles d'événement regroupés dans un bloc insécable (badge du type + ⚡ Éditer + coche « 🔁 chaque passage » + ⚡✕), retour à la ligne propre — plus de chevauchements.",
      "Le trait du connecteur sur la carte prend la couleur du contenu de son événement : rouge (combat), bleu (test de compétence), or (événement textuel). Sans événement, la couleur habituelle est conservée. Un badge ⚔/🎲/⚡ l'indique aussi dans la liste.",
      "Dans la modale de scène d'une salle de donjon, chaque connecteur a un sélecteur de visibilité : « 👁 Toujours visible » ou « 🫥 Révélé par : [bloc de test de la salle] ». Un connecteur secret n'apparaît ni dans les Sorties & accès ni sur la mini-carte tant que ce test n'a pas été réussi ; il se révèle instantanément après la réussite. Marqué 🫥 dans la liste des connecteurs, recâblé à la duplication.",
      "« Ne peut pas être retenté » (défaut), « À volonté », « Avec un autre aventurier (1× chacun) » — chaque tentative exclut les aventuriers ayant déjà essayé, message quand tous ont tenté —, « Après une montée de niveau du groupe » — le test redevient disponible quand le groupe a gagné un niveau depuis la tentative. Rétro-compat : l'ancienne case cochée = À volonté.",
      "Les zones de combat sont repliées derrière un bouton « + ⚔ Combat » ; les scènes contenant déjà un combat (ou des scènes de victoire/défaite) restent dépliées automatiquement — rien n'est perdu.",
      "Donjon structuré : le champ « Scène suivante (auto) » est masqué (la navigation passe par les connecteurs) et le bouton correspondant ne s'affiche plus en jeu dans les salles de donjon."
    ]
  },
  {
    "v": "v2.3.12",
    "date": "2026-07-06",
    "title": "Lisibilité des tests (éditeur & jeu), difficulté sur le bouton, six nouveaux types de scènes",
    "changes": [
      "Le bloc « Test de compétence » d'un choix est réagencé en deux lignes lisibles : « Compétence / Difficulté / 👥 Groupe » puis « Réussite → / Échec → » (sélecteurs pleine largeur, plus de chevauchements).",
      "Les vignettes des aventuriers d'un test de groupe sont espacées (conteneur dédié) et la vignette d'information redondante (difficulté + « réussite si la majorité réussit ») est supprimée — l'info reste en infobulle sur le badge 👥 GROUPE.",
      "L'indicateur de difficulté est désormais TOUJOURS porté par le bouton du test, à droite de la compétence (blocs de test ET choix), et retiré des vignettes.",
      "DANGER (carmin), REPOS (vert), COMMERCE (ambre), BOSS (magenta), TEMPS (bleu ardoise), VIDE (gris) — étiquettes colorées dans les listes de scènes et cadres assortis sur la carte des donjons."
    ]
  },
  {
    "v": "v2.3.11",
    "date": "2026-07-06",
    "title": "Événements de passage sur les connecteurs (donjons structurés & aléatoires) + tests de compétence enchaînés",
    "changes": [
      "Donjons STRUCTURÉS : chaque connecteur peut porter un « ⚡ Événement » — une scène complète (combat par zones, blocs de test, textes, récompenses…) éditée avec LE MÊME éditeur de scène que partout. Elle s'intercale comme une page supplémentaire quand les aventuriers empruntent le passage, puis « Continuer vers [salle] → » mène à destination une fois résolue (combat gagné, tests faits…).",
      "Case « 🔁 chaque passage » : l'événement se déclenche à chaque traversée (état remis à neuf : combat, tests, récompenses rejouables) ; sinon une seule fois par partie.",
      "Donjons ALÉATOIRES : pool « ⚡ Événements de passage » au niveau du chapitre ; chaque événement est affecté à UNE transition entre deux salles tirée au hasard à la génération de l'ordre, et se déclenche une fois.",
      "Les scènes d'événement ne sont jamais des salles : exclues de la carte (éditeur et joueurs), de l'ordre aléatoire, des listes de salles, des compteurs et des cibles de navigation. Suppression propre (connecteur ou salle supprimés → scène d'événement purgée), duplication d'aventure recâblée.",
      "Un bloc de test peut révéler, au sein de la même scène, un AUTRE bloc de test « si réussite » et/ou « si échec » (ex. rater l'Agilité pour enjamber un trou fait apparaître un test de Force pour en sortir). Le test enchaîné reste masqué tant que le résultat déclencheur n'est pas survenu ; les chaînes se cumulent (un test révélé peut en révéler un autre) et survivent à la duplication d'aventure (ids recâblés)."
    ]
  },
  {
    "v": "v2.3.10",
    "date": "2026-07-06",
    "title": "Bloc de texte « Combat » (avant combat uniquement) + tests de compétence de GROUPE",
    "changes": [
      "Nouveau type de bloc « ⚔ Combat (avant le combat uniquement) » dans l'éditeur de scène : il s'affiche dans le fil du texte tant que le combat de la scène n'est pas résolu, puis disparaît une fois les adversaires vaincus (utile en donjon structuré quand on revisite la salle). Masqué aussi si la scène n'a pas de combat.",
      "Blocs Test : nouveau sélecteur « Testeur » — Meilleur aventurier (défaut) ou 👥 GROUPE (tous). En mode groupe, tous les aventuriers vivants sont affichés comme cibles (cartouches avec leurs dés), chacun lance le test, et les conséquences d'échec s'appliquent INDIVIDUELLEMENT à chaque aventurier qui a raté (même si le groupe réussit globalement). Réussite globale à la majorité (⌈n/2⌉). Résultats détaillés ✓/✗ par aventurier.",
      "Choix de scène : case « 👥 Groupe » sur les tests — chaque aventurier lance le test, le récapitulatif liste les jets individuels, et le groupe suit la branche réussite/échec selon la majorité.",
      "Les aventuriers morts ne participent pas aux tests de groupe."
    ]
  },
  {
    "v": "v2.3.09",
    "date": "2026-07-06",
    "title": "Sorties & accès : languettes alignées sur une ligne, sans libellé « Passage », triées Gauche/Haut/Droite/Bas",
    "changes": [
      "Les boutons de sortie s'affichent côte à côte sur une seule ligne (retour à la ligne automatique si nécessaire).",
      "Le libellé générique « Passage » est retiré : flèche directionnelle + nom de la salle suffisent. Un connecteur nommé par le MJ (porte, trappe, escalier…) reste affiché.",
      "Ordre d'affichage selon la direction sur la carte : Gauche, Haut, Droite, Bas (les diagonales s'intercalent entre les points cardinaux voisins)."
    ]
  },
  {
    "v": "v2.3.08",
    "date": "2026-07-06",
    "title": "Sorties & accès : flèches directionnelles en jeu (suivent la carte du donjon)",
    "changes": [
      "Chaque sortie affiche désormais une flèche orientée selon la position réelle de la salle cible sur la carte du donjon, depuis la salle courante : salle à gauche → ⬅, au-dessus → ⬆, à droite → ➡, diagonales ↘↙↖↗…",
      "Même comportement sur le bouton « 🔓 Emprunter le passage » d'un test de compétence réussi.",
      "Repli sur « → » si les salles n'ont pas encore de coordonnées de carte."
    ]
  },
  {
    "v": "v2.3.07",
    "date": "2026-07-06",
    "title": "Valeurs en dés (2d6…), mini-carte limitée aux salles explorées, flèches directionnelles des connecteurs",
    "changes": [
      "Nouveau résolveur Store.rollAmount : les champs numériques concernés acceptent une valeur fixe (« 3 ») OU une notation en dés (« 2d6 », « 1d6+2 »), tirée au moment de l'application.",
      "Blocs Test : la valeur des conséquences d'échec (Perte de PV / XP / VIE) et l'XP de récompense acceptent les dés ; le tirage réel est affiché avec la notation en rappel (ex. « Zag perd 9 PV (2d6) », « +2 XP (1d6) »).",
      "La carte des joueurs (mini + fenêtre flottante) ne présente plus QUE les salles déjà explorées ; les salles à venir sont invisibles, et les connecteurs n'apparaissent qu'entre deux salles explorées.",
      "La liste des connecteurs affiche une flèche directionnelle qui suit la géométrie de la carte (salle d'arrivée placée sous la salle de départ → ⬇, à droite → ➡, diagonales ↘↙↖↗…), dans la liste sous la carte comme dans le panneau « Connecteurs de la salle » de la modale de scène (orientée depuis la salle éditée)."
    ]
  },
  {
    "v": "v2.3.06",
    "date": "2026-07-06",
    "title": "Balises colorées, tests retentables + conséquences d'échec, connecteurs améliorés, mini-carte de donjon",
    "changes": [
      "Les balises dynamiques (<ENDU>, <PV>, <VIE>, <DÉGÂTS>, <NIVEAU>, <ORBES>) s'affichent en GRAS et dans la couleur de la caractéristique concernée, partout où les joueurs les voient (création d'aventurier, onglet Talents, écran Niveau Supérieur).",
      "Case « 🔁 Peut être retenté » : le test peut être refait autant de fois que nécessaire jusqu'à la réussite (bouton Retenter dans l'encadré d'échec).",
      "« Conséquence de l'échec » sur la ligne de la récompense : Perte de PV (plancher 1 PV), Subir un état (Affaibli, Au sol, Feu, Poison, Brisé, Faille — appliqué au prochain combat), Perte d'XP, Perte d'un objet équipé (main gauche/droite, 1 main aléatoire, armure, objet), Perte de VIE, Mort de l'aventurier (exclu des tests et combats, affiché ☠), Subit un Fait (ajouté au journal). Appliquée à l'aventurier qui a tenté le test, avec message dans l'encadré d'échec.",
      "Le passage débloqué par un test réussi utilise le même bouton que les « Sorties & accès » des donjons (destination « ??? » tant que non visitée) ; le bouton du test lui-même a désormais les mêmes dimensions.",
      "Re-tracer un connecteur existant (🔗 puis clic) le SUPPRIME (toggle), en plus du ✕ de la liste des connecteurs.",
      "La modale de scène d'une salle affiche ses connecteurs (lecture seule) et clarifie la différence avec « Scène suivante » (enchaînement forcé).",
      "Mode Aventure : mini-carte du donjon dans la colonne de droite (sous les Faits accomplis) — salles visitées, « ??? » pour les inexplorées, salle courante en surbrillance, connecteurs en pointillés vers l'inconnu. Un clic ouvre la carte entière dans une fenêtre flottante."
    ]
  },
  {
    "v": "v2.3.05",
    "date": "2026-07-06",
    "title": "Éditeur de scène : tests de compétence comme blocs ordonnables + conditions d'affichage par compétence",
    "changes": [
      "Les tests de compétence deviennent des BLOCS, ajoutés via « + Bloc Test », agencés librement entre les blocs de texte (narratif, conseil, alerte…) et réordonnables (↑/↓) comme eux. Rendus en jeu à leur place dans le fil du texte de la scène.",
      "Migration transparente : un ancien `searchTest` (v2.3.04) est converti en bloc de test ; aucune donnée existante perdue.",
      "Chaque bloc (texte OU test) reçoit un champ « Compétence requise / valeur mini » (optionnel, aucun par défaut → rétro-compatibilité). Le bloc n'apparaît dans la scène que si un aventurier engagé atteint cette valeur au démarrage de la scène ; sinon il est masqué."
    ]
  },
  {
    "v": "v2.3.04",
    "date": "2026-07-05",
    "title": "Scènes : test de compétence « de fouille » (récompense/passage, tenté une seule fois)",
    "changes": [
      "Nouvelle section « Test de compétence (fouille) » activable dans n'importe quelle scène, indépendante des choix : intitulé du bouton, compétence, difficulté, texte de réussite et texte d'échec.",
      "Récompense en cas de réussite : XP, objets (destinataire choisi en jeu) et/ou passage débloqué vers une autre scène.",
      "Le passage débloqué apparaît dans l'arborescence des liens de la scène (« 🔍 fouille ✓ »).",
      "La scène affiche le test avec le cartouche du meilleur aventurier (dés, bonus d'Expertise, difficulté). Le groupe le tente une seule fois.",
      "Écran de résultat : Réussite (texte + récompense à récupérer + éventuel passage à emprunter) ou Échec (texte + jets). Une fois tenté, le test ne peut plus être relancé ; le résultat et la récompense/le passage restent affichés."
    ]
  },
  {
    "v": "v2.3.03",
    "date": "2026-07-05",
    "title": "Aventures : duplication, réordonnancement (aventures & chapitres), noms de barrières en combat, Conseils en gras",
    "changes": [
      "Bouton « ⧉ Dupliquer » sur chaque aventure : copie complète avec de nouveaux identifiants (aventure, chapitres, scènes, blocs, choix, connecteurs de donjon) et recâblage de toutes les cibles de navigation internes (suite, choix, réussite/échec, victoire/défaite, entrée & liens de donjon). Titre incrémenté, insérée juste après l'originale.",
      "Flèches ↑/↓ pour réordonner la liste des aventures éditables.",
      "Flèches ↑/↓ dans l'en-tête de chaque chapitre pour changer l'ordre des chapitres (1, 2, 3…).",
      "La disposition affichée avant le module de combat utilise désormais le NOM personnalisé de la barrière (ex. « Vieux Portail », « Ravin ») au lieu du type générique ; le type sert de repli quand aucun nom n'est saisi.",
      "Les encadrés Conseil (vert) s'affichent en gras."
    ]
  },
  {
    "v": "v2.3.02",
    "date": "2026-07-04",
    "title": "IA des adversaires : contournement des barrières infranchissables (routage entre zones)",
    "changes": [
      "Nouveau routage `zoneStep` (BFS) : un adversaire calcule le plus court chemin vers sa cible en contournant les barrières bloquantes (mur / infranchissable) par les zones libres, et avance d'un pas par tour. Les barrières Difficiles restent des passages (franchis par un test d'Agilité au moment de s'y engager).",
      "`actOneMonster` : la sélection de cible ne retient plus que les aventuriers réellement joignables (route existante), et le déplacement suit le premier pas du chemin au lieu de tenter uniquement un saut direct — préservant le déplacement direct quand aucune barrière ne gêne."
    ]
  },
  {
    "v": "v2.3.01",
    "date": "2026-07-02",
    "title": "Nouveaux types de chapitres : Donjons Structurés (carte de salles) et Donjons Aléatoires",
    "changes": [
      "Éditeur en carte : les scènes deviennent des salles-cartouches (colorées par type) posées sur une grille, déplaçables en glisser-déposer.",
      "Connecteurs entre salles (🔗 puis clic sur la salle d'arrivée) : couloirs, portes, passages secrets… avec description libre, tracés en SVG sur la carte et listés sous celle-ci.",
      "Entrée du donjon définissable (🚪) ; clic sur un cartouche → éditeur de scène habituel (inchangé).",
      "En jeu : une fois la salle résolue (combat gagné, ou rien à résoudre), les « Sorties & accès » s'affichent (étiquette du connecteur ; nom de la salle seulement si déjà visitée, sinon « ??? », ⚔️ si danger connu). Exploration libre : retours en arrière possibles, salles nettoyées non rejouées, jauge « x/N salles » dans le bandeau.",
      "Éditeur en liste (comme le narratif) avec une balise de rôle par salle : 🚪 Entrée / 🎲 Aléatoire / 🏁 Sortie.",
      "En jeu : l'ordre est tiré au sort à chaque partie (Entrées d'abord, salles mélangées, Sorties à la fin), stable pour la durée de la session. Enchaînement automatique « Continuer l'exploration (salle x/N) », puis « Sortir du donjon » vers le chapitre suivant.",
      "Arrivée dans un donjon depuis un autre chapitre : redirection automatique vers l'entrée (structuré) ou la 1re salle de l'ordre tiré (aléatoire).",
      "Victoire de combat (ou « Passer (victoire) ») : salle marquée nettoyée.",
      "Récompenses, tests de compétence, choix, montées de niveau, sauvegardes et partage fonctionnent à l'identique dans les trois types de chapitres ; aventures existantes inchangées (type Narratif implicite)."
    ]
  },
  {
    "v": "v2.3.00",
    "date": "2026-07-02",
    "title": "Talents Adv. en colonnes par type, type « Espèce », retrait total de l'ancien système de talents adverses",
    "changes": [
      "Talents triés en colonnes par TYPE (Action, Réaction, Passif, Espèce…).",
      "Plus de « Niv. x » sur les talents (les adversaires n'ont pas de niveau).",
      "Plus d'icône œil à droite des talents.",
      "Nouveau type de talent « Espèce » (vignette ESP), même couleur (or) que Maîtrise. Disponible dans le sélecteur de vignette de l'éditeur.",
      "Neutralisation complète dans le moteur de combat (monsterTalent, PROIE, fuites flee_on_big_hit / flee_after_turns, blindage armor_charges, soutien de zone, happe, lent, riposte…) — plus aucun comportement legacy actif.",
      "Les anciens talents n'apparaissent plus sur les fiches du bestiaire ni dans le bandeau de combat. Les données m.talents sont laissées intactes mais ne sont plus jamais consultées.",
      "Les talents adverses attribués à un monstre apparaissent en languettes sur sa fiche (vignette de type colorée + nom)."
    ]
  },
  {
    "v": "v2.2.99",
    "date": "2026-07-02",
    "title": "Fiche adversaire : suppression de l'ancien éditeur de talents, talents adverses analysables + sections repliables",
    "changes": [
      "Éditeur d'adversaire : retrait de l'ancienne section « Talents » (système à déclencheur legacy). Seule reste « Talents adverses » (talents nommés du pool Talents Adv.). Les données m.talents des anciens monstres sont préservées telles quelles (aucune régression de combat), mais l'UI n'est plus proposée.",
      "Le sélecteur « Talents adverses » regroupe désormais les talents en sections repliables par type (Actions, Réactions, Maîtrises, Passifs, Critiques, Gardes, Améliorations) ; les sections contenant un talent coché s'ouvrent.",
      "Les talents attribués à un adversaire apparaissent dans son bandeau de combat, masqués (« Talent Inconnu » grisé) tant que l'aventurier ne l'a pas analysé, puis révélés par leur nom.",
      "Onglet Classes : le groupe « Adversaires » n'y est plus affiché (ni colonne ni filtre) — uniquement les classes et les génériques.",
      "Bouton « + Nouveau talent » de l'onglet Talents Adv. recâblé sur l'éditeur d'effets partagé (groupe Adversaires), au lieu de l'ancien modal dormant."
    ]
  },
  {
    "v": "v2.2.98",
    "date": "2026-07-02",
    "title": "Talents adverses nommés : onglet Talents Adv. effet-based + sélection sur les adversaires",
    "changes": [
      "L'onglet Talents Adv. devient un éditeur de talents nommés, réutilisant le même pool d'effets que les talents d'aventurier (groupe « adversary »).",
      "Persistance dédiée (Store.loadAdvTalents / saveAdvTalents, clé amertume_adv_talents_v1).",
      "Dans le Bestiaire, l'adversaire coche des talents parmi ceux créés dans Talents Adv. (m.advTalentIds), au lieu d'une longue liste d'effets bruts.",
      "resolveMonsterAdvTalents résout ces ids via resolveHeroTalents au même format que les talents d'aventurier ; l'application en combat est inchangée."
    ]
  },
  {
    "v": "v2.2.97",
    "date": "2026-07-02",
    "title": "Fusion talents : les adversaires appliquent automatiquement des effets d'aventurier",
    "changes": [
      "Éditeur d'adversaire : nouvelle section « Effets d'aventurier » (20 effets pris en charge, regroupés) avec valeur X / choix par effet. Stockés dans m.advTalents.",
      "Le moteur applique ces effets côté-neutre (heroHasTalent/heroTalentVal ne sont plus réservés aux aventuriers ; résolution via resolveMonsterAdvTalents dans l'instance d'adversaire) : bonus de dégâts (Frappe Lourde, Assassinat, Meute…), Critique Destructeur, Cuirasse, Solidité, Bouclier Mystique, Immunité, Esquive, Renforcement, Force Blindée, Camouflage, Téléportation, Pieds Sûrs — toujours en défaveur des aventuriers. Vérifié en combat (Frappe Lourde +3, Cuirasse -2, Esquive 6+).",
      "Aucun impact sur les adversaires existants (m.advTalents vide => c.talents vide)."
    ]
  },
  {
    "v": "v2.2.96",
    "date": "2026-07-02",
    "title": "Priorités de focus/ciblage des adversaires étendues",
    "changes": [
      "Nouveau focus de ciblage des adversaires (champ Menace de l'éditeur) : DEF haute, Dégâts hauts, Attaque à distance, Isolé (seul en zone), en plus de Plus proche / PV bas / PV haut / DEF basse.",
      "Fonction focusPick partagée par le ciblage d'attaque (chooseFrom) et la désignation PROIE ; les critères PROIE gagnent les mêmes priorités."
    ]
  },
  {
    "v": "v2.2.95",
    "date": "2026-07-02",
    "title": "Assaut (autres alliés), séparateurs de talents, bestiaire par aventure, niveaux jusqu'à 20",
    "changes": [
      "Assaut : seuls les AUTRES aventuriers de la zone attaquent (l'initiateur non).",
      "Onglet Talents (Joueur) : séparateurs de type dans l'ordre Maîtrise / Action / Réaction / Passif / Critique / Garde / Amélioration.",
      "Bestiaire : l'affiliation (éditeur, filtre, tri, sélection multiple) porte désormais sur une AVENTURE et non un chapitre.",
      "Courbe de progression étendue au niveau 20 (seuils d'XP fournis) : table des niveaux, sélecteur de niveau (1→20), niveau max des talents (éditeur → 20)."
    ]
  },
  {
    "v": "v2.2.94",
    "date": "2026-07-02",
    "title": "Rendre visibles les repères demandés (bouton cliquable + vignette sélectionnée)",
    "changes": [
      "Vignette de l'aventurier sélectionné : fond aux couleurs VIVES de sa classe (nettement plus saturé que le pastel des autres vignettes), au lieu de la même teinte pastel qui la rendait indistincte. Or vif par défaut.",
      "Talents/actions cliquables du bandeau : liseré interne doré TOUJOURS visible (inset, jamais rogné ni désactivé par prefers-reduced-motion) + halo pulsé. Le halo externe seul, transparent au repos, restait invisible."
    ]
  },
  {
    "v": "v2.2.93",
    "date": "2026-07-02",
    "title": "Bestiaire : affiliation aux chapitres, tri par chapitre, sélection multiple",
    "changes": [
      "Chaque adversaire peut être affilié à un chapitre d'aventure (champ dans l'éditeur, purement organisationnel). Étiquette de chapitre sur la fiche.",
      "Filtre « Tous chapitres » + option « Tri : chapitre » dans le bestiaire.",
      "Bouton « Sélectionner » : coche plusieurs adversaires puis applique un chapitre à toute la sélection en une fois."
    ]
  },
  {
    "v": "v2.2.92",
    "date": "2026-07-02",
    "title": "VFX talents cliquables, vignette sélectionnée colorée, auto-passage Pré-Tour, infobulles descriptives",
    "changes": [
      "Les talents/actions cliquables du bandeau (.ab-atk, .ab-orbes, bouton Gardien) pulsent d'un léger rayonnement (contour statique sous prefers-reduced-motion).",
      "L'aventurier sélectionné : sa vignette de zone prend le fond de sa classe, rendu 2× plus vif par le filter:saturate(2) déjà en place (or clair par défaut).",
      "Pré-Tour : le vrai tour démarre automatiquement dès que plus aucun mouvement gratuit ni désignation Gardien n'est en attente (corrige aussi une désignation Gardien qui pouvait être sautée après un mouvement).",
      "Infobulle au survol des talents du bandeau : affiche le descriptif complet."
    ]
  },
  {
    "v": "v2.2.91",
    "date": "2026-07-02",
    "title": "Bouton Gardien à la taille des autres talents + suppression du (1)",
    "changes": [
      "Le type de talent GARDE n'avait pas de règle de police (contrairement à passif/amélioration/maîtrise/action/réaction qui sont tous en 1.08rem) : le bouton bleu Gardien retombait sur la petite taille .ab-talent-named. Ajout de la règle .ab-talent-kind-garde (1.08rem, navy) + font-size sur .ab-gardien-btn. Le compteur (1) après « Gardien » est retiré (l'info passe en infobulle)."
    ]
  },
  {
    "v": "v2.2.90",
    "date": "2026-07-02",
    "title": "3 derniers effets de talents (Assaut, Éclipse, Bousculade)",
    "changes": [
      "Assaut (action) : tous les aventuriers de votre zone effectuent une attaque gratuite (ciblage au clic, via la file de choix).",
      "Éclipse (action) : téléportation dans la zone d'une cible (franchit toutes les barrières, MURS/INFRANCHISSABLES compris) puis 1 attaque.",
      "Bousculade (action) : attaque au contact puis pousse la cible dans une autre zone ; elle subit les attaques d'opportunité des aventuriers de la zone."
    ]
  },
  {
    "v": "v2.2.89",
    "date": "2026-07-02",
    "title": "9 nouveaux effets de talents (Assassinat, Déluge, Téléportation, Survitaminé…)",
    "changes": [
      "Assassinat (passif, variable) : double le bonus de dégâts OU l'ensemble des dégâts d'attaque contre une cible Seul dans sa zone / Solitaire / Alpha / Boss.",
      "Déluge (action) : attaque relancée tant qu'aucun 1 n'apparaît sur les dés.",
      "Camouflage (passif) : intouchable par les attaques à distance d'une autre zone.",
      "Acrobatie (passif) : +1 dé noir après un franchissement de barrière Difficile.",
      "Ralliement (passif) : les alliés entrant dans votre zone ne dépensent pas leur mouvement.",
      "Déphasage (action) : intouchable (dégâts + états) au prochain tour adverse.",
      "Téléportation (amélioration) : les mouvements franchissent toutes les barrières.",
      "Survitaminé (amélioration) : 2 Actions par tour.",
      "À bout portant (amélioration) : aucune attaque d'opportunité sur un tir dans la zone."
    ]
  },
  {
    "v": "v2.2.88",
    "date": "2026-07-02",
    "title": "Bouton Gardien à la bonne taille + les états n'agrandissent plus la vignette",
    "changes": [
      "Le bouton de désignation Gardien (Pré-Tour 1) adopte la même police que les autres languettes de talent (classe ab-talent-named) : il ne change plus de taille après avoir désigné un allié.",
      "La zone d'états des vignettes de combat réserve désormais une ligne : recevoir un ou plusieurs états n'agrandit plus la vignette ; elle ne grandit que si les états débordent sur une 2ᵉ ligne."
    ]
  },
  {
    "v": "v2.2.87",
    "date": "2026-07-01",
    "title": "Talents de critique/coopération au clic (fin des pop-up prompt)",
    "changes": [
      "Cri de Rage : cliquer l'adversaire à attirer dans sa zone.",
      "Allié Critique : cliquer l'allié, puis sa cible (attaque gratuite).",
      "Coopération : cliquer l'allié Gardé, puis sa cible. Chaque choix est facultatif (bouton « Passer »). Les choix ne sont proposés que pendant la phase des aventuriers."
    ]
  },
  {
    "v": "v2.2.86",
    "date": "2026-07-01",
    "title": "Barrières MUR grises + noms de barrières personnalisables",
    "changes": [
      "La couleur des barrières de type MUR (séparateurs, tags, bordures) passe du rouge au gris (#6b6b6b) dans l'éditeur et le module de combat.",
      "Chaque barrière peut recevoir un nom personnalisé (mur, palissade, ravin…) dans l'éditeur de scènes de combat ; ce nom s'affiche dans le module de combat (séparateur + infobulle). barrierDisplayName + champ conservé au changement de type et normalisé au chargement du combat."
    ]
  },
  {
    "v": "v2.2.85",
    "date": "2026-07-01",
    "title": "Balises dynamiques de talents, dropdowns d'accueil persistants, œil MJ, désignation Gardien au clic",
    "changes": [
      "Balises dynamiques dans les descriptions de talents (<ENDU>, <DEGATS>, <VIE>, <PV>, <NIVEAU>, <ORBES>) remplacées par les valeurs de l'aventurier (onglet Talents + création d'aventurier). Store.fillTalentTags.",
      "Grandes Aventures : l'état déplié de chaque menu est conservé au retour à l'accueil (persisté localement).",
      "Onglet Classes (MJ) : un œil à côté du crayon masque/réaffiche un talent aux aventuriers (non débloquable, non visible, ni dans la création tant qu'il reste masqué). État conservé à l'édition.",
      "Gardien : la désignation d'alliés (Blindage + Gardé) au Pré-Tour 1 ne passe plus par une fenêtre pop-up : on clique le talent puis les vignettes des alliés, comme pour un objet ou un soin."
    ]
  },
  {
    "v": "v2.2.84",
    "date": "2026-07-01",
    "title": "Ajoute la description de la classe Pyromane à la création d'aventurier",
    "changes": []
  },
  {
    "v": "v2.2.83",
    "date": "2026-07-01",
    "title": "Frappe Tournoyante : cible + déplacement automatique avant de frapper la zone",
    "changes": [
      "Le bouton du talent Frappe Tournoyante (effet targets:'all' + zoneOnly) déclenchait immédiatement l'attaque dans la zone où l'aventurier se trouvait. Désormais il s'arme comme une attaque normale : on cible un adversaire, le déplacement au contact est effectué automatiquement, puis TOUS les adversaires de la zone d'arrivée sont touchés. Les autres attaques targets:'all' non zoneOnly (Brasier) restent à résolution immédiate."
    ]
  },
  {
    "v": "v2.2.82",
    "date": "2026-07-01",
    "title": "Corrige la barre de défilement horizontale clignotante du journal de combat",
    "changes": [
      "Le journal de combat (.combat-log) utilisait overflow-y: auto, ce qui, par spécification CSS, force overflow-x à auto également. Une ligne de journal large (badges de dés en inline-block, non sécables) débordait alors horizontalement et faisait apparaître une barre de défilement horizontale au bas du journal — juste au-dessus du bandeau d'action — qui clignotait à toute vitesse par rétroaction avec la barre verticale. On force désormais overflow-x: hidden."
    ]
  },
  {
    "v": "v2.2.81",
    "date": "2026-07-01",
    "title": "Déflagration reprend la couleur bleue des Actions",
    "changes": [
      "Le bouton Déflagration héritait de la teinte mystique (mauve) prévue pour les Orbes. L'Orbe ayant désormais son bouton ORBES dédié, Déflagration redevient un bouton d'Action bleu standard."
    ]
  },
  {
    "v": "v2.2.80",
    "date": "2026-06-30",
    "title": "Orbes Partagés consomme l'action dès le 1er allié doté",
    "changes": [
      "L'action étant un talent d'Action, elle consomme désormais l'action du tour dès qu'un premier allié reçoit le bonus (et non plus jamais)."
    ]
  },
  {
    "v": "v2.2.79",
    "date": "2026-06-30",
    "title": "butin sans tueur identifié + Orbes Partagés au clic (sans pop-up)",
    "changes": [
      "Butin : si aucun aventurier n'est à l'origine de la mort (ex. dégâts de Feu), l'équipement va à un aventurier aléatoire qui ne le possède pas encore.",
      "Orbes Partagés : plus de pop-up. On clique le bouton du talent, puis on clique les vignettes des alliés à doter (+1 dé bleu & FEU). Bandeau d'aide + orbes restants ; on termine en cliquant un autre bouton/mouvement/Tour des Adversaires (ou « Terminer »)."
    ]
  },
  {
    "v": "v2.2.78",
    "date": "2026-06-30",
    "title": "orbes/bandeau : couleur, action garantie, ombre de texte, journal",
    "changes": [
      "Bouton ORBES : orange un peu plus vif (#ed9d4f).",
      "Orbes garantis GRATUITS (freeAction forcé) : le Pyromane conserve toujours son action après avoir lancé ses orbes.",
      "Journal : « arme à distance » → « attaque à distance » (attaque d'opportunité).",
      "Légère ombre portée appliquée au texte de TOUS les boutons du bandeau."
    ]
  },
  {
    "v": "v2.2.77",
    "date": "2026-06-30",
    "title": "bouton ORBES + cartouches de classe affinés",
    "changes": [
      "ORBES : texte à 1.08rem (taille des libellés de talent), dés à la même taille que les dés des boutons d'attaque (16/22/27px selon le breakpoint), fond orange clair (thème Pyromane) au lieu du violet.",
      "Cartouches de classe (aventurier) / type (adversaire) sous la barre de PV : pleins et colorés selon la classe / le type."
    ]
  },
  {
    "v": "v2.2.76",
    "date": "2026-06-30",
    "title": "bandeau de combat : cartouche classe sous la barre PV + bouton ORBES uniformisé",
    "changes": [
      "Le cartouche de classe (aventurier) / type (adversaire) passe SOUS la barre de PV (ab-subline) au lieu de rogner le nom.",
      "Bouton ORBES : même habillage que les boutons d'attaque (bordure, fond, opacité), texte « ORBES » à la même taille que les autres libellés, dés à la taille des dés d'attaque, et répartition verticale (espace au-dessus/en-dessous)."
    ]
  },
  {
    "v": "v2.2.75",
    "date": "2026-06-30",
    "title": "bouton spécial ORBES (Pyromane)",
    "changes": [
      "Pour les aventuriers Pyromanes, un bouton vertical « ORBES » s'insère entre la fiche (Nom/PV, réduite) et la grille d'actions : titre ORBES, dés de dégâts (jusqu'à 2 dés bleus + bonus) et nombre d'orbes restants (s'actualise à chaque lancer). L'Orbe n'occupe plus de slot de talent ; les boutons à droite ne bougent pas."
    ]
  },
  {
    "v": "v2.2.74",
    "date": "2026-06-30",
    "title": "talents de Pyromancie (16 effets)",
    "changes": [
      "Passifs : Initiative (agir avant les rapides au Pré-Tour), Orbe à Dispersion (3+ orbes → toute la zone via Déflagration), Embrasement (FEU adverse doublé en fin de tour), Orbe Critique (double 6), Esquive 6+. Améliorations : Orbe de Feu (orbes infligent FEU), Orbe Perforant (orbes ignorent DEF), Combustion (+1 dé bleu vs FEU), Immunité <état>, Faille Tactique (ignore DEF des cibles avec <état>). Actions : Orbes Partagés (buff alliés : +1 dé bleu & FEU à leur prochaine attaque), Brasier (frappe tous les ennemis en FEU). Maîtrises : Préparation Arcanique (orbes dès le Pré-Tour 1), Orbes Renforcés (2 dés bleus/orbe), Maîtrise des Orbes (ajoute le bonus de dégâts aux orbes). Réaction : Implosion (action supplémentaire après un critique, 1×/tour). + option moteur de dés noCrit ; nom d'orbe « X Orbes de Feu » si Orbe de Feu."
    ]
  },
  {
    "v": "v2.2.73",
    "date": "2026-06-30",
    "title": "Orbe : nom dynamique + couleur mystique ; type de talent GARDE",
    "changes": [
      "Le bouton d'Orbe Mystique affiche « X Orbes Mystiques » (X = orbes/tour, varie avec le niveau).",
      "Bouton d'Orbe / Déflagration recoloré aux teintes mystiques (violet) au lieu du bleu d'action.",
      "Nouveau type de talent GARDE (vignette GARD, bleu marine du Gardien), assignable dans l'éditeur de talents et stylé partout."
    ]
  },
  {
    "v": "v2.2.72",
    "date": "2026-06-30",
    "title": "talents Pyromane : Orbes Mystiques + Déflagration",
    "changes": [
      "Pyromane (maîtrise) : Orbe Mystique = attaque à distance gratuite (1 dé bleu), cliquable plusieurs fois par tour. Budget d'orbes/tour = 2 + 1 par niveau impair (3 au Niv. 3, 4 au Niv. 5…), réarmé chaque tour.",
      "Déflagration (action) : concentre tous les Orbes Mystiques restants (dés bleus) sur une cible en une attaque, et les consomme."
    ]
  },
  {
    "v": "v2.2.71",
    "date": "2026-06-30",
    "title": "talents de Gardien (état GARDÉ) + validation page Talents",
    "changes": [
      "Assistant : bouton « Suivant » désactivé tant qu'aucun talent n'est coché.",
      "Nouvel état GARDÉ + catalogue complet des talents de Gardien (vignettes/types).",
      "Moteur de combat câblé : Gardien (Pré-Tour 1 : Blindage+Gardé à X alliés), Coopération, Provocation, Attaque Blindée, Solidité (DEF bloque les rouges), Coup de Bouclier / Force Blindée (+1 dé rouge), Épines, Rempart, Protection, Endurcissement (ENDU/Niv), Survivaliste (VIE→dégâts), Regain, Dernier Souffle, Blindage Initial, Garde Secrète (+2 XP), Riposte à Distance, Riposte 2, Menace / Menace 2 (ciblage IA).",
      "Les effets « vous pouvez » passent par un choix joueur (confirm/sélection)."
    ]
  },
  {
    "v": "v2.2.70",
    "date": "2026-06-30",
    "title": "nouvelle catégorie de talent CRITIQUE (vignette CRIT, grenat)",
    "changes": [
      "Ajout du type de talent « Critique » (vignette CRIT, teinte grenat bordeaux) dans tous les affichages (Classes MJ, onglet Talents joueur, assistant, niveau supérieur, bibliothèque, badges).",
      "Sélecteur « Vignette (type) » dans l'éditeur de talent (MJ) : permet de forcer la catégorie d'un talent (dont CRITIQUE) via t.kindOverride, sinon déduite de l'effet comme avant."
    ]
  },
  {
    "v": "v2.2.69",
    "date": "2026-06-30",
    "title": "onglet Classes (MJ) : talents à prérequis lisibles",
    "changes": [
      "Les talents avec prérequis affichent désormais une simple flèche d'arborescence (↳) devant le nom, comme dans l'onglet Talents du mode Joueur, au lieu du nom complet du prérequis qui tronquait et rendait la languette illisible."
    ]
  },
  {
    "v": "v2.2.68",
    "date": "2026-06-30",
    "title": "talents de classe : ajustements",
    "changes": [
      "Attaque Furieuse : une seule attaque gratuite sur kill (plus de chaînage).",
      "Talents « vous pouvez » désormais décidés par le joueur (confirm/choix) avec un message d'aide dans le journal : Exécution, Allié Critique (choix de l'allié et de la cible), Cri de Rage (choix de l'adversaire attiré). Mouvement Critique reste un mouvement gratuit optionnel ; Critique Explosif, Accentuation et Bain de Sang restent automatiques (« vous infligez/soignez »)."
    ]
  },
  {
    "v": "v2.2.67",
    "date": "2026-06-30",
    "title": "talents de classe (critique, exécution, blindage, renforcement…)",
    "changes": [
      "Maîtrise Destructeur : critique sur tout double (sauf 1), explosion tant que la face critique est reproduite (moteur de dés).",
      "Action Attaque Furieuse : enchaîne une attaque gratuite sur un autre adversaire de la zone à chaque kill.",
      "Réaction Exécution : inflige le bonus de dégâts à un adversaire de la zone avant qu'il ne fuie (peut l'empêcher de fuir).",
      "Passifs : Mouvement Critique, Épuisement (DEF -1 en zone), Accentuation (crit = double bonus), Allié Critique, Critique Explosif, Bain de Sang (kill au crit → soin ENDU), Cri de Rage (attire un adversaire).",
      "Améliorations : Frappe Perforante (ignore Blindage sans le retirer), Bouclier Mystique (ignore les dés bleus), Renforcement (+PV max = bonus dmg)."
    ]
  },
  {
    "v": "v2.2.66",
    "date": "2026-06-30",
    "title": "page Classe : retrait du libellé et descriptif lisible",
    "changes": [
      "Suppression du texte « Choisis une classe. » (blocs remontés).",
      "Descriptif de classe en couleur sombre lisible sur le fond pastel clair."
    ]
  },
  {
    "v": "v2.2.65",
    "date": "2026-06-30",
    "title": "languette de classe, lancement direct, logo→accueil, divers",
    "changes": [
      "Assistant de création, page Classe : une languette (nom + court descriptif) apparaît à la sélection (description Lamevent fournie ; autres à compléter).",
      "Suppression de l'écran « L'Aventure commence » : la première scène se lance directement.",
      "Le logo/titre « Amertüme Solo RPG » en haut à gauche ramène à l'accueil.",
      "Titre de l'onglet navigateur : « Amertüme Solo RPG ».",
      "Test de compétence : en cas d'égalité au meilleur bonus, un aventurier ex æquo est tiré au hasard (le cartouche affiché et le test lancé restent cohérents).",
      "Récompense XP : « ✦ Expérience +x XP » (sans « — » ni « (au groupe) »)."
    ]
  },
  {
    "v": "v2.2.64",
    "date": "2026-06-30",
    "title": "Grandes Aventures (regroupement de chapitres) + ordre d'accueil",
    "changes": [
      "Nouveau modèle « Grande Aventure » (saga) : { id, title, adventureIds } + ordre d'affichage de l'accueil (homeOrder), persistés dans Store et inclus dans le bundle de partage.",
      "Accueil : les Grandes Aventures s'affichent en menus déroulants (<details>) regroupant leurs chapitres ; les aventures autonomes restent affichées comme avant. Ordre commun réordonnable.",
      "Onglet Aventures (MJ) : panneau « Organisation de l'accueil » — créer une Grande Aventure, y affecter des aventures, réordonner chapitres et entrées de l'accueil (↑/↓), renommer/supprimer.",
      "Nettoyage des références saga/ordre à la suppression d'une aventure."
    ]
  },
  {
    "v": "v2.2.63",
    "date": "2026-06-29",
    "title": "destinataires du butin alignés et rapprochés (résultat de combat)",
    "changes": [
      "Le nom du destinataire est désormais aligné à gauche (les flèches « → » se calent toutes au même endroit, juste après la languette) au lieu d'être collé à droite de son cadre, ce qui le décalait et l'éloignait de l'objet."
    ]
  },
  {
    "v": "v2.2.62",
    "date": "2026-06-29",
    "title": "languettes de butin de taille égale (résultat de combat)",
    "changes": [
      "Largeur fixe du nom du destinataire (.cs-loot-dest) afin que toutes les languettes d'équipement (.inv-strip) aient la même taille ; le nom passe à la ligne plutôt que d'être tronqué."
    ]
  },
  {
    "v": "v2.2.61",
    "date": "2026-06-29",
    "title": "propagation des gains de compétence (niveaux impairs)",
    "changes": [
      "effectiveHero fusionne désormais base + gains dans h.skills.",
      "Onglet Groupe et fiche d'aventurier affichent dh.skills (effectif) au lieu des compétences de base.",
      "Le test d'Agilité de franchissement de barrière (combat) prend en compte les gains de session. (Le cartouche sous les tests de compétence utilisait déjà bestHeroForSkill.)"
    ]
  },
  {
    "v": "v2.2.60",
    "date": "2026-06-29",
    "title": "boutons de gain de compétence (niveau supérieur)",
    "changes": [
      "Couleurs des cartouches adoucies (moins vives).",
      "Nom de la compétence aligné à gauche, bonus +X aligné à droite.",
      "Au clic, le bonus passe à +X+1 et s'affiche en vert (texte sombre vert pour le jaune Perception, pour le contraste)."
    ]
  },
  {
    "v": "v2.2.58",
    "date": "2026-06-29",
    "title": "VFX de combat + cartouches de compétence du niveau supérieur",
    "changes": [
      "Attaque Contact : estafilade oblique sur la cible.",
      "Attaque Distance : projectile filant de l'attaquant vers la cible.",
      "Brûlure : halo de feu pulsé sur les combattants en FEU.",
      "Mouvement : glissement (FLIP) de la carte d'une zone à l'autre.",
      "Critique : secousse de l'écran (screen shake). Tout passe par la file fxQueue/flushFx existante (transform/opacity, GPU, auto-nettoyage, respect de prefers-reduced-motion) : aucun surcoût notable."
    ]
  },
  {
    "v": "v2.2.57",
    "date": "2026-06-29",
    "title": "inversion des séparateurs diagonaux 1-4 et 2-3",
    "changes": [
      "Les séparateurs diagonaux des paires 1-4 et 2-3 étaient orientés à l'inverse de la logique (le mur doit être perpendiculaire à la ligne reliant les deux zones). Échange des orientations : 1-4 → down-left, 2-3 → down-right."
    ]
  },
  {
    "v": "v2.2.56",
    "date": "2026-06-29",
    "title": "talent adverse AGILE sélectionnable (déclencheur cross_difficult_free)",
    "changes": [
      "Le déclencheur « Agile : franchit les terrains difficiles sans test » manquait dans le registre TRIGGER_DEFS de l'éditeur de talents adverses : le talent AGILE retombait sur le premier déclencheur et son effet (déjà codé dans le moteur) n'était jamais rattaché. Ajout du déclencheur au registre."
    ]
  },
  {
    "v": "v2.2.55",
    "date": "2026-06-29",
    "title": "barrières : contraintes adversaires, talents AGILE/Pieds Sûrs, libellés",
    "changes": [
      "Les adversaires sont soumis aux barrières comme les aventuriers : infranchissable/mur bloquent, Difficile exige un test d'Agilité (sbire 1, alpha/solitaire 2, boss 3) ; échec = mouvement perdu, pas d'attaque.",
      "Talent adversaire AGILE et amélioration aventurier « Pieds Sûrs » : franchissent les terrains difficiles sans test.",
      "Échec de franchissement : message flottant central « Échec de franchissement ! ».",
      "Nom de la barrière (DIFFICILE / INFRANCHISSABLE / MUR) affiché sur les séparateurs (police fixe n'élargissant pas les blocs ; texte vertical pour les séparateurs verticaux)."
    ]
  },
  {
    "v": "v2.2.53",
    "date": "2026-06-29",
    "title": "nom de destinataire non tronqué + séparateurs diagonaux",
    "changes": [
      "Écran de résultat de combat : le nom du destinataire du butin n'est plus coupé (.cs-loot-dest passe à la ligne au lieu de tronquer avec « … »).",
      "Séparateurs diagonaux entre les zones adjacentes en diagonale (1–4 et 2–3) quand une barrière y est posée : croix centrale, même design que les séparateurs orthogonaux (orange = infranchissable, rouge = mur, gris = difficile), dans le module de combat et la preview d'aventure."
    ]
  },
  {
    "v": "v2.2.52",
    "date": "2026-06-29",
    "title": "barrières par paire, MUR, blocage réel et séparateurs visuels",
    "changes": [
      "Modèle de barrières par paire de zones (clé « min-max ») : toutes les paires configurables dans l'éditeur (dont la barrière 1–4 en disposition 2x2), avec migration de l'ancien tableau linéaire.",
      "OBSTRUANTE renommée MUR (ni déplacement ni tir).",
      "Blocage effectif des déplacements : Mouv., attaque au contact (clic carte et attaque multiple) et IA. Zones derrière un mur/infranchissable non sélectionnables (cible et déplacement).",
      "DIFFICILE : test d'Agilité au franchissement (déplacement ET attaque au contact) ; échec = mouvement perdu, attaque/action conservée, journalisé.",
      "MUR bloque aussi le tir (shootBlocked).",
      "Séparateurs-blocs colorés entre les zones du module de combat et de la preview (orange = infranchissable, rouge = mur, gris = difficile) ; paires diagonales affichées en étiquette."
    ]
  },
  {
    "v": "v2.2.51",
    "date": "2026-06-29",
    "title": "Preview combat : grille 2x2 + couleurs correctes",
    "changes": [
      "Disposition de combat en grille 2×2 (comme le module de combat) au lieu d'une rangée flex",
      "Vignettes adversaires colorées par type (sbire/alpha/solitaire/boss) et aventuriers par classe — mêmes teintes que les cartes de combat",
      "Barrières de la preview affichées en liseré + étiquette (réutilise le style du module), plus de séparateur vertical"
    ]
  },
  {
    "v": "v2.2.50",
    "date": "2026-06-29",
    "title": "Compétences à la montée de niveau, refonte preview combat, barrières entre zones",
    "changes": [
      "Niveaux impairs (3,5,7…) : chaque aventurier gagne +1 dans 2 compétences DIFFÉRENTES (puces colorées par compétence) ; pris en compte dans les tests (g.skills)",
      "Refonte façon module de combat : vignettes compactes séparées par aventurier/adversaire, fond de zone plus clair",
      "Éditeur de scène : type de barrière entre chaque paire de zones consécutives (Aucune / Infranchissable / Difficile (test d'Agilité, difficulté réglable) / Obstruante)",
      "Combat : Infranchissable bloque le déplacement (tir possible) ; Obstruante bloque déplacement ET tir ; Difficile franchissable via test d'Agilité (1d6+Agilité, difficulté facile/moyen/difficile)",
      "IA adverse respecte les barrières (déplacement, tir, Happe)",
      "Visuel : liseré + étiquette colorés (Orange=Infranchissable, Rouge=Obstruante, Gris=Difficile) dans le module ET séparateur vertical dans la preview"
    ]
  },
  {
    "v": "v2.2.49",
    "date": "2026-06-29",
    "title": "Cartouche compétence coloré selon la compétence (bouton + languette)",
    "changes": [
      ".ssk-skill devient une forme de cartouche commune (non scoppée au pill) → le badge s'affiche aussi sur le bouton de choix",
      "La couleur du cartouche/texte suit la classe skill-<compétence> (mêmes teintes que la création d'aventurier), au lieu d'un vert fixe"
    ]
  },
  {
    "v": "v2.2.48",
    "date": "2026-06-29",
    "title": "Cartouche compétence identique sur le bouton de choix et la languette (badge vert, sans bonus)",
    "changes": []
  },
  {
    "v": "v2.2.47",
    "date": "2026-06-29",
    "title": "Ajustements languette test de compétence + ⚔️ devant les choix de combat",
    "changes": [
      "Languette de test : largeur ajustée au contenu (ne prend plus toute la ligne)",
      "Un seul 🎲 devant le libellé (le doublon JS a été retiré, le ::before CSS reste)",
      "Retrait de l'icône bouclier devant le nom de l'aventurier",
      "La languette indique '<Compétence> X 🎲' (X = 1 + bonus = nb de dés lancés), + cartouche de difficulté conservé",
      "Les choix menant à un combat affichent ⚔️ devant le libellé"
    ]
  },
  {
    "v": "v2.2.46",
    "date": "2026-06-29",
    "title": "Récompenses séparées + boutons de choix retravaillés",
    "changes": [
      "Récompenses : XP et Équipement dans deux cases distinctes (liserés doré / vert), avec une marge sous chaque case (ne touche plus le bouton de choix)",
      "Boutons de choix : nouvelle police (Trebuchet MS) ; couleurs PASTEL (douces mais visibles), texte sombre",
      "Choix avec test : libellé '🎲 <Texte> (<Compétence>)' — nom de la compétence directement (sans le mot 'Compétence')",
      "Sous ces choix : languette bien visible (aventurier le plus apte, compétence, bonus +X, difficulté colorée) inspirée de la création d'aventurier"
    ]
  },
  {
    "v": "v2.2.45",
    "date": "2026-06-28",
    "title": "Équipement modifiable hors module de combat",
    "changes": [
      "Le verrou d'équipement ne s'applique QUE lorsque le module de combat de la partie active est réellement en cours (combat démarré, non terminé) — via Session.combatModuleActive()",
      "Sur les pages d'aventure de type Combat (disposition affichée, avant 'Lancer le combat') et après la victoire, l'équipement reste modifiable"
    ]
  },
  {
    "v": "v2.2.44",
    "date": "2026-06-28",
    "title": "Versions inférieures auto-déséquipées + correctif réutilisation de Riposte",
    "changes": [
      "Onglet Talents : une version supérieure déséquipe automatiquement la/les version(s) inférieure(s) (retirées de g.equipped) et leur case devient non cochable (disabled)",
      "Riposte (Contre-Attaque) : utilisable UNIQUEMENT pendant l'interruption qu'elle déclenche, jamais comme action libre au tour des héros ; les marqueurs tookDamage/lastAttacker sont effacés au début du tour des héros (un coup subi au tour adverse ne rend plus la Riposte 'prête' ensuite)"
    ]
  },
  {
    "v": "v2.2.43",
    "date": "2026-06-28",
    "title": "Bouton récompense, nettoyage arborescence talents",
    "changes": [
      "Bouton Continuer renommé 'Prendre la/les Récompense(s) et Continuer' quand la scène accorde des récompenses non encore prises",
      "Onglet Talents : suppression du petit tag illisible '↓ remplacé' (l'info passe en infobulle, la version reste grisée)",
      "Flèche d'arborescence des versions supérieures : ↳ (au lieu de ↑)"
    ]
  },
  {
    "v": "v2.2.42",
    "date": "2026-06-28",
    "title": "Inventaire (armes en double, combat), récompenses, choix de scène",
    "changes": [
      "Bug coche qui 'saute' sur la 1ère copie : mise à jour incrémentale de la ligne basculée (plus de re-rendu si aucun autre objet n'est déséquipé)",
      "Max 2 exemplaires d'une même arme par aventurier (3e ni affiché ni accordé) — addToHeroOwned plafonne, affichage plafonné",
      "Équiper une nouvelle arme 1 main avec 2 armes identiques : ne déséquipe plus qu'UNE seule (ensureHandsFree libère 1 slot à la fois)",
      "Interdiction de modifier l'équipement pendant un combat (message d'erreur)",
      "Onglet Inventaire (Aventure) clignote à l'arrivée d'un nouvel objet, jusqu'à ouverture",
      "Réordonner les Choix (boutons ↑ / ↓)",
      "Boutons de Choix en couleur PLEINE (opaque), texte blanc gras en police Georgia",
      "Récompenses en ligne : languettes et menus déroulants à la taille de l'onglet Inventaire"
    ]
  },
  {
    "v": "v2.2.41",
    "date": "2026-06-28",
    "title": "Arborescence de talents (versions), tri, portée de cibles, récompenses en ligne",
    "changes": [
      "Chip de prérequis déplacé à droite (n'est plus masqué par le badge de type)",
      "Tri Nom / Niveau dans l'onglet Classes",
      "Arborescence de versions : en combat, seule la version la plus évoluée agit (resolveHeroTalents masque les versions prérequises) — corrige Charge/Hameçonnage qui n'utilisait que la val de la version la plus basse",
      "Onglet Talents (joueur) : versions regroupées, version précédente grisée + flèche vers la supérieure",
      "Nouvelle option de portée des cibles (Nombre X / Toute la zone / Tout le combat) pour les effets multi-cibles (Charge, Double Attaque, Salve)",
      "Plus de fenêtre ni de bouton Récupérer : les objets s'affichent en ligne dans la scène avec une liste de sélection d'aventurier ; XP et objets sont attribués automatiquement au clic sur Continuer (grantSceneRewardsFromDOM dans navigateTo)"
    ]
  },
  {
    "v": "v2.2.40",
    "date": "2026-06-28",
    "title": "Système de Réactions interruptif + correctifs objets/Hameçonnage",
    "changes": [
      "Tour des adversaires interrompu quand un aventurier peut riposter (Riposte/Contre-Attaque) : texte central 'RÉACTION !', pause",
      "Bouton de réaction clignote fort en violet ; bandeau auto-sélectionne l'aventurier concerné",
      "Bouton 'Reprendre le Tour' (place du Tour des Adversaires) pour décliner",
      "Déclencher la réaction reprend ensuite la séquence ; 1 réaction/tour/combattant",
      "Adversaires : nouveau talent RIPOSTE (counter_attack) qui se déclenche TOUJOURS automatiquement (1×/tour)",
      "Ciblage d'objet : la vignette affiche 'Choisir' (vert) au lieu de 'Frapper'",
      "Consommation : correction du bug — l'objet est réellement retiré de l'inventaire de l'aventurier (load() détachait activeSession, perdant la mutation)",
      "L'effet d'arrivée (charge) évite désormais les cibles avec Blindage actif (sinon il était silencieusement absorbé) — cause du 'talent qui se désactive'"
    ]
  },
  {
    "v": "v2.2.39",
    "date": "2026-06-28",
    "title": "Arborescence de talents (prérequis), résumé d'objet, récompenses de scène améliorées",
    "changes": [
      "Champ 'Nécessite (talent prérequis)' dans l'éditeur de talents : crée une arborescence (ex. Hameçonnage → Hameçonnage 2)",
      "À la montée de niveau, un talent n'est proposé que si son prérequis est déjà acquis",
      "Languette de talent (Classes) : badge '↳ <prérequis>'",
      "Éditeur d'objet : champ 'Résumé de l'effet' rédigeable (prioritaire sur l'auto-génération)",
      "Sélecteur en cascade : Type (Arme / Arme à distance / Armure / Objet) → liste filtrée → quantité",
      "Fenêtre de répartition : quand plusieurs aventuriers, choix du destinataire de chaque objet reçu (design des Objets de l'inventaire)"
    ]
  },
  {
    "v": "v2.2.38",
    "date": "2026-06-28",
    "title": "Objets consommables (potions de soin) + fix récompenses de scène",
    "changes": [
      "Modèle d'objet consommable : objEffect (heal), objDice (nb de d6), objBenefic (bénéfique → aventuriers / négatif → adversaires)",
      "Éditeur d'armurerie : nouveau bloc 'Effet de l'objet' (effet, cible, nb de dés, prix) affiché pour la catégorie object",
      "3 potions officielles : Petite/Potion/Grande Potion de Soin (2d6/4d6/6d6) — ajoutables via 'Charger le catalogue officiel'",
      "Combat : objet équipé résolu dans instFromHero ; bouton Objet actif seulement si un objet est équipé",
      "Bouton Objet : confirmation 'Vous allez consommer votre <objet>…' puis ciblage d'une vignette (aventurier si bénéfique, adversaire si négatif) ; applique l'effet (soin Xd6) et consomme l'objet",
      "Session.consumeObject() retire l'objet de l'inventaire de l'aventurier (déséquipe si épuisé)",
      "Récompenses de scène : les objets/armes récupérés sont désormais ajoutés à l'inventaire d'un aventurier (heroOwned), donc équipables — auparavant seul le stock global était incrémenté"
    ]
  },
  {
    "v": "v2.2.37",
    "date": "2026-06-28",
    "title": "Talent Rebond (2 mouvements gratuits + attaque) ; retrait de l'étoile Mouv.",
    "changes": [
      "Nouveau talent Rebond (action) : octroie 2 mouvements gratuits ce tour ; le bouton Mouv. reste cliquable tant qu'il reste des mouvements gratuits, puis l'aventurier attaque normalement",
      "Compteur freeMoves générique (réinitialisé chaque tour), prioritaire sur freeMoveReady ; consomme le mouvement gratuit sans dépenser le mouvement normal",
      "Bouton Mouv. : retrait de la petite étoile ✦ (free-move-dot) — aligne le bouton avec Objet/Analyse"
    ]
  },
  {
    "v": "v2.2.36",
    "date": "2026-06-28",
    "title": "Niveau Supérieur : rappel de carac affiche juste la valeur (sans 'actuel :')",
    "changes": []
  },
  {
    "v": "v2.2.35",
    "date": "2026-06-28",
    "title": "Pré-Tour automatisé + valeurs actuelles au Niveau Supérieur",
    "changes": [
      "Journal : 'Pré-Tour X : <Aventuriers> ont un talent à utiliser (appuyez sur Tour X pour passer)'",
      "Pré-Tour : démarrage automatique du vrai tour dès que tous les talents de pré-tour ont été utilisés (plus aucun freeMoveReady) ; bouton Tour X conservé pour passer manuellement",
      "Niveau Supérieur : rappel de la valeur actuelle (DÉGÂTS / ENDU / VIE) sur chaque bouton de choix de caractéristique"
    ]
  },
  {
    "v": "v2.2.34",
    "date": "2026-06-27",
    "title": "PROIE : choix du critère de cible + talent HAPPE",
    "changes": [
      "PROIE : nouveau sélecteur de critère de désignation (plus de PV, moins de PV, plus faible DEF, plus forte DEF, aléatoire) via modeParam/targetMode ; pickMarkTarget() applique le critère",
      "Nouveau talent de monstre HAPPE (pull_to_zone) : avant d'attaquer, l'adversaire déplace de force un aventurier d'une autre zone dans la sienne (puis l'attaque)",
      "Résumé de talents : affiche la couleur et le critère de cible de PROIE"
    ]
  },
  {
    "v": "v2.2.33",
    "date": "2026-06-27",
    "title": "Talent de monstre PROIE (mark_target_dice)",
    "changes": [
      "Nouveau talent de monstre PROIE : au début de chaque tour, désigne l'aventurier le plus coriace ; tous les adversaires ajoutent X dé(s) de la couleur choisie (Blanc/Orange/Rouge/Bleu/Jaune/Noir) à leurs attaques contre lui",
      "Éditeur de talents adverses : nouveau sélecteur de couleur de dé (visible pour PROIE), via colorParam/markColor",
      "Combat : designateMarkedHero() au début de chaque tour (et au Tour 1) ; dés bonus ajoutés au pool dans resolveAttack contre l'aventurier marqué",
      "UI : carte de l'aventurier désigné surlignée en rouge + badge « 🎯 Proie » ; journal annonce la désignation avec les dés"
    ]
  },
  {
    "v": "v2.2.32",
    "date": "2026-06-27",
    "title": "Correctif Au Sol adversaire : le runner séquentiel sautait les adversaires Au Sol avant actOneMonster, qui ne se relevaient donc jamais. Le garde n'exclut plus l'état auSol.",
    "changes": []
  },
  {
    "v": "v2.2.31",
    "date": "2026-06-27",
    "title": "Blindage absorbant, barre bleue BLINDAGE, Au Sol adversaire",
    "changes": [
      "Journal : retrait du ⬛ dans le texte de dégâts de Feu en fin de tour",
      "Blindage : barre de PV bleue affichant « BLINDAGE » (même police que les PV) tant qu'il est actif",
      "Blindage : absorbe les dégâts de TOUTE source (Feu, charge, poison, attaque d'opportunité) en consommant une source — helper absorbBlindage()",
      "Au Sol (adversaire) : se relève avec son mouvement puis attaque une cible déjà dans sa zone (ne peut plus changer de zone)"
    ]
  },
  {
    "v": "v2.2.30",
    "date": "2026-06-27",
    "title": "Blindage halo, gras dans les scènes, ergonomie Pré-Tour & états",
    "changes": [
      "Blindage : halo bleu pulsant sur la barre de PV tant que Blindage est actif (état ou charges)",
      "Éditeur de scène : **gras** et *italique* dans les blocs de texte (rendu côté joueur) + indice dans le textarea",
      "Pré-Tour : surlignage jaune des aventuriers ayant un talent à jouer ; le bouton « Tour X » clignote quand il n'en reste plus",
      "Pré-Tour : présélection d'un aventurier disposant d'un talent de pré-tour",
      "Résultat de combat : précision ajoutée à « Coma — Perte de VIE »",
      "États : retrait du « ✕ » — les états ne se retirent plus manuellement",
      "Au Sol : un adversaire Au Sol passe son tour à se relever (plus neutralisé indéfiniment)",
      "Mouv. avec effet d'arrivée : cliquer un adversaire précis lui applique l'effet en priorité ; cliquer la zone seule → premier adversaire"
    ]
  },
  {
    "v": "v2.2.29",
    "date": "2026-06-26",
    "title": "6 nouveaux effets de talents",
    "changes": [
      "Insaisissable (passif) : ignore les dégâts des attaques d'opportunité",
      "Course (action) : effectue un mouvement (consomme l'action, pas le mouvement)",
      "Coup de Grâce (passif) : pas d'échec (double 1) contre une cible AU SOL — les 1 comptent comme des dés normaux",
      "Expertise (amélioration) : +X réussites aux tests de la compétence choisie",
      "Assaut Handicapant (amélioration) : inflige FEU/AU SOL/AFFAIBLI (au choix) en chargeant au contact",
      "Mur Imbrisable (passif) : les critiques adverses contre vous deviennent des échecs",
      "dice.js : option noFumble (annule l'échec, garde les dés)",
      "combat.js : dchocFrom (ignore_opportunite), chargeOnEnter (charge_etat), resolveAttack (pas_echec_ausol + crit_en_echec), moveCombatant/atk-chip (action_mouvement via moveAsAction)",
      "session.js : bestHeroForSkill/runSkillTest tiennent compte de boost_competence",
      "classes.js : éditeur de talents avec select de choix (compétence / état)",
      "store.js : catalogue + talentEffectList préservent le champ choice"
    ]
  },
  {
    "v": "v2.2.28",
    "date": "2026-06-26",
    "title": "Retire le cartouche 'pts de talent' de la barre d'XP du groupe",
    "changes": []
  },
  {
    "v": "v2.2.27",
    "date": "2026-06-26",
    "title": "Pré-Tour 1 dans les combats de session",
    "changes": [
      "startInSession() : ajoute l'appel needsPretour()/startPretour() après buildCombat, comme startCombat(). Les combats d'aventure (mode session) déclenchent maintenant le Pré-Tour 1."
    ]
  },
  {
    "v": "v2.2.26",
    "date": "2026-06-26",
    "title": "Corrections Pré-Tour",
    "changes": [
      "needsPretour() : vérifie aussi h.freeMoveReady pour détecter le Tour 1 (avant que startHeroTurn ne l'ait recalculé)",
      "Journal : 'Tour X' n'est plus loggué dans advanceTurn si le pré-tour est actif ; il l'est dans startTurnFromPretour() au clic du bouton [Tour X →]",
      "Action bar : auto-sélection du héros pendant la phase pretour (comme en phase heroes)",
      "canPretour : nouveau flag transmis à abToolsHtml et wireCard",
      "Bouton Mouv. : activé pendant le Pré-Tour si freeMoveReady (les autres boutons restent désactivés)",
      "wireCard : câble le bouton Mouv. pendant pretour si freeMoveReady"
    ]
  },
  {
    "v": "v2.2.25",
    "date": "2026-06-26",
    "title": "Écran résultat de combat et Niveau Supérieur",
    "changes": [
      "Analyse et Sans une égratignure toujours affichés (Aucun/Aucune + 0 XP) pour informer les joueurs des bonus possibles",
      "Butin : mention '(À équiper dans l'Inventaire)' ajoutée",
      "Choix de carac : lignes hw-stat-row2 colorées (rouge/vert/violet) avec indicateur ○/✓, cohérent avec la création d'aventurier",
      "Talents : séparés en deux sections TALENTS GÉNÉRIQUES et TALENTS DE CLASSE"
    ]
  },
  {
    "v": "v2.2.24",
    "date": "2026-06-26",
    "title": "Système de Pré-Tour",
    "changes": [
      "Nouveau needsPretour() : actif si un héros a Pas Léger/Rapide ou un adversaire est Rapide",
      "startPretour() : phase 'pretour', freeMoveReady aux héros éligibles, adversaires rapides auto-agissent",
      "startHeroTurn(afterPretour) : si afterPretour=true, ne réattribue pas freeMoveReady déjà joué",
      "startTurnFromPretour() : bascule de pretour → heroes, démarre le vrai tour",
      "advanceTurn() : appelle startPretour() ou startHeroTurn() selon needsPretour()",
      "startCombat() : déclenche le Pré-Tour 1 si nécessaire",
      "UI : pill 'Pré-Tour X' en doré, bouton [Tour X →] avant [Tour des Adversaires →]",
      "CSS : .phase-pill.pretour (doré), .start-turn-btn (bouton doré)"
    ]
  },
  {
    "v": "v2.2.23",
    "date": "2026-06-26",
    "title": "VIE X/X : mise en forme corrigée (même taille/graisse), seule la valeur courante en rouge, PV redevient valeur max fixe (pas de session en contexte fiche)",
    "changes": []
  },
  {
    "v": "v2.2.22",
    "date": "2026-06-26",
    "title": "corrige VIE actuelle/max (≠ PV), Classes: clic languette=descriptif/crayon=éditeur, types abrégés ACT/REAC/MAIT/PASS/AME + couleurs lisibles, maîtrise en blanc, textes centraux empilés, durée flottants -30%",
    "changes": []
  },
  {
    "v": "v2.2.21",
    "date": "2026-06-26",
    "title": "combat UX: VIE X/X partout, talent names unifiés, log talent nommé, floats non-superposés, durées ×2, défaite inline, tour flottant",
    "changes": []
  },
  {
    "v": "v2.2.20",
    "date": "2026-06-26",
    "title": "butin combat : languettes identiques et moins larges",
    "changes": [
      "cs-loot-dest en largeur fixe (4.8rem) : toutes les languettes ont la même longueur quel que soit le nom du destinataire. Conteneur limité à 26rem."
    ]
  },
  {
    "v": "v2.2.19",
    "date": "2026-06-26",
    "title": "compétences wizard : fonds clairs pastel (cohérent avec les stat rows)",
    "changes": [
      "Remplacement des rgba semi-transparents (invisibles sur fond sombre) par des couleurs hexadécimales claires pour chaque vignette de compétence, avec texte foncé lisible."
    ]
  },
  {
    "v": "v2.2.18",
    "date": "2026-06-26",
    "title": "4 classes jouables, wizard stats/compétences colorées, tenue corrigée, talent desc",
    "changes": [
      "Classes : seuls Destructeur, Gardien, Lamevent, Pyromane sont affichés (données préservées)",
      "Tenue de voyage : slot corrigé (armorId pour les armures, objectId sinon) — s'équipe bien",
      "Caractéristiques wizard : icônes supprimés, chiffres lisibles sur fond coloré",
      "Compétences wizard : vignettes colorées par compétence (textes lisibles)",
      "Talents wizard : clic sur la languette affiche/masque la description ; clic sur la case à cocher fait la sélection radio — les deux actions sont désormais indépendantes"
    ]
  },
  {
    "v": "v2.2.17",
    "date": "2026-06-26",
    "title": "tenue de voyage auto-équipée à la création et au lancement de session",
    "changes": [
      "Ajout de ensureStartEquipment(h) : garantit que la Tenue de voyage (slot objectId) est équipée sur le héros ET dans baseEquipment dès que l'objet existe en armurerie. Appelé dans wizNext() (création) et startSessionWithHeroes() (lancement de session), ce qui couvre aussi les anciens héros créés avant ce correctif."
    ]
  },
  {
    "v": "v2.2.16",
    "date": "2026-06-26",
    "title": "wizard : couleurs classes/stats, descriptions équipement, vignettes talents + radio",
    "changes": [
      "Classe : boutons colorés selon la palette de chaque classe (fond + bordure + texte)",
      "Caractéristiques : vignettes DÉGÂTS (rouge), ENDU (teal), VIE (violet)",
      "Équipement : remplacement des labels par textes playstyle + description sous chaque combo",
      "Talents : vignettes au format armurerie (inv-strip, border-left par type, badge tl-kind)",
      "Talents : sélection radio — cocher un talent décoche automatiquement le précédent"
    ]
  },
  {
    "v": "v2.2.14",
    "date": "2026-06-25",
    "title": "Écran de niveau supérieur déclenché après un combat",
    "changes": [
      "La montée de niveau s'affiche dès que le niveau de la session dépasse le dernier niveau résolu, sans dépendre de pendingNav (qui n'était posé qu'à la navigation)",
      "Si aucune scène de suite n'est ciblée après le combat, on reste sur la scène courante une fois les choix de niveau effectués (pendingNav = scène courante)"
    ]
  },
  {
    "v": "v2.2.13",
    "date": "2026-06-25",
    "title": "Titre talents centré, butin en vignettes, armes en double corrigées",
    "changes": [
      "Bandeau de combat : titre des boutons de talent (action/réaction) centré",
      "Écran de résultat : butin du groupe affiché avec les vignettes d'équipement (dés / DEF), même design que l'Inventaire et l'Armurerie",
      "Armes en double (ex. deux épées courtes) :",
      "cocher une copie n'équipe plus automatiquement les deux (gestion par exemplaire, slot par slot : la N-ième copie cochée occupe la N-ième main libre)",
      "décocher une copie ne retire plus que cet exemplaire",
      "en combat, deux épées courtes donnent bien 4 dés (2 blancs + 2 os) une fois les deux mains équipées"
    ]
  },
  {
    "v": "v2.2.12",
    "date": "2026-06-25",
    "title": "Écran de résultat de combat : sortie garantie",
    "changes": [
      "finishCombat force toujours le réaffichage de la vue Aventure (Session.renderPlay) pour un combat de session — le combat étant purgé, cela ne peut plus relancer le combat et garantit la sortie de l'écran de résumé, même si le contexte de session est incomplet ou si le gestionnaire d'événement ne re-rend pas",
      "L'écouteur du bouton « Continuer » est rattaché au bouton DANS le conteneur courant (évite un homonyme resté dans un panneau de combat masqué)",
      "Bouton « Continuer » sur un résumé obsolète (combat déjà purgé) : réaffiche aussi la vue Aventure au lieu de ne rien faire"
    ]
  },
  {
    "v": "v2.2.11",
    "date": "2026-06-25",
    "title": "Groupe épuré, titres de talents en combat, déblocage écran de résultat",
    "changes": [
      "Onglet Groupe (joueur) : masque les attaques et talents, et retire le clic d'ouverture de la fiche de perso (n'affiche que caractéristiques + compétences)",
      "Bandeau de combat : agrandit de 50% le titre des BOUTONS de talents actifs (.ab-atk-talname, ex. « Double Attaque ») ; revient à la taille normale pour les emplacements de talents non cliquables",
      "Écran de résultat de combat : « Continuer l'aventure » ne bloque plus",
      "le gestionnaire de fin de combat re-rend toujours la vue (try/catch + repli)",
      "navigation vers la scène de suite seulement si elle existe réellement",
      "la pénalité de VIE du coma est préservée lors de la synchro des PV"
    ]
  },
  {
    "v": "v2.2.10",
    "date": "2026-06-25",
    "title": "Suppression talent générique corrigée, retrait des pré-construits",
    "changes": [
      "Classes (MJ) : suppression d'un talent générique intégré désormais persistante (pierres tombales dans le localStorage — le complément auto ne le réinjecte plus)",
      "Mode MJ/Admin : onglet « Aventuriers » retiré",
      "Suppression de la notion d'aventuriers pré-construits :",
      "pool « Aventuriers Pré-construit » retiré de la page de lancement d'aventure",
      "bouton « + Pré-construit » retiré de la page de groupe",
      "La création d'aventuriers reste disponible sur la page d'accueil du mode Aventure"
    ]
  },
  {
    "v": "v2.2.09",
    "date": "2026-06-25",
    "title": "Tenue de voyage, talents bandeau, coma VIE, bouton Pré-construit",
    "changes": [
      "Wizard Équipement : Tenue de voyage auto-équipée et affichée (non décoché)",
      "Bandeau combat : texte des 6 talents centré et agrandi de 50% (0.7→1.05rem)",
      "Coma → VIE : bug corrigé (Store.state.sessions inexistant → Store.loadSessions()) + VIE effective inclut les gains de niveau (g.vie) + Message de perte de VIE dans l'écran de résultat de combat (section rouge)",
      "Groupe : bouton « + Pré-construit » réapparu dans l'en-tête de la page de sélection"
    ]
  },
  {
    "v": "v2.2.08",
    "date": "2026-06-25",
    "title": "Intro d'aventure, pools de groupe, inventaire engagés, vignettes d'équipement",
    "changes": [
      "Écran d'introduction « L'Aventure commence ! » après « Commencer l'aventure » (style scène)",
      "Bandeau de combat : talents passif/maîtrise/amélioration remplis et lisibles (couleurs onglet Talents)",
      "Inventaire (onglet Aventure) : n'affiche que le groupe engagé (max 4), plus tous les aventuriers",
      "Pool « Aventuriers Pré-construit » : toujours affiché (modèles clonés au lancement)",
      "Pool « Aventuriers » : n'affiche plus les clones de pré-construits (séparation des pools)",
      "Wizard Caractéristiques : description DÉGÂTS dynamique (+valeur réelle), « Continuer » bloqué tant que les 3 points ne sont pas placés",
      "Wizard Équipement : vignettes d'objets avec icônes de dés / DEF (cohérence avec l'inventaire)"
    ]
  },
  {
    "v": "v2.2.07",
    "date": "2026-06-25",
    "title": "Stats de départ, Niveau Supérieur+VIE, couleurs fiches, talents wizard, suppression groupe",
    "changes": [
      "Stats de départ : DÉGÂTS 0 / ENDU 0 / VIE 3 (au lieu de 2/3/4)",
      "Niveau Supérieur : ajout de l'option +1 VIE ; affichage ENDU actuelle et gain PV pour chaque choix",
      "effectiveHero() applique les gains de VIE des montées de niveau (g.vie)",
      "Onglet Sauvegardes : remplace « Sessions » par « Sauvegardes » dans le titre",
      "Groupe (renderGroupSetup) : boutons de suppression sur chaque aventurier et pré-construit",
      "Wizard Caractéristiques : description de chaque stat (DÉGÂTS / ENDU / VIE)",
      "Wizard Équipement : affichage des dés de dégâts pour chaque combinaison",
      "Wizard Talents : maîtrise auto-ajoutée en haut, choix 1 seul talent, tri Génériques puis Classe, sans type ni niveau",
      "Fiche de perso : couleurs par stat (violet VIE, teal ENDU, vert PV, rouge DÉGÂTS)"
    ]
  },
  {
    "v": "v2.2.06",
    "date": "2026-06-25",
    "title": "group setup categories, wizard steppers/combos, level-up redesign",
    "changes": [
      "Tabs: swap Talents/Inventaire order; rename Session → Sauvegardes",
      "Remove \"Équipement de Départ\" item field; wizard offers 3 starting weapon combos (Épée courte ×2 / Épée courte + Bouclier / Arc court)",
      "Group setup screen: two categories (Aventuriers / Aventuriers Pré-construit); prebuilt models cloned into the adventure on launch. Groupe tab now empty until the adventure is launched (shows only engaged heroes)",
      "Wizard Caractéristiques: −/+ steppers (increment & decrement before validating); colored PV formula ENDU × VIE (+Classe) = PV",
      "Wizard talent cards: compact row layout (no longer oversized)",
      "Wizard Compétences: 3 points, max 2 per skill, −/+ steppers",
      "Groupe tab cards: show Vie, Endurance, PV, Défense, Dégâts",
      "Level-up screen redesigned: one column per hero (Talents-tab design), ENDU/DÉGÂTS choice at top, talents as tpe-rows with checkbox + description; fixes buttons resizing on selection"
    ]
  },
  {
    "v": "v2.2.05",
    "date": "2026-06-25",
    "title": "stat choices wizard, coma→VIE loss, talent description+checkbox",
    "changes": [
      "Wizard: new \"Caractéristiques\" step (+1 DÉGÂTS / +2 ENDURANCE / +1 VIE, 3 clicks max, live PV preview); applied to hero on creation",
      "Combat: hero coma → -1 VIE for the adventure; at 0 VIE hero dies and leaves the session heroIds; effectiveHero applies viePenalty to PV calc",
      "Wizard talent step + level-up screen: clicking talent body shows description; explicit checkbox handles selection",
      "CSS: fix wizard \"Suivant\" button flush to right edge (add padding to modal-actions and hw-steps); new hw-stat-list / hw-pv-preview styles; lvl-tal-wrap / lvl-tal-cb / lvl-tal-desc styles"
    ]
  },
  {
    "v": "v2.2.04",
    "date": "2026-06-25",
    "title": "resolve class talents (not just generic) for combat banner",
    "changes": []
  },
  {
    "v": "v2.2.03",
    "date": "2026-06-25",
    "title": "adversary strip name-only, inventory auto-unequip, colored class names + click-for-info in player Talents, hero editor lvl-1 talents",
    "changes": []
  },
  {
    "v": "v2.2.02",
    "date": "2026-06-25",
    "title": "rebuild player Talents rows with self-contained layout so talent names render",
    "changes": []
  },
  {
    "v": "v2.1.01",
    "date": "2026-06-25",
    "title": "red damage-bonus indicator + redesign Adversary Talents tab to match Classes design",
    "changes": []
  },
  {
    "v": "v2.98",
    "date": "2026-06-25",
    "title": "Retire la rangée de toggles d'états du bandeau de combat",
    "changes": [
      "Le bandeau ne montre plus que les états ACTIFS (badges). Les états sont appliqués par les talents, plus par des boutons manuels. Retour à l'aspect d'avant."
    ]
  },
  {
    "v": "v2.97",
    "date": "2026-06-25",
    "title": "Onglet Talents joueur, équipement de 6 talents, sélection niv.1, tris & couleurs",
    "changes": [
      "Nouvel onglet « Talents » : une section par aventurier engagé, ses talents débloqués cochables (design des Classes, couleurs par type)",
      "On équipe jusqu'à 6 talents ; cocher un 7e décoche le plus bas de la liste",
      "Sélection propre à la partie (levelGains.equipped) ; auto-équipe les nouveaux talents tant qu'il reste un emplacement",
      "Le bandeau de combat affiche désormais TOUS les talents équipés dans ses 6 emplacements (action jouable, réaction, ou libellé passif/amélioration/maîtrise), triés ACTION → MAÎTRISE → RÉACTION → PASSIF → AMÉLIORATION",
      "Nouvelle étape « Talents » dans l'assistant : choix de 2 talents de niveau 1 max (génériques + classe), stockés sur l'aventurier (startTalents) et injectés dans la partie",
      "Talents : « En combat » par défaut dans l'éditeur",
      "Onglet Classes : talents triés par Niveau, puis Type, puis ordre alphabétique",
      "Armurerie : armes triées par nombre de dés, puis puissance des dés (faibles en haut), puis nom",
      "Objets/Armes/Armures : case « Équipement de Départ » ; seuls ces objets sont proposés à la création d'un aventurier",
      "Encyclopédie : réordonnancement (▲/▼) et tri A→Z des entrées"
    ]
  },
  {
    "v": "v2.96",
    "date": "2026-06-25",
    "title": "Implémentation complète des 8 ÉTATS de combat",
    "changes": [
      "FEU : 1 dé noir (⬛) infligé à tous les combattants en feu en fin de tour (applyEndOfTurnStates), avant la fuite",
      "BRISÉ (nouveau) : DEF 0 tant que l'état est actif (comme AU SOL)",
      "AU SOL : blocage complet des actions (attaque, talent, objet, analyse) ; bouton « Se relever » remplace le bouton Mouv., consomme le mouvement",
      "FAILLE (nouveau) : 1 dé ROSE (pink) ajouté au pool d'attaque ; les dés partageant la face du dé rose sont exclus des dégâts (dice.js)",
      "POISON X (nouveau, cumulable) : X dégâts avant chaque Attaque, Talent ou Mouvement ; cumulable sur states.poison",
      "ONDE : intégration aux nouveaux états (brise, faille, poison) via applyStates",
      "Badges d'états dans cartes et bandeau d'action (tous les 9 états, y compris les nouveaux)",
      "Toggles MJ dans le bandeau d'action pour ajouter/retirer n'importe quel état (clic = toggle ; clic droit = reset Poison)",
      "Page tutoriel « États de Combat » auto-seeded et toujours à jour (8 états par ordre alphabétique)",
      "Dé rose : nouvelle couleur CSS, règle faillePaired dans dice.js"
    ]
  },
  {
    "v": "v2.95",
    "date": "2026-06-25",
    "title": "nouveaux effets + catégorie Maîtrise ; bibliothèque sans noms",
    "changes": [
      "Bibliothèque des effets : n'affiche plus le nom inventé, seulement la description, toujours rangée par catégorie",
      "Nouvelle catégorie d'effets « Maîtrise » (teal) câblée partout",
      "Améliorations :",
      "Perce-Blindage : les attaques ignorent Blindage",
      "Bourreau des Rapides : dégâts doublés contre un adversaire rapide",
      "Passif :",
      "Réflexes Aiguisés : agir avant les adversaires rapides (cf. note)",
      "Maîtrises :",
      "Pas Léger : 1 mouvement gratuit par tour",
      "Charge Dévastatrice : inflige le bonus de dégâts à X adversaires en arrivant dans leur zone"
    ]
  },
  {
    "v": "v2.94",
    "date": "2026-06-25",
    "title": "cumul générique des talents d'action partageant un effet",
    "changes": [
      "Plusieurs talents de type Action portant le même effet s'empilent désormais en une seule attaque : leurs valeurs X sont sommées, les dés/portée hérités du premier qui les définit. Permet à un talent de niveau supérieur de renforcer un talent existant (ex. « +1 Orbe de Feu »)."
    ]
  },
  {
    "v": "v2.93",
    "date": "2026-06-25",
    "title": "effets multiples par talent + nouveaux effets d'action",
    "changes": [
      "Talents : un talent peut désormais cumuler plusieurs effets (ex. attaquer ET se soigner)",
      "Éditeur : liste de lignes d'effet, chacune avec ses paramètres (X, portée, dés)",
      "double_attaque : nombre de cibles (X) désormais éditable",
      "Nouveaux effets d'action :",
      "salve_zone : inflige ses propres dés à X adversaires (contact/distance)",
      "assaut_mobile : 1 mouvement gratuit + 1 attaque en une seule action",
      "soin_fixe / soin_endu / soin_des : soins auto-ciblés (PV fixes, ENDU+X, dés 🟩)"
    ]
  },
  {
    "v": "v2.92",
    "date": "2026-06-25",
    "title": "dropdown effets affiche la description plutôt que le titre",
    "changes": []
  },
  {
    "v": "v2.91",
    "date": "2026-06-25",
    "title": "onglet Classes au design Armurerie (colonnes a languettes + mini-fenetre)",
    "changes": [
      "Carte d'en-tete, recherche et filtre par groupe comme l'Armurerie.",
      "Talents affiches en colonnes (Generiques + 8 classes), une languette par talent, coloree par type d'effet (Action bleu, Reaction violet, Passif vert, Amelioration ambre).",
      "Edition par mini-fenetre (nom, groupe, niveau, effet, variable X, dispo, description) avec deplacement de groupe et suppression.",
      "Bibliotheque des effets conservee en panneau repliable."
    ]
  },
  {
    "v": "v2.90",
    "date": "2026-06-25",
    "title": "feuille de perso joueur (classe a droite, armes epurees, talents corriges)",
    "changes": [
      "Nom de classe aligne a droite dans l'en-tete (a cote de la croix).",
      "Attaques d'arme : nom + des de degats alignes a droite, sans le type (contact/distance) ni les bonus.",
      "Correction : un aventurier ne montre plus les talents non debloques (Double Attaque au niveau 1). displayHero force la liste de talents choisis meme hors session, supprimant le fallback niveau de groupe.",
      "Les talents sont presentes dans une section dediee, en badges colores par type (Action = bleu), sans des d'attaque."
    ]
  },
  {
    "v": "v2.89",
    "date": "2026-06-25",
    "title": "systeme d'effets de talents (bibliotheque + 20 effets cables)",
    "changes": [
      "ACTION (bleu, consomme l'action) : Double Attaque, Frappe Puissante, Coup Renversant, Attaque Affaiblissante, Attaque Enflammee, Frappe Tournoyante, Tir Charge.",
      "PASSIF (auto) : Tueur au Sol, Achevement, Meute, Frappe Lourde, Maitre a Distance, Cuirasse, Regeneration.",
      "AMELIORATION : Arme Enflammee, Arme Vampirique, Esquive Innee, Garde Imprenable.",
      "REACTION (violet, declenchee) : Contre-Attaque, Reanimation."
    ]
  },
  {
    "v": "v2.88",
    "date": "2026-06-25",
    "title": "degats rouge, talents niv1 corriges, UI niveau superieur, talent sans des",
    "changes": []
  },
  {
    "v": "v2.87",
    "date": "2026-06-25",
    "title": "ecran Niveau Superieur (choix carac + talent), talents choisis explicitement",
    "changes": [
      "Les talents (dont Double Attaque niv.2) ne sont plus auto-accordes par le niveau de groupe : ils se choisissent a chaque montee de niveau. Les aventuriers debutent donc chaque aventure niveau 1 sans Double Attaque.",
      "Ecran « Niveau Superieur ! » declenche au Continuer d'une scene ou apres un resultat de combat des qu'un niveau est franchi (un niveau a la fois).",
      "Pour chaque aventurier : +2 ENDU ou +1 Degats, et selection d'un talent disponible au nouveau niveau. Continuer verrouille tant que tout n'est pas rempli.",
      "Gains stockes par session (decorreles de l'Admin) et appliques en combat et sur la feuille de perso."
    ]
  },
  {
    "v": "v2.86",
    "date": "2026-06-25",
    "title": "dés talents, couleur bleue talent action, DEF 0",
    "changes": []
  },
  {
    "v": "v2.85",
    "date": "2026-06-25",
    "title": "XP analyse/sans-dégât, talent générique Double Attaque, alignements",
    "changes": [
      "DEF (vignettes) et Mouv. (bandeau) réalignés (fin du décalage vertical)",
      "Combattant sélectionné : +100% de saturation (teinte conservée)",
      "Analyse d'un groupe d'ennemis : +2 XP (une fois par groupe nommé), affiché",
      "Aventurier sans dégât subi : +1 XP, affiché à l'écran de résultat",
      "Écran de résultat : détail du calcul d'XP (vaincus / analyse / sans dégât)",
      "Ligne de soin simplifiée : « Soin X PV ! (PV totaux) »",
      "Nouveau talent générique niveau 2 « Double Attaque » (dégâts d'arme à 2 adversaires d'une même zone), débloqué pour tous au niveau 2 du groupe",
      "Visible dans le bandeau de combat et la feuille de perso",
      "Fonctionnel : clic sur le talent puis sélection de 2 adversaires",
      "Onglet Talents (MJ) : groupe « Talents génériques » en tête, puis chaque classe ; design aligné sur l'armurerie"
    ]
  },
  {
    "v": "v2.84",
    "date": "2026-06-25",
    "title": "corrige l'affichage armurerie admin (roster-list grid neutralisé)",
    "changes": [
      "Ajout de la classe inv-strip-layout sur #item-list dans renderGrouped pour neutraliser le display:grid de roster-list qui écrasait le layout 4 colonnes."
    ]
  },
  {
    "v": "v2.83",
    "date": "2026-06-25",
    "title": "retire l'affichage de la moyenne (~N) dans les languettes arme",
    "changes": []
  },
  {
    "v": "v2.82",
    "date": "2026-06-25",
    "title": "inventaire 4 colonnes Mêlée/Distance/Armures/Objets avec en-tête unique",
    "changes": [
      "Colonne 2 = Armes à Distance (séparation contact vs. ranged par i.ranged)",
      "En-tête de colonnes affiché une seule fois en haut, pas répété par héros",
      "DEF armure : icône assets/DEF N.png au lieu du texte \"DEF N\"",
      "Bonus affiché : moyenne ~N à côté des dés dans la languette arme",
      "Expansion de quantité : armes/objets → N languettes par N exemplaires ; armures → 1 seule (dédup)",
      "Mode Admin/MJ : même disposition 4 colonnes en languettes (bouton édition ✎ à droite)"
    ]
  },
  {
    "v": "v2.81",
    "date": "2026-06-25",
    "title": "Inventaire Joueur : languettes en 4 colonnes + mini-fenêtre",
    "changes": [
      "Remplace les vignettes carrées par des languettes (nom à gauche, valeur à droite : dés pour armes, DEF pour armures, effet pour objets).",
      "Disposition par aventurier en 4 colonnes : 2 armes / 1 armure / 1 objets.",
      "Clic sur une languette ouvre une mini-fenêtre (design des feuilles de perso) avec toutes les infos de l'objet.",
      "Équipement par clic (case) et surlignage de l'équipement actif conservés."
    ]
  },
  {
    "v": "v2.80",
    "date": "2026-06-25",
    "title": "onglets Tutoriel (Joueur) + Encyclopédie (Admin), duplication de scène",
    "changes": [
      "Tutoriel (Joueur) : nouvel onglet deux colonnes — vignettes des titres à gauche, cadre de contenu à droite. Données via Store.loadTutorials.",
      "Encyclopédie (Admin) : nouvel onglet pour ajouter, dupliquer et éditer les entrées du tutoriel (titre + texte). Dupliquer incrémente le titre.",
      "Narration : bouton ⧉ Dupliquer dans l'éditeur de scènes — la copie est insérée juste après l'originale, avec de nouveaux identifiants (scène, blocs, choix) et un titre incrémenté (« Scène » → « Scène 2 »)."
    ]
  },
  {
    "v": "v2.79",
    "date": "2026-06-25",
    "title": "désactivation des automatisations clic ennemi/zone",
    "changes": [
      "Retrait de l'attaque automatique (clic héros puis ennemi) : il faut cliquer le bouton d'attaque puis l'adversaire.",
      "Retrait du déplacement automatique (clic héros puis zone) : il faut cliquer le bouton Mouv. puis la zone.",
      "Suppression de la classe/CSS hero-movable devenue inutile.",
      "Le ciblage par bouton conserve son comportement correct : seule une attaque de contact déplace l'aventurier ; une attaque à distance (tir) ne déplace pas."
    ]
  },
  {
    "v": "v2.78",
    "date": "2026-06-25",
    "title": "combattant sélectionné : saturation +50% au lieu d'assombrissement",
    "changes": []
  },
  {
    "v": "v2.77",
    "date": "2026-06-25",
    "title": "DEF/Mouv. translateY, sélectionné assombri, survol zones",
    "changes": [
      "DEF icon : transform:translateY(-4px) au lieu de position:top (sans impact flux)",
      "Mouv. : transform:translateY(-3px) idem",
      ".combat-card.selected::after : overlay rgba(0,0,0,.45) pour assombrir -100% tout en conservant la teinte de fond par classe ; contour jaune reste visible",
      ".combat-zone.movable:hover : surbrillance bleue renforcée",
      ".combat-zone.hero-movable : nouvelle classe quand héros sélectionné peut bouger → survol zone = contour marron pointillé + teinte de fond"
    ]
  },
  {
    "v": "v2.76",
    "date": "2026-06-25",
    "title": "FIX: renderCard plantait (isEnemy utilisé avant déclaration)",
    "changes": [
      "Bug introduit en v2.74 : 'has-action' utilisait la const isEnemy avant sa déclaration (temporal dead zone) → ReferenceError dans renderCard pour CHAQUE carte → rendu du fallback d'erreur (⚠ rouge, fond uniforme, pas de contour). Remplacé par c.side === 'hero'.",
      "Cela restaure : contour jaune-orangé du sélectionné, fonds colorés par classe, contour bleu has-action, surbrillance/Frapper des cibles. Overlay .selected::after passé en teinte ambre (était rouge)."
    ]
  },
  {
    "v": "v2.75",
    "date": "2026-06-25",
    "title": "suppression filter brightness sur vignette sélectionnée",
    "changes": [
      "Retire filter:brightness(0.5) qui masquait le contour jaune-orangé et effaçait les couleurs de fond par classe des aventuriers."
    ]
  },
  {
    "v": "v2.74",
    "date": "2026-06-25",
    "title": "automatisation clics, dés Os, opportunité, journal, contours",
    "changes": [
      "Clic héros + clic ennemi → attaque automatique (1re attaque disponible)",
      "Clic héros + clic zone → déplacement automatique si mouvement disponible",
      "Dé Os (bone) sur double exclu du décompte d'échec (ne cause pas double 1)",
      "Attaque d'opportunité à distance : la cible éliminée ne contre-attaque pas",
      "Contour jaune-orangé (accent-2) pour le combattant sélectionné",
      "Contour bleu pour les aventuriers avec action non utilisée",
      "Journal compact élargi pour afficher 4 lignes",
      "DEF icon remontée à top:-6px, Mouv. à top:-4px"
    ]
  },
  {
    "v": "v2.73",
    "date": "2026-06-25",
    "title": "alignement DEF/Mouv., vignette sélectionnée assombrie",
    "changes": [
      "DEF icon dans vignettes zone : position relative top:-3px (remonte correctement)",
      "Bouton Mouv. : position relative top:-2px (s'aligne avec Objet/Analyse)",
      "Vignette combat sélectionnée : filter brightness(0.5) pour assombrir de 50%"
    ]
  },
  {
    "v": "v2.72",
    "date": "2026-06-25",
    "title": "accueil résumé +30%, talents inconnus/vides, DEF pvline, Mouv. aligné",
    "changes": [
      "Résumé aventure (parchemin) : taille de texte +30% (1.07rem)",
      "Talents adversaires : masqués avant analyse → \"Talent Inconnu\" (style neutre) révélés après analyse (nom réel, style ambré)",
      "Emplacements de talent vides : opacity 30% (50% moins visibles)",
      "Icône DEF dans vignettes de zone : légèrement remontée (margin-bottom)",
      "Bouton Mouv. du bandeau : décalage vertical corrigé, aligné avec Objet et Analyse"
    ]
  },
  {
    "v": "v2.71",
    "date": "2026-06-25",
    "title": "combat : masquage attaques ennemies, analyse groupe, DEF pvline, UI résultat",
    "changes": [
      "Attaques ennemies : dés et bonus masqués avant analyse, révélés après",
      "Analyse : révèle tous les adversaires du même nom de base (Répurgateur 1, 2…)",
      "Vignettes de zone : icône DEF déplacée à droite de la barre PV (héros + ennemis connus)",
      "Vignettes de zone : bonus dégâts adversaire supprimé (visible uniquement dans le bandeau)",
      "Bouton \"Tour des Adversaires\" : brun par défaut, rouge + pulsation quand tous ont agi",
      "Résultat combat : \"+X XP\" + \"Expérience Gagnée\" ; vaincus fond rouge clair, fuite gris clair"
    ]
  },
  {
    "v": "v2.70",
    "date": "2026-06-25",
    "title": "sélection perso : avatar rond, icône DEF, compétences visibles, sans Rapide",
    "changes": [
      "Avatar rond (image ou initiales) affiché dans chaque carte de sélection",
      "DEF affichée avec l'icône blason (DEF 1..6.png)",
      "Compétences visibles (fix : seule la section Attaques est masquée via .atk-section)",
      "Tag \"Rapide\" masqué dans cet écran (opt hideRapide)"
    ]
  },
  {
    "v": "v2.69",
    "date": "2026-06-25",
    "title": "sélection héros : design original + masque attaques ; résultat combat refonte",
    "changes": [
      "Revient aux cartes heroCardHtml (couleurs de classe, 3 par ligne) en masquant la section Attaques via CSS (.hero-pick-list .roster-section { display:none })",
      "Bannière Victoire/Défaite : texte blanc lisible, aligné avec l'icône",
      "Tableau combattants : 4e colonne \"Statut\" avec couleur par état (soigné=vert, coma=rouge, vaincu/fuite=gris/orange)",
      "Suppression des blocs \"Adversaires détruits\", \"En fuite\" et \"Soins de fin\" (remplacés par la colonne Statut)",
      "XP : \"+X\" en gros, \"Expérience Gagnée\" en sous-titre"
    ]
  },
  {
    "v": "v2.68",
    "date": "2026-06-25",
    "title": "sélection personnages : carte compacte avec avatar rond",
    "changes": [
      "Remplace la fiche complète (avec attaques) par une carte compacte : avatar rond (image ou initiales), Nom, Classe, PV, DEF, DÉGÂTS, COMPÉTENCES. Les attaques n'apparaissent plus sur cet écran."
    ]
  },
  {
    "v": "v2.67",
    "date": "2026-06-25",
    "title": "refonte accueil, combat, UI générale",
    "changes": [
      "Titre renommé « Amertüme Solo RPG » (home + topbar), sous-titre supprimé",
      "Carte aventure : badges durée/difficulté sur la ligne du haut avec le titre ; clic sur toute la carte lance l'aventure ; résumé sur fond parchemin",
      "Sélection de personnages (Joueurs) : affiche Nom/Classe/PV/DEF/DÉGÂTS/COMPÉTENCES",
      "Bouton + Pré-Construit désormais en vert clair",
      "Bouton « Terminer » renommé « Supprimer » dans la gestion des sessions",
      "Onglet « Session » retiré du mode MJ/Admin",
      "Fin de combat : soigne tous les aventuriers d'1d6 + END (pas seulement ceux à terre) → résumé affiche +X PV → Y pour chaque aventurier"
    ]
  },
  {
    "v": "v2.66",
    "date": "2026-06-25",
    "title": "bandeau combat +25 % de hauteur, DEF sans carré blanc",
    "changes": [
      "Hauteur du bandeau et de ses boutons +25 %, contenu agrandi proportionnellement (lignes d'action, avatar, PV, dés, libellés, icônes attaque/tir, blason DEF)",
      "Suppression du carré blanc (fond + bordure) derrière l'icône de DEF"
    ]
  },
  {
    "v": "v2.65",
    "date": "2026-06-25",
    "title": "DEF par image (DEF 1..6), icône attaque/tir en pastille ronde",
    "changes": [
      "Badge DEF : images DEF 1.png à DEF 6.png selon la valeur (chiffre intégré) ; DEF VIDE.png conservé en repli pour 0 (ou >6)",
      "Icône attaque/tir : pastille ronde gris clair à contour sombre, calée à gauche du bouton, dés de dégâts repoussés à droite"
    ]
  },
  {
    "v": "v2.64",
    "date": "2026-06-25",
    "title": "icônes PNG pour DEF et boutons Attaque/Tir",
    "changes": [
      "Badge DEF : fond DEF VIDE.png (blason transparent) remplace shield.svg",
      "Bouton attaque mêlée : image Attack_melee_b.png remplace le texte « Attaque »",
      "Bouton attaque distance : image Attack_range_b.png remplace le texte « Tir »"
    ]
  },
  {
    "v": "v2.63",
    "date": "2026-06-24",
    "title": "DEF affichée dans un blason (logo bouclier)",
    "changes": [
      "La valeur de DEF du combat (bandeau d'action + vignettes d'adversaires analysés) s'affiche désormais centrée dans un logo bouclier au lieu de l'emoji 🛡. Le blason est un SVG vectoriel (assets/shield.svg) — net à toute taille — et la valeur reste du texte HTML centré, lisible sur le fond blanc du bouclier."
    ]
  },
  {
    "v": "v2.62",
    "date": "2026-06-24",
    "title": "bandeau : colonnes fixes, labels Attaque/Tir, dés max, images combattants",
    "changes": [
      "1. Colonnes du bandeau enfin fixes : ab-id width 0 0 190px (largeur constante quelle que soit la longueur du nom) → ab-acts reçoit toujours la même place → chaque colonne minmax(0,1fr) est identique entre tous les aventuriers.",
      "2. Boutons d'attaque dans le bandeau : remplace le nom de l'arme par « Attaque » (contact) ou « Tir » (distance). Fin des sauts de layout. Le nom réel reste dans le tooltip (title).",
      "3. Icônes de dés dans le bandeau : 22px × 22px (max sans déborder du bouton 32px).",
      "4. Vignettes de zone : supprime la ligne DEF / + x Dég. pour les aventuriers (gardée pour les adversaires analysés).",
      "5. Champ Image (URL web) ajouté dans les modales Aventurier (MJ) et Monstre (MJ). L'URL est persistée dans imageUrl. En combat, l'avatar rond (bandeau et vignette de zone) affiche la photo si renseignée, la lettre initiale sinon."
    ]
  },
  {
    "v": "v2.61",
    "date": "2026-06-24",
    "title": "combat : corrige le plateau vide / boutons morts (IDs scopés au root)",
    "changes": [
      "Bug : en lançant un combat d'aventure (rendu dans #session-combat-root), le bandeau, les zones et le journal restaient vides et les boutons inertes.",
      "Cause : Combat.init() peint au chargement le combat actif dans #combat-root (onglet test MJ, caché, situé plus haut dans le DOM). renderActionBar, renderZones, renderLog, renderCemetery, renderPhaseControls et le câblage des boutons cherchaient leurs éléments via document.querySelector('#id') global, qui renvoyait la PREMIÈRE occurrence — celle du board caché — au lieu du board visible. Les rendus partaient donc dans le mauvais conteneur.",
      "Correctif : scoper toutes ces requêtes au root de rendu actif ($(rootSel)), comme le faisaient déjà wireCard et fxAnchor. Le board visible reçoit désormais son contenu et ses gestionnaires d'événements."
    ]
  },
  {
    "v": "v2.60",
    "date": "2026-06-24",
    "title": "bandeau : colonnes de taille fixe (minmax(0,1fr))",
    "changes": [
      "Corrige le fait que les colonnes de la grille d'actions variaient selon le personnage (nombre de dés, longueur du nom d'attaque). La cause : grid-auto-columns: 1fr respecte le min-content des cellules. Le remplacement par minmax(0,1fr) + min-width:0 sur les enfants impose des colonnes strictement égales, indépendantes du contenu."
    ]
  },
  {
    "v": "v2.59",
    "date": "2026-06-24",
    "title": "bandeau combat : avatars, stats, layout, zones, bouton adversaires",
    "changes": [
      "1. Corrige le layout du bandeau : ab-card en nowrap, col1 reste en première colonne 2. Boutons désactivés : opacity 1, seul le fond est atténué (texte pleinement lisible) 3. Icônes de dés agrandies dans les attaques du bandeau 4. Barre PV du bandeau plus haute (22px) pour correspondre aux cartes de zone 5. Cercle avatar (initiale) à gauche de chaque vignette de zone 6. Ligne DEF + bonus dégâts sous la barre PV dans les cartes de zone 7. Journal de combat toujours visible à 4 lignes minimum 8. Suppression des couleurs de zone par type d'occupant 9. Fond des zones allégé (~25% plus clair) 10. Bouton « Tour des Adversaires » déplacé dans la barre de combat (haut) 11. Bouton « Tour des Adversaires » clignote quand tous les héros ont agi"
    ]
  },
  {
    "v": "v2.58",
    "date": "2026-06-24",
    "title": "Combat : suppression du message « Impossible d'afficher les combattants »",
    "changes": [
      "Le message d'erreur (+ diagnostic) qui apparaissait quand aucune carte ne se plaçait dans une zone est supprimé. À la place, on FORCE le rendu de tous les combattants (aventuriers + adversaires actifs), regroupés, en se basant uniquement sur leur camp/statut (aucune dépendance au placement de zone) : le plateau est toujours affiché et jouable, sans jamais montrer d'erreur."
    ]
  },
  {
    "v": "v2.57",
    "date": "2026-06-24",
    "title": "Bandeau de combat : hauteur+, transparence+, colonnes, sélection, talents adverses, pastille d'action",
    "changes": [
      "Hauteur des boutons des deux lignes augmentée de ~25 % (26px → 32px).",
      "Transparence de tous les boutons augmentée de ~25 % (fonds en rgba .75).",
      "Colonnes d'action raccourcies (~-30 %) ; la colonne Nom/PV s'agrandit proportionnellement et affiche le nom complet sans le tronquer.",
      "Surbrillance du combattant sélectionné nettement renforcée (liseré épais + halo coloré + voile) : aucun doute sur qui est sélectionné.",
      "Adversaires : l'attaque occupe la colonne Action (comme l'arme des aventuriers) et les talents passifs (FUYARD, SOUTIEN…) occupent les emplacements Talents.",
      "Pastille bleue en haut à droite des vignettes d'aventurier tant que l'Action / Attaque n'est pas utilisée ; elle disparaît une fois l'action faite."
    ]
  },
  {
    "v": "v2.56",
    "date": "2026-06-24",
    "title": "Bandeau de combat : les boutons remplissent toute la largeur + alignement",
    "changes": [
      "La grille d'actions occupe désormais TOUTE la largeur disponible du bandeau (colonnes égales en 1fr au lieu d'une largeur fixe) : plus de talents écrasés à gauche avec du vide à droite.",
      "Les figurines de dés ne reviennent plus à la ligne (nowrap) : elles ne débordent plus sous le bouton, ce qui désalignait les lignes (Mouv/Objet/ Analyse) et chevauchait les talents."
    ]
  },
  {
    "v": "v2.55",
    "date": "2026-06-24",
    "title": "Combat : filet anti-plateau-vide (dernier recours dans renderZones)",
    "changes": [
      "Si, malgré l'auto-réparation des zones, aucun combattant n'a pu être placé dans une zone (placement incohérent, snapshot hérité…), on affiche désormais tous les combattants regroupés dans le premier conteneur au lieu de tomber sur le diagnostic « Impossible d'afficher les combattants ». Le combat reste jouable."
    ]
  },
  {
    "v": "v2.54",
    "date": "2026-06-24",
    "title": "Bandeau de combat : tailles fixes, boutons 40% plus fins, sans infos de portée",
    "changes": [
      "Toutes les tailles sont FIXES quel que soit le texte : avatar 40px, colonne Nom/PV de largeur fixe (nom tronqué en ellipsis), barre de PV de hauteur fixe, grille d'actions en colonnes fixes (108px) et lignes fixes.",
      "Épaisseur des boutons des deux lignes réduite de ~40 % (44px → 26px) ; figurines de dés réduites en conséquence.",
      "Les infos de portée (contact / distance / cibles / gratuite) ne s'affichent plus sur les boutons d'action — elles restent disponibles en infobulle."
    ]
  },
  {
    "v": "v2.53",
    "date": "2026-06-24",
    "title": "Bandeau de combat : grille 2 lignes × colonnes (cf. croquis)",
    "changes": [
      "Colonne 1 : icône + Nom / barre de PV",
      "Colonne 2 : Attaque (haut) + Mouv / Objet / Analyse (bas)",
      "Colonne 3 : Talent 1 / Talent 2",
      "Colonne 4 : Talent 3 / Talent 4",
      "Colonne 5 : Talent 5 / Talent 6 Les attaques spéciales occupent les emplacements Talents dans l'ordre."
    ]
  },
  {
    "v": "v2.52",
    "date": "2026-06-24",
    "title": "Aventure : blocs colorés, fonctions universelles, scène pré-remplie, PV verts",
    "changes": [
      "Toute nouvelle scène démarre avec un bloc narratif déjà présent.",
      "Le fond de chaque bloc de texte reprend la couleur de son type (narratif, technique, alerte, conseil) — repère visuel mis à jour au changement de type.",
      "Le type de scène n'est plus qu'un libellé pour se repérer dans l'arbre : toutes les fonctions (suite, choix, combat, récompense) sont désormais disponibles dans TOUTES les scènes, quel que soit le type.",
      "Le rendu d'une scène suit son CONTENU et non son type : récompense, combat, choix et suite s'affichent dès qu'ils sont présents (cumulables). Récupérer une récompense n'interrompt plus la scène si elle propose aussi un combat ou des choix ; une récompense déjà prise n'est pas re-créditée.",
      "Barres de PV de la colonne de droite : même fond sombre + même vert que le module de combat."
    ]
  },
  {
    "v": "v2.51",
    "date": "2026-06-24",
    "title": "Fix « Continuer l'aventure » bloqué + bandeau : style des boutons restauré",
    "changes": [
      "Bouton « Continuer l'aventure » : la sortie du combat (navigation / reprise de l'aventure) se fait désormais AVANT les rafraîchissements secondaires (roster, progression), eux-mêmes isolés en try/catch. Un échec de ces rendus ne bloque plus l'écran de résumé de fin de combat.",
      "Style des boutons restauré : bouton d'attaque pleine largeur, solide, au contenu riche (nom + portée + figurines de dés + bonus de Dégâts + usages).",
      "Les 3 boutons Mouv / Objet / Analyse sur une rangée juste en dessous, occupant ensemble la même largeur que le bouton d'attaque.",
      "Figurines de dés et « +Dégâts » de nouveau affichés sur les attaques.",
      "Classe du personnage de nouveau affichée dans le bandeau.",
      "Les attaques spéciales restent logées dans les 6 emplacements Talents (3×2), en version compacte."
    ]
  },
  {
    "v": "v2.50",
    "date": "2026-06-24",
    "title": "Bandeau de combat : boutons fixes, talents 3×2, cartes de zone épurées",
    "changes": [
      "Boutons d'action de taille FIXE et identique (attaque, Mouv/Objet/Analyse, talents) — opaques et lisibles, taille constante quel que soit le texte",
      "Attaques spéciales (aventuriers ET adversaires) placées dans les 6 slots Talents, répartis en 3 colonnes × 2 lignes ; reste = placeholders « Talent N »",
      "Nom du combattant lisible (couleur sombre, comme sur la carte de zone)",
      "PV : texte blanc + barre verte (aventuriers) dans le bandeau",
      "Suppression du bandeau de ciblage (.ab-prompt)",
      "Cartes de zone épurées : plus de classe, DEF, blindage ni « Rapide » (aventuriers et adversaires) — le détail figure dans le bandeau à la sélection"
    ]
  },
  {
    "v": "v2.49",
    "date": "2026-06-24",
    "title": "Module de combat : bandeau-fiche du combattant sélectionné",
    "changes": [
      "On clique une carte (aventurier ou adversaire) → sa fiche s'affiche dans le bandeau : avatar rond (image à venir, initiale pour l'instant), NOM, barre de PV, DEF, ses attaques, les boutons Mouv./Objet/Analyse, puis 6 emplacements de talents (« Talent 1 … 6 », placeholders pour l'instant).",
      "Les cartes de zone deviennent un affichage cliquable (liseré sur la sélection) ; en phase héros, le 1er aventurier actif est sélectionné par défaut. Fiche d'un adversaire = lecture seule.",
      "Le moteur est inchangé : les boutons gardent data-iid/data-atk et sont câblés par wireCard exactement comme avant → attaques, ciblage, déplacements et dégâts fonctionnent à l'identique."
    ]
  },
  {
    "v": "v2.48",
    "date": "2026-06-24",
    "title": "Combat illisible : diagnostic détaillé + sortie propre vers la scène",
    "changes": [
      "Le diagnostic du plateau de secours détaille désormais les placements réels (side+zone+statut de chaque combattant), le nombre de conteneurs de zone, et surtout le MESSAGE D'ERREUR de renderZones s'il a planté.",
      "« Quitter ce combat » nettoie proprement le combat et revient à sa scène (via Session.renderPlay) au lieu de déclencher une défaite : on peut donc relancer le combat à neuf — un combat fraîchement construit s'affiche correctement."
    ]
  },
  {
    "v": "v2.47",
    "date": "2026-06-24",
    "title": "Combat vide réparé : auto-réparation des zones des combattants",
    "changes": [
      "Diagnostic (v2.46) : 8 combattants en mémoire mais 0 carte affichée → les valeurs `zone` des combattants étaient corrompues (hors limites / mauvais type), donc aucun ne correspondait à une zone et tout le plateau restait vide.",
      "Correctif : à chaque rendu du plateau, on garantit pour chaque combattant une zone entière valide dans [0, nbZones-1] (coercition des chaînes / NaN / hors-limites vers une zone valide). Le combat persisté cassé se ré-affiche normalement. Le filet de secours « Quitter ce combat » reste en place pour tout cas résiduel."
    ]
  },
  {
    "v": "v2.46",
    "date": "2026-06-24",
    "title": "Journal : noms/vocabulaire + décomposition des dégâts ; combat vide diagnostiqué",
    "changes": [
      "Tous les noms d'adversaires sont colorés selon leur type (toutes les lignes, y compris fuite, états, soutien) ; aventuriers selon leur classe.",
      "Mort d'un adversaire : « <Adversaire> est vaincu ! » avec « est vaincu ! » dans la même couleur que le gros texte flottant (ambre) ; coma d'un héros en rouge.",
      "Décomposition des dégâts : (Dé + Dé + Dégâts) — le bonus de Dégâts apparaît comme dernier terme entre parenthèses.",
      "Correction de la double ponctuation « Dégâts infligés !. » → « … infligés ! ».",
      "Catch-all : si AUCUNE carte de combattant n'est affichée malgré des combattants en mémoire, on remplace le plateau vide par une issue de secours « Quitter ce combat » + un diagnostic (nombre d'aventuriers / adversaires / zones) pour identifier la cause au lieu de rester bloqué."
    ]
  },
  {
    "v": "v2.45",
    "date": "2026-06-24",
    "title": "Journal de combat enrichi + filet anti-combat-vide",
    "changes": [
      "Noms colorés : aventuriers selon leur classe, adversaires selon leur type.",
      "Attaque : « <Aventurier> attaque <Adversaire> avec <Arme> (dés) : X Dégâts infligés ! ».",
      "Déplacement + attaque dans la même action fusionnés sur une seule ligne : « <X> se déplace <Zone> et attaque <Y> … » (héros auto-déplacé et adversaires).",
      "Attaques d'opportunité reformulées : « Attaque d'Opportunité ! <Adversaire> inflige X Dégâts à <Aventurier> car il utilise une arme à distance dans sa zone » (et « car il quitte sa zone » pour le déplacement).",
      "startInSession ne crée plus de combat si aucun aventurier du groupe n'est trouvé : message clair invitant à reconstituer le groupe.",
      "renderBoard : un combat sans aventurier affichable propose une issue de secours « Quitter ce combat » au lieu d'un plateau vide bloquant."
    ]
  },
  {
    "v": "v2.44",
    "date": "2026-06-24",
    "title": "Combat : journal compact en haut, boutons interactifs plus lisibles, PV verts en aventure",
    "changes": [
      "Journal de combat déplacé en haut, entre la barre (Tour/XP) et la ligne d'instruction. Compact : ~3 lignes visibles, scrollable au-delà (plus de gros bloc en bas de l'écran).",
      "Affordance « cliquable » sur les boutons réellement interactifs du combat (attaques, Mouv./Objet/Analyse) : lift au survol, enfoncement au clic ; les libellés d'attaques ennemies restent plats (non cliquables).",
      "Mode aventure (joueurs) : barres de PV du groupe (colonne de droite) en vert, comme dans le module de combat."
    ]
  },
  {
    "v": "v2.43",
    "date": "2026-06-24",
    "title": "Correctif : animations résiduelles rejouées au démarrage d'un combat",
    "changes": [
      "La file d'animations (fxQueue) et la couche d'effets (#combat-fx) étaient globales et n'étaient pas purgées au changement de combat. Des effets en attente du combat précédent (dégâts, coma, glissement de barre de PV) rejouaient sur le combat suivant — et comme les aventuriers conservent le même iid d'un combat à l'autre, un glissement de PV résiduel vidait même la barre du héros du nouveau combat (alors qu'il avait encore des PV).",
      "Correctif : setCombat purge fxQueue et vide l'overlay #combat-fx à chaque (ré)assignation du combat. Les blessures réelles, elles, sont conservées volontairement d'un combat à l'autre (pas d'auto-soin — repos entre combats)."
    ]
  },
  {
    "v": "v2.42",
    "date": "2026-06-24",
    "title": "Combat (taille, PV verts, talents LENT/SOUTIEN/BLINDAGE) + éditeur d'aventures",
    "changes": [
      "Barres de PV des aventuriers en vert (même style que les adversaires).",
      "Filet de sécurité supplémentaire : render() ne laisse plus jamais un module de combat totalement vide (message + bouton « Réessayer »).",
      "« Socle » devient « Taille » (Moyen / Grand / Énorme ; « Petit » retiré).",
      "La place occupée en combat dépend désormais de la TAILLE (et non du type) : Moyen = ½ colonne, Grand = pleine largeur, Énorme = pleine largeur + 2 lignes.",
      "Trois nouveaux talents adverses (ajoutés au catalogue, même aux catalogues existants via un merge à la lecture) :",
      "LENT — ne peut pas attaquer s'il s'est déplacé.",
      "SOUTIEN — les adversaires de sa zone infligent +X dégâts.",
      "BLINDAGE X — ignore X prochaines sources de dégâts (charges affichées 🛡✦).",
      "Suppression du bouton « Jouer » dans la liste des aventures (Admin/MJ) : on joue depuis l'espace Joueur.",
      "Éditeur de scène : la liste des scènes cibles ne montre plus que la 1re scène de chaque AUTRE chapitre (toutes celles du chapitre courant restent). Un lien déjà posé vers une scène masquée reste sélectionnable (pas de perte de lien)."
    ]
  },
  {
    "v": "v2.41",
    "date": "2026-06-24",
    "title": "Correctif : adversaires « fantômes » frappant au démarrage d'un combat",
    "changes": [
      "Le tour ennemi séquencé (v2.39) planifie ses activations via setTimeout. Si un nouveau combat démarrait (ou si le combat se terminait) avant la fin de la séquence, les setTimeout en attente s'exécutaient sur le NOUVEAU combat : des adversaires de la partie précédente frappaient les aventuriers fraîchement placés — d'où des dégâts subis « au démarrage » sans qu'aucun monstre rapide ne soit en cause.",
      "Correctif : toute (ré)assignation du combat (setCombat) incrémente un jeton de génération, annule le setTimeout en attente et stoppe la séquence. Chaque séquence capture le jeton à son lancement et s'interrompt si le combat a changé."
    ]
  },
  {
    "v": "v2.40",
    "date": "2026-06-24",
    "title": "Combat : adversaire vaincu (texte central), numérotation sans #, type masqué",
    "changes": [
      "Adversaire tombé à 0 PV : annonce centrale « <Nom> est vaincu ! » (en plus du fondu fantôme de sa carte).",
      "Numérotation des exemplaires sans « # » : « Répurgateur 2 » au lieu de « #2 ».",
      "Numérotation globale par adversaire sur tout le combat (toutes zones confondues), car un adversaire peut changer de zone — chaque exemplaire garde son propre numéro où qu'il aille.",
      "La carte de combat n'affiche plus le type de l'adversaire (Sbire/Solitaire/…) : gain de place, plus de retour à la ligne.",
      "monsterNum/baseName adaptés au format « Nom N » (l'ordre d'activation reste Sbire → Alpha → Solitaire → Boss, puis par numéro)."
    ]
  },
  {
    "v": "v2.39",
    "date": "2026-06-24",
    "title": "Combat : gros textes centraux + activations ennemies séquencées",
    "changes": [
      "Échec d'attaque et CRITIQUE : affichés en gros au centre de l'écran (« ÉCHEC », « CRITIQUE ! ») au lieu d'un texte flottant sur la carte. Esquive/Blindage restent en étiquette sur la carte.",
      "Coma d'un aventurier : annonce centrale « <Nom> tombe dans le coma ! » (l'aventurier reste affiché grisé dans sa zone).",
      "Tour des adversaires : les activations ne se déclenchent plus toutes en même temps mais l'une après l'autre (~550 ms, re-rendu entre chaque) dans l'ordre Sbire → Alpha → Solitaire → Boss, puis par numéro (#1, #2…). Refactor : actOneMonster + activationOrder + monstersActSequential ; monsterAI et enemyTurnAndAdvance enchaînent la séquence (garde anti-réentrée). autoCombat et l'abandon restent synchrones."
    ]
  },
  {
    "v": "v2.38",
    "date": "2026-06-24",
    "title": "Animations de combat : effets ralentis + fondu des adversaires vaincus",
    "changes": [
      "Durées allongées pour laisser les effets visibles plus longtemps : textes flottants (dégâts/soin/raté) 0,85s → 1,7s avec maintien à pleine opacité avant le fondu ; éclats (CRITIQUE/💀) → 1,8s ; secousses de carte 0,3-0,6s → 0,55-0,85s ; glissement de la barre de PV 0,45s → 0,7s.",
      "Nouveau : fondu de disparition d'un adversaire vaincu (ou en fuite). Sa carte étant retirée de la zone au re-rendu, on en affiche un clone fantôme dans la couche d'effets, calé sur sa zone, qui se désature et s'efface (1,2s). Les aventuriers au coma restent affichés grisés (pas de fondu)."
    ]
  },
  {
    "v": "v2.37",
    "date": "2026-06-24",
    "title": "Plateau de combat robuste (ne se vide plus sur un combattant corrompu)",
    "changes": [
      "renderCard : garde-fous en tête (states, used, attacks, attackUses comblés si absents).",
      "renderZones : chaque carte rendue via safeCard (try/catch + carte minimale de repli + log console ciblant l'iid fautif) ; wireCard isolé de même.",
      "renderBoard : renderZones / renderPhaseControls / renderLog isolés chacun dans leur try/catch."
    ]
  },
  {
    "v": "v2.36",
    "date": "2026-06-24",
    "title": "Correctif : plateau de combat vide (combat persisté sans attackUses)",
    "changes": [
      "store.js (normCombat) : reconstruit `attackUses` à la bonne longueur au chargement d'un combat en cours.",
      "combat.js (renderCard) : lecture défensive de attackUses[i] pour qu'un champ manquant ne puisse plus jamais vider le plateau."
    ]
  },
  {
    "v": "v2.35",
    "date": "2026-06-24",
    "title": "Animations de combat (effets transitoires, non bloquants)",
    "changes": [
      "Coups : secousse + flash rouge de la cible, nombre « -N » flottant, barre de PV qui glisse de l'ancien au nouveau pourcentage.",
      "Critiques : flash doré, éclat « CRITIQUE ! ».",
      "Ratés / esquives : « whiff » + texte « Raté »/« Esquive ».",
      "Soin (+N), déplacement (slide-in à l'arrivée), pop des badges d'état, K.O./fuite."
    ]
  },
  {
    "v": "v2.34",
    "date": "2026-06-23",
    "title": "Partage : état « publié le… » + bouton Republier explicite",
    "changes": [
      "La fenêtre de partage n'auto-publie plus à l'ouverture : elle affiche l'état courant (déjà en ligne + date de dernière publication, ou invite à publier), laissant le contrôle au MJ.",
      "Mémorise l'horodatage de la dernière publication (amertume_pub_at) et l'affiche au format français ; rappelle que le lien reste stable.",
      "Bouton « ↻ Republier (mettre à jour) » pour pousser les modifications, et « Réessayer » en cas d'échec."
    ]
  },
  {
    "v": "v2.33",
    "date": "2026-06-23",
    "title": "Partage sur un projet Firebase dédié (amertume-rpg)",
    "changes": [
      "Bascule la config Firestore du partage vers un projet Firebase isolé (amertume-rpg) au lieu du projet skills2 partagé avec une autre app. Aucun changement de logique : publication/chargement via la collection amertume_snapshots, lien #pub=<id>."
    ]
  },
  {
    "v": "v2.32",
    "date": "2026-06-23",
    "title": "Talents Adverses (catalogue MJ) + bouton Analyse en combat",
    "changes": [
      "Nouvel onglet « Talents Adv. » : catalogue de talents adverses créables/éditables (nom, effet moteur, X par défaut, description), persisté en localStorage.",
      "Seedé avec CRAINTIF (fuite si X+ dégâts en un coup), FUYARD (fuite après le tour X), HORDE (+X dégâts par allié dans sa zone).",
      "L'éditeur de monstre choisit désormais un talent du catalogue (par nom) et ajuste le X par monstre ; le format stocké reste compatible avec le moteur.",
      "Ligne d'actions à 3 boutons compacts : Mouv. / Objet / Analyse.",
      "Analyse cible un adversaire au clic et révèle ses infos (DEF, Dégâts, XP).",
      "Mouvement et Analyse partagent la même ressource : faire l'un empêche l'autre."
    ]
  },
  {
    "v": "v2.31",
    "date": "2026-06-23",
    "title": "Équipement aplani : base restaurée, plus de disparition",
    "changes": [
      "Chaque aventurier mémorise un « équipement de base » (pré-tiré) figé à la création (éditeur, assistant, clone de pré-construit)",
      "Au début de chaque partie, l'équipement porté est réinitialisé sur cette base (les armes ramassées et équipées la partie précédente sont rendues, on retrouve les armes de départ) ; l'inventaire personnel est refixé dessus",
      "L'inventaire ne liste que le set possédé, dans lequel tout objet porté est réconcilié et persisté → déséquiper un objet ne le fait plus disparaître (il reste listé, simplement décoché)"
    ]
  },
  {
    "v": "v2.30",
    "date": "2026-06-23",
    "title": "Inventaire : quantités d'un même équipement",
    "changes": [
      "La possession par aventurier est désormais comptée : gagner un objet déjà possédé augmente sa quantité, affichée par un badge ×N sur la carte d'inventaire (au lieu de ne rien changer). Compatible avec les anciens sets (booléens convertis en quantité 1)."
    ]
  },
  {
    "v": "v2.29",
    "date": "2026-06-23",
    "title": "Création d'aventurier par étapes (mode Joueur)",
    "changes": [
      "En mode aventure, « + Nouvel Aventurier » ouvre un assistant en 4 étapes : 1. Nom 2. Classe 3. Équipement de départ 4. Compétences (2 à choisir, +1) Indicateur d'étapes, navigation Retour/Suivant, création à la dernière étape. Le mode MJ garde l'éditeur complet ; l'assistant ne s'applique qu'à la création côté joueur (vie/endu/dégâts par défaut + bonus PV de classe)."
    ]
  },
  {
    "v": "v2.28",
    "date": "2026-06-23",
    "title": "XP en défaite, PV max seul, bonus de dégâts avec +",
    "changes": [
      "L'XP des adversaires tués est désormais accordée au groupe même en cas de défaite (et affichée dans le résumé)",
      "Fiches/cartes/sélection d'aventuriers : PV affichés en MAX seul (ex. 60) au lieu de X/X — les barres ne descendent qu'en aventure (colonne gauche) et en combat",
      "Bonus de dégâts toujours préfixé d'un « + » (ex. Dégâts : +1)"
    ]
  },
  {
    "v": "v2.27",
    "date": "2026-06-23",
    "title": "Sélection du groupe condensée (4 aventuriers par ligne)",
    "changes": [
      "Cartes de sélection condensées (paddings, polices, badges réduits) et grille passée à 4 colonnes (2 sur écran moyen, 1 sur mobile) — même design, beaucoup moins encombrant",
      "Libellé d'usage des attaques : « ×/tour » au lieu de « ×/combat » (les usages sont par tour depuis v2.13)"
    ]
  },
  {
    "v": "v2.26",
    "date": "2026-06-23",
    "title": "Mains : détection des armes à 2 mains sans drapeau twoH",
    "changes": [
      "Les aventuriers pré-construits / créés via l'éditeur arrivaient avec une arme à deux mains en main sans le drapeau twoH → comptée comme 1 main (on pouvait ajouter une 2e arme). handsUsed détecte désormais une arme à 2 mains depuis l'objet équipé : affichage 2/2 immédiat et blocage d'une arme supplémentaire."
    ]
  },
  {
    "v": "v2.25",
    "date": "2026-06-23",
    "title": "Sélection du groupe : mêmes cartes que l'onglet Groupe",
    "changes": [
      "L'écran de choix des aventuriers réutilise désormais la carte d'aventurier de l'onglet Groupe (pastel par classe, PV/DEF/Dégâts, attaques, compétences), avec une case à cocher de sélection et une surbrillance quand sélectionné",
      "Nouveau helper partagé Combatants.heroCardHtml(h, opts)"
    ]
  },
  {
    "v": "v2.24",
    "date": "2026-06-23",
    "title": "Tests de compétence enregistrés, inventaire personnel, 2 mains, nettoyage",
    "changes": [
      "Bug majeur des choix : les champs d'un choix étaient indexés par position dans la NodeList et non par le choix → un test mélangé à un choix normal voyait sa Réussite/Échec affectés au mauvais choix (donc non enregistrés, navigation nulle). Les handlers lisent désormais l'index sur la ligne (data-ci)",
      "Inventaire PERSONNEL par aventurier : chacun ne voit/équipe que son propre équipement de départ + son butin (le tueur reçoit le loot) — fini l'inventaire partagé entre tous",
      "Armes à deux mains : comparaison robuste (Number) → occupent bien 2 mains, message d'erreur si les mains sont prises",
      "Inventaire : suppression de l'affichage des dégâts moyens (≈ X) et des prix (po)"
    ]
  },
  {
    "v": "v2.23",
    "date": "2026-06-23",
    "title": "Lisibilité aperçu + inventaire réellement limité au possédé",
    "changes": [
      "Noms d'adversaires de l'aperçu de combat en texte clair coloré par type (corrige les chips illisibles sur fond sombre)",
      "Inventaire d'aventure : modèle de possession non cumulatif — équipement de DÉPART (figé à la création de la partie) + butin de combat + équipement actuellement porté. Équiper puis déséquiper un objet ne le rend plus « possédé » à vie (fin de la pollution montrant toute l'armurerie)",
      "Migration : les anciennes sessions au set « ownedItems » pollué sont purgées et re-figées sur l'équipement courant"
    ]
  },
  {
    "v": "v2.22",
    "date": "2026-06-23",
    "title": "Tests de compétence + fiche d'aventurier à la sélection",
    "changes": [
      "Case « Test de compétence » par choix ; quand activée : compétence à choisir, difficulté (Facile 1 / Moyen 2 / Difficile 3) et deux scènes (Réussite / Échec)",
      "Le choix affiche « (Compétence) <nom> » ; sous le bouton, l'aventurier au meilleur bonus et sa valeur (aide au joueur)",
      "Test réalisé par le meilleur héros : 1d6 + 1d6 par point de compétence, réussite = 4+, 6 explosifs ; comparé au seuil de difficulté",
      "Infobulle de résultat : « <Aventurier> effectue un test de <Compétence> : x réussites = Réussite/Échec. Vous avez réussi/échoué le test. », puis on passe à la scène Réussite ou Échec"
    ]
  },
  {
    "v": "v2.21",
    "date": "2026-06-23",
    "title": "Éditeur d'aventure : champs resserrés + chapitres pliables",
    "changes": [
      "Mot de passe, Durée, Difficulté, Résumé regroupés sur une grille compacte",
      "Les chapitres sont nettement séparés des infos de l'aventure (barre + marge)",
      "Bouton ▾/▸ par chapitre pour l'enrouler/dérouler (+ « Tout enrouler/dérouler »)"
    ]
  },
  {
    "v": "v2.20",
    "date": "2026-06-23",
    "title": "Inventaire joueur limité aux objets possédés",
    "changes": [
      "équipement de départ des aventuriers (choisis ou pré-tirés)",
      "butin récupéré lors des combats Suivi via ses.ownedItems (initialisé au départ de l'aventure, complété par le butin de combat et l'équipement courant du groupe)."
    ]
  },
  {
    "v": "v2.19",
    "date": "2026-06-23",
    "title": "Combat : aperçu coloré par type, libellé Cimetière, résumé on-brand",
    "changes": [
      "Aperçu de disposition : les chips d'adversaires (×N) prennent la couleur de leur type (sbire gris, alpha orange, solitaire rouge, boss violet)",
      "Cimetière : libellé « Cimetière » au lieu de « Détruits »",
      "Bouton « Résultat du Combat » et écran de résumé re-stylés à la charte parchemin d'Amertume (fini le bleu hors-charte)"
    ]
  },
  {
    "v": "v2.18",
    "date": "2026-06-23",
    "title": "Combat : retrait de la pastille « Dégâts » sur les aventuriers",
    "changes": [
      "Les dégâts figurent déjà sur les chips d'attaque ; la pastille était redondante. Conservée côté adversaires (info utile après analyse)."
    ]
  },
  {
    "v": "v2.17",
    "date": "2026-06-23",
    "title": "Fiche bestiaire : armes équipées et DEF totale",
    "changes": [
      "Les cartes du bestiaire affichent désormais les attaques issues des armes équipées (en plus des attaques spéciales), comme pour les aventuriers",
      "La DEF affichée est la DEF totale (DEF de base + armures équipées)",
      "Helpers monsterCombatAttacks / monsterTotalDef partagés entre le bestiaire et le moteur de combat (source unique)"
    ]
  },
  {
    "v": "v2.16",
    "date": "2026-06-23",
    "title": "Loot par dizaines (défaut 30%) + libellé DEF de base",
    "changes": [
      "% de loot des adversaires : menu déroulant par dizaines (0–100 %), base 30 %",
      "DEF des adversaires = DEF de base + armures équipées (champ renommé « DEF de base » avec infobulle ; déjà sommé en combat)",
      "Attaques des adversaires = armes équipées + attaques spéciales (déjà en place)"
    ]
  },
  {
    "v": "v2.15",
    "date": "2026-06-23",
    "title": "Bestiaire : équipement & butin des adversaires",
    "changes": [
      "Les adversaires peuvent être équipés d'armes et armures de l'armurerie : les armes deviennent des attaques spéciales (avec leurs effets, vicieuse…), les armures ajoutent de la DEF",
      "Chaque pièce d'équipement a un % de loot : chance que l'aventurier ayant achevé l'adversaire la récupère (suivi du tueur via killedBy)",
      "Champ « Butin du groupe » par adversaire (objet + % loot + quantité) : gagné par le groupe à l'écran de récompense post-combat",
      "Tirage du butin affiché dans l'écran de résumé (→ tueur ou groupe) et ajouté à l'inventaire au clic sur Continuer ; mémorisé pour le rollback d'aventure",
      "Export/Import CSV des monstres : colonnes equipment + loot",
      "Migration : monstres existants reçoivent equipment/loot vides"
    ]
  },
  {
    "v": "v2.14",
    "date": "2026-06-23",
    "title": "Inventaire joueur : équiper via cases à cocher",
    "changes": [
      "Dans l'inventaire d'aventure, chaque équipement a une case à cocher pour l'équiper / le déséquiper sur un aventurier",
      "Les armes occupent la main droite puis la main gauche (les deux pour une arme à deux mains) ; message d'erreur si les deux mains sont déjà occupées",
      "Les armes équipées servent aux attaques et au calcul de la DEF (armures de corps + boucliers comptés) ; compteur mains + DEF affiché par aventurier"
    ]
  },
  {
    "v": "v2.13",
    "date": "2026-06-23",
    "title": "Combat (UI), fiches joueurs, dés, usages par tour",
    "changes": [
      "Schéma de disposition : texte « (vous ne pouvez pas changer votre position de départ) » + zones colorées par type (aventuriers bleu, sbires gris, alpha orange, solitaires rouge, boss violet) ; étiquette des sbires en gris",
      "Bouton Objet → « Utiliser Obj. équipé »",
      "PV des adversaires : plus aucun texte tant que l'Analyse n'est pas faite",
      "Avertissement si des aventuriers n'ont pas agi avant « Tour des Adversaires »",
      "Journal : « se déplace <Zone> » (au lieu de « se déplace vers »)",
      "Cimetière : « Détruits » 💀 en rouge + ligne « EN FUITE » en dessous",
      "Plus de bouton Repos court en fin de combat",
      "« Terminer (X XP) » remplacé par un bouton « Résultat du Combat »",
      "Écran de résumé redessiné (bannière d'issue, XP en avant, tableau dégâts infligés/subis par combattant, chips détruits/fuite/ranimés)",
      "Barre de PV alignée avec le bouton DEF (blanc, police bleu acier)",
      "Équipement masqué sur la carte (doublon avec l'Inventaire)",
      "Bouton Éditer retiré",
      "Carte cliquable → ouvre la fiche détaillée",
      "Usages d'attaques spéciales « par tour » (réarmés à chaque tour)",
      "Ordre d'affichage des dés : NOIR > ROUGE > BLEU > VERT > JAUNE > BLANC > OS"
    ]
  },
  {
    "v": "v2.12",
    "date": "2026-06-23",
    "title": "Combat : zones intelligentes, résumé de fin, soins",
    "changes": [
      "Attaque de contact hors zone : déplacement automatique vers la cible si le mouvement est disponible (dépense mouvement + attaque) ; message d'erreur seulement si le mouvement a déjà été utilisé",
      "Attaques d'opportunité : un aventurier qui quitte une zone occupée par des adversaires, sans autre allié, subit leurs dégâts-choc",
      "Sbires : occupent toujours une demi-largeur, même seuls après une mort",
      "Bouton Mouvement réduit à demi-largeur + bouton « Objet » (objet équipé) à côté, d'une autre couleur",
      "Barre de PV légèrement réduite pour afficher une icône DEF sur la même ligne",
      "PV des adversaires masqués tant que l'Analyse n'est pas faite",
      "Passer (victoire) / Passer (défaite) : confirmation explicite",
      "Soin automatique après combat : aventuriers à 0 PV ranimés à 1D6 + Endu",
      "Écran de résumé de fin de combat (issue, vaincus, en fuite, dégâts infligés / subis par combattant, XP) avec bouton Continuer",
      "Cimetière un peu plus visible",
      "Terminer en aventure = défaite (dernier tour adverse, survivants sans XP)"
    ]
  },
  {
    "v": "v2.11",
    "date": "2026-06-23",
    "title": "Combat : cimetière, schéma, défaite à l'abandon, UI épurée",
    "changes": [
      "Adversaires vaincus/enfuis quittent les zones pour un « cimetière » compact en bas (ne prend pas de place) ; les aventuriers au coma restent dans leur zone, grisés",
      "Aventuriers affichés côte à côte (grille) dans une zone, comme les sbires",
      "Cartes d'adversaires : nom des attaques + mention Contact / Distance",
      "Noms d'armes nettoyés (plus de préfixe « Mêlée — » / « Distance — »)",
      "Bouton Mouvement au style des attaques mais brun, sans emoji",
      "Contact / Distance affiché sous le nom de l'arme/sort (au lieu du bout du bouton)",
      "Boutons Action et Objet supprimés ; bouton Dégâts moyens retiré",
      "« Standard » renommé « Sbire »",
      "Scène de combat : mini-schéma des zones (adversaires + départ des aventuriers) avant « Lancer le combat »",
      "Terminer le combat en aventure = défaite : les adversaires jouent un dernier tour puis les survivants fuient (aucune XP), puis on file vers la scène Défaite. Message : « Terminer ce combat ? Vos adversaires agiront une dernière fois et vous subirez les conséquences d'une défaite. »"
    ]
  },
  {
    "v": "v2.10",
    "date": "2026-06-23",
    "title": "Combat par zones",
    "changes": [
      "Chaque combattant occupe une zone ; une attaque de contact ne touche que sa propre zone, une attaque à distance touche n'importe quelle zone",
      "Action Mouvement : on clique « Mouvement » puis la zone de destination ; la fiche change de zone (consomme le déplacement, comme une action)",
      "Message « Vous ne pouvez pas atteindre cet adversaire » sur une attaque de contact hors zone",
      "IA : les adversaires frappent en priorité leur zone avec une arme de contact (et s'y déplacent au besoin), et les autres zones avec une arme à distance",
      "Plateau divisé en 4 zones géométriques (grille 2×2, léger espacement) qui accueillent les combattants"
    ]
  }
];
