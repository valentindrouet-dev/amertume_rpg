/*
 * Moteur de dés Amertume.
 * Gère les 7 couleurs de dés et la résolution d'une attaque selon les règles :
 * Critique (double 6), Échec (double 1), légers retirés sur double,
 * mystiques doublés sur double, dés Phase multipliés par le tour (max 3).
 */
(function (global) {
  'use strict';

  // Définition des types de dés (ordre d'affichage)
  const DICE_TYPES = {
    white:  { key: 'white',  label: 'Simple',   emoji: '⬜', ignoresDef: false, heal: false },
    bone:   { key: 'bone',   label: 'Léger',    emoji: '🟧', ignoresDef: false, heal: false },
    red:    { key: 'red',    label: 'Lourd',    emoji: '🟥', ignoresDef: true,  heal: false },
    blue:   { key: 'blue',   label: 'Mystique', emoji: '🟦', ignoresDef: false, heal: false },
    green:  { key: 'green',  label: 'Soin',     emoji: '🟩', ignoresDef: true,  heal: true  },
    black:  { key: 'black',  label: 'Mortel',   emoji: '⬛', ignoresDef: true,  heal: false },
    yellow: { key: 'yellow', label: 'Phase',    emoji: '🟨', ignoresDef: false, heal: false },
    pink:   { key: 'pink',   label: 'Faille',   emoji: '🟪', ignoresDef: false, heal: false },
  };
  // Ordre d'affichage : NOIR > ROUGE > BLEU > VERT > JAUNE > BLANC > OS > ROSE
  const DICE_ORDER = ['black', 'red', 'blue', 'green', 'yellow', 'white', 'bone', 'pink'];

  function emptyPool() {
    const p = {};
    DICE_ORDER.forEach(function (k) { p[k] = 0; });
    return p;
  }

  function addPools() {
    const out = emptyPool();
    for (let i = 0; i < arguments.length; i++) {
      const pool = arguments[i] || {};
      DICE_ORDER.forEach(function (k) { out[k] += (pool[k] || 0); });
    }
    return out;
  }

  function poolCount(pool) {
    return DICE_ORDER.reduce(function (n, k) { return n + (pool[k] || 0); }, 0);
  }

  function d6() { return 1 + Math.floor(Math.random() * 6); }

  /*
   * Résout un lancer.
   * pool : { white, bone, red, blue, green, black, yellow }
   * opts : { def, damage, turn }
   * Retourne un objet détaillé pour l'affichage.
   */
  function resolve(pool, opts) {
    opts = opts || {};
    const def = Math.max(0, parseInt(opts.def, 10) || 0);
    const damage = Math.max(0, parseInt(opts.damage, 10) || 0);
    const turnMult = Math.min(3, Math.max(1, parseInt(opts.turn, 10) || 1));

    // 1. On lance tous les dés du pool
    const dice = [];
    DICE_ORDER.forEach(function (color) {
      const n = pool[color] || 0;
      for (let i = 0; i < n; i++) {
        dice.push({ color: color, value: d6(), bonus: false });
      }
    });

    // 2. Critique : deux 6 ou plus (toutes couleurs) déclenchent une relance bonus en chaîne.
    // DESTRUCTEUR (opts.destructeur) : critique sur TOUT double (sauf les 1) ; la relance
    // bonus n'explose que si la même face que le double critique est reproduite.
    const colorsPresent = DICE_ORDER.filter(function (c) { return (pool[c] || 0) > 0; });
    let critique = false;
    let critValue = 6;
    if (colorsPresent.length) {
      const initFace = {};
      dice.forEach(function (d) { initFace[d.value] = (initFace[d.value] || 0) + 1; });
      if (opts.destructeur) {
        for (let v = 6; v >= 2; v--) { if ((initFace[v] || 0) >= 2) { critique = true; critValue = v; break; } }
      } else if ((initFace[6] || 0) >= 2) {
        critique = true; critValue = 6;
      }
    }
    if (critique) {
      let keepRolling = true;
      let guard = 0;
      while (keepRolling && guard < 50) {
        guard++;
        const color = colorsPresent[Math.floor(Math.random() * colorsPresent.length)];
        const v = d6();
        dice.push({ color: color, value: v, bonus: true });
        keepRolling = (v === critValue); // relance tant que la face critique est reproduite
      }
    }

    // 2.5. FAILLE (dé rose) : les dés partageant la même face qu'un dé rose sont exclus des dégâts.
    const pinkVals = new Set();
    dice.forEach(function (d) { if (d.color === 'pink') pinkVals.add(d.value); });
    if (pinkVals.size) {
      dice.forEach(function (d) { if (pinkVals.has(d.value)) d.faillePaired = true; });
    }

    // 3. Détection des doubles (sur la face brute du dé, incluant les dés bonus)
    const faceCount = {};
    dice.forEach(function (d) { faceCount[d.value] = (faceCount[d.value] || 0) + 1; });
    function isDouble(d) { return faceCount[d.value] >= 2; }

    // 4. Échec : au moins deux 1 sur des dés NON mortels.
    // Les dés Os (bone) sur un double sont retirés du pool → ils n'entrent pas dans le
    // décompte des échecs (un double 1 os + autre dé ne déclenche pas l'échec).
    // noFumble (talent « Coup de Grâce » contre une cible AU SOL) : l'échec ne peut
    // pas se produire ; les 1 sont alors comptés comme des dés normaux (dégâts si > DEF).
    const echec = !opts.noFumble && dice.filter(function (d) {
      return d.value === 1 && !DICE_TYPES[d.color].heal && d.color !== 'black'
        && !(d.color === 'bone' && isDouble(d));
    }).length >= 2;

    // 5. Calcul de la contribution de chaque dé (le double est déjà détecté ci-dessus)
    let damageTotal = 0;
    let healTotal = 0;
    dice.forEach(function (d) {
      const t = DICE_TYPES[d.color];
      let contributed = d.value;   // valeur ajoutée au total
      let compare = d.value;       // valeur comparée à la DEF
      let removed = false;
      let note = '';

      // FAILLE : ce dé partage sa face avec un dé rose → exclu des dégâts
      if (d.faillePaired) {
        d.contributed = 0; d.compare = d.value; d.passes = false; d.removed = true; d.note = 'Faille ✕';
        return;
      }

      if (d.color === 'yellow') {
        contributed = d.value * turnMult;
        compare = contributed;
        if (turnMult > 1) note = '×' + turnMult;
      } else if (d.color === 'blue' && isDouble(d)) {
        contributed = d.value * 2; // valeur doublée sur double
        compare = d.value;         // mais la DEF se compare à la valeur brute
        note = 'double ×2';
      } else if (d.color === 'bone' && isDouble(d)) {
        removed = true;            // léger retiré du total sur double
        note = 'retiré (double)';
      }

      // BOUCLIER MYSTIQUE (opts.ignoreBlue) : le défenseur ignore les dégâts des dés bleus.
      if (opts.ignoreBlue && d.color === 'blue') {
        d.contributed = 0; d.compare = d.value; d.passes = false; d.removed = true; d.note = 'Bouclier Mystique ✕';
        return;
      }

      let passes;
      // SOLIDITÉ (opts.defBlocksRed) : le défenseur fait comparer les dés rouges à la DEF.
      const ignoresDef = t.ignoresDef && !(opts.defBlocksRed && d.color === 'red');
      if (ignoresDef) {
        passes = true;             // lourds, mortels, soins ignorent la DEF
      } else {
        passes = compare > def;
      }

      d.contributed = contributed;
      d.compare = compare;
      d.passes = passes && !removed;
      d.removed = removed;
      d.note = note;

      if (echec) return; // l'action échoue : aucun PV n'est appliqué

      if (t.heal) {
        if (passes && !removed) healTotal += contributed;
      } else if (passes && !removed) {
        damageTotal += contributed;
      }
    });

    // 6. Dégâts de l'attaquant : ajoutés si au moins 1 dé offensif a dépassé la DEF
    const anyDamageHit = !echec && dice.some(function (d) {
      return d.passes && !DICE_TYPES[d.color].heal;
    });
    let damageBonus = 0;
    if (anyDamageHit && damage > 0) {
      damageBonus = damage;
      damageTotal += damage;
    }

    return {
      dice: dice,
      critique: critique,
      echec: echec,
      def: def,
      turnMult: turnMult,
      damageBonus: damageBonus,
      pvLost: echec ? 0 : damageTotal,
      pvHealed: echec ? 0 : healTotal,
    };
  }

  global.AmertumeDice = {
    DICE_TYPES: DICE_TYPES,
    DICE_ORDER: DICE_ORDER,
    emptyPool: emptyPool,
    addPools: addPools,
    poolCount: poolCount,
    resolve: resolve,
  };
})(window);
