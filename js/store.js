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

  function defaultState() {
    return {
      items: [
        {
          id: uid(), name: 'Épée courte', category: 'weapon', qty: 1,
          hands: 1, ranged: false, usesAmmo: false, consumable: false,
          dice: { white: 2, bone: 0, red: 0, blue: 0, green: 0, black: 0, yellow: 0 },
          effects: '', notes: 'Arme de départ',
        },
        {
          id: uid(), name: 'Potion de soin', category: 'object', qty: 2,
          hands: 1, ranged: false, usesAmmo: false, consumable: true,
          dice: AmertumeDice.emptyPool(),
          effects: '', notes: 'Rend des PV',
        },
      ],
      equipped: { mainHand: null, offHand: null, twoHand: null },
      extraDice: AmertumeDice.emptyPool(),
      history: [],
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
