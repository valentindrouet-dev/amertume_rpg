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

  // Effets visuels de combat (VFX). Pour désactiver un effet, mettre sa clé à
  // false (par son nom) — accessible aussi à chaud via Combat.vfx.<nom> = false.
  //   contact   : Attaque Contact (estafilade sur la cible)
  //   distance  : Attaque Distance (projectile attaquant → cible)
  //   brulure   : Brûlure (halo de feu sur les combattants en FEU)
  //   mouvement : Mouvement (glissement de la carte d'une zone à l'autre)
  //   critique  : Critique (secousse de l'écran / screen shake)
  const VFX = { contact: true, distance: true, brulure: true, mouvement: true, critique: true };
  // Positions des cartes capturées juste avant un re-rendu (pour le glissement
  // de mouvement façon FLIP).
  let preMoveRects = {};

  // Sélections de l'écran de préparation (Combat Test)
  let setupHeroes = {};      // { heroId: true }
  let setupZones = [{ name: 'Zone 1', monsters: [] }, { name: 'Zone 2', monsters: [] }]; // [{name, monsters:[{templateId,count}]}]
  let setupMapId = '';   // Combat Test : carte d'affrontement choisie ('' = grille classique)
  let setupHeroZone = 0;     // index de la zone de départ des aventuriers

  // État d'interaction du plateau
  let pendingAttack = null;   // { iid, atkIndex } quand on choisit une cible au clic
  let pendingMove = null;     // iid du combattant en cours de déplacement
  let moveAsAction = false;   // le déplacement en cours consomme l'ACTION (talent « Course ») au lieu du mouvement
  let arrivalTargetIid = null; // adversaire précis visé par les effets d'arrivée (clic sur sa carte)
  let pendingObject = null;   // iid de l'aventurier consommant son objet (choisit une cible)
  let pendingReaction = null; // iid de l'aventurier dont une Réaction interrompt le tour des adversaires
  let aiResume = null;        // reprise de la séquence adverse en pause (Réaction)
  let pendingAnalyze = null;  // iid de l'aventurier en cours d'analyse (choisit une cible)
  let pendingOrbeShare = null; // iid du Mystique répartissant ses Orbes Partagés (clic sur alliés)
  // Attaque « Orbe » du Mystique. `pyromaneOrb` est l'ancien nom du marqueur :
  // les combats déjà en cours au moment de la refonte restent jouables.
  function isOrbAttack(a) { return !!(a && (a.orbeMystique || a.pyromaneOrb)); }
  // Suffixe du nom de l'attaque selon l'élément des Orbes Élémentaires.
  const ORB_ELEMENT_NAME = {
    feu: 'de Feu', gele: 'de Glace', poison: 'de Poison',
    affaibli: 'Débilitants', brise: 'Fracassants', faille: 'de Faille', auSol: 'de Choc',
  };
  function ORB_ELEMENT_SUFFIX(st) { return ORB_ELEMENT_NAME[st] || 'Mystiques'; }
  // Choix (état) porté par un effet dans une liste de talents résolus.
  // Élément des Orbes d'un combattant (Orbes Élémentaires) — 'feu' par défaut
  // pour les anciens « Orbe de Feu », null si l'aventurier n'a pas le talent.
  function orbElementOf(c) {
    if (!c || !Array.isArray(c.attacks)) return null;
    const a = c.attacks.find(isOrbAttack) || c.attacks.find(function (x) { return x && x.deflagration; });
    return (a && a.orbElement) || null;
  }
  function orbElementLabel(st) {
    const M = { feu: 'Feu', gele: 'Gelé', poison: 'Poison', affaibli: 'Affaibli', brise: 'Brisé', faille: 'Faille', auSol: 'Au sol' };
    return M[st] || st;
  }
  function talentChoiceOf(talents, effect) {
    const t = (talents || []).find(function (x) { return x.effect === effect; });
    return t ? (t.choice || null) : null;
  }
  let pendingDesignate = null; // iid du Gardien désignant ses alliés Gardés (clic sur alliés, Pré-Tour 1)
  // File de choix joueur au CLIC (remplace les pop-up prompt/confirm des talents
  // « vous pouvez… »). Chaque choix : { casterIid, prompt, isValidTarget(c), onPick(c), allowSkip }.
  let choiceQueue = [];
  let activeChoice = null;
  let stateMenuFor = null;    // iid dont le menu « + état » est ouvert
  let selectedIid = null;     // combattant dont la fiche est affichée dans le bandeau d'action
  let movePrefix = null;      // { iid, zone } : déplacement à fusionner avec l'attaque qui suit
  let rootSel = '#combat-root'; // cible de rendu (redirigée pendant un combat de session)
  let sessionGains = null;    // { heroId: { endu, damage, talents:[] } } pour le combat courant
  let combatHeroLevel = 1;    // niveau du groupe (pour ENDURCISSEMENT)

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
    choiceQueue = []; activeChoice = null;
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
    const heroLevel = Math.max(1, combatHeroLevel || 1);
    const attacks = Combatants.heroCombatAttacks(hero);
    const talents = Combatants.resolveHeroTalents(Array.isArray(hero.chosenTalents) ? hero.chosenTalents : null);
    // TALENT D'ESPÈCE : accordé d'office, sans occuper d'emplacement de talent.
    const espTal = Combatants.speciesTalent ? Combatants.speciesTalent(hero) : null;
    if (espTal && !talents.some(function (t) { return t.effect === espTal.effect; })) talents.push(espTal);
    const hasTalent = function (e) { return talents.some(function (t) { return t.effect === e; }); };
    // ORBES MYSTIQUES (Mystique) : nombre d'Orbes par tour = 2 + 1 par niveau impair (3, 5, 7…).
    // Le nom de l'attaque devient « X Orbes Mystiques » (varie avec le niveau).
    // Les améliorations/maîtrises d'Orbe se cumulent ici (élément, double dé, bonus, perçant, critique).
    if (hasTalent('orbes_mystiques')) {
      const orbs = 2 + Math.floor((Math.max(1, combatHeroLevel) - 1) / 2);
      const per = hasTalent('orbe_double') ? 2 : 1;
      // ORBES ÉLÉMENTAIRES : l'état infligé est au choix (Feu par défaut, ce qui
      // couvre l'ancien « Orbe de Feu » migré sans choix explicite).
      const orbElem = hasTalent('orbe_element') ? (talentChoiceOf(talents, 'orbe_element') || 'feu') : null;
      const orbBonus = hasTalent('orbe_bonus_dmg');
      const orbIgnoreDef = hasTalent('orbe_ignore_def'), orbCrit = hasTalent('orbe_critique');
      attacks.forEach(function (a) {
        if (isOrbAttack(a)) {
          a.uses = orbs;
          a.freeAction = true; // les Orbes sont GRATUITS : ne consomment jamais l'action du tour
          a.name = orbs + ' Orbe' + (orbs > 1 ? 's' : '') +
            (orbElem ? ' ' + ORB_ELEMENT_SUFFIX(orbElem) : ' Mystique' + (orbs > 1 ? 's' : ''));
          a.dice = Object.assign(D.emptyPool(), { blue: per });
        }
        if (isOrbAttack(a) || a.deflagration) {
          if (orbElem) {
            a.effects = a.effects || {};
            if (orbElem === 'poison') a.effects.poison = (a.effects.poison || 0) + 1;
            else a.effects[orbElem] = true;
            a.orbElement = orbElem;
          }
          if (orbBonus) a.useOwnDamage = true;
          if (orbIgnoreDef) a.orbIgnoreDef = true;
          a.orbNoCrit = !orbCrit;   // par défaut un Orbe ne fait pas de critique
          a.orbPer = per;           // nb de dés bleus par orbe (pour la Déflagration)
        }
      });
    }
    // Objet consommable équipé : on en garde une copie légère pour le combat.
    const eq = Combatants.normalizeEquip(h.equipment || {});
    const objTpl = eq.objectId ? Store.state.items.find(function (it) { return it.id === eq.objectId; }) : null;
    const objectItem = (objTpl && (objTpl.category === 'object' || objTpl.category === 'misc' || objTpl.category === 'ammo'))
      ? { id: objTpl.id, name: objTpl.name, objEffect: objTpl.objEffect || 'none', objDice: objTpl.objDice || 0, objBenefic: objTpl.objBenefic !== false,
          ammoColor: objTpl.ammoColor || 'white', parchEffect: objTpl.parchEffect || '', parchVal: objTpl.parchVal || 0 }
      : null;
    // RENFORCEMENT (amélioration) : +bonus de dégâts au maximum (et au courant) de PV.
    const renf = hasTalent('renforcement') ? Math.max(0, hero.damage || 0) : 0;
    // SURVIVALISTE (maîtrise) : ajoute la VIE au bonus de dégâts.
    const surv = hasTalent('survivaliste') ? Math.max(0, hero.vie || 0) : 0;
    // ENDURCISSEMENT (amélioration) : +1 ENDU par Niveau.
    const endurHard = hasTalent('endurcissement') ? Math.max(0, combatHeroLevel) : 0;
    // Bouclier équipé (item « armure » de slot 'shield', en main ou en armure).
    const hasShield = [eq.mainG, eq.mainD, eq.armorId].some(function (id) {
      if (!id) return false;
      const it = Store.state.items.find(function (x) { return x.id === id; });
      return !!(it && it.category === 'armor' && it.slot === 'shield');
    });
    // États en attente (conséquence d'un test de scène raté) : appliqués au
    // démarrage du combat, posés par session.js dans Store.state.pendingCombatStates.
    const initStates = { affaibli: false, auSol: false, feu: 0, gele: 0, blindage: hasTalent('blindage_initial'), onde: false, ciblage: false, brise: false, faille: false, garde: false, poison: 0, prepare: hasTalent('prepare_initial'), invisible: hasTalent('invisibilite') };
    const pendStates = (Store.state.pendingCombatStates && Store.state.pendingCombatStates[h.id]) || [];
    pendStates.forEach(function (k) {
      // Feu / Gelé / Poison sont cumulables : chaque occurrence ajoute un cran.
      if (STACK_STATES[k]) initStates[k] = (initStates[k] || 0) + 1;
      else if (k in initStates) initStates[k] = true;
    });
    return {
      iid: 'H' + i + '-' + h.id.slice(-4),
      side: 'hero', templateId: h.id, name: h.name, klass: Combatants.normKlass(h.klass), gender: h.gender || 'a', endu: (hero.endu || 1) + endurHard, imageUrl: h.imageUrl || null,
      maxPv: Combatants.heroPv(hero) + renf, pv: Combatants.heroCurPv(hero) + renf,
      def: Combatants.heroDef(hero), damage: (hero.damage || 0) + surv, xp: 0, type: 'hero',
      menace: null, esquive: hasTalent('esquive_innee') || hasTalent('esquive_6') || false, rapide: !!h.rapide, socle: 'medium',
      level: heroLevel,                 // niveau du groupe, figé au lancement du combat
      hasShield: hasShield,             // COUP DE BOUCLIER : +1 dé rouge si bouclier
      attacks: attacks, attackUses: initUses(attacks),
      talents: talents,                 // talents résolus (kind/effect/val) pour le moteur
      reactUsed: {},                    // réactions déjà déclenchées dans le tour courant
      freeMoveReady: hasTalent('pas_leger'), // PAS LÉGER : mouvement gratuit dispo dès le 1er tour
      freeMoves: 0,                     // REBOND : compteur de mouvements gratuits supplémentaires
      objectItem: objectItem,           // objet consommable équipé (null si aucun)
      lastBreathUsed: false,            // DERNIER SOUFFLE : ignore le coma 1×/combat
      states: initStates,
      used: { action: false, move: false, object: false },
      zone: 0, status: Combatants.heroCurPv(h) > 0 ? 'active' : 'coma',
      dmgDealt: 0, dmgTaken: 0,
    };
  }

  function instFromMonster(m, i) {
    // Armes équipées → attaques (avec effets) + attaques spéciales ; armures → DEF
    const attacks = Combatants.monsterCombatAttacks(m);
    // FUSION : effets d'aventurier attribués à l'adversaire (appliqués par le moteur).
    const advTalents = Combatants.resolveMonsterAdvTalents ? Combatants.resolveMonsterAdvTalents(m) : [];
    const hasEsquiveEff = advTalents.some(function (t) { return t.effect === 'esquive_innee' || t.effect === 'esquive_6'; });
    // RENFORCEMENT : le maximum de PV augmente du bonus de dégâts.
    const renfort = advTalents.some(function (t) { return t.effect === 'renforcement'; }) ? (m.damage || 0) : 0;
    return {
      iid: 'M' + i + '-' + m.id.slice(-4),
      side: 'monster', templateId: m.id, name: m.name, imageUrl: m.imageUrl || null,
      maxPv: m.pv + renfort, pv: m.pv + renfort,
      def: Combatants.monsterTotalDef(m), damage: m.damage, xp: m.xp, type: m.type,
      menace: m.menace, esquive: !!m.esquive || hasEsquiveEff, rapide: !!m.rapide, socle: m.socle,
      behaviors: Array.isArray(m.behaviors) ? m.behaviors.slice() : [],
      attacks: attacks, attackUses: initUses(attacks),
      talents: advTalents,
      talentLabels: Combatants.monsterTalentLabels(m),
      states: { affaibli: false, auSol: false, feu: 0, gele: 0, blindage: false, onde: false, ciblage: false, brise: false, faille: false, poison: 0, prepare: advTalents.some(function (t) { return t.effect === 'prepare_initial'; }), invisible: advTalents.some(function (t) { return t.effect === 'invisibilite'; }) },
      blindageCharges: 0,
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
        return { name: z.name || '', monsterRefs: (z.monsterRefs || []).filter(function (r) { return r.monsterId || r.monName; }) };
      }),
      barriers: normalizeBarriers(src && src.barriers),
      heroStartZone: hsi,
      // Placement par aventurier (ex. testeurs ayant échoué dans une autre zone).
      heroStartMap: (src && src.heroStartMap) || null,
    };
  }

  // Résout la fiche d'un adversaire référencé dans une zone : par id, puis, à
  // défaut (id périmé après un partage / import / duplication / recréation), par
  // NOM. Évite les combats « vides » où un adversaire configuré n'apparaît pas.
  function monNorm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }
  function monsterTplFor(ref) {
    if (!ref) return null;
    const find = function (pred) {
      return Store.findMonster ? Store.findMonster(pred) : (Store.state.monsters.find(pred) || null);
    };
    let t = ref.monsterId ? find(function (m) { return m.id === ref.monsterId; }) : null;
    if (!t && ref.monName) {
      const nm = monNorm(ref.monName);
      t = find(function (m) { return monNorm(m.name) === nm; });
    }
    return t || null;
  }
  // Assemble les combattants en plaçant chacun dans sa zone
  function buildCombat(heroObjs, cfg) {
    const zones = (cfg.zones || []).map(function (z) {
      return { name: z.name || '', rect: z.rect || null };
    });
    if (!zones.length) zones.push({ name: 'Zone 1' });
    zones.forEach(function (z, i) { if (!z.name) z.name = 'Zone ' + (i + 1); });
    const heroZone = Math.min(Math.max(0, cfg.heroStartZone || 0), zones.length - 1);
    const clampZone = function (z) { return Math.min(Math.max(0, z || 0), zones.length - 1); };
    const startMap = cfg.heroStartMap || null;
    const combatants = [];
    heroObjs.forEach(function (h, i) {
      const inst = instFromHero(h, i);
      inst.zone = (startMap && startMap[h.id] != null) ? clampZone(startMap[h.id]) : heroZone;
      combatants.push(inst);
    });
    // Numérotation globale par template : on compte d'abord le total d'exemplaires
    // de chaque adversaire sur tout le combat (toutes zones confondues), puis on
    // numérote en continu — sans « # » et indépendamment de la zone, car un
    // adversaire peut changer de zone (« Répurgateur 2 »).
    const totalByTpl = {};
    (cfg.zones || []).forEach(function (z) {
      (z.monsterRefs || []).forEach(function (ref) {
        const tpl = monsterTplFor(ref);
        if (!tpl) return;
        totalByTpl[tpl.id] = (totalByTpl[tpl.id] || 0) + (ref.count || 1);
      });
    });
    const seqByTpl = {};
    let mi = 0;
    (cfg.zones || []).forEach(function (z, zi) {
      (z.monsterRefs || []).forEach(function (ref) {
        const tpl = monsterTplFor(ref);
        if (!tpl) { console.warn('[combat] Adversaire introuvable pour la zone', z.name, '— ref:', ref); return; }
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
    armPrepared(combatants); // PRÉPARÉ au tour 1 (talent Vivacité / états de scène en attente)
    // CARTE LIBRE : la disposition (grille cols×rows) et le graphe des liens
    // remplacent les barrières « par paire » — deux zones non reliées reçoivent
    // une barrière infranchissable IMPLICITE (jamais dessinée) : tout le moteur
    // (déplacements, BFS des adversaires, visée, téléportation) suit sans retouche.
    let barriers = normalizeBarriers(cfg.barriers);
    if (cfg.layout && Array.isArray(cfg.zoneLinks)) {
      barriers = {};
      const linked = {};
      cfg.zoneLinks.forEach(function (l) {
        if (l == null || l.a == null || l.b == null || l.a === l.b) return;
        const key = barrierKey(l.a, l.b);
        linked[key] = true;
        if (l.barrier && l.barrier.type && l.barrier.type !== 'none') {
          barriers[key] = {
            type: migrateBarrierType(l.barrier.type),
            difficulty: l.barrier.diff || l.barrier.difficulty || 'moyen',
            name: l.barrier.name || '',
          };
        }
      });
      for (let a = 0; a < zones.length; a++) {
        for (let b = a + 1; b < zones.length; b++) {
          const key = barrierKey(a, b);
          if (!linked[key]) barriers[key] = { type: 'infranchissable', implicit: true };
        }
      }
    }
    const fresh = { turn: 1, phase: 'heroes', bonusXp: 0, analyzeXp: 0, noDmgXp: 0, zones: zones,
      layout: cfg.layout || null,
      barriers: barriers,
      combatants: combatants, log: [], outcome: null };
    // Instantané de départ : permet de RECOMMENCER le combat à l'identique.
    try { fresh.initial = JSON.parse(JSON.stringify(fresh)); } catch (e) { fresh.initial = null; }
    setCombat(fresh);
  }

  function startCombat() {
    lastRoll = null; rollActive = false; autoSelectOff = false;   // pool vide et sélection auto au départ
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
    // CARTE D'AFFRONTEMENT : formes, disposition et liens viennent de la carte.
    if (setupMapId && global.Cartes && Cartes.mapToConfig) {
      const mp = (Store.loadBattleMaps() || []).find(function (x) { return x.id === setupMapId; });
      if (mp) {
        const mc = Cartes.mapToConfig(mp);
        cfg.layout = mc.layout;
        cfg.zoneLinks = mc.zoneLinks;
        cfg.heroStartZone = mc.heroStartZone;
        cfg.zones = mc.zones.map(function (z, i) {
          return {
            name: z.name, rect: z.rect, heroStart: z.heroStart,
            monsterRefs: ((setupZones[i] || {}).monsters || []).map(function (mm) {
              return { monsterId: mm.templateId, count: mm.count };
            }),
          };
        });
      }
    }
    buildCombat(heroObjs, cfg);
    log('Début du combat — Tour 1.', 'turn');
    announceInvisibles();
    designateMarkedHero(); // PROIE : désigne la cible du Tour 1
    if (needsPretour()) {
      startPretour();
    }
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
      // Aventurier déjà au maximum et debout : aucun soin, aucune ligne au tableau.
      if (!wasDown && h.pv >= h.maxPv) return;
      const roll = 1 + Math.floor(Math.random() * 6) + (h.endu || 0);
      const before = Math.max(0, h.pv);
      if (wasDown) {
        h.pv = Math.min(h.maxPv, roll);
        h.status = 'active';
      } else {
        h.pv = Math.min(h.maxPv, h.pv + roll);
      }
      c.healLines.push({ name: h.name, pv: h.pv, gained: h.pv - before, wasDown: wasDown });
    });
    // Bonus +1 XP par aventurier n'ayant subi aucun dégât pendant le combat
    c.noDmgXp = unscathedHeroes().length;
    // GARDE SECRÈTE : chaque allié GARDÉ ayant conservé son Blindage → +2 XP.
    if (finalize && c.combatants.some(function (h) { return h.side === 'hero' && heroHasTalent(h, 'garde_secrete'); })) {
      const kept = c.combatants.filter(function (h) { return h.side === 'hero' && h.states && h.states.garde && hasBlindage(h); }).length;
      if (kept > 0) {
        c.bonusXp = (c.bonusXp || 0) + kept * 2;
        log('<b class="lreact">Garde Secrète</b> : +' + (kept * 2) + ' XP (' + kept + ' allié(s) Gardé(s) ont conservé leur Blindage).', 'turn');
      }
    }
    c.finalize = !!finalize;
    c.lootResults = finalize ? rollLoot(c) : [];
    c.finished = true;
    pendingAttack = null; pendingMove = null; stateMenuFor = null;
    Store.save();
    renderSummary();
  }

  // Tirage du butin sur les adversaires vaincus
  // Aventurier au hasard ne possédant pas encore l'objet (à défaut, n'importe lequel).
  // Utilisé quand aucun aventurier n'est à l'origine de la mort (dégâts de Feu, etc.).
  function randomLootHero(c, itemId) {
    const heroes = c.combatants.filter(function (x) { return x.side === 'hero'; });
    if (!heroes.length) return null;
    let owned = {};
    try {
      const ctx = Store.state.sessionCombat;
      if (ctx && ctx.sessionId) {
        const ses = Store.loadSessions().find(function (s) { return s.id === ctx.sessionId; });
        if (ses && ses.heroOwned) owned = ses.heroOwned;
      }
    } catch (e) { owned = {}; }
    const eligible = heroes.filter(function (h) { const set = owned[h.templateId] || {}; return !(set[itemId] > 0); });
    const pool = eligible.length ? eligible : heroes;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Or lâché par les adversaires vaincus (champ goldLoot du bestiaire, valeur fixe
  // ou en dés). On tire une seule fois par adversaire (cache sur l'instance) pour
  // que l'affichage du résumé et l'attribution effective coïncident.
  function totalGoldLoot(c) {
    let g = 0;
    c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'coma'; }).forEach(function (m) {
      const tpl = Store.state.monsters.find(function (t) { return t.id === m.templateId; });
      if (!tpl) return;
      if (typeof m.goldRolled !== 'number') m.goldRolled = Math.max(0, Store.rollAmount(tpl.goldLoot));
      g += m.goldRolled;
    });
    return g;
  }

  function rollLoot(c) {
    const out = [];
    c.combatants.filter(function (x) { return x.side === 'monster' && x.status === 'coma'; }).forEach(function (m) {
      const tpl = Store.state.monsters.find(function (t) { return t.id === m.templateId; });
      if (!tpl) return;
      const killer = m.killedBy ? c.combatants.find(function (x) { return x.iid === m.killedBy; }) : null;
      const killerHero = (killer && killer.side === 'hero') ? killer : null;
      // Destinataire : le tueur si c'est un aventurier ; sinon un aventurier au
      // hasard qui ne possède pas encore l'objet.
      function recipient(itemId) {
        const rh = killerHero || randomLootHero(c, itemId);
        return rh ? { toName: rh.name, toHeroId: rh.templateId } : { toName: null, toHeroId: null };
      }
      (tpl.equipment || []).forEach(function (r) {
        if (!r.itemId) return;
        if (Math.random() * 100 < (r.loot != null ? r.loot : 0)) {
          const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
          if (it) { const rc = recipient(r.itemId); out.push({ itemId: r.itemId, name: it.name, qty: 1, toName: rc.toName, toHeroId: rc.toHeroId }); }
        }
      });
      (tpl.loot || []).forEach(function (r) {
        if (!r.itemId) return;
        if (Math.random() * 100 < (r.loot != null ? r.loot : 0)) {
          const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
          // Quantité fixe OU en dés (« 2d6 ») : résolue au moment du butin.
          const qty = Math.max(1, Math.round(Store.rollAmount(r.qty == null ? 1 : r.qty)));
          if (it) { const rc = recipient(r.itemId); out.push({ itemId: r.itemId, name: it.name, qty: qty, toName: rc.toName, toHeroId: rc.toHeroId }); }
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
    // Or lâché par les adversaires vaincus (transmis à la session à la victoire).
    const goldGained = (isSession && c.outcome !== 'defeat') ? totalGoldLoot(c) : 0;
    if (isSession) persistHeroPv();
    setCombat(null);
    if (isSession) Store.state.sessionCombat = null;
    Store.save();
    // Sortie du combat EN PREMIER : on ne doit jamais rester bloqué sur l'écran
    // de résumé si un rafraîchissement secondaire (roster, progression) échoue.
    if (sessionCtx && sessionCtx.sessionId) {
      window.dispatchEvent(new CustomEvent('adventure-combat-end', {
        detail: { sessionId: sessionCtx.sessionId, outcome: outcomeLabel, xp: gained, gold: goldGained,
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
  // Appende du texte à la dernière entrée du journal (pour coller défaite/coma à la ligne des dégâts)
  function appendLastLog(html) {
    if (combat().log.length) combat().log[0].text += ' ' + html;
  }

  // ---------- Zones ----------
  function zones() { return combat().zones || []; }
  function zoneCount() { return Math.max(1, zones().length); }
  function zname(zi) { const z = zones()[zi]; return (z && z.name) ? z.name : ('Zone ' + (zi + 1)); }

  // ----- Barrières entre zones (modèle par paire, clé « min-max ») -----
  // OBSTRUANTE a été renommée MUR. On migre l'ancien type au vol.
  function migrateBarrierType(t) { return t === 'obstruante' ? 'mur' : t; }
  function barrierKey(a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + '-' + hi; }
  // Normalise les barrières d'une scène : accepte l'ancien tableau linéaire
  // (barriers[i] sépare la zone i et i+1) ou le nouvel objet { "min-max": {…} }.
  function normalizeBarriers(raw) {
    const out = {};
    if (Array.isArray(raw)) {
      raw.forEach(function (b, i) {
        if (b && b.type && b.type !== 'none') out[i + '-' + (i + 1)] = { type: migrateBarrierType(b.type), difficulty: b.difficulty || 'moyen', name: b.name || '' };
      });
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (k) {
        const b = raw[k];
        if (b && b.type && b.type !== 'none') out[k] = { type: migrateBarrierType(b.type), difficulty: b.difficulty || 'moyen', name: b.name || '' };
      });
    }
    return out;
  }
  function barrierBetween(a, b) {
    if (a === b) return null;
    const bars = (combat() && combat().barriers) || {};
    const bar = bars[barrierKey(a, b)];
    return (bar && bar.type && bar.type !== 'none') ? bar : null;
  }
  // Blocage de déplacement entre deux zones : 'block' (infranchissable/mur),
  // 'difficile' (test d'Agilité requis), ou null.
  function moveBarrier(a, b) {
    const bar = barrierBetween(a, b);
    if (!bar) return { type: null, diff: 'moyen' };
    if (bar.type === 'mur' || bar.type === 'infranchissable') return { type: 'block', diff: 'moyen' };
    if (bar.type === 'difficile') return { type: 'difficile', diff: bar.difficulty || 'moyen' };
    // INSTABLE : on franchit toujours, mais un test d'Agilité 1 raté fait arriver
    // AU SOL dans la zone visée.
    if (bar.type === 'instable') return { type: 'instable', diff: 'facile' };
    return { type: null, diff: 'moyen' };
  }
  // Le tir est bloqué uniquement par un MUR.
  function shootBlocked(a, b) {
    const bar = barrierBetween(a, b);
    return !!(bar && bar.type === 'mur');
  }

  // Routage entre zones : renvoie la PROCHAINE zone vers laquelle avancer d'un pas
  // pour rejoindre `toZone` (plus court chemin, BFS), en contournant les barrières
  // infranchissables (mur/infranchissable). Les barrières Difficiles restent des
  // arêtes praticables (franchies via un test au moment de s'y engager). Renvoie
  // `toZone` si l'accès est direct, ou -1 si aucune route n'existe. C'est ce qui
  // permet à un adversaire de contact de contourner un ravin par une zone libre au
  // lieu de rester bloqué face à lui.
  function zoneStep(fromZone, toZone) {
    if (fromZone === toZone) return toZone;
    // Accès direct (aucune barrière bloquante) : on y va tout de suite.
    if (moveBarrier(fromZone, toZone).type !== 'block') return toZone;
    const n = zoneCount();
    const prev = {}; const seen = {};
    seen[fromZone] = true;
    let queue = [fromZone];
    while (queue.length) {
      const z = queue.shift();
      for (let k = 0; k < n; k++) {
        if (seen[k] || k === z) continue;
        if (moveBarrier(z, k).type === 'block') continue; // barrière infranchissable
        seen[k] = true; prev[k] = z; queue.push(k);
        if (k === toZone) {
          let cur = k; // remonte jusqu'au premier pas depuis fromZone
          while (prev[cur] !== fromZone) cur = prev[cur];
          return cur;
        }
      }
    }
    return -1; // aucune route (cible totalement isolée par des murs)
  }

  // ----- Disposition des zones (carré 2x2) et séparateurs de barrière -----
  // Position [ligne, colonne] de chaque zone dans une grille 3x3 (les pistes
  // « auto » 2 et 2 servent de gouttières où l'on place les séparateurs).
  const ZONE_POS = { 1: [[1, 1]], 2: [[1, 1], [1, 3]], 3: [[1, 1], [1, 3], [3, 1]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]] };
  // Séparateurs sur les arêtes partagées entre zones adjacentes.
  const EDGE_SEPS = [
    { pair: [0, 1], row: 1, col: 2, dir: 'v' },
    { pair: [2, 3], row: 3, col: 2, dir: 'v' },
    { pair: [0, 2], row: 2, col: 1, dir: 'h' },
    { pair: [1, 3], row: 2, col: 3, dir: 'h' },
  ];
  const BARRIER_LABEL = { infranchissable: '⛔ Infranchissable', mur: '🧱 Mur', difficile: '⛰ Difficile',
    instable: '🌀 Instable' };
  const BARRIER_NAME = { infranchissable: 'INFRANCHISSABLE', mur: 'MUR', difficile: 'DIFFICILE',
    instable: 'INSTABLE' };
  // Nom affiché d'une barrière : nom personnalisé (MJ) sinon libellé du type.
  function barrierDisplayName(bar) {
    return (bar && bar.name && bar.name.trim()) ? bar.name.trim() : (BARRIER_NAME[bar && bar.type] || '');
  }
  function zonesGridStyle(n) {
    // minmax(0,1fr) et non 1fr : le min implicite d'une piste 1fr vaut `auto`,
    // si bien qu'une vignette au contenu large (nom long, pastilles d'état)
    // élargissait la colonne et faisait déborder le plateau sous le journal.
    if (n <= 1) return 'grid-template-columns:minmax(0,1fr);';
    if (n === 2) return 'grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);';
    // Rangées dimensionnées par leur contenu : une zone vide reste compacte
    // au lieu de s'étirer à la hauteur de la rangée la plus haute.
    return 'grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-rows:auto auto auto;';
  }
  // Paires « diagonales » (sans arête orthogonale) : 1-4 et 2-3 d'un carré 2x2.
  // Elles se croisent au centre de la grille (gouttière centrale).
  const DIAG_SEPS = [ { pair: [0, 3], dir: 'down-left' }, { pair: [1, 2], dir: 'down-right' } ];
  // ----- CARTE LIBRE : zones rectangulaires sur une grille cols×rows -----
  function freeGridStyle() {
    const L = combat().layout || { cols: 12, rows: 8 };
    return 'grid-template-columns:repeat(' + L.cols + ',minmax(0,1fr));' +
      'grid-template-rows:repeat(' + L.rows + ',var(--bm-cell, 58px));';
  }
  function zonesFreeCells() {
    const c = combat();
    const L = c.layout || { cols: 12, rows: 8 };
    const bars = c.barriers || {};
    const mover = pendingMove ? byId(pendingMove) : null;
    let html = '';
    zones().forEach(function (z, zi) {
      const r = z.rect || { x: 0, y: 0, w: 2, h: 2 };
      const teleports = mover && mover.side === 'hero' && heroHasTalent(mover, 'teleportation');
      const blocked = mover && mover.zone !== zi && !teleports && moveBarrier(mover.zone, zi).type === 'block';
      const movable = pendingMove && !blocked && (!mover || mover.zone !== zi);
      const atkr = pendingAttack ? byId(pendingAttack.iid) : null;
      const zoneAttackable = !!(atkr && !pendingMove &&
        (pendingAttack.blastZone || zoneAttackReach(atkr, zi)));
      const zTip = zoneAttackable
        ? ' title="Cliquez cette zone pour y frapper' + (anyInvisibleFoe() ? ' — de quoi débusquer un invisible (Perception 2)' : '') + '"'
        : '';
      html += '<div class="combat-zone zone-free' + (movable ? ' movable' : '') + (zoneAttackable ? ' zone-attackable' : '') +
        '" data-zone="' + zi + '"' + zTip +
        ' style="grid-column:' + (r.x + 1) + ' / span ' + r.w + ';grid-row:' + (r.y + 1) + ' / span ' + r.h + ';">' +
        '<div class="zone-name">' + esc(zname(zi)) + '</div>' +
        '<div class="zone-cards" id="zone-cards-' + zi + '"></div>' +
      '</div>';
    });
    // Connecteurs : portes (passage libre) et barrières, posés au POINT DE
    // CONTACT des deux zones (milieu de l'arête partagée ; à défaut, milieu du
    // segment entre les centres). Coordonnées en % de la grille — les rangées
    // sont uniformes, le positionnement absolu est donc exact.
    const zs = zones();
    const pt = function (a, b) {
      const ra = zs[a].rect, rb = zs[b].rect;
      if (!ra || !rb) return null;
      // Chevauchement des intervalles sur chaque axe (zones qui se touchent).
      const ox = [Math.max(ra.x, rb.x), Math.min(ra.x + ra.w, rb.x + rb.w)];
      const oy = [Math.max(ra.y, rb.y), Math.min(ra.y + ra.h, rb.y + rb.h)];
      if (ox[0] < ox[1] && (ra.y + ra.h === rb.y || rb.y + rb.h === ra.y)) {
        return { x: (ox[0] + ox[1]) / 2, y: ra.y + ra.h === rb.y ? rb.y : ra.y };
      }
      if (oy[0] < oy[1] && (ra.x + ra.w === rb.x || rb.x + rb.w === ra.x)) {
        return { x: ra.x + ra.w === rb.x ? rb.x : ra.x, y: (oy[0] + oy[1]) / 2 };
      }
      return { x: (ra.x + ra.w / 2 + rb.x + rb.w / 2) / 2, y: (ra.y + ra.h / 2 + rb.y + rb.h / 2) / 2 };
    };
    for (let a = 0; a < zs.length; a++) {
      for (let b = a + 1; b < zs.length; b++) {
        const bar = bars[barrierKey(a, b)];
        if (bar && bar.implicit) continue;             // mur implicite : rien à dessiner
        if (bar && bar.type && bar.type !== 'none') {  // barrière explicite
          const p2 = pt(a, b); if (!p2) continue;
          html += '<div class="zone-sep zone-sep-free barrier-' + bar.type + '"' +
            ' style="left:' + (p2.x / L.cols * 100) + '%;top:' + (p2.y / L.rows * 100) + '%;">' +
            '<span class="zone-sep-lbl">' + esc(barrierDisplayName(bar)) + '</span></div>';
        } else if (combat().layout) {                  // passage libre : porte discrète
          const p2 = pt(a, b); if (!p2) continue;
          html += '<div class="zone-door" title="Passage libre"' +
            ' style="left:' + (p2.x / L.cols * 100) + '%;top:' + (p2.y / L.rows * 100) + '%;"></div>';
        }
      }
    }
    return html;
  }

  function zonesGridCells() {
    const c = combat();
    const n = zoneCount();
    const bars = c.barriers || {};
    const pos = ZONE_POS[n] || ZONE_POS[1];
    const mover = pendingMove ? byId(pendingMove) : null;
    let html = '';
    zones().forEach(function (z, zi) {
      const p = pos[zi] || [1, 1];
      const teleports = mover && mover.side === 'hero' && heroHasTalent(mover, 'teleportation');
      const blocked = mover && mover.zone !== zi && !teleports && moveBarrier(mover.zone, zi).type === 'block';
      const movable = pendingMove && !blocked && (!mover || mover.zone !== zi);
      // ATTAQUE DE ZONE : toutes les zones atteignables sont mises en surbrillance
      // (on peut viser une zone au lieu d'une vignette — utile contre les invisibles).
      const atkr = pendingAttack ? byId(pendingAttack.iid) : null;
      const zoneAttackable = !!(atkr && !pendingMove &&
        (pendingAttack.blastZone || zoneAttackReach(atkr, zi)));
      // Infobulle de ciblage : remplace l'ancien bandeau (qui faisait sauter la page).
      const zTip = zoneAttackable
        ? ' title="Cliquez cette zone pour y frapper' + (anyInvisibleFoe() ? ' — de quoi débusquer un invisible (Perception 2)' : '') + '"'
        : '';
      html += '<div class="combat-zone' + (movable ? ' movable' : '') + (zoneAttackable ? ' zone-attackable' : '') + '" data-zone="' + zi + '"' + zTip +
        ' style="grid-row:' + p[0] + ';grid-column:' + p[1] + ';">' +
        '<div class="zone-name">' + esc(zname(zi)) + '</div>' +
        '<div class="zone-cards" id="zone-cards-' + zi + '"></div>' +
      '</div>';
    });
    EDGE_SEPS.forEach(function (e) {
      if (e.pair[0] >= n || e.pair[1] >= n) return;
      const bar = bars[e.pair[0] + '-' + e.pair[1]];
      if (!bar || !bar.type || bar.type === 'none') return;
      // Extension vers la case centrale (jonction pleine entre barrières).
      const ext = e.dir === 'v' ? (e.row === 1 ? 'down' : 'up') : (e.col === 1 ? 'right' : 'left');
      html += '<div class="zone-sep zone-sep-' + e.dir + ' sep-ext-' + ext + ' barrier-' + bar.type + '"' +
        ' style="grid-row:' + e.row + ';grid-column:' + e.col + ';"' +
        ' title="' + esc(barrierDisplayName(bar)) + ' — ' + (BARRIER_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + esc(barrierDisplayName(bar)) + '</span></div>';
    });
    // Séparateurs diagonaux (croix centrale) pour les paires 1-4 et 2-3.
    let diagHtml = '';
    DIAG_SEPS.forEach(function (d) {
      if (d.pair[0] >= n || d.pair[1] >= n) return;
      const bar = bars[d.pair[0] + '-' + d.pair[1]];
      if (!bar || !bar.type || bar.type === 'none') return;
      diagHtml += '<div class="zone-sep-diag ' + d.dir + ' barrier-' + bar.type + '"' +
        ' title="' + esc(barrierDisplayName(bar)) + ' — ' + (BARRIER_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + esc(barrierDisplayName(bar)) + '</span></div>';
    });
    if (diagHtml) html += '<div class="zone-sep-diag-wrap" style="grid-row:2;grid-column:2;">' + diagHtml + '</div>';
    return html;
  }
  // Agilité d'un combattant : aventurier → compétence ; adversaire → selon son type
  // (sbire 1, alpha/solitaire 2, boss 3).
  // ---------- ÉTATS CUMULABLES ----------
  // Feu, Gelé et Poison ne sont pas des drapeaux mais des COMPTEURS : chaque
  // nouvelle application ajoute un cran (Feu 1 → Feu 2 → …). Les sauvegardes
  // antérieures stockaient `feu: true` : lu comme 1.
  const STACK_STATES = { feu: true, gele: true, poison: true };
  function isStackState(s) { return !!STACK_STATES[s]; }
  function stateVal(c, s) {
    const v = c && c.states ? c.states[s] : 0;
    if (v === true) return 1;
    return v || 0;
  }
  function addStack(c, s, n) {
    if (!c || !c.states) return 0;
    c.states[s] = stateVal(c, s) + (n == null ? 1 : Math.max(0, n));
    return c.states[s];
  }
  // SURCOUCHE ÉLÉMENTAIRE : nombre de crans qu'une source pose quand elle
  // inflige un état cumulable (1 par défaut ; X si elle porte le talent pour
  // cet état). Fonctionne pour les aventuriers ET les adversaires.
  function stackApplyN(src, state) {
    if (!src || !Array.isArray(src.talents)) return 1;
    let n = 1;
    src.talents.forEach(function (t) {
      if (t.effect !== 'surcouche_etat') return;
      if ((t.choice || 'feu') !== state) return;
      const v = Math.round(Store.rollAmount(t.val == null || t.val === 0 ? 2 : t.val)) || 2;
      n = Math.max(n, Math.max(2, v));
    });
    return n;
  }
  // Libellé affiché : les états cumulables portent leur valeur (« Feu 2 »).
  function stateBadgeLabel(c, s) {
    return isStackState(s) ? stateLabel(s) + ' ' + stateVal(c, s) : stateLabel(s);
  }

  // ---------- GELÉ ----------
  // Gelé N empêche tout déplacement. Pour se libérer, le combattant tente un
  // test de FORCE N : chaque réussite retire un cran de Gelé, et le test réussi
  // (N réussites ou plus) le dégèle complètement.
  function forceOf(c) {
    if (c.side === 'monster') {
      if (c.type === 'boss') return 3;
      if (c.type === 'alpha' || c.type === 'solitaire') return 2;
      return 1;
    }
    const tpl = Store.state.heroes.find(function (h) { return h.id === c.templateId; });
    const base = (tpl && tpl.skills && tpl.skills['Force']) || 0;
    const g = sessionGains && sessionGains[c.templateId];
    return base + ((g && g.skills && g.skills['Force']) || 0);
  }
  function forceTest(c, need) {
    let toRoll = 1 + forceOf(c), succ = 0, guard = 0;
    while (toRoll > 0 && guard++ < 40) {
      let nx = 0;
      for (let i = 0; i < toRoll; i++) { const r = 1 + Math.floor(Math.random() * 6); if (r >= 4) succ++; if (r === 6) nx++; }
      toRoll = nx;
    }
    return { passed: succ >= need, succ: succ, need: need };
  }
  function isGele(c) { return stateVal(c, 'gele') > 0; }
  // La cible porte-t-elle l'état demandé ? (compteur > 0 pour les cumulables)
  function hasState(c, s) {
    if (!c || !c.states) return false;
    return isStackState(s) ? stateVal(c, s) > 0 : !!c.states[s];
  }
  // Tentative de dégel. Renvoie true si le combattant est entièrement libéré.
  // Consomme le mouvement de l'appelant (géré par l'appelant).
  function tryBreakGele(c) {
    const need = stateVal(c, 'gele');
    if (need <= 0) return true;
    const t = forceTest(c, need);
    if (t.passed) {
      c.states.gele = 0;
      pushFx({ type: 'state', iid: c.iid });
      toast('❄️ Libéré !', 'crit');
      log(cname(c) + ' se libère de la <span class="lstate">Glace</span> (Force ' + t.succ + '/' + need +
        ') — <span class="lcrit">réussite</span> !', 'state');
      return true;
    }
    if (t.succ > 0) {
      c.states.gele = Math.max(0, need - t.succ);
      pushFx({ type: 'state', iid: c.iid });
      log(cname(c) + ' lutte contre la <span class="lstate">Glace</span> (Force ' + t.succ + '/' + need +
        ') — <span class="lfail">échec</span> : <span class="lstate">Gelé ' + c.states.gele + '</span>.', 'state');
    } else {
      log(cname(c) + ' lutte contre la <span class="lstate">Glace</span> (Force ' + t.succ + '/' + need +
        ') — <span class="lfail">échec</span> : toujours <span class="lstate">Gelé ' + need + '</span>.', 'state');
    }
    toast('❄️ Toujours gelé (' + c.states.gele + ')', 'fail');
    return false;
  }

  function agilityOf(c) {
    if (c.side === 'monster') {
      if (c.type === 'boss') return 3;
      if (c.type === 'alpha' || c.type === 'solitaire') return 2;
      return 1;
    }
    const tpl = Store.state.heroes.find(function (h) { return h.id === c.templateId; });
    const base = (tpl && tpl.skills && tpl.skills['Agilité']) || 0;
    // Ajoute les points d'Agilité gagnés aux niveaux impairs (gains de session).
    const g = sessionGains && sessionGains[c.templateId];
    const gain = (g && g.skills && g.skills['Agilité']) || 0;
    return base + gain;
  }
  // Franchit les terrains difficiles sans test : talent Pieds Sûrs (aventurier) /
  // AGILE (adversaire).
  function canSkipDifficult(c) {
    // Pieds Sûrs (effet, side-neutre) OU AGILE (talent d'adversaire par déclencheur).
    if (heroHasTalent(c, 'franchissement_libre')) return true;
    if (c.side === 'monster') return !!monsterTalent(c, 'cross_difficult_free');
    return false;
  }
  // Test d'Agilité pour franchir une barrière Difficile (1d6 + Agilité, 4+ = réussite, 6 explosif).
  const BARRIER_NEED = { facile: 1, moyen: 2, difficile: 3 };
  function acrobaticsTest(c, difficulty) {
    const agi = agilityOf(c);
    const need = BARRIER_NEED[difficulty] || 2;
    let toRoll = 1 + agi, succ = 0, guard = 0;
    while (toRoll > 0 && guard++ < 40) {
      let nx = 0;
      for (let i = 0; i < toRoll; i++) { const r = 1 + Math.floor(Math.random() * 6); if (r >= 4) succ++; if (r === 6) nx++; }
      toRoll = nx;
    }
    return { passed: succ >= need, succ: succ, need: need };
  }

  // PERCEPTION : test générique (mêmes règles que le test d'Agilité de barrière)
  // servant à débusquer une cible INVISIBLE en attaquant sa zone (difficulté 2).
  function perceptionOf(c) {
    if (c.side === 'monster') return c.type === 'boss' ? 3 : (c.type === 'alpha' || c.type === 'solitaire') ? 2 : 1;
    const tpl = Store.state.heroes.find(function (h) { return h.id === c.templateId; });
    const base = (tpl && tpl.skills && tpl.skills['Perception']) || 0;
    const g = sessionGains && sessionGains[c.templateId];
    return base + ((g && g.skills && g.skills['Perception']) || 0);
  }
  function perceptionTest(c, need) {
    let toRoll = 1 + perceptionOf(c), succ = 0, guard = 0;
    while (toRoll > 0 && guard++ < 40) {
      let nx = 0;
      for (let i = 0; i < toRoll; i++) { const r = 1 + Math.floor(Math.random() * 6); if (r >= 4) succ++; if (r === 6) nx++; }
      toRoll = nx;
    }
    return { passed: succ >= (need || 2), succ: succ, need: need || 2 };
  }

  // Tente de franchir l'éventuelle barrière entre la zone de c et la zone zi.
  // Retourne 'ok' (aucune barrière ou test réussi), 'block' (infranchissable/mur),
  // ou 'fail' (barrière Difficile, test d'Agilité raté → le mouvement est perdu).
  // Journalise le résultat d'un test Difficile.
  function crossCheck(c, zi) {
    const mb = moveBarrier(c.zone, zi);
    // TÉLÉPORTATION (amélioration) : l'aventurier franchit toutes les barrières.
    if (heroHasTalent(c, 'teleportation')) {
      if (mb.type) log(cname(c) + ' <span class="lstate">se téléporte</span> à travers la barrière.', 'state');
      return 'ok';
    }
    if (mb.type === 'block') return 'block';
    if (mb.type === 'difficile') {
      // Pieds Sûrs (aventurier) / AGILE (adversaire) : franchissement sans test.
      if (canSkipDifficult(c)) {
        log(cname(c) + ' franchit une <span class="lstate">barrière difficile</span> sans test (' +
          (c.side === 'monster' ? 'AGILE' : 'Pieds Sûrs') + ').', 'state');
        return 'ok';
      }
      const t = acrobaticsTest(c, mb.diff);
      if (!t.passed) {
        log(cname(c) + ' tente de franchir une <span class="lstate">barrière difficile</span> (Agilité ' +
          t.succ + '/' + t.need + ') — <span class="lfail">échec</span> : ne franchit pas.', 'state');
        pushFx({ type: 'crossfail', iid: c.iid });
        return 'fail';
      }
      log(cname(c) + ' franchit une <span class="lstate">barrière difficile</span> (Agilité ' +
        t.succ + '/' + t.need + ') — <span class="lcrit">réussite</span> !', 'state');
    }
    // INSTABLE (ex. sol glissant) : le passage se fait toujours, mais un test
    // d'Agilité 1 raté fait arriver AU SOL dans la zone d'arrivée.
    if (mb.type === 'instable') {
      if (canSkipDifficult(c)) {
        log(cname(c) + ' traverse un <span class="lstate">terrain instable</span> sans encombre (' +
          (c.side === 'monster' ? 'AGILE' : 'Pieds Sûrs') + ').', 'state');
      } else {
        const ti = acrobaticsTest(c, mb.diff);
        if (!ti.passed) {
          c.states.auSol = true;
          pushFx({ type: 'state', iid: c.iid });
          toast('🌀 Terrain instable !', 'miss');
          log(cname(c) + ' traverse un <span class="lstate">terrain instable</span> (Agilité ' +
            ti.succ + '/' + ti.need + ') — <span class="lfail">échec</span> : ' + gPro(c) + ' arrive <span class="lstate">Au sol</span>.', 'state');
        } else {
          log(cname(c) + ' traverse un <span class="lstate">terrain instable</span> (Agilité ' +
            ti.succ + '/' + ti.need + ') — <span class="lcrit">réussite</span> !', 'state');
        }
      }
    }
    // ACROBATIE : franchir une barrière DIFFICILE amorce +1 dé noir sur le coup suivant.
    if (mb.type === 'difficile' && c.side === 'hero' && heroHasTalent(c, 'acrobatie')) c.acrobatiePrimed = true;
    return 'ok';
  }

  // Une attaque atteint sa cible : contact = même zone ; distance = n'importe quelle
  // zone, sauf si un MUR coupe la ligne de tir.
  function canReach(attacker, target, atk) {
    if (atk && atk.range === 'contact') return attacker.zone === target.zone;
    // CAMOUFLAGE (passif) : une cible aventurier ne peut être visée à distance
    // depuis une AUTRE zone.
    if (target && attacker.zone !== target.zone && heroHasTalent(target, 'camouflage')) return false;
    return !shootBlocked(attacker.zone, target.zone);
  }
  // Adversaires actifs présents dans la zone de l'attaquant (pour les dégâts-choc)
  function enemyZoneMates(attacker) {
    const es = attacker.side === 'hero' ? 'monster' : 'hero';
    return combat().combatants.filter(function (c) {
      return c.side === es && c.status === 'active' && c.zone === attacker.zone;
    });
  }
  // RALLIEMENT : un allié actif (autre que c) présent dans la zone offre le mouvement.
  function hasRalliementAlly(zone, c) {
    return combat().combatants.some(function (h) {
      return h.side === 'hero' && h.status === 'active' && h.zone === zone && h.iid !== c.iid && heroHasTalent(h, 'ralliement');
    });
  }
  // DÉPHASAGE : l'aventurier est intouchable pendant le tour adverse suivant.
  function isDephased(c) {
    return c && c.side === 'hero' && c.dephaseTurn === combat().turn;
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
    } else if (c.side === 'monster') {
      // ATTAQUE D'OPPORTUNITÉ (passif) : les aventuriers dotés du talent frappent
      // l'adversaire qui quitte leur zone.
      activeOf('hero').forEach(function (h) {
        if (h.zone === from && heroHasTalent(h, 'attaque_opportunite') && c.status === 'active') {
          heroOpportunity(h, c, 'quitte sa zone');
        }
      });
      if (c.status !== 'active') return;
    }
    c.used.move = true;
    if (c.status !== 'active') return; // tombé au coma en partant
    c.zone = zi;
    pushFx({ type: 'move', iid: c.iid });
    if (!silent) logMove(c, zi);
    if (c.side === 'hero') {
      chargeOnEnter(c);
      // ÉPINES adverses : un aventurier qui arrive dans la zone d'un porteur se
      // pique aussi (les déplacements des adversaires passent, eux, par l'IA
      // qui appelle déjà epinesOnArrival).
      epinesOnArrival(c);
    }
  }

  // CHARGE DÉVASTATRICE (maîtrise) : en arrivant dans une zone, l'aventurier
  // inflige son bonus de dégâts à X adversaires qui s'y trouvent.
  // Adversaires actifs de la zone de c, l'éventuelle cible cliquée d'abord.
  function arrivalFoes(c) {
    const foes = combat().combatants.filter(function (m) {
      return m.side === 'monster' && m.status === 'active' && m.zone === c.zone;
    });
    const pref = arrivalTargetIid ? foes.find(function (m) { return m.iid === arrivalTargetIid; }) : null;
    if (pref) { return [pref].concat(foes.filter(function (m) { return m.iid !== pref.iid; })); }
    // Auto-ciblage : on évite de gâcher l'effet sur une cible avec Blindage actif
    // (sinon il serait absorbé). Les cibles sans Blindage passent en premier.
    return foes.slice().sort(function (a, b) { return (hasBlindage(a) ? 1 : 0) - (hasBlindage(b) ? 1 : 0); });
  }

  function chargeOnEnter(c) {
    // ASSAUT HANDICAPANT (amélioration) : inflige l'état choisi à un adversaire de la zone.
    if (heroHasTalent(c, 'charge_etat')) {
      const st = heroTalentChoice(c, 'charge_etat');
      const foe = arrivalFoes(c)[0] || null;
      if (st && foe) {
        // AU SOL ne s'applique pas aux boss ni aux socles plus grands (cohérent avec applyStates).
        const blockAuSol = st === 'auSol' && (foe.type === 'boss' || SOCLE_RANK[foe.socle] > SOCLE_RANK[c.socle]);
        if (!blockAuSol) {
          if (isStackState(st)) addStack(foe, st, stackApplyN(c, st));
          else if (st === 'auSol') foe.states.auSol = true;
          else if (st === 'affaibli') foe.states.affaibli = true;
          pushFx({ type: 'state', iid: foe.iid });
          log('<b class="lopp">' + esc(heroTalentName(c, 'charge_etat')) + ' !</b> ' + cname(c) +
            ' inflige <span class="lstate">' + stateLabel(st) + '</span> à ' + cname(foe) + ' en chargeant.', 'state');
        }
      }
    }
    if (!heroHasTalent(c, 'charge_devastatrice')) return;
    const tCharge = c.talents.find(function (x) { return x.effect === 'charge_devastatrice'; });
    const scope = heroTalentScope(c, 'charge_devastatrice');
    const n = heroTalentVal(c, 'charge_devastatrice');
    // Dés propres au talent (facultatifs) : tirés PAR CIBLE ; sinon bonus de Dégâts.
    const chargeDice = (tCharge && tCharge.dice && D.DICE_ORDER.some(function (k) { return tCharge.dice[k] > 0; }))
      ? Object.assign(D.emptyPool(), tCharge.dice) : null;
    const dmg = c.damage || 0;
    if (dmg <= 0 && !chargeDice) return;
    // Cibles selon la portée : Nombre X (zone), Toute la zone, Tout le combat.
    let foes;
    if (scope === 'all') {
      foes = combat().combatants.filter(function (m) { return m.side === 'monster' && m.status === 'active'; });
    } else if (scope === 'zone') {
      foes = arrivalFoes(c);
    } else {
      if (n <= 0) return;
      foes = arrivalFoes(c).slice(0, n);
    }
    foes.forEach(function (m) {
      // BLINDAGE : absorbe les dégâts de charge.
      if (absorbBlindage(m, 'la charge')) return;
      const dmg = chargeDice
        ? Math.max(0, (D.resolve(chargeDice, { def: 0, damage: 0, turn: combat().turn }).pvLost || 0))
        : (c.damage || 0);
      if (dmg <= 0) return;
      const before = m.pv;
      m.pv = Math.max(0, m.pv - dmg);
      m.dmgTaken += dmg; revealOnDamage(m, dmg); c.dmgDealt += dmg;
      pushFx({ type: 'hit', iid: m.iid, amount: dmg, fromPct: pct(before, m.maxPv), toPct: pct(m.pv, m.maxPv) });
      log('<b class="lopp">' + esc(heroTalentName(c, 'charge_devastatrice')) + ' !</b> ' + cname(c) + ' inflige ' + amt(dmg, 'dmg') +
        ' Dégâts à ' + cname(m) + ' en chargeant.', 'dchoc');
      if (m.pv <= 0 && !m.killedBy) m.killedBy = c.iid;
      checkMonsterTalents(m, dmg);
      checkComa(m);
    });
  }

  function moveCombatant(iid, zi) {
    const c = byId(iid);
    const asAction = moveAsAction; moveAsAction = false;
    if (!c || c.status !== 'active') { pendingMove = null; arrivalTargetIid = null; render(); return; }
    if (asAction) { if (actionSpent(c)) { pendingMove = null; arrivalTargetIid = null; render(); return; } }
    else if (c.used.move && !c.freeMoveReady && !(c.freeMoves > 0) && !c.prepBonus) { pendingMove = null; arrivalTargetIid = null; render(); return; }
    if (c.zone === zi) { pendingMove = null; arrivalTargetIid = null; render(); return; }
    // GELÉ : aucun déplacement tant que le combattant n'est pas libéré (dernier
    // rempart si un chemin d'accès contournait le bouton « Se libérer »).
    if (isGele(c)) {
      alert('Gelé ' + stateVal(c, 'gele') + ' — impossible de se déplacer. Utilisez « Se libérer » (test de Force ' +
        stateVal(c, 'gele') + ').');
      pendingMove = null; arrivalTargetIid = null; render(); return;
    }
    // BARRIÈRES : bloque ou exige un test d'Agilité (Difficile) pour franchir.
    const cross = crossCheck(c, zi);
    if (cross === 'block') {
      alert('Une barrière infranchissable sépare ces zones — déplacement impossible.');
      pendingMove = null; arrivalTargetIid = null; render(); return;
    }
    if (cross === 'fail') {
      c.used.move = true; // l'essai consomme le mouvement
      pendingMove = null; arrivalTargetIid = null; checkOutcome(); Store.save(); render(); return;
    }
    // POISON X : inflige X dégâts avant de se déplacer
    applyPoison(c);
    if (c.status !== 'active') { pendingMove = null; checkOutcome(); Store.save(); render(); return; }
    const prevMove = c.used.move;
    doMove(c, zi); // doMove force used.move = true
    if (asAction) {
      // COURSE (action) : le déplacement coûte l'action, pas le mouvement.
      useAction(c); c.used.move = prevMove;
    } else if (c.freeMoves > 0) {
      // REBOND : consomme d'abord un mouvement gratuit ; le mouvement normal reste dispo.
      c.freeMoves -= 1; c.used.move = prevMove;
    } else if (c.freeMoveReady) {
      // PAS LÉGER : ce déplacement consomme d'abord le mouvement gratuit ; le
      // mouvement normal reste alors disponible.
      c.freeMoveReady = false; c.used.move = prevMove;
    } else if (c.side === 'hero' && hasRalliementAlly(c.zone, c)) {
      // RALLIEMENT : un allié de la zone d'arrivée offre le mouvement (non dépensé).
      c.used.move = prevMove;
      log(cname(c) + ' rejoint la zone sans dépenser son mouvement (<span class="lstate">Ralliement</span>).', 'state');
    } else if (c.prepBonus && prevMove) {
      // PRÉPARÉ : ce 2e déplacement du tour puise dans le bonus (Mouvement supplémentaire).
      c.prepBonus = false;
      log(cname(c) + ' se déplace une 2e fois grâce à <span class="lstate">Préparé</span>.', 'state');
    }
    pendingMove = null; arrivalTargetIid = null; checkOutcome();
    // PRÉ-TOUR : dès que plus aucun aventurier n'a de talent à jouer, on démarre
    // automatiquement le vrai tour (le joueur peut aussi passer via « Tour X »).
    if (pretourAllDone()) { startTurnFromPretour(); return; }
    Store.save(); render();
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
  // Attaque d'opportunité d'un AVENTURIER contre un adversaire qui quitte sa zone
  // (Bousculade) : inflige son bonus de dégâts, absorbé par un éventuel Blindage.
  function heroOpportunity(hero, monster, why) {
    if (!hero || hero.status !== 'active' || hero.states.affaibli) return;
    const tv = heroTalentVal(hero, 'attaque_opportunite');
    const dmg = tv > 0 ? tv : (hero.damage || 0);
    if (dmg <= 0 || monster.status !== 'active') return;
    if (absorbBlindage(monster, 'l\'attaque d\'opportunité')) return;
    const before = monster.pv;
    monster.pv = Math.max(0, monster.pv - dmg);
    monster.dmgTaken += dmg; revealOnDamage(monster, dmg); hero.dmgDealt += dmg;
    pushFx({ type: 'hit', iid: monster.iid, amount: dmg, fromPct: pct(before, monster.maxPv), toPct: pct(monster.pv, monster.maxPv) });
    log('<b class="lopp">Attaque d\'Opportunité</b> : ' + cname(hero) + ' inflige ' + amt(dmg, 'dmg') + ' à ' + cname(monster) + ' (' + (why || 'Bousculade') + ').', 'dchoc');
    if (monster.pv <= 0 && !monster.killedBy) monster.killedBy = hero.iid;
    checkMonsterTalents(monster, dmg); checkComa(monster);
  }

  // Cibles valides pour l'IA adverse : un aventurier INVISIBLE ne peut pas être pris
  // pour cible (les adversaires ne le voient pas).
  function targetableByFoe(h) { return h && h.status === 'active' && !isInvisible(h); }

  function dchocFrom(monster, hero, reason) {
    if (monster.status !== 'active' || monster.states.affaibli) return 0;
    if (isDephased(hero)) return 0; // Déphasage : aucune attaque d'opportunité ne l'atteint
    const dmg = monster.damage || 0;
    if (dmg <= 0) return 0;
    // INSAISISSABLE (passif) : l'aventurier ignore les dégâts des attaques d'opportunité.
    if (hero.side === 'hero' && heroHasTalent(hero, 'ignore_opportunite')) {
      log('<b class="lopp">Attaque d\'Opportunité</b> ignorée par ' + cname(hero) +
        ' (<span class="lstate">' + esc(heroTalentName(hero, 'ignore_opportunite')) + '</span>).', 'dchoc');
      return 0;
    }
    // BLINDAGE : absorbe l'attaque d'opportunité.
    if (absorbBlindage(hero, 'l\'attaque d\'opportunité')) return 0;
    const pvBefore = hero.pv;
    hero.pv = Math.max(0, hero.pv - dmg);
    hero.dmgTaken += dmg; revealOnDamage(hero, dmg); monster.dmgDealt += dmg;
    pushFx({ type: 'hit', iid: hero.iid, amount: dmg, fromPct: pct(pvBefore, hero.maxPv), toPct: pct(hero.pv, hero.maxPv) });
    const why = reason === 'distance'
      ? 'car ' + gPro(hero) + ' utilise une <i>attaque à distance</i> dans sa zone'
      : 'car ' + gPro(hero) + ' quitte sa zone';
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
    if (atk.effects.gele) toApply.push('gele');
    if (atk.effects.auSol) {
      const biggerTarget = SOCLE_RANK[target.socle] > SOCLE_RANK[attacker.socle];
      if (target.type !== 'boss' && !biggerTarget) toApply.push('auSol');
    }
    const poisonVal = atk.effects.poison || 0;
    if (poisonVal > 0) toApply.push('poison');
    // IMMUNITÉ (amélioration) : la cible ne subit jamais l'état choisi (side-neutre).
    if (Array.isArray(target.talents)) {
      const immune = {};
      target.talents.forEach(function (t) { if (t.effect === 'immun_etat' && t.choice) immune[t.choice] = true; });
      for (let i = toApply.length - 1; i >= 0; i--) {
        if (immune[toApply[i]]) {
          log(cname(target) + ' est <span class="lstate">immunisé</span> contre ' + stateLabel(toApply[i]) + '.', 'state');
          toApply.splice(i, 1);
        }
      }
    }
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
        // Surcouche (Poison) : chaque application pose X crans au lieu de 1.
        target.states.poison = (target.states.poison || 0) + poisonVal + (stackApplyN(attacker, 'poison') - 1);
        log(cname(target) + ' subit <span class="lstate">Poison ' + target.states.poison + '</span>.', 'state');
      } else if (isStackState(s)) {
        // Feu / Gelé : chaque application monte d'un cran (X avec Surcouche).
        const n = addStack(target, s, stackApplyN(attacker, s));
        log(cname(target) + ' subit <span class="lstate">' + stateLabel(s) + ' ' + n + '</span>' +
          (s === 'gele' ? ' — plus de déplacement sans un test de Force ' + n + '.' : '.'), 'state');
      } else {
        target.states[s] = true;
        log(cname(target) + ' subit <span class="lstate">' + stateLabel(s) + '</span>.', 'state');
      }
    });
    if (list.length) pushFx({ type: 'state', iid: target.iid });
  }

  function resolveAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
    // DÉPHASAGE : un aventurier déphasé ne subit aucun dégât ni état d'un adversaire.
    if (attacker.side === 'monster' && isDephased(target)) {
      log(cname(target) + ' est <span class="lstate">Déphasé</span> : l\'attaque de ' + cname(attacker) + ' n\'a aucun effet.', 'state');
      pushFx({ type: 'miss', iid: target.iid, text: 'DÉPHASÉ' });
      return;
    }
    // Interceptions défensives (Protection / Rempart) avant une attaque adverse.
    if (attacker.side === 'monster' && target.side === 'hero' && !atk._noIntercept && interceptDepth < 3) {
      if (defensiveIntercept(attacker, target, atk) === 'redirected') return;
      if (attacker.status !== 'active') return; // l'attaquant est tombé (Protection)
      if (target.status !== 'active') return;
    }

    const pool = Object.assign(D.emptyPool(), atk.dice);
    // FAILLE : ajoute 1 dé rose au pool de l'attaquant (les doubles avec ce dé sont exclus des dégâts)
    if (attacker.states.faille) pool.pink = (pool.pink || 0) + 1;
    // PROIE : dés bonus de tous les adversaires contre l'aventurier désigné ce tour.
    if (attacker.side === 'monster' && combat().markDice && target.iid === combat().markedHeroIid) {
      Object.keys(combat().markDice).forEach(function (col) {
        pool[col] = (pool[col] || 0) + combat().markDice[col];
      });
    }
    // FORCE BLINDÉE : +1 dé rouge (Lourd) tant que l'attaquant a Blindage (dynamique).
    // (COUP DE BOUCLIER est ajouté statiquement aux dés de l'attaque — visible sur le bouton.)
    if (heroHasTalent(attacker, 'force_blindee') && hasBlindage(attacker)) {
      pool.red = (pool.red || 0) + 1;
    }
    // RÉSONANCE ÉLÉMENTAIRE : +1 dé bleu contre un adversaire affecté par l'état
    // choisi (FEU par défaut, ce qui reprend l'ancienne « Combustion »).
    if (attacker.side === 'hero' && heroHasTalent(attacker, 'bonus_bleu_feu') &&
        hasState(target, heroTalentChoice(attacker, 'bonus_bleu_feu') || 'feu')) {
      pool.blue = (pool.blue || 0) + 1;
    }
    // ORBES PARTAGÉS : le buff de l'attaquant ajoute des dés bleus (et FEU) à cette attaque.
    const orbBuffN = (attacker.side === 'hero' && attacker.orbBuff) ? attacker.orbBuff : 0;
    if (orbBuffN > 0) { pool.blue = (pool.blue || 0) + orbBuffN; attacker.orbBuff = 0; } // consommé à la prochaine attaque
    // ACROBATIE (passif) : +1 dé noir sur l'attaque suivant un franchissement de
    // barrière DIFFICILE (amorcé dans crossCheck, consommé ici).
    if (attacker.side === 'hero' && heroHasTalent(attacker, 'acrobatie') && attacker.acrobatiePrimed) {
      pool.black = (pool.black || 0) + 1;
      attacker.acrobatiePrimed = false;
    }
    // MUNITION encochée : +1 dé (couleur) sur la PROCHAINE attaque d'Arme à
    // Distance (attaque de base uniquement), puis consommée.
    if (attacker.ammoLoaded && atk.range === 'distance' && atk.isBase) {
      pool[attacker.ammoLoaded] = (pool[attacker.ammoLoaded] || 0) + 1;
      log(cname(attacker) + ' tire sa munition : +1 dé ' + (AMMO_LABEL[attacker.ammoLoaded] || attacker.ammoLoaded) + '.', 'state');
      attacker.ammoLoaded = null;
    }
    const baseDmg = (atk.useOwnDamage !== false && !attacker.states.affaibli) ? (attacker.damage || 0) : 0;
    const talentBonus = getTalentDmgBonus(attacker, target, atk);
    // ASSASSINAT (passif) : double le bonus de dégâts contre la cible choisie.
    const assassin = assassinatEffect(attacker, target);
    const assassinBonus = (assassin === 'bonus') ? baseDmg : 0;
    const dmg = baseDmg + assassinBonus + talentBonus +
      Math.max(0, Math.round(Store.rollAmount(atk.bonusDmg || 0)));
    // BRISÉ et AU SOL : DEF = 0
    let def = (target.states.auSol || target.states.brise) ? 0 : target.def;
    // ÉPUISEMENT (passif) : chaque aventurier doté du talent dans la zone de la cible
    // adverse lui retire 1 DEF.
    if (target.side === 'monster') {
      const epuise = combat().combatants.filter(function (h) {
        return h.side === 'hero' && h.status === 'active' && h.zone === target.zone && heroHasTalent(h, 'epuisement');
      }).length;
      if (epuise > 0) def = Math.max(0, def - epuise);
    }
    // ORBE PERFORANT / FAILLE TACTIQUE (aventurier) : ignore la DEF de la cible.
    if (attacker.side === 'hero') {
      if (atk.orbIgnoreDef) def = 0;
      const idt = Array.isArray(attacker.talents) ? attacker.talents.find(function (t) { return t.effect === 'ignore_def_etat'; }) : null;
      if (idt && idt.choice && target.states && (idt.choice === 'poison' ? target.states.poison > 0 : target.states[idt.choice])) def = 0;
    }
    // COUP DE GRÂCE (passif) : pas d'échec (double 1) contre une cible AU SOL.
    const noFumble = target.states.auSol && attacker.side === 'hero' && heroHasTalent(attacker, 'pas_echec_ausol');
    // DESTRUCTEUR (maîtrise) : critique sur tout double. BOUCLIER MYSTIQUE : la cible
    // aventurier ignore les dégâts des dés bleus.
    const destructeur = heroHasTalent(attacker, 'critique_destructeur');
    const ignoreBlue = heroHasTalent(target, 'bouclier_mystique');
    // SOLIDITÉ (amélioration) : la DEF de l'aventurier bloque aussi les dés rouges.
    const defBlocksRed = heroHasTalent(target, 'solidite');
    // ORBE : par défaut un Orbe ne réalise pas de critique (sauf Orbe Critique).
    const noCrit = attacker.side === 'hero' && atk.orbNoCrit;
    const res = D.resolve(pool, { def: def, damage: dmg, turn: combat().turn, noFumble: noFumble, destructeur: destructeur, ignoreBlue: ignoreBlue, defBlocksRed: defBlocksRed, noCrit: noCrit });
    // Pool de dés du bandeau flottant : le jet qui vient d'être résolu.
    showRoll(res, { iid: attacker.iid, who: cname(attacker), target: cname(target), label: attackLabel(atk), ico: atk });

    // MUR IMBRISABLE (passif) : un critique adverse contre cet aventurier devient un échec.
    let critToEchec = false;
    if (res.critique && attacker.side === 'monster' && target.side === 'hero' && heroHasTalent(target, 'crit_en_echec')) {
      res.critique = false; res.echec = true; res.pvLost = 0; res.pvHealed = 0;
      critToEchec = true;
    }

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
    // (Le nom de l'arme n'apparaît plus dans le journal : il est visible dans
    // la boîte de dés du bandeau.)
    // Bulle d'annonce. Aventurier : une attaque d'ARME annonce sa portée (gris
    // acier), une ACTION annonce son nom (bleu acier). Adversaire : nom de
    // l'attaque, en rouge.
    if (attacker.side === 'hero') {
      // MYSTIQUE : « Orbes Mystiques » sans le nombre, en violet mystique.
      if (isOrbAttack(atk)) toast('🔮 Orbes Mystiques', 'orbe');
      else if (atk.special) toast('✦ ' + attackLabel(atk), 'act-hero');
      else toast(atk.range === 'distance' ? '🏹 Attaque à distance !' : '⚔ Attaque au contact !', 'atk-weapon');
    } else {
      toast('☠ ' + attackLabel(atk), 'atk-foe');
    }
    // Fusionne un déplacement effectué dans la même action (« se déplace … et attaque … »).
    // Le déplacement n'est plus raconté dans le journal (il se voit sur le
    // plateau) : on consomme simplement le préfixe en attente.
    if (movePrefix && movePrefix.iid === attacker.iid) movePrefix = null;
    if (res.echec) {
      toast(critToEchec ? '🛡 Critique annulé !' : '💢 Échec critique !', 'fail');
      const failTxt = critToEchec
        ? ' — <span class="lstate">' + esc(heroTalentName(target, 'crit_en_echec')) + '</span> : le <span class="lcrit">CRITIQUE</span> devient un <span class="lfail">Échec</span> !'
        : ' — <span class="lfail">Échec</span>.';
      log(cname(attacker) + ' attaque ' + cname(target) + ' ' + diceStr + failTxt, 'attack');
      pushFx({ type: 'miss', iid: target.iid, text: 'ÉCHEC', center: true });
      applyRegain(target, attacker); // échec adverse → Regain
      return;
    }
    if (negated) {
      log(cname(attacker) + ' attaque ' + cname(target) +
        ' : annulé (<span class="lstate">' + reason + '</span>).', 'attack');
      // BLINDAGE absorbé : éclat métallique « tschiing » + texte dédié.
      if (reason.indexOf('Blindage') === 0) pushFx({ type: 'blindage', iid: target.iid, text: 'BLINDAGE !' });
      else pushFx({ type: 'miss', iid: target.iid, text: reason });
      applyRegain(target, attacker); // Blindage / annulation → Regain
      return;
    }

    // CUIRASSE (talent passif) : réduit les dégâts subis (side-neutre).
    let cuir = 0;
    if (res.pvLost > 0) {
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
    // ACCENTUATION (passif) : un critique inflige le double du bonus de dégâts
    // (on ajoute une seconde fois le bonus déjà compté).
    if (res.critique && res.pvLost > 0 && heroHasTalent(attacker, 'accentuation') && (attacker.damage || 0) > 0) {
      res.pvLost += attacker.damage;
      log(cname(attacker) + ' <span class="lstate">Accentuation</span> : +' + amt(attacker.damage, 'dmg') + ' dégâts (critique).', 'state');
    }
    // ASSASSINAT (variante « Attaque ») : double l'ensemble des dégâts de l'attaque
    // contre la cible choisie.
    if (res.pvLost > 0 && assassinatEffect(attacker, target) === 'attaque') {
      const extra = res.pvLost; res.pvLost += extra;
      log(cname(attacker) + ' <span class="lstate">Assassinat</span> : dégâts doublés (+' + amt(extra, 'dmg') + ').', 'state');
    }
    // VFX d'attaque : estafilade (contact) ou projectile (distance), joué avant l'impact.
    pushFx({ type: 'attack', iid: target.iid, fromIid: attacker.iid, range: atk.range });
    const pvBefore = target.pv;
    const wasActive = target.status === 'active';
    if (res.pvLost > 0) {
      target.pv = Math.max(0, target.pv - res.pvLost); target.dmgTaken += res.pvLost; revealOnDamage(target, res.pvLost); attacker.dmgDealt += res.pvLost;
      // RÉACTION Contre-Attaque : l'aventurier blessé pourra riposter. Restreinte
      // au contact, sauf RIPOSTE À DISTANCE qui l'autorise aussi à distance.
      if (target.side === 'hero' && attacker.side === 'monster' && heroHasTalent(target, 'contre_attaque') &&
          (atk.range === 'contact' || heroHasTalent(target, 'riposte_distance'))) {
        target.tookDamage = true; target.lastAttacker = attacker.iid;
      }
    }
    if (res.pvHealed > 0) target.pv = Math.min(target.maxPv, target.pv + res.pvHealed);
    const fromPct = pct(pvBefore, target.maxPv), toPct = pct(target.pv, target.maxPv);
    if (res.pvLost > 0) pushFx({ type: res.critique ? 'crit' : 'hit', iid: target.iid, amount: res.pvLost, fromPct: fromPct, toPct: toPct });
    else if (res.critique) pushFx({ type: 'crit', iid: target.iid, amount: 0, fromPct: fromPct, toPct: toPct });
    if (res.pvHealed > 0) pushFx({ type: 'heal', iid: target.iid, amount: res.pvHealed, fromPct: fromPct, toPct: toPct });
    if (res.critique) toast('💥 CRITIQUE !', 'crit');
    log(cname(attacker) + ' attaque ' + cname(target) +
        (res.critique ? ' <span class="lcrit">CRITIQUE&nbsp;!</span>' : '') + ' ' + diceStr + ' : ' +
        (res.pvLost > 0 ? amt(res.pvLost, 'dmg') + ' Dégâts.' : 'aucun dégât.'),
        res.critique ? 'crit' : 'attack');
    // REGAIN : la DEF a tout absorbé (aucun dégât d'une attaque adverse).
    if (res.pvLost <= 0 && res.pvHealed <= 0) applyRegain(target, attacker);
    // ORBES ÉLÉMENTAIRES : l'élément n'est infligé que si l'Orbe a fait des
    // dégâts — un Orbe entièrement absorbé ou raté ne pose pas d'état.
    if (atk.orbElement && res.pvLost <= 0) {
      log(cname(target) + ' ne subit pas <span class="lstate">' + orbElementLabel(atk.orbElement) +
        '</span> : l\'Orbe n\'a infligé aucun Dégât.', 'state');
      const noElem = Object.assign({}, atk, { effects: Object.assign({}, atk.effects) });
      if (atk.orbElement === 'poison') noElem.effects.poison = 0;
      else noElem.effects[atk.orbElement] = false;
      applyStates(attacker, target, noElem);
    } else {
      applyStates(attacker, target, atk);
    }
    // ORBES PARTAGÉS : l'attaque dopée inflige aussi FEU.
    if (orbBuffN > 0 && target.status === 'active') {
      // L'état transmis suit l'élément des Orbes du Mystique (Feu par défaut).
      const st = attacker.orbBuffState || 'feu';
      attacker.orbBuffState = null;
      let lbl = orbElementLabel(st);
      if (isStackState(st)) lbl += ' ' + addStack(target, st, stackApplyN(attacker, st));
      else target.states[st] = true;
      pushFx({ type: 'state', iid: target.iid });
      log(cname(target) + ' subit <span class="lstate">' + lbl + '</span> (Orbes Partagés).', 'state');
    }
    checkMonsterTalents(target, res.pvLost);
    if (target.side === 'monster' && target.pv <= 0 && !target.killedBy) target.killedBy = attacker.iid;
    // Dégâts-choc (attaque d'opportunité) : tirer à distance dans une zone ennemie.
    // Résolus APRÈS l'attaque : la cible éliminée (pv ≤ 0) ne contre-attaque pas.
    // À BOUT PORTANT (amélioration) : aucune attaque d'opportunité sur un tir dans la zone.
    if (atk.range === 'distance' && attacker.side === 'hero' && !heroHasTalent(attacker, 'a_bout_portant')) {
      enemyZoneMates(attacker).forEach(function (m) {
        if (m.iid === target.iid && target.pv <= 0) return;
        if (attacker.status === 'active') dchocFrom(m, attacker, 'distance');
      });
    }
    // ATTAQUE D'OPPORTUNITÉ (passif) : un adversaire qui tire à distance depuis la
    // zone d'un aventurier doté du talent en subit les dégâts.
    if (atk.range === 'distance' && attacker.side === 'monster') {
      activeOf('hero').forEach(function (h) {
        if (h.zone === attacker.zone && heroHasTalent(h, 'attaque_opportunite') && attacker.status === 'active') {
          heroOpportunity(h, attacker, 'tir dans sa zone');
        }
      });
    }
    checkComa(target);
    const killedNow = wasActive && target.status !== 'active';
    // Talents de critique (classes) : déclenchés après un critique d'un aventurier.
    if (res.critique && attacker.side === 'hero') onHeroCritTriggers(attacker, target, killedNow);
    // RIPOSTE (adversaire) : un adversaire attaqué par un aventurier riposte
    // systématiquement (1 fois par tour), s'il est encore en vie.
    maybeMonsterCounter(target, attacker);
    return res; // utilisé par DÉLUGE (relance tant qu'aucun 1 n'apparaît)
  }
  // DÉLUGE : aucun 1 sur les dés de Dégâts (hors soin) de ce lancer → on peut relancer.
  function delugeNoOne(res) {
    return !!res && !res.dice.some(function (d) { return d.value === 1 && !D.DICE_TYPES[d.color].heal; });
  }

  // Choix joueur (synchrone) parmi une liste de combattants. Retourne l'élément
  // choisi, ou null si le joueur annule. labelFn donne un libellé texte simple.
  function playerPick(message, items, labelFn) {
    if (!items || !items.length) return null;
    if (items.length === 1) {
      return global.confirm(message + '\n\n→ ' + labelFn(items[0]) + ' ?') ? items[0] : null;
    }
    const list = items.map(function (it, i) { return (i + 1) + '. ' + labelFn(it); }).join('\n');
    const ans = global.prompt(message + '\n\n' + list + '\n\nNuméro (laisser vide pour annuler) :');
    if (ans === null) return null;
    const idx = parseInt(ans, 10) - 1;
    return (idx >= 0 && idx < items.length) ? items[idx] : null;
  }
  function plainName(c) { return c ? (c.name || '') : ''; }

  // ----- Choix joueur au CLIC (sans pop-up) -----
  // Empile un choix ; il sera présenté au joueur (surbrillance des cibles + bandeau)
  // dès que l'action en cours est terminée.
  // On ne propose des choix au clic que pendant la phase des aventuriers (jamais
  // au milieu du tour des adversaires : une éventuelle Riposte critique n'ouvre
  // donc pas de choix — cas marginal).
  function canOfferChoice() { return combat().phase === 'heroes' && !aiRunning && !pendingReaction; }
  function enqueueChoice(choice) { if (canOfferChoice()) choiceQueue.push(choice); }
  // Démarre le prochain choix en attente (le cas échéant). Retourne true si un
  // choix est désormais actif.
  function startNextChoice() {
    if (activeChoice) return true;
    while (choiceQueue.length) {
      const ch = choiceQueue.shift();
      // Le choix peut être devenu caduc (plus aucune cible valide) : on l'ignore.
      const some = activeOf('hero').concat(activeOf('monster')).some(function (c) { return ch.isValidTarget(c); });
      if (!some) continue;
      activeChoice = ch;
      const caster = byId(ch.casterIid);
      if (caster) selectedIid = caster.iid;
      return true;
    }
    return false;
  }
  // Résout le choix actif avec la cible cliquée, puis enchaîne les suivants.
  function resolveActiveChoice(target) {
    const ch = activeChoice; activeChoice = null;
    if (ch && target) { try { ch.onPick(target); } catch (e) { console.error('[combat] choix', e); } }
    checkOutcome();
    if (!combat().outcome) startNextChoice();
    Store.save(); render();
  }
  // Passe le choix actif (talents « vous pouvez » : facultatifs).
  function skipActiveChoice() {
    activeChoice = null;
    if (!combat().outcome) startNextChoice();
    Store.save(); render();
  }

  // REGAIN (passif) : aucune blessure subie d'une attaque adverse → soin d'ENDU PV.
  function applyRegain(c, attacker) {
    if (!c || c.side !== 'hero' || !attacker || attacker.side !== 'monster') return;
    if (c.status !== 'active' || !heroHasTalent(c, 'regain')) return;
    const heal = Math.max(0, c.endu || 0);
    if (heal <= 0 || c.pv >= c.maxPv) return;
    const before = c.pv;
    c.pv = Math.min(c.maxPv, c.pv + heal);
    pushFx({ type: 'heal', iid: c.iid, amount: c.pv - before, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' <span class="lstate">Regain</span> : récupère ' + amt(c.pv - before, 'heal') + ' PV.', 'state');
  }

  // PROTECTION / REMPART : réactions déclenchées AVANT qu'un aventurier ne subisse
  // une attaque adverse. Retourne 'redirected' si Rempart a redirigé l'attaque.
  let interceptDepth = 0;
  function defensiveIntercept(attacker, target, atk) {
    interceptDepth++;
    try {
      // PROTECTION : un allié GARDÉ va être attaqué → un protecteur se déplace et frappe l'assaillant.
      if (target.states && target.states.garde) {
        const protectors = activeOf('hero').filter(function (h) {
          return h.iid !== target.iid && heroHasTalent(h, 'protection') && !(h.reactUsed && h.reactUsed.protection) &&
            (h.zone === target.zone || moveBarrier(h.zone, target.zone).type !== 'block');
        });
        const p = protectors.length
          ? playerPick('Protection : ' + plainName(target) + ' (Gardé) est attaqué. Qui intervient (déplacement + attaque sur ' + plainName(attacker) + ') ?', protectors, plainName)
          : null;
        if (p) {
          p.reactUsed = p.reactUsed || {}; p.reactUsed.protection = true;
          if (p.zone !== target.zone) { p.zone = target.zone; pushFx({ type: 'move', iid: p.iid }); }
          const wi = firstWeaponIdx(p);
          log('<b class="lreact">Protection !</b> ' + cname(p) + ' protège ' + cname(target) + ' et attaque ' + cname(attacker) + '.', 'state');
          if (wi >= 0 && attacker.status === 'active') resolveAttack(p, attacker, p.attacks[wi]);
          if (attacker.status !== 'active') return 'attacker-down';
        }
      }
      // REMPART : un allié de la zone de la cible subit les dégâts à sa place (sa DEF).
      if (target.status === 'active' && attacker.status === 'active') {
        const guards = activeOf('hero').filter(function (h) {
          return h.iid !== target.iid && h.zone === target.zone && heroHasTalent(h, 'rempart') && !(h.reactUsed && h.reactUsed.rempart);
        });
        const g = guards.length
          ? playerPick('Rempart : qui encaisse l\'attaque à la place de ' + plainName(target) + ' (avec sa propre DEF) ?', guards, plainName)
          : null;
        if (g) {
          g.reactUsed = g.reactUsed || {}; g.reactUsed.rempart = true;
          log('<b class="lreact">Rempart !</b> ' + cname(g) + ' encaisse l\'attaque à la place de ' + cname(target) + '.', 'state');
          resolveAttack(attacker, g, Object.assign({}, atk, { _noIntercept: true }));
          return 'redirected';
        }
      }
    } finally { interceptDepth--; }
    return null;
  }

  // ORBES PARTAGÉS : répartit les Orbes Mystiques en buffs (+1 dé bleu & FEU sur la
  // prochaine attaque) sur différents aventuriers (choix du joueur).
  function triggerOrbeShare(attacker) {
    const pi = attacker.attacks.findIndex(isOrbAttack);
    let orbs = pi >= 0 ? (attacker.attackUses[pi] || 0) : 0;
    if (orbs <= 0) { alert('Aucun Orbe Mystique disponible ce tour.'); return; }
    log('<b class="lreact">Orbes Partagés</b> : ' + cname(attacker) + ' répartit ses Orbes sur ses alliés.', 'state');
    while (orbs > 0) {
      const allies = activeOf('hero').filter(function (h) { return !(h.orbBuff > 0); });
      if (!allies.length) break;
      const ally = playerPick('Orbes Partagés : sur quel aventurier ? (' + orbs + ' orbe(s) restant(s) — Annuler pour arrêter)', allies, plainName);
      if (!ally) break;
      ally.orbBuff = (ally.orbBuff || 0) + 1;
      ally.orbBuffState = orbElementOf(attacker) || 'feu';
      if (pi >= 0) attacker.attackUses[pi] = Math.max(0, (attacker.attackUses[pi] || 0) - 1);
      orbs--;
      pushFx({ type: 'state', iid: ally.iid });
      log(cname(ally) + ' reçoit <span class="lstate">+1 dé bleu &amp; ' + orbElementLabel(ally.orbBuffState) +
        '</span> sur sa prochaine attaque.', 'state');
    }
  }

  // Empile le choix de la cible d'une attaque gratuite d'un allié (clic sur un
  // adversaire à sa portée), puis résout l'attaque au clic. Facultatif.
  function enqueueAllyFreeAttack(ally, label) {
    if (!ally || ally.status !== 'active') return;
    const wi = firstWeaponIdx(ally);
    if (wi < 0) return;
    const foes = activeOf('monster').filter(function (m) { return canReach(ally, m, ally.attacks[wi]); });
    if (!foes.length) return;
    enqueueChoice({
      casterIid: ally.iid,
      prompt: cname(ally) + ' — attaque gratuite (' + label + ') : <b>cliquez l\'adversaire à frapper</b>.',
      isValidTarget: function (c) { return c.side === 'monster' && c.status === 'active' && foes.some(function (f) { return f.iid === c.iid; }); },
      onPick: function (foe) {
        log(cname(ally) + ' <span class="lreact">attaque gratuitement</span> (' + label + ') !', 'state');
        resolveAttack(ally, foe, ally.attacks[wi]);
      },
      allowSkip: true,
    });
  }

  // COOPÉRATION : un allié GARDÉ de la zone effectue une attaque gratuite.
  // Choix au CLIC : on clique l'allié, puis sa cible (aucune pop-up).
  function triggerCooperation(attacker) {
    const allies = activeOf('hero').filter(function (h) {
      if (h.iid === attacker.iid || h.zone !== attacker.zone) return false;
      if (!(h.states && h.states.garde)) return false;
      const wi = firstWeaponIdx(h);
      if (wi < 0) return false;
      return activeOf('monster').some(function (m) { return canReach(h, m, h.attacks[wi]); });
    });
    if (!allies.length) return;
    log('<b class="lreact">Coopération !</b> ' + cname(attacker) + ' : un allié Gardé de la zone peut attaquer gratuitement.', 'state');
    enqueueChoice({
      casterIid: attacker.iid,
      prompt: 'Coopération : <b>cliquez l\'allié Gardé</b> qui attaque gratuitement.',
      isValidTarget: function (c) { return allies.some(function (a) { return a.iid === c.iid; }); },
      onPick: function (ally) { enqueueAllyFreeAttack(ally, 'Coopération'); },
      allowSkip: true,
    });
  }

  let critTriggerDepth = 0;
  // Effets déclenchés par un critique d'un aventurier (passifs de classe).
  function onHeroCritTriggers(attacker, primaryTarget, killed) {
    if (!attacker || attacker.side !== 'hero') return;
    // BAIN DE SANG : un adversaire tué par un critique soigne l'attaquant de son ENDU.
    if (killed && primaryTarget.side === 'monster' && heroHasTalent(attacker, 'bain_de_sang') && attacker.status === 'active') {
      const heal = attacker.endu || 0;
      if (heal > 0) {
        const before = attacker.pv;
        attacker.pv = Math.min(attacker.maxPv, attacker.pv + heal);
        if (attacker.pv > before) {
          pushFx({ type: 'heal', iid: attacker.iid, amount: attacker.pv - before, fromPct: pct(before, attacker.maxPv), toPct: pct(attacker.pv, attacker.maxPv) });
          log(cname(attacker) + ' <span class="lstate">Bain de Sang</span> : +' + amt(attacker.pv - before, 'heal') + ' PV.', 'state');
        }
      }
    }
    // IMPLOSION (réaction) : après un critique, 1 action supplémentaire (1×/tour).
    if (heroHasTalent(attacker, 'implosion') && attacker.used.action && !(attacker.reactUsed && attacker.reactUsed.implosion)) {
      attacker.reactUsed = attacker.reactUsed || {};
      attacker.reactUsed.implosion = true;
      attacker.used.action = false;
      log('<b class="lreact">Implosion !</b> ' + cname(attacker) + ' regagne une action grâce à son critique.', 'state');
    }
    if (critTriggerDepth > 2) return; // garde-fou anti-récursion
    critTriggerDepth++;
    try {
      // MOUVEMENT CRITIQUE : octroie un mouvement gratuit.
      if (attacker.status === 'active' && heroHasTalent(attacker, 'mvt_critique')) {
        attacker.freeMoves = (attacker.freeMoves || 0) + 1;
        log(cname(attacker) + ' <span class="lstate">Mouvement Critique</span> : +1 mouvement gratuit.', 'state');
      }
      // CRITIQUE EXPLOSIF : bonus de dégâts à tous les adversaires de la zone.
      if (heroHasTalent(attacker, 'critique_explosif') && (attacker.damage || 0) > 0) {
        const dmg = attacker.damage;
        combat().combatants.filter(function (m) { return m.side === 'monster' && m.status === 'active' && m.zone === attacker.zone; }).forEach(function (m) {
          if (absorbBlindage(m, 'Critique Explosif')) return;
          const before = m.pv; m.pv = Math.max(0, m.pv - dmg); m.dmgTaken += dmg; revealOnDamage(m, dmg); attacker.dmgDealt += dmg;
          pushFx({ type: 'hit', iid: m.iid, amount: dmg, fromPct: pct(before, m.maxPv), toPct: pct(m.pv, m.maxPv) });
          log('<b class="lopp">Critique Explosif !</b> ' + cname(attacker) + ' inflige ' + amt(dmg, 'dmg') + ' Dégâts à ' + cname(m) + '.', 'dchoc');
          if (m.pv <= 0 && !m.killedBy) m.killedBy = attacker.iid;
          checkMonsterTalents(m, dmg); checkComa(m);
        });
      }
      // CRI DE RAGE : le joueur clique un adversaire d'une autre zone à attirer.
      if (heroHasTalent(attacker, 'cri_de_rage')) {
        const outs = activeOf('monster').filter(function (m) { return m.zone !== attacker.zone && moveBarrier(m.zone, attacker.zone).type !== 'block'; });
        if (outs.length) {
          log('<b class="lopp">Cri de Rage !</b> ' + cname(attacker) + ' peut attirer un adversaire dans sa zone.', 'state');
          enqueueChoice({
            casterIid: attacker.iid,
            prompt: cname(attacker) + ' — Cri de Rage : <b>cliquez l\'adversaire à attirer</b> dans votre zone.',
            isValidTarget: function (c) { return c.side === 'monster' && c.status === 'active' && outs.some(function (o) { return o.iid === c.iid; }); },
            onPick: function (m) {
              m.zone = attacker.zone; pushFx({ type: 'move', iid: m.iid });
              log(cname(attacker) + ' attire ' + cname(m) + ' dans sa zone (Cri de Rage).', 'state');
              epinesOnArrival(m);
            },
            allowSkip: true,
          });
        }
      }
      // ALLIÉ CRITIQUE : le joueur clique un allié de la zone qui attaque
      // gratuitement (sans consommer son action), puis sa cible.
      if (heroHasTalent(attacker, 'allie_critique')) {
        const allies = activeOf('hero').filter(function (h) {
          if (h.iid === attacker.iid || h.zone !== attacker.zone) return false;
          const wi = firstWeaponIdx(h);
          if (wi < 0) return false;
          return activeOf('monster').some(function (m) { return canReach(h, m, h.attacks[wi]); });
        });
        if (allies.length) {
          log('<b class="lreact">Allié Critique !</b> ' + cname(attacker) + ' : un allié de la zone peut attaquer gratuitement.', 'state');
          enqueueChoice({
            casterIid: attacker.iid,
            prompt: 'Allié Critique : <b>cliquez l\'allié</b> qui attaque gratuitement.',
            isValidTarget: function (c) { return allies.some(function (a) { return a.iid === c.iid; }); },
            onPick: function (ally) { enqueueAllyFreeAttack(ally, 'Allié Critique'); },
            allowSkip: true,
          });
        }
      }
    } finally { critTriggerDepth--; }
  }

  // Un adversaire doté de RIPOSTE contre-attaque l'aventurier qui l'a frappé.
  function maybeMonsterCounter(target, attacker) {
    if (!target || !attacker) return;
    if (target.side !== 'monster' || attacker.side !== 'hero') return;
    if (target.status !== 'active' || attacker.status !== 'active') return;
    if (target.counterUsed) return;
    if (!monsterTalent(target, 'counter_attack')) return;
    const wi = firstWeaponIdx(target);
    if (wi < 0) return;
    target.counterUsed = true;
    log(cname(target) + ' <span class="lreact">riposte</span> !', 'state');
    resolveAttack(target, attacker, target.attacks[wi]);
  }

  function hasEffect(atk) {
    return atk.effects && (atk.effects.affaibli || atk.effects.auSol || atk.effects.feu ||
      atk.effects.gele || atk.effects.brise || atk.effects.faille || atk.effects.poison);
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
      log(cname(combatant) + ' <span class="lcoma">perd sa dernière VIE — ' + gPro(combatant) + ' quitte l\'aventure définitivement.</span>', 'down');
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
    // DERNIER SOUFFLE (passif) : 1×/combat, l'aventurier ignore le coup fatal.
    if (c.status === 'active' && c.pv <= 0 && c.side === 'hero' && heroHasTalent(c, 'dernier_souffle') && !c.lastBreathUsed) {
      c.lastBreathUsed = true; c.pv = 1;
      pushFx({ type: 'state', iid: c.iid });
      log(cname(c) + ' <span class="lstate">Dernier Souffle</span> : ignore les dégâts fatals et reste à 1 PV !', 'state');
      return;
    }
    if (c.status === 'active' && c.pv <= 0) {
      c.status = 'coma';
      c.pv = 0;
      pushFx({ type: 'faint', iid: c.iid, side: c.side, name: c.name });
      appendLastLog(c.side === 'monster'
        ? cname(c) + ' <span class="lvanq">est ' + gAgr(c, 'vaincu') + ' !</span>'
        : cname(c) + ' <span class="lcoma">tombe dans le coma…</span>');
      if (c.side === 'hero' && combatKey === 'combat') applyHeroComaVieLoss(c);
      // MORT EXPLOSIVE : le souffle part au moment où le porteur tombe.
      mortExplosive(c);
    }
  }

  // EXÉCUTION (réaction) : avant qu'un adversaire de la zone d'un aventurier doté du
  // talent ne fuie, celui-ci lui inflige son bonus de dégâts. Retourne true si la
  // fuite est empêchée (l'adversaire est mort).
  function executionBeforeFlee(m) {
    if (!m || m.side !== 'monster' || m.status !== 'active') return false;
    activeOf('hero').filter(function (h) { return h.zone === m.zone && heroHasTalent(h, 'execution'); }).forEach(function (h) {
      if (m.status !== 'active') return;
      const tvx = heroTalentVal(h, 'execution');
      const dmg = tvx > 0 ? tvx : (h.damage || 0);
      if (dmg <= 0) return;
      // Réaction : le joueur décide s'il exécute l'adversaire avant sa fuite.
      log('<b class="lreact">Exécution ?</b> ' + cname(m) + ' va fuir : ' + cname(h) + ' peut lui infliger ' + amt(dmg, 'dmg') + ' Dégâts.', 'state');
      if (!global.confirm('Exécution : ' + plainName(h) + ' inflige ' + dmg + ' Dégâts à ' + plainName(m) + ' avant sa fuite ?')) return;
      if (absorbBlindage(m, 'Exécution')) return;
      const before = m.pv; m.pv = Math.max(0, m.pv - dmg); m.dmgTaken += dmg; revealOnDamage(m, dmg); h.dmgDealt += dmg;
      pushFx({ type: 'hit', iid: m.iid, amount: dmg, fromPct: pct(before, m.maxPv), toPct: pct(m.pv, m.maxPv) });
      log('<b class="lopp">Exécution !</b> ' + cname(h) + ' inflige ' + amt(dmg, 'dmg') + ' Dégâts à ' + cname(m) + ' avant sa fuite.', 'dchoc');
      if (m.pv <= 0 && !m.killedBy) m.killedBy = h.iid;
      checkComa(m);
    });
    return m.status !== 'active';
  }

  // Vérifie les talents "flee_on_big_hit" du monstre cible après avoir subi pvLost PV
  // OBSOLÈTE : l'ancien système de talents à déclencheur (m.talents) a été
  // entièrement retiré. Ces fonctions restent en place (neutralisées) pour ne
  // pas casser leurs appelants — seul le nouveau système de Talents adverses
  // nommés (m.advTalentIds) est actif désormais.
  function checkMonsterTalents(/* target, pvLost */) { /* no-op */ }

  // Ancien déclencheur d'adversaire — désormais toujours inactif.
  function monsterTalent(/* c, trigger */) { return null; }

  // PROIE (ancien mark_target_dice) — désormais toujours inactif.
  function markTalents() { return []; }
  // Sélectionne l'aventurier désigné selon le critère choisi. Réutilise focusPick
  // (mêmes priorités que le ciblage d'attaque). Compat. anciens modes PROIE.
  const MARK_MODE_MAP = { least_pv: 'pvLow', most_pv: 'pvHigh', least_def: 'defLow', most_def: 'defHigh' };
  function pickMarkTarget(heroes, mode) {
    const exposed = (heroes || []).filter(function (h) { return !isDiscreet(h); });
    const pool = exposed.length ? exposed : heroes;
    return focusPick(pool, MARK_MODE_MAP[mode] || mode || 'pvHigh');
  }
  function designateMarkedHero() {
    const c = combat();
    if (!c) return;
    c.markedHeroIid = null; c.markDice = null;
    const talents = markTalents();
    if (!talents.length) return;
    const heroes = activeOf('hero');
    if (!heroes.length) return;
    // Critère de désignation (issu du 1er talent PROIE rencontré).
    const mode = talents[0].targetMode || 'most_pv';
    const target = pickMarkTarget(heroes, mode);
    const dice = {};
    talents.forEach(function (t) {
      const color = t.markColor || 'white';
      const n = Math.max(1, t.count || 1);
      dice[color] = (dice[color] || 0) + n;
    });
    c.markedHeroIid = target.iid;
    c.markDice = dice;
    const badges = (window.Inventory && Inventory.poolBadges) ? Inventory.poolBadges(dice) : '';
    log('<b class="lopp">Proie !</b> ' + cname(target) + ' est désigné : les adversaires ajoutent ' +
      badges + ' à leurs attaques contre ' + gObj(target) + ' ce tour.', 'state');
  }

  // Bonus de dégâts des talents PASSIFS d'un aventurier attaquant
  // ASSASSINAT : retourne 'bonus' | 'attaque' | null selon le choix du talent et
  // si la cible remplit la condition (seul dans sa zone / solitaire / alpha / boss).
  function assassinatEffect(attacker, target) {
    if (!attacker || !target || attacker.side === target.side) return null;
    if (!Array.isArray(attacker.talents)) return null;
    const t = attacker.talents.find(function (x) { return x.effect === 'assassinat'; });
    if (!t || !t.choice) return null;
    const ch = t.choice.toLowerCase();
    const what = ch.indexOf('attaque') >= 0 ? 'attaque' : 'bonus';
    let ok = false;
    if (ch.indexOf('seul') >= 0) {
      // « Seul dans sa zone » : la cible n'a aucun allié dans sa zone.
      ok = combat().combatants.filter(function (m) {
        return m.side === target.side && m.status === 'active' && m.zone === target.zone;
      }).length <= 1;
    } else if (ch.indexOf('solitaire') >= 0) { ok = target.type === 'solitaire'; }
    else if (ch.indexOf('alpha') >= 0) { ok = target.type === 'alpha'; }
    else if (ch.indexOf('boss') >= 0) { ok = target.type === 'boss'; }
    return ok ? what : null;
  }

  function getHeroTalentDmgBonus(attacker, target, atk) {
    if (!Array.isArray(attacker.talents)) return 0;
    let bonus = 0;
    // Valeur du talent : nombre fixe OU expression de dés (« 1d4 »), tirée à
    // CHAQUE coup via rollAmount.
    const v = function (t, dflt) { return Math.max(0, Math.round(Store.rollAmount(t.val == null ? (dflt || 0) : t.val))); };
    attacker.talents.forEach(function (t) {
      if (t.kind !== 'passive') return;
      switch (t.effect) {
        case 'frappe_lourde': bonus += v(t); break;
        case 'maitre_distance': if (atk && atk.range === 'distance') bonus += v(t); break;
        case 'maitre_contact': if (atk && atk.range === 'contact') bonus += v(t); break;
        case 'tueur_au_sol': if (target.states.auSol) bonus += v(t); break;
        case 'tueur_affaibli': if (target.states.affaibli) bonus += v(t); break;
        case 'tueur_etat': {
          const st = t.choice;
          if (st && target.states && (st === 'poison' ? target.states.poison > 0 : !!target.states[st])) bonus += v(t);
          break;
        }
        case 'meute': {
          const allies = combat().combatants.filter(function (c) {
            return c.side === attacker.side && c.status === 'active' && c.iid !== attacker.iid && c.zone === target.zone;
          }).length;
          bonus += allies * v(t, 1);
          break;
        }
      }
    });
    return bonus;
  }

  // Un combattant possède-t-il un talent d'effet donné ? (side-neutre : s'applique
  // aussi aux adversaires porteurs d'effets d'aventurier — fusion des talents.)
  function heroHasTalent(c, effect) {
    return c && Array.isArray(c.talents) &&
      c.talents.some(function (t) { return t.effect === effect; });
  }
  // Consomme l'Action d'un combattant. SURVITAMINÉ (amélioration) : l'aventurier
  // dispose de 2 Actions ; la 1ʳᵉ n'épuise pas encore son tour.
  function useAction(c) {
    if (!c) return;
    if (!c.used.action) {
      // SURVITAMINÉ / DOUBLE ACTION : la 1re Action ne consomme pas le tour
      // (2 Actions au total). Effet commun aux aventuriers ET aux adversaires.
      if (heroHasTalent(c, 'survitamine') && !c.actedOnce) c.actedOnce = true;
      else c.used.action = true;
    } else if (c.prepBonus) {
      // PRÉPARÉ : l'Action déjà dépensée → on puise dans le bonus (Action OU Mouvement).
      c.prepBonus = false;
    }
  }
  // Action déjà dépensée (bonus PRÉPARÉ inclus) : sert de garde-fou partout.
  function actionSpent(c) { return c.used.action && !c.prepBonus; }
  // Interdit d'exécuter DEUX FOIS la même Action dans un tour, sauf l'Attaque de
  // Base (isBase) qui reste répétable. Le bonus PRÉPARÉ n'y déroge pas.
  function cannotAct(c, atk, idx) {
    if (!atk || atk.freeAction) return false;
    if (actionSpent(c)) return true;
    // Les actions de parchemin sont limitées par leur usage (1), pas par la règle
    // « pas 2× la même » (leurs index ne sont pas stables dans le temps).
    // Côté ADVERSAIRE, une attaque d'arme ordinaire (non spéciale) joue le rôle de
    // l'Attaque de Base des aventuriers : elle reste répétable, si bien qu'un
    // adversaire à Double Action peut frapper deux fois.
    const repeatable = atk.isBase || atk.fromParchment || (c.side === 'monster' && !atk.special);
    if (!repeatable && Array.isArray(c.actedAtks) && c.actedAtks.indexOf(idx) >= 0) return true;
    return false;
  }
  // Mémorise l'Action non-basique jouée ce tour (pour la règle « pas 2× la même »).
  function recordAction(c, atk, idx) {
    if (!c || !atk || atk.freeAction || atk.isBase || atk.fromParchment) return;
    if (!Array.isArray(c.actedAtks)) c.actedAtks = [];
    if (c.actedAtks.indexOf(idx) < 0) c.actedAtks.push(idx);
  }
  // ÉPINES (passif) : un adversaire qui arrive dans la zone d'un aventurier doté du
  // talent subit son bonus de dégâts.
  function epinesOnArrival(m) {
    if (!m || m.status !== 'active') return;
    // Symétrique : tout combattant du camp OPPOSÉ au nouvel arrivant, porteur
    // d'Épines dans la même zone, le pique — adversaires porteurs compris.
    const other = m.side === 'monster' ? 'hero' : 'monster';
    activeOf(other).forEach(function (h) {
      if (h.zone !== m.zone || !heroHasTalent(h, 'epines')) return;
      const tv = heroTalentVal(h, 'epines');
      const dmg = tv > 0 ? tv : (h.damage || 0);
      if (dmg <= 0 || m.status !== 'active') return;
      if (absorbBlindage(m, 'Épines')) return;
      const before = m.pv;
      m.pv = Math.max(0, m.pv - dmg); m.dmgTaken += dmg; revealOnDamage(m, dmg); h.dmgDealt += dmg;
      pushFx({ type: 'hit', iid: m.iid, amount: dmg, fromPct: pct(before, m.maxPv), toPct: pct(m.pv, m.maxPv) });
      log('<b class="lopp">Épines !</b> ' + cname(h) + ' inflige ' + amt(dmg, 'dmg') + ' Dégâts à ' + cname(m) + ' qui arrive dans sa zone.', 'dchoc');
      if (m.side === 'monster' && m.pv <= 0 && !m.killedBy) m.killedBy = h.iid;
      if (m.side === 'monster') checkMonsterTalents(m, dmg);
      checkComa(m);
    });
  }
  // Valeur X d'un talent de l'aventurier (0 si absent)
  function heroTalentVal(c, effect) {
    if (!c || !Array.isArray(c.talents)) return 0;
    const t = c.talents.find(function (x) { return x.effect === effect; });
    // rollAmount : nombre → tel quel ; expression de dés (« 1d6 ») → tirage
    // (Régénération / Réanimation à valeur aléatoire).
    return t ? Store.rollAmount(t.val || 0) : 0;
  }
  // Nom choisi d'un talent de l'aventurier (effect si absent)
  function heroTalentName(c, effect) {
    if (!c || !Array.isArray(c.talents)) return effect;
    const t = c.talents.find(function (x) { return x.effect === effect; });
    return t ? (t.name || effect) : effect;
  }
  // Valeur de choix d'un talent (compétence, état infligé…) — null si absent
  function heroTalentChoice(c, effect) {
    if (!c || !Array.isArray(c.talents)) return null;
    const t = c.talents.find(function (x) { return x.effect === effect; });
    return t ? (t.choice || null) : null;
  }
  // Portée des cibles d'un talent : 'count' | 'zone' | 'all'
  function heroTalentScope(c, effect) {
    if (!c || !Array.isArray(c.talents)) return 'count';
    const t = c.talents.find(function (x) { return x.effect === effect; });
    return t ? (t.scope || 'count') : 'count';
  }

  // Retourne le bonus de dégâts (talents de l'attaquant + soutien de zone).
  // Les effets passifs (c.talents) s'appliquent aux DEUX camps (fusion).
  function getTalentDmgBonus(attacker, target, atk) {
    let bonus = getHeroTalentDmgBonus(attacker, target, atk);
    if (attacker.side !== 'monster') return bonus;
    const tpl = Store.state.monsters.find(function (m) { return m.id === attacker.templateId; });
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
  // PRÉPARÉ : au début du tour d'un combattant Préparé, il gagne 1 bonus utilisable
  // au choix comme +1 Action OU +1 Mouvement (prepBonus) ; l'effet expire à la fin
  // de ce tour.
  function armPrepared(list) {
    (list || []).forEach(function (c) {
      if (c.prepArmed) {            // armé au tour précédent → l'effet expire maintenant
        c.prepArmed = false; c.prepBonus = false;
      }
      if (c.states && c.states.prepare) {  // fraîchement Préparé → armé pour ce tour
        c.prepBonus = true; c.prepArmed = true; c.states.prepare = false;
      }
    });
  }

  function resetActivations() {
    armPrepared(combat().combatants);
    combat().combatants.forEach(function (c) {
      c.used = { action: false, move: false, object: false };
      c.actedAtks = []; // règle « pas 2× la même Action » : compteur par tour

      c.freeMoves = 0; c.rebondUsed = false; // REBOND : compteurs remis à zéro chaque tour
      c.counterUsed = false; // RIPOSTE (adversaire) : 1 fois par tour
      // Les usages d'attaque sont « par tour » : on les réarme à chaque tour —
      // SAUF les actions de PARCHEMIN (1 usage pour tout le combat, non réarmé).
      const prevUses = c.attackUses || [];
      c.attackUses = c.attacks.map(function (a, i) {
        if (a.fromParchment) return (prevUses[i] != null) ? prevUses[i] : 1;
        return (a.uses && a.uses > 0) ? a.uses : null;
      });
    });
  }

  function endHeroPhase() {
    pendingAttack = null; stateMenuFor = null; pendingOrbeShare = null; pendingDesignate = null; pendingMove = null; pendingObject = null;
    choiceQueue = []; activeChoice = null;
    combat().phase = 'monsters';
    log('Phase des adversaires.', 'turn');
    Store.save(); render();
  }

  // Attaques utilisables d'un combattant (usages restants + action disponible)
  function usableAttackIdx(m, range) {
    for (let i = 0; i < m.attacks.length; i++) {
      const a = m.attacks[i];
      if (m.attackUses[i] === 0) continue;
      if (cannotAct(m, a, i)) continue;
      if (range && a.range !== range) continue;
      return i;
    }
    return -1;
  }

  // Cœur de la phase adverse (sans rendu) — gestion par zones
  // Contact : frappe en priorité un héros de sa zone (se déplace si besoin).
  // Distance : frappe en priorité un héros d'une autre zone.
  // Activation d'un seul adversaire (choix de cible + attaque/déplacement)
  // ---- COMPORTEMENTS de déplacement (fiche d'adversaire) ----
  // Évalués DANS L'ORDRE : la première règle qui donne une destination valable
  // l'emporte. Indépendants de la Menace (qui choisit la cible d'attaque).
  // Renvoie { zone } (destination), { stay: true } (immobile) ou null (aucune règle).
  function zonesReachableFrom(m) {
    return zones().map(function (z, i) { return i; }).filter(function (i) {
      return i !== m.zone && moveBarrier(m.zone, i).type !== 'block';
    });
  }
  function heroesInZone(zi) {
    return activeOf('hero').filter(function (h) { return h.zone === zi && targetableByFoe(h); }).length;
  }
  function behaviorMove(m) {
    const list = Array.isArray(m.behaviors) ? m.behaviors : [];
    if (!list.length) return null;
    const reach = zonesReachableFrom(m);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b === 'still') return { stay: true };
      if (!reach.length) continue; // règles de déplacement : sans issue, on passe à la suivante
      if (b === 'roam') {
        return { zone: reach[Math.floor(Math.random() * reach.length)] };
      }
      if (b === 'fleeHeroes') {
        // Ne s'applique que si la zone actuelle contient un aventurier ; cible une zone VIDE.
        if (!heroesInZone(m.zone)) continue;
        const empties = reach.filter(function (z) { return heroesInZone(z) === 0; });
        if (empties.length) return { zone: empties[Math.floor(Math.random() * empties.length)] };
        continue;
      }
      if (b === 'toCrowd' || b === 'toLonely') {
        // Zones candidates : la sienne incluse (rester peut être la bonne réponse).
        const cands = [m.zone].concat(reach);
        const counts = cands.map(heroesInZone);
        const want = b === 'toCrowd' ? Math.max.apply(null, counts) : Math.min.apply(null, counts);
        const best = cands.filter(function (z, k) { return counts[k] === want; });
        // La zone actuelle satisfait déjà la règle → on ne bouge pas.
        if (best.indexOf(m.zone) >= 0) return { stay: true };
        return { zone: best[Math.floor(Math.random() * best.length)] };
      }
    }
    return null;
  }
  // Attaque imposée par un comportement « Utilise … en priorité ».
  // 'useAtk' = attaque d'arme (index 0) ; 'useAct1/2/3' = attaques spéciales
  // (1re, 2e, 3e de la fiche). Renvoie l'index utilisable, ou -1.
  const BEH_ATK_SLOT = { useAtk: 0, useAct1: 1, useAct2: 2, useAct3: 3 };
  function behaviorAttackIdx(m) {
    const list = Array.isArray(m.behaviors) ? m.behaviors : [];
    for (let i = 0; i < list.length; i++) {
      const slot = BEH_ATK_SLOT[list[i]];
      if (slot == null) continue;
      const a = m.attacks[slot];
      if (!a) continue;
      if (m.attackUses[slot] === 0) continue;
      if (cannotAct(m, a, slot)) continue;
      return slot;
    }
    return -1;
  }
  // Cible valable pour une attaque donnée (portée + ligne de vue / accès).
  function behaviorTargetFor(m, idx, heroes) {
    const a = m.attacks[idx];
    if (!a) return null;
    if (a.range === 'distance') {
      const shootable = heroes.filter(function (h) { return !shootBlocked(m.zone, h.zone); });
      const others = shootable.filter(function (h) { return h.zone !== m.zone; });
      return chooseFrom(m, others.length ? others : shootable) || null;
    }
    const here = heroes.filter(function (h) { return h.zone === m.zone; });
    return chooseFrom(m, here) || null;
  }

  // Applique le comportement avant l'IA d'attaque. Retourne true si le
  // comportement a pris la main sur le déplacement (l'IA ne bougera plus).
  function applyBehavior(m) {
    const dec = behaviorMove(m);
    if (!dec) return false;
    if (dec.stay) { m.used.move = true; return true; }
    if (dec.zone === m.zone || m.used.move) { m.used.move = true; return true; }
    const cross = crossCheck(m, dec.zone);
    if (cross === 'ok') {
      m.zone = dec.zone; m.used.move = true;
      pushFx({ type: 'move', iid: m.iid });
      logMove(m, m.zone);
      epinesOnArrival(m);
    } else {
      m.used.move = true; // barrière : tentative perdue
    }
    return true;
  }

  function actOneMonster(m) {
    if (actionSpent(m)) return;
    // GELÉ : l'adversaire consacre son mouvement à tenter de se libérer (test de
    // Force N). Il peut ensuite attaquer, mais sans changer de zone.
    if (isGele(m)) {
      m.used.move = true;
      tryBreakGele(m);
    }
    // AU SOL : l'adversaire utilise son mouvement pour se relever, puis attaque
    // normalement — mais sans pouvoir changer de zone (mouvement déjà consommé).
    if (m.states.auSol) {
      m.states.auSol = false; m.used.move = true;
      log(cname(m) + ' se relève (retire <span class="lstate">Au sol</span>).', 'state');
      pushFx({ type: 'state', iid: m.iid });
      // pas de return : il peut encore attaquer une cible déjà présente dans sa zone.
    }
    // INVISIBLE : les aventuriers invisibles sont retirés des cibles possibles
    // (les adversaires ne les voient pas).
    // INVISIBLE : les aventuriers invisibles sont retirés des cibles possibles
    // (les adversaires ne les voient pas).
    const heroes = activeOf('hero').filter(targetableByFoe);
    if (!heroes.length) return;
    // COMPORTEMENTS de la fiche : ils décident du déplacement AVANT l'IA d'approche.
    applyBehavior(m);
    if (m.status !== 'active') return;
    // HAPPE : avant d'attaquer, déplace de force un aventurier d'une autre zone dans la sienne.
    if (monsterTalent(m, 'pull_to_zone')) {
      // On ne happe pas un aventurier au travers d'une barrière infranchissable/obstruante.
      // Un aventurier GELÉ est pris dans la glace : impossible de le tirer à soi.
      const outsiders = heroes.filter(function (h) {
        return h.zone !== m.zone && !isGele(h) && moveBarrier(m.zone, h.zone).type !== 'block';
      });
      if (outsiders.length) {
        const pulled = chooseFrom(m, outsiders);
        if (pulled) {
          pulled.zone = m.zone;
          pushFx({ type: 'move', iid: pulled.iid });
          log('<b class="lopp">Happe !</b> ' + cname(m) + ' déplace de force ' + cname(pulled) +
            ' dans sa zone (<span class="lstate">' + esc(zname(m.zone)) + '</span>).', 'state');
        }
      }
    }
    // COMPORTEMENT « Utilise … en priorité » : si l'attaque désignée est jouable
    // sur une cible valable, elle passe avant l'IA d'attaque standard.
    const behIdx = behaviorAttackIdx(m);
    if (behIdx >= 0) {
      const behTarget = behaviorTargetFor(m, behIdx, heroes);
      if (behTarget) { applyAttack(m, behIdx, behTarget); return; }
    }
    const sameZone = heroes.filter(function (h) { return h.zone === m.zone; });
    // BARRIÈRES : cibles atteignables au tir (pas d'Obstruante) et au déplacement (pas de blocage).
    const shootable = heroes.filter(function (h) { return !shootBlocked(m.zone, h.zone); });
    // Cibles vers lesquelles une route de déplacement existe (directe OU en
    // contournant les murs par une zone libre — cf. zoneStep).
    const routable = heroes.filter(function (h) { return h.zone === m.zone || zoneStep(m.zone, h.zone) >= 0; });
    const distIdx = usableAttackIdx(m, 'distance');
    const contactIdx = usableAttackIdx(m, 'contact');

    // 1) Arme de contact + cible dans la zone → frappe au contact
    if (contactIdx >= 0 && sameZone.length) {
      applyAttack(m, contactIdx, chooseFrom(m, sameZone));
    // 2) Arme à distance → frappe une autre zone visible, sinon n'importe quelle cible visible
    } else if (distIdx >= 0 && shootable.length) {
      const distTargets = shootable.filter(function (h) { return h.zone !== m.zone; });
      applyAttack(m, distIdx, chooseFrom(m, distTargets.length ? distTargets : shootable));
    // 3) Seulement du contact, personne dans la zone → avance vers une cible
    //    accessible (en contournant les barrières infranchissables si nécessaire),
    //    puis frappe si l'on parvient dans sa zone ce tour-ci.
    } else if (contactIdx >= 0) {
      const target = chooseFrom(m, routable.length ? routable : heroes);
      let moved = false;
      if (target && !m.used.move && target.zone !== m.zone) {
        // Pas suivant sur la route vers la cible : zone voisine directe si accès
        // libre, sinon zone-relais qui rapproche de la cible.
        const step = zoneStep(m.zone, target.zone);
        if (step >= 0 && step !== m.zone) {
          // BARRIÈRES : infranchissable/mur bloque ; Difficile exige un test d'Agilité
          // (échec → mouvement perdu, pas d'attaque ce tour).
          const cross = crossCheck(m, step);
          if (cross === 'ok') {
            m.zone = step; m.used.move = true; moved = true;
            pushFx({ type: 'move', iid: m.iid });
            epinesOnArrival(m); // ÉPINES : dégâts en arrivant dans la zone d'un aventurier
          } else {
            m.used.move = true; // tentative ratée ou zone bloquée : le mouvement est consommé
          }
        } else {
          m.used.move = true; // aucune route vers la cible : mouvement consommé
        }
      }
      // LENT : un adversaire qui s'est déplacé ne peut plus attaquer ce tour.
      if (moved && monsterTalent(m, 'slow')) {
        logMove(m, m.zone, ' mais est <span class="lstate">Lent</span> : pas d\'attaque');
      } else if (target && target.zone === m.zone) {
        // Parvenu dans la zone de la cible : fusionne déplacement + attaque sur une
        // seule ligne du journal.
        if (moved) movePrefix = { iid: m.iid, zone: zname(m.zone) };
        applyAttack(m, contactIdx, target);
      } else if (moved) {
        // Déplacement d'approche (relais) : se rapproche sans encore atteindre la cible.
        logMove(m, m.zone);
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
    // PRÉPARÉ : les adversaires armés rejouent une Action bonus.
    activationOrder().forEach(function (m) {
      if (m.prepArmed && !actionSpent(m) && m.status === 'active') actOneMonster(m);
    });
    checkOutcome();
  }

  // Version séquencée (UI) : chaque adversaire agit l'un après l'autre, avec un
  // re-rendu entre chaque pour qu'on voie distinctement qui joue. onDone() est
  // appelé quand toute la vague a agi (ou que le combat est résolu).
  const AI_STEP_MS = 550;
  function monstersActSequential(onDone) {
    clearHeroReactionMarks();
    // Nouveau tour d'adversaires : la 2ᵉ Action de SURVITAMINÉ redevient disponible.
    activeOf('monster').forEach(function (m) { m.actedOnce = false; });
    // PRÉPARÉ : un adversaire armé est activé une seconde fois (Action bonus).
    // SURVITAMINÉ (Double Action) : l'adversaire est réactivé après que tout le
    // monde a joué — il dispose bien de 2 Actions dans son tour.
    const order = activationOrder()
      .concat(activationOrder().filter(function (m) { return m.prepArmed; }))
      .concat(activationOrder().filter(function (m) { return heroHasTalent(m, 'survitamine'); }));
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
      // On n'écarte plus les adversaires Au Sol : actOneMonster gère leur relevée
      // (puis une éventuelle attaque dans leur zone) au lieu de les laisser inertes.
      if (m.status !== 'active' || actionSpent(m)) { step(); return; }
      actOneMonster(m);
      checkOutcome();
      Store.save();
      render(); // joue les animations de cette activation
      if (combat().outcome) { finish(); return; }
      // RÉACTION : si un aventurier peut riposter suite à cette attaque, on met la
      // séquence en pause et on attend son choix (déclencher / Reprendre le Tour).
      const reactor = pendingHeroReactor();
      if (reactor) {
        pendingReaction = reactor.iid;
        selectedIid = reactor.iid;
        centerText('RÉACTION !', 'fx-center-react');
        aiResume = step; // reprise depuis l'adversaire suivant
        Store.save(); render();
        return;
      }
      aiTimer = setTimeout(step, AI_STEP_MS);
    }
    step();
  }

  // Aventurier actif disposant d'une Réaction prête (Riposte non encore utilisée ce tour).
  function pendingHeroReactor() {
    return activeOf('hero').find(function (h) {
      return heroHasTalent(h, 'contre_attaque') && h.tookDamage && byId(h.lastAttacker) &&
        riposteRemaining(h) > 0;
    }) || null;
  }
  // Reprend la séquence adverse mise en pause par une Réaction.
  function resumeMonsterTurn() {
    pendingReaction = null;
    const resume = aiResume; aiResume = null;
    if (resume) { aiTimer = setTimeout(resume, 200); }
    else { Store.save(); render(); }
  }


  // MENACE (maîtrise) : un aventurier de la zone du Sbire (ou de l'Élite) l'oblige
  // à le prendre pour cible.
  function heroMenaces(h, m) {
    if (!h || !m || h.zone !== m.zone) return false;
    const t = Array.isArray(h.talents) ? h.talents.find(function (x) { return x.effect === 'menace'; }) : null;
    if (!t) return false;
    const isElite = m.type === 'alpha' || m.type === 'solitaire' || m.type === 'boss';
    return (t.choice === 'elite') ? isElite : (m.type === 'standard');
  }
  // Sélection d'une cible selon la menace, parmi un ensemble de candidats
  // Un aventurier possède-t-il une attaque à distance ?
  function heroHasRangedAttack(h) {
    return Array.isArray(h.attacks) && h.attacks.some(function (a) { return a && a.range === 'distance'; });
  }
  // Nombre d'aventuriers actifs dans la zone d'un aventurier (pour « isolé »).
  function zoneHeroCount(zone) {
    return activeOf('hero').filter(function (h) { return h.zone === zone; }).length;
  }
  // Sélection d'un aventurier-cible selon une priorité de focus (partagée par le
  // ciblage d'attaque des adversaires et la désignation PROIE).
  function focusPick(list, mode) {
    if (!list || !list.length) return null;
    const a = list.slice();
    switch (mode) {
      case 'pvLow':   return minBy(a, function (h) { return h.pv; });
      case 'pvHigh':  return maxBy(a, function (h) { return h.pv; });
      case 'defLow':  return minBy(a, function (h) { return h.def; });
      case 'defHigh': return maxBy(a, function (h) { return h.def; });
      case 'dmgHigh': return maxBy(a, function (h) { return h.damage || 0; });
      case 'ranged': {
        const r = a.filter(heroHasRangedAttack);
        return (r.length ? r : a)[0];
      }
      case 'isolated': {
        const iso = a.filter(function (h) { return zoneHeroCount(h.zone) === 1; });
        // Parmi les isolés (ou à défaut tous), on privilégie les PV les plus bas.
        return minBy((iso.length ? iso : a), function (h) { return h.pv; });
      }
      case 'random':  return a[Math.floor(Math.random() * a.length)];
      case 'closest':
      default:        return a[0];
    }
  }
  // DISCRÉTION (Talent d'Espèce des Gnomes) : tant qu'un autre aventurier se
  // trouve dans sa zone, ce combattant n'est pas visé en priorité.
  function isDiscreet(h) {
    return !!(h && h.side === 'hero' && heroHasTalent(h, 'discretion') && zoneHeroCount(h.zone) > 1);
  }
  function chooseFrom(monster, candidates) {
    if (!candidates || !candidates.length) return null;
    // MENACE (talent d'aventurier) : un aventurier peut forcer l'adversaire à le viser.
    const taunters = candidates.filter(function (h) { return heroMenaces(h, monster); });
    let pool = taunters.length ? taunters : candidates;
    // La Menace prime sur la Discrétion : on n'écarte les discrets que si
    // personne ne force le ciblage, et seulement s'il reste quelqu'un à viser.
    if (!taunters.length) {
      const exposed = pool.filter(function (h) { return !isDiscreet(h); });
      if (exposed.length) pool = exposed;
    }
    return focusPick(pool, monster.menace) || pool[0];
  }

  function minBy(arr, f) { return arr.reduce(function (a, b) { return f(b) < f(a) ? b : a; }); }
  function maxBy(arr, f) { return arr.reduce(function (a, b) { return f(b) > f(a) ? b : a; }); }

  // Fuite des adversaires en fin de tour — l'ancien talent « flee_after_turns »
  // a été retiré : plus aucune fuite automatique (le nouveau système de Talents
  // adverses ne gère pas encore la fuite).
  function doFlee() {
    checkOutcome();
  }

  // Retourne vrai si au moins un combattant actif possède un talent de Pré-Tour.
  // Vérifie également freeMoveReady (posé par instFromHero au Tour 1 avant que
  // startHeroTurn n'ait recalculé le flag) pour une détection fiable dès le début.
  function needsPretour() {
    return activeOf('hero').some(function (h) {
      return h.freeMoveReady || heroHasTalent(h, 'pas_leger') || !!h.rapide || heroHasTalent(h, 'pretour_first') ||
        (combat().turn === 1 && !combat().gardienDone && (heroHasTalent(h, 'gardien') || heroHasTalent(h, 'orbe_pretour')));
    }) || activeOf('monster').some(function (m) { return !!m.rapide; });
  }

  // Phase de Pré-Tour : les adversaires rapides agissent, les héros éligibles
  // conservent leur freeMoveReady pour agir avant le vrai tour.
  function pretourMonstersAct() {
    clearHeroReactionMarks();
    activationOrder().filter(function (m) { return !!m.rapide; }).forEach(actOneMonster);
    checkOutcome();
  }

  // GARDIEN : au Pré-Tour 1, chaque Gardien peut désigner X alliés qui reçoivent
  // Blindage + Gardé. La désignation est INTERACTIVE (clic sur le talent puis sur
  // les alliés — aucune fenêtre pop-up) : on initialise seulement le compteur.
  function applyGardienDesignations() {
    const c = combat();
    if (c.gardienDone) return;
    c.gardienDone = true;
    activeOf('hero').filter(function (h) { return heroHasTalent(h, 'gardien'); }).forEach(function (h) {
      if (h.gardienLeft == null) h.gardienLeft = Math.max(1, heroTalentVal(h, 'gardien') || 1);
      if (h.gardienLeft > 0) {
        log('<b class="lreact">Gardien</b> : ' + cname(h) + ' peut désigner ' + h.gardienLeft +
          ' allié(s) Gardé(s) — cliquez le talent puis un allié.', 'state');
      }
    });
  }
  // Un Gardien peut-il encore désigner un allié (Pré-Tour 1) ?
  function canDesignateGardien(h) {
    return combat().turn === 1 && !combat().outcome && h.side === 'hero' && h.status === 'active' && (h.gardienLeft || 0) > 0;
  }
  // Pré-Tour terminé : plus aucun mouvement gratuit ni désignation Gardien en attente.
  // (Les Orbes de Pré-Tour restent optionnels — ils gardent freeMoveReady actif.)
  function pretourAllDone() {
    return combat().phase === 'pretour' && !combat().outcome &&
      !activeOf('hero').some(function (h) { return h.freeMoveReady || canDesignateGardien(h); });
  }

  // ---------- Pré-Tour : armement automatique ----------
  // Actions de Pré-Tour encore disponibles, tous aventuriers confondus.
  function pretourOptions() {
    const c = combat();
    if (!c || c.phase !== 'pretour' || c.outcome) return [];
    const out = [];
    activeOf('hero').forEach(function (h) {
      // GARDIEN : désignation d'alliés à protéger.
      if (canDesignateGardien(h)) {
        out.push({ iid: h.iid, kind: 'gardien', ico: '🛡️', hero: h,
          label: (function () { const n = heroTalentName(h, 'gardien'); return (!n || n === 'gardien') ? 'Gardien' : n; })(),
          hint: 'Désigner ' + (h.gardienLeft || 1) + ' allié(s) à protéger' });
      }
      // PRÉPARATION ARCANIQUE : un Orbe lançable dès le Pré-Tour 1.
      if (c.turn === 1 && heroHasTalent(h, 'orbe_pretour') && !h.orbPretourDone &&
          !actionSpent(h) && !(h.states && h.states.auSol)) {
        const i = (h.attacks || []).findIndex(isOrbAttack);
        if (i >= 0 && (h.attackUses[i] === undefined || h.attackUses[i] > 0)) {
          out.push({ iid: h.iid, kind: 'orb', atkIndex: i, ico: '🔮', hero: h,
            label: 'Orbes Mystiques', hint: 'Lancer un Orbe avant le tour' });
        }
      }
      // Mouvement gratuit (Pas Léger, Rapide, Initiative…).
      if (h.freeMoveReady && !h.used.move && zoneCount() > 1) {
        out.push({ iid: h.iid, kind: 'move', ico: '👣', hero: h,
          label: 'Déplacement libre', hint: 'Changer de zone avant le tour' });
      }
    });
    return out;
  }
  function pretourArmed() {
    return !!(pendingDesignate || pendingAttack || pendingMove || pendingObject || pendingAnalyze || pendingOrbeShare);
  }
  // Arme une option de Pré-Tour : la cible n'a plus qu'à être cliquée.
  function armPretourOption(o) {
    pendingDesignate = null; pendingAttack = null; pendingMove = null;
    selectedIid = o.iid;
    if (o.kind === 'gardien') pendingDesignate = o.iid;
    else if (o.kind === 'orb') pendingAttack = { iid: o.iid, atkIndex: o.atkIndex, average: false };
    else if (o.kind === 'move') pendingMove = o.iid;
  }
  // Une seule action de Pré-Tour disponible : on l'arme d'office (le joueur n'a
  // plus qu'à cliquer la cible). Plusieurs : c'est la fenêtre de choix qui tranche.
  function autoArmPretour() {
    const c = combat();
    if (!c || c.phase !== 'pretour' || c.outcome || pretourArmed()) return;
    const opts = pretourOptions();
    if (opts.length === 1) armPretourOption(opts[0]);
  }

  function startPretour() {
    const c = combat();
    c.phase = 'pretour';
    autoSelectOff = false; manualSelect = false;   // nouveau tour : la sélection automatique reprend
    // Octroie le mouvement gratuit (Pas Léger), l'action rapide (Rapide), et l'accès
    // au Pré-Tour pour Initiative / Préparation Arcanique (Orbes en Pré-Tour 1).
    activeOf('hero').forEach(function (h) {
      h.freeMoveReady = heroHasTalent(h, 'pas_leger') || !!h.rapide || heroHasTalent(h, 'pretour_first') ||
        (c.turn === 1 && heroHasTalent(h, 'orbe_pretour'));
    });
    // GARDIEN (maîtrise) : au Pré-Tour 1, désignation des alliés Gardés.
    if (c.turn === 1) applyGardienDesignations();
    // INITIATIVE : si un aventurier agit avant les rapides, on diffère ces derniers.
    const deferFast = activeOf('hero').some(function (h) { return heroHasTalent(h, 'pretour_first'); }) &&
      activeOf('monster').some(function (m) { return !!m.rapide; });
    c.fastDeferred = !!deferFast;
    // Présélectionne un aventurier disposant d'un talent de pré-tour, si possible.
    const readyHeroes = activeOf('hero').filter(function (h) { return h.freeMoveReady; });
    if (readyHeroes.length) selectedIid = readyHeroes[0].iid;
    if (readyHeroes.length) {
      const names = readyHeroes.map(function (h) { return cname(h); }).join(', ');
      log('Pré-Tour ' + c.turn + ' : ' + names + ' ' + (readyHeroes.length > 1 ? 'ont' : 'a') +
        ' un talent à utiliser (appuyez sur Tour ' + c.turn + ' pour passer).', 'turn');
    } else {
      log('Pré-Tour ' + c.turn + '.', 'turn');
    }
    centerText('Pré-Tour ' + c.turn, 'fx-center-turn');
    // INITIATIVE : les adversaires rapides agissent maintenant SAUF s'ils sont différés.
    if (!c.fastDeferred) pretourMonstersAct();
    // Si aucun aventurier n'a finalement de talent à jouer (ex. seuls des
    // adversaires rapides agissaient), on enchaîne directement le vrai tour.
    if (!combat().outcome && !activeOf('hero').some(function (h) { return h.freeMoveReady || canDesignateGardien(h); })) {
      startTurnFromPretour();
    }
  }

  // Démarre le vrai tour des héros après le Pré-Tour (ne réattribue pas freeMoveReady).
  function startTurnFromPretour() {
    if (combat().outcome) return;
    pendingDesignate = null; // la désignation Gardien ne survit pas au Pré-Tour
    const c = combat();
    // INITIATIVE : les adversaires rapides différés agissent maintenant (après les héros).
    if (c.fastDeferred) {
      c.fastDeferred = false;
      pretourMonstersAct();
      if (c.outcome) { Store.save(); render(); return; }
    }
    log('Tour ' + c.turn + '.', 'turn');
    centerText('Tour ' + c.turn, 'fx-center-turn');
    c.phase = 'heroes';
    startHeroTurn(true);
    Store.save(); render();
  }

  function advanceTurn() {
    const c = combat();
    c.turn += 1;
    resetActivations();
    designateMarkedHero(); // PROIE : désigne la cible du tour (si un adversaire l'a)
    if (needsPretour()) {
      startPretour(); // logue 'Pré-Tour X' ; 'Tour X' sera loggué au clic du bouton
    } else {
      log('Tour ' + c.turn + '.', 'turn');
      centerText('Tour ' + c.turn, 'fx-center-turn');
      c.phase = 'heroes';
      startHeroTurn(false);
    }
  }

  // Début du tour des aventuriers : réinitialise les réactions et les marqueurs
  // de tour (la Régénération, elle, s'applique en FIN de tour).
  // afterPretour = true → freeMoveReady déjà consommé/utilisé en Pré-Tour.
  function startHeroTurn(afterPretour) {
    activeOf('hero').forEach(function (h) {
      h.reactUsed = {};
      // SURVITAMINÉ : réinitialise le compteur de 2 actions à chaque tour.
      h.actedOnce = false;
      // ACROBATIE : l'amorce de dé noir ne survit pas au changement de tour.
      h.acrobatiePrimed = false;
      // DÉPHASAGE : l'immunité couvrait le tour adverse précédent ; on l'efface.
      h.dephaseTurn = null;
      // Efface les marqueurs de réaction du tour précédent (un coup subi au tour des
      // adversaires ne doit pas rendre la Riposte « prête » au tour des héros).
      h.tookDamage = false; h.lastAttacker = null;
      // PAS LÉGER (maîtrise) : 1 mouvement gratuit disponible ce tour (sauf si Pré-Tour déjà joué).
      if (!afterPretour) h.freeMoveReady = heroHasTalent(h, 'pas_leger');
    });
  }

  // RÉGÉNÉRATION : à la FIN de chaque tour, le porteur du talent récupère X PV
  // (valeur fixe ou expression de dés, ex. « 1d6 » — tirée à chaque tour).
  // L'effet est commun aux aventuriers et aux adversaires.
  function applyRegeneration() {
    if (!combat()) return;
    combat().combatants.forEach(function (c) {
      if (c.status !== 'active' || c.pv >= c.maxPv) return;
      const regen = heroTalentVal(c, 'regeneration');
      if (regen <= 0) return;
      const before = c.pv;
      c.pv = Math.min(c.maxPv, c.pv + regen);
      if (c.pv <= before) return;
      pushFx({ type: 'heal', iid: c.iid, amount: c.pv - before, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
      log(cname(c) + ' régénère <span class="dnum d-green">' + (c.pv - before) + '</span> PV en fin de tour.', 'state');
    });
  }

  function endTurn() {
    pendingAttack = null; stateMenuFor = null;
    applyEndOfTurnStates(); // FEU, puis RÉGÉNÉRATION
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
          if (cannotAct(h, a, i)) return;
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
    gele: { l: 'Gelé', neg: true },
    garde: { l: 'Gardé', neg: false }, prepare: { l: 'Préparé', neg: false },
    invisible: { l: 'Invisible', neg: false },
  };
  // ---- Accords selon le genre de l'aventurier (il/lui · elle/elle · on) ----
  // Les adversaires restent au masculin par défaut.
  function gPro(c) { return (c && c.side === 'hero' && Combatants.pronoun) ? Combatants.pronoun(c) : 'il'; }
  function gObj(c) { return (c && c.side === 'hero' && Combatants.pronounObj) ? Combatants.pronounObj(c) : 'lui'; }
  function gAgr(c, word, fem) { return (c && c.side === 'hero' && Combatants.agree) ? Combatants.agree(c, word, fem) : word; }
  function stateLabel(s) { return STATE_META[s] ? STATE_META[s].l : s; }
  // Effet de jeu de chaque état, affiché au survol de sa pastille.
  const STATE_DESC = {
    affaibli: 'Perd son bonus de Dégâts et ne peut plus porter d\'attaque d\'opportunité.',
    auSol: 'Aucune attaque ni talent possible, et sa DEF ne le protège plus. Se relever consomme le mouvement.',
    feu: 'À la fin de chaque tour, subit autant de dés noirs que de crans de Feu, puis perd 1 cran.',
    gele: 'Aucun déplacement possible. Un test de Force égal au nombre de crans retire un cran (consomme le mouvement).',
    poison: 'À la fin de chaque tour, subit des dégâts directs égaux au nombre de crans de Poison.',
    blindage: 'Annule entièrement la prochaine source de dégâts subie, puis se dissipe.',
    onde: 'Ignore le prochain état négatif reçu, puis se dissipe.',
    ciblage: 'Marque de ciblage : la cible désignée est visée en priorité.',
    brise: 'Sa DEF ne le protège plus : toutes les attaques passent.',
    faille: 'Ajoute un dé rose à ses jets : les dés partageant sa face sont exclus des dégâts.',
    garde: 'Protégé par un Gardien : il a reçu un Blindage à conserver.',
    prepare: 'Prêt à agir : dispose d\'un mouvement ou d\'une action supplémentaire au prochain tour.',
    invisible: 'Ne peut pas être ciblé directement ; il faut viser sa zone (test de Perception 2). Tout dégât subi le révèle.',
  };
  function stateDesc(s) { return STATE_DESC[s] || ''; }
  // Icône de chaque état — affichée sur son onglet au-dessus du bandeau.
  const STATE_ICON = {
    affaibli: '💤', auSol: '⬇️', feu: '🔥', gele: '❄️', poison: '☠️',
    brise: '💔', faille: '🎲', blindage: '🛡️', onde: '🌊', ciblage: '🎯',
    garde: '⚜️', prepare: '⚡', invisible: '👻',
  };
  function stateIcon(s) { return STATE_ICON[s] || '✦'; }
  // ---- INVISIBILITÉ ----
  // Un combattant invisible ne peut pas être ciblé directement et n'apparaît pas
  // sur le terrain pour le camp adverse. On ne l'atteint qu'en visant sa ZONE,
  // avec un test de Perception 2.
  function isInvisible(c) { return !!(c && c.status === 'active' && c.states && c.states.invisible); }
  // Tout dégât subi DISSIPE l'invisibilité : le combattant redevient visible et
  // ciblable par tous. Appelé à chaque application de dégâts.
  // Journal d'un déplacement : un adversaire INVISIBLE ne dévoile pas sa zone
  // (le joueur ne perçoit qu'un mouvement diffus).
  function logMove(c, zi, suffix) {
    if (hiddenFromPlayer(c)) {
      log('<span class="lstate">Vous sentez un mouvement non loin de vous</span> — un adversaire invisible s\'est déplacé.' +
        (suffix || ''), 'move');
      return;
    }
    log(cname(c) + ' se déplace <span class="lstate">' + esc(zname(zi)) + '</span>' + (suffix || '') + '.', 'move');
  }
  function revealOnDamage(c, dmg) {
    if (!c || !(dmg > 0) || !c.states || !c.states.invisible) return;
    c.states.invisible = false;
    pushFx({ type: 'state', iid: c.iid });
    log(cname(c) + ' est ' + gAgr(c, 'touché') + ' et <span class="lstate">perd son Invisibilité</span> — ' + gPro(c) + ' redevient ' + gAgr(c, 'visible', 'visible') + '.', 'state');
    toast('👁 ' + c.name + ' est ' + gAgr(c, 'démasqué') + ' !', 'invis');
  }
  // Masqué à l'affichage : un adversaire invisible disparaît des zones pour le
  // joueur ; un aventurier invisible reste visible par le joueur (c'est son camp).
  function hiddenFromPlayer(c) { return isInvisible(c) && c.side === 'monster'; }
  // Cibles invisibles d'une zone (côté donné).
  function invisibleIn(zi, side) {
    return combat().combatants.filter(function (m) {
      return m.side === side && m.status === 'active' && m.zone === zi && isInvisible(m);
    });
  }
  // Blindage actif : état ponctuel (states.blindage) OU charges restantes (blindageCharges).
  function hasBlindage(c) { return !!(c && (c.states && c.states.blindage || c.blindageCharges > 0)); }
  // Consomme une source de Blindage pour absorber des dégâts, quelle qu'en soit
  // l'origine (Feu, charge, poison, attaque d'opportunité…). Retourne true si la
  // source de dégâts a été annulée.
  function absorbBlindage(c, label) {
    if (!hasBlindage(c)) return false;
    if (c.states && c.states.blindage) { c.states.blindage = false; }
    else { c.blindageCharges -= 1; }
    const left = (c.blindageCharges > 0)
      ? ' (' + c.blindageCharges + ' restant' + (c.blindageCharges > 1 ? 's' : '') + ')'
      : '';
    log(cname(c) + ' absorbe ' + label + ' grâce au <span class="lstate">Blindage</span>' + left + '.', 'state');
    // Effet visuel dédié : éclat métallique + texte « BLINDAGE ! » sur la vignette.
    pushFx({ type: 'blindage', iid: c.iid, text: 'BLINDAGE !' });
    return true;
  }

  // POISON X : inflige X dégâts au combattant avant qu'il agisse (Attaque, Talent, Mouvement)
  // AGGRAVATION : un aventurier vivant double les dégâts de l'état choisi subis
  // par les adversaires (FEU en fin de tour, POISON avant d'agir).
  function aggravates(state) {
    return activeOf('hero').some(function (h) {
      return heroHasTalent(h, 'feu_double') && (heroTalentChoice(h, 'feu_double') || 'feu') === state;
    });
  }
  function applyPoison(c) {
    const lvl = (c.states && c.states.poison) || 0;
    let dmg = lvl;
    if (!dmg || c.status !== 'active') return;
    if (c.side === 'monster' && aggravates('poison')) dmg *= 2;
    // BLINDAGE : absorbe les dégâts de Poison.
    if (absorbBlindage(c, 'le Poison')) return;
    const before = c.pv;
    c.pv = Math.max(0, c.pv - dmg);
    c.dmgTaken += dmg; revealOnDamage(c, dmg);
    pushFx({ type: 'hit', iid: c.iid, amount: dmg, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' subit ' + amt(dmg, 'dmg') + ' (<span class="lstate">Poison ' + lvl + '</span>' +
      (dmg > lvl ? ', <span class="lstate">Aggravation</span> ×2' : '') + ') avant d\'agir.', 'state');
    checkComa(c);
  }

  // FEU et autres états de fin de tour (appelé avant doFlee)
  function applyEndOfTurnStates() {
    if (!combat()) return;
    combat().combatants.forEach(function (c) {
      const feu = stateVal(c, 'feu');
      if (c.status !== 'active' || feu <= 0) return;
      // BLINDAGE : absorbe les dégâts de Feu (consomme une source) — les flammes
      // faiblissent quand même d'un cran.
      if (absorbBlindage(c, 'le Feu')) { c.states.feu = feu - 1; return; }
      // FEU N : N dés noirs de dégâts.
      let v = 0;
      for (let i = 0; i < feu; i++) v += 1 + Math.floor(Math.random() * 6);
      // AGGRAVATION (élément FEU) : les dégâts de Feu des adversaires sont doublés.
      if (c.side === 'monster' && aggravates('feu')) v *= 2;
      const before = c.pv;
      c.pv = Math.max(0, c.pv - v);
      c.dmgTaken += v; revealOnDamage(c, v);
      pushFx({ type: 'hit', iid: c.iid, amount: v, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
      log(cname(c) + ' subit <span class="dnum d-black">' + v + '</span> Dégâts (<span class="lstate">Feu ' + feu +
        '</span>, ' + feu + ' dé' + (feu > 1 ? 's' : '') + ' noir' + (feu > 1 ? 's' : '') + ') en fin de tour.', 'state');
      // Les flammes s'éteignent peu à peu : −1 Feu à chaque fin de tour.
      c.states.feu = feu - 1;
      if (c.states.feu <= 0) log(cname(c) + ' n\'est plus en <span class="lstate">Feu</span>.', 'state');
      if (c.side === 'monster' && c.pv <= 0 && !c.killedBy) c.killedBy = null;
      checkComa(c);
    });
    // Le Feu brûle d'abord, la Régénération soigne ensuite les survivants.
    applyRegeneration();
    checkOutcome();
  }

  // =================== RENDU ===================
  // ---------- Animations de combat ----------
  // Effets transitoires, non bloquants : on empile des évènements au moment où
  // l'action se résout (dégâts, critique, raté, soin, état, déplacement), puis
  // on les joue après le re-rendu, en retrouvant les cartes par data-iid.
  // 100 % CSS (transform/opacity), auto-nettoyés, sans incidence sur le rythme.
  let fxQueue = [];
  // ALERTE INVISIBLES : message d'ouverture du combat + bandeau flottant rappelé
  // après chaque attaque tant qu'un adversaire invisible est en lice.
  function anyInvisibleFoe() {
    return combat() && combat().combatants.some(function (m) {
      return m.side === 'monster' && m.status === 'active' && isInvisible(m);
    });
  }
  function announceInvisibles() {
    if (!anyInvisibleFoe()) return;
    log('<b class="lopp">Un ou plusieurs adversaires Invisible(s) participe(nt) au combat.</b> ' +
      'Essayez de les attaquer en visant une zone.', 'state');
    flashInvisibleAlert();
  }
  function flashInvisibleAlert() {
    if (!anyInvisibleFoe()) return;
    toast('👁 Adversaire Invisible !', 'invis');
  }
  // ---- Messages flottants ----
  // Mis en file puis affichés APRÈS le rendu : un toast inséré avant render()
  // serait immédiatement effacé par la reconstruction du DOM.
  let toastQueue = [];
  function toast(text, kind) {
    // Doublon consécutif (même texte enchaîné) : inutile de le répéter.
    const last = toastQueue[toastQueue.length - 1];
    if (last && last.text === text) return;
    toastQueue.push({ text: text, kind: kind || 'info' });
    // Rafale : on ne garde que les derniers messages, les plus pertinents.
    if (toastQueue.length > 4) toastQueue = toastQueue.slice(-4);
  }
  // UN SEUL message à l'écran à la fois : ils se succèdent au même endroit au
  // lieu de s'empiler et de se superposer. Le journal garde tout le détail.
  let toastBusy = false;
  function flushToasts() {
    if (toastBusy || !toastQueue.length) return;
    const root = document.querySelector(rootSel);
    if (!root) { toastQueue = []; return; }
    const t = toastQueue.shift();
    const el = document.createElement('div');
    el.className = 'cbt-toast cbt-toast-' + t.kind;
    el.textContent = t.text;
    root.appendChild(el);
    toastBusy = true;
    // Enchaînement serré : les messages restants défilent sans faire attendre.
    const dur = toastQueue.length ? 620 : 1250;
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        toastBusy = false;
        flushToasts();
      }, 180);
    }, dur);
  }

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
  function floatText(rect, text, cls, idx) {
    const span = document.createElement('span');
    span.className = 'fx-float ' + cls;
    span.textContent = text;
    span.style.left = (rect.left + rect.width / 2) + 'px';
    span.style.top = (rect.top + Math.min(30, rect.height * 0.3) + (idx || 0) * 30) + 'px';
    fxLayer().appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); }, { once: true });
  }
  // Gros texte au centre de l'écran (échec, critique, coma d'un aventurier).
  // idx décale verticalement les annonces simultanées pour éviter la superposition.
  function centerText(text, cls, idx) {
    const el = document.createElement('div');
    el.className = 'fx-center ' + cls;
    el.textContent = text;
    if (idx) el.style.top = (40 + idx * 10) + '%';
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
  // VFX : estafilade (coup au contact) — un trait oblique balaie la cible.
  function slashFx(iid) {
    const a = fxAnchor(iid); if (!a) return;
    const el = document.createElement('div');
    el.className = 'fx-slash';
    el.style.left = (a.rect.left + a.rect.width / 2) + 'px';
    el.style.top = (a.rect.top + a.rect.height / 2) + 'px';
    fxLayer().appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); }, { once: true });
  }
  // VFX : projectile (tir) — file de la carte de l'attaquant vers la cible.
  function projectileFx(fromIid, toIid) {
    const f = fxAnchor(fromIid), t = fxAnchor(toIid);
    if (!f || !t) return;
    const x0 = f.rect.left + f.rect.width / 2, y0 = f.rect.top + f.rect.height / 2;
    const x1 = t.rect.left + t.rect.width / 2, y1 = t.rect.top + t.rect.height / 2;
    if (Math.abs(x1 - x0) < 2 && Math.abs(y1 - y0) < 2) return; // même zone : pas de trajectoire
    const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    const el = document.createElement('div');
    el.className = 'fx-projectile';
    el.style.left = x0 + 'px'; el.style.top = y0 + 'px';
    el.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'deg)';
    fxLayer().appendChild(el);
    requestAnimationFrame(function () {
      el.style.transform = 'translate(-50%,-50%) translate(' + (x1 - x0) + 'px,' + (y1 - y0) + 'px) rotate(' + ang + 'deg)';
    });
    el.addEventListener('transitionend', function () { el.remove(); }, { once: true });
  }
  // VFX : secousse de l'écran (screen shake) sur un coup critique.
  function screenShake() {
    const root = $(rootSel); if (!root) return;
    root.classList.remove('fx-shake'); void root.offsetWidth; root.classList.add('fx-shake');
    function onEnd(e) {
      if (e.target !== root) return; // ignore les fins d'animation des cartes filles
      root.classList.remove('fx-shake'); root.removeEventListener('animationend', onEnd);
    }
    root.addEventListener('animationend', onEnd);
  }
  // VFX : glissement d'une carte (FLIP) de son ancienne zone vers la nouvelle.
  function flipMove(iid) {
    const a = fxAnchor(iid);
    if (!a || !a.card) return;
    const card = a.card;
    const oldR = preMoveRects[iid];
    if (!oldR) { cardAnim(card, 'fx-move'); return; }
    const newR = card.getBoundingClientRect();
    const dx = oldR.left - newR.left, dy = oldR.top - newR.top;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) { cardAnim(card, 'fx-move'); return; }
    card.style.transition = 'none';
    card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    void card.offsetWidth;
    requestAnimationFrame(function () {
      card.style.transition = 'transform .42s cubic-bezier(.22,.61,.36,1)';
      card.style.transform = '';
    });
    card.addEventListener('transitionend', function () { card.style.transition = ''; card.style.transform = ''; }, { once: true });
  }
  // Capture la position des cartes affichées (avant un re-rendu) pour le FLIP.
  function captureCardRects() {
    const root = $(rootSel); const out = {};
    if (root) root.querySelectorAll('.combat-card[data-iid]').forEach(function (card) {
      const iid = card.getAttribute('data-iid');
      if (iid) out[iid] = card.getBoundingClientRect();
    });
    return out;
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

  // Éclat métallique du Blindage (« tschiing ») : trait lumineux qui balaie la
  // vignette. Purement décoratif, supprimé à la fin de l'animation.
  function sparkFx(card) {
    if (!card) return;
    try {
      const el = document.createElement('div');
      el.className = 'fx-spark';
      card.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
    } catch (e) {}
  }

  function flushFx() {
    if (!fxQueue.length) return;
    const q = fxQueue; fxQueue = [];
    if (reduceMotion()) return; // animations coupées : on vide sans jouer
    let fxFloatIdx = 0, fxCenterIdx = 0;
    q.forEach(function (ev) {
      const a = fxAnchor(ev.iid);
      if (!a) return;
      switch (ev.type) {
        case 'hit':
          cardAnim(a.card, 'fx-hit');
          floatText(a.rect, '-' + ev.amount, 'fx-dmg', fxFloatIdx++);
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'crit':
          cardAnim(a.card, 'fx-crit');
          if (ev.amount > 0) floatText(a.rect, '-' + ev.amount, 'fx-dmg fx-dmg-crit', fxFloatIdx++);
          centerText('CRITIQUE !', 'fx-center-crit', fxCenterIdx++); // gros texte central
          if (VFX.critique) screenShake(); // Critique : secousse de l'écran
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'attack':
          // Attaque Contact (estafilade) / Attaque Distance (projectile).
          if (ev.range === 'distance') { if (VFX.distance) projectileFx(ev.fromIid, ev.iid); }
          else if (VFX.contact) slashFx(ev.iid);
          break;
        case 'miss':
          cardAnim(a.card, 'fx-whiff');
          if (ev.center) centerText(ev.text || 'ÉCHEC', 'fx-center-fail', fxCenterIdx++);
          else floatText(a.rect, ev.text || 'Raté', 'fx-miss', fxFloatIdx++);
          break;
        case 'heal':
          cardAnim(a.card, 'fx-heal');
          floatText(a.rect, '+' + ev.amount, 'fx-heal-txt', fxFloatIdx++);
          pvGlide(a.card, ev.fromPct, ev.toPct);
          break;
        case 'state':
          cardAnim(a.card, 'fx-state');
          break;
        case 'blindage':
          // « Tschiing ! » : éclat métallique sur la vignette + texte flottant.
          cardAnim(a.card, 'fx-blindage');
          sparkFx(a.card);
          floatText(a.rect, ev.text || 'BLINDAGE !', 'fx-blindage-txt', fxFloatIdx++);
          break;
        case 'move':
          if (VFX.mouvement) flipMove(ev.iid); // glissement de zone à zone
          else cardAnim(a.card, 'fx-move');
          break;
        case 'faint':
          // Adversaire vaincu : fondu fantôme + annonce centrale « <Nom> est vaincu ! ».
          // Aventurier : il reste affiché (grisé) dans sa zone ; coma annoncé au centre.
          if (ev.side === 'monster') {
            spawnGhostFade(ev.iid);
            centerText((ev.name || 'Un adversaire') + ' est vaincu !', 'fx-center-foe', fxCenterIdx++);
          } else {
            centerText((ev.name || 'Un aventurier') + ' tombe dans le coma !', 'fx-center-coma', fxCenterIdx++);
          }
          break;
        case 'flee':
          spawnGhostFade(ev.iid);
          floatText(a.rect, 'En fuite', 'fx-miss', fxFloatIdx++);
          break;
        case 'crossfail':
          centerText('Échec de franchissement !', 'fx-center-fail', fxCenterIdx++);
          break;
      }
    });
  }

  function render() {
    const root = $(rootSel);
    if (!root) return;
    // Capture les positions des cartes AVANT le re-rendu (glissement de mouvement).
    if (VFX.mouvement && !reduceMotion()) { try { preMoveRects = captureCardRects(); } catch (e) { preMoveRects = {}; } }
    try {
      // Toute action jouée fait disparaître la flèche de visée sur-le-champ.
      try { hideAim(); } catch (e) { /* calque absent : rien à effacer */ }
      // PRÉ-TOUR : arme d'office l'unique pouvoir disponible.
      try { autoArmPretour(); } catch (e) { console.error('[combat] autoArmPretour', e); }
      const onBoard = !!combat() && !combat().finished;
      // `has-cbdock` : le bandeau flottant occupe le bas de l'écran — les autres
      // éléments fixes (bouton de rapport de bug) remontent au-dessus.
      document.body.classList.toggle('has-cbdock', onBoard);
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
      lines.push('<div class="cs-xpline"><span class="cs-xpic">🔍</span>' +
        '<span class="cs-xptxt">Analyse' +
        (anaGroups.length ? ' — ' + esc(anaGroups.join(', ')) : ' — <em>Aucune</em>') +
        '</span><span class="cs-xpamt">+' + anaXp + '</span></div>');
      lines.push('<div class="cs-xpline"><span class="cs-xpic">💪</span>' +
        '<span class="cs-xptxt">Sans une égratignure' +
        (unscathed.length ? ' — ' + esc(unscathed.map(function (h) { return h.name; }).join(', ')) : ' — <em>Aucun</em>') +
        '</span><span class="cs-xpamt">+' + noDmgXp + '</span></div>');
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
        ? '<div class="cs-group cs-lootg"><div class="cs-glabel">🎁 Butin récupéré <span class="cs-loot-hint">(À équiper dans l\'Inventaire)</span></div>' +
            '<div class="cs-loot-strips inv-strip-layout">' +
            c.lootResults.map(function (L) {
              const it = Store.state.items.find(function (x) { return x.id === L.itemId; });
              const dest = '<span class="cs-loot-dest">' + (L.qty > 1 ? '×' + L.qty + ' ' : '') +
                (L.toName ? '→ ' + esc(L.toName) : '(groupe)') + '</span>';
              if (!it || !window.Inventory || !Inventory.itemStripHtml) {
                return '<div class="inv-strip-row"><span class="cs-chip">' + esc(L.name) +
                  (L.qty > 1 ? ' ×' + L.qty : '') + '</span>' + dest + '</div>';
              }
              return '<div class="inv-strip-row cat-' + it.category + '">' +
                '<div class="inv-strip">' + Inventory.itemStripHtml(it) + '</div>' + dest +
              '</div>';
            }).join('') + '</div></div>'
        : '') +
      (function () {
        // Or lâché par les adversaires vaincus (ajouté au butin du groupe).
        const g = (combatKey === 'combat' && c.outcome !== 'defeat') ? totalGoldLoot(c) : 0;
        return g > 0 ? '<div class="cs-group cs-goldg"><div class="cs-glabel">🪙 Or récupéré</div>' +
          '<div class="cs-chips"><span class="cs-chip cs-chip-gold">+' + g + ' Or</span></div></div>' : '';
      })() +
      ((c.comaVieEvents && c.comaVieEvents.length)
        ? '<div class="cs-group cs-comag"><div class="cs-glabel">💀 Coma — Perte de VIE <span class="cs-loot-hint">(Votre maximum de PV est réduit. Votre aventurier meurt si vous tombez à 0 VIE.)</span></div><div class="cs-chips">' +
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
            '<span class="setup-map-pick">🗺 Carte ' +
              '<select id="setup-map">' +
                '<option value="">— grille classique —</option>' +
                (Store.loadBattleMaps ? Store.loadBattleMaps() : []).map(function (mp) {
                  return '<option value="' + mp.id + '"' + (setupMapId === mp.id ? ' selected' : '') + '>' +
                    esc(mp.name || 'Sans titre') + ' (' + mp.zones.length + ' zones)</option>';
                }).join('') +
              '</select></span>' +
            '<button id="setup-add-zone" class="ghost small"' + (setupMapId ? ' hidden' : '') + (setupZones.length >= 4 ? ' disabled' : '') + '>+ Zone</button></div>' +
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

    const mapSel = $('#setup-map');
    if (mapSel) mapSel.addEventListener('change', function () {
      setupMapId = mapSel.value;
      if (setupMapId) {
        // Les zones (noms, formes, départ) viennent de la carte ; on y garde
        // les adversaires déjà choisis, zone par zone, tant que l'index existe.
        const mp = (Store.loadBattleMaps() || []).find(function (x) { return x.id === setupMapId; });
        if (mp) {
          const prev = setupZones;
          setupZones = mp.zones.map(function (z, i) {
            return { name: z.name || ('Salle ' + (i + 1)), monsters: (prev[i] && prev[i].monsters) || [] };
          });
          setupHeroZone = Math.max(0, mp.zones.findIndex(function (z) { return z.heroStart; }));
        }
      }
      renderSetup(root);
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
    // Éléments persistants (bandeau flottant, calque de visée) : on les détache
    // avant de réécrire le plateau pour les rattacher tels quels ensuite.
    const keptDock = root.querySelector('#cbdock');
    const keptAim = root.querySelector('#combat-aim');
    if (keptDock) keptDock.remove();
    if (keptAim) keptAim.remove();
    const OUTCOME_LABEL = { victory: 'Victoire', minor: 'Victoire mineure', defeat: 'Défaite' };
    const phaseLabel = c.outcome ? OUTCOME_LABEL[c.outcome]
      : c.phase === 'pretour' ? 'Pré-Tour ' + c.turn
      : c.phase === 'heroes' ? 'Activation des aventuriers'
      : 'Activation des adversaires';
    // Clignotement du bouton "Tour des Adversaires" quand tous les aventuriers ont agi
    const allHeroesActed = !c.outcome && c.phase === 'heroes' && activeOf('hero').length > 0 &&
      activeOf('hero').every(function (h) { return h.used.action; });
    const isPretour = !c.outcome && c.phase === 'pretour';
    // Pré-Tour terminé : plus aucun aventurier n'a de talent de pré-tour à jouer →
    // le bouton « Tour X » clignote (comme « Tour des Adversaires » quand tout est joué).
    const pretourDone = isPretour && !activeOf('hero').some(function (h) { return h.freeMoveReady || canDesignateGardien(h); });
    root.innerHTML =
      '<div class="combat-bar">' +
        '<div class="cb-left"><span class="turn-pill">Tour ' + c.turn + '</span>' +
          '<span class="phase-pill ' + (c.phase) + '">' + phaseLabel + '</span></div>' +
        '<div class="cb-mid">✦ XP : <strong>' + totalXp() + '</strong></div>' +
        '<div class="cb-right">' +
          (isPretour
            ? '<button id="cb-start-turn" class="small start-turn-btn' + (pretourDone ? ' all-acted' : '') + '">Tour ' + c.turn + ' →</button>'
            : '') +
          (!c.outcome && c.phase === 'heroes'
            ? '<button id="cb-enemy-turn" class="small enemy-turn-btn' + (allHeroesActed ? ' all-acted' : '') + '">Tour des Adversaires →</button>'
            : '') +
          (pendingReaction
            ? '<button id="cb-resume" class="small enemy-turn-btn all-acted">Reprendre le Tour →</button>'
            : '') +
          // Tour adverse interrompu (rechargement de la page en pleine phase
          // adverse, par exemple) : un seul bouton pour le relancer et enchaîner.
          (!c.outcome && c.phase === 'monsters' && !pendingReaction && !aiRunning
            ? '<button id="cb-mons-go" class="small enemy-turn-btn all-acted" title="Le tour des adversaires n\'est pas terminé — le relancer et passer au tour suivant">Reprendre le Tour →</button>'
            : '') +
          // Combat terminé : le résumé est aussi accessible depuis la barre (il
          // reste doublé par le grand bouton sous le plateau).
          (c.outcome
            ? '<button id="cb-result" class="small result-btn">📊 Résultat du Combat</button>'
            : '') +
          // RECOMMENCER : remet le combat dans son état de départ. Absent en
          // mode partagé (le joueur d'une partie publiée ne rejoue pas un combat).
          ((combat().initial && !(global.Shell && Shell.isPublished && Shell.isPublished()))
            ? '<button id="cb-restart" class="ghost small" title="Remettre ce combat dans son état de départ : PV, positions, états et journal sont réinitialisés">↺ Recommencer le Combat</button>'
            : '') +
          '<button id="cb-end" class="ghost small" title="Abandonner ce combat : vos adversaires agiront une dernière fois et vous en subirez les conséquences">⚠️ Fuir le Combat</button>' +
        '</div>' +
      '</div>' +
      // Bandeau de choix au clic (talents « vous pouvez… ») : visible seulement
      // quand un choix est en attente.
      (activeChoice
        ? '<div class="combat-choicebar">' +
            '<span class="choicebar-msg">✦ ' + activeChoice.prompt + '</span>' +
            (activeChoice.allowSkip ? '<button id="choice-skip" class="ghost xs">Passer</button>' : '') +
          '</div>'
        : '') +
      // (Pas de bandeau de ciblage : son apparition / disparition faisait sauter
      // la page en hauteur. Les zones visables sont déjà mises en surbrillance,
      // et leur infobulle rappelle qu'on peut y débusquer un invisible.)
      // Plateau + journal : le journal occupe une colonne à droite (assez large
      // pour lire, sans empiéter sur les zones) ; sur écran étroit il repasse
      // au-dessus du plateau en version compacte.
      '<div class="combat-main-grid">' +
        '<div class="combat-main-col">' +
          (combat().layout
            ? '<div class="combat-zones-grid combat-zones-free" style="' + freeGridStyle() + '">' +
                zonesFreeCells() + '</div>'
            : '<div class="combat-zones-grid zc-' + zoneCount() + '" style="' + zonesGridStyle(zoneCount()) + '">' +
                zonesGridCells() + '</div>') +
          '<div id="combat-cemetery" class="combat-cemetery"></div>' +
          '<div class="phase-controls" id="phase-controls"></div>' +
        '</div>' +
        '<div id="combat-log" class="combat-log compact side"></div>' +
      '</div>';
    // Bandeau d'action FLOTTANT, ancré en bas de l'écran : il reste visible quel
    // que soit le défilement. À gauche le pool de dés, à droite la fiche du
    // combattant sélectionné et ses boutons d'action.
    // Le bandeau et le calque de visée sont RÉUTILISÉS d'un rendu à l'autre :
    // le plateau se redessine très souvent et recréer la boîte de dés
    // interrompait l'animation du lancer avant qu'on ait pu la voir.
    // PRÉ-TOUR : plusieurs pouvoirs en concurrence → fenêtre de choix légère.
    renderPretourPick(root);
    root.appendChild(keptDock || buildDock());
    root.appendChild(keptAim || buildAimLayer());
    initDockDesc(root);
    wireAim(root);

    // Chaque phase de rendu est isolée : un incident dans l'une ne doit jamais
    // laisser le plateau, les contrôles ou le journal entièrement vides.
    let zonesErr = null;
    // Bandeau d'action AVANT les zones : ses boutons (data-iid) doivent exister
    // quand wireCard (appelé dans renderZones) les câble.
    try { renderActionBar(); } catch (e) { console.error('[combat] renderActionBar', e); }
    try { renderDicePool(); } catch (e) { console.error('[combat] renderDicePool', e); }
    try { renderZones(); } catch (e) { zonesErr = e; console.error('[combat] renderZones', e); }
    try { renderPhaseControls(); } catch (e) { console.error('[combat] renderPhaseControls', e); }
    try { renderLog(); } catch (e) { console.error('[combat] renderLog', e); }
    // Les infobulles natives sont retirées APRÈS le rendu des boutons et des
    // vignettes : la case Description est seule à documenter les éléments.
    try { stripTitles(root); } catch (e) { /* sans conséquence */ }

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

    const cbRes = root.querySelector('#cb-result');
    if (cbRes) cbRes.addEventListener('click', function () { endCombat(c.outcome !== 'defeat'); });
    const cbRestart = root.querySelector('#cb-restart');
    if (cbRestart) cbRestart.addEventListener('click', function () {
      if (!confirm('Recommencer ce combat depuis le début ? PV, positions, états et journal repartent de zéro.')) return;
      const snap = combat().initial;
      if (!snap) return;
      let again = null;
      try { again = JSON.parse(JSON.stringify(snap)); } catch (e) { return; }
      again.initial = snap;
      selectedIid = null; autoSelectOff = false; manualSelect = false;
      pendingAttack = null; pendingMove = null; pendingAnalyze = null;
      pendingObject = null; pendingOrbeShare = null; pendingDesignate = null;
      arrivalTargetIid = null; movePrefix = null; pendingReaction = null;
      lastRoll = null; rollActive = false;
      fxQueue = []; toastQueue = []; aiToken++;
      setCombat(again);
      // L'instantané est pris AVANT l'ouverture : on rejoue donc l'annonce, la
      // désignation de la Proie et le Pré-Tour, sinon le combat repartait
      // directement en phase héros, sans pouvoirs de Pré-Tour.
      log('Combat recommencé — Tour 1.', 'turn');
      try { announceInvisibles(); } catch (e) {}
      try { designateMarkedHero(); } catch (e) {}
      try { if (needsPretour()) startPretour(); } catch (e) { console.error('[combat] pretour', e); }
      Store.save(); render();
    });
    const cbEnd = root.querySelector('#cb-end');
    if (cbEnd) cbEnd.addEventListener('click', function () {
      const isSession = combatKey === 'combat' && Store.state.sessionCombat;
      if (isSession) {
        if (confirm('Fuir ce combat ? Vos adversaires agiront une dernière fois et vous subirez les conséquences d\'une défaite.')) forfeitCombat();
      } else {
        if (confirm('Fuir et quitter ce combat ?')) endCombat(false);
      }
    });
    const cst = root.querySelector('#cb-start-turn');
    if (cst) cst.addEventListener('click', startTurnFromPretour);
    const cet = root.querySelector('#cb-enemy-turn');
    if (cet) cet.addEventListener('click', enemyTurnAndAdvance);
    const cre = root.querySelector('#cb-resume');
    if (cre) cre.addEventListener('click', function () {
      // Décline la réaction : on efface le déclencheur puis on reprend la séquence.
      const rh = byId(pendingReaction);
      if (rh) { rh.tookDamage = false; rh.lastAttacker = null; }
      resumeMonsterTurn();
    });
    const cmg = root.querySelector('#cb-mons-go');
    if (cmg) cmg.addEventListener('click', function () {
      monstersActSequential(function () {
        if (combat().outcome) { Store.save(); render(); return; }
        endTurn(); // états de fin de tour, fuites, puis tour suivant
      });
    });
    const ct = root.querySelector('#cancel-target');
    if (ct) ct.addEventListener('click', function () { pendingAttack = null; render(); });
    const cm = root.querySelector('#cancel-move');
    if (cm) cm.addEventListener('click', function () { pendingMove = null; arrivalTargetIid = null; render(); });
    const ca = root.querySelector('#cancel-analyze');
    if (ca) ca.addEventListener('click', function () { pendingAnalyze = null; render(); });
    const co = root.querySelector('#cancel-object');
    if (co) co.addEventListener('click', function () { pendingObject = null; render(); });
    const cos = root.querySelector('#cancel-orbeshare');
    if (cos) cos.addEventListener('click', function () { pendingOrbeShare = null; render(); });
    const csk = root.querySelector('#choice-skip');
    if (csk) csk.addEventListener('click', function () { skipActiveChoice(); });

    // Déplacement : cliquer une zone y envoie le combattant en cours de mouvement
    // (uniquement après avoir cliqué le bouton Mouv.).
    root.querySelectorAll('.combat-zone').forEach(function (zEl) {
      zEl.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('.atk-row')) return;
        // Si le clic vise une carte d'adversaire, son propre handler a déjà agi.
        if (e.target.closest('.combat-card.side-monster')) return;
        const zi = parseInt(zEl.getAttribute('data-zone'), 10);
        // ATTAQUE DE ZONE : viser la zone plutôt qu'un adversaire précis. Frappe
        // le premier adversaire visible ; s'il n'y en a pas, tente de débusquer
        // une cible INVISIBLE (test de Perception 2).
        if (pendingAttack && !pendingMove) { attackZone(zi); return; }
        // VISÉE DIRECTE : aucune action armée → l'aventurier sélectionné se
        // déplace vers la zone cliquée.
        if (!pendingMove && !pendingAnalyze && !pendingObject) {
          // Un clic sur une vignette d'allié SÉLECTIONNE cet allié (son propre
          // handler l'a déjà fait) : il ne doit pas déclencher un déplacement.
          if (e.target.closest('.combat-card')) return;
          const ah = aimHero();
          // Même règle que la flèche : le liseré collé aux vignettes n'est pas
          // une cible de déplacement (sinon on part par accident).
          const spotOk = !aimLast || zoneSpotOk(zEl, aimLast);
          if (ah && ah.zone !== zi && spotOk && aimCanMove(ah) && !aimMoveBlocked(ah, zi)) {
            arrivalTargetIid = null;
            moveCombatant(ah.iid, zi);
          }
          return;
        }
        if (!pendingMove) return;
        // Clic sur la zone seule : pas de cible précise → premier adversaire.
        arrivalTargetIid = null;
        moveCombatant(pendingMove, zi);
      });
    });

    // Joue les animations en attente (dégâts, critique, raté, soin, déplacement…)
    try { flushFx(); } catch (e) { fxQueue = []; }
    // Messages flottants (invisibles, attaque dans le vide…) : après le rendu.
    try { flushToasts(); } catch (e) { toastQueue = []; }
  }

  // Contenu de la bannière de ciblage / déplacement (toujours présente : pas de saut d'UI)
  function bannerHtml() {
    if (pendingOrbeShare) {
      const ps = byId(pendingOrbeShare);
      const pi = ps ? ps.attacks.findIndex(isOrbAttack) : -1;
      const orbs = (ps && pi >= 0) ? (ps.attackUses[pi] || 0) : 0;
      return '✦ <b>' + esc(ps ? ps.name : '') + '</b> — Orbes Partagés : <b>clique les alliés à doter</b> ' +
        '(<b>' + orbs + '</b> orbe(s) restant(s)). <button id="cancel-orbeshare" class="ghost xs">Terminer</button>';
    }
    if (pendingObject) {
      const ou = byId(pendingObject);
      const benefic = ou && ou.objectItem && ou.objectItem.objBenefic;
      return '🧪 <b>' + esc(ou ? ou.name : '') + '</b> — ' + esc(ou && ou.objectItem ? ou.objectItem.name : 'Objet') +
        ' : <b>clique ' + (benefic ? 'l\'aventurier' : 'l\'adversaire') + ' à cibler</b>. ' +
        '<button id="cancel-object" class="ghost xs">Annuler</button>';
    }
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
          ' : <b>clique l\'adversaire à frapper</b>' +
          ' <span class="lavg">ou une <b>zone</b> en surbrillance' +
          (anyInvisibleFoe() ? ' (pour débusquer un invisible)' : '') + '</span>. ' +
          '<button id="cancel-target" class="ghost xs">Annuler</button>';
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
  // Descriptif d'un talent équipé (pour l'infobulle au survol dans le bandeau).
  function descForTalentId(c, id) {
    if (!id || !Array.isArray(c.talents)) return '';
    const t = c.talents.find(function (x) { return x.id === id; });
    return t ? (t.description || '') : '';
  }
  function heroTalentSlots(c, canAct) {
    if (!Array.isArray(c.talents)) return [];
    const byId = {}; const order = [];
    c.talents.forEach(function (t) {
      if (t.fromParchment) return; // les parchemins n'occupent JAMAIS d'emplacement de talent
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
      // GARDIEN (Pré-Tour 1) : bouton de désignation cliquable (Blindage + Gardé).
      const under = (c.talents || []).find(function (x) { return x.id === t.id; });
      if (under && under.effect === 'gardien' && canDesignateGardien(c)) {
        const armed = pendingDesignate === c.iid;
        return '<button class="ab-talent ab-talent-named ab-talent-kind-garde ab-gardien-btn' + (armed ? ' selected' : '') +
          '" type="button" data-designate="' + c.iid + '" ' +
          'title="' + esc((descForTalentId(c, under.id) || 'Désignez un allié à protéger (Blindage + Gardé)') + ' — Désignations restantes : ' + c.gardienLeft) + '">' +
          '<span class="ab-tal-txt">' + esc(t.name) + '</span></button>';
      }
      const ai = atks.findIndex(function (a) { return a.special && a.generic && a.talentId === t.id; });
      // L'Orbe Mystique est rendu par le bouton spécial ORBES, pas dans les slots.
      if (ai >= 0 && isOrbAttack(atks[ai])) return null;
      if (ai >= 0) return abAttackBtn(c, atks[ai], ai, canAct);
      const r = reactions.find(function (x) { return x.t.id === t.id; });
      if (r) {
        // Contre-Attaque (Riposte) : réaction déclenchée — utilisable UNIQUEMENT
        // pendant l'interruption qu'elle provoque (jamais comme action libre au tour).
        // Les autres réactions (Réanimation) restent jouables au tour du héros.
        const isInterrupt = r.t.effect === 'contre_attaque';
        const enabled = r.ready && (isInterrupt ? (pendingReaction === c.iid) : canAct);
        return reactionBtn(c, r.t, enabled);
      }
      return '<button class="ab-talent ab-talent-named ab-talent-kind-' + t.kind + '" type="button" disabled ' +
        'title="' + esc(t.name + (descForTalentId(c, t.id) ? ' — ' + descForTalentId(c, t.id) : '')) + '"><span class="ab-tal-txt">' + esc(t.name) + '</span></button>';
    }).filter(function (s) { return s !== null; });
  }

  // Bouton spécial ORBES (Mystique) : titre + dés de dégâts + nombre d'orbes restants.
  function orbesButtonHtml(c, idx, canAct) {
    const a = c.attacks[idx];
    const uses = (c.attackUses && c.attackUses[idx] != null) ? c.attackUses[idx] : 0;
    const orbPretour = combat().phase === 'pretour' && combat().turn === 1 &&
      heroHasTalent(c, 'orbe_pretour') && c.status === 'active' && !combat().outcome;
    const blocked = (!canAct && !orbPretour) || uses === 0 || (c.states && c.states.auSol);
    const isThisAtk = pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === idx && !pendingAttack.average;
    const showDmg = a.useOwnDamage !== false && c.damage > 0 && !c.states.affaibli;
    const figs = Inventory.poolBadges(a.dice) + (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '');
    return '<button class="ab-orbes' + (isThisAtk ? ' selected' : '') + '" type="button"' +
      ' data-iid="' + c.iid + '" data-atk="' + idx + '"' + (blocked ? ' disabled' : '') +
      ' data-label="Orbes (' + uses + ' restant' + (uses > 1 ? 's' : '') + ')"' +
      ' title="Lancer un Orbe Mystique (1 par clic)">' +
      '<span class="ab-orbes-title">ORBES</span>' +
      '<span class="ab-orbes-figs">' + figs + '</span>' +
      '<span class="ab-orbes-count">' + uses + ' restant' + (uses > 1 ? 's' : '') + '</span>' +
    '</button>';
  }

  // Fenêtre de choix du Pré-Tour : n'apparaît que si PLUSIEURS pouvoirs sont en
  // concurrence. Une fois le premier joué, les suivants s'arment tout seuls.
  function renderPretourPick(root) {
    const opts = pretourOptions();
    if (pretourArmed() || opts.length < 2) return;
    let h = '<div class="ptpick"><div class="ptpick-box">' +
      '<div class="ptpick-head">✦ Pré-Tour ' + combat().turn + ' — par quoi commencez-vous ?</div>' +
      '<div class="ptpick-list">';
    opts.forEach(function (o, i) {
      h += '<button class="ptpick-opt" type="button" data-opt="' + i + '">' +
        '<span class="ptpick-ico">' + o.ico + '</span>' +
        '<span class="ptpick-txt"><b>' + esc(o.label) + '</b>' +
          '<small>' + esc(o.hero.name) + ' — ' + esc(o.hint) + '</small></span>' +
      '</button>';
    });
    h += '</div><div class="ptpick-foot">Les pouvoirs restants s\'armeront ensuite automatiquement.' +
      '<button class="ghost xs" id="ptpick-skip">Passer le Pré-Tour</button></div>' +
    '</div></div>';
    const wrap = document.createElement('div');
    wrap.innerHTML = h;
    const el = wrap.firstChild;
    root.appendChild(el);
    el.querySelectorAll('.ptpick-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        const o = opts[parseInt(b.getAttribute('data-opt'), 10)];
        if (o) { armPretourOption(o); render(); }
      });
    });
    const sk = el.querySelector('#ptpick-skip');
    if (sk) sk.addEventListener('click', function () { startTurnFromPretour(); });
  }

  // ---------- Bandeau flottant & calque de visée ----------
  function buildDock() {
    const d = document.createElement('div');
    d.id = 'cbdock'; d.className = 'cbdock';
    d.innerHTML = '<div class="cbdock-inner">' +
      '<div id="cbdock-id" class="cbdock-id"></div>' +
      '<div id="combat-dicepool" class="dicepool"></div>' +
      '<div id="combat-actionbar" class="combat-actionbar"></div>' +
      '<div id="cbdock-desc" class="cbdock-desc"></div>' +
    '</div>';
    return d;
  }
  // Quatrième case du bandeau : décrit le bouton survolé ou cliqué. Les boutons
  // désactivés ne déclenchent aucun événement : on lit donc l'élément sous le
  // curseur, ce qui marche pour tous.
  let descLast = '';
  function dockDescDefault() {
    return '<div class="cbdesc-empty">Survolez ou cliquez un bouton pour lire son effet.</div>';
  }
  function showDockDesc(btn) {
    const root = $(rootSel);
    const box = root ? root.querySelector('#cbdock-desc') : null;
    if (!box) return;
    if (!btn) {
      if (descLast === '' ) return;
      return; // on garde la dernière description affichée
    }
    const raw = btn.getAttribute('data-desc') || btn.getAttribute('title') || '';
    let name = (btn.getAttribute('data-label') || btn.textContent || '').trim();
    if (!name) {
      const img = btn.querySelector('img');
      name = img ? (img.getAttribute('alt') || 'Attaque') : 'Action';
    }
    // Les infobulles au format « Nom — description » sont scindées.
    let txt = raw;
    if (raw.indexOf(name) === 0) txt = raw.slice(name.length).replace(/^\s*[—-]\s*/, '');
    const key = name + '\u0000' + txt;
    if (key === descLast) return;
    descLast = key;
    // Le titre reprend la couleur du bouton décrit (assombrie pour rester
    // lisible sur le fond parchemin de la case).
    const tone = toneOf(btn);
    box.innerHTML = '<div class="cbdesc-name"' + (tone ? ' style="color:' + tone + '"' : '') + '>' +
      esc(name) + '</div>' +
      '<div class="cbdesc-txt">' + (txt ? esc(txt) : 'Aucune description.') + '</div>';
  }
  // Règle de chaque couleur de dé, affichée au survol dans la case Description.
  const DIE_DESC = {
    white: 'Dé simple. Sa valeur doit DÉPASSER la Défense de la cible pour infliger ses dégâts.',
    bone: 'Dé léger. Comme le dé simple, mais il est RETIRÉ du total s\'il tombe sur un double.',
    red: 'Dé lourd. Il IGNORE la Défense : sa valeur passe toujours.',
    blue: 'Dé mystique. Sa valeur est DOUBLÉE s\'il tombe sur un double (la Défense se compare à la valeur brute).',
    green: 'Dé de soin. Il rend des points de vie et ignore la Défense.',
    black: 'Dé mortel. Il ignore la Défense et n\'entre pas dans le décompte de l\'échec critique.',
    yellow: 'Dé de phase. Sa valeur est MULTIPLIÉE par le numéro du tour (jusqu\'à ×3).',
    pink: 'Dé de faille. Tous les dés qui affichent la MÊME face que lui sont exclus des dégâts.',
  };
  function showDieDesc(el) {
    const root = $(rootSel);
    const box = root ? root.querySelector('#cbdock-desc') : null;
    if (!box) return;
    const color = (el.className.match(/die-(\w+)/) || [])[1];
    if (!color) return;
    const name = (DIE_LABEL[color] || color) + ' — dé ' + color;
    const key = 'die:' + color;
    if (key === descLast) return;
    descLast = key;
    box.innerHTML = '<div class="cbdesc-name" style="color:' + (TONE_DIE[color] || '#7a4a12') + '">Dé ' +
      esc(DIE_LABEL[color] || color) + '</div>' +
      '<div class="cbdesc-txt">' + esc(DIE_DESC[color] || '') + '</div>';
  }

  // Fiche affichée dans la case Description au survol du plateau.
  function descBox() {
    const root = $(rootSel);
    return root ? root.querySelector('#cbdock-desc') : null;
  }
  // Couleur représentative d'un bouton : sa bordure d'abord (elle porte la
  // teinte du genre), sinon son fond, sinon son texte. Les dégradés rendent
  // `background-color` transparent : sans ce repli, le titre sortait en noir.
  function toneOf(el) {
    try {
      const cs = getComputedStyle(el);
      const cands = [cs.borderTopColor, cs.backgroundColor, cs.color];
      for (let i = 0; i < cands.length; i++) {
        const m = (cands[i] || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        if (!m) continue;
        const al = m[4] === undefined ? 1 : parseFloat(m[4]);
        const rgb = [+m[1], +m[2], +m[3]];
        if (al < .2 || (rgb[0] + rgb[1] + rgb[2] === 0 && al < 1)) continue;
        const lum = (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114) / 255;
        const k = lum > .42 ? .58 : .95;   // les tons clairs sont assombris davantage
        return 'rgb(' + rgb.map(function (v) { return Math.round(v * k); }).join(',') + ')';
      }
    } catch (e) { /* repli : couleur par défaut du titre */ }
    return '';
  }

  // `tone` : couleur du titre — celle de l'élément décrit (bouton, classe de
  // l'aventurier, type de l'adversaire, dé, barrière…).
  function putDesc(key, title, html, tone) {
    const box = descBox();
    if (!box || key === descLast) return;
    descLast = key;
    box.innerHTML = '<div class="cbdesc-name"' + (tone ? ' style="color:' + tone + '"' : '') + '>' +
      esc(title) + '</div>' +
      '<div class="cbdesc-txt">' + html + '</div>';
  }
  const BARRIER_DESC = {
    infranchissable: 'Barrière infranchissable : aucun déplacement possible entre ces deux zones. Les tirs passent.',
    mur: 'Mur : aucun déplacement NI aucun tir ne le traverse. Il coupe aussi la ligne de vue.',
    difficile: 'Passage difficile : franchissable, mais il faut réussir un test d\'Agilité pour le traverser.',
    instable: 'Passage instable : toujours franchissable, mais un test d\'Agilité raté fait arriver Au sol.',
  };
  // Teintes des titres de la case Description (lisibles sur son fond parchemin).
  const TONE_KLASS = {
    apothicaire: '#2f6b1f', artificier: '#8a6410', chasseur: '#2f6f22', destructeur: '#a83a22',
    deviant: '#6a3fa8', gardien: '#1f5a96', lamevent: '#136b5e', mystique: '#5f3c9e',
  };
  const TONE_TYPE = { standard: '#5a5348', alpha: '#8a6410', solitaire: '#a8321f', boss: '#6a2fa8' };
  const TONE_DIE = {
    white: '#6b6257', bone: '#8a6a2a', red: '#a8321f', blue: '#1f5a96',
    green: '#2f6b1f', black: '#2c2620', yellow: '#8a7410', pink: '#a8329a',
  };
  const TONE_BARRIER = { infranchissable: '#8a6410', mur: '#4a463f', difficile: '#6b6257', instable: '#8a6410' };

  const BARRIER_TITLE = {
    infranchissable: 'Infranchissable', mur: 'Mur', difficile: 'Passage difficile', instable: 'Passage instable',
  };
  function showBoardDesc(under) {
    const card = under.closest('.combat-card[data-iid]');
    if (card) { showCombatantDesc(byId(card.getAttribute('data-iid'))); return; }
    const sep = under.closest('.zone-sep, .zone-sep-diag');
    if (sep) {
      const type = (sep.className.match(/barrier-([\w]+)/) || [])[1];
      if (!type) return;
      const lbl = sep.querySelector('.zone-sep-lbl');
      const nm2 = (lbl && lbl.textContent.trim()) || BARRIER_TITLE[type] || type;
      putDesc('bar:' + type + nm2, nm2, esc(BARRIER_DESC[type] || ''), TONE_BARRIER[type]);
      return;
    }
    const zone = under.closest('.combat-zone[data-zone]');
    if (zone) {
      const zi = parseInt(zone.getAttribute('data-zone'), 10);
      const here = combat().combatants.filter(function (x) { return x.zone === zi && x.status === 'active'; });
      const nh = here.filter(function (x) { return x.side === 'hero'; }).length;
      const nm2 = here.length - nh;
      const parts = [];
      if (nh) parts.push('<b>' + nh + '</b> aventurier' + (nh > 1 ? 's' : ''));
      if (nm2) parts.push('<b>' + nm2 + '</b> adversaire' + (nm2 > 1 ? 's' : ''));
      putDesc('zone:' + zi + ':' + here.length, zname(zi),
        parts.length ? parts.join(' et ') + ' sur place.' : 'Zone vide : personne ne s\'y trouve.', '#7a4a12');
    }
  }
  // Fiche d'un combattant : un adversaire ne révèle ses chiffres qu'ANALYSÉ.
  function showCombatantDesc(c) {
    if (!c) return;
    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;
    const L = [];
    if (isEnemy) {
      L.push('<b>' + esc((Combatants.TYPE_LABEL && Combatants.TYPE_LABEL[c.type]) || c.type || 'Adversaire') + '</b>');
    } else if (c.klass) {
      L.push('<b>' + esc(c.klass) + '</b>');
    }
    if (known) {
      L.push('PV <b>' + c.pv + ' / ' + c.maxPv + '</b>');
      L.push('DEF <b>' + ((c.states.auSol || c.states.brise) ? 0 : c.def) + '</b>');
      if (c.damage) L.push('Dégâts <b>+' + c.damage + '</b>');
      if (isEnemy && c.xp) L.push('<b>' + c.xp + '</b> XP');
    }
    let txt = L.join(' · ');
    // États en cours.
    const st = Object.keys(STATE_META).filter(function (k) {
      return isStackState(k) ? stateVal(c, k) > 0 : (k === 'prepare' ? (c.states.prepare || c.prepBonus) : c.states[k]);
    });
    if (st.length) {
      txt += '<br><span class="cbdesc-states">' + st.map(function (k) {
        return stateIcon(k) + ' ' + esc(stateBadgeLabel(c, k));
      }).join(' · ') + '</span>';
    }
    if (!known) {
      txt += '<br><i>Adversaire non analysé : sa Défense, ses Dégâts et son XP restent inconnus. Utilisez l\'action Analyse pour les révéler.</i>';
    } else if (isEnemy) {
      const tpl = (Store.state.monsters || []).find(function (m) { return m.id === c.templateId; });
      if (tpl && tpl.notes) txt += '<br><i>' + esc(tpl.notes) + '</i>';
      const labels = c.analyzed ? (c.talentLabels || []) : [];
      if (labels.length) txt += '<br>Talents : <b>' + esc(labels.join(', ')) + '</b>';
    } else {
      const rest = [];
      if (!actionSpent(c)) rest.push('action');
      if (c.prepBonus) rest.push('action bonus (Préparé)');
      if (!c.used.move || c.freeMoveReady || c.freeMoves > 0) rest.push('mouvement');
      txt += '<br>' + (rest.length ? 'Reste : <b>' + rest.join(', ') + '</b>.' : '<i>A tout joué ce tour.</i>');
    }
    const tone = isEnemy ? (TONE_TYPE[c.type] || '#a8321f') : (TONE_KLASS[slug(c.klass || '')] || '#1f5a96');
    putDesc('c:' + c.iid + ':' + c.pv + ':' + st.join(',') + ':' + (c.analyzed ? 'a' : '') + ':' + (actionSpent(c) ? 's' : ''),
      c.name, txt, tone);
  }

  // Règle d'un état, affichée dans la case Description au survol de son onglet.
  function showStateDesc(el) {
    const key = el.getAttribute('data-state');
    if (!key || !STATE_META[key]) return;
    const lbl = (el.querySelector('.dock-state-lbl') || {}).textContent || stateLabel(key);
    putDesc('st:' + key + ':' + lbl, stateIcon(key) + ' ' + lbl.trim(),
      esc(stateDesc(key)), toneOf(el));
  }

  function initDockDesc(root) {
    const box = root.querySelector('#cbdock-desc');
    if (box && !box.firstChild) box.innerHTML = dockDescDefault();
  }
  // La case Description remplace les infobulles du navigateur : dans le bandeau
  // et sur le plateau, chaque `title` est déplacé dans `data-desc` (lu par la
  // case) pour qu'aucune bulle jaune ne vienne se superposer.
  function stripTitles(root) {
    root.querySelectorAll('#cbdock [title], .combat-card [title], .combat-card[title]').forEach(function (el) {
      const t = el.getAttribute('title');
      if (t) { if (!el.getAttribute('data-desc')) el.setAttribute('data-desc', t); el.removeAttribute('title'); }
    });
  }

  function buildAimLayer() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'combat-aim'; s.setAttribute('class', 'combat-aim');
    s.innerHTML = '<path class="aim-line" d=""></path><polygon class="aim-head" points=""></polygon>' +
      '<circle class="aim-ico-bg" r="26" cx="-99" cy="-99"></circle>' +
      '<image class="aim-ico-img" width="32" height="32" x="-99" y="-99"></image>' +
      '<text class="aim-ico-txt" x="-99" y="-99" text-anchor="middle" dominant-baseline="central"></text>';
    return s;
  }

  // VISÉE À LA SOURIS : un aventurier sélectionné « tend » une flèche vers ce
  // que survole le curseur — BEIGE vers une zone (déplacement), ROUGE vers un
  // adversaire ou une zone visée (attaque). Le clic exécute l'action.
  // Le joueur a explicitement désélectionné (clic dans le vide) : on n'auto-
  // sélectionne plus tant qu'il n'a pas repris la main sur un combattant.
  let autoSelectOff = false;
  let manualSelect = false;  // le combattant affiché a été choisi par le joueur
  let aimWiredEl = null;   // conteneur déjà câblé
  let aimMod = false;      // Cmd / Ctrl maintenu : la visée passe en ANALYSE
  let aimRaf = 0;
  let aimLast = null;      // dernière position de curseur connue

  // L'aventurier qui vise : celui affiché dans le bandeau, s'il peut encore agir.
  function aimHero() {
    const cmb = combat();
    if (!cmb || cmb.outcome || pendingReaction) return null;
    if (cmb.phase !== 'heroes' && cmb.phase !== 'pretour') return null;
    // L'action armée impose son auteur (Gardien, Orbes Partagés, objet, analyse…).
    const src = pendingDesignate || pendingOrbeShare || pendingObject || pendingAnalyze ||
      (pendingAttack && pendingAttack.iid) || pendingMove || selectedIid;
    const h = src ? byId(src) : null;
    if (!h || h.side !== 'hero' || h.status !== 'active') return null;
    return h;
  }
  // Mode de visée courant : c'est l'action armée qui commande.
  function aimMode() {
    if (pendingDesignate) return 'garde';
    if (pendingOrbeShare) return 'partage';
    if (pendingObject) return 'objet';
    if (pendingAnalyze) return 'analyse';
    if (pendingAttack) return 'atk';
    if (pendingMove) return 'move';
    return null;
  }
  // Une attaque est-elle encore jouable ? (mêmes règles que le bouton d'attaque)
  function attackUsable(c, i) {
    const a = c.attacks && c.attacks[i];
    if (!a) return false;
    const uses = (c.attackUses && c.attackUses[i] !== undefined) ? c.attackUses[i] : null;
    if (uses === 0) return false;
    if (!a.freeAction && actionSpent(c)) return false;
    if (!a.isBase && !a.freeAction && Array.isArray(c.actedAtks) && c.actedAtks.indexOf(i) >= 0) return false;
    if (c.states && c.states.auSol) return false;
    if (combat().phase !== 'heroes') return false;
    return true;
  }
  // Attaque par défaut de la visée : la première arme jouable.
  function aimAttackIndex(h) {
    if (!Array.isArray(h.attacks)) return -1;
    for (let i = 0; i < h.attacks.length; i++) {
      if (!h.attacks[i].special && attackUsable(h, i)) return i;
    }
    return -1;
  }
  // Le déplacement libre est-il possible ce tour ?
  function aimCanMove(h) {
    if (zoneCount() < 2) return false;
    if (h.states && h.states.auSol) return false;
    if (stateVal(h, 'gele') > 0) return false;
    const hasFreeMove = h.freeMoveReady || h.freeMoves > 0;
    if (combat().phase === 'pretour') return hasFreeMove && !h.used.move;
    return !h.used.move || hasFreeMove || !!h.prepBonus;
  }

  // Une barrière infranchissable sépare-t-elle l'aventurier de cette zone ?
  function aimMoveBlocked(h, zi) {
    if (heroHasTalent(h, 'teleportation')) return false;
    return moveBarrier(h.zone, zi).type === 'block';
  }
  // Icône du ciblage : ⚔ contact, 🏹 tir, ✦ sort, 👣 déplacement, 🚫 impossible.
  function aimIcon(h, kind, blocked) {
    if (blocked) return { txt: '🚫' };
    if (kind === 'garde') return { txt: '🛡️' };
    if (kind === 'partage') return { txt: '🔮' };
    if (kind === 'objet') return { txt: '🧪' };
    if (kind === 'analyse') return { txt: '🔍' };
    if (kind === 'move') return { txt: '👣' };
    const i = (pendingAttack && pendingAttack.iid === h.iid) ? pendingAttack.atkIndex : aimAttackIndex(h);
    const a = (h.attacks && h.attacks[i]) || null;
    if (a && (isOrbAttack(a) || (a.special && a.range !== 'distance'))) return { img: 'assets/Attack_spell_b.png' };
    if (a && a.range === 'distance') return { img: 'assets/Attack_range_b.png' };
    return { img: 'assets/Attack_melee_b.png' };
  }

  // Le liseré entre le bord d'une zone et une vignette de combattant est trop
  // étroit : le curseur y entrait et en sortait sans cesse, et la flèche
  // clignotait. La zone n'est ciblable qu'à l'écart des vignettes (marge de
  // 12 px) et pas collée à son propre bord (marge de 8 px).
  function zoneSpotOk(zoneEl, pt) {
    const CARD_PAD = 12, EDGE_PAD = 8;
    const r = zoneEl.getBoundingClientRect();
    if (pt.x < r.left + EDGE_PAD || pt.x > r.right - EDGE_PAD ||
        pt.y < r.top + EDGE_PAD || pt.y > r.bottom - EDGE_PAD) return false;
    const cards = zoneEl.querySelectorAll('.combat-card');
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i].getBoundingClientRect();
      if (pt.x > c.left - CARD_PAD && pt.x < c.right + CARD_PAD &&
          pt.y > c.top - CARD_PAD && pt.y < c.bottom + CARD_PAD) return false;
    }
    return true;
  }

  // L'aventurier peut-il analyser ? (l'analyse consomme le mouvement du tour)
  function canAnalyze(h) {
    return !!(h && h.side === 'hero' && h.status === 'active' && combat().phase === 'heroes' &&
      !combat().outcome && !h.used.move && !(h.states && h.states.auSol));
  }
  // Analyse d'un adversaire : révèle tout le groupe du même nom, consomme le
  // mouvement et accorde +2 XP la première fois.
  function doAnalyze(hero, c) {
    if (!hero || hero.used.move) { render(); return; }
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
    if (firstTime) combat_.analyzeXp = (combat_.analyzeXp || 0) + 2;
    log(cname(hero) + ' analyse ' + esc(baseName) +
      (revealed_ > 1 ? ' (×' + revealed_ + ')' : '') +
      (firstTime ? ' <span class="atk-dmg">+2 XP</span>' : '') + '.', 'state');
    hideAim();
    Store.save(); render();
  }

  // Désélectionne le combattant courant et annule toute action armée.
  function clearSelection() {
    if (!selectedIid && !pendingAttack && !pendingMove && !pendingAnalyze &&
        !pendingObject && !pendingOrbeShare && !pendingDesignate) return false;
    selectedIid = null; autoSelectOff = true; manualSelect = false;
    pendingAttack = null; pendingMove = null; pendingAnalyze = null;
    pendingObject = null; pendingOrbeShare = null; pendingDesignate = null;
    arrivalTargetIid = null;
    hideAim();
    render();
    return true;
  }
  // Un clic n'importe où sur la page (y compris hors du plateau, dans les
  // marges perdues) et la touche Échap désélectionnent. Câblé une seule fois.
  let docDeselectWired = false;
  function wireDocDeselect() {
    if (docDeselectWired) return;
    docDeselectWired = true;
    const interactive = '.combat-card, .combat-zone, button, select, input, textarea, a, label, ' +
      '#cbdock, .ptpick, #combat-log, .combat-bar, .modal-box, .dock-state';
    document.addEventListener('click', function (e) {
      const root = $(rootSel);
      if (!root || !root.querySelector('.combat-zones-grid')) return;   // pas de plateau affiché
      if (document.querySelector('.modal:not([hidden])')) return;        // une fenêtre est ouverte
      if (e.target.closest && e.target.closest(interactive)) return;
      clearSelection();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      const root = $(rootSel);
      if (!root || !root.querySelector('.combat-zones-grid')) return;
      if (document.querySelector('.modal:not([hidden])')) return;
      if (clearSelection()) e.preventDefault();
    });
  }

  // ---- Infobulle de barrière : nom + effet, affichée SUR le plateau ----
  // (la case Description du bandeau reçoit le même contenu via showBoardDesc).
  function barTipShow(sep, x, y) {
    const type = (sep.className.match(/barrier-([\w]+)/) || [])[1];
    if (!type) { barTipHide(); return; }
    const lbl = sep.querySelector('.zone-sep-lbl');
    const nm = (lbl && lbl.textContent.trim()) || BARRIER_TITLE[type] || type;
    let tip = document.getElementById('cb-bartip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'cb-bartip';
      document.body.appendChild(tip);
    }
    const sig = type + '|' + nm;
    if (tip.getAttribute('data-sig') !== sig) {
      tip.setAttribute('data-sig', sig);
      tip.innerHTML = '<div class="bartip-name" style="color:' + (TONE_BARRIER[type] || '#6b6257') + '">' +
        esc(nm) + '</div><div class="bartip-txt">' + esc(BARRIER_DESC[type] || '') + '</div>';
    }
    tip.classList.add('on');
    // Au-dessus du curseur, sans déborder de l'écran.
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x - w / 2, top = y - h - 14;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function barTipHide() {
    const tip = document.getElementById('cb-bartip');
    if (tip) tip.classList.remove('on');
  }

  function wireAim(root) {
    wireDocDeselect();
    if (aimWiredEl === root) return;
    aimWiredEl = root;
    // Cmd (ou Ctrl) maintenu : la visée bascule sur l'ANALYSE. On suit la touche
    // même sans bouger la souris.
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Meta' || e.key === 'Control') && !aimMod) { aimMod = true; drawAim(); }
    });
    document.addEventListener('keyup', function (e) {
      if ((e.key === 'Meta' || e.key === 'Control') && aimMod) { aimMod = false; drawAim(); }
    });
    window.addEventListener('blur', function () { if (aimMod) { aimMod = false; drawAim(); } });
    root.addEventListener('mousemove', function (e) {
      aimMod = !!(e.metaKey || e.ctrlKey);
      // Bandeau : la 4e case décrit le bouton sous le curseur. On passe par
      // elementFromPoint car un bouton désactivé n'émet aucun événement.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const overBtn = under && under.closest ? under.closest('#cbdock button') : null;
      if (overBtn) showDockDesc(overBtn);
      // Survol d'un dé : la case Description explique ce que fait sa couleur.
      const overDie = under && under.closest ? under.closest('#cbdock .dp-die') : null;
      if (overDie) showDieDesc(overDie);
      // Survol d'un onglet d'état : sa règle va dans la case Description.
      else if (under && under.closest && under.closest('.dock-state')) showStateDesc(under.closest('.dock-state'));
      // Survol du plateau : fiche du combattant, de la zone ou de la barrière.
      else if (!overBtn && under && under.closest) showBoardDesc(under);
      // Barrière : infobulle sur place (en plus de la case Description).
      const overSep = under && under.closest ? under.closest('.zone-sep, .zone-sep-diag') : null;
      if (overSep) barTipShow(overSep, e.clientX, e.clientY); else barTipHide();
      aimLast = { x: e.clientX, y: e.clientY };
      if (aimRaf) return;
      aimRaf = requestAnimationFrame(function () { aimRaf = 0; drawAim(); });
    });
    root.addEventListener('mouseleave', function () { aimLast = null; barTipHide(); drawAim(); });
    window.addEventListener('scroll', function () { if (aimLast) drawAim(); }, { passive: true });
  }

  // Une action vient d'être jouée (attaque, déplacement, objet…) : la flèche
  // s'efface immédiatement et ne revient qu'au prochain mouvement de souris.
  function hideAim() {
    const root = $(rootSel);
    const svg = root ? root.querySelector('#combat-aim') : null;
    aimLast = null;
    if (svg) svg.classList.remove('on');
    if (root) clearAimTargets(root);
  }

  function clearAimTargets(root) {
    root.querySelectorAll('.aim-target').forEach(function (el) {
      el.classList.remove('aim-target', 'aim-atk', 'aim-move', 'aim-ko');
      el.style.removeProperty('--aim-c');
    });
  }

  // Couleur de la visée : celle du bouton armé (attaque bleue, Orbes violets,
  // mouvement beige…) — le rouge est réservé à l'impossible.
  const AIM_RED = '#d13b4e', AIM_BLUE = '#2f8fe0', AIM_BEIGE = '#e0c9a3';
  function btnColor(btn) {
    if (!btn) return null;
    const cs = getComputedStyle(btn);
    const bg = cs.backgroundColor || '';
    const transparent = !bg || bg === 'transparent' || /rgba\(0,\s*0,\s*0,\s*0\)/.test(bg);
    const c = transparent ? cs.borderColor : bg;
    return (c && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(c)) ? c : null;
  }
  function aimColor(root, kind, blocked) {
    if (blocked) return AIM_RED;
    if (kind === 'analyse') {
      const ana = root.querySelector('#cbdock .ana-chip');
      return btnColor(ana) || '#9070cf';
    }
    const armed = root.querySelector('#cbdock .ab-atk.selected, #cbdock .ab-orbes.selected, ' +
      '#cbdock .ab-tool.selected, #cbdock .ab-gardien-btn.selected, #cbdock .ab-talent.selected');
    return btnColor(armed) || (kind === 'move' ? AIM_BEIGE : AIM_BLUE);
  }

  function drawAim() {
    const root = $(rootSel);
    const svg = root ? root.querySelector('#combat-aim') : null;
    if (!svg) return;
    const hide = function () { svg.classList.remove('on'); clearAimTargets(root); };
    const h = aimHero();
    if (!h || !aimLast) { hide(); return; }
    const card = root.querySelector('.combat-card[data-iid="' + h.iid + '"]');
    if (!card) { hide(); return; }
    const el = document.elementFromPoint(aimLast.x, aimLast.y);
    if (!el || !root.contains(el) || el.closest('#cbdock')) { hide(); return; }
    const mon = el.closest('.combat-card.side-monster');
    const zoneEl = el.closest('.combat-zone');
    const zi = zoneEl ? parseInt(zoneEl.getAttribute('data-zone'), 10) : -1;

    // Nature de la visée : une action armée impose la sienne, sinon c'est ce que
    // survole le curseur qui décide. `blocked` = geste impossible (barrière,
    // action déjà dépensée, mouvement épuisé) : c'est le seul cas rouge.
    let kind = null, targetEl = null, blocked = false;
    const mode = aimMode();
    // Une attaque hors de portée (barrière infranchissable, tir bloqué,
    // mouvement déjà dépensé pour un contact) se vise en ROUGE.
    function attackReachOk(t) {
      const i = (pendingAttack && pendingAttack.iid === h.iid) ? pendingAttack.atkIndex : aimAttackIndex(h);
      const a = h.attacks && h.attacks[i];
      if (!a) return false;
      if (t.zone === h.zone) return true;
      if (a.range === 'distance') return !shootBlocked(h.zone, t.zone);
      if (a.eclipse || heroHasTalent(h, 'teleportation')) return true;
      if (moveBarrier(h.zone, t.zone).type === 'block') return false;
      if (a.freeMove || !h.used.move || h.prepBonus || h.freeMoves > 0 || h.freeMoveReady) return true;
      return false;
    }
    const anyCard = el.closest('.combat-card');
    // Survol d'un AUTRE aventurier hors action de soutien (Gardien, objet
    // bénéfique, Orbes Partagés, soin…) : la flèche s'efface pour ne pas
    // brouiller les pistes. Les cibles réellement valides restent visées.
    const supportMode = mode === 'garde' || mode === 'partage' || mode === 'objet' || mode === 'analyse';
    if (!supportMode) {
      const ally = el.closest('.combat-card.side-hero');
      if (ally && ally.getAttribute('data-iid') !== String(h.iid) && !ally.classList.contains('targetable')) { hide(); return; }
    }
    if (mode === 'garde' || mode === 'partage' || mode === 'objet' || mode === 'analyse') {
      // Ces actions se jouent sur une vignette : le plateau marque déjà les
      // cibles valides (targetable) — les autres sont refusées, donc en rouge.
      if (!anyCard || anyCard.getAttribute('data-iid') === String(h.iid)) { hide(); return; }
      kind = mode; targetEl = anyCard;
      blocked = !anyCard.classList.contains('targetable');
    }
    else if (pendingAttack) { kind = 'atk'; targetEl = mon || zoneEl; }
    else if (pendingMove) { kind = 'move'; targetEl = mon || zoneEl; }
    else if (mon && mon.getAttribute('data-iid') !== String(h.iid) && aimMod) {
      // Cmd / Ctrl : on vise l'ANALYSE plutôt que l'attaque.
      kind = 'analyse'; targetEl = mon;
      if (!canAnalyze(h)) blocked = true;
    }
    else if (mon && mon.getAttribute('data-iid') !== String(h.iid)) {
      kind = 'atk'; targetEl = mon;
      if (aimAttackIndex(h) < 0) blocked = true;
    } else if (zoneEl && zi !== h.zone && zoneSpotOk(zoneEl, aimLast)) {
      kind = 'move'; targetEl = zoneEl;
      if (!aimCanMove(h)) blocked = true;
    }
    if (!kind || !targetEl) { hide(); return; }
    // Zone séparée par un mur ou une barrière infranchissable.
    if (kind === 'move' && zi >= 0 && zi !== h.zone && aimMoveBlocked(h, zi)) blocked = true;
    // Cible d'attaque inatteignable : flèche rouge.
    if (kind === 'atk' && !blocked && mon) {
      const tgt = byId(mon.getAttribute('data-iid'));
      if (tgt && !attackReachOk(tgt)) blocked = true;
    }

    const color = aimColor(root, kind, blocked);
    clearAimTargets(root);
    targetEl.classList.add('aim-target', blocked ? 'aim-ko' : (kind === 'move' ? 'aim-move' : 'aim-atk'));
    targetEl.style.setProperty('--aim-c', color);

    // La pointe suit EXACTEMENT le curseur : la flèche colle au mouvement de la
    // souris au lieu de sauter d'une cible à l'autre.
    const r = card.getBoundingClientRect();
    const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
    const x2 = aimLast.x, y2 = aimLast.y;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 26) { hide(); return; }   // curseur sur le combattant lui-même
    // Courbe légère pour que la flèche « jaillisse » du combattant.
    const mx = (x1 + x2) / 2 - dy * 0.1, my = (y1 + y2) / 2 + dx * 0.1;
    // Pointe orientée selon la tangente d'arrivée ; le trait s'arrête à la BASE
    // de la pointe pour ne pas dépasser dessous.
    const ax = x2 - mx, ay = y2 - my, al = Math.sqrt(ax * ax + ay * ay) || 1;
    const ux = ax / al, uy = ay / al, HW = 9, HL = 20;
    const bx = x2 - ux * HL, by = y2 - uy * HL;
    const line = svg.querySelector('.aim-line'), head = svg.querySelector('.aim-head');
    line.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' Q ' + mx + ' ' + my + ' ' + bx + ' ' + by);
    line.setAttribute('stroke', color);
    head.setAttribute('points',
      x2 + ',' + y2 + ' ' + (bx - uy * HW) + ',' + (by + ux * HW) + ' ' + (bx + uy * HW) + ',' + (by - ux * HW));
    head.setAttribute('fill', color);

    // Pastille d'icône au milieu du trajet : type de ciblage ou interdiction.
    const ico = aimIcon(h, kind, blocked);
    const bg = svg.querySelector('.aim-ico-bg'), im = svg.querySelector('.aim-ico-img'), tx = svg.querySelector('.aim-ico-txt');
    const midX = 0.25 * x1 + 0.5 * mx + 0.25 * bx;
    const midY = 0.25 * y1 + 0.5 * my + 0.25 * by;
    bg.setAttribute('cx', midX); bg.setAttribute('cy', midY); bg.setAttribute('stroke', color);
    if (ico.img) {
      im.setAttribute('href', ico.img); im.setAttribute('x', midX - 16); im.setAttribute('y', midY - 16);
      im.style.display = ''; tx.style.display = 'none';
    } else {
      tx.textContent = ico.txt; tx.setAttribute('x', midX); tx.setAttribute('y', midY + 1);
      tx.style.display = ''; im.style.display = 'none';
    }
    svg.setAttribute('class', 'combat-aim on aim-' + (blocked ? 'ko' : (kind === 'move' ? 'move' : 'atk')));
  }

  // ---------- Pool de dés (bandeau flottant, à gauche) ----------
  // Dernier lancer affiché. `seq` incrémente à chaque nouveau jet : le pool ne
  // rejoue son animation que lorsque la séquence change (les re-rendus du
  // plateau, très fréquents, ne relancent donc pas les dés).
  let lastRoll = null;
  let rollSeq = 0;
  let rollActive = false;   // le résultat du jet occupe le pool (sinon : dés au repos)
  let poolSelWatch = null;  // dernier combattant sélectionné vu par le pool
  let poolAtkWatch = null;  // dernière attaque armée vue par le pool
  let rollTimers = [];

  const DIE_LABEL = { white: 'Simple', bone: 'Léger', red: 'Lourd', blue: 'Mystique', green: 'Soin', black: 'Mortel', yellow: 'Phase', pink: 'Faille' };

  // Enregistre un lancer pour le pool de dés. `meta` : { who, target, label, bonus }
  function showRoll(res, meta) {
    if (!res || !Array.isArray(res.dice) || !res.dice.length) return;
    rollSeq++;
    lastRoll = { seq: rollSeq, res: res, meta: meta || {} };
    rollActive = true;

  }

  function dieHtml(d, def) {
    // Les marques de résultat (6, 1, dé retiré, dé arrêté par la DEF) ne sont
    // PAS posées ici : elles apparaissent quand le dé se fige, sinon elles
    // vendraient la mèche pendant la seconde de rotation.
    const cls = ['dp-die', 'die-' + d.color];
    if (d.bonus) cls.push('is-bonus');
    const after = [];
    if (d.removed) after.push('is-removed');
    else if (d.passes === false) after.push('is-blocked');
    if (d.value === 6) after.push('is-six');
    if (d.value === 1) after.push('is-one');
    const title = (DIE_LABEL[d.color] || d.color) + (d.note ? ' — ' + d.note : '') +
      (d.passes === false && !d.removed ? ' — arrêté par la DEF' : '');
    // Dé arrêté par la Défense : le BLASON de DEF (celui des adversaires) se
    // pose dans son coin, au lieu d'une pastille de texte.
    const defMark = (d.passes === false && !d.removed && def > 0)
      ? '<span class="dp-def-mark" aria-label="Arrêté par la Défense ' + def + '">' + defShield(def) + '</span>' : '';
    return '<span class="' + cls.join(' ') + '" data-final="' + d.value + '" data-after="' + after.join(' ') +
      '" title="' + esc(title) + '">' +
      '<span class="dp-num">' + d.value + '</span>' + defMark + '</span>';
  }

  // Attaque dont les dés sont affichés au repos : celle qui est armée, sinon
  // l'arme par défaut du combattant sélectionné.
  function restAttackOf(c) {
    if (!c || !Array.isArray(c.attacks) || !c.attacks.length) return null;
    if (pendingAttack && pendingAttack.iid === c.iid && c.attacks[pendingAttack.atkIndex]) {
      return { a: c.attacks[pendingAttack.atkIndex], i: pendingAttack.atkIndex };
    }
    const i = aimAttackIndex(c);
    if (i >= 0) return { a: c.attacks[i], i: i };
    const j = c.attacks.findIndex(function (a) { return !a.special; });
    return j >= 0 ? { a: c.attacks[j], i: j } : { a: c.attacks[0], i: 0 };
  }

  // Cartouche du bonus de Dégâts, à droite des dés.
  function bonusHtml(n) {
    return '<span class="dp-bonus" title="Bonus de Dégâts">' +
      '<b>+' + n + '</b><small>dégâts</small></span>';
  }

  // Icône du type d'attaque affichée dans le titre du pool (contact, tir, sort).
  function atkIcoHtml(a) {
    if (!a) return '';
    const src = (isOrbAttack(a) || (a.special && a.range !== 'distance')) ? 'assets/Attack_spell_b.png'
      : a.range === 'distance' ? 'assets/Attack_range_b.png'
      : 'assets/Attack_melee_b.png';
    return '<img class="dp-title-ico" src="' + src + '" alt="">';
  }

  // Tous les dés tiennent sur UNE ligne : leur taille se calcule d'après leur
  // nombre et la largeur utile de la boîte.
  function traySize(n) {
    const W = 244, GAP = 5, MAX = 40, MIN = 18;
    if (!n || n < 1) return '';
    const size = Math.max(MIN, Math.min(MAX, Math.floor((W - (n - 1) * GAP) / n)));
    return ' style="--dp-size:' + size + 'px"';
  }

  // Ajustement fin après rendu : la taille des dés est recalculée d'après la
  // largeur réelle de la boîte (elle change selon la fenêtre).
  function sizeTray(box) {
    // Mesure après la mise en page : la largeur utile dépend de la fenêtre.
    requestAnimationFrame(function () {
      const tray = box.querySelector('.dp-tray');
      if (!tray) return;
      const n = tray.querySelectorAll('.dp-die').length + tray.querySelectorAll('.dp-bonus').length;
      if (!n) return;
      // Le cartouche « +X dégâts » est un peu plus large qu'un dé.
      const extra = tray.querySelector('.dp-bonus') ? 16 : 0;
      const W = tray.clientWidth || 236;
      const size = Math.max(16, Math.min(40, Math.floor((W - (n - 1) * 5 - extra - 2) / n)));
      tray.style.setProperty('--dp-size', size + 'px');
    });
  }

  // Dé au repos : la couleur est visible, la face reste inconnue.
  function restDieHtml(color) {
    return '<span class="dp-die dp-rest die-' + color + '" title="' + esc(DIE_LABEL[color] || color) + '">' +
      '<span class="dp-num">?</span></span>';
  }

  function renderDicePool() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-dicepool') : null;
    if (!box) return;
    const sel = selectedIid ? byId(selectedIid) : null;
    // Le résultat d'un lancer occupe le pool jusqu'à ce que le joueur sélectionne
    // un autre combattant ou arme une autre attaque : le pool revient alors aux
    // dés au repos de la prochaine attaque.
    const atkKey = pendingAttack ? (pendingAttack.iid + ':' + pendingAttack.atkIndex) : null;
    if (poolSelWatch !== selectedIid) { poolSelWatch = selectedIid; rollActive = false; }
    if (atkKey && poolAtkWatch !== atkKey) rollActive = false;
    poolAtkWatch = atkKey;
    const showRollNow = !!(lastRoll && rollActive);
    const rest = showRollNow ? null : restAttackOf(sel);
    // Signature du contenu : le pool n'est redessiné QUE s'il change réellement
    // (sinon l'animation du lancer serait interrompue par un re-rendu du plateau).
    const sig = showRollNow ? 'roll:' + lastRoll.seq
      : !sel ? 'none'
      : 'rest:' + sel.iid + ':' + (rest ? rest.i : -1) + ':' + (rest ? JSON.stringify(rest.a.dice || {}) : '') +
        ':' + (sel.damage || 0);
    if (box.getAttribute('data-sig') === sig && box.firstChild) return;
    box.setAttribute('data-sig', sig);

    if (!showRollNow) {
      if (!sel || !rest || !rest.a) {
        box.className = 'dicepool';
        box.innerHTML = '<div class="dp-empty"><span class="dp-empty-ico">🎲</span>' +
          '<span>Clique un combattant pour voir ses dés.</span></div>';
        return;
      }
      const known = sel.side !== 'monster' || sel.analyzed;
      const pool = rest.a.dice || {};
      let tray = '';
      let nDice = 0;
      D.DICE_ORDER.forEach(function (k) {
        for (let n = 0; n < (pool[k] || 0); n++) { tray += restDieHtml(k); nDice++; }
      });
      const dmg = (rest.a.useOwnDamage !== false && sel.damage > 0 && !(sel.states && sel.states.affaibli)) ? sel.damage : 0;
      if (dmg > 0) { tray += bonusHtml(dmg); nDice++; }
      if (!tray) tray = '<span class="dp-nodice">Aucun dé</span>';
      box.className = 'dicepool rest';
      box.innerHTML =
        '<div class="dp-title">' + atkIcoHtml(rest.a) + '<span>Attaque</span></div>' +
        '<div class="dp-tray"' + traySize(nDice) + '>' + (known ? tray : '<span class="dp-nodice">Analysez cet adversaire pour voir ses dés.</span>') + '</div>' +
        '<div class="dp-foot">' + esc(known ? attackLabel(rest.a) : 'Attaque inconnue') + '</div>';
      sizeTray(box);
      return;
    }

    const res = lastRoll.res, m = lastRoll.meta;
    // Le cadre du pool NE CHANGE PAS après une attaque : le titre reste
    // « Attaque » (avec l'icône du type d'arme) et l'arme employée reste en
    // pied. Seules les faces des dés changent. Le détail du jet (dégâts, DEF,
    // critique) se lit dans le journal et sur la cible.
    let head = '<div class="dp-title">' + (m.ico ? atkIcoHtml(m.ico) : '') +
      '<span>Attaque</span></div>';

    let tray = '<div class="dp-tray"' + traySize(res.dice.length + (res.damageBonus > 0 ? 1 : 0)) + '>' + res.dice.map(function (d) { return dieHtml(d, res.def); }).join('');
    if (res.damageBonus > 0) tray += bonusHtml(res.damageBonus);
    tray += '</div>';

    const out = '<div class="dp-foot">' + esc(m.label || 'Attaque') + '</div>';

    box.className = 'dicepool active';
    box.innerHTML = head + tray + out;
    sizeTray(box);
    if (box.getAttribute('data-anim') !== String(lastRoll.seq)) {
      box.setAttribute('data-anim', String(lastRoll.seq));
      animatePool(box);
      // (v2.5.46) Plus de dés projetés au centre de l'écran : le jet se lit
      // directement dans le pool du bandeau, seul endroit où le regard va.
      
    }
  }

  function animatePool(box) {
    // Le roulement des dés a été retiré : les faces s'affichent directement,
    // avec une simple pose (léger rebond) pour marquer le nouveau jet.
    rollTimers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    rollTimers = [];
    box.querySelectorAll('.dp-die').forEach(function (el) {
      const num = el.querySelector('.dp-num');
      if (num) num.textContent = el.getAttribute('data-final');
      (el.getAttribute('data-after') || '').split(' ').forEach(function (k) { if (k) el.classList.add(k); });
      el.classList.remove('is-rolling');
      el.classList.add('is-settled');
      rollTimers.push(setTimeout(function () { el.classList.remove('is-settled'); }, 300));
    });
  }

  // Rangée d'états, en petites fenêtres posées AU-DESSUS du bandeau. Chaque
  // pastille décrit son effet au survol.
  function renderDockStates(c) {
    const root = $(rootSel);
    const dock = root ? root.querySelector('#cbdock') : null;
    if (!dock) return;
    // La rangée est placée dans le BANDEAU lui-même : sur un écran large, le
    // bandeau est centré et l'ancien parent (pleine largeur) faisait démarrer
    // les onglets tout à gauche de l'écran.
    const inner = dock.querySelector('.cbdock-inner') || dock;
    let bar = dock.querySelector('#cbdock-states');
    if (!bar || bar.parentNode !== inner) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.id = 'cbdock-states'; bar.className = 'cbdock-states';
      inner.insertBefore(bar, inner.firstChild);
    }
    const keys = c ? Object.keys(STATE_META).filter(function (s) {
      if (isStackState(s)) return stateVal(c, s) > 0;
      if (s === 'prepare') return c.states.prepare || c.prepBonus;
      return c.states[s];
    }) : [];
    if (!keys.length) { bar.innerHTML = ''; bar.classList.remove('on'); return; }
    bar.classList.add('on');
    bar.innerHTML = keys.map(function (s) {
      return '<span class="dock-state st-' + s + ' ' + (STATE_META[s].neg ? 'neg' : 'pos') + '" data-state="' + s + '">' +
        '<span class="dock-state-ico">' + stateIcon(s) + '</span>' +
        '<span class="dock-state-lbl">' + stateBadgeLabel(c, s) + '</span>' +
        '<span class="dock-state-pop"><b>' + esc(stateLabel(s)) +
          (isStackState(s) ? ' ' + stateVal(c, s) : '') + '</b>' + esc(stateDesc(s)) + '</span>' +
      '</span>';
    }).join('');
  }

  // Emplacements de talents affichés dans le bandeau (2 lignes de 4).
  const TALENT_SLOTS = 8;

  // Les dés du jet apparaissent en GRAND au centre de l'écran, puis glissent en
  // rétrécissant jusqu'à leur place dans le pool du bandeau.
  function flyDice(box) {
    if (reduceMotion && reduceMotion()) return;
    const tray = box.querySelector('.dp-tray');
    if (!tray || !tray.querySelector('.dp-die')) return;
    document.querySelectorAll('.dice-fly').forEach(function (f) { f.remove(); });
    const fly = document.createElement('div');
    fly.className = 'dice-fly';
    fly.innerHTML = '<div class="dice-fly-inner">' + tray.innerHTML + '</div>';
    document.body.appendChild(fly);
    const inner = fly.firstChild;
    requestAnimationFrame(function () {
      const fr = inner.getBoundingClientRect();
      const r = tray.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - (fr.left + fr.width / 2);
      const dy = (r.top + r.height / 2) - (fr.top + fr.height / 2);
      const sc = Math.max(.2, Math.min(1, r.width / Math.max(1, fr.width)));
      setTimeout(function () {
        inner.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(' + sc.toFixed(2) + ')';
        inner.style.opacity = '0';
        setTimeout(function () { fly.remove(); }, 460);
      }, 650);
    });
  }

  function renderActionBar() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-actionbar') : null;
    if (!box) return;
    const cmb = combat();
    let sel = selectedIid ? byId(selectedIid) : null;
    // RÉACTION en cours : on force la fiche de l'aventurier qui doit réagir.
    if (pendingReaction) { const rh = byId(pendingReaction); if (rh) { sel = rh; selectedIid = rh.iid; } }
    // Auto-sélection : en phase héros ou Pré-Tour, défaut = 1er aventurier actif.
    // En Pré-Tour, on privilégie un aventurier ayant encore un talent à jouer.
    // La sélection automatique ne remplace un combattant que si AUCUN n'est
    // choisi, ou si le joueur n'a pas fait ce choix lui-même : cliquer la
    // vignette d'un aventurier dans le coma doit bien afficher SA fiche.
    if (!autoSelectOff && (!sel || (!manualSelect && sel.status !== 'active')) &&
        (cmb.phase === 'heroes' || cmb.phase === 'pretour') && !cmb.outcome) {
      const fh = (cmb.phase === 'pretour' && activeOf('hero').find(function (h) { return h.freeMoveReady || canDesignateGardien(h); })) || activeOf('hero')[0];
      if (fh) { sel = fh; selectedIid = fh.iid; }
    }
    if (!sel) {
      box.className = 'combat-actionbar';
      box.innerHTML = '<div class="ab-empty">Clique un combattant pour afficher sa fiche et ses actions.</div>';
      const empty = root.querySelector('#cbdock-id');
      if (empty) empty.innerHTML = '';
      renderDockStates(null);
      return;
    }
    const c = sel;
    const dead = c.status !== 'active';
    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;
    const pct = Math.round((c.pv / c.maxPv) * 100);
    const canAct = !dead && !cmb.outcome && c.side === 'hero' && cmb.phase === 'heroes';
    // Pendant le Pré-Tour, seul le mouvement gratuit (freeMoveReady) est autorisé.
    const canPretour = !dead && !cmb.outcome && c.side === 'hero' && cmb.phase === 'pretour';
    const cls = ['ab-card', 'side-' + c.side];
    if (c.klass) cls.push('klass-' + slug(c.klass));
    if (isEnemy && c.type) cls.push('type-' + c.type);
    // MYSTIQUE : bouton spécial ORBES (occupe les 2 lignes, à gauche de la grille).
    // Nom en BLEU ACTION tant que l'action / l'attaque n'a pas été consommée.
    if (!isEnemy && !dead && (!c.used.action || c.prepBonus)) cls.push('has-action');
    const orbIdx = (!isEnemy && Array.isArray(c.attacks)) ? c.attacks.findIndex(isOrbAttack) : -1;
    if (orbIdx >= 0) cls.push('has-orbes');
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');

    // Sépare attaques d'arme (boutons « Attaque » du haut) et spéciales (talents)
    const weaponAtks = [], specialAtks = [];
    (c.attacks || []).forEach(function (a, i) {
      (a.special ? specialAtks : weaponAtks).push({ a: a, i: i });
    });

    // Case d'identité (à gauche du bandeau) : nom, PV + DEF, classe.
    let idHtml = '<div class="' + cls.join(' ') + ' ab-card-id">' +
      '<div class="ab-id">' +
        '<div class="ab-name"><span class="roster-name">' + esc(c.name) + '</span></div>' +
        '<div class="ab-pvline cc-pvline">' +
          '<div class="pv-bar' + (hasBlindage(c) ? ' has-blindage' : '') + '"><div class="pv-fill" style="width:' + pct + '%"></div>' +
            (hasBlindage(c) ? '<div class="pv-blindage-fill" title="Blindage actif"></div>' : '') +
            '<span class="pv-text">' + (hasBlindage(c) && known && pvText
                ? '<span class="pv-alt"><span class="pv-alt-a">' + pvText + '</span><span class="pv-alt-b">BLINDAGE</span></span>'
                : (hasBlindage(c) && known ? 'BLINDAGE' : pvText)) + '</span></div>' +
          (known ? '<span class="def-badge">' + defShield((c.states.auSol || c.states.brise) ? 0 : c.def) + '</span>' : '') +
          (known && c.blindageCharges > 0 ? '<span class="blindage-badge" title="Blindage">🛡✦ ' + c.blindageCharges + '</span>' : '') +
        '</div>' +
        // Classe de l'aventurier / type de l'adversaire : SOUS la barre de PV.
        '<div class="ab-subline">' +
          (!isEnemy ? '<span class="ab-level" title="Niveau de l\'aventurier">Niv. <b>' +
            (c.level || 1) + '</b></span>' : '') +
          (c.klass ? '<span class="tag class-tag klass-' + slug(c.klass) + '">' + esc(c.klass) + '</span>' : '') +
          (isEnemy && c.type ? '<span class="tag type ztype-' + c.type + '">' + (Combatants.TYPE_LABEL[c.type] || c.type) + '</span>' : '') +
          (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
    const idBox = root.querySelector('#cbdock-id');
    if (idBox) idBox.innerHTML = idHtml;

    // Case des actions : Orbes, outils et talents.
    let html = '<div class="' + cls.join(' ') + ' ab-card-acts">';
    // Bouton spécial ORBES (Mystique) avant la grille d'actions.
    if (orbIdx >= 0) html += orbesButtonHtml(c, orbIdx, canAct);

    // Grille d'actions : 2 lignes, remplissage colonne par colonne (cf. croquis).
    //   Col. action : Attaque (haut) + Mouv/Objet/Analyse (bas)
    //   Col. 2 : Talent 1 / Talent 2 — Col. 3 : Talent 3 / Talent 4 — Col. 4 : Talent 5 / Talent 6
    // Attaque d'arme : le bouton ne sert plus que lorsqu'il y a un CHOIX à faire
    // (plusieurs armes). Avec une seule arme, viser un adversaire à la souris
    // l'arme automatiquement — le bouton disparaît.
    const showAtkCell = c.side !== 'hero' || weaponAtks.length > 1;
    html += '<div class="ab-acts' + (showAtkCell ? '' : ' ab-acts-notk') + '">';
    if (showAtkCell) {
      html += '<div class="ab-attack-cell">' +
        (weaponAtks.length
          ? weaponAtks.map(function (w) { return abAttackBtn(c, w.a, w.i, canAct); }).join('')
          : '<div class="ab-noatk">—</div>') +
        '</div>';
    }
    // Cellule outils : Se relever / Se libérer, objet, analyse (aventuriers)
    html += (c.side === 'hero') ? abToolsHtml(c, canAct, canPretour) : '<div class="ab-tools ab-tools-empty"></div>';
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
    for (let i = 0; i < TALENT_SLOTS; i++) {
      if (!isEnemy && i < heroSlots.length) {
        html += heroSlots[i];
      } else if (isEnemy && i < labels.length) {
        if (c.analyzed) {
          html += '<button class="ab-talent ab-talent-named" type="button" disabled title="' + esc(labels[i]) + '"><span class="ab-tal-txt">' + esc(labels[i]) + '</span></button>';
        } else {
          html += '<button class="ab-talent ab-talent-unknown" type="button" disabled title="Analysez cet adversaire pour révéler ses talents"><span class="ab-tal-txt">Talent Inconnu</span></button>';
        }
      } else {
        html += '<button class="ab-talent ab-talent-empty" type="button" disabled title="Emplacement de talent vide"><span class="ab-tal-txt">Talent ' + (i + 1) + '</span></button>';
      }
    }
    html += '</div>';

    html += '</div>';
    box.className = 'combat-actionbar active';
    box.innerHTML = html;
    renderDockStates(c);
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
      const monsters = combat().combatants.filter(function (c) {
        // INVISIBLE : l'adversaire n'apparaît pas sur le terrain (on ne peut
        // l'atteindre qu'en visant sa zone).
        return c.zone === zi && c.side === 'monster' && c.status === 'active' && !hiddenFromPlayer(c);
      }).sort(function (a, b) { return mrank(a.type) - mrank(b.type); });
      // Aventuriers côte à côte (grille), pour gagner de la place
      let html = heroes.length ? '<div class="hero-grid">' + heroes.map(safeCard).join('') + '</div>' : '';
      // TOUTES les vignettes font la même largeur (grille demi-largeur commune) ;
      // les grands socles (Grand / Énorme) se distinguent par leur HAUTEUR
      // (classes socle-*), plus par une pleine largeur.
      if (monsters.length) html += '<div class="monster-grid">' + monsters.map(safeCard).join('') + '</div>';
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
      if (isStackState(s)) return stateVal(c, s) > 0;
      // PRÉPARÉ : badge visible tant que l'état est en attente OU armé pour le tour.
      if (s === 'prepare') return c.states.prepare || c.prepBonus;
      return c.states[s];
    }).map(function (s) {
      const lbl = stateBadgeLabel(c, s);
      return '<span class="state-badge ' + (STATE_META[s].neg ? 'neg' : 'pos') + '" data-state="' + s + '" data-iid="' + c.iid + '">' +
        lbl + '</span>';
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
  // RIPOSTE 2 : Riposte utilisable 2 fois par tour adverse (sinon 1).
  function riposteMax(c) { return heroHasTalent(c, 'riposte2') ? 2 : 1; }
  function riposteRemaining(c) { return riposteMax(c) - ((c.reactUsed && c.reactUsed.contre_attaque_count) || 0); }
  function reactionReady(c, t) {
    if (t.effect === 'contre_attaque') return riposteRemaining(c) > 0 && !!c.tookDamage && !!byId(c.lastAttacker);
    if (c.reactUsed && c.reactUsed[t.effect]) return false;
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
    const blink = ready && pendingReaction === c.iid ? ' ab-react-blink' : '';
    return '<button class="ab-atk ab-atk-react' + (ready ? '' : ' ab-react-off') + blink + '" type="button"' +
      ' data-iid="' + c.iid + '" data-react="' + esc(t.effect) + '"' + (ready ? '' : ' disabled') +
      ' title="' + esc(t.name + ' — ' + (descForTalentId(c, t.id) || REACT_HINT[t.effect] || '')) + '">' +
      '<span class="ab-atk-talname">' + esc(t.name) + '</span>' +
    '</button>';
  }
  function firstWeaponIdx(c) {
    for (let i = 0; i < c.attacks.length; i++) { if (!c.attacks[i].special) return i; }
    return c.attacks.length ? 0 : -1;
  }
  function execHeroReaction(c, effect) {
    if (!c || c.status !== 'active') return;
    if (effect !== 'contre_attaque' && c.reactUsed && c.reactUsed[effect]) return;
    if (effect === 'contre_attaque') {
      if (riposteRemaining(c) <= 0) return;
      const tgt = byId(c.lastAttacker);
      const wi = firstWeaponIdx(c);
      if (tgt && tgt.status === 'active' && wi >= 0) {
        log(cname(c) + ' <span class="lreact">riposte</span> !', 'state');
        resolveAttack(c, tgt, c.attacks[wi]);
      }
      // Compteur de Riposte (1 ou 2 par tour adverse) ; on attend un nouveau coup.
      c.reactUsed.contre_attaque_count = ((c.reactUsed.contre_attaque_count) || 0) + 1;
      c.tookDamage = false;
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
    // Si cette réaction interrompait le tour des adversaires, on le reprend
    // (la séquence reprise détectera elle-même une éventuelle fin de combat).
    if (pendingReaction === c.iid) resumeMonsterTurn();
  }

  function abAttackBtn(c, a, i, canAct) {
    const usedA = actionSpent(c);
    // Règle « pas 2× la même Action » : bloque une action non-basique déjà jouée.
    const sameBlocked = !a.isBase && !a.freeAction && Array.isArray(c.actedAtks) && c.actedAtks.indexOf(i) >= 0;
    const uses = (c.attackUses && c.attackUses[i] !== undefined) ? c.attackUses[i] : null;
    const depleted = uses === 0;
    // PRÉPARATION ARCANIQUE : un Orbe est lançable dès le Pré-Tour 1.
    const orbPretour = isOrbAttack(a) && combat().phase === 'pretour' && combat().turn === 1 &&
      heroHasTalent(c, 'orbe_pretour') && c.status === 'active' && !combat().outcome;
    // AU SOL : aucune attaque ni talent possible tant que le combattant n'est pas relevé
    const blocked = (!canAct && !orbPretour) || depleted || (!a.freeAction && usedA) || sameBlocked || (c.states && c.states.auSol);
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
    // Les dés ne sont plus affichés ici : le pool du bandeau montre en permanence
    // les dés de l'attaque sélectionnée.
    const figsHtml = a.special ? '' :
      '<span class="ab-atk-figs">' +
        (showDmg ? '<span class="atk-dmg">+' + c.damage + '</span>' : '') +
        (revealed && uses !== null ? '<span class="atk-uses">' + uses + '×</span>' : '') +
      '</span>';
    // Infobulle : nom + portée, et pour un talent le descriptif complet (survol).
    const talDesc = a.talentId ? descForTalentId(c, a.talentId) : '';
    const atkTitle = a.name + ' (' + info.join(', ') + ')' + (talDesc ? ' — ' + talDesc : '');
    return '<button class="ab-atk atk-chip' + (a.special ? ' ab-atk-special' : '') + (isThisAtk ? ' selected' : '') +
        '" type="button" data-iid="' + c.iid + '" data-atk="' + i + '"' + (blocked ? ' disabled' : '') +
        ' title="' + esc(atkTitle) + '">' +
      nameHtml +
      figsHtml +
    '</button>';
  }

  // Rangée Mouv. / Objet / Analyse : 3 boutons de largeur égale qui occupent,
  // à eux trois, la même largeur que le bouton d'attaque au-dessus.
  function abToolsHtml(c, canAct, canPretour) {
    const usedO = c.used.object;
    const usedMv = c.used.move;
    const multi = zoneCount() > 1;
    const isAuSol = !!(c.states && c.states.auSol);
    // Un mouvement gratuit est disponible si Pas Léger (freeMoveReady) ou Rebond (freeMoves > 0).
    const hasFreeMove = c.freeMoveReady || c.freeMoves > 0;
    // Pendant le Pré-Tour, seul le mouvement gratuit est disponible.
    const canMove = canAct || (canPretour && hasFreeMove && !usedMv);
    // GELÉ N : plus aucun déplacement — le bouton devient « Se libérer », un test
    // de Force N qui consomme le mouvement (chaque réussite retire un cran).
    const geleN = stateVal(c, 'gele');
    // AU SOL : le bouton mouvement est remplacé par « Se relever » (consomme le mouvement)
    const moveBtn = geleN > 0
      ? '<button class="ab-tool standup-chip do-unfreeze" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedMv) ? ' disabled' : '') +
          ' title="Gelé ' + geleN + ' : utilise votre mouvement pour tenter un test de Force ' + geleN +
            '. Chaque réussite retire un cran de Gelé.">❄️ Se libérer (F' + geleN + ')</button>'
      : isAuSol
      ? '<button class="ab-tool standup-chip do-standup" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedMv) ? ' disabled' : '') + ' title="Utilise votre mouvement pour vous relever (retire AU SOL)">Se relever</button>'
      : '<button class="ab-tool move-chip do-move' + (pendingMove === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canMove || !multi || (usedMv && !hasFreeMove && !c.prepBonus)) ? ' disabled' : '') +
          ' title="' + (hasFreeMove ? 'Mouvement gratuit disponible' : (c.prepBonus && usedMv ? 'Mouvement bonus (Préparé)' : 'Changer de zone')) + '">Mouv.</button>';
    // Le bouton Mouvement a disparu : viser une autre zone à la souris suffit.
    // Ne restent que « Se relever » / « Se libérer » (qui ne se visent pas) et
    // deux boutons carrés : objet et analyse.
    const standup = (geleN > 0 || isAuSol) ? moveBtn : '';
    return '<div class="ab-tools' + (standup ? '' : ' ab-tools-icons') + '">' +
      standup +
      '<button class="ab-tool ab-tool-ico obj-chip do-object' + (pendingObject === c.iid ? ' selected' : '') + '" type="button" data-iid="' + c.iid + '"' +
          ((!canAct || usedO || isAuSol || !c.objectItem) ? ' disabled' : '') +
          ' data-label="Objet" title="' + (c.objectItem ? 'Consommer : ' + esc(c.objectItem.name) : 'Aucun objet équipé') + '">🧪<span class="ab-tool-txt">Objet</span></button>' +
      '<button class="ab-tool ab-tool-ico ana-chip do-analyse' + (pendingAnalyze === c.iid ? ' selected' : '') + '" type="button"' +
          ' data-iid="' + c.iid + '"' + ((!canAct || usedMv || isAuSol) ? ' disabled' : '') +
          ' data-label="Analyse" title="Révèle DEF, Dégâts et XP de l\'adversaire ciblé">🔍<span class="ab-tool-txt">Analyse</span></button>' +
    '</div>';
  }

  function renderCard(c) {
    // Garde-fous : un combattant persisté incomplet ne doit jamais faire planter
    // le rendu (sinon tout le plateau disparaît). On comble les sous-objets requis.
    if (!c.states) c.states = { affaibli: false, auSol: false, feu: 0, gele: 0, blindage: false, onde: false, ciblage: false, brise: false, faille: false, poison: 0, invisible: false };
    if (c.states.brise === undefined) c.states.brise = false;
    if (c.states.faille === undefined) c.states.faille = false;
    if (c.states.poison === undefined) c.states.poison = 0;
    // Rétro-compat : Feu était un booléen avant de devenir cumulable.
    if (c.states.feu === true) c.states.feu = 1; else if (!c.states.feu) c.states.feu = 0;
    if (c.states.gele === true) c.states.gele = 1; else if (!c.states.gele) c.states.gele = 0;
    if (!c.used) c.used = { action: false, move: false, object: false };
    if (!Array.isArray(c.attacks)) c.attacks = [];
    if (!Array.isArray(c.attackUses) || c.attackUses.length !== c.attacks.length) {
      c.attackUses = c.attacks.map(function (a) { return (a && a.uses && a.uses > 0) ? a.uses : null; });
    }
    const pct = Math.round((c.pv / c.maxPv) * 100);
    const dead = c.status !== 'active';
    const cls = ['combat-card', 'side-' + c.side];
    if (isInvisible(c)) cls.push('is-invisible');
    if (c.klass) cls.push('klass-' + c.klass.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (c.side === 'monster' && c.type) cls.push('type-' + c.type);
    if (c.side === 'monster' && (c.socle === 'large' || c.socle === 'huge')) cls.push('socle-' + c.socle);
    if (dead) cls.push('is-' + c.status);
    if (selectedIid === c.iid) cls.push('selected');
    if (c.side === 'hero' && !dead && (!c.used.action || c.prepBonus)) cls.push('has-action');
    if (c.side === 'hero' && !dead && !actionSpent(c)) cls.push('act-ready');
    // Brûlure : halo de feu persistant tant que le combattant est en FEU.
    if (VFX.brulure && !dead && stateVal(c, 'feu') > 0) cls.push('on-fire');
    // GELÉ : liseré de glace sur la carte du combattant immobilisé.
    if (!dead && stateVal(c, 'gele') > 0) cls.push('frozen');
    // PRÉ-TOUR : surligne en jaune les aventuriers ayant encore un talent de pré-tour à jouer.
    if (combat().phase === 'pretour' && c.side === 'hero' && !dead && c.freeMoveReady) cls.push('pretour-ready');
    // Cible valide pendant le ciblage au clic (attaque ou analyse)
    if (pendingAttack && !dead) {
      const attacker = byId(pendingAttack.iid);
      if (attacker && attacker.side !== c.side) {
        const patk = attacker.attacks[pendingAttack.atkIndex];
        // BARRIÈRES : une cible derrière un mur/infranchissable n'est pas sélectionnable.
        // ÉCLIPSE : la téléportation permet de viser n'importe quelle zone.
        const reachOk = (patk && patk.eclipse) ? true
          : (patk && patk.range === 'contact')
          ? (c.zone === attacker.zone || moveBarrier(attacker.zone, c.zone).type !== 'block')
          : !shootBlocked(attacker.zone, c.zone);
        if (pendingAttack.multi) {
          // Cibles multiples d'une même zone : après la 1re cible, on verrouille la zone.
          const okZone = (pendingAttack.zone == null) || c.zone === pendingAttack.zone;
          const notPicked = (pendingAttack.picked || []).indexOf(c.iid) === -1;
          if (okZone && notPicked && reachOk) cls.push('targetable');
          if ((pendingAttack.picked || []).indexOf(c.iid) !== -1) cls.push('multi-picked');
        } else if (reachOk) cls.push('targetable');
      }
    }
    if (pendingAnalyze && !dead && c.side === 'monster' && !c.analyzed) cls.push('targetable');
    // OBJET : cible valide selon que l'objet est bénéfique (aventuriers) ou négatif (adversaires).
    if (pendingObject && !dead) {
      const ouser = byId(pendingObject);
      if (ouser && ouser.objectItem) {
        const wantSide = ouser.objectItem.objBenefic ? 'hero' : 'monster';
        if (c.side === wantSide) cls.push('targetable', 'tgt-choisir');
      }
    }
    // ORBES PARTAGÉS : alliés ciblables (non encore dotés du bonus).
    if (pendingOrbeShare && !dead && c.side === 'hero' && c.iid !== pendingOrbeShare && !(c.orbBuff > 0)) {
      cls.push('targetable', 'tgt-choisir');
    }
    // GARDIEN : alliés désignables (pas soi-même, pas déjà Gardé).
    if (pendingDesignate && !dead && c.side === 'hero' && c.iid !== pendingDesignate && !(c.states && c.states.garde)) {
      cls.push('targetable', 'tgt-choisir');
    }
    // CHOIX AU CLIC (Cri de Rage, Allié Critique, Coopération…) : cibles valides.
    if (activeChoice && !dead && activeChoice.isValidTarget(c)) {
      cls.push('targetable', 'tgt-choisir');
    }
    // PROIE : l'aventurier désigné ce tour.
    const isMarked = !dead && c.side === 'hero' && combat().markedHeroIid === c.iid;
    if (isMarked) cls.push('is-marked');

    const isEnemy = c.side === 'monster';
    const known = !isEnemy || c.analyzed;   // stats ennemies cachées avant Analyse
    const pvText = (isEnemy && !known) ? '' : (c.pv + ' / ' + c.maxPv + ' PV');
    // Carte de zone = « bouton » épuré : nom + barre de PV (+ états / statut).
    // La classe, la DEF, le blindage, « Rapide », les pastilles et les attaques
    // ne s'affichent plus ici : tout cela figure dans le bandeau d'action
    // lorsque le combattant est sélectionné.
    // Pastille bleue (coin haut-droit) : aventurier actif n'ayant pas encore
    // utilisé son Action / Attaque ce tour. Disparaît une fois l'action faite.
    // Pastilles du coin haut-droit :
    //   • un point BLEU par action encore disponible (deux si le combattant est
    //     PRÉPARÉ et dispose donc d'une action de plus) ;
    //   • un point AMBRE si le mouvement du tour n'a pas encore été utilisé.
    let dots = '';
    if (!isEnemy && !dead) {
      const actionsLeft = (actionSpent(c) ? 0 : 1) + (c.prepBonus ? 1 : 0);
      const hasFreeMove = c.freeMoveReady || c.freeMoves > 0;
      const moveLeft = (!c.used.move || hasFreeMove) && !(c.states && c.states.auSol) && stateVal(c, 'gele') === 0;
      for (let d = 0; d < actionsLeft; d++) {
        dots += '<span class="action-dot" title="' +
          (actionsLeft > 1 ? 'Deux actions disponibles (Préparé)' : 'Action / Attaque non utilisée') + '"></span>';
      }
      if (moveLeft) dots += '<span class="action-dot move-dot" title="Mouvement non utilisé"></span>';
    }
    const actionDot = dots ? '<span class="cc-dots">' + dots + '</span>' : '';
    // Adversaire déjà analysé : petite loupe à côté de son nom.
    const analyzedMark = (isEnemy && c.analyzed)
      ? '<span class="cc-analyzed" title="Adversaire déjà analysé — DEF, Dégâts et XP révélés">🔍</span>' : '';
    // Pas d'avatar dans les vignettes de zone : toute la largeur va au nom / PV.
    let html = '<div class="' + cls.join(' ') + '" data-iid="' + c.iid + '">' +
      actionDot +
      '<div class="cc-top-row">' +
        '<div class="cc-body">' +
          '<div class="cc-head"><span class="roster-name">' + esc(c.name) + '</span>' + analyzedMark +
            (isMarked ? '<span class="tag tag-marked" title="Proie : les adversaires ajoutent des dés contre ' + esc(gObj(c)) + ' ce tour">🎯 Proie</span>' : '') +
            (dead ? '<span class="tag dead">' + (c.status === 'coma' ? 'Coma' : 'A fui') + '</span>' : '') +
          '</div>' +
          '<div class="cc-pvline">' +
            '<div class="pv-bar' + (hasBlindage(c) ? ' has-blindage' : '') + '"><div class="pv-fill" style="width:' + pct + '%"></div>' +
              (hasBlindage(c) ? '<div class="pv-blindage-fill" title="Blindage actif"></div>' : '') +
              '<span class="pv-text">' + (hasBlindage(c) && known && pvText
                ? '<span class="pv-alt"><span class="pv-alt-a">' + pvText + '</span><span class="pv-alt-b">BLINDAGE</span></span>'
                : (hasBlindage(c) && known ? 'BLINDAGE' : pvText)) + '</span></div>' +
            (known ? '<span class="cc-def-icon">' + defShield(c.states.auSol ? 0 : c.def) + '</span>' : '') +
          '</div>' +
          // Zone d'états TOUJOURS présente (hauteur réservée pour une ligne) : recevoir
          // un état n'agrandit plus la vignette ; elle ne grandit que si les états
          // débordent sur une 2ᵉ ligne.
          '<div class="cc-states">' + statesBadges(c) + '</div>' +
        '</div>' +
      '</div>';

    html += '</div>';
    return html;
  }

  // Cœur d'exécution d'une attaque (sans rendu) — réutilisé par l'UI et l'auto-combat
  // Une zone est-elle visable par l'attaque en attente ?
  // Contact : sa propre zone, ou une zone joignable (barrière non bloquante).
  // Distance : toute zone dont la ligne de tir est dégagée.
  function zoneAttackReach(attacker, zi) {
    if (!pendingAttack || !attacker || attacker.status !== 'active') return false;
    const atk = attacker.attacks[pendingAttack.atkIndex];
    if (!atk) return false;
    if (zi === attacker.zone) return true;
    if (atk.range === 'distance') return !shootBlocked(attacker.zone, zi);
    if (heroHasTalent(attacker, 'teleportation')) return true;
    return moveBarrier(attacker.zone, zi).type !== 'block';
  }

  // Attaque visant une ZONE (et non une vignette) : frappe le premier adversaire
  // visible de la zone ; si la zone ne contient que des cibles INVISIBLES, un test
  // de Perception 2 permet de la débusquer et de la frapper.
  function attackZone(zi) {
    const attacker = byId(pendingAttack.iid);
    if (!attacker || attacker.status !== 'active') { pendingAttack = null; render(); return; }
    // ATTAQUE DE ZONE à distance : la zone cliquée reçoit le souffle.
    if (pendingAttack.blastZone) { execZoneBlast(attacker, pendingAttack.atkIndex, zi); return; }
    const foeSide = attacker.side === 'hero' ? 'monster' : 'hero';
    const inZone = combat().combatants.filter(function (m) {
      return m.side === foeSide && m.status === 'active' && m.zone === zi;
    });
    const visible = inZone.filter(function (m) { return !isInvisible(m); });
    if (visible.length) {
      // Cible évidente : on résout l'attaque normalement (mouvement inclus si contact).
      resolveAttackOn(visible[0]);
      return;
    }
    const hidden = inZone.filter(isInvisible);
    if (!hidden.length) {
      // Attaque au CONTACT : l'aventurier s'engage tout de même dans la zone
      // visée — le déplacement a lieu même s'il n'y a personne à y frapper.
      const atkVoid = attacker.attacks[pendingAttack.atkIndex];
      if (atkVoid && atkVoid.range === 'contact' && attacker.zone !== zi &&
          moveBarrier(attacker.zone, zi).type !== 'block') {
        doMove(attacker, zi);
      }
      log(cname(attacker) + ' frappe dans le vide : aucune cible dans <span class="lstate">' + esc(zname(zi)) + '</span>.', 'state');
      toast('💨 Attaque dans le vide !', 'miss');
      // Frapper une zone vide COÛTE l'attaque / l'action (comme une fouille ratée).
      if (atkVoid && !atkVoid.freeAction && attacker.status === 'active') useAction(attacker);
      pendingAttack = null; checkOutcome(); Store.save(); render(); return;
    }
    const t = perceptionTest(attacker, 2);
    if (!t.passed) {
      // L'attaque est perdue : l'action est consommée sans toucher. Une attaque
      // au CONTACT engage tout de même le déplacement — on va bien au corps à
      // corps dans la zone visée, même sans y trouver la cible invisible.
      const atkLost = attacker.attacks[pendingAttack.atkIndex];
      if (atkLost && atkLost.range === 'contact' && attacker.zone !== zi &&
          moveBarrier(attacker.zone, zi).type !== 'block') {
        doMove(attacker, zi);
      }
      log(cname(attacker) + ' fouille <span class="lstate">' + esc(zname(zi)) + '</span> à l\'aveugle ' +
        '(Perception ' + t.succ + '/' + t.need + ') — <span class="lfail">échec</span> : il ne trouve personne.', 'state');
      toast('🔍 Adversaire Introuvable', 'miss');
      if (atkLost && !atkLost.freeAction && attacker.status === 'active') useAction(attacker);
      pendingAttack = null; checkOutcome(); Store.save(); render(); return;
    }
    const found = hidden[0];
    toast('👁 Démasqué !', 'invis');
    log('<b class="lopp">Démasqué !</b> ' + cname(attacker) + ' repère une cible invisible dans <span class="lstate">' +
      esc(zname(zi)) + '</span> (Perception ' + t.succ + '/' + t.need + ').', 'state');
    resolveAttackOn(found);
  }
  // Résout l'attaque en attente sur une cible donnée (même chemin que le clic
  // direct sur une vignette : mouvement au contact, dégâts, fin de tour).
  function resolveAttackOn(target) {
    const iid = pendingAttack.iid, ai = pendingAttack.atkIndex;
    const attacker = byId(iid);
    if (!attacker || !target) { pendingAttack = null; render(); return; }
    const atk = attacker.attacks[ai];
    // Attaque de CONTACT depuis une autre zone : on se déplace d'abord.
    if (atk && atk.range === 'contact' && attacker.zone !== target.zone) {
      if (crossCheck(attacker, target.zone) === 'block') {
        alert('Une barrière infranchissable sépare ces zones — attaque impossible.');
        pendingAttack = null; render(); return;
      }
      arrivalTargetIid = target.iid;
      doMove(attacker, target.zone);
      arrivalTargetIid = null;
      if (attacker.status !== 'active' || target.status !== 'active') {
        pendingAttack = null; checkOutcome(); Store.save(); render(); return;
      }
    }
    pendingAttack = null;
    execHeroAttack(attacker, ai, target);
  }

  function applyAttack(attacker, atkIndex, target) {
    let atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (attacker.attackUses[atkIndex] === 0) return;
    if (cannotAct(attacker, atk, atkIndex)) return;
    recordAction(attacker, atk, atkIndex);
    // ORBES PARTAGÉS : action de buff (ne résout pas d'attaque classique).
    if (atk.orbeShare) { triggerOrbeShare(attacker); if (!atk.freeAction) useAction(attacker); return; }
    // DÉPHASAGE : action pure — l'aventurier devient intouchable au prochain tour adverse.
    if (atk.dephasage) {
      attacker.dephaseTurn = combat().turn;
      pushFx({ type: 'state', iid: attacker.iid });
      log(cname(attacker) + ' active <span class="lstate">Déphasage</span> : intouchable au prochain tour des adversaires.', 'state');
      if (!atk.freeAction) useAction(attacker);
      return;
    }
    // ASSAUT : tous les aventuriers de la zone (vous compris) attaquent gratuitement.
    if (atk.assaut) {
      const zone = attacker.zone;
      log('<b class="lreact">Assaut !</b> ' + cname(attacker) + ' : les AUTRES aventuriers de la zone attaquent gratuitement.', 'state');
      // Tous les alliés de la zone SAUF l'initiateur (qui a dépensé son Action).
      activeOf('hero').filter(function (h) { return h.zone === zone && h.iid !== attacker.iid; })
        .forEach(function (h) { enqueueAllyFreeAttack(h, 'Assaut'); });
      if (!atk.freeAction) useAction(attacker);
      return;
    }
    let deflagZone = null;
    // DÉFLAGRATION : lance tous les Orbes Mystiques restants (dés bleus) d'un coup.
    if (atk.deflagration) {
      const pi = attacker.attacks.findIndex(isOrbAttack);
      const orbs = pi >= 0 ? (attacker.attackUses[pi] || 0) : 0;
      if (orbs <= 0) { alert('Aucun Orbe Mystique disponible ce tour pour la Déflagration.'); return; }
      const per = atk.orbPer || 1;
      atk = Object.assign({}, atk, { dice: Object.assign(D.emptyPool(), { blue: orbs * per }) });
      if (pi >= 0) attacker.attackUses[pi] = 0; // consomme tous les orbes restants
      // ORBE À DISPERSION : 3 orbes ou plus → la Déflagration touche toute la zone.
      if (orbs >= 3 && heroHasTalent(attacker, 'orbe_zone') && target) deflagZone = target.zone;
      log(cname(attacker) + ' concentre <span class="lstate">' + orbs + ' Orbe(s) Mystique(s)</span> en une Déflagration !', 'state');
    }
    // POISON X : inflige X dégâts avant d'attaquer
    applyPoison(attacker);
    if (attacker.status !== 'active') return;
    const enemySide = attacker.side === 'hero' ? 'monster' : 'hero';
    let targets = (atk.targets === 'all')
      ? activeOf(enemySide).filter(function (t) { return canReach(attacker, t, atk); })
      : (target ? [target] : []);
    // DÉFLAGRATION à dispersion : tous les adversaires de la zone visée.
    if (deflagZone != null) targets = activeOf('monster').filter(function (t) { return t.zone === deflagZone && !shootBlocked(attacker.zone, t.zone); });
    // DÉCHAÎNEMENT : ne touche que les adversaires affectés par l'état choisi.
    if (atk.brasier) {
      const bst = atk.brasierState || 'feu';
      targets = targets.filter(function (t) { return hasState(t, bst); });
    }
    // Frappe Tournoyante : limitée aux adversaires de la zone de l'aventurier.
    if (atk.zoneOnly) targets = targets.filter(function (t) { return t.zone === attacker.zone; });
    // FRAYEUR : la cible de la zone fuit vers une autre zone accessible et subit
    // les attaques d'opportunité (doMove les déclenche). Aucun dégât direct.
    if (atk.frayeur) {
      if (!target || target.zone !== attacker.zone) { if (!atk.freeAction) useAction(attacker); return; }
      // FRAYEUR à X cibles / toute la zone : la cible cliquée fuit d'abord, puis
      // les autres occupants adverses de la zone jusqu'au quota.
      const foesHere = combat().combatants.filter(function (x) {
        return x.side !== attacker.side && x.status === 'active' && x.zone === attacker.zone && x.iid !== target.iid;
      });
      const quota = atk.frayeurScope === 'zone' || atk.frayeurScope === 'all'
        ? 1 + foesHere.length
        : Math.max(1, atk.frayeurCount || 1);
      const victims = [target].concat(foesHere).slice(0, quota);
      victims.forEach(function (v) {
        if (v.status !== 'active' || v.zone !== attacker.zone) return;
        const dests = zones().map(function (z, i) { return i; }).filter(function (i) {
          return i !== v.zone && moveBarrier(v.zone, i).type !== 'block';
        });
        if (!dests.length) {
          log(cname(v) + ' est ' + gAgr(v, 'terrifié') + ' mais <span class="lstate">ne peut fuir nulle part</span>.', 'state');
          return;
        }
        const dest = dests[Math.floor(Math.random() * dests.length)];
        log('<b class="lopp">Frayeur !</b> ' + cname(attacker) + ' terrifie ' + cname(v) +
          ' qui fuit vers <span class="lstate">' + esc(zname(dest)) + '</span>.', 'state');
        doMove(v, dest);
      });
      if (!atk.freeAction) useAction(attacker);
      return;
    }
    // PROVOCATION : attire la cible dans la zone de l'attaquant avant de frapper.
    if (atk.provoke && target && target.zone !== attacker.zone && moveBarrier(attacker.zone, target.zone).type !== 'block') {
      target.zone = attacker.zone; pushFx({ type: 'move', iid: target.iid });
      log('<b class="lopp">Provocation !</b> ' + cname(attacker) + ' attire ' + cname(target) + ' dans sa zone.', 'state');
      epinesOnArrival(target);
    }
    // DÉLUGE : relance l'attaque sur la même cible tant qu'aucun 1 n'apparaît.
    if (atk.deluge && target) {
      let guard = 0, res = resolveAttack(attacker, target, atk);
      while (guard++ < 20 && target.status === 'active' && attacker.status === 'active' && delugeNoOne(res)) {
        log('<b class="lopp">Déluge !</b> ' + cname(attacker) + ' enchaîne une attaque (aucun 1).', 'state');
        res = resolveAttack(attacker, target, atk);
      }
    } else {
      targets.forEach(function (t) { resolveAttack(attacker, t, atk); });
    }
    // ATTAQUE BLINDÉE : l'attaquant gagne Blindage après son attaque.
    if (atk.grantBlindageSelf && attacker.status === 'active') {
      attacker.states.blindage = true; pushFx({ type: 'state', iid: attacker.iid });
      log(cname(attacker) + ' gagne <span class="lstate">Blindage</span>.', 'state');
    }
    // BOUSCULADE : pousse la cible dans une autre zone ; elle subit les attaques
    // d'opportunité des aventuriers de la zone de départ (celle de l'attaquant).
    if (atk.bousculade && target && target.status === 'active' && target.zone === attacker.zone) {
      const fromZone = target.zone;
      const dest = zones().findIndex(function (z, zi) {
        return zi !== fromZone && moveBarrier(fromZone, zi).type !== 'block';
      });
      if (dest >= 0) {
        activeOf('hero').filter(function (h) { return h.zone === fromZone && h.iid !== target.iid; })
          .forEach(function (h) { if (target.status === 'active') heroOpportunity(h, target); });
        if (target.status === 'active') {
          target.zone = dest; pushFx({ type: 'move', iid: target.iid });
          log('<b class="lopp">Bousculade !</b> ' + cname(attacker) + ' repousse ' + cname(target) +
            ' <span class="lstate">' + esc(zname(dest)) + '</span>.', 'state');
          epinesOnArrival(target);
        }
        checkComa(target);
      }
    }
    // COOPÉRATION : un allié GARDÉ de la zone attaque gratuitement (choix du joueur).
    if (atk.cooperation && attacker.status === 'active') triggerCooperation(attacker);
    // ATTAQUE FURIEUSE : si la cible est tuée, UNE seule attaque gratuite sur un
    // autre adversaire de la zone (pas de chaînage à l'infini).
    if (atk.chainOnKill && target && target.status !== 'active' && attacker.status === 'active') {
      const next = activeOf('monster').find(function (m) { return m.zone === attacker.zone; })
        || activeOf('monster').find(function (m) { return canReach(attacker, m, atk); });
      if (next) {
        log(cname(attacker) + ' <span class="lreact">enchaîne</span> (Attaque Furieuse) !', 'state');
        resolveAttack(attacker, next, atk);
      }
    }
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) useAction(attacker);
  }

  // Attaque à cibles multiples (talent Double Attaque) : frappe plusieurs
  // adversaires d'une même zone avec les dégâts de l'arme.
  function applyMultiAttack(attacker, atkIndex, zoneIdx, iids) {
    const atk = attacker.attacks[atkIndex];
    if (!atk) return;
    if (cannotAct(attacker, atk, atkIndex)) return;
    recordAction(attacker, atk, atkIndex);
    // Attaque de contact : l'aventurier rejoint la zone ciblée (s'il le peut)
    if (atk.range === 'contact' && attacker.zone !== zoneIdx) {
      // PRÉPARÉ : le déplacement vers la zone ciblée peut puiser dans le bonus.
      const bonusMove = attacker.used.move && attacker.prepBonus;
      if (attacker.used.move && !attacker.prepBonus) { alert('Vous ne pouvez pas atteindre cette zone.'); return; }
      const cross = crossCheck(attacker, zoneIdx);
      if (cross === 'block') { alert('Une barrière infranchissable sépare ces zones — attaque impossible.'); return; }
      if (cross === 'fail') { if (bonusMove) attacker.prepBonus = false; else attacker.used.move = true; return; }
      doMove(attacker, zoneIdx, true);
      if (bonusMove) attacker.prepBonus = false; // mouvement bonus consommé (déjà déplacé ce tour)
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
    if (!atk.freeAction) useAction(attacker);
  }
  function execHeroMultiAttack(attacker, atkIndex, zoneIdx, iids) {
    applyMultiAttack(attacker, atkIndex, zoneIdx, iids);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
    if (startNextChoice()) render();
  }

  // Version UI : applique puis rafraîchit
  function execHeroAttack(attacker, atkIndex, target) {
    const atkPlayed = attacker.attacks && attacker.attacks[atkIndex];
    applyAttack(attacker, atkIndex, target);
    flashInvisibleAlert();
    // PRÉPARATION ARCANIQUE : un SEUL Orbe avant le tour. Sans ce drapeau, le
    // Pré-Tour réarmait aussitôt les Orbes (ils ne consomment pas l'action) et
    // deux clics de suite en lançaient deux.
    if (atkPlayed && isOrbAttack(atkPlayed) && combat().phase === 'pretour') attacker.orbPretourDone = true;
    pendingAttack = null;
    // ORBES pendant le tour : le bouton RESTE armé tant qu'il reste des orbes
    // (ils ne consomment pas l'action) — on enchaîne les tirs sans recliquer.
    // Au Pré-Tour en revanche, un seul orbe est autorisé : on ne réarme pas.
    if (atkPlayed && isOrbAttack(atkPlayed) && combat().phase === 'heroes' && !combat().outcome &&
        attacker.status === 'active' && !(attacker.states && attacker.states.auSol) &&
        (attacker.attackUses[atkIndex] === undefined || attacker.attackUses[atkIndex] > 0)) {
      pendingAttack = { iid: attacker.iid, atkIndex: atkIndex, average: false };
    }
    checkOutcome(); Store.save(); render();
    if (startNextChoice()) render();
  }

  // Action de soin auto-ciblée (talents soin_fixe / soin_endu / soin_des).
  function applySelfHeal(c, atkIndex) {
    const atk = c.attacks[atkIndex];
    if (!atk) return;
    if (cannotAct(c, atk, atkIndex)) return;
    recordAction(c, atk, atkIndex);
    // POISON X : inflige X dégâts avant d'utiliser un talent de soin
    applyPoison(c);
    if (c.status !== 'active') return;
    const before = c.pv;
    // healVal accepte un nombre OU une expression de dés (« 1d6+1 »), tirée ici.
    const healRolled = Store.rollAmount(atk.healVal || 0);
    const healExpr = (typeof atk.healVal === 'string' && atk.healVal) ? atk.healVal + ' → ' + healRolled : null;
    let heal = 0, detail = '';
    if (atk.selfHeal === 'soin_fixe') {
      heal = healRolled;
      if (healExpr) detail = ' <span class="ldice">(' + healExpr + ')</span>';
    } else if (atk.selfHeal === 'soin_endu') {
      heal = (c.endu || 0) + healRolled;
      detail = ' <span class="ldice">(ENDU ' + (c.endu || 0) + (healRolled ? ' + ' + (healExpr || healRolled) : '') + ')</span>';
    } else if (atk.selfHeal === 'soin_des') {
      const n = Math.max(1, healRolled || 1); const rolls = [];
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(dnum(v, 'green')); heal += v; }
      detail = ' <span class="ldice">(' + rolls.join('<span class="dplus">+</span>') + ')</span>';
    }
    c.pv = Math.min(c.maxPv, c.pv + heal);
    const gained = c.pv - before;
    pushFx({ type: 'heal', iid: c.iid, amount: gained, fromPct: pct(before, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' utilise <span class="lwpn">' + nm(attackLabel(atk)) + '</span> et récupère ' +
      amt(gained, 'heal') + ' PV' + detail + '.', 'heal');
    if (!atk.freeAction) useAction(c);
  }
  // ---- EXPLOSION DE ZONE (Attaque de Zone / Mort Explosive) ----
  // Souffle générique : des dés (couleurs au choix) frappent les combattants
  // d'une zone — X cibles, toute la zone ou tout le combat —, du camp adverse,
  // allié ou des deux, avec un état facultatif. La DEF n'intervient pas (c'est
  // un effet de souffle, comme le Feu).
  const BLAST_STATE_LABEL = { affaibli: 'Affaibli', auSol: 'Au sol', feu: 'Feu', gele: 'Gelé', poison: 'Poison', brise: 'Brisé', faille: 'Faille' };
  function blastTargets(src, cfg, zi) {
    const all = combat().combatants.filter(function (c) {
      if (c.status !== 'active' || c.iid === src.iid) return false;
      if (cfg.scope !== 'all' && c.zone !== zi) return false;
      // Camp visé ABSOLU : Aventuriers / Adversaires / tous les Combattants —
      // indépendant du camp du porteur (aucune ambiguïté pour un talent
      // d'adversaire). Rétro-compat des anciennes valeurs relatives :
      // 'allies' = camp du porteur, 'foes' = camp opposé.
      if (cfg.side === 'heroes') return c.side === 'hero';
      if (cfg.side === 'monsters') return c.side === 'monster';
      if (cfg.side === 'both' || cfg.side === 'all') return true;
      if (cfg.side === 'allies') return c.side === src.side;
      return c.side !== src.side; // 'foes' / défaut
    });
    if (cfg.scope === 'count') return all.slice(0, Math.max(1, cfg.val || 1));
    return all;
  }
  function zoneBlast(src, cfg, zi) {
    const targets = blastTargets(src, cfg, zi);
    if (!targets.length) {
      log(cname(src) + ' déclenche <span class="lwpn">' + nm(cfg.name || 'une explosion') +
        '</span> — personne dans <span class="lstate">' + esc(zname(zi)) + '</span>.', 'state');
      return 0;
    }
    const pool = Object.assign(D.emptyPool(), cfg.dice || {});
    let touched = 0;
    targets.forEach(function (t) {
      if (t.status !== 'active') return;
      // BLINDAGE : absorbe entièrement le souffle (consomme une source).
      if (absorbBlindage(t, cfg.name || 'l\'explosion')) return;
      const res = D.resolve(pool, { def: 0, damage: 0, turn: combat().turn });
      showRoll(res, { iid: src.iid, who: cname(src), target: cname(t), label: cfg.name || 'Explosion' });
      const flat = Math.max(0, Store.rollAmount(cfg.val0 || 0));
      const dmg = Math.max(0, (res.pvLost || 0) + flat);
      const before = t.pv;
      if (dmg > 0) {
        t.pv = Math.max(0, t.pv - dmg);
        t.dmgTaken += dmg; revealOnDamage(t, dmg);
        src.dmgDealt += dmg;
        pushFx({ type: 'hit', iid: t.iid, amount: dmg, fromPct: pct(before, t.maxPv), toPct: pct(t.pv, t.maxPv) });
      }
      let stTxt = '';
      if (cfg.state && t.status === 'active') {
        if (isStackState(cfg.state)) addStack(t, cfg.state, stackApplyN(src, cfg.state));
        else t.states[cfg.state] = true;
        pushFx({ type: 'state', iid: t.iid });
        stTxt = ' + <span class="lstate">' + esc(BLAST_STATE_LABEL[cfg.state] || cfg.state) +
          (isStackState(cfg.state) ? ' ' + stateVal(t, cfg.state) : '') + '</span>';
      }
      log(cname(src) + ' — <span class="lwpn">' + nm(cfg.name || 'Explosion') + '</span> touche ' + cname(t) +
        ' : ' + amt(dmg, 'dmg') + ' Dégâts' + stTxt + '.', 'attack');
      if (t.side === 'monster' && t.pv <= 0 && !t.killedBy) t.killedBy = src.iid;
      checkComa(t);
      touched++;
    });
    return touched;
  }
  // Configuration de souffle portée par un talent (Attaque de Zone / Mort Explosive).
  function blastCfg(t, fallbackName) {
    return {
      name: t.name || fallbackName,
      dice: t.dice || { white: 2 },
      val: Math.max(1, parseInt(t.val, 10) || 1),   // nb de cibles (scope 'count')
      val0: 0,
      scope: t.scope || 'count',
      side: t.side || 'foes',
      state: t.state || t.choice || '',
      range: t.range || 'contact',
    };
  }
  // MORT EXPLOSIVE : déclenchée quand le porteur tombe (coma / mort).
  function mortExplosive(c) {
    if (!c || c._blasted) return;
    const t = Array.isArray(c.talents) ? c.talents.find(function (x) { return x.effect === 'mort_explosive'; }) : null;
    if (!t) return;
    c._blasted = true;               // une seule explosion par combattant
    const cfg = blastCfg(t, 'Mort Explosive');
    if (cfg.range === 'distance') cfg.scope = 'all';   // « une autre zone » → tout le combat
    toast('💥 ' + (t.name || 'Mort Explosive'), 'crit');
    log('<b class="lopp">' + nm(t.name || 'Mort Explosive') + ' !</b> ' + cname(c) + ' explose en tombant.', 'state');
    zoneBlast(c, cfg, c.zone);
    checkOutcome();
  }

  // ATTAQUE DE ZONE : consomme l'action puis déclenche le souffle sur la zone.
  function execZoneBlast(c, atkIndex, zi) {
    const atk = c.attacks[atkIndex];
    if (!atk || !atk.zoneBlast) return;
    if (cannotAct(c, atk, atkIndex)) return;
    recordAction(c, atk, atkIndex);
    applyPoison(c);
    if (c.status !== 'active') { pendingAttack = null; checkOutcome(); Store.save(); render(); return; }
    const cfg = blastCfg(Object.assign({ name: attackLabel(atk) }, atk.zoneBlast), 'Attaque de Zone');
    toast('💥 ' + attackLabel(atk), 'act-hero');
    zoneBlast(c, cfg, zi);
    if (!atk.freeAction) useAction(c);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // GUÉRISON : récupère de la VIE perdue. La VIE est une statistique d'AVENTURE
  // (elle se perd au coma) : le soin est donc appliqué à la partie en cours, pas
  // aux PV du combat. Sans partie (Combat Test) ou sans VIE perdue, l'action
  // n'est pas consommée.
  function applyVieHeal(c, atkIndex) {
    const atk = c.attacks[atkIndex];
    if (!atk) return;
    if (cannotAct(c, atk, atkIndex)) return;
    const label = attackLabel(atk);
    if (!(global.Session && Session.restoreVie) || !Store.state.sessionCombat) {
      log(cname(c) + ' utilise <span class="lwpn">' + nm(label) + '</span> — sans effet hors d\'une partie.', 'state');
      toast('❤ Aucune VIE à récupérer', 'miss');
      return;
    }
    const res = Session.restoreVie(c.templateId, atk.vieHeal || 1);
    if (!res || res.dead || !res.healed) {
      log(cname(c) + ' utilise <span class="lwpn">' + nm(label) + '</span> — aucune VIE perdue à récupérer.', 'state');
      toast('❤ Aucune VIE à récupérer', 'miss');
      return;
    }
    recordAction(c, atk, atkIndex);
    applyPoison(c);            // POISON X : s'applique avant tout talent
    if (c.status !== 'active') return;
    pushFx({ type: 'heal', iid: c.iid, amount: 0, fromPct: pct(c.pv, c.maxPv), toPct: pct(c.pv, c.maxPv) });
    log(cname(c) + ' utilise <span class="lwpn">' + nm(label) + '</span> et récupère ' +
      amt(res.healed, 'heal') + ' VIE (' + res.vie + '/' + res.maxVie + ').', 'heal');
    toast('❤ +' + res.healed + ' VIE', 'act-hero');
    if (!atk.freeAction) useAction(c);
  }
  function execHeroVieHeal(c, atkIndex) {
    applyVieHeal(c, atkIndex);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }
  function execHeroSelfHeal(c, atkIndex) {
    applySelfHeal(c, atkIndex);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
  }

  // Active une action du bandeau (clic sur un bouton d'attaque/talent) — aussi
  // déclenchée directement par un PARCHEMIN (l'action se joue sans bouton dédié).
  function activateHeroAction(c, i) {
    const atk = c.attacks[i];
    if (!atk) return;
    // Cliquer un AUTRE bouton met fin à la répartition des Orbes Partagés / désignation Gardien.
    if (!atk.orbeShare) pendingOrbeShare = null;
    pendingDesignate = null;
    // ATTAQUE DE ZONE : au contact, le souffle part dans SA zone ; à distance,
    // on choisit la zone visée (clic sur une zone du plateau).
    if (atk.zoneBlast) {
      if (atk.range === 'distance') {
        pendingAttack = { iid: c.iid, atkIndex: i, blastZone: true };
        render(); return;
      }
      execZoneBlast(c, i, c.zone); return;
    }
    // Action de soin (auto-ciblée) : se résout immédiatement, sans ciblage.
    if (atk.vieHeal) { execHeroVieHeal(c, i); return; }
    if (atk.selfHeal) { execHeroSelfHeal(c, i); return; }
    // DÉPHASAGE / ASSAUT (auto-ciblés) : se résolvent immédiatement, sans ciblage.
    if (atk.dephasage || atk.assaut) { execHeroAttack(c, i, null); return; }
    // ORBES PARTAGÉS : on arme le ciblage des ALLIÉS (clic sur leurs vignettes),
    // sans pop-up. Re-clic = annuler.
    if (atk.orbeShare) {
      const pi = c.attacks.findIndex(isOrbAttack);
      const orbs = pi >= 0 ? (c.attackUses[pi] || 0) : 0;
      if (orbs <= 0) { alert('Aucun Orbe Mystique disponible ce tour.'); return; }
      pendingOrbeShare = (pendingOrbeShare === c.iid) ? null : c.iid;
      pendingAttack = null; pendingAnalyze = null; pendingMove = null; pendingObject = null; stateMenuFor = null;
      render(); return;
    }
    // COURSE (action de déplacement) : arme un mouvement qui consomme l'action.
    if (atk.moveAction) {
      if (actionSpent(c)) return;
      moveAsAction = (pendingMove !== c.iid);
      pendingMove = (pendingMove === c.iid) ? null : c.iid;
      pendingAttack = null; pendingAnalyze = null; render(); return;
    }
    // REBOND : octroie 2 mouvements gratuits ce tour, puis on attaque normalement.
    if (atk.rebondAction) {
      if (c.rebondUsed) return; // déjà activé ce tour
      c.rebondUsed = true; c.freeMoves = 2;
      log(cname(c) + ' utilise <span class="lstate">' + esc(atk.name) + '</span> : 2 mouvements gratuits.', 'state');
      pendingAttack = null; pendingAnalyze = null; pendingMove = null;
      Store.save(); render(); return;
    }
    if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average) {
      pendingAttack = null; render(); return; // re-clic = annuler
    }
    if (atk.multiTarget) {
      pendingAttack = { iid: c.iid, atkIndex: i, average: false, multi: atk.multiTarget, picked: [], zone: null };
      pendingAnalyze = null; pendingMove = null; stateMenuFor = null; render();
    } else if (atk.targets === 'all' && !atk.zoneOnly) { execHeroAttack(c, i, null); }
    // Frappe Tournoyante (zoneOnly) : attaque normale — on cible un adversaire,
    // le déplacement au contact se fait automatiquement, puis TOUS les adversaires
    // de la zone d'arrivée sont touchés (filtrage zoneOnly dans applyAttack).
    else { pendingAttack = { iid: c.iid, atkIndex: i, average: false }; pendingAnalyze = null; stateMenuFor = null; render(); }
  }

  // Retire UN exemplaire de l'objet consommé de l'inventaire de la session.
  // Objets CUMULABLES : l'objet reste équipé tant qu'il en reste en stock.
  function consumeObject(user) {
    const obj = user.objectItem;
    if (!obj) return;
    if (global.Session && Session.consumeObject) {
      try { Session.consumeObject(user.templateId, obj.id); } catch (e) { console.error('[combat] consumeObject', e); }
    }
    const left = (global.Session && Session.ownedCount) ? Session.ownedCount(user.templateId, obj.id) : 0;
    if (left <= 0) user.objectItem = null;
  }

  // Objets à effet PERSONNEL (sans ciblage) : munitions et parchemins.
  function isSelfObject(obj) {
    return !!(obj && (obj.objEffect === 'ammo' || obj.objEffect === 'talent'));
  }
  const AMMO_LABEL = { white: 'blanc', bone: 'os', pink: 'rose', green: 'vert', blue: 'bleu', yellow: 'jaune', red: 'rouge', black: 'noir' };
  // Applique un objet personnel à son porteur, puis le consomme.
  function applySelfObject(user) {
    const obj = user.objectItem;
    if (!obj) return;
    if (obj.objEffect === 'ammo') {
      // MUNITION : charge +1 dé (couleur) pour la PROCHAINE attaque à distance.
      user.ammoLoaded = obj.ammoColor || 'white';
      log(cname(user) + ' encoche <span class="lwpn">' + esc(obj.name) + '</span> : +1 dé ' +
        (AMMO_LABEL[user.ammoLoaded] || user.ammoLoaded) + ' à sa prochaine attaque à distance.', 'state');
    } else if (obj.objEffect === 'talent') {
      // PARCHEMIN : ses effets sont greffés au porteur SANS occuper d'emplacement
      // du bandeau (fromParchment). Une ACTION se déclenche IMMÉDIATEMENT, comme
      // un clic sur son bouton (ciblage direct) ; passifs/améliorations restent
      // actifs pour le combat (tracés dans le journal).
      const tals = parchmentTalents(obj);
      if (!tals.length) {
        log(cname(user) + ' déroule <span class="lwpn">' + esc(obj.name) + '</span>… vierge (aucun effet).', 'move');
      } else {
        user.talents = (user.talents || []).concat(tals);
        const actions = tals.filter(function (t) { return t.kind === 'action' || t.effect === 'orbes_mystiques'; });
        const passives = tals.filter(function (t) { return actions.indexOf(t) < 0; });
        if (passives.length) {
          log(cname(user) + ' déroule <span class="lwpn">' + esc(obj.name) + '</span> : « ' +
            esc(passives.map(function (t) { return talentEffectName(t.effect); }).join(' + ')) + ' » actif pour ce combat.', 'state');
        }
        if (actions.length && Combatants.talentActionAttacks) {
          const weaponAtks = (user.attacks || []).filter(function (a) { return a.isBase; });
          const newAtks = Combatants.talentActionAttacks(weaponAtks.length ? weaponAtks : (user.attacks || []), actions);
          newAtks.forEach(function (a) { a.uses = 1; a.fromParchment = true; a.generic = true; });
          const firstIdx = (user.attacks || []).length;
          user.attacks = (user.attacks || []).concat(newAtks);
          user.attackUses = (user.attackUses || []).concat(newAtks.map(function () { return 1; }));
          log(cname(user) + ' déroule <span class="lwpn">' + esc(obj.name) + '</span> : l\'action se déclenche !', 'state');
          // Consommation d'abord, puis déclenchement direct de l'action (ciblage).
          consumeObject(user);
          user.used.object = true;
          pendingObject = null;
          pushFx({ type: 'state', iid: user.iid });
          Store.save();
          activateHeroAction(user, firstIdx);
          return;
        }
      }
    }
    consumeObject(user);
    user.used.object = true;
    pendingObject = null;
    pushFx({ type: 'state', iid: user.iid });
    checkOutcome(); Store.save(); render();
  }
  // Nom lisible d'un effet de talent (catalogue).
  function talentEffectName(key) {
    const e = (Store.talentEffectMap ? Store.talentEffectMap() : {})[key];
    return e ? e.name : key;
  }
  // Résout les effets portés par un parchemin : soit un TALENT DE PARCHEMIN dédié
  // (onglet Classes, référence « tal:<id> », effets multiples possibles), soit un
  // effet brut du catalogue. Les entrées sont marquées fromParchment (aucun
  // emplacement de bandeau occupé).
  function parchmentTalents(obj) {
    const cat = Store.talentEffectMap ? Store.talentEffectMap() : {};
    const key = obj.parchEffect || '';
    if (!key) return [];
    if (key.indexOf('tal:') === 0) {
      const pool = Store.loadParchTalents ? Store.loadParchTalents() : [];
      const t = pool.find(function (x) { return x.id === key.slice(4); });
      if (!t) return [];
      const list = Store.talentEffectList ? Store.talentEffectList(t) : [];
      return list.map(function (e) {
        const c = cat[e.effect] || {};
        return { id: t.id, name: obj.name || t.name, effect: e.effect, kind: c.kind || 'passive',
          val: (typeof e.val === 'number') ? e.val : (c.defaultVal || 0),
          dice: e.dice || null, range: e.range || null, choice: e.choice || null,
          scope: e.scope || 'count', fromParchment: true };
      });
    }
    const c = cat[key] || {};
    return [{ id: 'parch-' + obj.id, name: obj.name, effect: key, kind: c.kind || 'passive',
      val: obj.parchVal || c.defaultVal || 0, dice: null, range: null, choice: null,
      scope: 'count', fromParchment: true }];
  }

  // Applique l'effet d'un objet consommable de `user` sur `target`, puis le consomme.
  function applyObjectEffect(user, target) {
    const obj = user.objectItem;
    if (!obj || !target || target.status !== 'active') { pendingObject = null; render(); return; }
    if (obj.objEffect === 'heal') {
      const n = Math.max(1, obj.objDice || 1);
      const rolls = []; let heal = 0;
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(dnum(v, 'green')); heal += v; }
      const before = target.pv;
      target.pv = Math.min(target.maxPv, target.pv + heal);
      const gained = target.pv - before;
      pushFx({ type: 'heal', iid: target.iid, amount: gained, fromPct: pct(before, target.maxPv), toPct: pct(target.pv, target.maxPv) });
      log(cname(user) + ' utilise <span class="lwpn">' + esc(obj.name) + '</span> sur ' + cname(target) +
        ' : ' + amt(gained, 'heal') + ' PV récupérés <span class="ldice">(' + rolls.join('<span class="dplus">+</span>') + ')</span>.', 'heal');
    } else {
      log(cname(user) + ' utilise <span class="lwpn">' + esc(obj.name) + '</span> (aucun effet).', 'move');
    }
    consumeObject(user);
    user.used.object = true;
    pendingObject = null;
    checkOutcome(); Store.save(); render();
  }

  // Résout les dégâts moyens garantis (sans dé, sans risque d'échec)
  function resolveAverageAttack(attacker, target, atk) {
    if (target.status !== 'active') return;
    // Dégâts moyens = moyenne des dés de l'arme seulement (sans le bonus de dégâts)
    const avgDice = Math.round(avgDicePool(atk.dice));
    const def = target.states.auSol ? 0 : target.def;
    const pvLost = Math.max(0, avgDice - def);
    // (Le nom de l'arme n'apparaît plus dans le journal : il est visible dans
    // la boîte de dés du bandeau.)
    if (pvLost > 0) {
      const pvBefore = target.pv;
      target.pv = Math.max(0, target.pv - pvLost);
      target.dmgTaken += pvLost; revealOnDamage(target, pvLost); attacker.dmgDealt += pvLost;
      pushFx({ type: 'hit', iid: target.iid, amount: pvLost, fromPct: pct(pvBefore, target.maxPv), toPct: pct(target.pv, target.maxPv) });
      checkMonsterTalents(target, pvLost);
    }
    // Le déplacement n'est plus raconté dans le journal (il se voit sur le
    // plateau) : on consomme simplement le préfixe en attente.
    if (movePrefix && movePrefix.iid === attacker.iid) movePrefix = null;
    log(cname(attacker) + ' attaque ' + cname(target) +
      ' <span class="lavg">(moyenne)</span> : ' + amt(pvLost, 'dmg') + ' Dégâts.', 'attack');
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
    if (cannotAct(attacker, atk, atkIndex)) return;
    recordAction(attacker, atk, atkIndex);
    const enemySide = attacker.side === 'hero' ? 'monster' : 'hero';
    const targets = (atk.targets === 'all')
      ? activeOf(enemySide).filter(function (t) { return canReach(attacker, t, atk); })
      : (target ? [target] : []);
    targets.forEach(function (t) { resolveAverageAttack(attacker, t, atk); });
    if (attacker.attackUses[atkIndex] !== null) {
      attacker.attackUses[atkIndex] = Math.max(0, attacker.attackUses[atkIndex] - 1);
    }
    if (!atk.freeAction) useAction(attacker);
  }

  function execHeroAverageAttack(attacker, atkIndex, target) {
    applyAverageAttack(attacker, atkIndex, target);
    pendingAttack = null;
    checkOutcome(); Store.save(); render();
    if (startNextChoice()) render();
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
        // 0a) CHOIX AU CLIC en attente (talents « vous pouvez… ») : seule une cible
        // valide résout le choix ; tout autre clic est ignoré tant qu'il est actif.
        if (activeChoice) {
          if (activeChoice.isValidTarget(c)) resolveActiveChoice(c);
          return;
        }
        // 0bis) ORBES PARTAGÉS : clic sur la vignette d'un allié → +1 dé bleu & FEU.
        if (pendingOrbeShare && c.side === 'hero' && c.status === 'active' && c.iid !== pendingOrbeShare) {
          const caster = byId(pendingOrbeShare);
          const pi = caster ? caster.attacks.findIndex(isOrbAttack) : -1;
          const orbs = (caster && pi >= 0) ? (caster.attackUses[pi] || 0) : 0;
          if (caster && orbs > 0 && !(c.orbBuff > 0)) {
            c.orbBuff = (c.orbBuff || 0) + 1;
            c.orbBuffState = orbElementOf(caster) || 'feu';
            caster.attackUses[pi] = Math.max(0, orbs - 1);
            useAction(caster); // ORBES PARTAGÉS est une Action : elle consomme l'action dès le 1er allié doté
            pushFx({ type: 'state', iid: c.iid });
            log(cname(c) + ' reçoit <span class="lstate">+1 dé bleu &amp; ' + orbElementLabel(c.orbBuffState) +
              '</span> sur sa prochaine attaque (Orbes Partagés).', 'state');
            if (caster.attackUses[pi] <= 0) pendingOrbeShare = null; // plus d'orbes : fin auto
            Store.save(); render();
          }
          return;
        }
        // 0ter) GARDIEN : clic sur la vignette d'un allié → Blindage + Gardé.
        if (pendingDesignate && c.side === 'hero' && c.status === 'active' && c.iid !== pendingDesignate && !(c.states && c.states.garde)) {
          const guardian = byId(pendingDesignate);
          if (guardian && (guardian.gardienLeft || 0) > 0) {
            c.states.blindage = true; c.states.garde = true;
            guardian.gardienLeft = Math.max(0, guardian.gardienLeft - 1);
            pushFx({ type: 'state', iid: c.iid });
            log(cname(c) + ' reçoit <span class="lstate">Blindage</span> et <span class="lstate">Gardé</span> (Gardien).', 'state');
            if (guardian.gardienLeft <= 0) pendingDesignate = null; // toutes les désignations faites
            // PRÉ-TOUR : si plus rien à jouer, on enchaîne automatiquement le vrai tour.
            if (pretourAllDone()) { startTurnFromPretour(); return; }
            Store.save(); render();
          }
          return;
        }
        // 0) Ciblage d'un objet consommable
        if (targetable && pendingObject) {
          const ouser = byId(pendingObject);
          if (ouser) applyObjectEffect(ouser, c);
          return;
        }
        // 1) Ciblage d'une analyse
        if (targetable && pendingAnalyze && c.side === 'monster') {
          const hero = byId(pendingAnalyze);
          pendingAnalyze = null;
          doAnalyze(hero, c);
          return;
        }
        // 1bis) RACCOURCI : Cmd (ou Ctrl) enfoncé + clic sur un adversaire =
        // analyse directe, sans passer par le bouton.
        if ((e.metaKey || e.ctrlKey) && c.side === 'monster' && c.status === 'active' &&
            !pendingAttack && !pendingMove && !pendingObject && !pendingDesignate && !pendingOrbeShare) {
          const ah = aimHero();
          if (ah && canAnalyze(ah)) { e.preventDefault(); doAnalyze(ah, c); return; }
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
        // 2pre) VISÉE DIRECTE : un aventurier est sélectionné, aucune action n'est
        // armée et l'on clique un adversaire → il l'attaque avec son arme.
        let aimed = false;
        if (!pendingAttack && !pendingMove && !pendingAnalyze && !pendingObject &&
            c.side === 'monster' && c.status === 'active') {
          const ah = aimHero();
          const ai = ah ? aimAttackIndex(ah) : -1;
          if (ah && ai >= 0) {
            pendingAttack = { iid: ah.iid, atkIndex: ai, average: false };
            aimed = true;
          }
        }
        // 2) Ciblage d'une attaque
        if ((targetable || aimed) && pendingAttack) {
          const attacker = byId(pendingAttack.iid);
          if (!attacker) return;
          const atk = attacker.attacks[pendingAttack.atkIndex];
          // ÉCLIPSE : téléportation (franchit toutes les barrières) dans la zone de
          // la cible, sans dégâts d'opportunité, puis attaque.
          if (atk && atk.eclipse && attacker.zone !== c.zone) {
            movePrefix = { iid: attacker.iid, zone: zname(c.zone) };
            attacker.zone = c.zone; pushFx({ type: 'move', iid: attacker.iid });
            log(cname(attacker) + ' <span class="lstate">se téléporte</span> ' + esc(zname(c.zone)) + ' (Éclipse).', 'state');
            execHeroAttack(attacker, pendingAttack.atkIndex, c);
            return;
          }
          // Assaut Mobile (freeMove) : le déplacement est gratuit (ne consomme pas le mouvement)
          // et peut s'enchaîner même si le mouvement a déjà été utilisé ce tour.
          if (atk && atk.range === 'contact' && attacker.zone !== c.zone) {
            // PRÉPARÉ : le déplacement automatique vers la cible peut puiser dans le
            // bonus (Mouvement) même si le mouvement du tour est déjà dépensé.
            const bonusMove = !atk.freeMove && attacker.used.move && attacker.prepBonus;
            if (!atk.freeMove && attacker.used.move && !attacker.prepBonus) { alert('Vous ne pouvez pas atteindre cet adversaire.'); return; }
            // BARRIÈRES : mur/infranchissable bloque ; Difficile exige un test d'Agilité.
            const cross = crossCheck(attacker, c.zone);
            if (cross === 'block') { alert('Une barrière infranchissable sépare ces zones — attaque au contact impossible.'); return; }
            if (cross === 'fail') {
              // Test raté : le mouvement est perdu, l'attaque (action) est conservée.
              if (bonusMove) attacker.prepBonus = false; else if (!atk.freeMove) attacker.used.move = true;
              pendingAttack = null; checkOutcome(); Store.save(); render(); return;
            }
            const prevMove = attacker.used.move;
            doMove(attacker, c.zone, true);
            if (atk.freeMove) attacker.used.move = prevMove;
            else if (bonusMove) attacker.prepBonus = false; // le mouvement bonus est consommé
            if (attacker.status !== 'active') { pendingAttack = null; checkOutcome(); Store.save(); render(); return; }
            movePrefix = { iid: attacker.iid, zone: zname(attacker.zone) };
          }
          if (pendingAttack.average) execHeroAverageAttack(attacker, pendingAttack.atkIndex, c);
          else execHeroAttack(attacker, pendingAttack.atkIndex, c);
          return;
        }
        // 2bis) Déplacement vers une zone en visant un adversaire précis : ses effets
        // d'arrivée (dégâts / état) s'appliqueront en priorité à CET adversaire.
        if (pendingMove && c.side === 'monster' && c.status === 'active') {
          const mover = byId(pendingMove);
          if (mover && mover.zone !== c.zone) {
            arrivalTargetIid = c.iid;
            moveCombatant(pendingMove, c.zone);
            return;
          }
        }
        // 3) Sinon : sélectionne ce combattant — ou le DÉSÉLECTIONNE si on
        // reclique celui qui l'était déjà. Toute action en cours est annulée.
        if (selectedIid === c.iid) { clearSelection(); return; }
        selectedIid = c.iid; autoSelectOff = false; manualSelect = true;
        pendingAttack = null; pendingAnalyze = null; pendingMove = null; arrivalTargetIid = null; pendingObject = null; pendingOrbeShare = null; pendingDesignate = null;
        render();
      });
    }

    // Les états ne sont plus retirables manuellement : ils s'effacent via les
    // mécaniques de jeu (Se relever, fin de tour, etc.).
    // Pendant le Pré-Tour : seul le mouvement gratuit est câblé (ci-dessous dans le bloc heroes).
    const isPretourMove = combat().phase === 'pretour' && c.side === 'hero' && c.status === 'active' && !combat().outcome && c.freeMoveReady;
    if (isPretourMove) {
      const mv = root.querySelector('.do-move[data-iid="' + c.iid + '"]');
      if (mv) mv.addEventListener('click', function () {
        if (c.used.move) return;
        pendingMove = (pendingMove === c.iid) ? null : c.iid;
        pendingAttack = null; pendingAnalyze = null; render();
      });
    }
    // GARDIEN (Pré-Tour 1) : arme la désignation d'un allié (clic ensuite sur sa
    // vignette). Câblé hors de la phase héros car la désignation a lieu au Pré-Tour.
    root.querySelectorAll('.ab-gardien-btn[data-designate="' + c.iid + '"]').forEach(function (b) {
      b.addEventListener('click', function () {
        pendingDesignate = (pendingDesignate === c.iid) ? null : c.iid;
        pendingAttack = null; pendingAnalyze = null; pendingMove = null; pendingObject = null; pendingOrbeShare = null; stateMenuFor = null;
        render();
      });
    });
    // RÉACTION en pause : le bouton de réaction de l'aventurier concerné est cliquable
    // même pendant le tour des adversaires.
    if (pendingReaction === c.iid && c.status === 'active' && !combat().outcome) {
      root.querySelectorAll('.ab-atk-react[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          execHeroReaction(c, b.getAttribute('data-react'));
        });
      });
    }
    if (combat().phase === 'heroes' && c.side === 'hero' && c.status === 'active' && !combat().outcome) {
      // Action Analyser : arme l'analyse, puis on clique l'adversaire à examiner.
      // Consomme la même ressource que le mouvement (exclusivité mouvement/analyse).
      const anaBtn = root.querySelector('.do-analyse[data-iid="' + c.iid + '"]');
      if (anaBtn) anaBtn.addEventListener('click', function () {
        if (c.used.move) return;
        pendingAnalyze = (pendingAnalyze === c.iid) ? null : c.iid;
        pendingAttack = null; pendingMove = null; render();
      });
      // Bouton spécial ORBES (Mystique) : arme le ciblage de l'Orbe (mono-cible).
      root.querySelectorAll('.ab-orbes[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          const i = parseInt(b.getAttribute('data-atk'), 10);
          if (pendingAttack && pendingAttack.iid === c.iid && pendingAttack.atkIndex === i && !pendingAttack.average) {
            pendingAttack = null; render(); return; // re-clic = annuler
          }
          pendingAttack = { iid: c.iid, atkIndex: i, average: false };
          pendingAnalyze = null; pendingMove = null; pendingOrbeShare = null; pendingDesignate = null; stateMenuFor = null; render();
        });
      });
      // Chips d'attaque (dé)
      root.querySelectorAll('.atk-chip[data-iid="' + c.iid + '"]').forEach(function (b) {
        b.addEventListener('click', function () {
          activateHeroAction(c, parseInt(b.getAttribute('data-atk'), 10));
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
        if (!c.objectItem) return;
        if (pendingObject === c.iid) { pendingObject = null; render(); return; } // re-clic = annuler
        if (!confirm('Vous allez consommer votre ' + c.objectItem.name + '. Êtes-vous sûr ?\n(Un exemplaire sera retiré de votre inventaire.)')) return;
        // Objet PERSONNEL (munition, parchemin) : effet immédiat sur soi, sans ciblage.
        if (isSelfObject(c.objectItem)) { applySelfObject(c); return; }
        pendingObject = c.iid;
        pendingAttack = null; pendingAnalyze = null; pendingMove = null; arrivalTargetIid = null;
        render();
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
      // GELÉ : tentative de dégel (test de Force), consomme le mouvement.
      const unfreeze = root.querySelector('.do-unfreeze[data-iid="' + c.iid + '"]');
      if (unfreeze) unfreeze.addEventListener('click', function () {
        if (c.used.move) return;
        c.used.move = true;
        tryBreakGele(c);
        Store.save(); render(); flushFx(); flushToasts();
      });
      // Mouvement : arme le déplacement, puis on clique la zone de destination
      const mv = root.querySelector('.do-move[data-iid="' + c.iid + '"]');
      if (mv) mv.addEventListener('click', function () {
        if (c.used.move && !c.freeMoveReady && !(c.freeMoves > 0) && !c.prepBonus) return;
        pendingMove = (pendingMove === c.iid) ? null : c.iid;
        pendingAttack = null; pendingAnalyze = null; pendingOrbeShare = null; render();
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
    // Toutes les commandes de phase vivent dans la barre de combat, en haut :
    // rien sous le plateau (les anciens boutons « Activer les adversaires » /
    // « Fin du tour » y faisaient doublon).
  }

  function renderLog() {
    const root = $(rootSel);
    const box = root ? root.querySelector('#combat-log') : null;
    if (!box) return;
    // Le journal n'affiche NI les déplacements NI les changements de tour :
    // seuls les faits marquants restent (attaques, états, morts, réactions).
    const rows = combat().log.slice().reverse().filter(function (e) {
      return e.kind !== 'move' && e.kind !== 'turn';
    });
    if (!rows.length) { box.innerHTML = '<p class="empty">Rien à signaler pour l\'instant.</p>'; return; }
    box.innerHTML = rows.map(function (e) {
      return '<div class="log-row log-' + e.kind + '"><span class="log-turn">T' + e.turn + '</span>' +
        e.text + '</div>';
    }).join('');
    // Détail du calcul des dégâts (les dés) replié par défaut : clic pour l'ouvrir.
    if (!box.dataset.diceWired) {
      box.dataset.diceWired = '1';
      box.addEventListener('click', function (ev) {
        const row = ev.target.closest('.log-row');
        if (row && row.querySelector('.ldice')) row.classList.toggle('show-dice');
      });
    }
    // Suit automatiquement les dernières entrées.
    box.scrollTop = box.scrollHeight;
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
    combatHeroLevel = 1;
    try {
      if (sessionCtx && sessionCtx.sessionId && Store.levelInfo) {
        const ses = Store.loadSessions().find(function (s) { return s.id === sessionCtx.sessionId; });
        if (ses && ses.party) combatHeroLevel = Store.levelInfo(ses.party.xp || 0).level || 1;
      }
    } catch (e) { combatHeroLevel = 1; }
    buildCombat(heroObjs, normalizeZoneConfig(sceneCombat));
    sessionGains = null;  // les instances sont figées : on ne garde pas l'overlay
    delete Store.state.pendingCombatStates; // états de scène consommés au démarrage
    log('Début du combat — Tour 1.', 'turn');
    announceInvisibles();
    designateMarkedHero(); // PROIE : désigne la cible du Tour 1
    if (needsPretour()) startPretour();
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
    vfx: VFX, // active/désactive un effet visuel par son nom (ex. Combat.vfx.brulure = false)
  };
})(window);
