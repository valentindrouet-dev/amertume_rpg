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
    ];
  }

  function defaultState() {
    const items = buildOfficialEquipment();
    items.push({
      id: uid(), name: 'Potion de soin', category: 'object', qty: 2,
      hands: 1, ranged: false, usesAmmo: false, consumable: true,
      dice: AmertumeDice.emptyPool(), effects: '', notes: 'Rend des PV',
    });
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
    { lvl: 1, xp: 0, points: 10 },
    { lvl: 2, xp: 20, points: 13 },
    { lvl: 3, xp: 50, points: 16 },
    { lvl: 4, xp: 100, points: 20 },
    { lvl: 5, xp: 200, points: 25 },
    { lvl: 6, xp: 350, points: 30 },
    { lvl: 7, xp: 600, points: 35 },
  ];

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
        cb.combatants.forEach(function (c) {
          if (!c.states) c.states = { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false };
          if (!c.used) c.used = { action: false, move: false, object: false };
          if (!Array.isArray(c.contact)) c.contact = [];
          if (!Array.isArray(c.attacks)) c.attacks = [];
          c.attacks.forEach(normAttack);
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

  global.Store = {
    uid: uid,
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
    loadSessions: loadSessions,
    saveSessions: saveSessions,
    loadClasses: loadClasses,
    saveClasses: saveClasses,
    loadUnlocked: loadUnlocked,
    saveUnlocked: saveUnlocked,
  };
})(window);
