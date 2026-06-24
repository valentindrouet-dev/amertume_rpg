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
  let pendingAnalyze = null;  // iid de l'aventurier en cours d'analyse (choisit une cible)
  let stateMenuFor = null;    // iid dont le menu « + état » est ouvert
  let selectedIid = null;     // combattant dont la fiche est affichée dans le bandeau d'action
  let movePrefix = null;      // { iid, zone } : déplacement à fusionner avec l'attaque qui suit
  let rootSel = '#combat-root'; // cible de rendu (redirigée pendant un combat de session)

  const SOCLE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };
  function slug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Deux combats indépendants : 'combat' (aventure) et 'testCombat' (équilibrage MJ).
  // combatKey désigne celui affiché/édité dans le contexte courant.
  let combatKey = 'combat';
  // État de la séquence d'activation des adversaires (tour ennemi joué pas à pas).
  let aiRunning = false;  // une séquence est-elle en cours ?
  let aiTimer = null;     // setTimeout du prochain pas (annulable)
  let aiToken = 0;        // génération : invalidée à chaque changement de combat
  function combat() { return Store.state[combatKey]; }
  // Toute (ré)assignation du combat invalide une séquence d'IA en cours : ses
  // setTimeout en attente ne doivent jamais agir sur un nouveau combat (sinon
  // des adversaires « fantômes » frappent les aventuriers au démarrage suivant).
  function setCombat(v) {
    aiToken++;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    aiRunning = false;
    // Purge les animations en attente du combat précédent : sinon des effets
    // résiduels (dégâts, coma, glissement de barre de PV) rejouent sur le
    // nouveau combat — d'autant que les aventuriers gardent le même iid.
    fxQueue = [];
    movePrefix = null;
    selectedIid = null;
    const fxEl = document.getElementById('combat-fx');
    if (fxEl) fxEl.innerHTML = '';
    Store.state[combatKey] = v;
  }
  // Abandonne un combat illisible et revient à sa scène (pour le relancer à neuf).
  function discardCombat() {
    const wasSession = combatKey === 'combat' && Store.state.sessionCombat;
    setCombat(null);
    Store.state.sessionCombat = null;
    Store.save();
    if (wasSession && global.Session && Session.renderPlay) {
      const advId = (global.Shell && Shell.getAdventureId) ? Shell.getAdventureId() : null;
      rootSel = '#combat-root';
      try { Session.renderPlay(advId); } catch (e) { console.error('[combat] renderPlay', e); }
    } else { render(); }
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
    // Armes équipées → attaques (avec effets) + attaques spéciales ; armures → DEF
    const attacks = Combatants.monsterCombatAttacks(m);
    // BLINDAGE X : charges de blindage initiales (ignore X sources de dégâts)
    const armorT = (m.talents || []).find(function (t) { return t.trigger === 'armor_charges'; });
    return {
      iid: 'M' + i + '-' + m.id.slice(-4),
      side: 'monster', templateId: m.id, name: m.name,
      maxPv: m.pv, pv: m.pv,
      def: Combatants.monsterTotalDef(m), damage: m.damage, xp: m.xp, type: m.type,
      menace: m.menace, esquive: !!m.esquive, rapide: !!m.rapide, socle: m.socle,
      attacks: attacks, attackUses: initUses(attacks),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false },
      blindageCharges: armorT ? (armorT.charges || 0) : 0,
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
    // Numérotation globale par template : on compte d'abord le total d'exemplaires
    // de chaque adversaire sur tout le combat (toutes zones confondues), puis on
    // numérote en continu — sans « # » et indépendamment de la zone, car un
    // adversaire peut changer de zone (« Répurgateur 2 »).
    const totalByTpl = {};
    (cfg.zones || []).forEach(function (z) {
      (z.monsterRefs || []).forEach(function (ref) {
        totalByTpl[ref.monsterId] = (totalByTpl[ref.monsterId] || 0) + (ref.count || 1);
      });
    });
    const seqByTpl = {};
    let mi = 0;
    (cfg.zones || []).forEach(function (z, zi) {
      (z.monsterRefs || []).forEach(function (ref) {
        const tpl = Store.state.monsters.find(function (m) { return m.id === ref.monsterId; });
        if (!tpl) return;
        const count = ref.count || 1;
        for (let k = 0; k < count; k++) {
          const inst = instFromMonster(tpl, mi++);
          seqByTpl[tpl.id] = (seqByTpl[tpl.id] || 0) + 1;
          if (totalByTpl[tpl.id] > 1) inst.name = tpl.name + ' ' + seqByTpl[tpl.id];
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
    c.lootResults = finalize ? rollLoot(c) : [];
    c.finished = true;
    pendingAttack = null; pendingMove = null; stateMenuFor = null;
    Store.save();
    renderSummary();
  }

  // Tirage du butin sur les adversaires vaincus
  function rollLoot(c) {
    const out = [];
    c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'coma'; }).forEach(function (m) {
      const tpl = Store.state.monsters.find(function (t) { return t.id === m.templateId; });
      if (!tpl) return;
      const killer = m.killedBy ? c.combatants.find(function (x) { return x.iid === m.killedBy; }) : null;
      const killerName = (killer && killer.side === 'hero') ? killer.name : null;
      const killerHeroId = (killer && killer.side === 'hero') ? killer.templateId : null;
      // Équipement de l'adversaire → au tueur
      (tpl.equipment || []).forEach(function (r) {
        if (!r.itemId) return;
        if (Math.random() * 100 < (r.loot != null ? r.loot : 0)) {
          const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
          if (it) out.push({ itemId: r.itemId, name: it.name, qty: 1, toName: killerName, toHeroId: killerHeroId });
        }
      });
      // Butin → au tueur (à défaut au groupe)
      (tpl.loot || []).forEach(function (r) {
        if (!r.itemId) return;
        if (Math.random() * 100 < (r.loot != null ? r.loot : 0)) {
          const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
          if (it) out.push({ itemId: r.itemId, name: it.name, qty: r.qty || 1, toName: killerName, toHeroId: killerHeroId });
        }
      });
    });
    return out;
  }

  // Quitte réellement le combat (après l'écran de résumé) et reprend l'aventure
  function finishCombat() {
    const c = combat();
    if (!c) return;
    const isSession = combatKey === 'combat';
    const sessionCtx = isSession ? (Store.state.sessionCombat || null) : null;
    const outcomeLabel = c.outcome || null;
    // L'XP des adversaires tués est toujours accordée, même en cas de défaite
    const gained = totalXp();
    if (!isSession) Store.state.party.xp = (Store.state.party.xp || 0) + gained;
    // Butin récupéré : ajouté à l'inventaire du groupe (combat d'aventure uniquement)
    const loot = (isSession && c.lootResults) ? c.lootResults : [];
    loot.forEach(function (L) {
      const it = Store.state.items.find(function (x) { return x.id === L.itemId; });
      if (it) it.qty = (it.qty || 0) + L.qty;
    });
    if (isSession) persistHeroPv();
    setCombat(null);
    if (isSession) Store.state.sessionCombat = null;
    Store.save();
    // Sortie du combat EN PREMIER : on ne doit jamais rester bloqué sur l'écran
    // de résumé si un rafraîchissement secondaire (roster, progression) échoue.
    if (sessionCtx && sessionCtx.sessionId) {
      window.dispatchEvent(new CustomEvent('adventure-combat-end', {
        detail: { sessionId: sessionCtx.sessionId, outcome: outcomeLabel, xp: gained,
          loot: loot.map(function (L) { return { itemId: L.itemId, qty: L.qty, toHeroId: L.toHeroId }; }) }
      }));
    } else {
      rootSel = '#combat-root';
      render();
    }
    // Rafraîchissements secondaires, isolés (ne doivent pas bloquer la reprise)
    try {
      if (window.Combatants) { Combatants.renderProgress(); Combatants.renderHeroes(); }
    } catch (e) { console.error('[combat] rafraîchissement post-combat', e); }
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
  function doMove(c, zi, silent) {
    const from = c.zone;
    if (c.side === 'hero') {
      const enemiesHere = combat().combatants.filter(function (x) { return x.side === 'monster' && x.status === 'active' && x.zone === from; });
      const otherAllies = combat().combatants.filter(function (x) { return x.side === 'hero' && x.status === 'active' && x.zone === from && x.iid !== c.iid; });
      if (enemiesHere.length && !otherAllies.length) {
        enemiesHere.forEach(function (m) { if (c.status === 'active') dchocFrom(m, c, 'move'); });
      }
    }
    c.used.move = true;
    if (c.status !== 'active') return; // tombé au coma en partant
    c.zone = zi;
    pushFx({ type: 'move', iid: c.iid });
    if (!silent) log(cname(c) + ' se déplace <span class="lstate">' + esc(zname(zi)) + '</span>.', 'move');
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
  // Nom coloré pour le journal : aventurier selon sa classe, adversaire selon son type.
  function cname(c) {
    if (!c) return '<span class="lwho">?</span>';
    if (c.side === 'hero') {
      return '<span class="lwho lhero' + (c.klass ? ' klass-' + slug(c.klass) : '') + '">' + esc(c.name) + '</span>';
    }
    return '<span class="lwho lfoe' + (c.type ? ' type-' + c.type : '') + '">' + esc(c.name) + '</span>';
  }

  // ---------- Résolution d'une attaque ----------
  // Attaque d'opportunité d'un adversaire (sauf affaibli/coma).
  // reason : 'distance' (le héros tire à distance dans la zone) ou 'move'
  // (le héros quitte une zone occupée).
  function dchocFrom(monster, hero, reason) {
    if (monster.status !== 'active' || monster.states.affaibli) return 0;
    const dmg = monster.damage || 0;
    if (dmg <= 0) return 0;
    const pvBefore = hero.pv;
    hero.pv = Math.max(0, hero.pv - dmg);
    hero.dmgTaken += dmg; monster.dmgDealt += dmg;
    pushFx({ type: 'hit', iid: hero.iid, amount: dmg, fromPct: pct(pvBefore, hero.maxPv), toPct: pct(hero.pv, hero.maxPv) });
    const why = reason === 'distance'
      ? 'car il utilise une <i>arme à distance</i> dans sa zone'
      : 'car il quitte sa zone';
    log('<b class="lopp">Attaque d\'Opportunité !</b> ' + cname(monster) + ' inflige ' + amt(dmg, 'dmg') +
      ' Dégâts à ' + cname(hero) + ' ' + why + '.', 'dchoc');
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
      log(cname(target) + ' utilise Onde et ignore <span class="lstate">' + stateLabel(ignored) + '</span>.', 'state');
    }
    list.forEach(function (s) {
      target.states[s] = true;
      log(cname(target) + ' subit <span class="lstate">' + stateLabel(s) + '</span>.', 'state');
    });
    if (list.length) pushFx({ type: 'state', iid: target.iid });
  }

  function resolveAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
    // Dégâts-choc : tirer à distance avec des adversaires dans sa propre zone
    if (atk.range === 'distance' && attacker.side === 'hero') {
      enemyZoneMates(attacker).forEach(function (m) { dchocFrom(m, attacker, 'distance'); });
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
      // BLINDAGE X : consomme une charge pour ignorer cette source de dégâts.
      if (!negated && target.blindageCharges > 0) {
        negated = true; target.blindageCharges -= 1;
        reason = 'Blindage' + (target.blindageCharges > 0 ? ' (' + target.blindageCharges + ' restante' + (target.blindageCharges > 1 ? 's' : '') + ')' : ' épuisé');
      }
    }

    // Décomposition : dés d'attaque + bonus de Dégâts (Dé + Dé + Dégâts)
    const dmgTerm = dmg > 0 ? '<span class="dplus">+</span><span class="dnum d-dmg" title="Dégâts">' + dmg + '</span>' : '';
    const diceStr = '<span class="ldice">(' + diceSeq(res.dice) + dmgTerm + ')</span>';
    const label = '<span class="lwpn">' + nm(attackLabel(atk)) + '</span>';
    // Fusionne un déplacement effectué dans la même action (« se déplace … et attaque … »).
    let movePfx = '';
    if (movePrefix && movePrefix.iid === attacker.iid) {
      movePfx = ' se déplace <span class="lstate">' + esc(movePrefix.zone) + '</span> et';
      movePrefix = null;
    }
    if (res.echec) {
      log(cname(attacker) + movePfx + ' attaque ' + cname(target) + ' avec ' + label +
        ' ' + diceStr + ' — <span class="lfail">Échec</span>.', 'attack');
      pushFx({ type: 'miss', iid: target.iid, text: 'ÉCHEC', center: true });
      return;
    }
    if (negated) {
      log(cname(attacker) + movePfx + ' attaque ' + cname(target) +
        ' mais l’attaque est annulée (<span class="lstate">' + reason + '</span>).', 'attack');
      pushFx({ type: 'miss', iid: target.iid, text: reason });
      return;
    }

    const pvBefore = target.pv;
    if (res.pvLost > 0) { target.pv = Math.max(0, target.pv - res.pvLost); target.dmgTaken += res.pvLost; attacker.dmgDealt += res.pvLost; }
    if (res.pvHealed > 0) target.pv = Math.min(target.maxPv, target.pv + res.pvHealed);
    const fromPct = pct(pvBefore, target.maxPv), toPct = pct(target.pv, target.maxPv);
    if (res.pvLost > 0) pushFx({ type: res.critique ? 'crit' : 'hit', iid: target.iid, amount: res.pvLost, fromPct: fromPct, toPct: toPct });
    else if (res.critique) pushFx({ type: 'crit', iid: target.iid, amount: 0, fromPct: fromPct, toPct: toPct });
    if (res.pvHealed > 0) pushFx({ type: 'heal', iid: target.iid, amount: res.pvHealed, fromPct: fromPct, toPct: toPct });
    log(cname(attacker) + movePfx + ' attaque ' + cname(target) + ' avec ' + label +
        (res.critique ? ' <span class="lcrit">CRITIQUE&nbsp;!</span>' : '') + ' ' + diceStr + ' : ' +
        (res.pvLost > 0 ? amt(res.pvLost, 'dmg') + ' Dégâts infligés !' : 'aucun dégât.'),
        res.critique ? 'crit' : 'attack');
    applyStates(attacker, target, atk);
    checkMonsterTalents(target, res.pvLost);
    if (target.side === 'monster' && target.pv <= 0 && !target.killedBy) target.killedBy = attacker.iid;
    checkComa(target);
  }

  function hasEffect(atk) { return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu); }

  function checkComa(c) {
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      pushFx({ type: 'faint', iid: c.iid, side: c.side, name: c.name });
      log(c.side === 'monster'
        ? (cname(c) + ' <span class="lvanq">est vaincu !</span>')
        : (cname(c) + ' <span class="lcoma">tombe dans le coma…</span>'),
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
        pushFx({ type: 'flee', iid: target.iid });
        log(cname(target) + ' prend la fuite ! (talent : reçu ' + amt(pvLost, 'dmg') + ' ≥ ' + t.threshold + ')', 'turn');
      }
    });
  }

  // Talent (objet) d'un combattant adverse pour un déclencheur donné, ou null
  function monsterTalent(c, trigger) {
    if (!c || c.side !== 'monster') return null;
    const tpl = Store.state.monsters.find(function (m) { return m.id === c.templateId; });
    if (!tpl || !Array.isArray(tpl.talents)) return null;
    return tpl.talents.find(function (t) { return t.trigger === trigger; }) || null;
  }

  // Retourne le bonus de dégâts (talents de l'attaquant + soutien de zone)
  function getTalentDmgBonus(attacker, target) {
    if (attacker.side !== 'monster') return 0;
    const tpl = Store.state.monsters.find(function (m) { return m.id === attacker.templateId; });
    let bonus = 0;
    // SOUTIEN : chaque adversaire « soutien » présent dans la zone de l'attaquant ajoute +X.
    combat().combatants.forEach(function (c) {
      if (c.side !== 'monster' || c.status !== 'active' || c.zone !== attacker.zone) return;
      const st = monsterTalent(c, 'zone_support');
      const x = st ? (st.bonus || 0) : 0;
      if (x > 0) {
        bonus += x;
        log(cname(attacker) + ' gagne <span class="atk-dmg">+' + x + '</span> dégâts (Soutien).', 'state');
      }
    });
    if (!tpl || !Array.isArray(tpl.talents)) return bonus;
    tpl.talents.forEach(function (t) {
      if (t.trigger === 'ally_contact_bonus') {
        const allies = combat().combatants.filter(function (c) {
          return c.side === 'monster' && c.iid !== attacker.iid && c.status === 'active' &&
                 c.zone === target.zone;
        });
        if (allies.length > 0) {
          const b = allies.length * (t.bonus || 1);
          bonus += b;
          log(cname(attacker) + ' gagne <span class="atk-dmg">+' + b + '</span> dégâts (talent : ' +
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
      // Les usages d'attaque sont « par tour » : on les réarme à chaque tour
      c.attackUses = initUses(c.attacks);
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
  // Activation d'un seul adversaire (choix de cible + attaque/déplacement)
  function actOneMonster(m) {
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
      let moved = false;
      if (target && !m.used.move) {
        m.zone = target.zone; m.used.move = true; moved = true;
        pushFx({ type: 'move', iid: m.iid });
      }
      // LENT : un adversaire qui s'est déplacé ne peut plus attaquer ce tour.
      if (moved && monsterTalent(m, 'slow')) {
        log(cname(m) + ' se déplace <span class="lstate">' + esc(zname(m.zone)) + '</span> mais est <span class="lstate">Lent</span> : pas d\'attaque.', 'state');
      } else if (target && target.zone === m.zone) {
        // Fusionne déplacement + attaque sur une seule ligne du journal.
        if (moved) movePrefix = { iid: m.iid, zone: zname(m.zone) };
        applyAttack(m, contactIdx, target);
      } else if (moved) {
        log(cname(m) + ' se déplace <span class="lstate">' + esc(zname(m.zone)) + '</span>.', 'move');
      }
    }
  }

  // Ordre d'activation des adversaires : Sbire → Alpha → Solitaire → Boss,
  // puis par numéro (#1, #2…) pour les exemplaires multiples.
  const ACT_RANK = { standard: 0, alpha: 1, solitaire: 2, boss: 3 };
  function actRank(t) { return ACT_RANK.hasOwnProperty(t) ? ACT_RANK[t] : 9; }
  function monsterNum(name) { const r = / (\d+)$/.exec(name || ''); return r ? parseInt(r[1], 10) : 0; }
  function activationOrder() {
    return activeOf('monster').slice().sort(function (a, b) {
      return actRank(a.type) - actRank(b.type) || monsterNum(a.name) - monsterNum(b.name);
    });
  }

  // Version synchrone (auto-combat, abandon) : tous les adversaires agissent d'un coup
  function monstersActCore() {
    activationOrder().forEach(actOneMonster);
    checkOutcome();
  }

  // Version séquencée (UI) : chaque adversaire agit l'un après l'autre, avec un
  // re-rendu entre chaque pour qu'on voie distinctement qui joue. onDone() est
  // appelé quand toute la vague a agi (ou que le combat est résolu).
  const AI_STEP_MS = 550;
  function monstersActSequential(onDone) {
    const order = activationOrder();
    const myToken = aiToken; // si le combat change, cette séquence est abandonnée
    let i = 0;
    aiRunning = true;
    aiTimer = null;
    function finish() { aiRunning = false; aiTimer = null; checkOutcome(); if (onDone) onDone(); }
    function step() {
      if (myToken !== aiToken) return; // combat (ré)assigné : on abandonne sans agir
      if (combat().outcome) { finish(); return; }
      if (i >= order.length) { finish(); return; }
      const m = order[i++];
      if (m.status !== 'active' || m.used.action || m.states.auSol) { step(); return; }
      actOneMonster(m);
      checkOutcome();
      Store.save();
      render(); // joue les animations de cette activation
      if (combat().outcome) { finish(); return; }
      aiTimer = setTimeout(step, AI_STEP_MS);
    }
    step();
  }


  function monsterAI() {
    if (aiRunning) return;
    monstersActSequential(function () { Store.save(); render(); });
  }

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
        log(cname(m) + ' subit ' + amt(v, 'dmg') + ' (Feu ⬛) avant de fuir.', 'state');
        if (m.pv <= 0) { checkComa(m); return; }
      }
      m.status = 'fled';
      log(cname(m) + ' fuit le combat (talent : fuite après le tour ' + after + ').', 'turn');
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
    if (aiRunning) return;
    // Avertissement : des aventuriers n'ont encore rien fait ce tour
    const idle = activeOf('hero').filter(function (h) { return !h.used.action && !h.used.move && !h.used.object; });
    if (idle.length) {
      const names = idle.map(function (h) { return h.name; }).join(', ');
      if (!confirm('⚠️ ' + names + ' n\'a/n\'ont pas encore agi ce tour.\nLancer quand même le tour des adversaires ?')) return;
    }
    pendingAttack = null; stateMenuFor = null;
    const c = combat();
    c.phase = 'monsters';
    log('Tour des adversaires.', 'turn');
    Store.save(); render(); // affiche le passage en phase « adversaires »
    monstersActSequential(function () {
      if (combat().outcome) { Store.save(); render(); return; }
      doFlee();
      if (combat().outcome) { Store.save(); render(); return; }
      advanceTurn();
      Store.save(); render();
    });
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
  // ---------- Animations de combat ----------
  // Effets transitoires, non bloquants : on empile des évènements au moment où
  // l'action se résout (dégâts, critique, raté, soin, état, déplacement), puis
  // on les joue après le re-rendu, en retrouvant les cartes par data-iid.
  // 100 % CSS (transform/opacity), auto-nettoyés, sans incidence sur le rythme.
  let fxQueue = [];
  function pushFx(ev) { if (ev) fxQueue.push(ev); }
  function pct(pv, max) { return Math.max(0, Math.min(100, Math.round((pv / (max || 1)) * 100))); }
  function reduceMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function fxLayer() {
    let el = document.getElementById('combat-fx');
    if (!el) { el = document.createElement('div'); el.id = 'combat-fx'; document.body.appendChild(el); }
    return el;
  }
  // Rect d'ancrage : la carte du combattant si présente, sinon sa zone, sinon le plateau
  function fxAnchor(iid) {
    const root = $(rootSel); if (!root) return null;
    const card = root.querySelector('.combat-card[data-iid="' + iid + '"]');
    if (card) return { rect: card.getBoundingClientRect(), card: card };
    const c = byId(iid);
    if (c) { const z = root.querySelector('#zone-cards-' + c.zone); if (z) return { rect: z.getBoundingClientRect(), card: null }; }
    return { rect: root.getBoundingClientRect(), card: null };
  }
  function floatText(rect, text, cls) {
    const span = document.createElement('span');
    span.className = 'fx-float ' + cls;
    span.textContent = text;
    span.style.left = (rect.left + rect.width / 2) + 'px';
    span.style.top = (rect.top + Math.min(30, rect.height * 0.3)) + 'px';
    fxLayer().appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); }, { once: true });
  }
  // Gros texte au centre de l'écran (échec, critique, coma d'un aventurier)
  function centerText(text, cls) {
    const el = document.createElement('div');
    el.className = 'fx-center ' + cls;
    el.textContent = text;
    fxLayer().appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); }, { once: true });
  }
  function cardAnim(card, cls) {
    if (!card) return;
    card.classList.remove(cls);
    void card.offsetWidth; // reflow pour rejouer si la classe est encore là
    card.classList.add(cls);
    card.addEventListener('animationend', function () { card.classList.remove(cls); }, { once: true });
  }
  // Fait glisser la barre de PV de l'ancien % vers le nouveau
  function pvGlide(card, fromPct, toPct) {
    if (!card || fromPct == null) return;
    const fill = card.querySelector('.pv-fill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = fromPct + '%';
    void fill.offsetWidth; // reflow
    requestAnimationFrame(function () {
      fill.style.transition = 'width .7s ease';
      fill.style.width = toPct + '%';
    });
  }
  // Fondu d'un adversaire vaincu : sa carte ayant disparu de la zone, on en
  // recrée un clone fantôme dans la couche d'effets, calé sur sa zone, qui se
  // désature et s'efface.
  function spawnGhostFade(iid) {
    const c = byId(iid);
    if (!c) return;
    const root = $(rootSel); if (!root) return;
    const zoneBox = root.querySelector('#zone-cards-' + c.zone) || root;
    const rect = zoneBox.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'fx-ghost';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = Math.min(rect.width, 300) + 'px';
    try { ghost.innerHTML = renderCard(c); } catch (e) { ghost.textContent = c.name || ''; }
    fxLayer().appendChild(ghost);
    ghost.addEventListener('animationend', function () { ghost.remove(); }, { once: true });
  }

  function flushFx() {
    if (!fxQueue.length) return;
    const q = fxQueue; fxQueue = [];
    if (reduceMotion()) return; // animations coupées : on vide sans jouer
    q.forEach(function (ev) {
      const a = fxAnchor(ev.iid);
      if (!a) return;
      switch (ev.type) {
        case 'hit':
          cardAnim(a.card, 'fx-hit');
          floatText(a.rect, '-' + ev.amount, 'fx-dmg');
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'crit':
          cardAnim(a.card, 'fx-crit');
          if (ev.amount > 0) floatText(a.rect, '-' + ev.amount, 'fx-dmg fx-dmg-crit');
          centerText('CRITIQUE !', 'fx-center-crit'); // gros texte central
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'miss':
          cardAnim(a.card, 'fx-whiff');
          if (ev.center) centerText(ev.text || 'ÉCHEC', 'fx-center-fail');
          else floatText(a.rect, ev.text || 'Raté', 'fx-miss');
          break;
        case 'heal':
          cardAnim(a.card, 'fx-heal');
          floatText(a.rect, '+' + ev.amount, 'fx-heal-txt');
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'state':
          cardAnim(a.card, 'fx-state');
          break;
        case 'move':
          cardAnim(a.card, 'fx-move');
          break;
        case 'faint':
          // Adversaire vaincu : fondu fantôme + annonce centrale « <Nom> est vaincu ! ».
          // Aventurier : il reste affiché (grisé) dans sa zone ; coma annoncé au centre.
          if (ev.side === 'monster') {
            spawnGhostFade(ev.iid);
            centerText((ev.name || 'Un adversaire') + ' est vaincu !', 'fx-center-foe');
          } else {
            centerText((ev.name || 'Un aventurier') + ' tombe dans le coma !', 'fx-center-coma');
          }
          break;
        case 'flee':
          spawnGhostFade(ev.iid);
          floatText(a.rect, 'En fuite', 'fx-miss');
          break;
      }
    });
  }

  function render() {
    const root = $(rootSel);
    if (!root) return;
    try {
      if (!combat()) { renderSetup(root); }
      else if (combat().finished) { renderSummary(); }
      else { renderBoard(root); }
    } catch (e) {
      // Dernier filet : ne jamais laisser un module de combat totalement vide.
      console.error('[combat] render', e);
      root.innerHTML = '<div class="card"><div class="card-head"><h3>Combat</h3></div>' +
        '<p class="empty">Affichage du combat momentanément indisponible.</p>' +
        '<div class="modal-actions"><button id="combat-recover" class="primary">Réessayer l\'affichage</button></div></div>';
      const b = document.getElementById('combat-recover');
      if (b) b.addEventListener('click', function () { render(); });
    }
  }

  // Écran de résumé de fin de combat
  function renderSummary() {
    const root = $(rootSel);
    if (!root) return;
    const c = combat();
    const OUT = { victory: 'VICTOIRE', minor: 'VICTOIRE MINEURE', defeat: 'DÉFAITE' };
    const ICON = { victory: '🏆', minor: '🥉', defeat: '💀' };
    const out = c.outcome || 'end';
    const killed = c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'coma'; });
    const fled = c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'fled'; });
    const xp = totalXp(); // XP des adversaires tués (accordée même en défaite)
    // Tableau des combattants : aventuriers puis adversaires ayant agi/subi
    const parts = c.combatants.filter(function (x) { return x.side === 'hero' || x.dmgDealt > 0 || x.dmgTaken > 0; });
    parts.sort(function (a, b) { return (a.side === 'hero' ? 0 : 1) - (b.side === 'hero' ? 0 : 1) || b.dmgDealt - a.dmgDealt; });
    function statRows() {
      return parts.map(function (x) {
        return '<div class="cs-stat-row ' + (x.side === 'hero' ? 'is-hero' : 'is-foe') + '">' +
          '<span class="cs-name">' + (x.side === 'hero' ? '🛡️' : '⚔️') + ' ' + esc(x.name) + '</span>' +
          '<span class="cs-val cs-dealt" title="Dégâts infligés">' + x.dmgDealt + '</span>' +
          '<span class="cs-val cs-taken" title="Dégâts subis">' + x.dmgTaken + '</span>' +
        '</div>';
      }).join('');
    }
    function chips(list) { return list.map(function (x) { return '<span class="cs-chip">' + esc(x.name) + '</span>'; }).join(''); }

    root.innerHTML = '<div class="combat-summary cs-' + out + '">' +
      '<div class="cs-banner"><span class="cs-icon">' + (ICON[out] || '⚔️') + '</span>' +
        '<span class="cs-title">' + (OUT[out] || 'COMBAT TERMINÉ') + '</span></div>' +
      '<div class="cs-xpbig"><span class="cs-xpnum">+' + xp + '</span><span class="cs-xplbl">XP gagnée</span></div>' +
      '<div class="cs-statcard">' +
        '<div class="cs-stat-head"><span class="cs-name">Combattant</span>' +
          '<span class="cs-val">⚔️ Infligés</span><span class="cs-val">🩸 Subis</span></div>' +
        statRows() +
      '</div>' +
      ((c.lootResults && c.lootResults.length)
        ? '<div class="cs-group cs-lootg"><div class="cs-glabel">🎁 Butin récupéré</div><div class="cs-chips">' +
            c.lootResults.map(function (L) {
              return '<span class="cs-chip">' + esc(L.name) + (L.qty > 1 ? ' ×' + L.qty : '') +
                (L.toName ? ' <em>→ ' + esc(L.toName) + '</em>' : ' <em>(groupe)</em>') + '</span>';
            }).join('') + '</div></div>'
        : '') +
      (killed.length ? '<div class="cs-group cs-killed"><div class="cs-glabel">💀 Adversaires détruits</div><div class="cs-chips">' + chips(killed) + '</div></div>' : '') +
      (fled.length ? '<div class="cs-group cs-fledg"><div class="cs-glabel">🏃 Adversaires en fuite</div><div class="cs-chips">' + chips(fled) + '</div></div>' : '') +
      (c.healLines && c.healLines.length
        ? '<div class="cs-group cs-healg"><div class="cs-glabel">✚ Aventuriers ranimés</div><div class="cs-chips">' +
            c.healLines.map(function (h) { return '<span class="cs-chip">' + esc(h.name) + ' · ' + h.pv + ' PV</span>'; }).join('') + '</div></div>'
        : '') +
      '<button class="primary big cs-continue-btn" id="cs-continue">Continuer l\'aventure →</button>' +
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

  // Couleur de bordure d'une zone selon ses occupants
  const ZTYPE_RANK = { boss: 4, solitaire: 3, alpha: 2, standard: 1 };
  function zoneColorClass(zi) {
    const here = combat().combatants.filter(function (c) { return c.zone === zi && c.status === 'active'; });
    if (here.some(function (c) { return c.side === 'hero'; })) return 'ztype-heroes';
    const mons = here.filter(function (c) { return c.side === 'monster'; });
    if (!mons.length) return '';
    let best = mons.reduce(function (a, b) { return (ZTYPE_RANK[b.type] || 0) > (ZTYPE_RANK[a.type] || 0) ? b : a; });
    return 'ztype-' + (best.type === 'standard' ? 'sbire' : best.type);
  }

  // ---------- Plateau de combat ----------
  function renderBoard(root) {
    const c = combat();
    // Filet anti-blocage : un combat sans aucun combattant (données perdues /
    // incompatibles) n'affiche pas un plateau vide mais une issue de secours.
    const liveHeroes = c.combatants.filter(function (x) { return x.side === 'hero'; }).length;
    if (!c.combatants.length || !liveHeroes) {
      root.innerHTML = '<div class="card"><div class="card-head"><h3>Combat</h3></div>' +
        '<p class="empty">Ce combat ne contient aucun aventurier affichable (données perdues ou incompatibles entre appareils).</p>' +
        '<div class="modal-actions"><button id="combat-discard" class="primary">Quitter ce combat</button></div></div>';
      const b = document.getElementById('combat-discard');
      if (b) b.addEventListener('click', discardCombat);
      return;
    }
    // Auto-réparation des zones : un combat persisté pouvait avoir des `zone`
    // hors limites ou d'un mauvais type (chaîne, NaN) → aucun combattant ne
    // correspondait à une zone et le plateau restait vide. On garantit ici une
    // zone entière valide pour chacun.
    const zc = zoneCount();
    c.combatants.forEach(function (x) {
      let z = parseInt(x.zone, 10);
      x.zone = (isNaN(z) || z < 0 || z >= zc) ? 0 : z;
    });
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
      // Journal compact, en haut : 3 lignes visibles max, scrollable au-delà.
      '<div id="combat-log" class="combat-log compact"></div>' +
      '<div id="combat-actionbar" class="combat-actionbar"></div>' +
      '<div class="combat-zones-grid zc-' + zoneCount() + '">' +
        zones().map(function (z, zi) {
          return '<div class="combat-zone ' + zoneColorClass(zi) + (pendingMove ? ' movable' : '') + '" data-zone="' + zi + '">' +
            '<div class="zone-name">' + esc(zname(zi)) + '</div>' +
            '<div class="zone-cards" id="zone-cards-' + zi + '"></div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div id="combat-cemetery" class="combat-cemetery"></div>' +
      '<div class="phase-controls" id="phase-controls"></div>';

    // Chaque phase de rendu est isolée : un incident dans l'une ne doit jamais
    // laisser le plateau, les contrôles ou le journal entièrement vides.
    let zonesErr = null;
    // Bandeau d'action AVANT les zones : ses boutons (data-iid) doivent exister
    // quand wireCard (appelé dans renderZones) les câble.
    try { renderActionBar(); } catch (e) { console.error('[combat] renderActionBar', e); }
    try { renderZones(); } catch (e) { zonesErr = e; console.error('[combat] renderZones', e); }
    try { renderPhaseControls(); } catch (e) { console.error('[combat] renderPhaseControls', e); }
    try { renderLog(); } catch (e) { console.error('[combat] renderLog', e); }

    // Catch-all : si AUCUNE carte de combattant n'a pu être affichée alors qu'il
    // y a des combattants, on ne laisse pas un plateau vide injouable. On montre
    // une issue de secours + un diagnostic détaillé (cause exacte).
    if (!root.querySelector('.combat-card')) {
      const sides = c.combatants.reduce(function (a, x) { a[x.side] = (a[x.side] || 0) + 1; return a; }, {});
      const placements = c.combatants.map(function (x) { return (String(x.side || '?').charAt(0)) + x.zone + (x.status && x.status !== 'active' ? '×' : ''); }).join(' ');
      const boxes = root.querySelectorAll('[id^="zone-cards-"]').length;
      const diag = c.combatants.length + ' combattants (av:' + (sides.hero || 0) + ' adv:' + (sides.monster || 0) +
        ') · zones:' + zoneCount() + ' · conteneurs:' + boxes + ' · placements:[' + placements + ']' +
        (zonesErr ? ' · ERREUR: ' + (zonesErr.message || zonesErr) : '');
      root.innerHTML = '<div class="card"><div class="card-head"><h3>Combat</h3></div>' +
        '<p class="empty">Impossible d\'afficher les combattants de ce combat sur cet appareil.</p>' +
        '<p class="hint" style="word-break:break-word">' + esc(diag) + '</p>' +
        '<div class="modal-actions"><button id="combat-discard" class="primary">Quitter ce combat</button></div></div>';
      const db = document.getElementById('combat-discard');
      if (db) db.addEventListener('click', discardCombat);
      return;
    }

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
    const ca = $('#cancel-analyze');
    if (ca) ca.addEventListener('click', function () { pendingAnalyze = null; render(); });

    // Déplacement : cliquer une zone y envoie le combattant en cours de mouvement
    root.querySelectorAll('.combat-zone').forEach(function (zEl) {
      zEl.addEventListener('click', function (e) {
        if (!pendingMove) return;
        if (e.target.closest('button') || e.target.closest('.atk-row')) return;
        moveCombatant(pendingMove, parseInt(zEl.getAttribute('data-zone'), 10));
      });
    });

    // Joue les animations en attente (dégâts, critique, raté, soin, déplacement…)
    try { flushFx(); } catch (e) { fxQueue = []; }
  }

  // Contenu de la bannière de ciblage / déplacement (toujours présente : pas de saut d'UI)
  function bannerHtml() {
    if (pendingAnalyze) {
      const an = byId(pendingAnalyze);
      return '🔍 <b>' + esc(an ? an.name : '') + '</b> analyse — <b>clique l\'adversaire à examiner</b>. ' +
        '<button id="cancel-analyze" class="ghost xs">Annuler</button>';
    }
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
  function baseName(n) { return (n || '').replace(/\s+\d+$/, ''); }

  // Rendu protégé d'une carte : si un combattant corrompu fait planter renderCard,
  // on affiche une carte minimale au lieu de laisser tout le plateau vide.
  function safeCard(c) {
    try { return renderCard(c); }
    catch (e) {
      console.error('[combat] renderCard a échoué pour', c && c.iid, c, e);
      return '<div class="combat-card side-' + ((c && c.side) || 'hero') + '" data-iid="' + ((c && c.iid) || '') + '">' +
        '<div class="cc-head"><span class="roster-name">' + esc((c && c.name) || '?') + '</span>' +
        '<span class="tag dead">⚠</span></div>' +
        '<div class="cc-pvline"><div class="pv-bar"><div class="pv-fill" style="width:100%"></div>' +
        '<span class="pv-text">' + ((c && c.pv) || 0) + ' / ' + ((c && c.maxPv) || 0) + ' PV</span></div></div></div>';
    }
  }

  // Bandeau d'action au-dessus des zones : fiche horizontale du combattant
  // sélectionné (avatar, nom, PV, DEF, attaques d'arme, Mouv/Objet/Analyse,
  // puis 6 emplacements de talents — occupés par les attaques spéciales).
  function renderActionBar() {
    const box = $('#combat-actionbar');
    if (!box) return;
    const cmb = combat();
    let sel = selectedIid ? byId(selectedIid) : null;
    // Auto-sélection : en phase héros, défaut = 1er aventurier actif.
    if ((!sel || sel.status !== 'active') && cmb.phase === 'heroes' && !cmb.outcome) {
      const fh = activeOf('hero')[0];
      if (fh) { sel = fh; selectedIid = fh.iid; }
    }
    if (!sel) {
      box.className = 'combat-actionbar';
      box.innerHTML = '<div class="ab-empty">Clique un combattant pour afficher sa fiche et ses actions.</div>';
      return;
    }
    const c = sel;
    const dead = c.status !== 'active';
    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;
    const pct = Math.round((c.pv / c.maxPv) * 100);
    const canAct = !dead && !cmb.outcome && c.side === 'hero' && cmb.phase === 'heroes';
    const cls = ['ab-card', 'side-' + c.side];
    if (c.klass) cls.push('klass-' + slug(c.klass));
    if (isEnemy && c.type) cls.push('type-' + c.type);
    const initial = esc((c.name || '?').charAt(0).toUpperCase());
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');

    // Sépare attaques d'arme (boutons « Attaque » du haut) et spéciales (talents)
    const weaponAtks = [], specialAtks = [];
    (c.attacks || []).forEach(function (a, i) {
      (a.special ? specialAtks : weaponAtks).push({ a: a, i: i });
    });

    let html = '<div class="' + cls.join(' ') + '">' +
      '<div class="ab-avatar" aria-hidden="true">' + initial + '</div>' +
      '<div class="ab-id">' +
        '<div class="ab-name"><span class="roster-name">' + esc(c.name) + '</span>' +
          (c.klass ? '<span class="tag class-tag">' + esc(c.klass) + '</span>' : '') +
          (isEnemy && c.type ? '<span class="tag type">' + (Combatants.TYPE_LABEL[c.type] || c.type) + '</span>' : '') +
          (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
        '</div>' +
        '<div class="ab-pvline cc-pvline">' +
          '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div><span class="pv-text">' + pvText + '</span></div>' +
          (known ? '<span class="def-badge">🛡 ' + (c.states.auSol ? '0' : c.def) + '</span>' : '') +
          (known && c.blindageCharges > 0 ? '<span class="blindage-badge" title="Blindage">🛡✦ ' + c.blindageCharges + '</span>' : '') +
        '</div>' +
      '</div>';

    html += '<div class="ab-acts">';
    // Rangée des attaques d'arme (boutons de taille fixe, identique aux outils)
    html += '<div class="ab-attacks">' +
      (weaponAtks.length
        ? weaponAtks.map(function (w) { return abAttackBtn(c, w.a, w.i, canAct); }).join('')
        : '') +
      '</div>';
    // Rangée Mouv. / Objet / Analyse (aventuriers seulement)
    if (c.side === 'hero') html += abToolsHtml(c, canAct);
    // 6 emplacements de talents (3 colonnes × 2 lignes) — occupés par les spéciales
    html += abTalentsHtml(c, specialAtks, canAct);
    html += '</div>';

    html += '</div>';
    box.className = 'combat-actionbar active';
    box.innerHTML = html;
    // Les boutons (data-iid) seront câblés par wireCard lors de renderZones,
    // qui s'exécute juste après (le combattant sélectionné est dans une zone).
  }

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
      let html = heroes.length ? '<div class="hero-grid">' + heroes.map(safeCard).join('') + '</div>' : '';
      // La place occupée dépend de la TAILLE (et non plus du type) :
      //  • Moyen  → demi-largeur (grille)
      //  • Grand  → toute la largeur
      //  • Énorme → toute la largeur, sur deux lignes (carte plus haute)
      const sizeOf = function (m) { return (m.socle === 'large' || m.socle === 'huge') ? m.socle : 'medium'; };
      const meds = monsters.filter(function (m) { return sizeOf(m) === 'medium'; });
      const bigs = monsters.filter(function (m) { return sizeOf(m) !== 'medium'; });
      if (meds.length) html += '<div class="monster-grid">' + meds.map(safeCard).join('') + '</div>';
      bigs.forEach(function (m) { html += safeCard(m); });
      box.innerHTML = html || '<p class="empty zone-empty">Zone vide</p>';
      heroes.concat(monsters).forEach(function (c) {
        try { wireCard(c); } catch (e) { console.error('[combat] wireCard a échoué pour', c && c.iid, e); }
      });
    });
    renderCemetery();
  }

  // Cimetière : adversaires vaincus ou enfuis (compact, hors zones)
  function renderCemetery() {
    const box = $('#combat-cemetery');
    if (!box) return;
    const killed = combat().combatants.filter(function (c) { return c.side === 'monster' && c.status === 'coma'; });
    const fled = combat().combatants.filter(function (c) { return c.side === 'monster' && c.status === 'fled'; });
    if (!killed.length && !fled.length) { box.innerHTML = ''; return; }
    let html = '';
    if (killed.length) {
      html += '<div class="cem-row cem-killed"><span class="cem-label">☠ Cimetière</span>' +
        killed.map(function (c) { return '<span class="cem-chip">💀 ' + esc(c.name) + '</span>'; }).join('') + '</div>';
    }
    if (fled.length) {
      html += '<div class="cem-row cem-fled"><span class="cem-label">EN FUITE</span>' +
        fled.map(function (c) { return '<span class="cem-chip">' + esc(c.name) + '</span>'; }).join('') + '</div>';
    }
    box.innerHTML = html;
  }

  function statesBadges(c) {
    return Object.keys(STATE_META).filter(function (s) { return c.states[s]; })
      .map(function (s) {
        return '<span class="state-badge ' + (STATE_META[s].neg ? 'neg' : 'pos') + '" data-state="' + s + '" data-iid="' + c.iid + '">' +
          stateLabel(s) + ' ✕</span>';
      }).join('');
  }

  // Bouton d'attaque du bandeau d'action (arme ou spéciale logée en talent).
  // Pleine largeur, contenu riche : nom + portée + figurines de dés (+ Dégâts).
  // Conserve data-iid / data-atk : c'est wireCard qui le câble.
  function abAttackBtn(c, a, i, canAct, compact) {
    const usedA = c.used.action;
    const uses = (c.attackUses && c.attackUses[i] !== undefined) ? c.attackUses[i] : null;
    const depleted = uses === 0;
    const blocked = !canAct || depleted || (!a.freeAction && usedA);
    const isThisAtk = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average;
    const showDmg = a.useOwnDamage !== false && c.damage > 0 && !c.states.affaibli;
    const rangeBits = [(a.range === 'distance' ? '🏹 distance' : '⚔ contact')];
    if (a.targets === 'all') rangeBits.push('toutes');
    if (a.freeAction) rangeBits.push('gratuite');
    return '<button class="ab-atk atk-chip' + (isThisAtk ? ' selected' : '') + (compact ? ' ab-atk-compact' : '') +
        '" type="button" data-iid="' + c.iid + '" data-atk="' + i + '"' + (blocked ? ' disabled' : '') +
        ' title="' + esc(a.name) + '">' +
      '<span class="ab-atk-main">' +
        '<span class="ab-atk-name">' + esc(a.name) + '</span>' +
        '<span class="ab-atk-range">' + rangeBits.join(' · ') + '</span>' +
      '</span>' +
      '<span class="ab-atk-figs">' + Inventory.poolBadges(a.dice) +
        (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '') +
        (uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
      '</span>' +
    '</button>';
  }

  // Rangée Mouv. / Objet / Analyse : 3 boutons de largeur égale qui occupent,
  // à eux trois, la même largeur que le bouton d'attaque au-dessus.
  function abToolsHtml(c, canAct) {
    const usedO = c.used.object;
    const usedMv = c.used.move;
    const multi = zoneCount() > 1;
    return '<div class="ab-tools">' +
      '<button class="ab-tool move-chip do-move' + (pendingMove === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canAct || !multi || usedMv) ? ' disabled' : '') + ' title="Changer de zone">Mouv.</button>' +
      '<button class="ab-tool obj-chip do-object" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedO) ? ' disabled' : '') + ' title="Utiliser l\'objet équipé">Objet</button>' +
      '<button class="ab-tool ana-chip do-analyse' + (pendingAnalyze === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canAct || usedMv) ? ' disabled' : '') +
          ' title="Révèle DEF, Dégâts et XP de l\'adversaire ciblé">Analyse</button>' +
    '</div>';
  }

  // 6 emplacements de talents (3 colonnes × 2 lignes). Les attaques spéciales
  // occupent les premiers slots ; les restants sont des placeholders « Talent N ».
  function abTalentsHtml(c, specialAtks, canAct) {
    let h = '<div class="ab-talents">';
    for (let i = 0; i < 6; i++) {
      if (i < specialAtks.length) {
        h += abAttackBtn(c, specialAtks[i].a, specialAtks[i].i, canAct, true);
      } else {
        h += '<button class="ab-talent" type="button" disabled title="Emplacement de talent (à venir)">Talent ' + (i + 1) + '</button>';
      }
    }
    return h + '</div>';
  }

  function renderCard(c) {
    // Garde-fous : un combattant persisté incomplet ne doit jamais faire planter
    // le rendu (sinon tout le plateau disparaît). On comble les sous-objets requis.
    if (!c.states) c.states = { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false };
    if (!c.used) c.used = { action: false, move: false, object: false };
    if (!Array.isArray(c.attacks)) c.attacks = [];
    if (!Array.isArray(c.attackUses) || c.attackUses.length !== c.attacks.length) {
      c.attackUses = c.attacks.map(function (a) { return (a && a.uses && a.uses > 0) ? a.uses : null; });
    }
    const pct = Math.round((c.pv / c.maxPv) * 100);
    const dead = c.status !== 'active';
    const cls = ['combat-card', 'side-' + c.side];
    if (c.klass) cls.push('klass-' + c.klass.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (c.side === 'monster' && c.type) cls.push('type-' + c.type);
    if (c.side === 'monster' && (c.socle === 'large' || c.socle === 'huge')) cls.push('socle-' + c.socle);
    if (dead) cls.push('is-' + c.status);
    if (selectedIid === c.iid) cls.push('selected');
    // Cible valide pendant le ciblage au clic (attaque ou analyse)
    if (pendingAttack && !dead) {
      const attacker = byId(pendingAttack.iid);
      if (attacker && attacker.side !== c.side) cls.push('targetable');
    }
    if (pendingAnalyze && !dead && c.side === 'monster') cls.push('targetable');

    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;   // stats ennemies cachées avant Analyse
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');
    // Carte de zone = « bouton » épuré : nom + barre de PV (+ états / statut).
    // La classe, la DEF, le blindage, « Rapide », les pastilles et les attaques
    // ne s'affichent plus ici : tout cela figure dans le bandeau d'action
    // lorsque le combattant est sélectionné.
    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      '<div class="cc-head"><span class="roster-name">' + esc(c.name) + '</span>' +
        (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
      '</div>' +
      '<div class="cc-pvline">' +
        '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div>' +
          '<span class="pv-text">' + pvText + '</span></div>' +
      '</div>' +
      (statesBadges(c) ? '<div class="cc-states">' + statesBadges(c) + '</div>' : '');

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
      enemyZoneMates(attacker).forEach(function (m) { dchocFrom(m, attacker, 'distance'); });
    }
    if (attacker.status !== 'active') return;
    // Dégâts moyens = moyenne des dés de l'arme seulement (sans le bonus de dégâts)
    const avgDice = Math.round(avgDicePool(atk.dice));
    const def = target.states.auSol ? 0 : target.def;
    const pvLost = Math.max(0, avgDice - def);
    const label = '<span class="lwpn">' + nm(attackLabel(atk)) + '</span>';
    if (pvLost > 0) {
      const pvBefore = target.pv;
      target.pv = Math.max(0, target.pv - pvLost);
      target.dmgTaken += pvLost; attacker.dmgDealt += pvLost;
      pushFx({ type: 'hit', iid: target.iid, amount: pvLost, fromPct: pct(pvBefore, target.maxPv), toPct: pct(target.pv, target.maxPv) });
      checkMonsterTalents(target, pvLost);
    }
    let movePfx = '';
    if (movePrefix && movePrefix.iid === attacker.iid) {
      movePfx = ' se déplace <span class="lstate">' + esc(movePrefix.zone) + '</span> et';
      movePrefix = null;
    }
    log(cname(attacker) + movePfx + ' attaque ' + cname(target) + ' avec ' + label +
      ' <span class="lavg">(dégâts moyens)</span> : ' + amt(pvLost, 'dmg') + ' Dégâts infligés !', 'attack');
    if (target.side === 'monster' && target.pv <= 0 && !target.killedBy) target.killedBy = attacker.iid;
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

    // Clic sur une carte : cible l'action en cours si la carte est une cible
    // valide, sinon sélectionne ce combattant (sa fiche s'affiche dans le bandeau).
    if (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        const targetable = card.classList.contains('targetable');
        // 1) Ciblage d'une analyse
        if (targetable && pendingAnalyze && c.side === 'monster') {
          const hero = byId(pendingAnalyze);
          pendingAnalyze = null;
          if (!hero || hero.used.move) { render(); return; }
          c.analyzed = true; hero.used.move = true;
          log(cname(hero) + ' analyse ' + cname(c) + ' : DEF, Dégâts et XP révélés.', 'move');
          Store.save(); render(); return;
        }
        // 2) Ciblage d'une attaque
        if (targetable && pendingAttack) {
          const attacker = byId(pendingAttack.iid);
          if (!attacker) return;
          const atk = attacker.attacks[pendingAttack.atkIndex];
          if (atk && atk.range === 'contact' && attacker.zone !== c.zone) {
            if (attacker.used.move) { alert('Vous ne pouvez pas atteindre cet adversaire.'); return; }
            doMove(attacker, c.zone, true);
            if (attacker.status !== 'active') { pendingAttack = null; checkOutcome(); Store.save(); render(); return; }
            movePrefix = { iid: attacker.iid, zone: zname(attacker.zone) };
          }
          if (pendingAttack.average) execHeroAverageAttack(attacker, pendingAttack.atkIndex, c);
          else execHeroAttack(attacker, pendingAttack.atkIndex, c);
          return;
        }
        // 3) Sinon : sélectionne ce combattant et annule toute action en cours
        selectedIid = c.iid;
        pendingAttack = null; pendingAnalyze = null; pendingMove = null;
        render();
      });
    }

    // Retirer un état (clic sur un badge existant)
    root.querySelectorAll('.state-badge[data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        c.states[b.getAttribute('data-state')] = false; Store.save(); render();
      });
    });
    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active' && !combat().outcome) {
      // Action Analyser : arme l'analyse, puis on clique l'adversaire à examiner.
      // Consomme la même ressource que le mouvement (exclusivité mouvement/analyse).
      const anaBtn = root.querySelector('.do-analyse[data-iid="' + c.iid + '"]');
      if (anaBtn) anaBtn.addEventListener('click', function () {
        if (c.used.move) return;
        pendingAnalyze = (pendingAnalyze === c.iid) ? null : c.iid;
        pendingAttack = null; pendingMove = null; render();
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
          else { pendingAttack = { iid: c.iid, atkIndex: i, average: false }; pendingAnalyze = null; stateMenuFor = null; render(); }
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
          else { pendingAttack = { iid: c.iid, atkIndex: i, average: true }; pendingAnalyze = null; stateMenuFor = null; render(); }
        });
      });
      const obj = root.querySelector('.do-object[data-iid="' + c.iid + '"]');
      if (obj) obj.addEventListener('click', function () {
        c.used.object = true; log(cname(c) + ' utilise un objet.', 'move'); Store.save(); render();
      });
      // Mouvement : arme le déplacement, puis on clique la zone de destination
      const mv = root.querySelector('.do-move[data-iid="' + c.iid + '"]');
      if (mv) mv.addEventListener('click', function () {
        if (c.used.move) return;
        pendingMove = (pendingMove === c.iid) ? null : c.iid;
        pendingAttack = null; pendingAnalyze = null; render();
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
      log(cname(h) + ' prend un repos court et récupère ' + amt(h.pv - before, 'heal') + ' PV ' +
        '<span class="ldice">(' + rolls.join('<span class="dplus">+</span>') + ')</span>.', 'heal');
    });
    c.restDone = true;
    Store.save(); render();
  }

  function renderPhaseControls() {
    const box = $('#phase-controls');
    const c = combat();
    if (c.outcome) {
      const won = c.outcome !== 'defeat';
      box.innerHTML = '<button id="pc-finish" class="primary big result-btn">📊 Résultat du Combat</button>';
      $('#pc-finish').addEventListener('click', function () { endCombat(won); });
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
    // Pas d'aventurier résolu → ne crée pas un combat vide (plateau injouable).
    if (!heroObjs.length) {
      const root = $(rootSel);
      if (root) root.innerHTML = '<div class="card"><div class="card-head"><h3>Combat</h3></div>' +
        '<p class="empty">Impossible de lancer le combat : aucun aventurier du groupe n\'a été trouvé sur cet appareil.</p>' +
        '<p class="hint">Reprends la constitution du groupe dans l\'onglet « Groupe » avant de relancer l\'aventure.</p></div>';
      return;
    }
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
