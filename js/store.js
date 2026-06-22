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

  function defaultState() {
    return {
      items: [
        {
          id: uid(), name: 'Épée courte', category: 'weapon', qty: 1,
          hands: 1, ranged: false, usesAmmo: false, consumable: false,
          dice: dice({ white: 2 }), effects: '', notes: 'Arme de départ',
        },
        {
          id: uid(), name: 'Potion de soin', category: 'object', qty: 2,
          hands: 1, ranged: false, usesAmmo: false, consumable: true,
          dice: AmertumeDice.emptyPool(), effects: '', notes: 'Rend des PV',
        },
      ],
      equipped: { mainHand: null, offHand: null, twoHand: null },
      extraDice: AmertumeDice.emptyPool(),
      history: [],

      // Roster de héros (combattants légers)
      heroes: [
        {
          id: uid(), name: 'Aventurier', vie: 4, endu: 3, pvBonus: 0,
          def: 3, damage: 2, rapide: false, notes: '',
          attacks: [
            { name: 'Attaque (épée)', dice: dice({ white: 2 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: noStates() },
          ],
        },
      ],

      // Bestiaire (modèles d'adversaires)
      monsters: [
        {
          id: uid(), name: 'Rôdeur famélique', type: 'standard', socle: 'medium',
          pv: 6, def: 3, damage: 2, xp: 5, menace: 'closest', esquive: false, rapide: false, notes: '',
          attacks: [
            { name: 'Griffes', dice: dice({ white: 2 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: noStates() },
          ],
        },
        {
          id: uid(), name: 'Charognard enragé', type: 'standard', socle: 'medium',
          pv: 8, def: 2, damage: 3, xp: 7, menace: 'closest', esquive: false, rapide: true, notes: 'Rapide',
          attacks: [
            { name: 'Morsure', dice: dice({ white: 1, bone: 1 }), range: 'contact',
              targets: 'one', useOwnDamage: true, effects: { affaibli: false, auSol: false, feu: false } },
          ],
        },
        {
          id: uid(), name: 'Mystique déchu', type: 'solitaire', socle: 'medium',
          pv: 14, def: 4, damage: 2, xp: 15, menace: 'defLow', esquive: true, rapide: false, notes: '',
          attacks: [
            { name: 'Boule de feu', dice: dice({ blue: 2 }), range: 'distance',
              targets: 'one', useOwnDamage: true, effects: { affaibli: false, auSol: false, feu: true } },
          ],
        },
        {
          id: uid(), name: 'Colosse d’Amertume', type: 'boss', socle: 'huge',
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

      // Combat en cours (null hors combat)
      combat: null,
    };
  }

  let state = load();

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Garde-fous minimaux
      if (!parsed.items) parsed.items = [];
      if (!parsed.equipped) parsed.equipped = { mainHand: null, offHand: null, twoHand: null };
      if (!parsed.extraDice) parsed.extraDice = AmertumeDice.emptyPool();
      if (!parsed.history) parsed.history = [];
      // Migration : ajoute les nouveaux blocs si absents d'une ancienne sauvegarde
      const def = defaultState();
      if (!parsed.heroes) parsed.heroes = def.heroes;
      if (!parsed.monsters) parsed.monsters = def.monsters;
      if (typeof parsed.combat === 'undefined') parsed.combat = null;
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

  global.Store = {
    uid: uid,
    noStates: noStates,
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
  };
})(window);
