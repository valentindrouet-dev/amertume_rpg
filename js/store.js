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
  // kind : 'action' (bleu, consomme l'action du tour) · 'reaction' (violet,
  // déclenché par le joueur quand un prérequis est rempli) · 'passive' (toujours
  // actif si la condition est remplie) · 'upgrade' (améliore un élément existant).
  // hasVal : l'effet utilise une variable X (valLabel décrit X).
  const TALENT_EFFECTS = [
    // --- Actions (attaques spéciales jouables) ---
    { effect: 'double_attaque', name: 'Double Attaque', kind: 'action', hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      desc: 'Frappe X adversaires d\'une même zone avec les dégâts de votre arme.' },
    { effect: 'salve_zone', name: 'Salve de Zone', kind: 'action', hasVal: true, defaultVal: 2, valLabel: 'Nb de cibles', hasScope: true,
      hasDice: true, defaultDice: { white: 2 }, hasRange: true, defaultRange: 'contact',
      desc: 'Inflige vos propres dés de dégâts à X adversaires d\'une même zone (au contact ou à distance).' },
    { effect: 'assaut_mobile', name: 'Assaut Mobile', kind: 'action', hasVal: false,
      desc: 'Vous effectuez 1 mouvement et 1 attaque (une seule action ; le mouvement est gratuit).' },
    { effect: 'rebond', name: 'Rebond', kind: 'action', hasVal: false,
      desc: 'Vous gagnez 2 mouvements gratuits ce tour (à utiliser comme vous voulez), puis vous pouvez attaquer.' },
    { effect: 'soin_fixe', name: 'Premiers Soins', kind: 'action', hasVal: true, defaultVal: 3, valLabel: 'PV rendus',
      desc: 'Action : vous récupérez X PV.' },
    { effect: 'soin_endu', name: 'Second Souffle', kind: 'action', hasVal: true, defaultVal: 1, valLabel: 'PV bonus',
      desc: 'Action : vous récupérez ENDU + X PV.' },
    { effect: 'soin_des', name: 'Convalescence', kind: 'action', hasVal: true, defaultVal: 2, valLabel: 'Dés de soin 🟩',
      desc: 'Action : vous récupérez X dés de soin (🟩).' },
    { effect: 'frappe_puissante', name: 'Frappe Puissante', kind: 'action', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: 'Attaque de contact infligeant +X dégâts.' },
    { effect: 'coup_renversant', name: 'Coup Renversant', kind: 'action', hasVal: false,
      desc: 'Attaque de contact qui met la cible AU SOL.' },
    { effect: 'attaque_affaiblissante', name: 'Attaque Affaiblissante', kind: 'action', hasVal: false,
      desc: 'Attaque qui inflige AFFAIBLI à la cible.' },
    { effect: 'attaque_enflammee', name: 'Attaque Enflammée', kind: 'action', hasVal: false,
      desc: 'Attaque de contact qui inflige FEU à la cible.' },
    { effect: 'frappe_tournoyante', name: 'Frappe Tournoyante', kind: 'action', hasVal: false,
      desc: 'Frappe TOUS les adversaires présents dans votre zone.' },
    { effect: 'tir_charge', name: 'Tir Chargé', kind: 'action', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: 'Attaque à distance infligeant +X dégâts.' },
    // --- Passifs (automatiques) ---
    { effect: 'tueur_au_sol', name: 'Tueur au Sol', kind: 'passive', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X dégâts contre une cible AU SOL.' },
    { effect: 'tueur_affaibli', name: 'Achèvement', kind: 'passive', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X dégâts contre une cible AFFAIBLI.' },
    { effect: 'meute', name: 'Meute', kind: 'passive', hasVal: true, defaultVal: 1, valLabel: 'Dégâts/allié',
      desc: '+X dégâts par allié présent dans la zone de la cible.' },
    { effect: 'frappe_lourde', name: 'Frappe Lourde', kind: 'passive', hasVal: true, defaultVal: 1, valLabel: 'Dégâts bonus',
      desc: '+X dégâts à toutes vos attaques.' },
    { effect: 'maitre_distance', name: 'Maître à Distance', kind: 'passive', hasVal: true, defaultVal: 2, valLabel: 'Dégâts bonus',
      desc: '+X dégâts à vos attaques à distance.' },
    { effect: 'cuirasse', name: 'Cuirasse', kind: 'passive', hasVal: true, defaultVal: 1, valLabel: 'Réduction',
      desc: 'Réduit de X les dégâts que vous subissez (minimum 0).' },
    { effect: 'regeneration', name: 'Régénération', kind: 'passive', hasVal: true, defaultVal: 2, valLabel: 'PV/tour',
      desc: 'Récupère X PV au début de chacun de vos tours.' },
    { effect: 'devance_rapides', name: 'Réflexes Aiguisés', kind: 'passive', hasVal: false,
      desc: 'Vous agissez avant les adversaires rapides.' },
    { effect: 'ignore_opportunite', name: 'Insaisissable', kind: 'passive', hasVal: false,
      desc: 'Vous ignorez les dégâts des attaques d\'opportunité (tir dans la zone, ou mouvement pour quitter la zone).' },
    { effect: 'pas_echec_ausol', name: 'Coup de Grâce', kind: 'passive', hasVal: false,
      desc: 'Vous n\'effectuez pas d\'échec (double 1) contre les adversaires AU SOL (les 1 sont infligés normalement comme des dégâts, s\'ils passent la DEF).' },
    { effect: 'crit_en_echec', name: 'Mur Imbrisable', kind: 'passive', hasVal: false,
      desc: 'Les critiques adverses contre vous deviennent des échecs.' },
    // --- Améliorations (modifient un élément existant) ---
    { effect: 'arme_enflammee', name: 'Arme Enflammée', kind: 'upgrade', hasVal: false,
      desc: 'Vos attaques de contact infligent FEU.' },
    { effect: 'arme_affaiblissante', name: 'Arme Vampirique', kind: 'upgrade', hasVal: false,
      desc: 'Vos attaques infligent AFFAIBLI.' },
    { effect: 'esquive_innee', name: 'Esquive Innée', kind: 'upgrade', hasVal: false,
      desc: 'Vous gagnez Esquive : un 6+ annule l\'attaque que vous subissez.' },
    { effect: 'garde_imprenable', name: 'Garde Imprenable', kind: 'upgrade', hasVal: false,
      desc: 'La 1ʳᵉ source de dégâts de chaque tour est annulée.' },
    { effect: 'perce_blindage', name: 'Perce-Blindage', kind: 'upgrade', hasVal: false,
      desc: 'Vos attaques ignorent Blindage.' },
    { effect: 'bourreau_rapides', name: 'Bourreau des Rapides', kind: 'upgrade', hasVal: false,
      desc: 'Vous doublez les dégâts infligés à un adversaire rapide.' },
    { effect: 'boost_competence', name: 'Expertise', kind: 'upgrade', hasVal: true, defaultVal: 1, valLabel: 'Réussites bonus',
      hasChoice: true, choiceLabel: 'Compétence', choices: ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'],
      desc: 'Vous ajoutez +X réussites à tous vos tests de la compétence choisie.' },
    { effect: 'charge_etat', name: 'Assaut Handicapant', kind: 'upgrade', hasVal: false,
      hasChoice: true, choiceLabel: 'État infligé', choices: ['feu', 'auSol', 'affaibli'],
      desc: 'Vous infligez l\'état choisi (FEU / AU SOL / AFFAIBLI) en arrivant au contact d\'un adversaire.' },
    // --- Maîtrises (effets permanents de positionnement / tempo) ---
    { effect: 'pas_leger', name: 'Pas Léger', kind: 'mastery', hasVal: false,
      desc: 'Vous effectuez 1 mouvement gratuit avant le début de chaque tour.' },
    { effect: 'charge_devastatrice', name: 'Charge Dévastatrice', kind: 'mastery', hasVal: true, defaultVal: 1, valLabel: 'Nb de cibles', hasScope: true,
      desc: 'Vous infligez votre bonus de dégâts à X adversaires en arrivant dans leur zone.' },
    { effect: 'action_mouvement', name: 'Course', kind: 'action', hasVal: false,
      desc: 'Action : vous effectuez un mouvement.' },
    // --- Réactions (déclenchées par le joueur) ---
    { effect: 'contre_attaque', name: 'Contre-Attaque', kind: 'reaction', hasVal: false,
      desc: 'Après avoir subi des dégâts, ripostez par une attaque gratuite.' },
    { effect: 'reanimation', name: 'Réanimation', kind: 'reaction', hasVal: true, defaultVal: 5, valLabel: 'PV rendus',
      desc: 'Relevez un allié au coma situé dans une zone où un adversaire est mort (X PV).' },
  ];
  function talentEffects() { return JSON.parse(JSON.stringify(TALENT_EFFECTS)); }
  function talentEffectMap() {
    const m = {};
    TALENT_EFFECTS.forEach(function (e) { m[e.effect] = e; });
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
    devance_rapides: 3, perce_blindage: 3, bourreau_rapides: 4,
    pas_leger: 2, charge_devastatrice: 4,
  };
  // Talents génériques par défaut : un talent prêt à l'emploi par effet câblé.
  const DEFAULT_GENTALENTS = TALENT_EFFECTS.map(function (e) {
    return {
      id: 'gt_' + e.effect, name: e.name, level: SEED_LEVELS[e.effect] || 2,
      usage: 'combat', kind: e.kind, effect: e.effect,
      val: e.hasVal ? (e.defaultVal || 0) : 0,
      dice: e.hasDice ? Object.assign({}, e.defaultDice || { white: 2 }) : undefined,
      range: e.hasRange ? (e.defaultRange || 'contact') : undefined,
      description: e.desc,
    };
  });
  // Normalise les effets d'un talent en liste [{effect,val,dice,range}].
  // Supporte le format multi-effets (t.effects[]) ET l'ancien format mono-effet.
  function talentEffectList(t) {
    if (t && Array.isArray(t.effects) && t.effects.length) {
      return t.effects.filter(function (e) { return e && e.effect; }).map(function (e) {
        return { effect: e.effect, val: e.val || 0, dice: e.dice || null, range: e.range || null, choice: e.choice || null, scope: e.scope || 'count' };
      });
    }
    if (t && t.effect) {
      return [{ effect: t.effect, val: t.val || 0, dice: t.dice || null, range: t.range || null, choice: t.choice || null, scope: t.scope || 'count' }];
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
    loadGenericTalents: loadGenericTalents,
    saveGenericTalents: saveGenericTalents,
    talentEffects: talentEffects,
    talentEffectMap: talentEffectMap,
    talentEffectList: talentEffectList,
    loadMonsterTalents: loadMonsterTalents,
    saveMonsterTalents: saveMonsterTalents,
    loadTutorials: loadTutorials,
    saveTutorials: saveTutorials,
    loadUnlocked: loadUnlocked,
    saveUnlocked: saveUnlocked,
  };
})(window);
