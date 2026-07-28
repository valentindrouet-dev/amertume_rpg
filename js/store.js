/*
 * Persistance locale (localStorage) de l'inventaire et de l'équipement.
 * Tout reste côté navigateur — export/import .json pour sauvegarder ailleurs.
 */
(function (global) {
  'use strict';

  const KEY = 'amertume_state_v1';

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Raccourci pour décrire un pool de dés sans répéter toutes les couleurs
  function dice(obj) { return Object.assign(AmertumeDice.emptyPool(), obj || {}); }
  function noStates() { return { affaibli: false, auSol: false, feu: false }; }

  /*
   * Catalogue d'équipement officiel (Amertume v4.s2).
   * Dés : interprétation visuelle du PDF — modifiable via l'éditeur.
   * traits : jetable, vicieuse (le « 2 mains » est porté par hands:2).
   */
  function buildOfficialEquipment() {
    function W(name, d, hands, ranged, traits, moy, price) {
      return {
        id: uid(), name: name, category: 'weapon', qty: 1, hands: hands, ranged: ranged,
        usesAmmo: false, consumable: false, dice: dice(d), traits: traits, price: price,
        effects: '', notes: 'Officiel v4.s2 · DÉG. moy. ' + moy, official: true,
      };
    }
    function A(name, def, slot, price) {
      return {
        id: uid(), name: name, category: 'armor', qty: 1, hands: 1, ranged: false,
        usesAmmo: false, consumable: false, dice: AmertumeDice.emptyPool(),
        def: def, slot: slot, traits: [], price: price,
        effects: '', notes: 'Officiel v4.s2', official: true,
      };
    }
    // O(nom, effet, dés, bénéfique, prix) — Objet consommable.
    function O(name, effect, diceN, benefic, price, effText) {
      return {
        id: uid(), name: name, category: 'object', qty: 1, hands: 1, ranged: false,
        usesAmmo: false, consumable: true, dice: AmertumeDice.emptyPool(),
        objEffect: effect, objDice: diceN, objBenefic: benefic,
        traits: [], price: price, effects: effText, notes: 'Officiel v4.s2', official: true,
      };
    }
    // M(nom, couleur de dé, prix) — Munition : +1 dé à la prochaine attaque à distance.
    function M(name, color, colorLabel, price) {
      return {
        id: uid(), name: name, category: 'object', qty: 1, hands: 1, ranged: false,
        usesAmmo: false, consumable: true, dice: AmertumeDice.emptyPool(),
        objEffect: 'ammo', ammoColor: color, objDice: 0, objBenefic: true,
        traits: [], price: price,
        effects: '+1 dé ' + colorLabel + ' à la prochaine attaque avec une Arme à Distance.',
        notes: 'Officiel v4.s2', official: true,
      };
    }
    return [
      // Mêlée
      W('Dague', { white: 1 }, 1, false, ['jetable'], 3, 3),
      W('Faux', { white: 1 }, 1, false, ['vicieuse'], 3, 10),
      W('Épée', { white: 1 }, 1, false, [], 3, 10),
      W('Bâton', { white: 1, bone: 1 }, 1, false, ['jetable'], 4, 5),
      W('Rapière', { white: 1, bone: 1 }, 1, false, ['vicieuse'], 4, 60),
      W('Épée longue', { white: 2 }, 2, false, [], 6, 60),
      W('Hache', { white: 2 }, 2, false, ['jetable'], 6, 40),
      W('Lance', { white: 2 }, 2, false, ['vicieuse'], 6, 60),
      W('Épée lourde', { red: 1, white: 1 }, 2, false, [], 7, 100),
      W('Hache lourde', { red: 1, white: 1 }, 2, false, ['jetable'], 7, 120),
      // Distance
      W('Arc court', { white: 1, bone: 1 }, 2, true, ['vicieuse'], 4, 25),
      W('Arc', { white: 2 }, 2, true, [], 6, 35),
      W('Arc long', { white: 2 }, 2, true, [], 6, 50),
      W('Arbalète', { red: 1, white: 1 }, 2, true, [], 7, 80),
      // Armures
      A('Tenue de voyage', 0, 'body', 5),
      A('Armure de cuir', 1, 'body', 45),
      A('Armure de mailles', 2, 'body', 60),
      A('Armure de plates', 3, 'body', 200),
      A('Bouclier', 1, 'shield', 80),
      // Objets consommables
      O('Petite Potion de Soin', 'heal', 2, true, 15, 'Soigne un aventurier de 2d6 PV.'),
      O('Potion de Soin', 'heal', 4, true, 35, 'Soigne un aventurier de 4d6 PV.'),
      O('Grande Potion de Soin', 'heal', 6, true, 70, 'Soigne un aventurier de 6d6 PV.'),
      // Munitions (+1 dé à la prochaine attaque avec une Arme à Distance)
      M('Flèches', 'white', 'blanc', 5),
      M('Flèches légères', 'bone', 'os', 3),
      M('Flèches lourdes', 'red', 'rouge', 15),
      M('Flèches Mystiques', 'blue', 'bleu', 20),
      M('Flèches Mortelles', 'black', 'noir', 40),
    ];
  }

  function defaultState() {
    const items = buildOfficialEquipment();
    const epee = items.find(function (i) { return i.name === 'Épée'; });
    const cuir = items.find(function (i) { return i.name === 'Armure de cuir'; });

    return {
      items: items,

      // Roster de héros (combattants légers)
      heroes: [
        {
          id: uid(), name: 'Aventurier', klass: 'Gardien', vie: 4, endu: 3, pvBonus: 0,
          damage: 2, rapide: false, notes: '',
          equipment: { weapons: epee ? [epee.id] : [], armorId: cuir ? cuir.id : null, shieldId: null },
          attacks: [], // attaques spéciales optionnelles (les armes fournissent l'attaque de base)
        },
      ],

      // Bestiaire (modèles d'adversaires)
      monsters: [
        {
          id: uid(), name: 'Rôdeur famélique', type: 'standard', socle: 'medium', family: 'Bête',
          pv: 6, def: 3, damage: 2, xp: 5, menace: 'closest', esquive: false, rapide: false, notes: '',
          attacks: [
            { name: 'Griffes', dice: dice({ white: 2 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: noStates() },
          ],
        },
        {
          id: uid(), name: 'Charognard enragé', type: 'standard', socle: 'medium', family: 'Charognard',
          pv: 8, def: 2, damage: 3, xp: 7, menace: 'closest', esquive: false, rapide: true, notes: 'Rapide',
          attacks: [
            { name: 'Morsure', dice: dice({ white: 1, bone: 1 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: { affaibli: false, auSol: false, feu: false } },
          ],
        },
        {
          id: uid(), name: 'Mystique déchu', type: 'solitaire', socle: 'medium', family: 'Humanoïde',
          pv: 14, def: 4, damage: 2, xp: 15, menace: 'defLow', esquive: true, rapide: false, notes: '',
          attacks: [
            { name: 'Boule de feu', dice: dice({ blue: 2 }), range: 'distance',
              targets: 'one', useOwnDamage: true, effects: { affaibli: false, auSol: false, feu: true } },
          ],
        },
        {
          id: uid(), name: 'Colosse d’Amertume', type: 'boss', socle: 'huge', family: 'Colosse',
          pv: 30, def: 5, damage: 4, xp: 40, menace: 'pvHigh', esquive: false, rapide: false,
          notes: 'Boss : ignore Au sol. Fuit au plus tôt fin du Tour 3.',
          attacks: [
            { name: 'Coup massif', dice: dice({ red: 3 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: noStates() },
            { name: 'Onde de choc', dice: dice({ white: 2 }), range: 'contact',
              targets: 'all', useOwnDamage: true, effects: { affaibli: false, auSol: true, feu: false } },
          ],
        },
      ],

      // Progression commune du groupe (l'XP est partagée dans Amertume)
      party: { xp: 0 },

      // Combat en cours (null hors combat)
      combat: null,
    };
  }

  // Table des niveaux : seuil d'XP et points de talent cumulés
  var LEVELS = [
    { lvl: 1,  xp: 0,      points: 10 },
    { lvl: 2,  xp: 100,    points: 13 },
    { lvl: 3,  xp: 500,    points: 16 },
    { lvl: 4,  xp: 1000,   points: 20 },
    { lvl: 5,  xp: 2000,   points: 25 },
    { lvl: 6,  xp: 3500,   points: 30 },
    { lvl: 7,  xp: 5500,   points: 35 },
    { lvl: 8,  xp: 8000,   points: 40 },
    { lvl: 9,  xp: 11000,  points: 45 },
    { lvl: 10, xp: 15000,  points: 50 },
    { lvl: 11, xp: 21000,  points: 55 },
    { lvl: 12, xp: 28000,  points: 60 },
    { lvl: 13, xp: 37000,  points: 65 },
    { lvl: 14, xp: 49000,  points: 70 },
    { lvl: 15, xp: 64000,  points: 75 },
    { lvl: 16, xp: 82000,  points: 80 },
    { lvl: 17, xp: 104000, points: 85 },
    { lvl: 18, xp: 130000, points: 90 },
    { lvl: 19, xp: 162000, points: 95 },
    { lvl: 20, xp: 200000, points: 100 },
  ];
  var MAX_LEVEL = LEVELS.length;

  function xpForLevel(lvl) {
    lvl = Math.max(1, Math.min(LEVELS.length, lvl));
    return LEVELS[lvl - 1].xp;
  }

  function levelInfo(xp) {
    xp = Math.max(0, xp || 0);
    var cur = LEVELS[0];
    for (var i = 0; i < LEVELS.length; i++) { if (xp >= LEVELS[i].xp) cur = LEVELS[i]; }
    var next = LEVELS.find(function (l) { return l.xp > xp; }) || null;
    var spanStart = cur.xp;
    var spanEnd = next ? next.xp : cur.xp;
    var pct = next ? Math.round(((xp - spanStart) / (spanEnd - spanStart)) * 100) : 100;
    return { level: cur.lvl, points: cur.points, xp: xp, next: next, toNext: next ? next.xp - xp : 0, pct: pct };
  }

  let state = load();

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Garde-fous minimaux
      if (!parsed.items) parsed.items = [];
      // Nettoyage : champs hérités de l'ancienne version (inventaire/lanceur global)
      delete parsed.equipped; delete parsed.extraDice; delete parsed.history;
      // Migration : ajoute les nouveaux blocs si absents d'une ancienne sauvegarde
      const def = defaultState();
      if (!parsed.heroes) parsed.heroes = def.heroes;
      if (!parsed.monsters) parsed.monsters = def.monsters;
      if (!parsed.party) parsed.party = { xp: 0 };
      if (typeof parsed.party.xp !== 'number') parsed.party.xp = 0;
      if (typeof parsed.combat === 'undefined') parsed.combat = null;
      // Migration / normalisation : garantit que chaque structure a tous ses champs,
      // pour qu'aucun rendu ne plante sur une sauvegarde d'une version antérieure.
      function normAttack(a) {
        if (!a) return;
        if (!a.dice) a.dice = AmertumeDice.emptyPool();
        else a.dice = dice(a.dice);
        if (!a.effects) a.effects = noStates();
        if (!a.range) a.range = 'contact';
        if (!a.targets) a.targets = 'one';
        if (typeof a.uses === 'undefined') a.uses = 0;        // 0 = illimité
        if (typeof a.freeAction === 'undefined') a.freeAction = false;
      }
      (parsed.monsters || []).forEach(function (m) {
        if (typeof m.family === 'undefined') m.family = '';
        if (!Array.isArray(m.talents)) m.talents = [];
        if (!Array.isArray(m.equipment)) m.equipment = [];
        if (!Array.isArray(m.loot)) m.loot = [];
      });
      (parsed.items || []).forEach(function (i) {
        if (!i.dice) i.dice = AmertumeDice.emptyPool(); else i.dice = dice(i.dice);
        if (!i.traits) i.traits = [];
        if (i.category === 'armor' && typeof i.def === 'undefined') { i.def = 0; i.slot = i.slot || 'body'; }
      });
      (parsed.heroes || []).forEach(function (h) {
        if (typeof h.klass === 'undefined') h.klass = '';
        if (!h.equipment) h.equipment = { weapons: [], armorId: null, shieldId: null };
        if (!Array.isArray(h.equipment.weapons)) h.equipment.weapons = [];
        if (!Array.isArray(h.attacks)) h.attacks = [];
        h.attacks.forEach(normAttack);
      });
      (parsed.monsters || []).forEach(function (m) {
        if (!Array.isArray(m.attacks)) m.attacks = [];
        m.attacks.forEach(normAttack);
      });
      // Combats en cours (aventure + test) : on jette une structure incompatible
      function normCombat(cb) {
        if (!cb) return null;
        var ok = Array.isArray(cb.combatants) && Array.isArray(cb.log);
        if (!ok) return null;
        if (!Array.isArray(cb.zones) || !cb.zones.length) cb.zones = [{ name: 'Zone 1' }];
        cb.combatants.forEach(function (c) {
          if (!c.states) c.states = { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false };
          if (!c.used) c.used = { action: false, move: false, object: false };
          if (typeof c.zone !== 'number') c.zone = 0;
          if (c.zone >= cb.zones.length) c.zone = 0;
          if (typeof c.dmgDealt !== 'number') c.dmgDealt = 0;
          if (typeof c.dmgTaken !== 'number') c.dmgTaken = 0;
          if (!Array.isArray(c.attacks)) c.attacks = [];
          c.attacks.forEach(normAttack);
          // Compteurs d'usages par attaque (null = illimité). Doit suivre la
          // longueur de `attacks` : sinon renderCard plante sur c.attackUses[i].
          if (!Array.isArray(c.attackUses) || c.attackUses.length !== c.attacks.length) {
            c.attackUses = c.attacks.map(function (a) { return (a && a.uses && a.uses > 0) ? a.uses : null; });
          }
        });
        return cb;
      }
      parsed.combat = normCombat(parsed.combat);
      if (typeof parsed.testCombat === 'undefined') parsed.testCombat = null;
      else parsed.testCombat = normCombat(parsed.testCombat);
      return parsed;
    } catch (e) {
      console.warn('Sauvegarde illisible, réinitialisation.', e);
      return defaultState();
    }
  }

  // Recherche d'un adversaire TOLÉRANTE au multi-onglets : `state` est chargé une
  // seule fois au démarrage de la page, donc une fiche créée dans une AUTRE fenêtre
  // n'y figure pas. En cas d'échec, on relit le stockage et on rapatrie la fiche.
  function findMonster(pred) {
    let m = (state.monsters || []).find(pred);
    if (m) return m;
    try {
      const fresh = load();
      const f = (fresh.monsters || []).find(pred);
      if (f) { state.monsters.push(f); return f; }
    } catch (e) {}
    return null;
  }
  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Échec de sauvegarde', e);
    }
  }

  // Ajoute les pièces d'équipement officielles absentes (par nom), sans doublon
  function loadOfficial() {
    const existing = {};
    state.items.forEach(function (i) { existing[i.name.toLowerCase()] = true; });
    let added = 0;
    buildOfficialEquipment().forEach(function (it) {
      if (!existing[it.name.toLowerCase()]) { state.items.push(it); added++; }
    });
    if (added) save();
    return added;
  }

  // ---------- Aventures (stockage séparé) ----------
  const ADV_KEY = 'amertume_adventures_v1';
  const SES_KEY = 'amertume_sessions_v1';

  function loadAdventures() {
    try {
      const raw = global.localStorage.getItem(ADV_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveAdventures(adventures) {
    try { global.localStorage.setItem(ADV_KEY, JSON.stringify(adventures)); } catch (e) {}
  }

  // ---------- Grandes Aventures (regroupements d'aventures-chapitres) ----------
  // Chaque Grande Aventure : { id, title, adventureIds: [] } (ordre des chapitres).
  // homeOrder : ordre d'affichage des entrées de l'accueil — liste de
  // { type:'saga'|'adv', id }. Les entrées absentes sont ajoutées à la fin.
  const SAGA_KEY = 'amertume_sagas_v1';
  const HOME_ORDER_KEY = 'amertume_home_order_v1';
  function loadSagas() {
    try {
      const raw = global.localStorage.getItem(SAGA_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(function (s) {
        return { id: s.id, title: s.title || '', adventureIds: Array.isArray(s.adventureIds) ? s.adventureIds : [],
          homeHidden: !!s.homeHidden };
      }) : [];
    } catch (e) { return []; }
  }
  function saveSagas(sagas) {
    try { global.localStorage.setItem(SAGA_KEY, JSON.stringify(sagas || [])); } catch (e) {}
  }
  function loadHomeOrder() {
    try {
      const raw = global.localStorage.getItem(HOME_ORDER_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (e) { return e && e.type && e.id; }) : [];
    } catch (e) { return []; }
  }
  function saveHomeOrder(order) {
    try { global.localStorage.setItem(HOME_ORDER_KEY, JSON.stringify(order || [])); } catch (e) {}
  }
  // Calcule l'ordre d'affichage de l'accueil : entrées { type, id } ordonnées
  // selon homeOrder, complétées par les nouvelles sagas/aventures autonomes.
  // Auto-réparant (ignore les références obsolètes).
  function homeLayout() {
    const advs = loadAdventures();
    const sagas = loadSagas();
    const order = loadHomeOrder();
    const advById = {}; advs.forEach(function (a) { advById[a.id] = a; });
    const sagaById = {}; sagas.forEach(function (s) { sagaById[s.id] = s; });
    const inSaga = {};
    sagas.forEach(function (s) { (s.adventureIds || []).forEach(function (id) { inSaga[id] = true; }); });
    const entries = []; const seen = {};
    function pushEntry(type, id) {
      const key = type + ':' + id;
      if (seen[key]) return;
      if (type === 'saga' && sagaById[id]) { seen[key] = 1; entries.push({ type: 'saga', id: id }); }
      else if (type === 'adv' && advById[id] && !inSaga[id]) { seen[key] = 1; entries.push({ type: 'adv', id: id }); }
    }
    order.forEach(function (e) { pushEntry(e.type, e.id); });
    sagas.forEach(function (s) { pushEntry('saga', s.id); });
    advs.forEach(function (a) { if (!inSaga[a.id]) pushEntry('adv', a.id); });
    return { entries: entries, advById: advById, sagaById: sagaById, adventures: advs, sagas: sagas, inSaga: inSaga };
  }

  function loadSessions() {
    try {
      const raw = global.localStorage.getItem(SES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveSessions(sessions) {
    try { global.localStorage.setItem(SES_KEY, JSON.stringify(sessions)); } catch (e) {}
  }

  // ---------- Aventures déverrouillées (mots de passe) ----------
  const UNLOCK_KEY = 'amertume_unlocked_v1';
  function loadUnlocked() {
    try {
      const raw = global.localStorage.getItem(UNLOCK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveUnlocked(ids) {
    try { global.localStorage.setItem(UNLOCK_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  // ---------- Classes & talents de classe (Admin) ----------
  const CLS_KEY = 'amertume_classes_v1';
  function loadClasses() {
    try {
      const raw = global.localStorage.getItem(CLS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveClasses(classes) {
    try { global.localStorage.setItem(CLS_KEY, JSON.stringify(classes)); } catch (e) {}
  }

  // ---------- Talents génériques d'aventuriers ----------
  // Talents accessibles à TOUS les aventuriers dès qu'ils atteignent le niveau
  // requis (XP de groupe). Le champ `effect` rattache le talent au moteur de
  // combat (ex. 'double_attaque' = frappe 2 cibles d'une même zone).
  const GENTALENT_KEY = 'amertume_gentalents_v1';
  // Talents génériques intégrés supprimés par le MJ (pierres tombales) : empêche
  // que le complément automatique des talents intégrés ne les réinjecte.
  const GENTALENT_DEL_KEY = 'amertume_gentalents_deleted_v1';
  function loadGenTombstones() {
    try {
      const raw = global.localStorage.getItem(GENTALENT_DEL_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  // ===== Bibliothèque des effets de talent (patterns câblés au moteur) =====
  // kind : 'action' (bleu, consomme l'Action du tour) · 'reaction' (violet,
  // déclenchée par le joueur quand son prérequis est rempli) · 'passive' (vert,
  // toujours actif) · 'upgrade' (ambre, améliore un élément existant) ·
  // 'mastery' (or, effet permanent de spécialisation).
  // cat : catégorie thématique (organisation du sélecteur et de la référence).
  // hasVal : l'effet utilise une variable X (valLabel décrit X).
  // legacy : doublon historique fusionné — la clé reste résolue (alias vers la
  // clé canonique) mais l'effet n'apparaît plus dans le sélecteur.
  //
  // TERMINOLOGIE UNIFIÉE (à réutiliser dans toute description) :
  //  · « Action : … » ouvre chaque effet d'action ; « Réaction — <déclencheur> : … » chaque réaction.
  //  · États toujours en capitales : FEU, AU SOL, AFFAIBLI, BRISÉ, FAILLE, POISON, GARDÉ.
  //  · « attaque de contact » / « attaque à distance » / « toutes vos attaques ».
  //  · « bonus de Dégâts » = la caractéristique Dégâts de l'aventurier.
  //  · Termes de jeu capitalisés : Blindage, Esquive (6+), Orbe Mystique, Pré-Tour, Critique, Échec.
  const EFFECT_CATEGORIES = [
    { key: 'attaque',    icon: '⚔️', label: 'Attaques spéciales' },
    { key: 'degats',     icon: '💥', label: 'Bonus de dégâts' },
    { key: 'etats',      icon: '🔥', label: 'États' },
    { key: 'critique',   icon: '🎯', label: 'Critiques' },
    { key: 'riposte',    icon: '⚡', label: 'Ripostes' },
    { key: 'protection', icon: '🛡️', label: 'Défense & protection' },
    { key: 'soin',       icon: '❤️', label: 'Soins & survie' },
    { key: 'mouvement',  icon: '🏃', label: 'Mouvement & position' },
    { key: 'groupe',     icon: '🤝', label: 'Alliés & Garde' },
    { key: 'orbes',      icon: '🔮', label: 'Orbes & Pyromancie' },
    { key: 'tempo',      icon: '⏱️', label: 'Tempo & initiative' },
    { key: 'aventure',   icon: '🧭', label: 'Hors combat' },
  ];
  const TALENT_EFFECTS = [
    // ⚔️ ATTAQUES SPÉCIALES — actions qui frappent
    { effect: 'double_attaque', name: 'Double Attaque', kind: 'action', cat: 'attaque', hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      desc: 'Action : frappez X adversaires d\'une même zone avec les Dégâts de votre arme.' },
    { effect: 'attaque_zone', name: 'Attaque de Zone', kind: 'action', cat: 'attaque',
      hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      hasDice: true, defaultDice: { white: 2 }, hasRange: true, defaultRange: 'contact',
      hasSide: true, defaultSide: 'foes',
      hasChoice: true, choiceLabel: 'État infligé (facultatif)',
      choices: ['', 'feu', 'auSol', 'affaibli', 'brise', 'faille', 'poison'],
      desc: 'Action : infligez les dés indiqués dans une zone — à X cibles, à toute la zone ou à tout le combat, ' +
        'aux adversaires, aux alliés ou à tout le monde, avec un état au choix.' },
    { effect: 'mort_explosive', name: 'Mort Explosive', kind: 'passive', cat: 'attaque',
      hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      hasDice: true, defaultDice: { red: 2 }, hasRange: true, defaultRange: 'contact',
      hasSide: true, defaultSide: 'foes',
      hasChoice: true, choiceLabel: 'État infligé (facultatif)',
      choices: ['', 'feu', 'auSol', 'affaibli', 'brise', 'faille', 'poison'],
      desc: 'En mourant, vous infligez les dés indiqués — à X cibles, à toute la zone ou à tout le combat, ' +
        'aux adversaires, aux alliés ou à tout le monde, avec un état au choix.' },
    { effect: 'salve_zone', name: 'Salve de Zone', kind: 'action', cat: 'attaque', hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      legacy: 'attaque_zone',
      hasDice: true, defaultDice: { white: 2 }, hasRange: true, defaultRange: 'contact',
      desc: 'Action : infligez les dés indiqués à X adversaires d\'une même zone (contact ou distance).' },
    { effect: 'assaut_mobile', name: 'Assaut Mobile', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : 1 mouvement gratuit + 1 attaque.' },
    { effect: 'frappe_puissante', name: 'Frappe Puissante', kind: 'action', cat: 'attaque', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: 'Action : 1 attaque de contact à +X Dégâts.' },
    { effect: 'tir_charge', name: 'Tir Chargé', kind: 'action', cat: 'attaque', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: 'Action : 1 attaque à distance à +X Dégâts.' },
    { effect: 'frappe_tournoyante', name: 'Frappe Tournoyante', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : frappez TOUS les adversaires de votre zone.' },
    { effect: 'attaque_furieuse', name: 'Attaque Furieuse', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : 1 attaque ; si la cible meurt, attaque gratuite sur un autre adversaire de la zone.' },
    { effect: 'attaque_blindee', name: 'Attaque Blindée', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : 1 attaque, puis vous gagnez Blindage.' },
    { effect: 'deluge', name: 'Déluge', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : 1 attaque, relançable sur la même cible tant qu\'aucun dé ne produit de 1.' },
    { effect: 'provocation', name: 'Provocation', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : attirez un adversaire dans votre zone et attaquez-le.' },
    { effect: 'bousculade', name: 'Bousculade', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : 1 attaque de contact, puis la cible est poussée dans une autre zone (attaques d\'opportunité de votre zone).' },
    { effect: 'eclipse', name: 'Éclipse', kind: 'action', cat: 'attaque', hasVal: false,
      desc: 'Action : téléportez-vous dans une autre zone (franchit tout, même les MURS) et effectuez 1 attaque.' },
    // 💥 BONUS DE DÉGÂTS — passifs et améliorations offensifs
    { effect: 'frappe_lourde', name: 'Frappe Lourde', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 1, valLabel: 'Dégâts bonus',
      desc: '+X Dégâts à toutes vos attaques.' },
    { effect: 'maitre_contact', name: 'Maître au Contact', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X Dégâts à vos attaques de contact.' },
    { effect: 'maitre_distance', name: 'Maître à Distance', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X Dégâts à vos attaques à distance.' },
    { effect: 'tueur_au_sol', name: 'Tueur au Sol', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X Dégâts contre une cible AU SOL.' },
    { effect: 'tueur_affaibli', name: 'Achèvement', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X Dégâts contre une cible AFFAIBLI.' },
    { effect: 'tueur_etat', name: 'Prédateur d\'État', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      hasChoice: true, choiceLabel: 'État ciblé', choices: ['feu', 'brise', 'faille', 'poison', 'auSol', 'affaibli'],
      desc: '+X Dégâts contre une cible affectée par l\'état choisi.' },
    { effect: 'meute', name: 'Meute', kind: 'passive', cat: 'degats', hasVal: true, defaultVal: 1, valLabel: 'Dégâts / allié',
      desc: '+X Dégâts par allié présent dans la zone de la cible.' },
    { effect: 'assassinat', name: 'Assassinat', kind: 'passive', cat: 'degats', hasVal: false,
      hasChoice: true, choiceLabel: 'Double … / cible',
      choices: ['Bonus vs Seul', 'Bonus vs Solitaire', 'Bonus vs Alpha', 'Bonus vs Boss',
                'Attaque vs Seul', 'Attaque vs Solitaire', 'Attaque vs Alpha', 'Attaque vs Boss'],
      desc: 'Double votre bonus de Dégâts (« Bonus ») ou tous les Dégâts de l\'attaque (« Attaque ») contre la cible choisie.' },
    { effect: 'bourreau_rapides', name: 'Bourreau des Rapides', kind: 'upgrade', cat: 'degats', hasVal: false,
      desc: 'Dégâts doublés contre les adversaires rapides.' },
    { effect: 'coup_bouclier', name: 'Coup de Bouclier', kind: 'passive', cat: 'degats', hasVal: false,
      desc: 'Bouclier équipé : +1 dé rouge (Lourd) à toutes vos attaques.' },
    { effect: 'force_blindee', name: 'Force Blindée', kind: 'passive', cat: 'degats', hasVal: false,
      desc: 'Tant que vous avez Blindage : +1 dé rouge (Lourd) à toutes vos attaques.' },
    { effect: 'survivaliste', name: 'Survivaliste', kind: 'mastery', cat: 'degats', hasVal: false,
      desc: 'Ajoutez votre VIE à votre bonus de Dégâts.' },
    { effect: 'perce_blindage', name: 'Perce-Blindage', kind: 'upgrade', cat: 'degats', hasVal: false,
      desc: 'Vos attaques ignorent Blindage (les Dégâts passent, sans le retirer).' },
    // 🔥 ÉTATS — infliger, exploiter ou contourner FEU / AU SOL / AFFAIBLI / BRISÉ / FAILLE / POISON
    { effect: 'coup_renversant', name: 'Coup Renversant', kind: 'action', cat: 'etats', hasVal: false,
      desc: 'Action : 1 attaque de contact qui met la cible AU SOL.' },
    { effect: 'attaque_affaiblissante', name: 'Attaque Affaiblissante', kind: 'action', cat: 'etats', hasVal: false,
      desc: 'Action : 1 attaque qui inflige AFFAIBLI.' },
    { effect: 'attaque_enflammee', name: 'Attaque Enflammée', kind: 'action', cat: 'etats', hasVal: false,
      desc: 'Action : 1 attaque de contact qui inflige FEU.' },
    { effect: 'attaque_etat', name: 'Attaque Altérante', kind: 'action', cat: 'etats', hasVal: false,
      hasChoice: true, choiceLabel: 'État infligé', choices: ['feu', 'auSol', 'affaibli', 'brise', 'faille', 'poison'],
      desc: 'Action : 1 attaque de contact qui inflige l\'état choisi.' },
    { effect: 'arme_enflammee', name: 'Arme Enflammée', kind: 'upgrade', cat: 'etats', hasVal: false,
      desc: 'Vos attaques de contact infligent FEU.' },
    { effect: 'arme_affaiblissante', name: 'Arme Vampirique', kind: 'upgrade', cat: 'etats', hasVal: false,
      desc: 'Toutes vos attaques infligent AFFAIBLI.' },
    { effect: 'arme_etat', name: 'Arme Altérante', kind: 'upgrade', cat: 'etats', hasVal: false,
      hasChoice: true, choiceLabel: 'État infligé', choices: ['feu', 'auSol', 'affaibli', 'brise', 'faille', 'poison'],
      desc: 'Toutes vos attaques infligent l\'état choisi.' },
    { effect: 'charge_etat', name: 'Assaut Handicapant', kind: 'upgrade', cat: 'etats', hasVal: false,
      hasChoice: true, choiceLabel: 'État infligé', choices: ['feu', 'auSol', 'affaibli'],
      desc: 'Vous infligez l\'état choisi en arrivant au contact d\'un adversaire.' },
    { effect: 'ignore_def_etat', name: 'Faille Tactique', kind: 'upgrade', cat: 'etats', hasVal: false,
      hasChoice: true, choiceLabel: 'État ciblé', choices: ['feu', 'affaibli', 'auSol', 'brise', 'faille', 'poison'],
      desc: 'Vos attaques ignorent la DEF des cibles affectées par l\'état choisi.' },
    { effect: 'bonus_bleu_feu', name: 'Combustion', kind: 'upgrade', cat: 'etats', hasVal: false,
      desc: '+1 dé bleu (Mystique) à vos attaques contre les cibles en FEU.' },
    { effect: 'feu_double', name: 'Embrasement', kind: 'passive', cat: 'etats', hasVal: false,
      desc: 'Les Dégâts de FEU subis par les adversaires en fin de tour sont doublés.' },
    { effect: 'epuisement', name: 'Épuisement', kind: 'passive', cat: 'etats', hasVal: false,
      desc: 'Les adversaires de votre zone subissent DEF −1.' },
    { effect: 'brasier', name: 'Brasier', kind: 'action', cat: 'etats', hasVal: false,
      desc: 'Action : 1 attaque qui touche TOUS les adversaires en FEU.' },
    { effect: 'pas_echec_ausol', name: 'Coup de Grâce', kind: 'passive', cat: 'etats', hasVal: false,
      desc: 'Pas d\'Échec (double 1) contre les cibles AU SOL — les 1 comptent comme des Dégâts normaux.' },
    // 🎯 CRITIQUES — déclenchés par vos Critiques (double 6)
    { effect: 'accentuation', name: 'Accentuation', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Vos Critiques infligent le double de votre bonus de Dégâts.' },
    { effect: 'mvt_critique', name: 'Mouvement Critique', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Après un Critique : 1 mouvement gratuit.' },
    { effect: 'allie_critique', name: 'Allié Critique', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Après un Critique : un allié de votre zone effectue une attaque gratuite.' },
    { effect: 'critique_explosif', name: 'Critique Explosif', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Après un Critique : votre bonus de Dégâts frappe tous les adversaires de votre zone.' },
    { effect: 'cri_de_rage', name: 'Cri de Rage', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Après un Critique : forcez un adversaire à se déplacer dans votre zone.' },
    { effect: 'bain_de_sang', name: 'Bain de Sang', kind: 'passive', cat: 'critique', hasVal: false,
      desc: 'Chaque adversaire tué par un de vos Critiques vous soigne de votre ENDU en PV.' },
    { effect: 'implosion', name: 'Implosion', kind: 'reaction', cat: 'critique', hasVal: false,
      desc: 'Réaction — après un Critique : 1 Action supplémentaire (1×/tour).' },
    { effect: 'critique_destructeur', name: 'Destructeur', kind: 'mastery', cat: 'critique', hasVal: false,
      desc: 'Critique sur tout double (sauf les 1), qui explose tant que la même face se reproduit. Chaque dé doit passer la DEF (sauf rouge/noir).' },
    // ⚡ RIPOSTES — rendre les coups
    { effect: 'contre_attaque', name: 'Contre-Attaque', kind: 'reaction', cat: 'riposte', hasVal: false,
      desc: 'Réaction — après avoir subi des Dégâts : 1 attaque gratuite contre l\'assaillant.' },
    { effect: 'riposte2', name: 'Riposte 2', kind: 'reaction', cat: 'riposte', hasVal: false, prereqEffect: 'contre_attaque',
      desc: 'Votre Contre-Attaque est utilisable 2 fois par tour adverse.' },
    { effect: 'riposte_distance', name: 'Riposte à Distance', kind: 'upgrade', cat: 'riposte', hasVal: false,
      desc: 'Votre Contre-Attaque fonctionne aussi contre les attaques à distance.' },
    { effect: 'execution', name: 'Exécution', kind: 'reaction', cat: 'riposte', hasVal: false,
      desc: 'Réaction — avant qu\'un adversaire de votre zone ne fuie : il subit votre bonus de Dégâts.' },
    // 🛡️ DÉFENSE & PROTECTION
    { effect: 'cuirasse', name: 'Cuirasse', kind: 'passive', cat: 'protection', hasVal: true, valDice: true, defaultVal: 1, valLabel: 'Réduction',
      desc: 'Réduit de X les Dégâts que vous subissez (minimum 0).' },
    { effect: 'esquive_innee', name: 'Esquive Innée', kind: 'upgrade', cat: 'protection', hasVal: false,
      desc: 'Vous gagnez Esquive : un 6+ annule tous les Dégâts d\'une attaque subie.' },
    { effect: 'garde_imprenable', name: 'Garde Imprenable', kind: 'upgrade', cat: 'protection', hasVal: false,
      desc: 'La 1ʳᵉ source de Dégâts de chaque tour est annulée.' },
    { effect: 'bouclier_mystique', name: 'Bouclier Mystique', kind: 'upgrade', cat: 'protection', hasVal: false,
      desc: 'Vous ignorez les Dégâts des dés bleus (Mystiques).' },
    { effect: 'solidite', name: 'Solidité', kind: 'upgrade', cat: 'protection', hasVal: false,
      desc: 'Votre DEF bloque normalement les dés rouges (Lourds).' },
    { effect: 'blindage_initial', name: 'Blindage Initial', kind: 'upgrade', cat: 'protection', hasVal: false,
      desc: 'Vous débutez chaque combat avec Blindage.' },
    { effect: 'crit_en_echec', name: 'Mur Imbrisable', kind: 'passive', cat: 'protection', hasVal: false,
      desc: 'Les Critiques adverses contre vous deviennent des Échecs.' },
    { effect: 'immun_etat', name: 'Immunité', kind: 'upgrade', cat: 'protection', hasVal: false,
      hasChoice: true, choiceLabel: 'État ignoré', choices: ['feu', 'affaibli', 'auSol', 'brise', 'faille', 'poison'],
      desc: 'Vous ne subissez jamais l\'état choisi.' },
    { effect: 'camouflage', name: 'Camouflage', kind: 'passive', cat: 'protection', hasVal: false,
      desc: 'Les attaques à distance ne peuvent pas vous cibler depuis une autre zone.' },
    { effect: 'invisibilite', name: 'Invisibilité', kind: 'passive', cat: 'protection', hasVal: false,
      desc: 'Vous êtes INVISIBLE : impossible de vous cibler directement et vous n\'apparaissez pas sur le terrain. On ne peut vous atteindre qu\'en visant votre zone, avec un test de Perception 2.' },
    { effect: 'dephasage', name: 'Déphasage', kind: 'action', cat: 'protection', hasVal: false,
      desc: 'Action : aucun Dégât ni état subi durant le prochain tour adverse.' },
    { effect: 'dernier_souffle', name: 'Dernier Souffle', kind: 'passive', cat: 'protection', hasVal: false,
      desc: '1×/combat : vous ignorez les Dégâts qui vous feraient tomber au coma.' },
    { effect: 'epines', name: 'Épines', kind: 'passive', cat: 'protection', hasVal: false,
      desc: 'Tout adversaire qui arrive dans votre zone subit votre bonus de Dégâts.' },
    // ❤️ SOINS & SURVIE
    { effect: 'soin_fixe', name: 'Premiers Soins', kind: 'action', cat: 'soin', hasVal: true, valDice: true, defaultVal: 3, valLabel: 'PV rendus',
      desc: 'Action : vous récupérez X PV.' },
    { effect: 'soin_endu', name: 'Second Souffle', kind: 'action', cat: 'soin', hasVal: true, valDice: true, defaultVal: 1, valLabel: 'PV bonus',
      desc: 'Action : vous récupérez ENDU + X PV.' },
    { effect: 'soin_des', name: 'Convalescence', kind: 'action', cat: 'soin', hasVal: true, valDice: true, defaultVal: 2, valLabel: 'Dés de soin 🟩',
      desc: 'Action : vous récupérez X dés de soin (🟩).' },
    { effect: 'regeneration', name: 'Régénération', kind: 'passive', cat: 'soin', hasVal: true, valDice: true, defaultVal: 2, valLabel: 'PV / tour',
      desc: 'À la fin de chaque tour, vous récupérez X PV (valeur fixe ou dés, ex. 1d6).' },
    { effect: 'guerison', name: 'Guérison', kind: 'action', cat: 'soin', hasVal: true, defaultVal: 1, valLabel: 'VIE rendue',
      desc: 'Action : vous récupérez X VIE perdue (jamais au-delà de votre VIE de départ).' },
    { effect: 'reanimation', name: 'Réanimation', kind: 'reaction', cat: 'soin', hasVal: true, valDice: true, defaultVal: 5, valLabel: 'PV rendus',
      desc: 'Réaction — un adversaire meurt dans la zone d\'un allié au coma : relevez cet allié à X PV.' },
    { effect: 'renforcement', name: 'Renforcement', kind: 'upgrade', cat: 'soin', hasVal: false,
      desc: 'Votre maximum de PV augmente de votre bonus de Dégâts.' },
    { effect: 'endurcissement', name: 'Endurcissement', kind: 'upgrade', cat: 'soin', hasVal: false,
      desc: 'Votre ENDU augmente de +1 par Niveau.' },
    { effect: 'regain', name: 'Regain', kind: 'passive', cat: 'soin', hasVal: false,
      desc: 'Quand une attaque adverse ne vous inflige aucun Dégât : vous récupérez votre ENDU en PV.' },
    // 🏃 MOUVEMENT & POSITION
    { effect: 'action_mouvement', name: 'Course', kind: 'action', cat: 'mouvement', hasVal: false,
      desc: 'Action : 1 mouvement.' },
    { effect: 'rebond', name: 'Rebond', kind: 'action', cat: 'mouvement', hasVal: false,
      desc: '2 mouvements gratuits ce tour, puis vous pouvez encore attaquer (l\'Action n\'est pas consommée).' },
    { effect: 'pas_leger', name: 'Pas Léger', kind: 'mastery', cat: 'mouvement', hasVal: false,
      desc: '1 mouvement gratuit avant le début de chaque tour.' },
    { effect: 'franchissement_libre', name: 'Pieds Sûrs', kind: 'upgrade', cat: 'mouvement', hasVal: false,
      desc: 'Vous franchissez les terrains DIFFICILES sans test d\'Agilité.' },
    { effect: 'teleportation', name: 'Téléportation', kind: 'upgrade', cat: 'mouvement', hasVal: false,
      desc: 'Vos mouvements franchissent toutes les barrières, même MURS et INFRANCHISSABLES.' },
    { effect: 'acrobatie', name: 'Acrobatie', kind: 'passive', cat: 'mouvement', hasVal: false,
      desc: '+1 dé noir à l\'attaque effectuée juste après avoir franchi une barrière DIFFICILE.' },
    { effect: 'ignore_opportunite', name: 'Insaisissable', kind: 'passive', cat: 'mouvement', hasVal: false,
      desc: 'Vous ignorez les Dégâts des attaques d\'opportunité (tir en zone occupée, ou sortie de zone).' },
    { effect: 'attaque_opportunite', name: 'Attaque d\'Opportunité', kind: 'passive', cat: 'mouvement', hasVal: false,
      desc: 'Vous infligez votre bonus de Dégâts à tout adversaire qui quitte votre zone ou y tire à distance.' },
    { effect: 'frayeur', name: 'Frayeur', kind: 'action', cat: 'mouvement', hasVal: false,
      desc: 'Action : un adversaire de votre zone doit fuir vers une autre zone (il subit les attaques d\'opportunité).' },
    { effect: 'a_bout_portant', name: 'À Bout Portant', kind: 'upgrade', cat: 'mouvement', hasVal: false,
      desc: 'Tirer à distance dans la zone d\'un adversaire ne déclenche pas d\'attaque d\'opportunité.' },
    { effect: 'charge_devastatrice', name: 'Charge Dévastatrice', kind: 'mastery', cat: 'mouvement', hasVal: true, defaultVal: 1, valLabel: 'Nb de cibles', hasScope: true,
      desc: 'Votre bonus de Dégâts frappe X adversaires quand vous arrivez dans leur zone.' },
    // 🤝 ALLIÉS & GARDE
    { effect: 'gardien', name: 'Gardien', kind: 'mastery', cat: 'groupe', hasVal: true, defaultVal: 1, valLabel: 'Nb d\'alliés Gardés',
      desc: 'Au Pré-Tour 1 : désignez X allié(s) — chacun reçoit Blindage et l\'état GARDÉ.' },
    { effect: 'protection', name: 'Protection', kind: 'reaction', cat: 'groupe', hasVal: false,
      desc: 'Réaction — un allié GARDÉ va subir une attaque : déplacez-vous dans sa zone et attaquez l\'assaillant.' },
    { effect: 'rempart', name: 'Rempart', kind: 'reaction', cat: 'groupe', hasVal: false,
      desc: 'Réaction — un allié de votre zone va subir des Dégâts : vous les subissez à sa place (avec votre DEF).' },
    { effect: 'cooperation', name: 'Coopération', kind: 'action', cat: 'groupe', hasVal: false,
      desc: 'Action : 1 attaque ; un allié GARDÉ de votre zone attaque gratuitement.' },
    { effect: 'assaut', name: 'Assaut', kind: 'action', cat: 'groupe', hasVal: false,
      desc: 'Action : tous les AUTRES aventuriers de votre zone attaquent gratuitement (vous n\'attaquez pas).' },
    { effect: 'ralliement', name: 'Ralliement', kind: 'passive', cat: 'groupe', hasVal: false,
      desc: 'Les alliés qui se déplacent vers votre zone ne dépensent pas leur mouvement.' },
    { effect: 'menace', name: 'Menace', kind: 'mastery', cat: 'groupe', hasVal: false,
      hasChoice: true, choiceLabel: 'Cibles forcées', choices: ['sbire', 'elite'],
      desc: 'Les adversaires de votre zone du type choisi sont obligés de vous cibler.' },
    { effect: 'garde_secrete', name: 'Garde Secrète', kind: 'mastery', cat: 'groupe', hasVal: false,
      desc: 'Un allié GARDÉ qui conserve son Blindage jusqu\'à la fin du combat rapporte +2 XP au groupe.' },
    // 🔮 ORBES & PYROMANCIE
    { effect: 'pyromane', name: 'Pyromane', kind: 'mastery', cat: 'orbes', hasVal: false,
      desc: 'Chaque tour, lancez vos Orbes Mystiques (1 dé bleu, à distance, séparément) : 2 au départ, +1 par niveau impair.' },
    { effect: 'deflagration', name: 'Déflagration', kind: 'action', cat: 'orbes', hasVal: false,
      desc: 'Action : lancez tous vos Orbes Mystiques restants sur une même cible à distance.' },
    { effect: 'orbe_partage', name: 'Orbes Partagés', kind: 'action', cat: 'orbes', hasVal: false,
      desc: 'Action : répartissez vos Orbes sur des alliés — chacun gagne +1 dé bleu et FEU à sa prochaine attaque.' },
    { effect: 'orbe_pretour', name: 'Préparation Arcanique', kind: 'mastery', cat: 'orbes', hasVal: false,
      desc: 'Vos Orbes sont utilisables dès le Pré-Tour 1 (et restent disponibles au Tour 1).' },
    { effect: 'orbe_double', name: 'Orbes Renforcés', kind: 'mastery', cat: 'orbes', hasVal: false,
      desc: 'Vos Orbes lancent 2 dés bleus chacun.' },
    { effect: 'orbe_bonus_dmg', name: 'Maîtrise des Orbes', kind: 'mastery', cat: 'orbes', hasVal: false,
      desc: 'Votre bonus de Dégâts s\'ajoute aux Dégâts de vos Orbes.' },
    { effect: 'orbe_feu', name: 'Orbe de Feu', kind: 'upgrade', cat: 'orbes', hasVal: false,
      desc: 'Vos Orbes infligent FEU.' },
    { effect: 'orbe_ignore_def', name: 'Orbe Perforant', kind: 'upgrade', cat: 'orbes', hasVal: false,
      desc: 'Vos Orbes ignorent la DEF des cibles.' },
    { effect: 'orbe_critique', name: 'Orbe Critique', kind: 'passive', cat: 'orbes', hasVal: false,
      desc: 'Vos Orbes peuvent réaliser des Critiques (double 6).' },
    { effect: 'orbe_zone', name: 'Orbe à Dispersion', kind: 'passive', cat: 'orbes', hasVal: false,
      desc: 'Déflagration à 3 Orbes ou plus : les Dégâts touchent TOUS les adversaires de la zone.' },
    // ⏱️ TEMPO & INITIATIVE
    { effect: 'pretour_first', name: 'Initiative', kind: 'passive', cat: 'tempo', hasVal: false,
      desc: 'Vous agissez au Pré-Tour, AVANT les adversaires rapides.' },
    { effect: 'prepare_initial', name: 'Vivacité', kind: 'upgrade', cat: 'tempo', hasVal: false,
      desc: 'Vous débutez chaque combat Préparé : +1 Action OU +1 Mouvement au premier tour.' },
    { effect: 'survitamine', name: 'Survitaminé', kind: 'upgrade', cat: 'tempo', hasVal: false,
      desc: '2 Actions par tour.' },
    // 🧭 HORS COMBAT
    { effect: 'boost_competence', name: 'Expertise', kind: 'upgrade', cat: 'aventure', hasVal: true, defaultVal: 1, valLabel: 'Réussites bonus',
      hasChoice: true, choiceLabel: 'Compétence', choices: ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'],
      desc: '+X réussites à tous vos tests de la compétence choisie.' },
    // — Doublons historiques fusionnés (alias résolus, absents du sélecteur) —
    { effect: 'frappe_perforante', name: 'Frappe Perforante', kind: 'upgrade', cat: 'degats', hasVal: false, legacy: 'perce_blindage',
      desc: 'Doublon de Perce-Blindage.' },
    { effect: 'esquive_6', name: 'Esquive 6+', kind: 'passive', cat: 'protection', hasVal: false, legacy: 'esquive_innee',
      desc: 'Doublon d\'Esquive Innée.' },
    { effect: 'devance_rapides', name: 'Réflexes Aiguisés', kind: 'passive', cat: 'tempo', hasVal: false, legacy: 'pretour_first',
      desc: 'Doublon d\'Initiative.' },
  ];
  // Alias des clés historiques → clé canonique (rétro-compat des talents déjà créés).
  const EFFECT_ALIASES = {};
  TALENT_EFFECTS.forEach(function (e) { if (e.legacy) EFFECT_ALIASES[e.effect] = e.legacy; });
  function canonicalEffect(key) { return EFFECT_ALIASES[key] || key; }
  // Catalogue pour l'éditeur / la référence : les doublons historiques (legacy)
  // sont exclus — leurs clés restent résolues via les alias.
  function talentEffects() {
    return JSON.parse(JSON.stringify(TALENT_EFFECTS.filter(function (e) { return !e.legacy; })));
  }
  function effectCategories() { return JSON.parse(JSON.stringify(EFFECT_CATEGORIES)); }
  // Carte clé → effet. Les clés legacy pointent vers l'entrée CANONIQUE, si bien
  // qu'un ancien talent (ex. 'frappe_perforante') garde un kind/desc corrects.
  function talentEffectMap() {
    const m = {};
    TALENT_EFFECTS.forEach(function (e) { if (!e.legacy) m[e.effect] = e; });
    TALENT_EFFECTS.forEach(function (e) { if (e.legacy && m[e.legacy]) m[e.effect] = m[e.legacy]; });
    return m;
  }
  // Niveau par défaut suggéré pour chaque effet seedé (purement indicatif, éditable)
  const SEED_LEVELS = {
    salve_zone: 3, assaut_mobile: 2, soin_fixe: 2, soin_endu: 3, soin_des: 3,
    double_attaque: 2, frappe_puissante: 2, coup_renversant: 3, attaque_affaiblissante: 3,
    attaque_enflammee: 4, frappe_tournoyante: 4, tir_charge: 2, tueur_au_sol: 2,
    tueur_affaibli: 3, meute: 2, frappe_lourde: 3, maitre_distance: 2, cuirasse: 3,
    regeneration: 4, arme_enflammee: 4, arme_affaiblissante: 5, esquive_innee: 3,
    garde_imprenable: 5, contre_attaque: 4, reanimation: 5,
    perce_blindage: 3, bourreau_rapides: 4, franchissement_libre: 2,
    pas_leger: 2, charge_devastatrice: 4, prepare_initial: 3,
    critique_destructeur: 5, attaque_furieuse: 3, execution: 3,
    mvt_critique: 2, epuisement: 3, accentuation: 4, allie_critique: 4,
    critique_explosif: 4, bain_de_sang: 5, cri_de_rage: 3,
    bouclier_mystique: 3, renforcement: 3,
    maitre_contact: 2, tueur_etat: 3, attaque_etat: 3, arme_etat: 4,
  };
  // Talents génériques par défaut : un talent prêt à l'emploi par effet câblé
  // (les doublons legacy ne sont plus seedés).
  const DEFAULT_GENTALENTS = TALENT_EFFECTS.filter(function (e) { return !e.legacy; }).map(function (e) {
    return {
      id: 'gt_' + e.effect, name: e.name, level: SEED_LEVELS[e.effect] || 2,
      usage: 'combat', kind: e.kind, effect: e.effect,
      val: e.hasVal ? (e.defaultVal || 0) : 0,
      dice: e.hasDice ? Object.assign({}, e.defaultDice || { white: 2 }) : undefined,
      range: e.hasRange ? (e.defaultRange || 'contact') : undefined,
      choice: e.hasChoice ? ((e.choices && e.choices[0]) || '') : undefined,
      description: e.desc,
    };
  });
  // Normalise les effets d'un talent en liste [{effect,val,dice,range,choice,scope}].
  // Supporte le format multi-effets (t.effects[]) ET l'ancien format mono-effet.
  // Les clés legacy sont converties vers leur clé canonique : le moteur ne voit
  // JAMAIS d'ancienne clé (migration douce des talents déjà créés).
  function talentEffectList(t) {
    if (t && Array.isArray(t.effects) && t.effects.length) {
      return t.effects.filter(function (e) { return e && e.effect; }).map(function (e) {
        return { effect: canonicalEffect(e.effect), val: e.val || 0, dice: e.dice || null, range: e.range || null, choice: e.choice || null, scope: e.scope || 'count' };
      });
    }
    if (t && t.effect) {
      return [{ effect: canonicalEffect(t.effect), val: t.val || 0, dice: t.dice || null, range: t.range || null, choice: t.choice || null, scope: t.scope || 'count' }];
    }
    return [];
  }
  function loadGenericTalents() {
    let arr = null;
    try {
      const raw = global.localStorage.getItem(GENTALENT_KEY);
      arr = raw ? JSON.parse(raw) : null;
    } catch (e) { arr = null; }
    if (!Array.isArray(arr)) return JSON.parse(JSON.stringify(DEFAULT_GENTALENTS));
    // Complète avec les talents intégrés manquants (nouveaux effets ajoutés à l'app),
    // SAUF ceux que le MJ a explicitement supprimés (pierres tombales).
    const tomb = loadGenTombstones();
    DEFAULT_GENTALENTS.forEach(function (d) {
      if (tomb.indexOf(d.id) >= 0) return;
      if (!arr.some(function (t) { return t.id === d.id || (d.effect && t.effect === d.effect); })) {
        arr.push(JSON.parse(JSON.stringify(d)));
      }
    });
    // Normalise : un talent rattaché à un effet hérite de son kind si absent (anciennes sauvegardes)
    const cat = talentEffectMap();
    arr.forEach(function (t) {
      if (t.effect && cat[t.effect]) {
        if (!t.kind) t.kind = cat[t.effect].kind;
        if (typeof t.val !== 'number') t.val = cat[t.effect].hasVal ? (cat[t.effect].defaultVal || 0) : 0;
      }
    });
    return arr;
  }
  function saveGenericTalents(arr) {
    try { global.localStorage.setItem(GENTALENT_KEY, JSON.stringify(arr)); } catch (e) {}
    // Recalcule les pierres tombales : tout talent intégré absent du tableau
    // sauvegardé est considéré comme supprimé par le MJ (et ne sera pas réinjecté).
    try {
      const list = Array.isArray(arr) ? arr : [];
      const tomb = DEFAULT_GENTALENTS.filter(function (d) {
        return !list.some(function (t) { return t.id === d.id || (d.effect && t.effect === d.effect); });
      }).map(function (d) { return d.id; });
      global.localStorage.setItem(GENTALENT_DEL_KEY, JSON.stringify(tomb));
    } catch (e) {}
  }

  // ---------- Talents adverses (catalogue MJ/Admin) ----------
  // Chaque talent du catalogue se rattache à un déclencheur du moteur de combat
  // (trigger). Le champ X est variable, ajustable par monstre dans son éditeur.
  const MONTALENT_KEY = 'amertume_montalents_v1';
  const DEFAULT_MONTALENTS = [
    { id: 'craintif', name: 'CRAINTIF', trigger: 'flee_on_big_hit',    defaultVal: 10, desc: 'Fuite si X+ dégâts en une seule attaque.' },
    { id: 'fuyard',   name: 'FUYARD',   trigger: 'flee_after_turns',   defaultVal: 3,  desc: 'Fuit le combat après le tour X.' },
    { id: 'horde',    name: 'HORDE',    trigger: 'ally_contact_bonus', defaultVal: 1,  desc: '+X dégâts par allié dans sa zone.' },
    { id: 'lent',     name: 'LENT',     trigger: 'slow',               defaultVal: 0,  desc: 'Ne peut pas attaquer s\'il effectue un mouvement.' },
    { id: 'soutien',  name: 'SOUTIEN',  trigger: 'zone_support',       defaultVal: 1,  desc: 'Les adversaires dans sa zone infligent +X dégâts.' },
    { id: 'blindage', name: 'BLINDAGE', trigger: 'armor_charges',      defaultVal: 1,  desc: 'Ignore X prochaine(s) source(s) de dégâts avant de perdre Blindage.' },
    { id: 'proie',    name: 'PROIE',    trigger: 'mark_target_dice',   defaultVal: 1,  desc: 'Désigne un aventurier au début de chaque tour (selon le critère choisi) ; tous les adversaires ajoutent X dé(s) de la couleur choisie contre lui.' },
    { id: 'happe',    name: 'HAPPE',    trigger: 'pull_to_zone',       defaultVal: 0,  desc: 'Avant d\'attaquer, déplace de force un aventurier d\'une autre zone dans sa zone.' },
    { id: 'riposte',  name: 'RIPOSTE',  trigger: 'counter_attack',     defaultVal: 0,  desc: 'Riposte d\'une attaque contre tout aventurier qui l\'attaque (1 fois par tour).' },
    { id: 'agile',    name: 'AGILE',    trigger: 'cross_difficult_free', defaultVal: 0, desc: 'Franchit les terrains difficiles sans test d\'Agilité.' },
  ];
  function loadMonsterTalents() {
    let arr = null;
    try {
      const raw = global.localStorage.getItem(MONTALENT_KEY);
      arr = raw ? JSON.parse(raw) : null;
    } catch (e) { arr = null; }
    if (!Array.isArray(arr)) return JSON.parse(JSON.stringify(DEFAULT_MONTALENTS));
    // Complète avec les talents intégrés manquants (nouveaux talents ajoutés à l'app)
    DEFAULT_MONTALENTS.forEach(function (d) {
      if (!arr.some(function (t) { return t.id === d.id || t.trigger === d.trigger; })) {
        arr.push(JSON.parse(JSON.stringify(d)));
      }
    });
    return arr;
  }
  function saveMonsterTalents(talents) {
    try { global.localStorage.setItem(MONTALENT_KEY, JSON.stringify(talents)); } catch (e) {}
  }

  // ---------- Talents adverses NOMMÉS (effet-based, onglet Talents Adv.) ----------
  // Créés par le MJ à partir du même pool d'effets que les talents d'aventurier ;
  // référencés par les adversaires (m.advTalentIds) dans l'éditeur du Bestiaire.
  const ADVTALENT_KEY = 'amertume_adv_talents_v1';
  function loadAdvTalents() {
    try {
      const raw = global.localStorage.getItem(ADVTALENT_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveAdvTalents(arr) {
    try { global.localStorage.setItem(ADVTALENT_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
  }

  // ---------- Talents de Parchemin ----------
  // Pool de talents DÉDIÉS aux parchemins (onglet Classes, colonne « Parchemins »).
  // Accessibles UNIQUEMENT via un objet Parchemin — jamais débloqués par niveau.
  const PARCHTALENT_KEY = 'amertume_parchtalents_v1';
  function loadParchTalents() {
    try {
      const raw = global.localStorage.getItem(PARCHTALENT_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveParchTalents(arr) {
    try { global.localStorage.setItem(PARCHTALENT_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
  }

  // ---------- Tutoriels / Encyclopédie ----------
  // Entrées pédagogiques affichées aux joueurs (onglet Tutoriel) et éditées
  // par le MJ (onglet Encyclopédie). Chaque entrée : { id, title, content }.
  const TUTO_KEY = 'amertume_tutorials_v1';
  const DEFAULT_TUTORIALS = [
    { id: 'tut_bienvenue', title: 'Bienvenue dans Amertüme', content:
      'Amertüme est un jeu de rôle solo.\n\nChoisis une aventure depuis l\'accueil, constitue ton groupe d\'aventuriers, puis progresse de scène en scène en lisant la narration et en faisant tes choix.\n\nConsulte les autres tutoriels pour maîtriser le combat, les dés et l\'inventaire.' },
    { id: 'tut_combat', title: 'Le module de combat', content:
      'Le combat se déroule par tours, en zones.\n\n• Clique un aventurier pour afficher son bandeau d\'action.\n• Clique une de ses attaques, puis l\'adversaire à frapper.\n• Le bouton Mouv. permet de changer de zone : clique-le, puis clique la zone de destination.\n• Le bouton Analyse révèle la DEF, les dégâts et les talents d\'un adversaire.\n\nUne attaque de contact rapproche l\'aventurier de sa cible ; une attaque à distance (tir) frappe sans se déplacer, mais déclenche les attaques d\'opportunité des ennemis présents dans la zone de l\'aventurier.' },
    { id: 'tut_des', title: 'Les dés', content:
      'Chaque attaque lance un ensemble de dés colorés.\n\n• Deux 6 ou plus = Critique (relances bonus).\n• Deux 1 sur des dés non mortels = Échec.\n• Les dés Os (légers) sont retirés du total sur un double.\n\nLa DEF de la cible bloque les dés dont la valeur ne la dépasse pas (sauf dés lourds, mortels et soins qui l\'ignorent).' },
  ];
  function loadTutorials() {
    let arr = null;
    try {
      const raw = global.localStorage.getItem(TUTO_KEY);
      arr = raw ? JSON.parse(raw) : null;
    } catch (e) { arr = null; }
    if (!Array.isArray(arr)) return JSON.parse(JSON.stringify(DEFAULT_TUTORIALS));
    return arr;
  }
  function saveTutorials(arr) {
    try { global.localStorage.setItem(TUTO_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // Remplace les balises dynamiques d'une description de talent par les valeurs
  // de l'aventurier concerné. Balises reconnues : <ENDU>, <DEGATS>/<DÉGÂTS>,
  // <VIE>, <PV>, <NIVEAU>/<NIV>, <ORBES>. Les balises inconnues sont conservées.
  function fillTalentTags(desc, ctx) {
    if (!desc || desc.indexOf('<') < 0) return desc;
    ctx = ctx || {};
    const map = {
      'ENDU': ctx.endu, 'DEGATS': ctx.damage, 'DÉGÂTS': ctx.damage, 'DEGAT': ctx.damage,
      'VIE': ctx.vie, 'PV': ctx.pv, 'NIVEAU': ctx.niveau, 'NIV': ctx.niveau,
      'ORBES': ctx.orbes, 'ORBE': ctx.orbes,
    };
    return desc.replace(/<([A-Za-zÀ-ÿ]+)>/g, function (m, tag) {
      const v = map[tag.toUpperCase()];
      return (v == null) ? m : String(v);
    });
  }

  // Variante HTML : même remplacement, mais les valeurs apparaissent en GRAS et
  // dans la couleur de la caractéristique concernée (classes .tagv-*). Le texte
  // est échappé ici — le résultat s'insère en innerHTML sans ré-échappement.
  const TAG_CLASS = {
    'ENDU': 'endu', 'DEGATS': 'damage', 'DÉGÂTS': 'damage', 'DEGAT': 'damage',
    'VIE': 'vie', 'PV': 'pv', 'NIVEAU': 'niveau', 'NIV': 'niveau',
    'ORBES': 'orbes', 'ORBE': 'orbes',
  };
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fillTalentTagsHtml(desc, ctx) {
    ctx = ctx || {};
    const map = {
      'ENDU': ctx.endu, 'DEGATS': ctx.damage, 'DÉGÂTS': ctx.damage, 'DEGAT': ctx.damage,
      'VIE': ctx.vie, 'PV': ctx.pv, 'NIVEAU': ctx.niveau, 'NIV': ctx.niveau,
      'ORBES': ctx.orbes, 'ORBE': ctx.orbes,
    };
    return escHtml(desc).replace(/&lt;([A-Za-zÀ-ÿ]+)&gt;/g, function (m, tag) {
      const key = tag.toUpperCase();
      const v = map[key];
      if (v == null) return m;
      return '<b class="tagv tagv-' + (TAG_CLASS[key] || 'niveau') + '">' + String(v) + '</b>';
    });
  }

  // ---- Valeurs « fixes ou en dés » (ex. « 3 », « 2d6 », « 1d6+2 ») ----
  // Utilisées dans les champs numériques qui acceptent un tirage aléatoire
  // (conséquences d'échec de test, XP de récompense de test…).
  const DICE_RE = /^(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?$/i;
  function isDiceExpr(v) {
    return typeof v === 'string' && DICE_RE.test(v.trim());
  }
  // Résout une valeur : nombre → tel quel ; « XdY(+Z) » → tirage aléatoire.
  function rollAmount(v) {
    if (typeof v === 'number') return v;
    const s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    const m = s.match(DICE_RE);
    if (m) {
      const n = Math.min(50, Math.max(1, parseInt(m[1], 10) || 1));
      const faces = Math.max(2, parseInt(m[2], 10) || 6);
      const mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
      let total = 0;
      for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * faces);
      return total + mod;
    }
    return parseInt(s, 10) || 0;
  }

  global.Store = {
    uid: uid,
    findMonster: findMonster,
    fillTalentTags: fillTalentTags,
    fillTalentTagsHtml: fillTalentTagsHtml,
    rollAmount: rollAmount,
    isDiceExpr: isDiceExpr,
    maxLevel: function () { return MAX_LEVEL; },
    noStates: noStates,
    loadOfficial: loadOfficial,
    levelInfo: levelInfo,
    xpForLevel: xpForLevel,
    get state() { return state; },
    save: save,
    replace: function (newState) {
      state = newState;
      save();
    },
    reset: function () {
      state = defaultState();
      save();
    },
    loadAdventures: loadAdventures,
    saveAdventures: saveAdventures,
    loadSagas: loadSagas,
    saveSagas: saveSagas,
    loadHomeOrder: loadHomeOrder,
    saveHomeOrder: saveHomeOrder,
    homeLayout: homeLayout,
    loadSessions: loadSessions,
    saveSessions: saveSessions,
    loadClasses: loadClasses,
    saveClasses: saveClasses,
    loadGenericTalents: loadGenericTalents,
    saveGenericTalents: saveGenericTalents,
    talentEffects: talentEffects,
    effectCategories: effectCategories,
    canonicalEffect: canonicalEffect,
    talentEffectMap: talentEffectMap,
    talentEffectList: talentEffectList,
    loadMonsterTalents: loadMonsterTalents,
    saveMonsterTalents: saveMonsterTalents,
    loadAdvTalents: loadAdvTalents,
    saveAdvTalents: saveAdvTalents,
    loadParchTalents: loadParchTalents,
    saveParchTalents: saveParchTalents,
    loadTutorials: loadTutorials,
    saveTutorials: saveTutorials,
    loadUnlocked: loadUnlocked,
    saveUnlocked: saveUnlocked,
  };
})(window);
