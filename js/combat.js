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

  const SOCLE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };

  function combat() { return Store.state.combat; }

  // ---------- Construction des instances ----------
  function instFromHero(h, i) {
    return {
      iid: 'H' + i + '-' + h.id.slice(-4),
      side: 'hero', templateId: h.id, name: h.name,
      maxPv: Combatants.heroPv(h), pv: Combatants.heroPv(h),
      def: Combatants.heroDef(h), damage: h.damage, xp: 0, type: 'hero',
      menace: null, esquive: false, rapide: !!h.rapide, socle: 'medium',
      attacks: Combatants.heroCombatAttacks(h),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false },
      used: { action: false, move: false, object: false },
      contact: [], status: 'active',
    };
  }

  function instFromMonster(m, i) {
    return {
      iid: 'M' + i + '-' + m.id.slice(-4),
      side: 'monster', templateId: m.id, name: m.name,
      maxPv: m.pv, pv: m.pv,
      def: m.def, damage: m.damage, xp: m.xp, type: m.type,
      menace: m.menace, esquive: !!m.esquive, rapide: !!m.rapide, socle: m.socle,
      attacks: JSON.parse(JSON.stringify(m.attacks || [])),
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
      alert('Combat terminé.\nXP gagnée : ' + xp);
    }
    Store.state.combat = null;
    Store.save();
    render();
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
    if (res.echec) {
      log(attacker.name + ' → ' + target.name + ' : ÉCHEC (' + diceStr + ').', 'attack');
      return;
    }
    if (negated) {
      log(attacker.name + ' → ' + target.name + ' : annulé (' + reason + ').', 'attack');
      return;
    }

    if (res.pvLost > 0) target.pv = Math.max(0, target.pv - res.pvLost);
    if (res.pvHealed > 0) target.pv = Math.min(target.maxPv, target.pv + res.pvHealed);
    log(attacker.name + ' → ' + target.name + ' : ' + (res.critique ? 'CRITIQUE ! ' : '') +
        res.pvLost + ' PV (' + diceStr + ').', 'attack');
    applyStates(attacker, target, atk);
    checkComa(target);
  }

  function hasEffect(atk) { return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu); }

  function checkComa(c) {
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      log(c.name + ' tombe dans le coma.', c.side === 'monster' ? 'kill' : 'down');
    }
  }

  function checkOutcome() {
    const c = combat();
    if (!c || c.outcome) return;
    if (!activeOf('hero').length) {
      c.outcome = 'defeat'; c.phase = 'over';
      log('Tous les héros sont au coma — défaite. Aucune XP.', 'turn');
    } else if (!activeOf('monster').length) {
      c.outcome = 'victory'; c.phase = 'over';
      log('Tous les adversaires sont vaincus ou en fuite — victoire ! XP : ' + totalXp() + '.', 'turn');
    }
  }

  // ---------- Tour de combat ----------
  function resetActivations() {
    combat().combatants.forEach(function (c) {
      c.used = { action: false, move: false, object: false };
    });
  }

  function endHeroPhase() {
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
      const atk = (m.attacks && m.attacks[0]) || null;
      if (!atk) return;
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
        (setupHeroes[h.id] ? ' checked' : '') + '> <strong>' + esc(h.name) + '</strong>' +
        '<span class="hint">❤ ' + Combatants.heroPv(h) + ' · 🛡 ' + h.def + ' · ⚔ ' + h.damage + '</span></label>';
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
    const phaseLabel = c.outcome ? (c.outcome === 'victory' ? 'Victoire' : 'Défaite')
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

    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      '<div class="cc-head"><strong>' + esc(c.name) + '</strong>' +
        (c.type !== 'hero' ? '<span class="tag type">' + Combatants.TYPE_LABEL[c.type] + '</span>' : '') +
        (c.rapide ? '<span class="tag">Rapide</span>' : '') +
        (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
      '</div>' +
      '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div>' +
        '<span class="pv-text">' + c.pv + ' / ' + c.maxPv + ' PV</span></div>' +
      '<div class="cc-stats hint">🛡 DEF ' + (c.states.auSol ? '0 (au sol)' : c.def) +
        ' · ⚔ Dég. ' + c.damage + (c.type !== 'hero' ? ' · ✦ ' + c.xp + ' XP' : '') + '</div>' +
      '<div class="cc-states">' + statesBadges(c) +
        '<span class="state-add" data-iid="' + c.iid + '">+ état</span></div>';

    if (!dead) {
      // PV rapides
      html += '<div class="cc-quick">' +
        '<button class="ghost xs" data-dmg="-1" data-iid="' + c.iid + '">−1</button>' +
        '<button class="ghost xs" data-dmg="-3" data-iid="' + c.iid + '">−3</button>' +
        '<button class="ghost xs" data-dmg="1" data-iid="' + c.iid + '">+1</button>' +
        '<button class="ghost xs" data-dmg="3" data-iid="' + c.iid + '">+3</button>' +
        '</div>';
    }

    if (canAct) {
      const usedA = c.used.action, usedM = c.used.move, usedO = c.used.object;
      html += '<div class="cc-activation">' +
        '<span class="act-flag ' + (usedA ? 'used' : '') + '">Action</span>' +
        '<span class="act-flag ' + (usedM ? 'used' : '') + '">Mouv./Analyse</span>' +
        '<span class="act-flag ' + (usedO ? 'used' : '') + '">Objet</span></div>';
      // Attaque
      html += '<div class="cc-attack">' +
        '<select class="atk-select" data-iid="' + c.iid + '"' + (usedA ? ' disabled' : '') + '>' +
          c.attacks.map(function (a, i) { return '<option value="' + i + '">' + esc(a.name) + ' ' +
            (a.range === 'distance' ? '🏹' : '⚔') + (a.targets === 'all' ? ' (toutes)' : '') + '</option>'; }).join('') +
        '</select>' +
        '<select class="tgt-select" data-iid="' + c.iid + '"' + (usedA ? ' disabled' : '') + '>' +
          activeOf('monster').map(function (e) { return '<option value="' + e.iid + '">' + esc(e.name) + '</option>'; }).join('') +
        '</select>' +
        '<button class="primary xs do-attack" data-iid="' + c.iid + '"' + (usedA ? ' disabled' : '') + '>Attaquer</button>' +
        '</div>' +
        '<div class="cc-secondary">' +
          '<button class="ghost xs do-analyse" data-iid="' + c.iid + '"' + (usedM ? ' disabled' : '') + '>Analyse (+2 XP)</button>' +
          '<button class="ghost xs do-object" data-iid="' + c.iid + '"' + (usedO ? ' disabled' : '') + '>Objet</button>' +
          '<button class="ghost xs do-engage" data-iid="' + c.iid + '"' + (usedM ? ' disabled' : '') + '>Engager/Rompre</button>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function wireCard(c) {
    const root = $('#combat-root');
    root.querySelectorAll('[data-iid="' + c.iid + '"]').forEach(function () {});
    // PV rapides
    root.querySelectorAll('.cc-quick [data-iid="' + c.iid + '"]').forEach(function (b) {
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
    // Ajouter un état
    const add = root.querySelector('.state-add[data-iid="' + c.iid + '"]');
    if (add) add.addEventListener('click', function () {
      const choice = prompt('État à appliquer : affaibli, ausol, feu, blindage, onde, ciblage');
      if (!choice) return;
      const map = { affaibli: 'affaibli', ausol: 'auSol', feu: 'feu', blindage: 'blindage', onde: 'onde', ciblage: 'ciblage' };
      const key = map[choice.toLowerCase().trim()];
      if (!key) return;
      if (key === 'blindage') { ['affaibli', 'auSol', 'feu'].forEach(function (s) { c.states[s] = false; }); }
      c.states[key] = true; Store.save(); render();
    });

    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active') {
      const atkBtn = root.querySelector('.do-attack[data-iid="' + c.iid + '"]');
      if (atkBtn) atkBtn.addEventListener('click', function () {
        const ai = parseInt(root.querySelector('.atk-select[data-iid="' + c.iid + '"]').value, 10);
        const tid = root.querySelector('.tgt-select[data-iid="' + c.iid + '"]').value;
        const atk = c.attacks[ai];
        const target = byId(tid);
        if (!atk || !target) return;
        if (atk.range === 'contact' && !inContact(c, target)) { setContact(c, target, true); }
        if (atk.targets === 'all') {
          activeOf('monster').forEach(function (e) {
            if (atk.range === 'contact' ? inContact(c, e) : true) resolveAttack(c, e, atk);
          });
        } else {
          resolveAttack(c, target, atk);
        }
        c.used.action = true;
        checkOutcome(); Store.save(); render();
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
      const eng = root.querySelector('.do-engage[data-iid="' + c.iid + '"]');
      if (eng) eng.addEventListener('click', function () { engagePrompt(c); });
    }
  }

  function engagePrompt(hero) {
    const monsters = activeOf('monster');
    if (!monsters.length) return;
    const lines = monsters.map(function (m, i) { return (i + 1) + ') ' + (inContact(hero, m) ? '[contact] ' : '') + m.name; });
    const ans = prompt('Engager / rompre le contact avec :\n' + lines.join('\n') + '\n\nNuméro :');
    const idx = parseInt(ans, 10) - 1;
    const m = monsters[idx];
    if (!m) return;
    const wasContact = inContact(hero, m);
    setContact(hero, m, !wasContact);
    if (wasContact) { // rompre le contact → dégâts-choc de l'adversaire
      log(hero.name + ' rompt le contact avec ' + m.name + '.', 'move');
      dchocFrom(m, hero);
    } else {
      log(hero.name + ' engage ' + m.name + '.', 'move');
    }
    hero.used.move = true;
    checkOutcome(); Store.save(); render();
  }

  function renderPhaseControls() {
    const box = $('#phase-controls');
    const c = combat();
    if (c.outcome) {
      box.innerHTML = '<button id="pc-finish" class="primary big">Terminer (XP : ' + totalXp() + ')</button>';
      $('#pc-finish').addEventListener('click', function () { endCombat(true); });
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
