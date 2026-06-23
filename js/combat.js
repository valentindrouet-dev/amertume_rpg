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

  const SOCLE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };

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
      maxPv: Combatants.heroPv(h), pv: Combatants.heroPv(h),
      def: Combatants.heroDef(h), damage: h.damage, xp: 0, type: 'hero',
      menace: null, esquive: false, rapide: !!h.rapide, socle: 'medium',
      attacks: attacks, attackUses: initUses(attacks),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false },
      used: { action: false, move: false, object: false },
      contact: [], status: 'active',
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
      contact: [], status: 'active',
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

  function endCombat(finalize) {
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
    Store.save();
    render();
    if (window.Combatants) Combatants.renderProgress();
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

  // ---------- Résolution d'une attaque ----------
  function dchocFrom(monster, hero) {
    // Un adversaire inflige ses dégâts-choc (sauf affaibli/coma)
    if (monster.status !== 'active' || monster.states.affaibli) return 0;
    const dmg = monster.damage || 0;
    if (dmg <= 0) return 0;
    hero.pv = Math.max(0, hero.pv - dmg);
    log(monster.name + ' inflige ' + dmg + ' dégâts-choc à ' + hero.name + '.', 'dchoc');
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
      log(target.name + ' utilise Onde et ignore ' + stateLabel(ignored) + '.', 'state');
    }
    list.forEach(function (s) {
      target.states[s] = true;
      log(target.name + ' subit ' + stateLabel(s) + '.', 'state');
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
    const dmg = (atk.useOwnDamage !== false && !attacker.states.affaibli) ? (attacker.damage || 0) : 0;
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

    const diceStr = res.dice.map(function (d) { return D.DICE_TYPES[d.color].emoji + d.value; }).join(' ');
    const label = attackLabel(atk);
    if (res.echec) {
      log(attacker.name + ' rate son attaque (' + label + ') contre ' + target.name + ' — Échec (' + diceStr + ').', 'attack');
      return;
    }
    if (negated) {
      log('L’attaque de ' + attacker.name + ' contre ' + target.name + ' est annulée (' + reason + ').', 'attack');
      return;
    }

    if (res.pvLost > 0) target.pv = Math.max(0, target.pv - res.pvLost);
    if (res.pvHealed > 0) target.pv = Math.min(target.maxPv, target.pv + res.pvHealed);
    log(attacker.name + ' attaque ' + target.name + ' avec ' + label +
        (res.critique ? ' — CRITIQUE !' : '') + ' : ' +
        (res.pvLost > 0 ? res.pvLost + ' PV infligés' : 'aucun dégât') +
        ' (' + diceStr + ').', res.critique ? 'crit' : 'attack');
    applyStates(attacker, target, atk);
    checkComa(target);
  }

  function hasEffect(atk) { return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu); }

  function checkComa(c) {
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      log(c.side === 'monster' ? (c.name + ' est vaincu (coma) !') : (c.name + ' sombre dans le coma…'),
        c.side === 'monster' ? 'kill' : 'down');
    }
  }

  function checkOutcome() {
    const c = combat();
    if (!c || c.outcome) return;
    if (!activeOf('hero').length) {
      c.outcome = 'defeat'; c.phase = 'over';
      log('Tous les héros sont au coma — Défaite. Aucune XP gagnée.', 'turn');
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

  function monsterAI() {
    const monsters = activeOf('monster');
    monsters.forEach(function (m) {
      if (m.used.action || m.states.auSol) return; // Au sol : pas d'action
      const target = chooseTarget(m);
      if (!target) return;
      // Première attaque disponible (usages restants)
      let ai = -1;
      for (let i = 0; i < m.attacks.length; i++) { if (m.attackUses[i] !== 0) { ai = i; break; } }
      if (ai < 0) return;
      const atk = m.attacks[ai];
      // Engagement si attaque de contact
      if (atk.range === 'contact' && !inContact(m, target)) {
        setContact(m, target, true);
        log(m.name + ' engage ' + target.name + '.', 'move');
      }
      if (atk.targets === 'all') {
        const heroes = activeOf('hero').filter(function (h) {
          return atk.range === 'contact' ? inContact(m, h) : true;
        });
        heroes.forEach(function (h) { resolveAttack(m, h, atk); });
      } else {
        resolveAttack(m, target, atk);
      }
      if (m.attackUses[ai] !== null) m.attackUses[ai] = Math.max(0, m.attackUses[ai] - 1);
      m.used.action = true;
    });
    checkOutcome();
    Store.save(); render();
  }

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

  function endTurn() {
    pendingAttack = null; stateMenuFor = null;
    const c = combat();
    // Fuite des adversaires
    activeOf('monster').forEach(function (m) {
      if (m.states.ciblage) return; // Ciblage interdit la fuite
      let flees = false;
      if (m.type === 'standard' && c.turn >= 1) flees = true;
      else if ((m.type === 'solitaire' || m.type === 'alpha') && c.turn >= 2) flees = true;
      else if (m.type === 'boss' && c.turn >= 3) flees = false; // variable : laissé manuel
      if (flees) {
        if (m.states.feu) {
          const v = 1 + Math.floor(Math.random() * 6); // ⬛ avant de fuir
          m.pv = Math.max(0, m.pv - v);
          log(m.name + ' subit ' + v + ' (Feu ⬛) avant de fuir.', 'state');
          if (m.pv <= 0) { checkComa(m); return; }
        }
        m.status = 'fled';
        log(m.name + ' fuit le combat.', 'turn');
      }
    });
    checkOutcome();
    if (c.outcome) { Store.save(); render(); return; }
    c.turn += 1;
    resetActivations();
    c.phase = 'heroes';
    log('Tour ' + c.turn + '.', 'turn');
    Store.save(); render();
  }

  // ---------- Helpers d'affichage ----------
  const STATE_META = {
    affaibli: { l: 'Affaibli', neg: true }, auSol: { l: 'Au sol', neg: true }, feu: { l: 'Feu', neg: true },
    blindage: { l: 'Blindage', neg: false }, onde: { l: 'Onde', neg: false }, ciblage: { l: 'Ciblage', neg: false },
  };
  function stateLabel(s) { return STATE_META[s] ? STATE_META[s].l : s; }

  // =================== RENDU ===================
  function render() {
    const root = $('#combat-root');
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
          '<div class="card-head"><h2>Héros engagés</h2></div>' +
          '<div id="setup-heroes" class="setup-list"></div>' +
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
          '</div>' +
        '</div>' +
      '</div>';

    // Héros (cases à cocher)
    const hbox = $('#setup-heroes');
    if (!heroes.length) hbox.innerHTML = '<p class="empty">Crée d\'abord un héros dans l\'onglet Héros.</p>';
    else hbox.innerHTML = heroes.map(function (h) {
      return '<label class="setup-row"><input type="checkbox" data-hero="' + h.id + '"' +
        (setupHeroes[h.id] ? ' checked' : '') + '>' +
        '<span class="setup-name">' + esc(h.name) + '</span>' +
        '<span class="stat-pills compact">' +
          '<span class="stat-pill">❤ ' + Combatants.heroPv(h) + '</span>' +
          '<span class="stat-pill">🛡 ' + Combatants.heroDef(h) + '</span>' +
          '<span class="stat-pill">⚔ ' + h.damage + '</span>' +
        '</span></label>';
    }).join('');
    hbox.querySelectorAll('[data-hero]').forEach(function (cb) {
      cb.addEventListener('change', function () { setupHeroes[cb.getAttribute('data-hero')] = cb.checked; updateStartBtn(); });
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
  function updateStartBtn() { const b = $('#setup-start'); if (b) b.disabled = !canStart(); }

  // ---------- Plateau de combat ----------
  function renderBoard(root) {
    const c = combat();
    const OUTCOME_LABEL = { victory: 'Victoire', minor: 'Victoire mineure', defeat: 'Défaite' };
    const phaseLabel = c.outcome ? OUTCOME_LABEL[c.outcome]
      : (c.phase === 'heroes' ? 'Activation des héros' : 'Activation des adversaires');
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
          ' : clique un adversaire pour frapper. <button id="cancel-target" class="ghost xs">Annuler</button></div>' : '';
      })() : '') +
      '<div class="combat-cols">' +
        '<div class="combat-col"><h3>Héros</h3><div id="col-heroes"></div></div>' +
        '<div class="combat-col"><h3>Adversaires</h3><div id="col-monsters"></div></div>' +
      '</div>' +
      '<div class="phase-controls" id="phase-controls"></div>' +
      '<div class="card"><div class="card-head"><h3>Journal de combat</h3></div>' +
        '<div id="combat-log" class="combat-log"></div></div>';

    renderColumn('#col-heroes', activeColumn('hero'));
    renderColumn('#col-monsters', activeColumn('monster'));
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
    if (dead) cls.push('is-' + c.status);
    const phase = combat().phase;
    const canAct = !dead && !combat().outcome &&
      ((c.side === 'hero' && phase === 'heroes') || false);
    // Cible valide pendant le ciblage au clic
    if (pendingAttack && !dead) {
      const attacker = byId(pendingAttack.iid);
      if (attacker && attacker.side !== c.side) cls.push('targetable');
    }

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
        '<span class="stat-pill">🛡 DEF ' + (c.states.auSol ? '0' : c.def) + '</span>' +
        '<span class="stat-pill">⚔ ' + c.damage + '</span>' +
        (c.type !== 'hero' ? '<span class="stat-pill">✦ ' + c.xp + ' XP</span>' : '') +
      '</div>' +
      '<div class="cc-states">' + statesBadges(c) +
        '<span class="state-add" data-iid="' + c.iid + '">+ état</span></div>';

    // Menu d'ajout d'état (ouvert au clic)
    if (stateMenuFor === c.iid && !dead) {
      const opts = [['affaibli', 'Affaibli'], ['auSol', 'Au sol'], ['feu', 'Feu'],
        ['blindage', 'Blindage'], ['onde', 'Onde'], ['ciblage', 'Ciblage']];
      html += '<div class="state-menu">' + opts.map(function (o) {
        return '<button class="ghost xs set-state" data-iid="' + c.iid + '" data-state="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }

    if (!dead) {
      html += '<div class="cc-pv-edit"><span class="pv-label">PV</span>' +
        '<button class="ghost xs" data-dmg="-3" data-iid="' + c.iid + '" title="Retirer 3 PV">−3</button>' +
        '<button class="ghost xs" data-dmg="-1" data-iid="' + c.iid + '" title="Retirer 1 PV">−1</button>' +
        '<button class="ghost xs" data-dmg="1" data-iid="' + c.iid + '" title="Soigner 1 PV">+1</button>' +
        '<button class="ghost xs" data-dmg="3" data-iid="' + c.iid + '" title="Soigner 3 PV">+3</button>' +
        '</div>';
    }

    if (canAct) {
      const usedA = c.used.action, usedM = c.used.move, usedO = c.used.object;
      html += '<div class="cc-activation">' +
        '<span class="act-flag ' + (usedA ? 'used' : '') + '">Action</span>' +
        '<span class="act-flag ' + (usedM ? 'used' : '') + '">Mouv./Analyse</span>' +
        '<span class="act-flag ' + (usedO ? 'used' : '') + '">Objet</span></div>';
      // Attaques en chips bleus (Action). Clic = choisir la cible.
      html += '<div class="cc-attacks">' + c.attacks.map(function (a, i) {
        const uses = c.attackUses[i];
        const depleted = uses === 0;
        const blocked = depleted || (!a.freeAction && usedA);
        const selected = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i;
        const meta = [(a.range === 'distance' ? '🏹 distance' : '⚔ contact')];
        if (a.targets === 'all') meta.push('toutes');
        if (a.freeAction) meta.push('gratuite');
        return '<button class="atk-chip ' + (selected ? 'selected' : '') + '" data-iid="' + c.iid + '" data-atk="' + i + '"' +
          (blocked ? ' disabled' : '') + '>' +
          '<span class="atk-chip-name">' + esc(a.name) + '</span>' +
          Inventory.poolBadges(a.dice) +
          (uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
          '<span class="atk-chip-meta">' + meta.join(' · ') + '</span>' +
        '</button>';
      }).join('') + '</div>';
      // Contacts (mêlée) : un chip par adversaire, surligné si au contact
      const enemies = activeOf('monster');
      if (enemies.length) {
        html += '<div class="cc-contacts"><span class="pv-label" title="Au contact = mêlée. Rompre le contact subit les dégâts-choc.">Au contact</span>' +
          enemies.map(function (e) {
            return '<button class="contact-chip ' + (inContact(c, e) ? 'on' : '') + '" data-iid="' + c.iid +
              '" data-enemy="' + e.iid + '"' + (c.used.move && !inContact(c, e) ? '' : '') + '>' + esc(e.name) + '</button>';
          }).join('') + '</div>';
      }
      html += '<div class="cc-secondary">' +
        '<button class="ghost xs do-analyse" data-iid="' + c.iid + '"' + (usedM ? ' disabled' : '') + '>Analyse (+2 XP)</button>' +
        '<button class="ghost xs do-object" data-iid="' + c.iid + '"' + (usedO ? ' disabled' : '') + '>Objet</button>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  // Exécute une attaque de héros (consomme usage + action sauf si gratuite)
  function execHeroAttack(attacker, atkIndex, target) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (attacker.attackUses[atkIndex] === 0) return;
    if (!atk.freeAction && attacker.used.action) return;
    let targets;
    if (atk.targets === 'all') {
      targets = activeOf('monster').filter(function (e) { return atk.range === 'contact' ? true : true; });
    } else {
      targets = target ? [target] : [];
    }
    targets.forEach(function (t) {
      if (atk.range === 'contact' && !inContact(attacker, t)) setContact(attacker, t, true);
      resolveAttack(attacker, t, atk);
    });
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) attacker.used.action = true;
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  function wireCard(c) {
    const root = $('#combat-root');
    const card = root.querySelector('.combat-card[data-iid="' + c.iid + '"]');

    // Ciblage au clic : cette carte est une cible valide
    if (card && card.classList.contains('targetable') && pendingAttack) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return; // laisse les boutons internes agir
        const attacker = byId(pendingAttack.iid);
        if (attacker) execHeroAttack(attacker, pendingAttack.atkIndex, c);
      });
    }

    // PV +/- (édition manuelle)
    root.querySelectorAll('.cc-pv-edit [data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = parseInt(b.getAttribute('data-dmg'), 10);
        c.pv = Math.max(0, Math.min(c.maxPv, c.pv + d));
        if (d < 0) checkComa(c);
        checkOutcome(); Store.save(); render();
      });
    });
    // Retirer un état
    root.querySelectorAll('.state-badge[data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        c.states[b.getAttribute('data-state')] = false; Store.save(); render();
      });
    });
    // Ouvrir/fermer le menu d'état
    const add = root.querySelector('.state-add[data-iid="' + c.iid + '"]');
    if (add) add.addEventListener('click', function () {
      stateMenuFor = (stateMenuFor === c.iid) ? null : c.iid; render();
    });
    root.querySelectorAll('.set-state[data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const key = b.getAttribute('data-state');
        if (key === 'blindage') { ['affaibli', 'auSol', 'feu'].forEach(function (s) { c.states[s] = false; }); }
        c.states[key] = true; stateMenuFor = null; Store.save(); render();
      });
    });

    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active' && !combat().outcome) {
      // Chips d'attaque
      root.querySelectorAll('.atk-chip[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          const i = parseInt(b.getAttribute('data-atk'), 10);
          const atk = c.attacks[i];
          if (!atk) return;
          if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i) {
            pendingAttack = null; render(); return; // re-clic = annuler
          }
          if (atk.targets === 'all') { execHeroAttack(c, i, null); }
          else { pendingAttack = { iid: c.iid, atkIndex: i }; stateMenuFor = null; render(); }
        });
      });
      // Contacts
      root.querySelectorAll('.contact-chip[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          const m = byId(b.getAttribute('data-enemy'));
          if (!m) return;
          const was = inContact(c, m);
          setContact(c, m, !was);
          if (was) { log(c.name + ' rompt le contact avec ' + m.name + '.', 'move'); dchocFrom(m, c); }
          else { log(c.name + ' engage ' + m.name + '.', 'move'); }
          c.used.move = true;
          checkOutcome(); Store.save(); render();
        });
      });
      const ana = root.querySelector('.do-analyse[data-iid="' + c.iid + '"]');
      if (ana) ana.addEventListener('click', function () {
        combat().bonusXp = (combat().bonusXp || 0) + 2; c.used.move = true;
        log(c.name + ' analyse un adversaire (+2 XP).', 'move'); Store.save(); render();
      });
      const obj = root.querySelector('.do-object[data-iid="' + c.iid + '"]');
      if (obj) obj.addEventListener('click', function () {
        c.used.object = true; log(c.name + ' utilise un objet.', 'move'); Store.save(); render();
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
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push('🟩' + v); heal += v; }
      const before = h.pv;
      h.pv = Math.min(h.maxPv, h.pv + heal);
      log(h.name + ' prend un repos court et récupère ' + (h.pv - before) + ' PV (' + rolls.join(' ') + ').', 'heal');
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
    box.innerHTML = combat().log.map(function (e) {
      return '<div class="log-row log-' + e.kind + '"><span class="log-turn">T' + e.turn + '</span>' +
        esc(e.text) + '</div>';
    }).join('');
  }

  function init() { render(); }

  global.Combat = { init: init, render: render };
})(window);
