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

  // Sélections de l'écran de préparation (Combat Test)
  let setupHeroes = {};      // { heroId: true }
  let setupZones = [{ name: 'Zone 1', monsters: [] }, { name: 'Zone 2', monsters: [] }]; // [{name, monsters:[{templateId,count}]}]
  let setupHeroZone = 0;     // index de la zone de départ des aventuriers

  // État d'interaction du plateau
  let pendingAttack = null;   // { iid, atkIndex } quand on choisit une cible au clic
  let pendingMove = null;     // iid du combattant en cours de déplacement
  let stateMenuFor = null;    // iid dont le menu « + état » est ouvert
  let rootSel = '#combat-root'; // cible de rendu (redirigée pendant un combat de session)

  const SOCLE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };
  function slug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Deux combats indépendants : 'combat' (aventure) et 'testCombat' (équilibrage MJ).
  // combatKey désigne celui affiché/édité dans le contexte courant.
  let combatKey = 'combat';
  function combat() { return Store.state[combatKey]; }
  function setCombat(v) { Store.state[combatKey] = v; }

  // Un aventurier dispose de l'action Analyser si sa classe possède le talent « Analyse »
  function heroHasAnalyse(c) {
    if (!c || c.side !== 'hero') return false;
    const k = (Store.loadClasses() || []).find(function (x) { return x.name === c.klass; });
    return !!(k && Array.isArray(k.talents) && k.talents.some(function (t) { return /analyse/i.test(t.name || ''); }));
  }

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
      zone: 0, status: Combatants.heroCurPv(h) > 0 ? 'active' : 'coma',
      dmgDealt: 0, dmgTaken: 0,
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
      zone: 0, status: 'active', analyzed: false,
      dmgDealt: 0, dmgTaken: 0,
    };
  }

  // Normalise une configuration de zones (depuis une scène ou le setup de test)
  function normalizeZoneConfig(src) {
    let zones = null;
    if (src && Array.isArray(src.combatZones) && src.combatZones.length) zones = src.combatZones;
    else if (Array.isArray(src) && src.length && src[0] && src[0].monsterRefs !== undefined) zones = src;
    else {
      // Ancien format : liste plate de monstres → 1 zone aventuriers + 1 zone adversaires
      const refs = (src && src.monsterRefs) ? src.monsterRefs : (Array.isArray(src) ? src : []);
      zones = [
        { name: 'Zone des aventuriers', monsterRefs: [], heroStart: true },
        { name: 'Adversaires', monsterRefs: refs.map(function (r) { return { monsterId: r.monsterId || r.templateId, count: r.count || 1 }; }) },
      ];
    }
    let hsi = zones.findIndex(function (z) { return z.heroStart; });
    if (hsi < 0) hsi = 0;
    return {
      zones: zones.slice(0, 4).map(function (z) {
        return { name: z.name || '', monsterRefs: (z.monsterRefs || []).filter(function (r) { return r.monsterId; }) };
      }),
      heroStartZone: hsi,
    };
  }

  // Assemble les combattants en plaçant chacun dans sa zone
  function buildCombat(heroObjs, cfg) {
    const zones = (cfg.zones || []).map(function (z) { return { name: z.name || '' }; });
    if (!zones.length) zones.push({ name: 'Zone 1' });
    zones.forEach(function (z, i) { if (!z.name) z.name = 'Zone ' + (i + 1); });
    const heroZone = Math.min(Math.max(0, cfg.heroStartZone || 0), zones.length - 1);
    const combatants = [];
    heroObjs.forEach(function (h, i) { const inst = instFromHero(h, i); inst.zone = heroZone; combatants.push(inst); });
    let mi = 0;
    (cfg.zones || []).forEach(function (z, zi) {
      (z.monsterRefs || []).forEach(function (ref) {
        const tpl = Store.state.monsters.find(function (m) { return m.id === ref.monsterId; });
        if (!tpl) return;
        const count = ref.count || 1;
        for (let k = 0; k < count; k++) {
          const inst = instFromMonster(tpl, mi++);
          if (count > 1) inst.name = tpl.name + ' #' + (k + 1);
          inst.zone = Math.min(zi, zones.length - 1);
          combatants.push(inst);
        }
      });
    });
    pendingAttack = null; pendingMove = null; stateMenuFor = null;
    setCombat({ turn: 1, phase: 'heroes', bonusXp: 0, zones: zones, combatants: combatants, log: [], outcome: null });
  }

  function startCombat() {
    const heroObjs = Store.state.heroes.filter(function (h) { return setupHeroes[h.id]; });
    const cfg = {
      zones: setupZones.map(function (z, i) {
        return {
          name: z.name,
          heroStart: i === setupHeroZone,
          monsterRefs: (z.monsters || []).map(function (mm) { return { monsterId: mm.templateId, count: mm.count }; }),
        };
      }),
      heroStartZone: setupHeroZone,
    };
    buildCombat(heroObjs, cfg);
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

  // Abandon (mode aventure) = défaite : les adversaires jouent un dernier tour,
  // puis les survivants s'enfuient (ils ne rapportent pas d'XP), et on file vers la scène Défaite.
  function forfeitCombat() {
    const c = combat();
    if (!c) return;
    pendingAttack = null; pendingMove = null;
    c.phase = 'monsters';
    log('Vous renoncez au combat — dernier assaut des adversaires.', 'turn');
    monstersActCore();
    activeOf('monster').forEach(function (m) { m.status = 'fled'; });
    log('Les adversaires survivants s\'enfuient.', 'turn');
    c.outcome = 'defeat';
    Store.save();
    endCombat(false); // dispatch la défaite à la session
  }

  // Fin de combat → soin automatique des aventuriers à terre, puis écran de résumé.
  function endCombat(finalize) {
    const c = combat();
    if (!c) return;
    c.healLines = [];
    c.combatants.forEach(function (h) {
      if (h.side === 'hero' && (h.status !== 'active' || h.pv <= 0)) {
        const v = Math.min(h.maxPv, 1 + Math.floor(Math.random() * 6) + (h.endu || 0));
        h.pv = v; h.status = 'active';
        c.healLines.push({ name: h.name, pv: v });
      }
    });
    c.finalize = !!finalize;
    c.finished = true;
    pendingAttack = null; pendingMove = null; stateMenuFor = null;
    Store.save();
    renderSummary();
  }

  // Quitte réellement le combat (après l'écran de résumé) et reprend l'aventure
  function finishCombat() {
    const c = combat();
    if (!c) return;
    const isSession = combatKey === 'combat';
    const sessionCtx = isSession ? (Store.state.sessionCombat || null) : null;
    const outcomeLabel = c.outcome || null;
    const gained = c.finalize ? totalXp() : 0;
    if (c.finalize && !isSession) Store.state.party.xp = (Store.state.party.xp || 0) + gained;
    if (isSession) persistHeroPv();
    setCombat(null);
    if (isSession) Store.state.sessionCombat = null;
    Store.save();
    if (window.Combatants) { Combatants.renderProgress(); Combatants.renderHeroes(); }
    if (sessionCtx && sessionCtx.sessionId) {
      window.dispatchEvent(new CustomEvent('adventure-combat-end', {
        detail: { sessionId: sessionCtx.sessionId, outcome: outcomeLabel, xp: gained }
      }));
    } else {
      rootSel = '#combat-root';
      render();
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

  // ---------- Zones ----------
  function zones() { return combat().zones || []; }
  function zoneCount() { return Math.max(1, zones().length); }
  function zname(zi) { const z = zones()[zi]; return (z && z.name) ? z.name : ('Zone ' + (zi + 1)); }
  // Une attaque atteint sa cible : contact = même zone ; distance = n'importe quelle zone
  function canReach(attacker, target, atk) {
    if (atk && atk.range === 'contact') return attacker.zone === target.zone;
    return true;
  }
  // Adversaires actifs présents dans la zone de l'attaquant (pour les dégâts-choc)
  function enemyZoneMates(attacker) {
    const es = attacker.side === 'hero' ? 'monster' : 'hero';
    return combat().combatants.filter(function (c) {
      return c.side === es && c.status === 'active' && c.zone === attacker.zone;
    });
  }
  // Déplacement (sans rendu). Un aventurier qui quitte une zone occupée par des
  // adversaires sans autre allié subit leurs dégâts-choc (attaques d'opportunité).
  function doMove(c, zi) {
    const from = c.zone;
    if (c.side === 'hero') {
      const enemiesHere = combat().combatants.filter(function (x) { return x.side === 'monster' && x.status === 'active' && x.zone === from; });
      const otherAllies = combat().combatants.filter(function (x) { return x.side === 'hero' && x.status === 'active' && x.zone === from && x.iid !== c.iid; });
      if (enemiesHere.length && !otherAllies.length) {
        log(wname(c.name) + ' quitte la zone — <span class="lstate">attaques d\'opportunité</span> !', 'state');
        enemiesHere.forEach(function (m) { if (c.status === 'active') dchocFrom(m, c); });
      }
    }
    c.used.move = true;
    if (c.status !== 'active') return; // tombé au coma en partant
    c.zone = zi;
    log(wname(c.name) + ' se déplace vers <span class="lstate">' + esc(zname(zi)) + '</span>.', 'move');
  }

  function moveCombatant(iid, zi) {
    const c = byId(iid);
    if (!c || c.used.move || c.status !== 'active') { pendingMove = null; render(); return; }
    if (c.zone === zi) { pendingMove = null; render(); return; }
    doMove(c, zi);
    pendingMove = null; checkOutcome(); Store.save(); render();
  }

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
    hero.dmgTaken += dmg; monster.dmgDealt += dmg;
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
    // Dégâts-choc : tirer à distance avec des adversaires dans sa propre zone
    if (atk.range === 'distance' && attacker.side === 'hero') {
      enemyZoneMates(attacker).forEach(function (m) { dchocFrom(m, attacker); });
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

    if (res.pvLost > 0) { target.pv = Math.max(0, target.pv - res.pvLost); target.dmgTaken += res.pvLost; attacker.dmgDealt += res.pvLost; }
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
                 c.zone === target.zone;
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

  // Attaques utilisables d'un combattant (usages restants + action disponible)
  function usableAttackIdx(m, range) {
    for (let i = 0; i < m.attacks.length; i++) {
      const a = m.attacks[i];
      if (m.attackUses[i] === 0) continue;
      if (!a.freeAction && m.used.action) continue;
      if (range && a.range !== range) continue;
      return i;
    }
    return -1;
  }

  // Cœur de la phase adverse (sans rendu) — gestion par zones
  // Contact : frappe en priorité un héros de sa zone (se déplace si besoin).
  // Distance : frappe en priorité un héros d'une autre zone.
  function monstersActCore() {
    activeOf('monster').forEach(function (m) {
      if (m.used.action || m.states.auSol) return; // Au sol : pas d'action
      const heroes = activeOf('hero');
      if (!heroes.length) return;
      const sameZone = heroes.filter(function (h) { return h.zone === m.zone; });
      const otherZone = heroes.filter(function (h) { return h.zone !== m.zone; });
      const contactIdx = usableAttackIdx(m, 'contact');
      const distIdx = usableAttackIdx(m, 'distance');

      // 1) Arme de contact + cible dans la zone → frappe au contact
      if (contactIdx >= 0 && sameZone.length) {
        applyAttack(m, contactIdx, chooseFrom(m, sameZone));
      // 2) Arme à distance → frappe en priorité une autre zone, sinon n'importe qui
      } else if (distIdx >= 0) {
        applyAttack(m, distIdx, chooseFrom(m, otherZone.length ? otherZone : heroes));
      // 3) Seulement du contact, personne dans la zone → se déplace vers une cible puis frappe
      } else if (contactIdx >= 0) {
        const target = chooseFrom(m, heroes);
        if (target && !m.used.move) {
          m.zone = target.zone; m.used.move = true;
          log(wname(m.name) + ' se déplace vers <span class="lstate">' + esc(zname(m.zone)) + '</span>.', 'move');
        }
        if (target && target.zone === m.zone) applyAttack(m, contactIdx, target);
      }
    });
    checkOutcome();
  }

  function monsterAI() { monstersActCore(); Store.save(); render(); }

  // Sélection d'une cible selon la menace, parmi un ensemble de candidats
  function chooseFrom(monster, candidates) {
    if (!candidates || !candidates.length) return null;
    if (monster.menace === 'pvLow') return minBy(candidates, function (h) { return h.pv; });
    if (monster.menace === 'pvHigh') return maxBy(candidates, function (h) { return h.pv; });
    if (monster.menace === 'defLow') return minBy(candidates, function (h) { return h.def; });
    return candidates[0];
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

  // Tour des adversaires en une seule étape : tous les adversaires en vie agissent,
  // puis on enchaîne directement sur le tour suivant.
  function enemyTurnAndAdvance() {
    pendingAttack = null; stateMenuFor = null;
    const c = combat();
    c.phase = 'monsters';
    log('Tour des adversaires.', 'turn');
    monstersActCore();
    if (combat().outcome) { Store.save(); render(); return; }
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
      // Si le héros n'a que des armes de contact et aucun adversaire dans sa zone, il s'y déplace
      const hasDistance = h.attacks.some(function (a) { return a.range === 'distance'; });
      const enemiesHere = activeOf('monster').filter(function (m) { return m.zone === h.zone; });
      if (!hasDistance && !enemiesHere.length && !h.used.move) {
        const t = autoTarget(); if (t) { h.zone = t.zone; h.used.move = true; }
      }
      let safety = 0;
      while (safety++ < 8) {
        if (!activeOf('monster').length) break;
        let bestI = -1, best = -1;
        h.attacks.forEach(function (a, i) {
          if (h.attackUses[i] === 0) return;
          if (!a.freeAction && h.used.action) return;
          // ne retient une attaque de contact que s'il existe une cible joignable
          if (a.range === 'contact' && !activeOf('monster').some(function (m) { return m.zone === h.zone; })) return;
          const sc = attackScore(a, h);
          if (sc > best) { best = sc; bestI = i; }
        });
        if (bestI < 0) break;
        const atk = h.attacks[bestI];
        let tgt = null;
        if (atk.targets !== 'all') {
          const reach = activeOf('monster').filter(function (m) { return canReach(h, m, atk); });
          if (!reach.length) break;
          tgt = reach.reduce(function (a, b) { return b.pv < a.pv ? b : a; });
        }
        applyAttack(h, bestI, tgt);
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
    else if (combat().finished) { renderSummary(); }
    else { renderBoard(root); }
  }

  // Écran de résumé de fin de combat
  function renderSummary() {
    const root = $(rootSel);
    if (!root) return;
    const c = combat();
    const OUT = { victory: 'Victoire', minor: 'Victoire mineure', defeat: 'Défaite' };
    const killed = c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'coma'; });
    const fled = c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'fled'; });
    const dealt = c.combatants.filter(function (x) { return x.dmgDealt > 0; }).sort(function (a, b) { return b.dmgDealt - a.dmgDealt; });
    const taken = c.combatants.filter(function (x) { return x.dmgTaken > 0; }).sort(function (a, b) { return b.dmgTaken - a.dmgTaken; });
    const xp = c.finalize ? totalXp() : 0;
    function names(list) { return list.length ? list.map(function (x) { return esc(x.name); }).join(', ') : '—'; }
    function rows(list, key) {
      if (!list.length) return '<div class="cs-row hint">—</div>';
      return list.map(function (x) { return '<div class="cs-row"><span>' + esc(x.name) + '</span><strong>' + x[key] + '</strong></div>'; }).join('');
    }
    root.innerHTML = '<div class="card combat-summary cs-' + (c.outcome || 'end') + '">' +
      '<h2 class="cs-title">' + (OUT[c.outcome] || 'Combat terminé') + '</h2>' +
      '<div class="cs-line">☠ Adversaires vaincus : <strong>' + names(killed) + '</strong></div>' +
      (fled.length ? '<div class="cs-line">🏃 Adversaires en fuite : <strong>' + names(fled) + '</strong></div>' : '') +
      '<div class="cs-cols">' +
        '<div class="cs-block"><h3>Dégâts infligés</h3>' + rows(dealt, 'dmgDealt') + '</div>' +
        '<div class="cs-block"><h3>Dégâts subis</h3>' + rows(taken, 'dmgTaken') + '</div>' +
      '</div>' +
      (c.healLines && c.healLines.length
        ? '<div class="cs-line">✚ Aventuriers ranimés : <strong>' +
            c.healLines.map(function (h) { return esc(h.name) + ' (' + h.pv + ' PV)'; }).join(', ') + '</strong></div>'
        : '') +
      '<div class="cs-xp">✦ XP gagnée : <strong>' + xp + '</strong></div>' +
      '<button class="primary big" id="cs-continue">Continuer</button>' +
    '</div>';
    $('#cs-continue').addEventListener('click', finishCombat);
  }

  function renderSetup(root) {
    // Combat Test : uniquement les aventuriers pré-construits (pas les héros de joueurs)
    const heroes = (window.Combatants && Combatants.prebuiltHeroes) ? Combatants.prebuiltHeroes() : Store.state.heroes;
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
          '<div class="card-head"><h2>Zones de combat</h2>' +
            '<button id="setup-add-zone" class="ghost small"' + (setupZones.length >= 4 ? ' disabled' : '') + '>+ Zone</button></div>' +
          '<div id="setup-zones"></div>' +
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

    $('#setup-add-zone').addEventListener('click', function () {
      if (setupZones.length >= 4) return;
      setupZones.push({ name: 'Zone ' + (setupZones.length + 1), monsters: [] });
      renderSetup(root);
    });
    renderSetupZones(root);
    $('#setup-start').addEventListener('click', function () { if (canStart()) startCombat(); });
    $('#setup-auto').addEventListener('click', function () { if (canStart()) autoCombat(); });
    updateStartBtn();
  }

  // Éditeur de zones du Combat Test : nom, monstres, zone de départ des aventuriers
  function renderSetupZones(root) {
    const box = $('#setup-zones');
    if (!box) return;
    const monsters = Store.state.monsters;
    const monOpts = monsters.map(function (m) {
      return '<option value="' + m.id + '">' + esc(m.name) + ' (' + Combatants.TYPE_LABEL[m.type] + ')</option>';
    }).join('');
    box.innerHTML = setupZones.map(function (z, zi) {
      const monsHtml = (z.monsters || []).length
        ? z.monsters.map(function (e, mi) {
            const m = monsters.find(function (x) { return x.id === e.templateId; });
            return '<div class="setup-row"><strong>' + esc(m ? m.name : '?') + '</strong>' +
              '<span class="tag">×' + e.count + '</span>' +
              '<button class="icon-btn" data-zrm="' + zi + '_' + mi + '">✕</button></div>';
          }).join('')
        : '<p class="empty" style="margin:.2rem 0">Aucun adversaire.</p>';
      return '<div class="setup-zone">' +
        '<div class="setup-zone-head">' +
          '<input type="text" class="zone-name-input" data-zname="' + zi + '" value="' + esc(z.name || ('Zone ' + (zi + 1))) + '" />' +
          '<label class="zone-start"><input type="radio" name="hero-zone" data-zstart="' + zi + '"' + (setupHeroZone === zi ? ' checked' : '') + '> Départ aventuriers</label>' +
          (setupZones.length > 1 ? '<button class="icon-btn" data-zdel="' + zi + '" title="Supprimer la zone">✕</button>' : '') +
        '</div>' +
        '<div class="setup-monster-add">' +
          '<select class="zone-mon-select" data-zsel="' + zi + '">' + monOpts + '</select>' +
          '<input type="number" class="zone-mon-count" data-zcnt="' + zi + '" min="1" value="1" />' +
          '<button class="ghost zone-mon-add" data-zadd="' + zi + '">+ Ajouter</button>' +
        '</div>' +
        monsHtml +
      '</div>';
    }).join('');

    box.querySelectorAll('[data-zname]').forEach(function (inp) {
      inp.addEventListener('input', function () { setupZones[+inp.getAttribute('data-zname')].name = inp.value; });
    });
    box.querySelectorAll('[data-zstart]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setupHeroZone = +r.getAttribute('data-zstart'); });
    });
    box.querySelectorAll('[data-zdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        const zi = +b.getAttribute('data-zdel');
        setupZones.splice(zi, 1);
        if (setupHeroZone >= setupZones.length) setupHeroZone = 0;
        renderSetup(root);
      });
    });
    box.querySelectorAll('[data-zadd]').forEach(function (b) {
      b.addEventListener('click', function () {
        const zi = +b.getAttribute('data-zadd');
        const sel = box.querySelector('[data-zsel="' + zi + '"]');
        const cntEl = box.querySelector('[data-zcnt="' + zi + '"]');
        const id = sel.value;
        const count = Math.max(1, parseInt(cntEl.value, 10) || 1);
        if (!id) return;
        const ex = setupZones[zi].monsters.find(function (e) { return e.templateId === id; });
        if (ex) ex.count += count; else setupZones[zi].monsters.push({ templateId: id, count: count });
        renderSetupZones(root); updateStartBtn();
      });
    });
    box.querySelectorAll('[data-zrm]').forEach(function (b) {
      b.addEventListener('click', function () {
        const parts = b.getAttribute('data-zrm').split('_');
        setupZones[+parts[0]].monsters.splice(+parts[1], 1);
        renderSetupZones(root); updateStartBtn();
      });
    });
  }

  function canStart() {
    const heroCount = Object.keys(setupHeroes).filter(function (k) { return setupHeroes[k]; }).length;
    const monCount = setupZones.reduce(function (n, z) {
      return n + (z.monsters || []).reduce(function (s, m) { return s + m.count; }, 0);
    }, 0);
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
      '<div class="targeting-banner' + ((pendingAttack || pendingMove) ? ' active' : '') + '">' + bannerHtml() + '</div>' +
      '<div class="combat-zones-grid zc-' + zoneCount() + '">' +
        zones().map(function (z, zi) {
          return '<div class="combat-zone' + (pendingMove ? ' movable' : '') + '" data-zone="' + zi + '">' +
            '<div class="zone-name">' + esc(zname(zi)) + '</div>' +
            '<div class="zone-cards" id="zone-cards-' + zi + '"></div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div id="combat-cemetery" class="combat-cemetery"></div>' +
      '<div class="phase-controls" id="phase-controls"></div>' +
      '<div class="card"><div class="card-head"><h3>Journal de combat</h3></div>' +
        '<div id="combat-log" class="combat-log"></div></div>';

    renderZones();
    renderPhaseControls();
    renderLog();

    $('#cb-end').addEventListener('click', function () {
      const isSession = combatKey === 'combat' && Store.state.sessionCombat;
      if (isSession) {
        if (confirm('Terminer ce combat ? Vos adversaires agiront une dernière fois et vous subirez les conséquences d\'une défaite.')) forfeitCombat();
      } else {
        if (confirm('Terminer et quitter ce combat ?')) endCombat(false);
      }
    });
    const ct = $('#cancel-target');
    if (ct) ct.addEventListener('click', function () { pendingAttack = null; render(); });
    const cm = $('#cancel-move');
    if (cm) cm.addEventListener('click', function () { pendingMove = null; render(); });

    // Déplacement : cliquer une zone y envoie le combattant en cours de mouvement
    root.querySelectorAll('.combat-zone').forEach(function (zEl) {
      zEl.addEventListener('click', function (e) {
        if (!pendingMove) return;
        if (e.target.closest('button') || e.target.closest('.atk-row')) return;
        moveCombatant(pendingMove, parseInt(zEl.getAttribute('data-zone'), 10));
      });
    });
  }

  // Contenu de la bannière de ciblage / déplacement (toujours présente : pas de saut d'UI)
  function bannerHtml() {
    if (pendingMove) {
      const mv = byId(pendingMove);
      return '🚶 <b>' + esc(mv ? mv.name : '') + '</b> — <b>clique la zone de destination</b>. ' +
        '<button id="cancel-move" class="ghost xs">Annuler</button>';
    }
    if (pendingAttack) {
      const at = byId(pendingAttack.iid);
      const ak = at && at.attacks[pendingAttack.atkIndex];
      if (at && ak) {
        return '🎯 <b>' + esc(at.name) + '</b> — ' + esc(ak.name) +
          (pendingAttack.average ? ' <span class="lavg">(dégâts moyens)</span>' : '') +
          (ak.range === 'contact' ? ' <span class="lavg">(contact : même zone)</span>' : ' <span class="lavg">(à distance)</span>') +
          ' : <b>clique l\'adversaire à frapper</b>. <button id="cancel-target" class="ghost xs">Annuler</button>';
      }
    }
    return '<span class="tb-idle">Choisis une attaque ou un mouvement, puis clique la cible / la zone.</span>';
  }

  // Adversaires d'une zone : Boss > Solitaire > Alpha > Sbires (standards groupés)
  const MTYPE_RANK = { boss: 0, solitaire: 1, alpha: 2, standard: 3 };
  function mrank(t) { return MTYPE_RANK.hasOwnProperty(t) ? MTYPE_RANK[t] : 9; }
  function baseName(n) { return (n || '').replace(/\s*#\d+$/, ''); }

  function renderZones() {
    zones().forEach(function (z, zi) {
      const box = $('#zone-cards-' + zi);
      if (!box) return;
      // Les aventuriers restent dans leur zone (même au coma, grisés) ;
      // les adversaires morts/enfuis partent au cimetière (hors zone).
      const heroes = combat().combatants.filter(function (c) { return c.zone === zi && c.side === 'hero'; });
      const monsters = combat().combatants.filter(function (c) { return c.zone === zi && c.side === 'monster' && c.status === 'active'; })
        .sort(function (a, b) { return mrank(a.type) - mrank(b.type); });
      // Aventuriers côte à côte (grille), pour gagner de la place
      let html = heroes.length ? '<div class="hero-grid">' + heroes.map(renderCard).join('') + '</div>' : '';
      // Les sbires (standard) occupent toujours une demi-largeur (grille), même seuls ;
      // les autres types prennent toute la largeur.
      const sbires = monsters.filter(function (m) { return m.type === 'standard'; });
      const elites = monsters.filter(function (m) { return m.type !== 'standard'; });
      if (sbires.length) html += '<div class="monster-grid">' + sbires.map(renderCard).join('') + '</div>';
      elites.forEach(function (m) { html += renderCard(m); });
      box.innerHTML = html || '<p class="empty zone-empty">Zone vide</p>';
      heroes.concat(monsters).forEach(function (c) { wireCard(c); });
    });
    renderCemetery();
  }

  // Cimetière : adversaires vaincus ou enfuis (compact, hors zones)
  function renderCemetery() {
    const box = $('#combat-cemetery');
    if (!box) return;
    const dead = combat().combatants.filter(function (c) { return c.side === 'monster' && c.status !== 'active'; });
    if (!dead.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="cem-label">☠ Cimetière</span>' + dead.map(function (c) {
      return '<span class="cem-chip">' + esc(c.name) + ' <em>' + (c.status === 'coma' ? 'vaincu' : 'a fui') + '</em></span>';
    }).join('');
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
    const pvText = (isEnemy && !known) ? 'PV ?' : (c.pv + ' / ' + c.maxPv + ' PV');
    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      '<div class="cc-head"><span class="roster-name">' + esc(c.name) + '</span>' +
        (c.klass ? '<span class="tag class-tag">' + esc(c.klass) + '</span>' : '') +
        (c.type !== 'hero' ? '<span class="tag type">' + Combatants.TYPE_LABEL[c.type] + '</span>' : '') +
        (c.rapide ? '<span class="tag">Rapide</span>' : '') +
        (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
      '</div>' +
      '<div class="cc-pvline">' +
        '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div>' +
          '<span class="pv-text">' + pvText + '</span></div>' +
        (known ? '<span class="def-badge">🛡 ' + (c.states.auSol ? '0' : c.def) + '</span>' : '') +
      '</div>' +
      (known
        ? '<div class="stat-pills compact">' +
            '<span class="stat-pill">Dégâts ' + c.damage + '</span>' +
            (isEnemy ? '<span class="stat-pill">XP ' + c.xp + '</span>' : '') +
          '</div>'
        : ''
      ) +
      (statesBadges(c) ? '<div class="cc-states">' + statesBadges(c) + '</div>' : '') +
      (isEnemy && c.attacks && c.attacks.length
        ? '<div class="cc-enemy-atks">' + c.attacks.map(function (a) {
            return '<span class="enemy-atk">' + esc(attackLabel(a)) +
              ' <em>' + (a.range === 'distance' ? 'distance' : 'contact') + '</em></span>';
          }).join('') + '</div>'
        : '');

    if (canAct) {
      const usedA = c.used.action;
      html += '<div class="cc-attacks">' + c.attacks.map(function (a, i) {
        const uses = c.attackUses[i];
        const depleted = uses === 0;
        const blocked = depleted || (!a.freeAction && usedA);
        const isThisAtk = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i;
        const chipSel = isThisAtk && !pendingAttack.average;
        const rangeBits = [(a.range === 'distance' ? '🏹 distance' : '⚔ contact')];
        if (a.targets === 'all') rangeBits.push('toutes');
        if (a.freeAction) rangeBits.push('gratuite');
        const showDmg = a.useOwnDamage !== false && c.damage > 0 && !c.states.affaibli;
        return '<button class="atk-chip ' + (chipSel ? 'selected' : '') + '" data-iid="' + c.iid + '" data-atk="' + i + '"' +
            (blocked ? ' disabled' : '') + '>' +
            '<span class="atk-chip-main">' +
              '<span class="atk-chip-name">' + esc(a.name) + '</span>' +
              '<span class="atk-chip-range">' + rangeBits.join(' · ') + '</span>' +
            '</span>' +
            '<span class="atk-chip-figs">' +
              Inventory.poolBadges(a.dice) +
              (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '') +
              (uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
            '</span>' +
          '</button>';
      }).join('') + '</div>';
      // Mouvement (demi-largeur) + Objet équipé, côte à côte
      const usedO = c.used.object;
      html += '<div class="cc-move-row">' +
        (zoneCount() > 1
          ? '<button class="move-chip do-move half' + (pendingMove === c.iid ? ' selected' : '') + '" data-iid="' + c.iid + '"' +
              (c.used.move ? ' disabled' : '') + '>' +
              '<span class="atk-chip-main"><span class="atk-chip-name">Mouvement</span>' +
              '<span class="atk-chip-range">changer de zone</span></span></button>'
          : '') +
        '<button class="obj-chip do-object half" data-iid="' + c.iid + '"' + (usedO ? ' disabled' : '') + '>' +
          '<span class="atk-chip-main"><span class="atk-chip-name">Objet</span>' +
          '<span class="atk-chip-range">utiliser l\'objet équipé</span></span></button>' +
      '</div>';
      if (heroHasAnalyse(c)) {
        html += '<div class="cc-secondary"><button class="ghost xs do-analyse" data-iid="' + c.iid + '"' +
          (usedA ? ' disabled' : '') + ' title="Action : révèle DEF, Dégâts et XP de tous les adversaires">🔍 Analyser</button></div>';
      }
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
    let targets = (atk.targets === 'all')
      ? activeOf(enemySide).filter(function (t) { return canReach(attacker, t, atk); })
      : (target ? [target] : []);
    targets.forEach(function (t) { resolveAttack(attacker, t, atk); });
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
      enemyZoneMates(attacker).forEach(function (m) { dchocFrom(m, attacker); });
    }
    if (attacker.status !== 'active') return;
    // Dégâts moyens = moyenne des dés de l'arme seulement (sans le bonus de dégâts)
    const avgDice = Math.round(avgDicePool(atk.dice));
    const def = target.states.auSol ? 0 : target.def;
    const pvLost = Math.max(0, avgDice - def);
    const label = '<span class="lwpn">' + nm(attackLabel(atk)) + '</span>';
    if (pvLost > 0) {
      target.pv = Math.max(0, target.pv - pvLost);
      target.dmgTaken += pvLost; attacker.dmgDealt += pvLost;
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
    const targets = (atk.targets === 'all')
      ? activeOf(enemySide).filter(function (t) { return canReach(attacker, t, atk); })
      : (target ? [target] : []);
    targets.forEach(function (t) { resolveAverageAttack(attacker, t, atk); });
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
        const atk = attacker.attacks[pendingAttack.atkIndex];
        if (atk && atk.range === 'contact' && attacker.zone !== c.zone) {
          // Pas de mouvement disponible → on ne peut pas atteindre la cible
          if (attacker.used.move) { alert('Vous ne pouvez pas atteindre cet adversaire.'); return; }
          // Sinon, déplacement automatique vers la zone de la cible avant d'attaquer
          doMove(attacker, c.zone);
          if (attacker.status !== 'active') { pendingAttack = null; checkOutcome(); Store.save(); render(); return; }
        }
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
    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active' && !combat().outcome) {
      // Action Analyser (talent) : révèle les caractéristiques de tous les adversaires
      const anaBtn = root.querySelector('.do-analyse[data-iid="' + c.iid + '"]');
      if (anaBtn) anaBtn.addEventListener('click', function () {
        if (c.used.action) return;
        combat().combatants.forEach(function (m) { if (m.side === 'monster') m.analyzed = true; });
        c.used.action = true;
        log(wname(c.name) + ' analyse les adversaires : DEF, Dégâts et XP révélés.', 'move');
        Store.save(); render();
      });
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
      // Mouvement : arme le déplacement, puis on clique la zone de destination
      const mv = root.querySelector('.do-move[data-iid="' + c.iid + '"]');
      if (mv) mv.addEventListener('click', function () {
        if (c.used.move) return;
        pendingMove = (pendingMove === c.iid) ? null : c.iid;
        pendingAttack = null; render();
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
      const won = c.outcome !== 'defeat';
      box.innerHTML =
        (canRest ? '<button id="pc-rest" class="ghost big">🏕️ Repos court (Endu × 🟩)</button>' : '') +
        '<button id="pc-finish" class="primary big">Terminer' + (won ? ' (XP : ' + totalXp() + ')' : '') + '</button>';
      $('#pc-finish').addEventListener('click', function () { endCombat(won); });
      const rest = $('#pc-rest');
      if (rest) rest.addEventListener('click', shortRest);
      return;
    }
    if (c.phase === 'heroes') {
      box.innerHTML = '<button id="pc-enemy-turn" class="primary">Tour des Adversaires →</button>';
      $('#pc-enemy-turn').addEventListener('click', enemyTurnAndAdvance);
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
  function startInSession(heroIds, sceneCombat, sessionCtx, sel) {
    combatKey = 'combat';
    rootSel = sel || '#combat-root';
    const heroObjs = (heroIds || []).map(function (id) {
      return Store.state.heroes.find(function (h) { return h.id === id; });
    }).filter(Boolean);
    Store.state.sessionCombat = sessionCtx || null;
    buildCombat(heroObjs, normalizeZoneConfig(sceneCombat));
    log('Début du combat — Tour 1.', 'turn');
    Store.save();
    render();
  }

  // Réaffiche un combat de session en cours dans le conteneur donné (après un
  // changement d'onglet, le combat n'est pas perdu).
  function resumeInSession(sel) {
    combatKey = 'combat';
    rootSel = sel || '#combat-root';
    render();
  }

  function hasActiveCombat() { return !!Store.state.combat; }

  // Onglet « Combat Test » (MJ) : combat indépendant ('testCombat'),
  // totalement décorrélé du combat d'aventure.
  function renderTest() {
    combatKey = 'testCombat';
    rootSel = '#combat-root';
    render();
  }

  function init() { render(); }

  global.Combat = {
    init: init, render: render, renderTest: renderTest,
    startInSession: startInSession,
    resumeInSession: resumeInSession,
    hasActiveCombat: hasActiveCombat,
  };
})(window);
