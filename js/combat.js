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
  let sessionGains = null;    // { heroId: { endu, damage, talents:[] } } pour le combat courant

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
    // Gains de montée de niveau de la session courante (ENDU / Dégâts / talents
    // choisis). Appliqués sur un clone : la fiche de base reste au niveau 1.
    // En combat de session, on applique toujours l'overlay (talents choisis =
    // tableau, vide si aucun) pour que les talents NON choisis restent indisponibles.
    // En mode Admin (sessionGains null), la fiche brute sert aux tests d'équilibrage.
    const g = sessionGains && sessionGains[h.id];
    // Talents ÉQUIPÉS (≤ 6) : sous-ensemble des talents débloqués que le joueur a
    // coché dans l'onglet Talents. À défaut d'une sélection, on équipe les 6 premiers.
    function equippedOf(gg) {
      if (!gg) return [];
      const unlocked = Array.isArray(gg.talents) ? gg.talents : [];
      if (Array.isArray(gg.equipped)) return gg.equipped.filter(function (id) { return unlocked.indexOf(id) >= 0; }).slice(0, 6);
      return unlocked.slice(0, 6);
    }
    const hero = sessionGains ? Object.assign({}, h, {
      endu: (h.endu || 0) + (g ? g.endu || 0 : 0),
      damage: (h.damage || 0) + (g ? g.damage || 0 : 0),
      chosenTalents: equippedOf(g),
    }) : h;
    const attacks = Combatants.heroCombatAttacks(hero);
    const talents = Combatants.resolveHeroTalents(Array.isArray(hero.chosenTalents) ? hero.chosenTalents : null);
    const hasTalent = function (e) { return talents.some(function (t) { return t.effect === e; }); };
    return {
      iid: 'H' + i + '-' + h.id.slice(-4),
      side: 'hero', templateId: h.id, name: h.name, klass: h.klass || '', endu: hero.endu || 1, imageUrl: h.imageUrl || null,
      maxPv: Combatants.heroPv(hero), pv: Combatants.heroCurPv(hero),
      def: Combatants.heroDef(hero), damage: hero.damage, xp: 0, type: 'hero',
      menace: null, esquive: hasTalent('esquive_innee') || false, rapide: !!h.rapide, socle: 'medium',
      attacks: attacks, attackUses: initUses(attacks),
      talents: talents,                 // talents résolus (kind/effect/val) pour le moteur
      reactUsed: {},                    // réactions déjà déclenchées dans le tour courant
      freeMoveReady: hasTalent('pas_leger'), // PAS LÉGER : mouvement gratuit dispo dès le 1er tour
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false, brise: false, faille: false, poison: 0 },
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
      side: 'monster', templateId: m.id, name: m.name, imageUrl: m.imageUrl || null,
      maxPv: m.pv, pv: m.pv,
      def: Combatants.monsterTotalDef(m), damage: m.damage, xp: m.xp, type: m.type,
      menace: m.menace, esquive: !!m.esquive, rapide: !!m.rapide, socle: m.socle,
      attacks: attacks, attackUses: initUses(attacks),
      talentLabels: Combatants.monsterTalentLabels(m),
      states: { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false, brise: false, faille: false, poison: 0 },
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
    setCombat({ turn: 1, phase: 'heroes', bonusXp: 0, analyzeXp: 0, noDmgXp: 0, zones: zones, combatants: combatants, log: [], outcome: null });
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
      if (h.side !== 'hero') return;
      const wasDown = h.status !== 'active' || h.pv <= 0;
      const roll = 1 + Math.floor(Math.random() * 6) + (h.endu || 0);
      if (wasDown) {
        h.pv = Math.min(h.maxPv, roll);
        h.status = 'active';
      } else {
        h.pv = Math.min(h.maxPv, h.pv + roll);
      }
      c.healLines.push({ name: h.name, pv: h.pv, gained: roll });
    });
    // Bonus +1 XP par aventurier n'ayant subi aucun dégât pendant le combat
    c.noDmgXp = unscathedHeroes().length;
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
    if (!c) {
      // Résumé devenu obsolète (combat déjà purgé) : on s'assure tout de même de
      // quitter l'écran de résumé en réaffichant la vue Aventure.
      if (window.Session && Session.renderPlay) { try { Session.renderPlay(); } catch (e) {} }
      return;
    }
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
    } else if (!isSession) {
      rootSel = '#combat-root';
      render();
    }
    // Filet de sécurité : le combat est terminé (combat() == null), donc réafficher
    // la vue Aventure ne peut PLUS relancer le combat — cela garantit la sortie de
    // l'écran de résumé même si le gestionnaire d'événement n'a pas pu re-rendre
    // (renderScene gère lui-même une éventuelle montée de niveau en attente).
    if (isSession && window.Session && Session.renderPlay) {
      try { Session.renderPlay(); } catch (e) { console.error('[combat] reprise session', e); }
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
    const cb = combat();
    return comaMonsters().reduce(function (n, c) { return n + (c.xp || 0); }, 0) +
      (cb.bonusXp || 0) + (cb.analyzeXp || 0) + (cb.noDmgXp || 0);
  }
  // Liste des aventuriers n'ayant subi aucun dégât (bonus +1 XP chacun en fin de combat)
  function unscathedHeroes() {
    return combat().combatants.filter(function (x) { return x.side === 'hero' && (x.dmgTaken || 0) === 0; });
  }
  // Noms de base (sans numéro) des groupes d'adversaires analysés
  function analyzedGroups() {
    const set = {};
    combat().combatants.forEach(function (x) {
      if (x.side === 'monster' && x.analyzed) set[x.name.replace(/\s*\d+$/, '').trim()] = true;
    });
    return Object.keys(set);
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
    if (c.side === 'hero') chargeOnEnter(c);
  }

  // CHARGE DÉVASTATRICE (maîtrise) : en arrivant dans une zone, l'aventurier
  // inflige son bonus de dégâts à X adversaires qui s'y trouvent.
  function chargeOnEnter(c) {
    const n = heroTalentVal(c, 'charge_devastatrice');
    const dmg = c.damage || 0;
    if (n <= 0 || dmg <= 0) return;
    const foes = combat().combatants.filter(function (m) {
      return m.side === 'monster' && m.status === 'active' && m.zone === c.zone;
    }).slice(0, n);
    foes.forEach(function (m) {
      const before = m.pv;
      m.pv = Math.max(0, m.pv - dmg);
      m.dmgTaken += dmg; c.dmgDealt += dmg;
      pushFx({ type: 'hit', iid: m.iid, amount: dmg, fromPct: pct(before, m.maxPv), toPct: pct(m.pv, m.maxPv) });
      log('<b class="lopp">Charge Dévastatrice !</b> ' + cname(c) + ' inflige ' + amt(dmg, 'dmg') +
        ' Dégâts à ' + cname(m) + ' en chargeant.', 'dchoc');
      if (m.pv <= 0 && !m.killedBy) m.killedBy = c.iid;
      checkMonsterTalents(m, dmg);
      checkComa(m);
    });
  }

  function moveCombatant(iid, zi) {
    const c = byId(iid);
    if (!c || c.status !== 'active') { pendingMove = null; render(); return; }
    if (c.used.move && !c.freeMoveReady) { pendingMove = null; render(); return; }
    if (c.zone === zi) { pendingMove = null; render(); return; }
    // POISON X : inflige X dégâts avant de se déplacer
    applyPoison(c);
    if (c.status !== 'active') { pendingMove = null; checkOutcome(); Store.save(); render(); return; }
    const prevMove = c.used.move;
    doMove(c, zi); // doMove force used.move = true
    // PAS LÉGER : ce déplacement consomme d'abord le mouvement gratuit ; le
    // mouvement normal reste alors disponible.
    if (c.freeMoveReady) { c.freeMoveReady = false; c.used.move = prevMove; }
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
    const toApply = []; // liste ordonnée des états à appliquer (chacun pourra être ignoré par Onde)
    if (atk.effects.affaibli) toApply.push('affaibli');
    if (atk.effects.brise) toApply.push('brise');
    if (atk.effects.faille) toApply.push('faille');
    if (atk.effects.feu) toApply.push('feu');
    if (atk.effects.auSol) {
      const biggerTarget = SOCLE_RANK[target.socle] > SOCLE_RANK[attacker.socle];
      if (target.type !== 'boss' && !biggerTarget) toApply.push('auSol');
    }
    const poisonVal = atk.effects.poison || 0;
    if (poisonVal > 0) toApply.push('poison');
    if (!toApply.length) return;
    // Onde annule le prochain état négatif reçu
    let list = toApply.slice();
    if (target.states.onde && list.length) {
      const ignored = list.shift();
      target.states.onde = false;
      log(cname(target) + ' utilise <span class="lstate">Onde</span> et ignore <span class="lstate">' + stateLabel(ignored) + '</span>.', 'state');
    }
    list.forEach(function (s) {
      if (s === 'poison') {
        target.states.poison = (target.states.poison || 0) + poisonVal;
        log(cname(target) + ' subit <span class="lstate">Poison ' + target.states.poison + '</span>.', 'state');
      } else {
        target.states[s] = true;
        log(cname(target) + ' subit <span class="lstate">' + stateLabel(s) + '</span>.', 'state');
      }
    });
    if (list.length) pushFx({ type: 'state', iid: target.iid });
  }

  function resolveAttack(attacker, target, atk) {
    if (target.status !== 'active') return;

    const pool = Object.assign(D.emptyPool(), atk.dice);
    // FAILLE : ajoute 1 dé rose au pool de l'attaquant (les doubles avec ce dé sont exclus des dégâts)
    if (attacker.states.faille) pool.pink = (pool.pink || 0) + 1;
    const baseDmg = (atk.useOwnDamage !== false && !attacker.states.affaibli) ? (attacker.damage || 0) : 0;
    const talentBonus = getTalentDmgBonus(attacker, target, atk);
    const dmg = baseDmg + talentBonus + (atk.bonusDmg || 0);
    // BRISÉ et AU SOL : DEF = 0
    const def = (target.states.auSol || target.states.brise) ? 0 : target.def;
    const res = D.resolve(pool, { def: def, damage: dmg, turn: combat().turn });

    let negated = false;
    let reason = '';
    if (!res.echec && (res.pvLost > 0 || hasEffect(atk))) {
      if (target.esquive) {
        const roll = 1 + Math.floor(Math.random() * 6);
        if (roll === 6) { negated = true; reason = 'Esquive 6+'; }
      }
      if (!negated && target.states.blindage && !atk.ignoreBlindage) {
        negated = true; reason = 'Blindage'; target.states.blindage = false;
      }
      // BLINDAGE X : consomme une charge pour ignorer cette source de dégâts.
      if (!negated && target.blindageCharges > 0 && !atk.ignoreBlindage) {
        negated = true; target.blindageCharges -= 1;
        reason = 'Blindage' + (target.blindageCharges > 0 ? ' (' + target.blindageCharges + ' restante' + (target.blindageCharges > 1 ? 's' : '') + ')' : ' épuisé');
      }
      // GARDE IMPRENABLE (talent) : annule la 1ʳᵉ source de dégâts de chaque tour.
      if (!negated && heroHasTalent(target, 'garde_imprenable') && target.gardeUsedTurn !== combat().turn) {
        negated = true; target.gardeUsedTurn = combat().turn; reason = 'Garde Imprenable';
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

    // CUIRASSE (talent passif) : réduit les dégâts subis par l'aventurier.
    let cuir = 0;
    if (res.pvLost > 0 && target.side === 'hero') {
      cuir = heroTalentVal(target, 'cuirasse');
      if (cuir > 0) {
        const before = res.pvLost;
        res.pvLost = Math.max(0, res.pvLost - cuir);
        if (before !== res.pvLost) log(cname(target) + ' encaisse (Cuirasse) : -' + (before - res.pvLost) + ' dégâts.', 'state');
      }
    }
    // BOURREAU DES RAPIDES (amélioration) : dégâts doublés contre un adversaire rapide.
    if (res.pvLost > 0 && atk.doubleVsRapide && target.rapide) {
      const extra = res.pvLost;
      res.pvLost += extra;
      log(cname(attacker) + ' frappe un adversaire rapide : <span class="lstate">dégâts doublés</span> (+' + extra + ').', 'state');
    }
    const pvBefore = target.pv;
    if (res.pvLost > 0) {
      target.pv = Math.max(0, target.pv - res.pvLost); target.dmgTaken += res.pvLost; attacker.dmgDealt += res.pvLost;
      // RÉACTION Contre-Attaque : l'aventurier blessé pourra riposter à son tour.
      if (target.side === 'hero' && attacker.side === 'monster' && heroHasTalent(target, 'contre_attaque')) {
        target.tookDamage = true; target.lastAttacker = attacker.iid;
      }
    }
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
    // Dégâts-choc (attaque d'opportunité) : tirer à distance dans une zone ennemie.
    // Résolus APRÈS l'attaque : la cible éliminée (pv ≤ 0) ne contre-attaque pas.
    if (atk.range === 'distance' && attacker.side === 'hero') {
      enemyZoneMates(attacker).forEach(function (m) {
        if (m.iid === target.iid && target.pv <= 0) return;
        if (attacker.status === 'active') dchocFrom(m, attacker, 'distance');
      });
    }
    checkComa(target);
  }

  function hasEffect(atk) {
    return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu ||
      atk.effects.brise || atk.effects.faille || atk.effects.poison);
  }

  function applyHeroComaVieLoss(combatant) {
    const sessionCtx = Store.state.sessionCombat;
    if (!sessionCtx || !sessionCtx.sessionId) return;
    // Sessions stored in localStorage, not in Store.state — must load then re-save.
    const sessions = Store.loadSessions();
    const ses = sessions.find(function (s) { return s.id === sessionCtx.sessionId; });
    if (!ses) return;
    const hid = combatant.templateId;
    if (!ses.heroStates) ses.heroStates = {};
    if (!ses.heroStates[hid]) ses.heroStates[hid] = {};
    const state = ses.heroStates[hid];
    state.viePenalty = (state.viePenalty || 0) - 1;
    const h = Store.state.heroes.find(function (x) { return x.id === hid; });
    // VIE effective = VIE de base + gains de niveau + pénalité coma
    const gains = ses.levelGains ? (ses.levelGains[hid] || {}) : {};
    const baseVie = (h ? (h.vie || 0) : 0) + (gains.vie || 0);
    const effVie = baseVie + state.viePenalty;
    if (effVie <= 0) {
      state.dead = true;
      ses.heroIds = ses.heroIds.filter(function (id) { return id !== hid; });
      log(cname(combatant) + ' <span class="lcoma">perd sa dernière VIE — il quitte l\'aventure définitivement.</span>', 'down');
    } else {
      log(cname(combatant) + ' <span class="lcoma">tombe dans le coma et perd 1 VIE (VIE restante : ' + effVie + ').</span>', 'down');
    }
    // Record for combat summary display
    const cmb = combat();
    if (cmb) {
      if (!Array.isArray(cmb.comaVieEvents)) cmb.comaVieEvents = [];
      cmb.comaVieEvents.push({ name: combatant.name, effVie: effVie, dead: effVie <= 0 });
    }
    Store.saveSessions(sessions);
    Store.save();
  }

  function checkComa(c) {
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      pushFx({ type: 'faint', iid: c.iid, side: c.side, name: c.name });
      log(c.side === 'monster'
        ? (cname(c) + ' <span class="lvanq">est vaincu !</span>')
        : (cname(c) + ' <span class="lcoma">tombe dans le coma…</span>'),
        c.side === 'monster' ? 'kill' : 'down');
      if (c.side === 'hero' && combatKey === 'combat') applyHeroComaVieLoss(c);
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

  // Bonus de dégâts des talents PASSIFS d'un aventurier attaquant
  function getHeroTalentDmgBonus(attacker, target, atk) {
    if (!Array.isArray(attacker.talents)) return 0;
    let bonus = 0;
    attacker.talents.forEach(function (t) {
      if (t.kind !== 'passive') return;
      switch (t.effect) {
        case 'frappe_lourde': bonus += t.val || 0; break;
        case 'maitre_distance': if (atk && atk.range === 'distance') bonus += t.val || 0; break;
        case 'tueur_au_sol': if (target.states.auSol) bonus += t.val || 0; break;
        case 'tueur_affaibli': if (target.states.affaibli) bonus += t.val || 0; break;
        case 'meute': {
          const allies = combat().combatants.filter(function (c) {
            return c.side === 'hero' && c.status === 'active' && c.iid !== attacker.iid && c.zone === target.zone;
          }).length;
          bonus += allies * (t.val || 1);
          break;
        }
      }
    });
    return bonus;
  }

  // Un aventurier possède-t-il un talent d'effet donné ?
  function heroHasTalent(c, effect) {
    return c && c.side === 'hero' && Array.isArray(c.talents) &&
      c.talents.some(function (t) { return t.effect === effect; });
  }
  // Valeur X d'un talent de l'aventurier (0 si absent)
  function heroTalentVal(c, effect) {
    if (!c || !Array.isArray(c.talents)) return 0;
    const t = c.talents.find(function (x) { return x.effect === effect; });
    return t ? (t.val || 0) : 0;
  }

  // Retourne le bonus de dégâts (talents de l'attaquant + soutien de zone)
  function getTalentDmgBonus(attacker, target, atk) {
    if (attacker.side === 'hero') return getHeroTalentDmgBonus(attacker, target, atk);
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

  // Réinitialise les marqueurs de réaction « subi des dégâts » avant que les
  // adversaires ne frappent : seul un coup reçu CE tour-ci ouvre la riposte.
  function clearHeroReactionMarks() {
    combat().combatants.forEach(function (h) {
      if (h.side === 'hero') { h.tookDamage = false; h.lastAttacker = null; }
    });
  }

  // Version synchrone (auto-combat, abandon) : tous les adversaires agissent d'un coup
  function monstersActCore() {
    clearHeroReactionMarks();
    activationOrder().forEach(actOneMonster);
    checkOutcome();
  }

  // Version séquencée (UI) : chaque adversaire agit l'un après l'autre, avec un
  // re-rendu entre chaque pour qu'on voie distinctement qui joue. onDone() est
  // appelé quand toute la vague a agi (ou que le combat est résolu).
  const AI_STEP_MS = 550;
  function monstersActSequential(onDone) {
    clearHeroReactionMarks();
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
    startHeroTurn();
  }

  // Début du tour des aventuriers : réinitialise les réactions et applique
  // les talents passifs « par tour » (Régénération).
  function startHeroTurn() {
    activeOf('hero').forEach(function (h) {
      h.reactUsed = {};
      // PAS LÉGER (maîtrise) : 1 mouvement gratuit disponible ce tour.
      h.freeMoveReady = heroHasTalent(h, 'pas_leger');
      const regen = heroTalentVal(h, 'regeneration');
      if (regen > 0 && h.pv < h.maxPv) {
        const before = h.pv;
        h.pv = Math.min(h.maxPv, h.pv + regen);
        if (h.pv > before) {
          pushFx({ type: 'heal', iid: h.iid, amount: h.pv - before, fromPct: pct(before, h.maxPv), toPct: pct(h.pv, h.maxPv) });
          log(cname(h) + ' régénère ' + (h.pv - before) + ' PV.', 'state');
        }
      }
    });
  }

  function endTurn() {
    pendingAttack = null; stateMenuFor = null;
    applyEndOfTurnStates(); // FEU : 1 dé noir pour chaque combattant en feu
    if (combat().outcome) { Store.save(); render(); return; }
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
      applyEndOfTurnStates();
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
    brise: { l: 'Brisé', neg: true }, faille: { l: 'Faille', neg: true }, poison: { l: 'Poison', neg: true },
  };
  function stateLabel(s) { return STATE_META[s] ? STATE_META[s].l : s; }

  // POISON X : inflige X dégâts au combattant avant qu'il agisse (Attaque, Talent, Mouvement)
  function applyPoison(c) {
    const dmg = (c.states && c.states.poison) || 0;
    if (!dmg || c.status !== 'active') return;
    const before = c.pv;
    c.pv = Math.max(0, c.pv - dmg);
    c.dmgTaken += dmg;
    pushFx({ type: 'hit', iid: c.iid, amount: dmg, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' subit ' + amt(dmg, 'dmg') + ' (<span class="lstate">Poison ' + dmg + '</span>) avant d\'agir.', 'state');
    checkComa(c);
  }

  // FEU et autres états de fin de tour (appelé avant doFlee)
  function applyEndOfTurnStates() {
    if (!combat()) return;
    combat().combatants.forEach(function (c) {
      if (c.status !== 'active' || !c.states.feu) return;
      const v = 1 + Math.floor(Math.random() * 6);
      const before = c.pv;
      c.pv = Math.max(0, c.pv - v);
      c.dmgTaken += v;
      pushFx({ type: 'hit', iid: c.iid, amount: v, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
      log(cname(c) + ' subit <span class="dnum d-black">' + v + '</span> Dégâts (<span class="lstate">Feu ⬛</span>) en fin de tour.', 'state');
      if (c.side === 'monster' && c.pv <= 0 && !c.killedBy) c.killedBy = null;
      checkComa(c);
    });
    checkOutcome();
  }

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
    const killXp = killed.reduce(function (n, x) { return n + (x.xp || 0); }, 0);
    const anaGroups = analyzedGroups();
    const anaXp = c.analyzeXp || 0;
    const unscathed = unscathedHeroes();
    const noDmgXp = c.noDmgXp || 0;
    function xpBreakdown() {
      const lines = [];
      lines.push('<div class="cs-xpline"><span class="cs-xpic">⚔️</span>' +
        '<span class="cs-xptxt">Adversaires vaincus</span><span class="cs-xpamt">+' + killXp + '</span></div>');
      if (anaXp > 0) {
        lines.push('<div class="cs-xpline"><span class="cs-xpic">🔍</span>' +
          '<span class="cs-xptxt">Analyse' + (anaGroups.length ? ' — ' + esc(anaGroups.join(', ')) : '') +
          '</span><span class="cs-xpamt">+' + anaXp + '</span></div>');
      }
      if (noDmgXp > 0) {
        lines.push('<div class="cs-xpline"><span class="cs-xpic">💪</span>' +
          '<span class="cs-xptxt">Sans une égratignure' +
          (unscathed.length ? ' — ' + esc(unscathed.map(function (h) { return h.name; }).join(', ')) : '') +
          '</span><span class="cs-xpamt">+' + noDmgXp + '</span></div>');
      }
      return '<div class="cs-xpbreak">' + lines.join('') + '</div>';
    }
    // Tableau des combattants : aventuriers puis adversaires ayant agi/subi
    const parts = c.combatants.filter(function (x) { return x.side === 'hero' || x.dmgDealt > 0 || x.dmgTaken > 0; });
    parts.sort(function (a, b) { return (a.side === 'hero' ? 0 : 1) - (b.side === 'hero' ? 0 : 1) || b.dmgDealt - a.dmgDealt; });
    // Statut de fin pour chaque combattant + couleur de ligne
    var healMap = {};
    if (c.healLines) c.healLines.forEach(function (h) { healMap[h.name] = h; });
    function combatantStatus(x) {
      if (x.side === 'hero') {
        var hl = healMap[x.name];
        if (x.status === 'coma') return { label: 'Coma', cls: 'st-coma' };
        if (hl) return { label: 'Soin ' + hl.gained + ' PV ! (' + hl.pv + ')', cls: 'st-healed' };
        return { label: 'Actif', cls: 'st-active' };
      }
      if (x.status === 'coma')  return { label: 'Vaincu', cls: 'st-dead' };
      if (x.status === 'fled')  return { label: 'En fuite', cls: 'st-fled' };
      return { label: 'Survivant', cls: 'st-alive' };
    }
    function statRows() {
      return parts.map(function (x) {
        var st = combatantStatus(x);
        return '<div class="cs-stat-row ' + (x.side === 'hero' ? 'is-hero' : 'is-foe') + ' ' + st.cls + '">' +
          '<span class="cs-name">' + (x.side === 'hero' ? '🛡️' : '⚔️') + ' ' + esc(x.name) + '</span>' +
          '<span class="cs-val cs-dealt" title="Dégâts infligés">' + x.dmgDealt + '</span>' +
          '<span class="cs-val cs-taken" title="Dégâts subis">' + x.dmgTaken + '</span>' +
          '<span class="cs-val cs-status">' + st.label + '</span>' +
        '</div>';
      }).join('');
    }

    root.innerHTML = '<div class="combat-summary cs-' + out + '">' +
      '<div class="cs-banner">' +
        '<span class="cs-icon">' + (ICON[out] || '⚔️') + '</span>' +
        '<span class="cs-title">' + (OUT[out] || 'COMBAT TERMINÉ') + '</span>' +
      '</div>' +
      '<div class="cs-xpbig">' +
        '<span class="cs-xpnum">+' + xp + ' XP</span>' +
        '<span class="cs-xplbl">Expérience Gagnée</span>' +
      '</div>' +
      xpBreakdown() +
      '<div class="cs-statcard">' +
        '<div class="cs-stat-head"><span class="cs-name">Combattant</span>' +
          '<span class="cs-val">⚔️ Infligés</span>' +
          '<span class="cs-val">🩸 Subis</span>' +
          '<span class="cs-val">Statut</span></div>' +
        statRows() +
      '</div>' +
      ((c.lootResults && c.lootResults.length)
        ? '<div class="cs-group cs-lootg"><div class="cs-glabel">🎁 Butin récupéré</div><div class="cs-chips">' +
            c.lootResults.map(function (L) {
              return '<span class="cs-chip">' + esc(L.name) + (L.qty > 1 ? ' ×' + L.qty : '') +
                (L.toName ? ' <em>→ ' + esc(L.toName) + '</em>' : ' <em>(groupe)</em>') + '</span>';
            }).join('') + '</div></div>'
        : '') +
      ((c.comaVieEvents && c.comaVieEvents.length)
        ? '<div class="cs-group cs-comag"><div class="cs-glabel">💀 Coma — Perte de VIE</div><div class="cs-chips">' +
            c.comaVieEvents.map(function (ev) {
              return '<span class="cs-chip cs-chip-coma">' + esc(ev.name) + (ev.dead
                ? ' — <strong>VIE à 0 : quitte l\'aventure !</strong>'
                : ' — VIE restante : <strong>' + ev.effVie + '</strong>') + '</span>';
            }).join('') + '</div></div>'
        : '') +
      '<button class="primary big cs-continue-btn" id="cs-continue">Continuer l\'aventure →</button>' +
    '</div>';
    // On rattache l'écouteur au bouton DANS le conteneur courant (évite de viser un
    // éventuel bouton homonyme resté dans un autre panneau de combat masqué).
    const contBtn = (root && root.querySelector('#cs-continue')) || $('#cs-continue');
    if (contBtn) contBtn.addEventListener('click', finishCombat);
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
    // Clignotement du bouton "Tour des Adversaires" quand tous les aventuriers ont agi
    const allHeroesActed = !c.outcome && c.phase === 'heroes' && activeOf('hero').length > 0 &&
      activeOf('hero').every(function (h) { return h.used.action; });
    root.innerHTML =
      '<div class="combat-bar">' +
        '<div class="cb-left"><span class="turn-pill">Tour ' + c.turn + '</span>' +
          '<span class="phase-pill ' + (c.phase) + '">' + phaseLabel + '</span></div>' +
        '<div class="cb-mid">✦ XP : <strong>' + totalXp() + '</strong></div>' +
        '<div class="cb-right">' +
          (!c.outcome && c.phase === 'heroes'
            ? '<button id="cb-enemy-turn" class="small enemy-turn-btn' + (allHeroesActed ? ' all-acted' : '') + '">Tour des Adversaires →</button>'
            : '') +
          '<button id="cb-end" class="ghost small">Terminer le combat</button>' +
        '</div>' +
      '</div>' +
      // Journal compact : hauteur fixe 4 lignes minimum, scrollable au-delà.
      '<div id="combat-log" class="combat-log compact"></div>' +
      '<div id="combat-actionbar" class="combat-actionbar"></div>' +
      '<div class="combat-zones-grid zc-' + zoneCount() + '">' +
        zones().map(function (z, zi) {
          return '<div class="combat-zone' + (pendingMove ? ' movable' : '') + '" data-zone="' + zi + '">' +
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

    // Filet ULTIME : si aucune carte n'a pu s'afficher (placement incohérent,
    // snapshot hérité…), on FORCE le rendu de tous les combattants — regroupés —
    // au lieu d'afficher un message d'erreur. Le combat reste jouable.
    if (!root.querySelector('.combat-card')) {
      const fighters = c.combatants.filter(function (x) { return x.side === 'hero' || x.status === 'active'; });
      let box = root.querySelector('#zone-cards-0') || root.querySelector('[id^="zone-cards-"]');
      if (!box) {
        const wrap = document.createElement('div');
        wrap.className = 'combat-zones-grid zc-1';
        wrap.innerHTML = '<div class="combat-zone"><div class="zone-name">Combattants</div>' +
          '<div class="zone-cards" id="zone-cards-0"></div></div>';
        root.appendChild(wrap);
        box = wrap.querySelector('#zone-cards-0');
      }
      if (box && fighters.length) {
        box.innerHTML = '<div class="hero-grid">' + fighters.map(safeCard).join('') + '</div>';
        fighters.forEach(function (x) { try { wireCard(x); } catch (e) { console.error('[combat] wireCard (secours)', x && x.iid, e); } });
      }
    }

    const cbEnd = root.querySelector('#cb-end');
    if (cbEnd) cbEnd.addEventListener('click', function () {
      const isSession = combatKey === 'combat' && Store.state.sessionCombat;
      if (isSession) {
        if (confirm('Terminer ce combat ? Vos adversaires agiront une dernière fois et vous subirez les conséquences d\'une défaite.')) forfeitCombat();
      } else {
        if (confirm('Terminer et quitter ce combat ?')) endCombat(false);
      }
    });
    const cet = root.querySelector('#cb-enemy-turn');
    if (cet) cet.addEventListener('click', enemyTurnAndAdvance);
    const ct = root.querySelector('#cancel-target');
    if (ct) ct.addEventListener('click', function () { pendingAttack = null; render(); });
    const cm = root.querySelector('#cancel-move');
    if (cm) cm.addEventListener('click', function () { pendingMove = null; render(); });
    const ca = root.querySelector('#cancel-analyze');
    if (ca) ca.addEventListener('click', function () { pendingAnalyze = null; render(); });

    // Déplacement : cliquer une zone y envoie le combattant en cours de mouvement
    // (uniquement après avoir cliqué le bouton Mouv.).
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
      if (at && ak && pendingAttack.multi) {
        const n = (pendingAttack.picked || []).length;
        return '🎯 <b>' + esc(at.name) + '</b> — ' + esc(ak.name) +
          ' <span class="lavg">(2 adversaires d\'une même zone)</span> : <b>clique ' +
          (n === 0 ? 'la 1<sup>re</sup>' : 'la 2<sup>e</sup>') + ' cible</b> (' + n + '/' + pendingAttack.multi + '). ' +
          '<button id="cancel-target" class="ghost xs">Annuler</button>';
      }
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
  // Ordre des emplacements de talent dans le bandeau de combat.
  const KIND_SLOT_ORDER = { action: 0, mastery: 1, reaction: 2, passive: 3, upgrade: 4 };
  function slotRank(k) { return KIND_SLOT_ORDER[k] == null ? 9 : KIND_SLOT_ORDER[k]; }
  // Construit un emplacement par talent équipé : action jouable (bouton d'attaque),
  // réaction (bouton violet) ou libellé non cliquable (passif/amélioration/maîtrise).
  function heroTalentSlots(c, canAct) {
    if (!Array.isArray(c.talents)) return [];
    const byId = {}; const order = [];
    c.talents.forEach(function (t) {
      if (!byId[t.id]) { byId[t.id] = { id: t.id, name: t.name, kinds: [] }; order.push(t.id); }
      if (byId[t.id].kinds.indexOf(t.kind) < 0) byId[t.id].kinds.push(t.kind);
    });
    const slots = order.map(function (id) {
      const t = byId[id];
      t.kind = t.kinds.slice().sort(function (a, b) { return slotRank(a) - slotRank(b); })[0];
      return t;
    });
    slots.sort(function (a, b) { return slotRank(a.kind) - slotRank(b.kind); });
    const reactions = heroReactions(c);
    const atks = Array.isArray(c.attacks) ? c.attacks : [];
    return slots.map(function (t) {
      const ai = atks.findIndex(function (a) { return a.special && a.generic && a.talentId === t.id; });
      if (ai >= 0) return abAttackBtn(c, atks[ai], ai, canAct);
      const r = reactions.find(function (x) { return x.t.id === t.id; });
      if (r) return reactionBtn(c, r.t, r.ready && canAct);
      return '<button class="ab-talent ab-talent-named ab-talent-kind-' + t.kind + '" type="button" disabled ' +
        'title="' + esc(t.name) + '">' + esc(t.name) + '</button>';
    });
  }

  function renderActionBar() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-actionbar') : null;
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
    const initial = (c.name || '?').charAt(0).toUpperCase();
    const abAvatarStyle = c.imageUrl
      ? ' style="background-image:url(\'' + c.imageUrl.replace(/'/g, '%27') + '\');background-size:cover;background-position:center;"'
      : '';
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');

    // Sépare attaques d'arme (boutons « Attaque » du haut) et spéciales (talents)
    const weaponAtks = [], specialAtks = [];
    (c.attacks || []).forEach(function (a, i) {
      (a.special ? specialAtks : weaponAtks).push({ a: a, i: i });
    });

    let html = '<div class="' + cls.join(' ') + '">' +
      '<div class="ab-avatar"' + abAvatarStyle + ' aria-hidden="true">' + (c.imageUrl ? '' : esc(initial)) + '</div>' +
      '<div class="ab-id">' +
        '<div class="ab-name"><span class="roster-name">' + esc(c.name) + '</span>' +
          (c.klass ? '<span class="tag class-tag">' + esc(c.klass) + '</span>' : '') +
          (isEnemy && c.type ? '<span class="tag type">' + (Combatants.TYPE_LABEL[c.type] || c.type) + '</span>' : '') +
          (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
        '</div>' +
        '<div class="ab-pvline cc-pvline">' +
          '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div><span class="pv-text">' + pvText + '</span></div>' +
          (known ? '<span class="def-badge">' + defShield((c.states.auSol || c.states.brise) ? 0 : c.def) + '</span>' : '') +
          (known && c.blindageCharges > 0 ? '<span class="blindage-badge" title="Blindage">🛡✦ ' + c.blindageCharges + '</span>' : '') +
        '</div>' +
        (statesBadges(c) ? '<div class="ab-states-badges">' + statesBadges(c) + '</div>' : '') +
      '</div>';

    // Grille d'actions : 2 lignes, remplissage colonne par colonne (cf. croquis).
    //   Col. action : Attaque (haut) + Mouv/Objet/Analyse (bas)
    //   Col. 2 : Talent 1 / Talent 2 — Col. 3 : Talent 3 / Talent 4 — Col. 4 : Talent 5 / Talent 6
    html += '<div class="ab-acts">';
    // Cellule (col. action, ligne 1) : attaque(s) d'arme
    html += '<div class="ab-attack-cell">' +
      (weaponAtks.length
        ? weaponAtks.map(function (w) { return abAttackBtn(c, w.a, w.i, canAct); }).join('')
        : '<div class="ab-noatk">—</div>') +
      '</div>';
    // Cellule (col. action, ligne 2) : Mouv / Objet / Analyse (aventuriers)
    html += (c.side === 'hero') ? abToolsHtml(c, canAct) : '<div class="ab-tools ab-tools-empty"></div>';
    // Cellules talents T1..T6 (remplies colonne par colonne) :
    //  • aventuriers → leurs attaques spéciales (boutons jouables) ;
    //  • adversaires → leurs talents passifs (FUYARD, SOUTIEN… en libellés).
    const labels = isEnemy ? (c.talentLabels || []) : null;
    // Boutons jouables de l'aventurier : un emplacement par TALENT ÉQUIPÉ, trié
    // ACTION → MAÎTRISE → RÉACTION → PASSIF → AMÉLIORATION ; puis les attaques
    // spéciales manuelles (non liées à un talent).
    const heroSlots = [];
    if (!isEnemy) {
      heroTalentSlots(c, canAct).forEach(function (slot) { heroSlots.push(slot); });
      specialAtks.forEach(function (s) { if (!s.a.generic) heroSlots.push(abAttackBtn(c, s.a, s.i, canAct)); });
    }
    for (let i = 0; i < 6; i++) {
      if (!isEnemy && i < heroSlots.length) {
        html += heroSlots[i];
      } else if (isEnemy && i < labels.length) {
        if (c.analyzed) {
          html += '<button class="ab-talent ab-talent-named" type="button" disabled title="' + esc(labels[i]) + '">' + esc(labels[i]) + '</button>';
        } else {
          html += '<button class="ab-talent ab-talent-unknown" type="button" disabled title="Analysez cet adversaire pour révéler ses talents">Talent Inconnu</button>';
        }
      } else {
        html += '<button class="ab-talent ab-talent-empty" type="button" disabled title="Emplacement de talent vide">Talent ' + (i + 1) + '</button>';
      }
    }
    html += '</div>';

    html += '</div>';
    box.className = 'combat-actionbar active';
    box.innerHTML = html;
    // Les boutons (data-iid) seront câblés par wireCard lors de renderZones,
    // qui s'exécute juste après (le combattant sélectionné est dans une zone).
  }

  function renderZones() {
    const root = $(rootSel);
    if (!root) return;
    let placed = 0;
    zones().forEach(function (z, zi) {
      const box = root.querySelector('#zone-cards-' + zi);
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
      placed += heroes.length + monsters.length;
      heroes.concat(monsters).forEach(function (c) {
        try { wireCard(c); } catch (e) { console.error('[combat] wireCard a échoué pour', c && c.iid, e); }
      });
    });
    // Dernier recours : si AUCUN combattant n'a pu être placé dans une zone alors
    // que le combat en contient (placement incohérent, données héritées…), on les
    // affiche tout de même — regroupés dans le 1er conteneur — pour que le combat
    // reste JOUABLE plutôt que de tomber sur un plateau vide.
    if (!placed) {
      const box = root.querySelector('#zone-cards-0') || root.querySelector('[id^="zone-cards-"]');
      const fighters = combat().combatants.filter(function (c) {
        return c.side === 'hero' || c.status === 'active';
      });
      if (box && fighters.length) {
        box.innerHTML = '<div class="hero-grid">' + fighters.map(safeCard).join('') + '</div>';
        fighters.forEach(function (c) {
          try { wireCard(c); } catch (e) { console.error('[combat] wireCard (secours)', c && c.iid, e); }
        });
      }
    }
    renderCemetery();
  }

  // Cimetière : adversaires vaincus ou enfuis (compact, hors zones)
  function renderCemetery() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-cemetery') : null;
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
    return Object.keys(STATE_META).filter(function (s) {
      return s === 'poison' ? (c.states.poison > 0) : c.states[s];
    }).map(function (s) {
      const lbl = s === 'poison' ? ('Poison ' + c.states.poison) : stateLabel(s);
      return '<span class="state-badge ' + (STATE_META[s].neg ? 'neg' : 'pos') + '" data-state="' + s + '" data-iid="' + c.iid + '">' +
        lbl + ' ✕</span>';
    }).join('');
  }

  // Bouton d'attaque du bandeau d'action (arme ou spéciale logée en talent).
  // Taille FIXE : nom (tronqué) + figurines de dés. Les infos de portée
  // (contact/distance, cibles, gratuite) ne s'affichent plus sur le bouton —
  // elles restent disponibles en infobulle.
  // Badge de DEF : pour les valeurs 1 à 6 on utilise l'image dédiée (le chiffre
  // est déjà dessiné dans le blason). Pour 0 (ou >6, rare), on retombe sur le
  // blason vide (DEF VIDE.png) avec la valeur en texte centré par-dessus.
  function defShield(val) {
    if (val >= 0 && val <= 6) {
      return '<img class="def-img" src="assets/DEF ' + val + '.png" alt="DEF ' + val + '">';
    }
    return '<span class="def-shield">' + val + '</span>';
  }

  // ---- Réactions d'aventurier (talents violets, déclenchés par le joueur) ----
  // Cible de Réanimation : un allié au coma dans une zone où un adversaire est mort.
  function reanimTarget(c) {
    const deadZones = {};
    combat().combatants.forEach(function (m) {
      if (m.side === 'monster' && m.status === 'coma') deadZones[m.zone] = true;
    });
    return combat().combatants.find(function (h) {
      return h.side === 'hero' && h.status === 'coma' && deadZones[h.zone];
    }) || null;
  }
  function reactionReady(c, t) {
    if (c.reactUsed && c.reactUsed[t.effect]) return false;
    if (t.effect === 'contre_attaque') return !!c.tookDamage && !!byId(c.lastAttacker);
    if (t.effect === 'reanimation') return reanimTarget(c) != null;
    return false;
  }
  function heroReactions(c) {
    if (!Array.isArray(c.talents)) return [];
    return c.talents.filter(function (t) { return t.kind === 'reaction'; })
      .map(function (t) { return { t: t, ready: reactionReady(c, t) }; });
  }
  const REACT_HINT = {
    contre_attaque: 'Disponible après avoir subi des dégâts.',
    reanimation: 'Disponible si un allié est au coma dans une zone où un adversaire est mort.',
  };
  function reactionBtn(c, t, ready) {
    return '<button class="ab-atk ab-atk-react' + (ready ? '' : ' ab-react-off') + '" type="button"' +
      ' data-iid="' + c.iid + '" data-react="' + esc(t.effect) + '"' + (ready ? '' : ' disabled') +
      ' title="' + esc(t.name + ' — ' + (REACT_HINT[t.effect] || '')) + '">' +
      '<span class="ab-atk-talname">' + esc(t.name) + '</span>' +
    '</button>';
  }
  function firstWeaponIdx(c) {
    for (let i = 0; i < c.attacks.length; i++) { if (!c.attacks[i].special) return i; }
    return c.attacks.length ? 0 : -1;
  }
  function execHeroReaction(c, effect) {
    if (!c || c.status !== 'active') return;
    if (c.reactUsed && c.reactUsed[effect]) return;
    if (effect === 'contre_attaque') {
      const tgt = byId(c.lastAttacker);
      const wi = firstWeaponIdx(c);
      if (tgt && tgt.status === 'active' && wi >= 0) {
        log(cname(c) + ' <span class="lreact">riposte</span> !', 'state');
        resolveAttack(c, tgt, c.attacks[wi]);
      }
      c.reactUsed.contre_attaque = true; c.tookDamage = false;
    } else if (effect === 'reanimation') {
      const ally = reanimTarget(c);
      const val = heroTalentVal(c, 'reanimation');
      if (ally) {
        ally.status = 'active';
        const before = ally.pv;
        ally.pv = Math.max(1, Math.min(ally.maxPv, val));
        pushFx({ type: 'heal', iid: ally.iid, amount: ally.pv - before, fromPct: 0, toPct: pct(ally.pv, ally.maxPv) });
        log(cname(c) + ' <span class="lreact">réanime</span> ' + cname(ally) + ' (' + ally.pv + ' PV).', 'state');
      }
      c.reactUsed.reanimation = true;
    }
    checkOutcome(); Store.save(); render();
  }

  function abAttackBtn(c, a, i, canAct) {
    const usedA = c.used.action;
    const uses = (c.attackUses && c.attackUses[i] !== undefined) ? c.attackUses[i] : null;
    const depleted = uses === 0;
    // AU SOL : aucune attaque ni talent possible tant que le combattant n'est pas relevé
    const blocked = !canAct || depleted || (!a.freeAction && usedA) || (c.states && c.states.auSol);
    const isThisAtk = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average;
    const isEnemy = c.side === 'monster';
    const revealed = !isEnemy || c.analyzed;
    const showDmg = revealed && a.useOwnDamage !== false && c.damage > 0 && !c.states.affaibli;
    const info = [(a.range === 'distance' ? 'distance' : 'contact')];
    if (a.targets === 'all') info.push('toutes cibles');
    if (a.freeAction) info.push('gratuite');
    // Attaque spéciale (talent) : on affiche son nom ; attaque d'arme : icône mêlée/tir.
    const nameHtml = a.special
      ? '<span class="ab-atk-talname">' + esc(a.name) + '</span>'
      : '<img class="ab-atk-name" src="' + (a.range === 'distance' ? 'assets/Attack_range_b.png' : 'assets/Attack_melee_b.png') + '" alt="' + (a.range === 'distance' ? 'Tir' : 'Attaque') + '">';
    // Les boutons de talent n'affichent que le nom (pas de dés ni de bonus).
    const figsHtml = a.special ? '' :
      '<span class="ab-atk-figs">' + (revealed ? Inventory.poolBadges(a.dice) : '') +
        (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '') +
        (revealed && uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
      '</span>';
    return '<button class="ab-atk atk-chip' + (a.special ? ' ab-atk-special' : '') + (isThisAtk ? ' selected' : '') +
        '" type="button" data-iid="' + c.iid + '" data-atk="' + i + '"' + (blocked ? ' disabled' : '') +
        ' title="' + esc(a.name) + ' (' + info.join(', ') + ')">' +
      nameHtml +
      figsHtml +
    '</button>';
  }

  // Rangée Mouv. / Objet / Analyse : 3 boutons de largeur égale qui occupent,
  // à eux trois, la même largeur que le bouton d'attaque au-dessus.
  function abToolsHtml(c, canAct) {
    const usedO = c.used.object;
    const usedMv = c.used.move;
    const multi = zoneCount() > 1;
    const isAuSol = !!(c.states && c.states.auSol);
    // AU SOL : le bouton mouvement est remplacé par « Se relever » (consomme le mouvement)
    const moveBtn = isAuSol
      ? '<button class="ab-tool standup-chip do-standup" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedMv) ? ' disabled' : '') + ' title="Utilise votre mouvement pour vous relever (retire AU SOL)">Se relever</button>'
      : '<button class="ab-tool move-chip do-move' + (pendingMove === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canAct || !multi || (usedMv && !c.freeMoveReady)) ? ' disabled' : '') +
          ' title="' + (c.freeMoveReady ? 'Mouvement gratuit (Pas Léger) disponible' : 'Changer de zone') + '">Mouv.' +
          (c.freeMoveReady ? ' <span class="free-move-dot" title="Mouvement gratuit">✦</span>' : '') + '</button>';
    return '<div class="ab-tools">' +
      moveBtn +
      '<button class="ab-tool obj-chip do-object" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedO || isAuSol) ? ' disabled' : '') + ' title="Utiliser l\'objet équipé">Objet</button>' +
      '<button class="ab-tool ana-chip do-analyse' + (pendingAnalyze === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canAct || usedMv || isAuSol) ? ' disabled' : '') +
          ' title="Révèle DEF, Dégâts et XP de l\'adversaire ciblé">Analyse</button>' +
    '</div>';
  }

  function renderCard(c) {
    // Garde-fous : un combattant persisté incomplet ne doit jamais faire planter
    // le rendu (sinon tout le plateau disparaît). On comble les sous-objets requis.
    if (!c.states) c.states = { affaibli: false, auSol: false, feu: false, blindage: false, onde: false, ciblage: false, brise: false, faille: false, poison: 0 };
    if (c.states.brise === undefined) c.states.brise = false;
    if (c.states.faille === undefined) c.states.faille = false;
    if (c.states.poison === undefined) c.states.poison = 0;
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
    if (c.side === 'hero' && !dead && !c.used.action) cls.push('has-action');
    // Cible valide pendant le ciblage au clic (attaque ou analyse)
    if (pendingAttack && !dead) {
      const attacker = byId(pendingAttack.iid);
      if (attacker && attacker.side !== c.side) {
        if (pendingAttack.multi) {
          // Cibles multiples d'une même zone : après la 1re cible, on verrouille la zone.
          const okZone = (pendingAttack.zone == null) || c.zone === pendingAttack.zone;
          const notPicked = (pendingAttack.picked || []).indexOf(c.iid) === -1;
          if (okZone && notPicked) cls.push('targetable');
          if ((pendingAttack.picked || []).indexOf(c.iid) !== -1) cls.push('multi-picked');
        } else cls.push('targetable');
      }
    }
    if (pendingAnalyze && !dead && c.side === 'monster' && !c.analyzed) cls.push('targetable');

    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;   // stats ennemies cachées avant Analyse
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');
    // Carte de zone = « bouton » épuré : nom + barre de PV (+ états / statut).
    // La classe, la DEF, le blindage, « Rapide », les pastilles et les attaques
    // ne s'affichent plus ici : tout cela figure dans le bandeau d'action
    // lorsque le combattant est sélectionné.
    // Pastille bleue (coin haut-droit) : aventurier actif n'ayant pas encore
    // utilisé son Action / Attaque ce tour. Disparaît une fois l'action faite.
    const actionDot = (!isEnemy && !dead && !c.used.action)
      ? '<span class="action-dot" title="Action / Attaque non utilisée"></span>' : '';
    const initial = (c.name || '?').charAt(0).toUpperCase();
    const avatarStyle = c.imageUrl
      ? ' style="background-image:url(\'' + c.imageUrl.replace(/'/g, '%27') + '\');background-size:cover;background-position:center;"'
      : '';
    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      actionDot +
      '<div class="cc-top-row">' +
        '<div class="cc-avatar"' + avatarStyle + ' aria-hidden="true">' + (c.imageUrl ? '' : esc(initial)) + '</div>' +
        '<div class="cc-body">' +
          '<div class="cc-head"><span class="roster-name">' + esc(c.name) + '</span>' +
            (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
          '</div>' +
          '<div class="cc-pvline">' +
            '<div class="pv-bar"><div class="pv-fill" style="width:' + pct + '%"></div>' +
              '<span class="pv-text">' + pvText + '</span></div>' +
            (known ? '<span class="cc-def-icon">' + defShield(c.states.auSol ? 0 : c.def) + '</span>' : '') +
          '</div>' +
          (statesBadges(c) ? '<div class="cc-states">' + statesBadges(c) + '</div>' : '') +
        '</div>' +
      '</div>';

    html += '</div>';
    return html;
  }

  // Cœur d'exécution d'une attaque (sans rendu) — réutilisé par l'UI et l'auto-combat
  function applyAttack(attacker, atkIndex, target) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (attacker.attackUses[atkIndex] === 0) return;
    if (!atk.freeAction && attacker.used.action) return;
    // POISON X : inflige X dégâts avant d'attaquer
    applyPoison(attacker);
    if (attacker.status !== 'active') return;
    const enemySide = attacker.side === 'hero' ? 'monster' : 'hero';
    let targets = (atk.targets === 'all')
      ? activeOf(enemySide).filter(function (t) { return canReach(attacker, t, atk); })
      : (target ? [target] : []);
    // Frappe Tournoyante : limitée aux adversaires de la zone de l'aventurier.
    if (atk.zoneOnly) targets = targets.filter(function (t) { return t.zone === attacker.zone; });
    targets.forEach(function (t) { resolveAttack(attacker, t, atk); });
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) attacker.used.action = true;
  }

  // Attaque à cibles multiples (talent Double Attaque) : frappe plusieurs
  // adversaires d'une même zone avec les dégâts de l'arme.
  function applyMultiAttack(attacker, atkIndex, zoneIdx, iids) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (!atk.freeAction && attacker.used.action) return;
    // Attaque de contact : l'aventurier rejoint la zone ciblée (s'il le peut)
    if (atk.range === 'contact' && attacker.zone !== zoneIdx) {
      if (attacker.used.move) { alert('Vous ne pouvez pas atteindre cette zone.'); return; }
      doMove(attacker, zoneIdx, true);
      if (attacker.status !== 'active') return;
      movePrefix = { iid: attacker.iid, zone: zname(zoneIdx) };
    }
    iids.forEach(function (iid) {
      const t = byId(iid);
      if (t && t.status === 'active') resolveAttack(attacker, t, atk);
    });
    if (attacker.attackUses[atkIndex] !== null && attacker.attackUses[atkIndex] !== undefined) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) attacker.used.action = true;
  }
  function execHeroMultiAttack(attacker, atkIndex, zoneIdx, iids) {
    applyMultiAttack(attacker, atkIndex, zoneIdx, iids);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // Version UI : applique puis rafraîchit
  function execHeroAttack(attacker, atkIndex, target) {
    applyAttack(attacker, atkIndex, target);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // Action de soin auto-ciblée (talents soin_fixe / soin_endu / soin_des).
  function applySelfHeal(c, atkIndex) {
    const atk = c.attacks[atkIndex];
    if (!atk) return;
    if (!atk.freeAction && c.used.action) return;
    // POISON X : inflige X dégâts avant d'utiliser un talent de soin
    applyPoison(c);
    if (c.status !== 'active') return;
    const before = c.pv;
    let heal = 0, detail = '';
    if (atk.selfHeal === 'soin_fixe') {
      heal = atk.healVal || 0;
    } else if (atk.selfHeal === 'soin_endu') {
      heal = (c.endu || 0) + (atk.healVal || 0);
      detail = ' <span class="ldice">(ENDU ' + (c.endu || 0) + (atk.healVal ? ' + ' + atk.healVal : '') + ')</span>';
    } else if (atk.selfHeal === 'soin_des') {
      const n = Math.max(1, atk.healVal || 1); const rolls = [];
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(dnum(v, 'green')); heal += v; }
      detail = ' <span class="ldice">(' + rolls.join('<span class="dplus">+</span>') + ')</span>';
    }
    c.pv = Math.min(c.maxPv, c.pv + heal);
    const gained = c.pv - before;
    pushFx({ type: 'heal', iid: c.iid, amount: gained, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' utilise <span class="lwpn">' + nm(attackLabel(atk)) + '</span> et récupère ' +
      amt(gained, 'heal') + ' PV' + detail + '.', 'heal');
    if (!atk.freeAction) c.used.action = true;
  }
  function execHeroSelfHeal(c, atkIndex) {
    applySelfHeal(c, atkIndex);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // Résout les dégâts moyens garantis (sans dé, sans risque d'échec)
  function resolveAverageAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
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
    if (atk.range === 'distance' && attacker.side === 'hero') {
      enemyZoneMates(attacker).forEach(function (m) {
        if (m.iid === target.iid && target.pv <= 0) return;
        if (attacker.status === 'active') dchocFrom(m, attacker, 'distance');
      });
    }
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
          // Révèle tous les adversaires du même nom de base (ex : "Répurgateur")
          const baseName = c.name.replace(/\s*\d+$/, '').trim();
          const combat_ = combat();
          const firstTime = !c.analyzed;
          let revealed_ = 0;
          combat_.combatants.forEach(function (m) {
            if (m.side === 'monster' && m.name.replace(/\s*\d+$/, '').trim() === baseName) {
              m.analyzed = true; revealed_++;
            }
          });
          hero.used.move = true;
          // Chaque groupe nommé n'est analysable qu'une fois : +2 XP au groupe.
          if (firstTime) combat_.analyzeXp = (combat_.analyzeXp || 0) + 2;
          log(cname(hero) + ' analyse ' + esc(baseName) + (revealed_ > 1 ? ' (' + revealed_ + ' adversaires révélés)' : '') +
            ' : DEF, Dégâts et XP révélés' + (firstTime ? ' <span class="atk-dmg">+2 XP</span>' : '') + '.', 'move');
          Store.save(); render(); return;
        }
        // 2) Ciblage d'une attaque à cibles multiples (talent Double Attaque)
        if (targetable && pendingAttack && pendingAttack.multi) {
          const attacker = byId(pendingAttack.iid);
          if (!attacker) return;
          if (pendingAttack.zone == null) pendingAttack.zone = c.zone;
          if (pendingAttack.picked.indexOf(c.iid) === -1) pendingAttack.picked.push(c.iid);
          const remaining = activeOf('monster').filter(function (m) {
            return m.zone === pendingAttack.zone && pendingAttack.picked.indexOf(m.iid) === -1;
          });
          if (pendingAttack.picked.length >= pendingAttack.multi || remaining.length === 0) {
            execHeroMultiAttack(attacker, pendingAttack.atkIndex, pendingAttack.zone, pendingAttack.picked.slice());
          } else { Store.save(); render(); }
          return;
        }
        // 2) Ciblage d'une attaque
        if (targetable && pendingAttack) {
          const attacker = byId(pendingAttack.iid);
          if (!attacker) return;
          const atk = attacker.attacks[pendingAttack.atkIndex];
          // Assaut Mobile (freeMove) : le déplacement est gratuit (ne consomme pas le mouvement)
          // et peut s'enchaîner même si le mouvement a déjà été utilisé ce tour.
          if (atk && atk.range === 'contact' && attacker.zone !== c.zone) {
            if (!atk.freeMove && attacker.used.move) { alert('Vous ne pouvez pas atteindre cet adversaire.'); return; }
            const prevMove = attacker.used.move;
            doMove(attacker, c.zone, true);
            if (atk.freeMove) attacker.used.move = prevMove;
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

    // Retirer un état (clic sur un badge dans la carte)
    root.querySelectorAll('.state-badge[data-iid="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const s = b.getAttribute('data-state');
        if (s === 'poison') { c.states.poison = 0; } else { c.states[s] = false; }
        Store.save(); render();
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
          // Action de soin (auto-ciblée) : se résout immédiatement, sans ciblage.
          if (atk.selfHeal) { execHeroSelfHeal(c, i); return; }
          if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average) {
            pendingAttack = null; render(); return; // re-clic = annuler
          }
          if (atk.multiTarget) {
            pendingAttack = { iid: c.iid, atkIndex: i, average: false, multi: atk.multiTarget, picked: [], zone: null };
            pendingAnalyze = null; pendingMove = null; stateMenuFor = null; render();
          } else if (atk.targets === 'all') { execHeroAttack(c, i, null); }
          else { pendingAttack = { iid: c.iid, atkIndex: i, average: false }; pendingAnalyze = null; stateMenuFor = null; render(); }
        });
      });
      // Boutons de réaction (talents violets)
      root.querySelectorAll('.ab-atk-react[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          execHeroReaction(c, b.getAttribute('data-react'));
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
      // AU SOL : Se relever (consomme le mouvement, retire l'état)
      const standup = root.querySelector('.do-standup[data-iid="' + c.iid + '"]');
      if (standup) standup.addEventListener('click', function () {
        if (c.used.move) return;
        c.states.auSol = false; c.used.move = true;
        log(cname(c) + ' se relève (retire <span class="lstate">Au sol</span>).', 'state');
        pushFx({ type: 'state', iid: c.iid });
        Store.save(); render();
      });
      // Mouvement : arme le déplacement, puis on clique la zone de destination
      const mv = root.querySelector('.do-move[data-iid="' + c.iid + '"]');
      if (mv) mv.addEventListener('click', function () {
        if (c.used.move && !c.freeMoveReady) return;
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
    const root = $(rootSel);
    const box = root ? root.querySelector('#phase-controls') : null;
    if (!box) return;
    const c = combat();
    if (c.outcome) {
      const won = c.outcome !== 'defeat';
      box.innerHTML = '<button id="pc-finish" class="primary big result-btn">📊 Résultat du Combat</button>';
      box.querySelector('#pc-finish').addEventListener('click', function () { endCombat(won); });
      return;
    }
    if (c.phase === 'heroes') {
      box.innerHTML = ''; // bouton "Tour des Adversaires" déplacé dans la barre de combat
    } else {
      box.innerHTML =
        '<button id="pc-ai" class="primary">▶ Activer les adversaires (auto)</button>' +
        '<button id="pc-endturn" class="ghost">Fin du tour de combat ⟳</button>';
      box.querySelector('#pc-ai').addEventListener('click', monsterAI);
      box.querySelector('#pc-endturn').addEventListener('click', endTurn);
    }
  }

  function renderLog() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-log') : null;
    if (!box) return;
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
  function startInSession(heroIds, sceneCombat, sessionCtx, sel, gains) {
    combatKey = 'combat';
    rootSel = sel || '#combat-root';
    sessionGains = gains || null;
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
    sessionGains = null;  // les instances sont figées : on ne garde pas l'overlay
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
