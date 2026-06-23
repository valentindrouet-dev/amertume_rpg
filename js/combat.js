/*
 * Moteur de combat Amertume (zones abstraites : au contact / à distance).
 * Gère les tours, activations, attaques (via le moteur de dés), états,
 * l'IA des adversaires (menace), la fuite, le coma et l'XP.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) { return Inventory.escapeHtml(s); };

  // Sélections de l'écran de préparation
  let setupHeroes = {};      // { heroId: true }
  let setupMonsters = [];     // [{ templateId, count }]

  // État d'interaction du plateau
  let pendingAttack = null;   // { iid, atkIndex } quand on choisit une cible au clic
  let stateMenuFor = null;    // iid dont le menu « + état » est ouvert
  let rootSel = '#combat-root'; // cible de rendu (redirigée pendant un combat de session)

  const SOCLE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };
  function slug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function combat() { return Store.state.combat; }

  // ---------- Construction des instances ----------
  // Compteurs d'usages par attaque (null = illimité)
  function initUses(attacks) {
    return attacks.map(function (a) { return (a.uses && a.uses > 0) ? a.uses : null; });
  }

  function instFromHero(h, i) {
    const attacks = Combatants.heroCombatAttacks(h);
    return {
      iid: 'H' + i + '-' + h.id.slice(-4),
      side: 'hero', templateId: h.id, name: h.name, klass: h.klass || '', endu: h.endu || 1,
      maxPv: Combatants.heroPv(h), pv: Combatants.heroCurPv(h),
      def: Combatants.heroDef(h), damage: h.damage, xp: 0, type: 'hero',
      menace: null, esquive: false, rapide: !!h.rapide, socle: 'medium',
      attacks: attacks, attackUses: initUses(attacks),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false },
      used: { action: false, move: false, object: false },
      contact: [], status: Combatants.heroCurPv(h) > 0 ? 'active' : 'coma',
    };
  }

  function instFromMonster(m, i) {
    const attacks = JSON.parse(JSON.stringify(m.attacks || []));
    return {
      iid: 'M' + i + '-' + m.id.slice(-4),
      side: 'monster', templateId: m.id, name: m.name,
      maxPv: m.pv, pv: m.pv,
      def: m.def, damage: m.damage, xp: m.xp, type: m.type,
      menace: m.menace, esquive: !!m.esquive, rapide: !!m.rapide, socle: m.socle,
      attacks: attacks, attackUses: initUses(attacks),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false },
      used: { action: false, move: false, object: false },
      contact: [], status: 'active', analyzed: false,
    };
  }

  function startCombat() {
    const heroes = Store.state.heroes.filter(function (h) { return setupHeroes[h.id]; });
    const combatants = [];
    heroes.forEach(function (h, i) { combatants.push(instFromHero(h, i)); });
    let mi = 0;
    setupMonsters.forEach(function (entry) {
      const tpl = Store.state.monsters.find(function (m) { return m.id === entry.templateId; });
      if (!tpl) return;
      for (let k = 0; k < entry.count; k++) {
        const inst = instFromMonster(tpl, mi++);
        // Suffixe si plusieurs exemplaires
        if (entry.count > 1) inst.name = tpl.name + ' #' + (k + 1);
        combatants.push(inst);
      }
    });
    pendingAttack = null; stateMenuFor = null;
    Store.state.combat = {
      turn: 1, phase: 'heroes', bonusXp: 0,
      combatants: combatants, log: [], outcome: null,
    };
    log('Début du combat — Tour 1.', 'turn');
    Store.save();
    render();
  }

  // Écrit les PV des instances héros vers leurs fiches (persistance entre combats)
  function persistHeroPv() {
    if (!combat()) return;
    combat().combatants.forEach(function (c) {
      if (c.side !== 'hero') return;
      const tpl = Store.state.heroes.find(function (h) { return h.id === c.templateId; });
      if (tpl) tpl.pv = c.pv;
    });
  }

  function endCombat(finalize) {
    persistHeroPv();
    const sessionCtx = Store.state.sessionCombat || null;
    const outcomeLabel = combat() ? (combat().outcome || null) : null;
    if (finalize && combat()) {
      const xp = totalXp();
      const before = Store.levelInfo(Store.state.party.xp);
      Store.state.party.xp = (Store.state.party.xp || 0) + xp;
      const after = Store.levelInfo(Store.state.party.xp);
      let msg = 'Combat terminé.\n+' + xp + ' XP (total : ' + Store.state.party.xp + ').';
      if (after.level > before.level) msg += '\n\n🎉 Niveau ' + after.level + ' atteint ! (' + after.points + ' points de talent)';
      alert(msg);
    }
    pendingAttack = null; stateMenuFor = null;
    Store.state.combat = null;
    Store.state.sessionCombat = null;
    Store.save();
    // Repasser sur la cible de rendu par défaut avant de prévenir la session
    rootSel = '#combat-root';
    render();
    if (window.Combatants) { Combatants.renderProgress(); Combatants.renderHeroes(); }
    // Si ce combat était lié à une session d'aventure, prévenir Session
    if (sessionCtx && sessionCtx.sessionId) {
      window.dispatchEvent(new CustomEvent('adventure-combat-end', {
        detail: { sessionId: sessionCtx.sessionId, outcome: outcomeLabel }
      }));
    }
  }

  // ---------- Utilitaires ----------
  function byId(iid) { return combat().combatants.find(function (c) { return c.iid === iid; }); }
  function activeOf(side) {
    return combat().combatants.filter(function (c) { return c.side === side && c.status === 'active'; });
  }
  function comaMonsters() {
    return combat().combatants.filter(function (c) { return c.side === 'monster' && c.status === 'coma'; });
  }
  function totalXp() {
    return comaMonsters().reduce(function (n, c) { return n + (c.xp || 0); }, 0) + (combat().bonusXp || 0);
  }
  function log(text, kind) {
    combat().log.unshift({ turn: combat().turn, text: text, kind: kind || '' });
    combat().log = combat().log.slice(0, 60);
  }

  function setContact(a, b, on) {
    function upd(x, y) {
      const i = x.contact.indexOf(y.iid);
      if (on && i === -1) x.contact.push(y.iid);
      if (!on && i >= 0) x.contact.splice(i, 1);
    }
    upd(a, b); upd(b, a);
  }
  function inContact(a, b) { return a.contact.indexOf(b.iid) !== -1; }

  // Nom lisible d'une attaque (retire le préfixe « Mêlée — » / « Distance — »)
  function attackLabel(atk) { return (atk.name || 'attaque').replace(/^(Mêlée|Distance) — /, ''); }

  // ----- Formatage coloré pour le journal -----
  function dnum(value, color) { return '<span class="dnum d-' + color + '">' + value + '</span>'; }
  function diceSeq(dice) {
    return dice.map(function (d) { return dnum(d.value, d.color); }).join('<span class="dplus">+</span>');
  }
  function amt(n, cls) { return '<span class="lamt ' + cls + '">' + n + '</span>'; }
  function nm(x) { return esc(x); }                       // nom (échappé)
  function wname(name) { return '<span class="lwho">' + esc(name) + '</span>'; }

  // ---------- Résolution d'une attaque ----------
  function dchocFrom(monster, hero) {
    // Un adversaire inflige ses dégâts-choc (sauf affaibli/coma)
    if (monster.status !== 'active' || monster.states.affaibli) return 0;
    const dmg = monster.damage || 0;
    if (dmg <= 0) return 0;
    hero.pv = Math.max(0, hero.pv - dmg);
    log(wname(monster.name) + ' inflige ' + amt(dmg, 'dmg') + ' dégâts-choc à ' + wname(hero.name) + '.', 'dchoc');
    checkComa(hero);
    return dmg;
  }

  function applyStates(attacker, target, atk) {
    const toApply = [];
    if (atk.effects.affaibli) toApply.push('affaibli');
    if (atk.effects.auSol) {
      const biggerTarget = SOCLE_RANK[target.socle] > SOCLE_RANK[attacker.socle];
      if (target.type !== 'boss' && !biggerTarget) toApply.push('auSol');
    }
    if (atk.effects.feu) toApply.push('feu');
    if (!toApply.length) return;
    // Onde annule le prochain état négatif reçu
    let list = toApply.slice();
    if (target.states.onde && list.length) {
      const ignored = list.shift();
      target.states.onde = false;
      log(wname(target.name) + ' utilise Onde et ignore <span class="lstate">' + stateLabel(ignored) + '</span>.', 'state');
    }
    list.forEach(function (s) {
      target.states[s] = true;
      log(wname(target.name) + ' subit <span class="lstate">' + stateLabel(s) + '</span>.', 'state');
    });
  }

  function resolveAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
    // Dégâts-choc : attaque à distance au contact d'un adversaire
    if (atk.range === 'distance' && attacker.side === 'hero') {
      attacker.contact.forEach(function (iid) {
        const m = byId(iid);
        if (m && m.side === 'monster') dchocFrom(m, attacker);
      });
    }
    if (attacker.status !== 'active') return; // peut être tombé au coma sur dégâts-choc

    const pool = Object.assign(D.emptyPool(), atk.dice);
    const baseDmg = (atk.useOwnDamage !== false && !attacker.states.affaibli) ? (attacker.damage || 0) : 0;
    const talentBonus = getTalentDmgBonus(attacker, target);
    const dmg = baseDmg + talentBonus;
    const def = target.states.auSol ? 0 : target.def;
    const res = D.resolve(pool, { def: def, damage: dmg, turn: combat().turn });

    let negated = false;
    let reason = '';
    if (!res.echec && (res.pvLost > 0 || hasEffect(atk))) {
      if (target.esquive) {
        const roll = 1 + Math.floor(Math.random() * 6);
        if (roll === 6) { negated = true; reason = 'Esquive 6+'; }
      }
      if (!negated && target.states.blindage) {
        negated = true; reason = 'Blindage'; target.states.blindage = false;
      }
    }

    const diceStr = '<span class="ldice">(' + diceSeq(res.dice) + ')</span>';
    const label = '<span class="lwpn">' + nm(attackLabel(atk)) + '</span>';
    if (res.echec) {
      log(wname(attacker.name) + ' rate son attaque (' + label + ') contre ' + wname(target.name) +
        ' — <span class="lfail">Échec</span> ' + diceStr + '.', 'attack');
      return;
    }
    if (negated) {
      log('L’attaque de ' + wname(attacker.name) + ' contre ' + wname(target.name) +
        ' est annulée (<span class="lstate">' + reason + '</span>).', 'attack');
      return;
    }

    if (res.pvLost > 0) target.pv = Math.max(0, target.pv - res.pvLost);
    if (res.pvHealed > 0) target.pv = Math.min(target.maxPv, target.pv + res.pvHealed);
    log(wname(attacker.name) + ' attaque ' + wname(target.name) + ' avec ' + label +
        (res.critique ? ' <span class="lcrit">CRITIQUE&nbsp;!</span>' : '') + ' : ' +
        (res.pvLost > 0 ? amt(res.pvLost, 'dmg') + ' PV infligés' : 'aucun dégât') +
        ' ' + diceStr + '.', res.critique ? 'crit' : 'attack');
    applyStates(attacker, target, atk);
    checkMonsterTalents(target, res.pvLost);
    checkComa(target);
  }

  function hasEffect(atk) { return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu); }

  function checkComa(c) {
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      log(c.side === 'monster' ? (wname(c.name) + ' est vaincu (coma) !') : (wname(c.name) + ' sombre dans le coma…'),
        c.side === 'monster' ? 'kill' : 'down');
    }
  }

  // Vérifie les talents "flee_on_big_hit" du monstre cible après avoir subi pvLost PV
  function checkMonsterTalents(target, pvLost) {
    if (!pvLost || target.side !== 'monster' || target.status !== 'active') return;
    const tpl = Store.state.monsters.find(function (m) { return m.id === target.templateId; });
    if (!tpl || !Array.isArray(tpl.talents)) return;
    tpl.talents.forEach(function (t) {
      if (t.trigger === 'flee_on_big_hit' && pvLost >= (t.threshold || 0) && target.status === 'active') {
        target.status = 'fled';
        log(wname(target.name) + ' prend la fuite ! (talent : reçu ' + amt(pvLost, 'dmg') + ' ≥ ' + t.threshold + ')', 'turn');
      }
    });
  }

  // Retourne le bonus de dégâts provenant des talents "ally_contact_bonus" de l'attaquant
  function getTalentDmgBonus(attacker, target) {
    if (attacker.side !== 'monster') return 0;
    const tpl = Store.state.monsters.find(function (m) { return m.id === attacker.templateId; });
    if (!tpl || !Array.isArray(tpl.talents)) return 0;
    let bonus = 0;
    tpl.talents.forEach(function (t) {
      if (t.trigger === 'ally_contact_bonus') {
        const allies = combat().combatants.filter(function (c) {
          return c.side === 'monster' && c.iid !== attacker.iid && c.status === 'active' &&
                 c.contact.indexOf(target.iid) !== -1;
        });
        if (allies.length > 0) {
          const b = allies.length * (t.bonus || 1);
          bonus += b;
          log(wname(attacker.name) + ' gagne <span class="atk-dmg">+' + b + '</span> dégâts (talent : ' +
            allies.length + ' allié(s) au contact).', 'state');
        }
      }
    });
    return bonus;
  }

  function checkOutcome() {
    const c = combat();
    if (!c || c.outcome) return;
    if (!activeOf('hero').length) {
      c.outcome = 'defeat'; c.phase = 'over';
      log('Tous les aventuriers sont au coma — Défaite. Aucune XP gagnée.', 'turn');
    } else if (!activeOf('monster').length) {
      const monsters = c.combatants.filter(function (x) { return x.side === 'monster'; });
      const allKilled = monsters.every(function (m) { return m.status === 'coma'; });
      if (allKilled) {
        c.outcome = 'victory'; c.phase = 'over';
        log('Tous les adversaires sont vaincus — Victoire ! XP récupérée : ' + totalXp() + '.', 'turn');
      } else {
        c.outcome = 'minor'; c.phase = 'over';
        log('Les adversaires restants ont fui — Victoire mineure. XP : ' + totalXp() + '.', 'turn');
      }
    }
  }

  // ---------- Tour de combat ----------
  function resetActivations() {
    combat().combatants.forEach(function (c) {
      c.used = { action: false, move: false, object: false };
    });
  }

  function endHeroPhase() {
    pendingAttack = null; stateMenuFor = null;
    combat().phase = 'monsters';
    log('Phase des adversaires.', 'turn');
    Store.save(); render();
  }

  // Cœur de la phase adverse (sans rendu)
  function monstersActCore() {
    activeOf('monster').forEach(function (m) {
      if (m.used.action || m.states.auSol) return; // Au sol : pas d'action
      const target = chooseTarget(m);
      if (!target) return;
      let ai = -1;
      for (let i = 0; i < m.attacks.length; i++) { if (m.attackUses[i] !== 0) { ai = i; break; } }
      if (ai < 0) return;
      const atk = m.attacks[ai];
      if (atk.range === 'contact' && !inContact(m, target)) {
        setContact(m, target, true);
        log(wname(m.name) + ' engage ' + wname(target.name) + '.', 'move');
      }
      applyAttack(m, ai, target);
    });
    checkOutcome();
  }

  function monsterAI() { monstersActCore(); Store.save(); render(); }

  function chooseTarget(monster) {
    const heroes = activeOf('hero');
    if (!heroes.length) return null;
    const contacted = heroes.filter(function (h) { return inContact(monster, h); });
    if (monster.menace === 'pvLow') return minBy(heroes, function (h) { return h.pv; });
    if (monster.menace === 'pvHigh') return maxBy(heroes, function (h) { return h.pv; });
    if (monster.menace === 'defLow') return minBy(heroes, function (h) { return h.def; });
    // closest : ciblé en contact en priorité, sinon le premier
    return (contacted.length ? contacted : heroes)[0];
  }

  function minBy(arr, f) { return arr.reduce(function (a, b) { return f(b) < f(a) ? b : a; }); }
  function maxBy(arr, f) { return arr.reduce(function (a, b) { return f(b) > f(a) ? b : a; }); }

  // Fuite des adversaires en fin de tour — désormais portée uniquement par le
  // talent « flee_after_turns » (plus de fuite automatique selon le type).
  function doFlee() {
    const c = combat();
    activeOf('monster').forEach(function (m) {
      if (m.states.ciblage) return; // Ciblage interdit la fuite
      const tpl = Store.state.monsters.find(function (x) { return x.id === m.templateId; });
      if (!tpl || !Array.isArray(tpl.talents)) return;
      const fleeT = tpl.talents.find(function (t) { return t.trigger === 'flee_after_turns'; });
      if (!fleeT) return;
      const after = fleeT.turns || 0;
      if (after <= 0 || c.turn < after) return;
      if (m.states.feu) {
        const v = 1 + Math.floor(Math.random() * 6); // ⬛ avant de fuir
        m.pv = Math.max(0, m.pv - v);
        log(wname(m.name) + ' subit ' + amt(v, 'dmg') + ' (Feu ⬛) avant de fuir.', 'state');
        if (m.pv <= 0) { checkComa(m); return; }
      }
      m.status = 'fled';
      log(wname(m.name) + ' fuit le combat (talent : fuite après le tour ' + after + ').', 'turn');
    });
    checkOutcome();
  }

  function advanceTurn() {
    const c = combat();
    c.turn += 1;
    resetActivations();
    c.phase = 'heroes';
    log('Tour ' + c.turn + '.', 'turn');
  }

  function endTurn() {
    pendingAttack = null; stateMenuFor = null;
    doFlee();
    if (combat().outcome) { Store.save(); render(); return; }
    advanceTurn();
    Store.save(); render();
  }

  // ---------- Auto-combat (héros joués de façon optimisée) ----------
  function avgDicePool(pool) {
    let s = 0;
    D.DICE_ORDER.forEach(function (c) { s += (pool[c] || 0) * 3.5; });
    return s;
  }
  function attackScore(atk, attacker) {
    let s = avgDicePool(atk.dice) +
      ((atk.useOwnDamage !== false && !attacker.states.affaibli) ? (attacker.damage || 0) : 0);
    if (atk.targets === 'all') s *= Math.max(1, activeOf('monster').length);
    return s;
  }
  function autoTarget() {
    const enemies = activeOf('monster');
    if (!enemies.length) return null;
    // Achever en priorité : cible aux PV les plus bas
    return enemies.reduce(function (a, b) { return b.pv < a.pv ? b : a; });
  }
  function heroesActAuto() {
    activeOf('hero').forEach(function (h) {
      let safety = 0;
      while (safety++ < 8) {
        if (!activeOf('monster').length) break;
        let bestI = -1, best = -1;
        h.attacks.forEach(function (a, i) {
          if (h.attackUses[i] === 0) return;
          if (!a.freeAction && h.used.action) return;
          const sc = attackScore(a, h);
          if (sc > best) { best = sc; bestI = i; }
        });
        if (bestI < 0) break;
        const atk = h.attacks[bestI];
        applyAttack(h, bestI, atk.targets === 'all' ? null : autoTarget());
      }
    });
    checkOutcome();
  }
  function autoCombat() {
    startCombat();
    const c = combat();
    let guard = 0;
    while (c && !c.outcome && guard < 300) {
      guard++;
      heroesActAuto(); if (c.outcome) break;
      monstersActCore(); if (c.outcome) break;
      doFlee(); if (c.outcome) break;
      advanceTurn();
    }
    pendingAttack = null; stateMenuFor = null;
    Store.save(); render();
    if (c && c.outcome) {
      const labels = { victory: 'Victoire', minor: 'Victoire mineure', defeat: 'Défaite' };
      alert('⚔️ Combat automatique terminé\n\nIssue : ' + labels[c.outcome] +
        '\nTours : ' + c.turn + '\nXP récupérée : ' + totalXp() +
        '\n\nLe détail est dans le journal de combat.');
    }
  }

  // ---------- Helpers d'affichage ----------
  const STATE_META = {
    affaibli: { l: 'Affaibli', neg: true }, auSol: { l: 'Au sol', neg: true }, feu: { l: 'Feu', neg: true },
    blindage: { l: 'Blindage', neg: false }, onde: { l: 'Onde', neg: false }, ciblage: { l: 'Ciblage', neg: false },
  };
  function stateLabel(s) { return STATE_META[s] ? STATE_META[s].l : s; }

  // =================== RENDU ===================
  function render() {
    const root = $(rootSel);
    if (!root) return;
    if (!combat()) { renderSetup(root); }
    else { renderBoard(root); }
  }

  function renderSetup(root) {
    const heroes = Store.state.heroes;
    const monsters = Store.state.monsters;
    root.innerHTML =
      '<div class="layout">' +
        '<div class="card">' +
          '<div class="card-head"><h2>Aventuriers engagés</h2></div>' +
          '<div id="setup-heroes" class="setup-list"></div>' +
          '<div class="rest-bar">' +
            '<button id="rest-short" class="rest-btn rest-short" title="Chaque aventurier récupère Endu × 🟩 PV">🏕️ Repos court</button>' +
            '<button id="rest-long" class="rest-btn rest-long" title="Tous les aventuriers au maximum de PV">🌙 Repos long</button>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-head"><h2>Adversaires</h2></div>' +
          '<div class="setup-monster-add">' +
            '<select id="setup-monster-select"></select>' +
            '<input type="number" id="setup-monster-count" min="1" value="1" />' +
            '<button id="setup-monster-add" class="ghost">+ Ajouter</button>' +
          '</div>' +
          '<div id="setup-monster-list" class="setup-list"></div>' +
          '<div class="roll-actions">' +
            '<button id="setup-start" class="primary big">⚔ Démarrer le combat</button>' +
            '<button id="setup-auto" class="ghost big" title="Joue tout le combat automatiquement">⚡ Combat Auto</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Héros (cases à cocher)
    const hbox = $('#setup-heroes');
    if (!heroes.length) hbox.innerHTML = '<p class="empty">Crée d\'abord un aventurier dans l\'onglet Aventuriers.</p>';
    else hbox.innerHTML = heroes.map(function (h) {
      const cur = Combatants.heroCurPv(h), max = Combatants.heroPv(h);
      const low = cur < max;
      return '<label class="setup-row' + (h.klass ? ' klass-' + slug(h.klass) : '') + '"><input type="checkbox" data-hero="' + h.id + '"' +
        (setupHeroes[h.id] ? ' checked' : '') + '>' +
        '<span class="setup-name">' + esc(h.name) + (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
        '<span class="stat-pills compact">' +
          '<span class="stat-pill' + (low ? ' pv-low' : '') + '">❤ ' + cur + '/' + max + '</span>' +
          '<span class="stat-pill">🛡 ' + Combatants.heroDef(h) + '</span>' +
          '<span class="stat-pill">⚔ ' + h.damage + '</span>' +
        '</span></label>';
    }).join('');
    hbox.querySelectorAll('[data-hero]').forEach(function (cb) {
      cb.addEventListener('change', function () { setupHeroes[cb.getAttribute('data-hero')] = cb.checked; updateStartBtn(); });
    });
    $('#rest-short').addEventListener('click', function () {
      const lines = Combatants.heroRestShort();
      renderSetup(root);
      if (window.Combatants) Combatants.renderHeroes();
      alert('🏕️ Repos court\n\n' + lines.join('\n'));
    });
    $('#rest-long').addEventListener('click', function () {
      Combatants.heroRestLong();
      renderSetup(root);
      if (window.Combatants) Combatants.renderHeroes();
      alert('🌙 Repos long : tous les aventuriers sont à PV maximum.');
    });

    // Sélecteur de monstres
    const sel = $('#setup-monster-select');
    sel.innerHTML = monsters.map(function (m) {
      return '<option value="' + m.id + '">' + esc(m.name) + ' (' + Combatants.TYPE_LABEL[m.type] + ')</option>';
    }).join('');
    $('#setup-monster-add').addEventListener('click', function () {
      const id = sel.value;
      const count = Math.max(1, parseInt($('#setup-monster-count').value, 10) || 1);
      if (!id) return;
      const existing = setupMonsters.find(function (e) { return e.templateId === id; });
      if (existing) existing.count += count; else setupMonsters.push({ templateId: id, count: count });
      renderSetupMonsterList();
      updateStartBtn();
    });
    renderSetupMonsterList();
    $('#setup-start').addEventListener('click', function () {
      if (canStart()) startCombat();
    });
    $('#setup-auto').addEventListener('click', function () {
      if (canStart()) autoCombat();
    });
    updateStartBtn();
  }

  function renderSetupMonsterList() {
    const box = $('#setup-monster-list');
    if (!box) return;
    if (!setupMonsters.length) { box.innerHTML = '<p class="empty">Aucun adversaire ajouté.</p>'; return; }
    box.innerHTML = setupMonsters.map(function (e, idx) {
      const m = Store.state.monsters.find(function (x) { return x.id === e.templateId; });
      return '<div class="setup-row"><strong>' + esc(m ? m.name : '?') + '</strong>' +
        '<span class="tag">×' + e.count + '</span>' +
        '<button class="icon-btn" data-rm-monster="' + idx + '">✕</button></div>';
    }).join('');
    box.querySelectorAll('[data-rm-monster]').forEach(function (b) {
      b.addEventListener('click', function () {
        setupMonsters.splice(parseInt(b.getAttribute('data-rm-monster'), 10), 1);
        renderSetupMonsterList(); updateStartBtn();
      });
    });
  }

  function canStart() {
    const heroCount = Object.keys(setupHeroes).filter(function (k) { return setupHeroes[k]; }).length;
    const monCount = setupMonsters.reduce(function (n, e) { return n + e.count; }, 0);
    return heroCount > 0 && monCount > 0;
  }
  function updateStartBtn() {
    const ok = canStart();
    const b = $('#setup-start'); if (b) b.disabled = !ok;
    const a = $('#setup-auto'); if (a) a.disabled = !ok;
  }

  // ---------- Plateau de combat ----------
  function renderBoard(root) {
    const c = combat();
    const OUTCOME_LABEL = { victory: 'Victoire', minor: 'Victoire mineure', defeat: 'Défaite' };
    const phaseLabel = c.outcome ? OUTCOME_LABEL[c.outcome]
      : (c.phase === 'heroes' ? 'Activation des aventuriers' : 'Activation des adversaires');
    root.innerHTML =
      '<div class="combat-bar">' +
        '<div class="cb-left"><span class="turn-pill">Tour ' + c.turn + '</span>' +
          '<span class="phase-pill ' + (c.phase) + '">' + phaseLabel + '</span></div>' +
        '<div class="cb-mid">✦ XP : <strong>' + totalXp() + '</strong></div>' +
        '<div class="cb-right">' +
          '<button id="cb-end" class="ghost small">Terminer le combat</button>' +
        '</div>' +
      '</div>' +
      (pendingAttack ? (function () {
        const at = byId(pendingAttack.iid); const ak = at && at.attacks[pendingAttack.atkIndex];
        return at && ak ? '<div class="targeting-banner">🎯 <b>' + esc(at.name) + '</b> — ' + esc(ak.name) +
          (pendingAttack.average ? ' <span class="lavg">(dégâts moyens)</span>' : '') +
          ' : clique un adversaire pour frapper. <button id="cancel-target" class="ghost xs">Annuler</button></div>' : '';
      })() : '') +
      '<div class="combat-cols">' +
        '<div class="combat-col"><h3>Aventuriers</h3><div id="col-heroes"></div></div>' +
        '<div class="combat-col"><h3>Adversaires</h3><div id="col-monsters"></div></div>' +
      '</div>' +
      '<div class="phase-controls" id="phase-controls"></div>' +
      '<div class="card"><div class="card-head"><h3>Journal de combat</h3></div>' +
        '<div id="combat-log" class="combat-log"></div></div>';

    renderColumn('#col-heroes', activeColumn('hero'));
    renderMonsterColumn('#col-monsters');
    renderPhaseControls();
    renderLog();

    $('#cb-end').addEventListener('click', function () {
      if (confirm('Terminer et quitter ce combat ?')) endCombat(false);
    });
    const ct = $('#cancel-target');
    if (ct) ct.addEventListener('click', function () { pendingAttack = null; render(); });
  }

  function activeColumn(side) {
    return combat().combatants.filter(function (c) { return c.side === side; });
  }

  function renderColumn(sel, list) {
    const box = $(sel);
    box.innerHTML = list.map(renderCard).join('') || '<p class="empty">—</p>';
    list.forEach(function (c) { wireCard(c); });
  }

  // Colonne des adversaires : Boss > Solitaire > Alpha > Sbires ;
  // les standards de même nom sont groupés en deux colonnes.
  const MTYPE_RANK = { boss: 0, solitaire: 1, alpha: 2, standard: 3 };
  function mrank(t) { return MTYPE_RANK.hasOwnProperty(t) ? MTYPE_RANK[t] : 9; }
  function baseName(n) { return (n || '').replace(/\s*#\d+$/, ''); }
  function renderMonsterColumn(sel) {
    const box = $(sel);
    const list = combat().combatants.filter(function (c) { return c.side === 'monster'; });
    const sorted = list.slice().sort(function (a, b) { return mrank(a.type) - mrank(b.type); });
    let html = '';
    let i = 0;
    while (i < sorted.length) {
      const c = sorted[i];
      if (c.type === 'standard') {
        const base = baseName(c.name);
        const grp = [];
        let j = i;
        while (j < sorted.length && sorted[j].type === 'standard' && baseName(sorted[j].name) === base) {
          grp.push(sorted[j]); j++;
        }
        html += grp.length > 1
          ? '<div class="monster-grid">' + grp.map(renderCard).join('') + '</div>'
          : renderCard(grp[0]);
        i = j;
      } else {
        html += renderCard(c); i++;
      }
    }
    box.innerHTML = html || '<p class="empty">—</p>';
    list.forEach(function (c) { wireCard(c); });
  }

  function statesBadges(c) {
    return Object.keys(STATE_META).filter(function (s) { return c.states[s]; })
      .map(function (s) {
        return '<span class="state-badge ' + (STATE_META[s].neg ? 'neg' : 'pos') + '" data-state="' + s + '" data-iid="' + c.iid + '">' +
          stateLabel(s) + ' ✕</span>';
      }).join('');
  }

  function renderCard(c) {
    const pct = Math.round((c.pv / c.maxPv) * 100);
    const dead = c.status !== 'active';
    const cls = ['combat-card', 'side-' + c.side];
    if (c.klass) cls.push('klass-' + c.klass.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (c.side === 'monster' && c.type) cls.push('type-' + c.type);
    if (dead) cls.push('is-' + c.status);
    const phase = combat().phase;
    const canAct = !dead && !combat().outcome &&
      ((c.side === 'hero' && phase === 'heroes') || false);
    // Cible valide pendant le ciblage au clic
    if (pendingAttack && !dead) {
      const attacker = byId(pendingAttack.iid);
      if (attacker && attacker.side !== c.side) cls.push('targetable');
    }

    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;   // stats ennemies cachées avant Analyse
    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      '<div class="cc-head"><span class="roster-name">' + esc(c.name) + '</span>' +
        (c.klass ? '<span class="tag class-tag">' + esc(c.klass) + '</span>' : '') +
        (c.type !== 'hero' ? '<span class="tag type">' + Combatants.TYPE_LABEL[c.type] + '</span>' : '') +
        (c.rapide ? '<span class="tag">Rapide</span>' : '') +
        (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
      '</div>' +
      '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div>' +
        '<span class="pv-text">' + c.pv + ' / ' + c.maxPv + ' PV</span></div>' +
      '<div class="stat-pills compact">' +
        '<span class="stat-pill">DEF ' + (known ? (c.states.auSol ? '0' : c.def) : '?') + '</span>' +
        '<span class="stat-pill">Dégâts ' + (known ? c.damage : '?') + '</span>' +
        (isEnemy ? '<span class="stat-pill">XP ' + (known ? c.xp : '?') + '</span>' : '') +
      '</div>' +
      (statesBadges(c) ? '<div class="cc-states">' + statesBadges(c) + '</div>' : '');

    // Bouton Analyser sur les adversaires non encore analysés (phase héros)
    if (isEnemy && !dead && !c.analyzed && combat().phase === 'heroes' && !combat().outcome) {
      html += '<div class="cc-analyse"><button class="ghost xs do-analyse-enemy" data-iid="' + c.iid + '">🔍 Analyser (+2 XP)</button></div>';
    }

    if (canAct) {
      const usedA = c.used.action, usedO = c.used.object;
      html += '<div class="cc-activation">' +
        '<span class="act-flag ' + (usedA ? 'used' : '') + '">Action</span>' +
        '<span class="act-flag ' + (usedO ? 'used' : '') + '">Objet</span></div>';
      // Attaques en chips bleus (Action). Clic = choisir la cible.
      html += '<div class="cc-attacks">' + c.attacks.map(function (a, i) {
        const uses = c.attackUses[i];
        const depleted = uses === 0;
        const blocked = depleted || (!a.freeAction && usedA);
        const isThisAtk = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i;
        const chipSel = isThisAtk && !pendingAttack.average;
        const avgSel  = isThisAtk && !!pendingAttack.average;
        const meta = [(a.range === 'distance' ? '🏹 distance' : '⚔ contact')];
        if (a.targets === 'all') meta.push('toutes');
        if (a.freeAction) meta.push('gratuite');
        const showDmg = a.useOwnDamage !== false && c.damage > 0 && !c.states.affaibli;
        // Dégâts moyens = moyenne des dés de l'arme seulement (sans le bonus de dégâts)
        const avgDmg = Math.round(avgDicePool(a.dice));
        return '<div class="atk-row">' +
          '<button class="atk-chip ' + (chipSel ? 'selected' : '') + '" data-iid="' + c.iid + '" data-atk="' + i + '"' +
            (blocked ? ' disabled' : '') + '>' +
            '<span class="atk-chip-name">' + esc(a.name) + '</span>' +
            Inventory.poolBadges(a.dice) +
            (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '') +
            (uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
            '<span class="atk-chip-meta">' + meta.join(' · ') + '</span>' +
          '</button>' +
          '<button class="atk-avg' + (avgSel ? ' selected' : '') + '" data-iid="' + c.iid + '" data-atk-avg="' + i + '"' +
            (blocked ? ' disabled' : '') + ' title="Dégâts moyens de l\'arme (≈ ' + avgDmg + ', sans bonus, avant DEF)">≈ ' + avgDmg + '</button>' +
        '</div>';
      }).join('') + '</div>';
      html += '<div class="cc-secondary">' +
        '<button class="ghost xs do-object" data-iid="' + c.iid + '"' + (usedO ? ' disabled' : '') + '>Objet</button>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  // Cœur d'exécution d'une attaque (sans rendu) — réutilisé par l'UI et l'auto-combat
  function applyAttack(attacker, atkIndex, target) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (attacker.attackUses[atkIndex] === 0) return;
    if (!atk.freeAction && attacker.used.action) return;
    const enemySide = attacker.side === 'hero' ? 'monster' : 'hero';
    let targets = (atk.targets === 'all') ? activeOf(enemySide).slice() : (target ? [target] : []);
    targets.forEach(function (t) {
      if (atk.range === 'contact' && !inContact(attacker, t)) setContact(attacker, t, true);
      resolveAttack(attacker, t, atk);
    });
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) attacker.used.action = true;
  }

  // Version UI : applique puis rafraîchit
  function execHeroAttack(attacker, atkIndex, target) {
    applyAttack(attacker, atkIndex, target);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // Résout les dégâts moyens garantis (sans dé, sans risque d'échec)
  function resolveAverageAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
    if (atk.range === 'distance' && attacker.side === 'hero') {
      attacker.contact.forEach(function (iid) {
        const m = byId(iid);
        if (m && m.side === 'monster') dchocFrom(m, attacker);
      });
    }
    if (attacker.status !== 'active') return;
    // Dégâts moyens = moyenne des dés de l'arme seulement (sans le bonus de dégâts)
    const avgDice = Math.round(avgDicePool(atk.dice));
    const def = target.states.auSol ? 0 : target.def;
    const pvLost = Math.max(0, avgDice - def);
    const label = '<span class="lwpn">' + nm(attackLabel(atk)) + '</span>';
    if (pvLost > 0) {
      target.pv = Math.max(0, target.pv - pvLost);
      checkMonsterTalents(target, pvLost);
    }
    log(wname(attacker.name) + ' inflige les dégâts moyens de l\'arme via ' + label + ' sur ' + wname(target.name) +
      ' : ' + amt(pvLost, 'dmg') + ' PV <span class="lavg">(moy. des dés, sans bonus)</span>.', 'attack');
    checkComa(target);
  }

  function applyAverageAttack(attacker, atkIndex, target) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (attacker.attackUses[atkIndex] === 0) return;
    if (!atk.freeAction && attacker.used.action) return;
    const enemySide = attacker.side === 'hero' ? 'monster' : 'hero';
    const targets = (atk.targets === 'all') ? activeOf(enemySide).slice() : (target ? [target] : []);
    targets.forEach(function (t) {
      if (atk.range === 'contact' && !inContact(attacker, t)) setContact(attacker, t, true);
      resolveAverageAttack(attacker, t, atk);
    });
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) attacker.used.action = true;
  }

  function execHeroAverageAttack(attacker, atkIndex, target) {
    applyAverageAttack(attacker, atkIndex, target);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  function wireCard(c) {
    const root = $(rootSel);
    const card = root.querySelector('.combat-card[data-iid="' + c.iid + '"]');

    // Ciblage au clic : cette carte est une cible valide
    if (card && card.classList.contains('targetable') && pendingAttack) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return; // laisse les boutons internes agir
        const attacker = byId(pendingAttack.iid);
        if (!attacker) return;
        if (pendingAttack.average) execHeroAverageAttack(attacker, pendingAttack.atkIndex, c);
        else execHeroAttack(attacker, pendingAttack.atkIndex, c);
      });
    }

    // Retirer un état (clic sur un badge existant)
    root.querySelectorAll('.state-badge[data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        c.states[b.getAttribute('data-state')] = false; Store.save(); render();
      });
    });
    // Analyser un adversaire : révèle DEF / Dégâts / XP (+2 XP)
    const ana = root.querySelector('.do-analyse-enemy[data-iid="' + c.iid + '"]');
    if (ana) ana.addEventListener('click', function () {
      if (c.analyzed) return;
      c.analyzed = true;
      combat().bonusXp = (combat().bonusXp || 0) + 2;
      log(wname(c.name) + ' est analysé : DEF, Dégâts et XP révélés (' + amt('+2', 'heal') + ' XP).', 'move');
      Store.save(); render();
    });

    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active' && !combat().outcome) {
      // Chips d'attaque (dé)
      root.querySelectorAll('.atk-chip[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          const i = parseInt(b.getAttribute('data-atk'), 10);
          const atk = c.attacks[i];
          if (!atk) return;
          if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average) {
            pendingAttack = null; render(); return; // re-clic = annuler
          }
          if (atk.targets === 'all') { execHeroAttack(c, i, null); }
          else { pendingAttack = { iid: c.iid, atkIndex: i, average: false }; stateMenuFor = null; render(); }
        });
      });
      // Chips dégâts moyens (≈)
      root.querySelectorAll('.atk-avg[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          const i = parseInt(b.getAttribute('data-atk-avg'), 10);
          const atk = c.attacks[i];
          if (!atk) return;
          if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && pendingAttack.average) {
            pendingAttack = null; render(); return; // re-clic = annuler
          }
          if (atk.targets === 'all') { execHeroAverageAttack(c, i, null); }
          else { pendingAttack = { iid: c.iid, atkIndex: i, average: true }; stateMenuFor = null; render(); }
        });
      });
      const obj = root.querySelector('.do-object[data-iid="' + c.iid + '"]');
      if (obj) obj.addEventListener('click', function () {
        c.used.object = true; log(wname(c.name) + ' utilise un objet.', 'move'); Store.save(); render();
      });
    }
  }

  // Repos court : chaque héros récupère Endu × 🟩 (somme de dés de soin)
  function shortRest() {
    const c = combat();
    if (!c || c.restDone) return;
    activeOf('hero').forEach(function (h) {
      const n = Math.max(1, h.endu || 1);
      const rolls = [];
      let heal = 0;
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(dnum(v, 'green')); heal += v; }
      const before = h.pv;
      h.pv = Math.min(h.maxPv, h.pv + heal);
      log(wname(h.name) + ' prend un repos court et récupère ' + amt(h.pv - before, 'heal') + ' PV ' +
        '<span class="ldice">(' + rolls.join('<span class="dplus">+</span>') + ')</span>.', 'heal');
    });
    c.restDone = true;
    Store.save(); render();
  }

  function renderPhaseControls() {
    const box = $('#phase-controls');
    const c = combat();
    if (c.outcome) {
      const canRest = c.outcome !== 'defeat' && !c.restDone && activeOf('hero').length;
      box.innerHTML =
        (canRest ? '<button id="pc-rest" class="ghost big">🏕️ Repos court (Endu × 🟩)</button>' : '') +
        '<button id="pc-finish" class="primary big">Terminer (XP : ' + totalXp() + ')</button>';
      $('#pc-finish').addEventListener('click', function () { endCombat(true); });
      const rest = $('#pc-rest');
      if (rest) rest.addEventListener('click', shortRest);
      return;
    }
    if (c.phase === 'heroes') {
      box.innerHTML = '<button id="pc-to-monsters" class="primary">Passer aux adversaires →</button>';
      $('#pc-to-monsters').addEventListener('click', endHeroPhase);
    } else {
      box.innerHTML =
        '<button id="pc-ai" class="primary">▶ Activer les adversaires (auto)</button>' +
        '<button id="pc-endturn" class="ghost">Fin du tour de combat ⟳</button>';
      $('#pc-ai').addEventListener('click', monsterAI);
      $('#pc-endturn').addEventListener('click', endTurn);
    }
  }

  function renderLog() {
    const box = $('#combat-log');
    if (!combat().log.length) { box.innerHTML = '<p class="empty">—</p>'; return; }
    // e.text contient du HTML pré-échappé (noms échappés à la construction)
    box.innerHTML = combat().log.map(function (e) {
      return '<div class="log-row log-' + e.kind + '"><span class="log-turn">T' + e.turn + '</span>' +
        e.text + '</div>';
    }).join('');
  }

  // Démarre un combat directement dans une session d'aventure, sans écran de
  // préparation : héros et adversaires sont imposés par l'aventure.
  // Le rendu est dirigé vers `sel` (conteneur dans le panneau Session).
  function startInSession(heroIds, monsterRefs, sessionCtx, sel) {
    rootSel = sel || '#combat-root';
    setupHeroes = {};
    (heroIds || []).forEach(function (id) { setupHeroes[id] = true; });
    setupMonsters = (monsterRefs || []).map(function (r) {
      return { templateId: r.monsterId, count: r.count || 1 };
    });
    Store.state.sessionCombat = sessionCtx || null;
    startCombat();
  }

  // Réaffiche un combat de session en cours dans le conteneur donné (après un
  // changement d'onglet, le combat n'est pas perdu).
  function resumeInSession(sel) {
    rootSel = sel || '#combat-root';
    render();
  }

  function hasActiveCombat() { return !!Store.state.combat; }

  function init() { render(); }

  global.Combat = {
    init: init, render: render,
    startInSession: startInSession,
    resumeInSession: resumeInSession,
    hasActiveCombat: hasActiveCombat,
  };
})(window);
