/*
 * Éditeurs du roster de héros et du bestiaire (monstres).
 * Partagent un éditeur d'attaques commun.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const esc = function (s) { return Inventory.escapeHtml(s); };

  const RANGE_LABEL = { contact: 'Contact', distance: 'Distance' };
  const MENACE_LABEL = { closest: 'Plus proche', pvLow: 'PV bas', pvHigh: 'PV haut', defLow: 'DEF basse' };
  const TYPE_LABEL = { standard: 'Sbire', solitaire: 'Solitaire', alpha: 'Alpha', boss: 'Boss' };
  const CLASSES = ['Apothicaire', 'Artificier', 'Chasseur', 'Destructeur', 'Déviant',
    'Gardien', 'Lamevent', 'Pyromane'];
  // Classes actuellement jouables (les autres existent en base mais sont cachées).
  const PLAYABLE_CLASSES = ['Destructeur', 'Gardien', 'Lamevent', 'Pyromane'];
  const SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];
  function emptySkills() { const o = {}; SKILLS.forEach(function (s) { o[s] = 0; }); return o; }
  function mergeSkills(src) {
    const o = emptySkills();
    if (src) SKILLS.forEach(function (s) { if (typeof src[s] === 'number') o[s] = src[s]; });
    return o;
  }
  // Retire le préfixe « Mêlée — » / « Distance — » des attaques dérivées d'armes
  function cleanAttackName(name) { return (name || '').replace(/^(Mêlée|Distance) — /, ''); }

  function newAttack() {
    return { name: 'Attaque', dice: D.emptyPool(), range: 'contact',
             targets: 'one', useOwnDamage: true, effects: Store.noStates(),
             uses: 0, freeAction: false };
  }

  // ---- Éditeur d'attaques (réutilisé héros + monstres) ----
  function buildAttacksEditor(container, attacks, onChange) {
    container.innerHTML = '';
    attacks.forEach(function (atk, idx) {
      if (!atk.effects) atk.effects = Store.noStates();
      const row = document.createElement('div');
      row.className = 'attack-row';
      row.innerHTML =
        '<div class="attack-row-top">' +
          '<input type="text" class="atk-name" value="' + esc(atk.name) + '" placeholder="Nom de l\'attaque" />' +
          '<select class="atk-range">' +
            '<option value="contact">Contact</option>' +
            '<option value="distance">Distance</option>' +
          '</select>' +
          '<select class="atk-targets">' +
            '<option value="one">1 cible</option>' +
            '<option value="all">Toutes</option>' +
          '</select>' +
          '<button type="button" class="icon-btn atk-del" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="atk-dice"></div>' +
        '<div class="atk-effects">' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-own"> + Dégâts</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-affaibli"> Affaibli</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-ausol"> Au sol</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-feu"> Feu</label>' +
        '</div>' +
        '<div class="atk-effects atk-usage">' +
          '<label class="checkbox inline" title="0 = illimité">Utilisations / combat <input type="number" class="atk-uses-in" min="0" style="width:60px"></label>' +
          '<label class="checkbox inline"><input type="checkbox" class="atk-free"> Ne consomme pas l\'action</label>' +
        '</div>';

      row.querySelector('.atk-range').value = atk.range;
      row.querySelector('.atk-targets').value = atk.targets;
      row.querySelector('.eff-own').checked = atk.useOwnDamage !== false;
      row.querySelector('.eff-affaibli').checked = !!atk.effects.affaibli;
      row.querySelector('.eff-ausol').checked = !!atk.effects.auSol;
      row.querySelector('.eff-feu').checked = !!atk.effects.feu;
      row.querySelector('.atk-uses-in').value = atk.uses || 0;
      row.querySelector('.atk-free').checked = !!atk.freeAction;

      Inventory.buildDiceSteppers(row.querySelector('.atk-dice'), atk.dice, onChange);

      row.querySelector('.atk-name').addEventListener('input', function (e) { atk.name = e.target.value; });
      row.querySelector('.atk-range').addEventListener('change', function (e) { atk.range = e.target.value; });
      row.querySelector('.atk-targets').addEventListener('change', function (e) { atk.targets = e.target.value; });
      row.querySelector('.eff-own').addEventListener('change', function (e) { atk.useOwnDamage = e.target.checked; });
      row.querySelector('.eff-affaibli').addEventListener('change', function (e) { atk.effects.affaibli = e.target.checked; });
      row.querySelector('.eff-ausol').addEventListener('change', function (e) { atk.effects.auSol = e.target.checked; });
      row.querySelector('.eff-feu').addEventListener('change', function (e) { atk.effects.feu = e.target.checked; });
      row.querySelector('.atk-uses-in').addEventListener('input', function (e) { atk.uses = Math.max(0, parseInt(e.target.value, 10) || 0); });
      row.querySelector('.atk-free').addEventListener('change', function (e) { atk.freeAction = e.target.checked; });
      row.querySelector('.atk-del').addEventListener('click', function () {
        const i = attacks.indexOf(atk);
        if (i >= 0) attacks.splice(i, 1);
        buildAttacksEditor(container, attacks, onChange);
        if (onChange) onChange();
      });

      container.appendChild(row);
    });
    if (!attacks.length) {
      container.innerHTML = '<p class="hint">Aucune attaque. Ajoute-en une.</p>';
    }
  }

  function attacksSummary(attacks) {
    if (!attacks || !attacks.length) return '<span class="hint">—</span>';
    return attacks.map(function (a) {
      const meta = [RANGE_LABEL[a.range] || a.range];
      if (a.multiTarget) meta.push(a.multiTarget + ' cibles / zone');
      if (a.targets === 'all') meta.push('toutes cibles');
      if (a.uses > 0) meta.push(a.uses + '×/tour');
      if (a.freeAction) meta.push('gratuite');
      return '<div class="atk-badge' + (a.generic ? ' atk-badge-talent' : '') + '">' +
        (a.generic ? '<span class="atk-badge-tag">★ Talent</span>' : '') +
        '<div class="atk-badge-line">' +
          '<span class="atk-badge-name">' + esc(cleanAttackName(a.name)) + '</span>' +
          Inventory.poolBadges(a.dice) +
        '</div>' +
        '<span class="atk-badge-meta">' + meta.join(' · ') + '</span>' +
      '</div>';
    }).join('');
  }

  // ================= AVENTURIERS =================
  let heroAttacks = [];
  let heroEquipment = { mainG: null, mainD: null, armorId: null, objectId: null };
  let heroSkills = emptySkills();
  let heroStartTalents = [];

  function skillSlug(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Compétences > 0 affichées sur la fiche (hors édition), une couleur par compétence
  function skillsSummary(skills) {
    if (!skills) return '';
    const badges = SKILLS.filter(function (s) { return (skills[s] || 0) > 0; })
      .map(function (s) { return '<span class="skill-badge skill-' + skillSlug(s) + '">' + s + ' <b>+' + skills[s] + '</b></span>'; });
    if (!badges.length) return '';
    return '<div class="roster-section"><div class="roster-label">Compétences</div>' +
      '<div class="skill-badges">' + badges.join('') + '</div></div>';
  }

  // Éditeur de compétences (steppers, base 0)
  function buildSkillsEditor(container, skills) {
    container.innerHTML = SKILLS.map(function (s) {
      return '<div class="skill-edit-row">' +
        '<span class="skill-edit-name">' + s + '</span>' +
        '<div class="skill-stepper">' +
          '<button type="button" class="step-btn sk-minus" data-skill="' + s + '">−</button>' +
          '<span class="skill-val" data-skill="' + s + '">' + (skills[s] || 0) + '</span>' +
          '<button type="button" class="step-btn sk-plus" data-skill="' + s + '">+</button>' +
        '</div>' +
      '</div>';
    }).join('');
    function setVal(s) { container.querySelector('.skill-val[data-skill="' + s + '"]').textContent = skills[s] || 0; }
    container.querySelectorAll('.sk-plus').forEach(function (b) {
      b.onclick = function () { const s = b.getAttribute('data-skill'); skills[s] = (skills[s] || 0) + 1; setVal(s); };
    });
    container.querySelectorAll('.sk-minus').forEach(function (b) {
      b.onclick = function () { const s = b.getAttribute('data-skill'); skills[s] = Math.max(0, (skills[s] || 0) - 1); setVal(s); };
    });
  }

  // Bonus de PV conféré par la classe
  const CLASS_PV = {
    'Déviant': 10, 'Apothicaire': 12, 'Artificier': 14, 'Chasseur': 16,
    'Destructeur': 16, 'Gardien': 18, 'Lamevent': 14, 'Pyromane': 10,
  };
  function classPv(h) { return CLASS_PV[h.klass] || 0; }
  function heroPv(h) { return Math.max(1, (h.vie || 0) * (h.endu || 0) + (h.pvBonus || 0) + classPv(h)); }
  // PV courants persistants (null/absent = pleins)
  function heroCurPv(h) {
    const m = heroPv(h);
    return (typeof h.pv === 'number') ? Math.max(0, Math.min(m, h.pv)) : m;
  }
  // Vignette de la caractéristique VIE : VIE actuelle / VIE max
  // Seule la valeur actuelle passe en rouge quand réduite par un coma ; le max reste neutre.
  function vieStatHtml(dh) {
    const cur = dh.vie || 0;
    const max = (typeof dh.maxVie === 'number') ? dh.maxVie : cur;
    const curHtml = cur < max
      ? '<span class="hs-val-cur--danger">' + cur + '</span>'
      : cur;
    return '<div class="hero-stat"><span class="hs-label">Vie</span><span class="hs-val">' +
      curHtml + '<span class="hs-val-sep">/' + max + '</span></span></div>';
  }
  // Vignette des Points de Vie : affiche le max (la valeur courante de session est
  // dans la barre PV de renderHeroesState ; ici on n'a pas de contexte de session fiable).
  function pvStatHtml(dh) {
    return '<div class="hero-stat"><span class="hs-label">Points de Vie</span><span class="hs-val">' +
      heroPv(dh) + '</span></div>';
  }
  // Repos court : Endu × 🟩 (somme de dés). Repos long : tout au max.
  function heroRestShort() {
    const lines = [];
    Store.state.heroes.forEach(function (h) {
      const m = heroPv(h), cur = heroCurPv(h), n = Math.max(1, h.endu || 1);
      let heal = 0; const rolls = [];
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(v); heal += v; }
      h.pv = Math.min(m, cur + heal);
      lines.push(h.name + ' : +' + (h.pv - cur) + ' PV (' + rolls.join('+') + ' = ' + heal + ')');
    });
    Store.save();
    return lines;
  }
  function heroRestLong() {
    Store.state.heroes.forEach(function (h) { h.pv = heroPv(h); });
    Store.save();
  }
  function itemById(id) { return Store.state.items.find(function (i) { return i.id === id; }); }

  // Modèle d'équipement à 4 emplacements : main gauche / droite, armure, objet.
  // Compatibilité ascendante avec l'ancien modèle (weapons[] + armorId + shieldId).
  function normalizeEquip(eq) {
    eq = eq || {};
    if (eq.mainG !== undefined || eq.mainD !== undefined || eq.objectId !== undefined) {
      return { mainG: eq.mainG || null, mainD: eq.mainD || null, armorId: eq.armorId || null, objectId: eq.objectId || null, twoH: !!eq.twoH };
    }
    const w = eq.weapons || [];
    return { mainD: w[0] || null, mainG: w[1] || (eq.shieldId || null), armorId: eq.armorId || null, objectId: null, twoH: false };
  }

  // Tout l'équipement porté (armes + armure + objet), modèle normalisé
  function heroGear(h) {
    const e = normalizeEquip((h && h.equipment) || {});
    return [e.mainG, e.mainD, e.armorId, e.objectId].map(itemById).filter(Boolean);
  }

  function heroWeapons(eq) {
    const e = normalizeEquip(eq);
    return [e.mainG, e.mainD].map(itemById).filter(function (i) { return i && i.category === 'weapon'; });
  }

  // DEF : armure équipée + bouclier porté en main (objet de catégorie armure, emplacement bouclier).
  function heroDef(h) {
    const e = normalizeEquip(h.equipment || {});
    const armor = e.armorId ? itemById(e.armorId) : null;
    let def = (armor && armor.category === 'armor') ? (armor.def || 0) : 0;
    [e.mainG, e.mainD].forEach(function (id) {
      const it = id ? itemById(id) : null;
      if (it && it.category === 'armor') def += (it.def || 0);
    });
    return def;
  }

  // Slug CSS pour la couleur pastel de classe (retire les accents)
  function classSlug(k) {
    return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Attaques dérivées d'une liste d'armes (mêlée / distance, dés cumulés, effets de traits)
  function weaponAttacks(weapons) {
    const groups = { contact: [], distance: [] };
    weapons.forEach(function (w) { (w.ranged ? groups.distance : groups.contact).push(w); });
    const atks = [];
    ['contact', 'distance'].forEach(function (range) {
      const ws = groups[range];
      if (!ws.length) return;
      const pool = D.addPools.apply(null, ws.map(function (w) { return w.dice; }));
      if (!D.poolCount(pool)) return;
      const traits = {};
      ws.forEach(function (w) { (w.traits || []).forEach(function (t) { traits[t] = true; }); });
      atks.push({
        name: ws.map(function (w) { return w.name; }).join(' + '),
        dice: pool, range: range, targets: 'one', useOwnDamage: true,
        effects: Store.noStates(), vicieuse: !!traits.vicieuse, jetable: !!traits.jetable,
      });
    });
    return atks;
  }

  // Attaques dérivées des armes équipées d'un aventurier
  function heroDerivedAttacks(eq) {
    return weaponAttacks(heroWeapons(eq));
  }

  // ----- Adversaires : équipement → attaques & DEF -----
  function monsterEquipItems(m) {
    return (m.equipment || []).map(function (r) { return itemById(r.itemId); }).filter(Boolean);
  }
  function monsterCombatAttacks(m) {
    const weapons = monsterEquipItems(m).filter(function (it) { return it.category === 'weapon'; });
    // Les attaques d'adversaire occupent la colonne « Action » (comme l'arme des
    // aventuriers) — pas les emplacements Talents, désormais réservés à m.talents.
    const own = JSON.parse(JSON.stringify(m.attacks || []));
    return weaponAttacks(weapons).concat(own);
  }
  // Libellés des talents passifs d'un adversaire (FUYARD, SOUTIEN…) pour le bandeau.
  function monsterTalentLabels(m) {
    const cat = Store.loadMonsterTalents();
    return (m.talents || []).map(function (t) {
      const e = cat.find(function (c) { return c.id === t.catId; }) ||
                cat.find(function (c) { return c.trigger === t.trigger; });
      return e ? e.name : (t.trigger || 'Talent');
    });
  }
  function monsterTotalDef(m) {
    const armorDef = monsterEquipItems(m).filter(function (it) { return it.category === 'armor'; })
      .reduce(function (s, a) { return s + (a.def || 0); }, 0);
    return (m.def || 0) + armorDef;
  }

  // Niveau du groupe (XP partagée) — détermine les talents génériques débloqués
  function heroGroupLevel() {
    return Store.levelInfo((Store.state.party && Store.state.party.xp) || 0).level;
  }

  // Résout les talents d'un aventurier en objets complets (fusion avec la
  // bibliothèque des effets : kind, val). chosenIds = liste choisie aux montées
  // de niveau ; null (mode Admin) → tous les talents jusqu'au niveau du groupe.
  function resolveHeroTalents(chosenIds) {
    const cat = Store.talentEffectMap();
    const out = [];
    // Talents génériques + talents de toutes les classes (un aventurier peut équiper
    // un talent de sa classe : il doit donc être résolu pour le bandeau de combat).
    const all = Store.loadGenericTalents().slice();
    Store.loadClasses().forEach(function (c) { if (Array.isArray(c.talents)) all.push.apply(all, c.talents); });
    // Talents retenus pour ce combattant.
    const kept = all.filter(function (t) {
      if (!(t.usage === 'combat' || t.usage === 'both')) return false;
      if (!Store.talentEffectList(t).length) return false;
      if (Array.isArray(chosenIds)) return chosenIds.indexOf(t.id) >= 0;
      return (t.level || 1) <= heroGroupLevel();
    });
    // ARBORESCENCE : si une version supérieure (prereq = X) est présente, on masque
    // la version précédente X — seule la plus évoluée agit en combat.
    const supersededIds = {};
    kept.forEach(function (t) { if (t.prereq) supersededIds[t.prereq] = true; });
    kept.filter(function (t) { return !supersededIds[t.id]; }).forEach(function (t) {
      const list = Store.talentEffectList(t);
      // Un talent peut cumuler plusieurs effets : on aplatit en une entrée par effet.
      list.forEach(function (e) {
        const c = cat[e.effect] || {};
        out.push({
          id: t.id, name: t.name, effect: e.effect,
          kind: c.kind || 'passive',
          val: (typeof e.val === 'number') ? e.val : (c.defaultVal || 0),
          dice: e.dice || null,
          range: e.range || null,
          choice: e.choice || null,
          scope: e.scope || 'count', // 'count' | 'zone' | 'all'
        });
      });
    });
    return out;
  }

  // Traduit les talents de type ACTION en attaques spéciales jouables.
  function talentActionAttacks(weaponAtks, talents) {
    const base = weaponAtks[0] || null;
    function baseDice() { return base ? Object.assign(D.emptyPool(), base.dice) : Object.assign(D.emptyPool(), { white: 1 }); }
    function baseRange() { return base ? base.range : 'contact'; }
    // Cumul : plusieurs talents partageant le même effet d'action s'empilent en
    // UNE seule attaque (val sommées ; dés/portée hérités du 1er qui les définit).
    // Un talent de niveau supérieur peut ainsi renforcer un talent existant
    // (ex. « +1 Orbe de Feu » s'ajoute à l'effet de base).
    const merged = {}; const order = [];
    talents.filter(function (t) { return t.kind === 'action'; }).forEach(function (t) {
      if (!merged[t.effect]) {
        merged[t.effect] = { id: t.id, name: t.name, effect: t.effect, kind: 'action',
          val: 0, dice: null, range: null, choice: t.choice || null, scope: t.scope || 'count' };
        order.push(t.effect);
      }
      const m = merged[t.effect];
      m.val += (t.val || 0);
      if (!m.dice && t.dice) m.dice = t.dice;
      if (!m.range && t.range) m.range = t.range;
      if (t.scope && t.scope !== 'count') m.scope = t.scope;
    });
    return order.map(function (eff) {
      const t = merged[eff];
      const common = { name: t.name, special: true, generic: true, talentId: t.id,
        genericEffect: t.effect, useOwnDamage: true, targets: 'one',
        dice: baseDice(), range: baseRange(), effects: Store.noStates() };
      switch (t.effect) {
        case 'double_attaque':
          if (t.scope === 'zone') return Object.assign(common, { targets: 'all', zoneOnly: true });
          if (t.scope === 'all') return Object.assign(common, { targets: 'all' });
          return Object.assign(common, { multiTarget: Math.max(2, t.val || 2), sameZone: true });
        case 'salve_zone': {
          const dist = t.range === 'distance';
          const sdice = t.dice ? Object.assign(D.emptyPool(), t.dice) : Object.assign(D.emptyPool(), { white: 2 });
          if (t.scope === 'zone') return Object.assign(common, { useOwnDamage: true, dice: sdice, targets: 'all', zoneOnly: true, range: dist ? 'distance' : 'contact' });
          if (t.scope === 'all') return Object.assign(common, { useOwnDamage: true, dice: sdice, targets: 'all', range: dist ? 'distance' : 'contact' });
          return Object.assign(common, {
            useOwnDamage: true, dice: sdice,
            multiTarget: Math.max(1, t.val || 2), sameZone: true,
            range: dist ? 'distance' : 'contact',
          });
        }
        case 'assaut_mobile':
          return Object.assign(common, { range: baseRange(), freeMove: true });
        case 'action_mouvement':
          // Action pure de déplacement : pas d'attaque, juste un mouvement.
          return Object.assign(common, { moveAction: true, targets: 'self', useOwnDamage: false });
        case 'rebond':
          // Octroie 2 mouvements gratuits ; n'utilise pas l'action (l'attaque suivra).
          return Object.assign(common, { rebondAction: true, freeAction: true, targets: 'self', useOwnDamage: false });
        case 'soin_fixe':
        case 'soin_endu':
        case 'soin_des':
          return Object.assign(common, { selfHeal: t.effect, healVal: t.val || 0, targets: 'self' });
        case 'frappe_puissante':
          return Object.assign(common, { range: 'contact', bonusDmg: t.val || 0 });
        case 'coup_renversant':
          return Object.assign(common, { range: 'contact', effects: Object.assign(Store.noStates(), { auSol: true }) });
        case 'attaque_affaiblissante':
          return Object.assign(common, { effects: Object.assign(Store.noStates(), { affaibli: true }) });
        case 'attaque_enflammee':
          return Object.assign(common, { range: 'contact', effects: Object.assign(Store.noStates(), { feu: true }) });
        case 'frappe_tournoyante':
          return Object.assign(common, { range: 'contact', targets: 'all', zoneOnly: true });
        case 'tir_charge':
          return Object.assign(common, { range: 'distance', bonusDmg: t.val || 0 });
        default:
          return null;
      }
    }).filter(Boolean);
  }

  // Applique les talents d'AMÉLIORATION aux attaques d'arme (états ajoutés sur frappe).
  function applyUpgrades(atks, talents) {
    talents.filter(function (t) { return t.kind === 'upgrade'; }).forEach(function (t) {
      atks.forEach(function (a) {
        if (!a.effects) a.effects = Store.noStates();
        if (t.effect === 'arme_enflammee' && a.range === 'contact') a.effects.feu = true;
        if (t.effect === 'arme_affaiblissante') a.effects.affaibli = true;
        if (t.effect === 'perce_blindage') a.ignoreBlindage = true;
        if (t.effect === 'bourreau_rapides') a.doubleVsRapide = true;
      });
    });
  }

  // Attaques utilisées en combat : armes (+ améliorations) + spéciales (+ secours mains nues) + actions de talent
  function heroCombatAttacks(h) {
    const weapon = heroDerivedAttacks(h.equipment);
    const special = JSON.parse(JSON.stringify(h.attacks || [])).map(function (a) { a.special = true; return a; });
    let atks = weapon.concat(special);
    if (!atks.length) {
      atks = [{ name: 'Mains nues', dice: Object.assign(D.emptyPool(), { white: 1 }),
        range: 'contact', targets: 'one', useOwnDamage: true, effects: Store.noStates() }];
    }
    const chosen = Array.isArray(h.chosenTalents) ? h.chosenTalents : null;
    const talents = resolveHeroTalents(chosen);
    applyUpgrades(atks, talents);
    return atks.concat(talentActionAttacks(weapon.length ? weapon : atks, talents));
  }

  // ---- Progression du groupe (XP / niveaux) ----
  function isPlayerMode() {
    return (global.Shell && Shell.getMode && Shell.getMode() === 'player');
  }

  function renderProgress() {
    const root = $('#progress-root');
    if (!root) return;
    const player = isPlayerMode();
    // Côté Joueur, l'XP affichée est celle de la partie en cours (décorrélée de l'XP Admin)
    const xpVal = (player && global.Session && Session.activePartyXp) ? Session.activePartyXp() : Store.state.party.xp;
    const info = Store.levelInfo(xpVal);
    const nextTxt = info.next
      ? 'Niveau ' + info.next.lvl + ' dans <b>' + info.toNext + '</b> XP'
      : 'Niveau max atteint';
    // La barre (niveau, XP, XP manquante) est toujours visible ;
    // seuls les boutons de MODIFICATION sont masqués côté Joueur.
    root.innerHTML =
      '<div class="progress-card">' +
        '<div class="progress-top">' +
          '<div class="level-badge"><span class="lvl-num">' + info.level + '</span><span class="lvl-lbl">Niveau</span></div>' +
          '<div class="progress-info">' +
            '<div class="pi-line"><span>✦ <b>' + info.xp + '</b> XP' + (player ? '' : ' partagée') + '</span></div>' +
            '<div class="xp-bar"><div class="xp-fill" style="width:' + info.pct + '%"></div></div>' +
            '<div class="pi-line" style="margin-top:.4rem;color:var(--muted)"><span>' + nextTxt + '</span></div>' +
          '</div>' +
        '</div>' +
        (player ? '' :
        '<div class="progress-actions">' +
          '<div class="level-control">' +
            '<button class="ghost lvl-btn" data-lvl="-1">− Niveau</button>' +
            '<select id="level-select" class="level-select">' +
              [1, 2, 3, 4, 5, 6, 7].map(function (n) {
                return '<option value="' + n + '"' + (n === info.level ? ' selected' : '') + '>Niveau ' + n + '</option>';
              }).join('') +
            '</select>' +
            '<button class="ghost lvl-btn" data-lvl="1">Niveau +</button>' +
          '</div>' +
          '<span class="prog-sep"></span>' +
          '<span class="hint">XP :</span>' +
          '<button class="ghost small" data-xp="-10">−10</button>' +
          '<button class="ghost small" data-xp="-1">−1</button>' +
          '<button class="ghost small" data-xp="1">+1</button>' +
          '<button class="ghost small" data-xp="10">+10</button>' +
          '<button class="ghost small" data-xp="50">+50</button>' +
          '<button class="ghost small" id="xp-reset">Réinitialiser</button>' +
        '</div>') +
      '</div>';
    if (player) return; // pas de câblage des boutons d'édition
    const lsel = $('#level-select');
    if (lsel) lsel.addEventListener('change', function () { setLevel(parseInt(lsel.value, 10)); });
    root.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () {
        setLevel(Store.levelInfo(Store.state.party.xp).level + parseInt(b.getAttribute('data-lvl'), 10));
      });
    });
    root.querySelectorAll('[data-xp]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.state.party.xp = Math.max(0, (Store.state.party.xp || 0) + parseInt(b.getAttribute('data-xp'), 10));
        Store.save(); renderProgress();
      });
    });
    const rst = $('#xp-reset');
    if (rst) rst.addEventListener('click', function () {
      if (confirm('Réinitialiser l\'XP du groupe à 0 ?')) { Store.state.party.xp = 0; Store.save(); renderProgress(); }
    });
  }

  function setLevel(lvl) {
    Store.state.party.xp = Store.xpForLevel(lvl);
    Store.save(); renderProgress();
  }

  // ---- Portée des aventuriers (Joueur = liés à l'aventure, Admin = pré-construits) ----
  function scope() {
    const mode = (global.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const advId = (global.Shell && Shell.getAdventureId) ? Shell.getAdventureId() : null;
    return { mode: mode, advId: advId };
  }
  function adventureHeroes(advId) {
    return Store.state.heroes.filter(function (h) { return h.adventureId === advId; });
  }
  function prebuiltHeroes() {
    return Store.state.heroes.filter(function (h) { return !h.adventureId; });
  }
  function scopedHeroes() {
    const s = scope();
    return s.mode === 'player' ? adventureHeroes(s.advId) : prebuiltHeroes();
  }

  // Carte d'aventurier réutilisable (même design que l'onglet Groupe).
  // opts : { selectable, checked } pour la sélection de groupe.
  function defIcon(val) {
    if (val >= 1 && val <= 6) return '<img class="def-img" src="assets/DEF ' + val + '.png" alt="DEF ' + val + '">';
    return '<span class="def-shield">' + val + '</span>';
  }

  function heroCardHtml(h, opts) {
    opts = opts || {};
    const dh = displayHero(h);
    const def = heroDef(h);
    const initials = (h.name || '?').trim().slice(0, 2).toUpperCase();
    const avatarStyle = h.imageUrl
      ? 'background-image:url(' + JSON.stringify(h.imageUrl) + ');background-size:cover;background-position:center;font-size:0;color:transparent'
      : '';
    return '<div class="roster-card hero-card' + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '">' +
      '<div class="roster-head hero-head">' +
        (opts.selectable ? '<input type="checkbox" class="hero-pick-cb" data-hero="' + h.id + '"' + (opts.checked ? ' checked' : '') + '>' : '') +
        (opts.showAvatar ? '<div class="hpc-avatar" style="' + avatarStyle + '">' + esc(initials) + '</div>' : '') +
        '<span class="roster-name">' + esc(h.name) + '</span>' +
        (h.klass ? '<span class="class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
        (!opts.hideRapide && h.rapide ? '<span class="tag">Rapide</span>' : '') +
      '</div>' +
      '<div class="hero-stat-row">' +
        vieStatHtml(dh) +
        '<div class="hero-stat"><span class="hs-label">Endurance</span><span class="hs-val">' + (dh.endu || 0) + '</span></div>' +
        pvStatHtml(dh) +
        '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + (opts.defAsIcon ? defIcon(def) : def) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + dh.damage + '</span></div>' +
      '</div>' +
      '<div class="roster-section atk-section"><div class="roster-label">Attaques</div>' +
        '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(dh)) + '</div></div>' +
      skillsSummary(h.skills) +
      (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '') +
    '</div>';
  }

  function renderHeroes() {
    renderProgress();
    const s = scope();
    const player = s.mode === 'player';
    const titleEl = $('#heroes-title');
    if (titleEl) titleEl.textContent = player ? 'Votre groupe' : 'Aventuriers pré-construits';
    const hintEl = $('#heroes-hint');
    if (hintEl) hintEl.textContent = player
      ? 'Les membres engagés dans l\'aventure en cours. Le groupe se constitue au lancement de l\'aventure.'
      : 'Aventuriers modèles, réutilisables par les joueurs via « + Aventurier Pré-Construit ».';
    // En mode Joueur, le groupe (création/ajout) se fait sur l'écran de lancement
    // de l'aventure : ces boutons n'apparaissent que côté MJ.
    const addBtn = $('#btn-add-hero');
    if (addBtn) addBtn.hidden = player;
    const preBtn = $('#btn-add-prebuilt');
    if (preBtn) preBtn.hidden = true;
    const list = $('#hero-list');
    let heroes = scopedHeroes();
    // Onglet Groupe (Joueur) : vide tant que l'aventure n'est pas lancée ; sinon,
    // seuls les aventuriers engagés dans la partie active s'affichent.
    if (player) {
      const engaged = (global.Session && Session.engagedHeroIds) ? Session.engagedHeroIds() : null;
      if (!engaged) {
        list.innerHTML = '<p class="empty">Le groupe s\'affiche une fois l\'aventure lancée. ' +
          'Constitue-le et clique sur « Commencer l\'aventure » dans l\'onglet Aventure.</p>';
        return;
      }
      heroes = heroes.filter(function (h) { return engaged.indexOf(h.id) >= 0; });
    }
    if (!heroes.length) {
      list.innerHTML = '<p class="empty">Aucun aventurier. Clique sur « + Nouvel Aventurier ».</p>';
      return;
    }
    list.innerHTML = heroes.map(function (h) {
      const dh = displayHero(h);
      const gear = heroGear(h).map(function (it) { return it.name; });
      return '<div class="roster-card hero-card' + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '">' +
        '<div class="roster-head hero-head">' +
          '<span class="roster-name">' + esc(h.name) + '</span>' +
          (h.klass ? '<span class="class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
          (h.rapide ? '<span class="tag">Rapide</span>' : '') +
          (player ? '' : '<button class="ghost small" data-edit-hero="' + h.id + '">Éditer</button>') +
          '<button class="ghost small del-btn" data-del-hero="' + h.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="hero-stat-row">' +
          vieStatHtml(dh) +
          '<div class="hero-stat"><span class="hs-label">Endurance</span><span class="hs-val">' + (dh.endu || 0) + '</span></div>' +
          pvStatHtml(dh) +
          '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(h) + '</span></div>' +
          '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + dh.damage + '</span></div>' +
        '</div>' +
        // En mode Joueur : ni équipement, ni attaques, ni talents (consultables dans
        // leurs onglets dédiés). On n'affiche que les caractéristiques et compétences.
        (player ? '' :
          '<div class="roster-section">' +
            '<div class="roster-label">Équipement</div>' +
            '<div class="roster-gear">' + (gear.length ? esc(gear.join(' · ')) : '<span class="hint">aucun</span>') + '</div>' +
          '</div>' +
          '<div class="roster-section">' +
            '<div class="roster-label">Attaques</div>' +
            '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(dh)) + '</div>' +
          '</div>') +
        skillsSummary(h.skills) +
        (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-hero]').forEach(function (b) {
      b.addEventListener('click', function () { openHeroModal(b.getAttribute('data-edit-hero')); });
    });
    list.querySelectorAll('[data-sheet-hero]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openHeroSheet(card.getAttribute('data-sheet-hero'));
      });
    });
    list.querySelectorAll('[data-del-hero]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-del-hero');
        const h = Store.state.heroes.find(function (x) { return x.id === id; });
        if (!h) return;
        if (!confirm('Supprimer l\'aventurier « ' + h.name + ' » ?')) return;
        Store.state.heroes = Store.state.heroes.filter(function (x) { return x.id !== id; });
        Store.save(); renderHeroes();
      });
    });
  }

  // Fiche d'aventurier en lecture seule (ouverte depuis la narration)
  // En mode Joueur, on reflète les gains de niveau + talents choisis de la partie.
  // Sans session active (onglet Groupe avant de jouer), on renvoie tout de même
  // un héros avec chosenTalents: [] pour que les talents non débloqués restent masqués.
  function displayHero(h) {
    if (!isPlayerMode()) return h;
    let dh = (global.Session && Session.effectiveHero) ? Session.effectiveHero(h) : h;
    // En mode Joueur, un aventurier ne possède QUE les talents explicitement choisis.
    // Sans choix (ou hors session), on force la liste vide pour ne pas retomber sur
    // le fallback « niveau de groupe » (qui afficherait des talents non débloqués).
    if (!Array.isArray(dh.chosenTalents)) dh = Object.assign({}, dh, { chosenTalents: [] });
    return dh;
  }
  function heroSheetHtml(h) {
    const dh = displayHero(h);
    const e = normalizeEquip(h.equipment);
    const gear = [e.mainG, e.mainD, e.armorId, e.objectId].map(itemById).filter(Boolean).map(function (it) { return it.name; });
    return '<div class="hero-stat-row">' +
        vieStatHtml(dh) +
        pvStatHtml(dh) +
        '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(dh) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + dh.damage + '</span></div>' +
      '</div>' +
      '<div class="roster-section"><div class="roster-label">Équipement</div>' +
        '<div class="roster-gear">' + (gear.length ? esc(gear.join(' · ')) : '<span class="hint">aucun</span>') + '</div></div>' +
      '<div class="roster-section"><div class="roster-label">Attaques</div>' +
        '<div class="atk-badges">' + sheetWeaponAttacks(heroCombatAttacks(dh)) + '</div></div>' +
      talentSection(dh) +
      skillsSummary(h.skills) +
      (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '');
  }
  // Attaques d'arme sur la feuille de perso : nom + dés de dégâts alignés à droite,
  // sans le type (contact/distance) ni les bonus. Les talents sont listés à part.
  function sheetWeaponAttacks(attacks) {
    const weap = (attacks || []).filter(function (a) { return !a.generic; });
    if (!weap.length) return '<span class="hint">—</span>';
    return weap.map(function (a) {
      return '<div class="atk-badge atk-badge-weapon">' +
        '<span class="atk-badge-name">' + esc(cleanAttackName(a.name)) + '</span>' +
        '<span class="atk-badge-dice">' + Inventory.poolBadges(a.dice) + '</span>' +
      '</div>';
    }).join('');
  }
  // Section « Talents » de la fiche : badges colorés par type (Action/Réaction/Passif/Amélioration)
  const KIND_BADGE = { action: 'Action', reaction: 'Réaction', passive: 'Passif', upgrade: 'Amélior.', mastery: 'Maîtrise' };
  function talentSection(dh) {
    const resolved = resolveHeroTalents(Array.isArray(dh.chosenTalents) ? dh.chosenTalents : null);
    if (!resolved.length) return '';
    // Un talent multi-effets n'apparaît qu'une fois : on cumule ses types.
    const byId = {}; const order = [];
    resolved.forEach(function (t) {
      if (!byId[t.id]) { byId[t.id] = { name: t.name, kinds: [] }; order.push(t.id); }
      if (byId[t.id].kinds.indexOf(t.kind) < 0) byId[t.id].kinds.push(t.kind);
    });
    const badges = order.map(function (id) {
      const t = byId[id];
      const primary = t.kinds[0] || 'passive';
      const kindTxt = t.kinds.map(function (k) { return KIND_BADGE[k] || 'Talent'; }).join(' · ');
      return '<span class="tl-badge tl-kind-' + primary + '" title="' + esc(t.name) + '">' +
        esc(t.name) + ' <span class="tl-badge-kind">' + esc(kindTxt) + '</span></span>';
    }).join('');
    return '<div class="roster-section"><div class="roster-label">Talents</div>' +
      '<div class="tl-badges">' + badges + '</div></div>';
  }
  function openHeroSheet(id) {
    const h = Store.state.heroes.find(function (x) { return x.id === id; });
    if (!h) return;
    $('#hero-sheet-title').textContent = h.name;
    // Classe affichée dans l'en-tête, alignée à droite (à côté de la croix)
    const clsEl = $('#hero-sheet-class');
    if (clsEl) {
      clsEl.hidden = !h.klass;
      clsEl.textContent = h.klass || '';
      clsEl.className = 'sheet-class-head class-badge' + (h.klass ? ' klass-' + classSlug(h.klass) : '');
    }
    // Carte aux couleurs de la classe, comme dans l'onglet Aventuriers
    $('#hero-sheet-body').innerHTML =
      '<div class="roster-card hero-card hero-sheet-card' + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '">' +
        heroSheetHtml(h) +
      '</div>';
    $('#hero-sheet-modal').hidden = false;
  }

  function updateHeroPvPreview() {
    const cBonus = CLASS_PV[$('#h-class').value] || 0;
    $('#h-pv-preview').textContent = Math.max(1,
      (parseInt($('#h-vie').value, 10) || 0) * (parseInt($('#h-endu').value, 10) || 0) +
      (parseInt($('#h-pvbonus').value, 10) || 0) + cBonus);
  }

  // ----- Assistant de création (mode Joueur) : Nom → Classe → Équipement → Compétences -----
  let wiz = null;
  const WIZ_STEPS = ['Nom', 'Classe', 'Caractéristiques', 'Équipement', 'Talents', 'Compétences'];
  function openHeroWizard(advId) {
    wiz = { advId: advId, step: 0, name: '', klass: '', statBonuses: { vie: 0, endu: 0, damage: 0 }, statClicks: 0, equipCombo: null, equipment: { mainG: null, mainD: null, armorId: null, objectId: null }, talents: [], skills: {} };
    $('#hero-wizard-modal').hidden = false;
    renderWizard();
  }
  // Talents de niveau 1 disponibles à la création : génériques + classe choisie
  function level1Talents(klass) {
    const gens = Store.loadGenericTalents().filter(function (t) { return (t.level || 1) <= 1; });
    let cls = [];
    const c = Store.loadClasses().find(function (x) { return x.name === klass; });
    if (c && Array.isArray(c.talents)) cls = c.talents.filter(function (t) { return t.id && (t.level || 1) <= 1; });
    return gens.concat(cls);
  }
  function wizTalentKind(t) {
    if (t.kind) return t.kind;
    const list = Store.talentEffectList(t);
    const m = Store.talentEffectMap();
    if (list.length && m[list[0].effect]) return m[list[0].effect].kind;
    return '';
  }
  function updateWizNav() {
    let ok = true;
    const step = WIZ_STEPS[wiz.step];
    if (step === 'Nom') ok = !!wiz.name.trim();
    else if (step === 'Classe') ok = !!wiz.klass;
    else if (step === 'Caractéristiques') ok = wiz.statClicks === 3;
    else if (step === 'Équipement') ok = !!wiz.equipCombo;
    else if (step === 'Compétences') ok = wizSkillTotal() === 3;
    const nb = $('#hw-next'); if (nb) nb.disabled = !ok;
  }
  function wizSkillTotal() {
    let n = 0; SKILLS.forEach(function (s) { n += wiz.skills[s] || 0; }); return n;
  }
  // Combinaisons d'armes de départ proposées à la création (mappées par nom d'objet)
  const START_COMBOS = [
    { id: 'dual',   label: 'Agressif au contact',  desc: 'Vous infligez de lourds dégâts dans la zone de vos adversaires.', names: ['épée courte', 'épée courte'] },
    { id: 'shield', label: 'Défensif au contact',  desc: 'Vous encaissez davantage les attaques de vos adversaires.', names: ['épée courte', 'bouclier'] },
    { id: 'bow',    label: 'Agressif à distance',  desc: 'Vous infligez des dégâts médians sans entrer dans la zone de vos adversaires. Attention, effectuer une Attaque à Distance dans la zone d\'un adversaire déclenche une Attaque d\'Opportunité de sa part !', names: ['arc court'] },
  ];
  function normName(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function findItemByName(name) {
    const t = normName(name);
    return Store.state.items.find(function (i) { return normName(i.name) === t; })
        || Store.state.items.find(function (i) { return normName(i.name).indexOf(t) >= 0; }) || null;
  }
  // Traduit une combinaison en équipement {mainD, mainG}
  function comboToEquip(comboId) {
    const eq = { mainG: null, mainD: null, armorId: null, objectId: null };
    const combo = START_COMBOS.find(function (c) { return c.id === comboId; });
    if (!combo) return eq;
    const a = findItemByName(combo.names[0]);
    if (a) eq.mainD = a.id;
    if (combo.names[1]) { const b = findItemByName(combo.names[1]); if (b) eq.mainG = b.id; }
    return eq;
  }
  function renderWizard() {
    const body = $('#hw-body');
    $('#hw-steps').innerHTML = WIZ_STEPS.map(function (s, i) {
      return '<span class="hw-step' + (i === wiz.step ? ' active' : '') + (i < wiz.step ? ' done' : '') + '">' + (i + 1) + '. ' + s + '</span>';
    }).join('');
    const stepName = WIZ_STEPS[wiz.step];
    if (stepName === 'Nom') {
      body.innerHTML = '<label>Nom de l\'aventurier<input type="text" id="hw-name" value="' + esc(wiz.name) + '" placeholder="Son nom…" /></label>';
      const inp = $('#hw-name');
      inp.oninput = function () { wiz.name = this.value; updateWizNav(); };
      setTimeout(function () { inp.focus(); }, 0);
    } else if (stepName === 'Classe') {
      const classes = Store.loadClasses().filter(function (c) { return PLAYABLE_CLASSES.indexOf(c.name) >= 0; });
      body.innerHTML = '<p class="hint">Choisis une classe.</p><div class="hw-class-list">' +
        (classes.length ? classes.map(function (c) {
          return '<button type="button" class="hw-class klass-' + classSlug(c.name) + (wiz.klass === c.name ? ' selected' : '') + '" data-class="' + esc(c.name) + '">' +
            '<span class="hw-class-name">' + esc(c.name) + '</span><span class="hw-class-pv">PV +' + (CLASS_PV[c.name] || 0) + '</span></button>';
        }).join('') : '<p class="empty">Aucune classe définie.</p>') + '</div>';
      body.querySelectorAll('.hw-class').forEach(function (b) {
        b.onclick = function () { wiz.klass = this.getAttribute('data-class'); renderWizard(); };
      });
    } else if (stepName === 'Caractéristiques') {
      const classPvBonus = CLASS_PV[wiz.klass] || 0;
      const vie = 3 + wiz.statBonuses.vie;
      const endu = 0 + wiz.statBonuses.endu;
      const dmg = 0 + wiz.statBonuses.damage;
      const pv = Math.max(1, vie * endu + classPvBonus);
      const rem = 3 - wiz.statClicks;
      // Une ligne par caractéristique avec boutons − / + (modifiables jusqu'à validation)
      function statRow(stat, label, step, cur, bonus) {
        const canInc = rem > 0;
        const canDec = bonus > 0;
        return '<div class="hw-stat-row2 hw-stat-row2--' + stat + '">' +
          '<span class="hw-stat-label2">' + label + '</span>' +
          '<div class="hw-stat-ctrl">' +
            '<button type="button" class="hw-stat-pm" data-stat="' + stat + '" data-dir="-1"' + (canDec ? '' : ' disabled') + '>−</button>' +
            '<span class="hw-stat-cur2">' + cur + '</span>' +
            '<button type="button" class="hw-stat-pm" data-stat="' + stat + '" data-dir="1"' + (canInc ? '' : ' disabled') + '>+</button>' +
          '</div>' +
        '</div>';
      }
      body.innerHTML =
        '<p class="hint">Répartis tes <b>3 points</b> entre les caractéristiques (tu peux ajuster avant de valider). ' +
        '<b>' + rem + '</b> point' + (rem > 1 ? 's' : '') + ' restant' + (rem > 1 ? 's' : '') + '.</p>' +
        '<div class="hw-stat-list2">' +
          statRow('damage', 'DÉGÂTS <small>(+1 / point)</small>', 1, dmg, wiz.statBonuses.damage) +
          '<p class="hw-stat-desc">Augmente les dégâts infligés par toutes vos attaques de <b>+' + dmg + '</b>.</p>' +
          statRow('endu', 'ENDURANCE <small>(+2 / point)</small>', 2, endu, wiz.statBonuses.endu) +
          '<p class="hw-stat-desc">Augmente vos PV, votre résistance et vos soins.</p>' +
          statRow('vie', 'VIE <small>(+1 / point)</small>', 1, vie, wiz.statBonuses.vie) +
          '<p class="hw-stat-desc">Augmente vos PV et votre survie. À chaque coma, vous perdez 1 VIE. Si votre VIE tombe à 0, votre aventurier meurt.</p>' +
        '</div>' +
        '<div class="hw-pv-formula">' +
          '<span class="hw-pv-term hw-pv-endu">ENDU ' + endu + '</span>' +
          '<span class="hw-pv-op">×</span>' +
          '<span class="hw-pv-term hw-pv-vie">VIE ' + vie + '</span>' +
          (classPvBonus ? '<span class="hw-pv-op">+</span><span class="hw-pv-term hw-pv-cls">Classe ' + classPvBonus + '</span>' : '') +
          '<span class="hw-pv-op">=</span>' +
          '<span class="hw-pv-term hw-pv-total">PV ' + pv + '</span>' +
        '</div>';
      body.querySelectorAll('.hw-stat-pm').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const stat = btn.getAttribute('data-stat');
          const dir = parseInt(btn.getAttribute('data-dir'), 10);
          if (dir > 0) {
            if (wiz.statClicks >= 3) return;
            if (stat === 'endu') wiz.statBonuses.endu += 2;
            else if (stat === 'damage') wiz.statBonuses.damage += 1;
            else wiz.statBonuses.vie += 1;
            wiz.statClicks++;
          } else {
            if ((wiz.statBonuses[stat] || 0) <= 0) return;
            if (stat === 'endu') wiz.statBonuses.endu -= 2;
            else if (stat === 'damage') wiz.statBonuses.damage -= 1;
            else wiz.statBonuses.vie -= 1;
            wiz.statClicks--;
          }
          renderWizard();
        });
      });
    } else if (stepName === 'Équipement') {
      // Trois combinaisons d'armes de départ imposées (plus de catalogue libre).
      // Chaque combinaison affiche les vignettes d'objets (avec dés / DEF) comme
      // dans l'inventaire et l'armurerie, pour une cohérence visuelle.
      function comboStrips(c) {
        return c.names.map(function (n) {
          const it = findItemByName(n);
          if (!it) return '<div class="inv-strip-row"><span class="hw-combo-warn">« ' + esc(n) +' » introuvable</span></div>';
          return '<div class="inv-strip-row cat-' + it.category + '">' +
            '<div class="inv-strip">' + Inventory.itemStripHtml(it) + '</div>' +
          '</div>';
        }).join('');
      }
      // Tenue de voyage : affichée comme équipement de départ imposé (non décoché)
      const tenueDeVoyage = findItemByName('tenue de voyage');
      const tenueHtml = tenueDeVoyage
        ? '<div class="hw-combo-fixed">' +
            '<span class="hw-combo-fixed-label">Équipement de départ</span>' +
            '<div class="inv-strip-layout hw-combo-strips"><div class="inv-strip-row cat-' + tenueDeVoyage.category + '">' +
              '<div class="inv-strip">' + Inventory.itemStripHtml(tenueDeVoyage) + '</div>' +
            '</div></div>' +
          '</div>'
        : '';
      body.innerHTML = '<p class="hint">Choisis ta <b>combinaison d\'armes</b> de départ.</p>' +
        '<div class="hw-combo-list">' + START_COMBOS.map(function (c) {
          const sel = wiz.equipCombo === c.id;
          return '<button type="button" class="hw-combo' + (sel ? ' selected' : '') + '" data-combo="' + c.id + '">' +
            '<span class="hw-combo-label">' + esc(c.label) + '</span>' +
            '<span class="hw-combo-desc">' + esc(c.desc) + '</span>' +
            '<div class="hw-combo-strips inv-strip-layout">' + comboStrips(c) + '</div>' +
          '</button>';
        }).join('') + '</div>' + tenueHtml;
      body.querySelectorAll('.hw-combo').forEach(function (b) {
        b.onclick = function () {
          wiz.equipCombo = b.getAttribute('data-combo');
          wiz.equipment = comboToEquip(wiz.equipCombo);
          renderWizard();
        };
      });
    } else if (stepName === 'Talents') {
      // Maîtrise de niveau 1 auto-ajoutée (ne peut pas être décochée)
      const allTals = level1Talents(wiz.klass);
      const masteryTal = allTals.find(function (t) { return wizTalentKind(t) === 'mastery'; });
      if (masteryTal && wiz.talents.indexOf(masteryTal.id) < 0) wiz.talents.push(masteryTal.id);
      // Trier : génériques d'abord, puis talents de classe (hors maîtrise auto)
      const gens = Store.loadGenericTalents().filter(function (t) { return (t.level || 1) <= 1 && (!masteryTal || t.id !== masteryTal.id); });
      const klass = Store.loadClasses().find(function (x) { return x.name === wiz.klass; });
      const clsTals = klass && Array.isArray(klass.talents)
        ? klass.talents.filter(function (t) { return t.id && (t.level || 1) <= 1 && (!masteryTal || t.id !== masteryTal.id); })
        : [];
      // Talents sélectionnés (hors maîtrise auto)
      const selCount = wiz.talents.filter(function (id) { return !masteryTal || id !== masteryTal.id; }).length;
      const KIND_SHORT_WIZ = { action: 'ACT', reaction: 'REAC', passive: 'PASS', upgrade: 'AME', mastery: 'MAIT' };
      function talRow(t, isAuto) {
        const kind = wizTalentKind(t);
        const sel = wiz.talents.indexOf(t.id) >= 0;
        return '<div class="inv-strip-row tal-row tal-kind-' + (kind || 'none') + (sel ? ' wiz-tal-selected' : '') + '" data-tal="' + esc(t.id) + '" data-auto="' + (isAuto ? '1' : '0') + '">' +
          (isAuto
            ? ''
            : '<input type="checkbox" class="lvl-tal-cb inv-equip-cb" aria-label="Sélectionner ' + esc(t.name) + '"' + (sel ? ' checked' : '') + '>') +
          '<div class="inv-strip tal-strip">' +
            '<span class="inv-strip-name">' + esc(t.name) + '</span>' +
            '<span class="inv-strip-val">' +
              (isAuto ? '<span class="lvl-tal-auto-badge">Auto</span>' : '') +
              (kind ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_SHORT_WIZ[kind] || kind) + '</span>' : '') +
            '</span>' +
          '</div>' +
        '</div>' +
        (t.description ? '<div class="lvl-tal-desc" hidden>' + esc(t.description) + '</div>' : '');
      }
      const choiceRemaining = 1 - selCount;
      body.innerHTML = '<p class="hint">Le Talent de Maîtrise est automatiquement ajouté. Choisis <b>1 talent</b> supplémentaire. ' +
        '<b>' + Math.max(0, choiceRemaining) + '</b> restant.</p>' +
        (masteryTal ? '<div class="hw-tal-section-title">Talent de Maîtrise</div><div class="hw-tal-list">' + talRow(masteryTal, true) + '</div>' : '') +
        (gens.length ? '<div class="hw-tal-section-title">Talents Génériques</div><div class="hw-tal-list">' + gens.map(function (t) { return talRow(t, false); }).join('') + '</div>' : '') +
        (clsTals.length ? '<div class="hw-tal-section-title">Talents de Classe</div><div class="hw-tal-list">' + clsTals.map(function (t) { return talRow(t, false); }).join('') + '</div>' : '') +
        (!gens.length && !clsTals.length && !masteryTal ? '<p class="empty">Aucun talent de niveau 1 disponible pour cette classe.</p>' : '');
      body.querySelectorAll('.inv-strip-row[data-tal]').forEach(function (row) {
        const desc = row.nextElementSibling && row.nextElementSibling.classList.contains('lvl-tal-desc') ? row.nextElementSibling : null;
        row.addEventListener('click', function (e) {
          const isAuto = row.getAttribute('data-auto') === '1';
          const cb = row.querySelector('.lvl-tal-cb');
          const clickedCb = cb && (e.target === cb || e.target.closest('input'));
          if (isAuto || !clickedCb) {
            // Clic sur la languette (hors case à cocher) : afficher/masquer la description
            if (desc) desc.hidden = !desc.hidden;
            if (isAuto) return;
            return;
          }
          // Clic sur la case à cocher : sélection radio
          const id = row.getAttribute('data-tal');
          const idx = wiz.talents.indexOf(id);
          if (idx >= 0) {
            wiz.talents.splice(idx, 1);
          } else {
            wiz.talents = wiz.talents.filter(function (x) { return masteryTal && x === masteryTal.id; });
            wiz.talents.push(id);
          }
          renderWizard();
        });
      });
    } else {
      const total = wizSkillTotal();
      const rem = 3 - total;
      body.innerHTML = '<p class="hint">Répartis tes <b>3 points</b> de compétence (max <b>2</b> dans une même). ' +
        '<b>' + rem + '</b> restant' + (rem > 1 ? 's' : '') + '.</p>' +
        '<div class="hw-skill-list2">' + SKILLS.map(function (s) {
          const v = wiz.skills[s] || 0;
          return '<div class="hw-skill-row skill-' + skillSlug(s) + '">' +
            '<span class="hw-skill-name">' + s + '</span>' +
            '<div class="hw-stat-ctrl">' +
              '<button type="button" class="hw-skill-pm" data-skill="' + s + '" data-dir="-1"' + (v <= 0 ? ' disabled' : '') + '>−</button>' +
              '<span class="hw-skill-val' + (v > 0 ? ' on' : '') + '">+' + v + '</span>' +
              '<button type="button" class="hw-skill-pm" data-skill="' + s + '" data-dir="1"' + (v >= 2 || rem <= 0 ? ' disabled' : '') + '>+</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';
      body.querySelectorAll('.hw-skill-pm').forEach(function (b) {
        b.onclick = function () {
          const s = this.getAttribute('data-skill');
          const dir = parseInt(this.getAttribute('data-dir'), 10);
          const v = wiz.skills[s] || 0;
          if (dir > 0) { if (v >= 2 || wizSkillTotal() >= 3) return; wiz.skills[s] = v + 1; }
          else { if (v <= 0) return; wiz.skills[s] = v - 1; }
          renderWizard();
        };
      });
    }
    const back = $('#hw-back'); if (back) back.style.visibility = wiz.step === 0 ? 'hidden' : 'visible';
    const isLast = wiz.step === WIZ_STEPS.length - 1;
    const nb = $('#hw-next'); if (nb) nb.textContent = isLast ? '✓ Créer l\'aventurier' : 'Suivant →';
    updateWizNav();
  }
  // Garantit que la Tenue de voyage est équipée dans le bon slot (armorId si c'est une armure,
  // objectId sinon) sur h.equipment ET h.baseEquipment.
  // À appeler à la création et au lancement de session.
  function ensureStartEquipment(h) {
    if (!h) return;
    const tenue = findItemByName('tenue de voyage');
    if (!tenue) return;
    const slot = (tenue.category === 'armor') ? 'armorId' : 'objectId';
    const eq = h.equipment = normalizeEquip(h.equipment || {});
    if (!eq[slot]) eq[slot] = tenue.id;
    if (h.baseEquipment) {
      const beq = normalizeEquip(h.baseEquipment);
      if (!beq[slot]) { beq[slot] = tenue.id; h.baseEquipment = beq; }
    } else {
      h.baseEquipment = JSON.parse(JSON.stringify(eq));
    }
  }

  function wizBack() { if (wiz && wiz.step > 0) { wiz.step--; renderWizard(); } }
  function wizNext() {
    if (!wiz || $('#hw-next').disabled) return;
    if (wiz.step < WIZ_STEPS.length - 1) { wiz.step++; renderWizard(); return; }
    const skills = {}; SKILLS.forEach(function (s) { if (wiz.skills[s]) skills[s] = wiz.skills[s]; });
    const eq = {
      mainG: wiz.equipment.mainG || null, mainD: wiz.equipment.mainD || null,
      armorId: wiz.equipment.armorId || null, objectId: null, twoH: false,
    };
    const h = {
      id: Store.uid(), name: wiz.name.trim() || 'Aventurier', klass: wiz.klass,
      vie: 3 + (wiz.statBonuses.vie || 0), endu: 0 + (wiz.statBonuses.endu || 0), pvBonus: 0, damage: 0 + (wiz.statBonuses.damage || 0), rapide: false, notes: '',
      attacks: [], skills: mergeSkills(skills),
      startTalents: wiz.talents.slice(),
      equipment: eq,
      baseEquipment: JSON.parse(JSON.stringify(eq)),
      adventureId: wiz.advId || null,
    };
    ensureStartEquipment(h);
    Store.state.heroes.push(h);
    Store.save();
    $('#hero-wizard-modal').hidden = true;
    renderHeroes();
    global.dispatchEvent(new CustomEvent('heroes-changed'));
  }

  function openHeroModal(id) {
    // En mode Joueur, la création d'un nouvel aventurier passe par l'assistant
    if (!id && scope().mode === 'player') { openHeroWizard(scope().advId); return; }
    const isEdit = !!id;
    const h = isEdit ? Store.state.heroes.find(function (x) { return x.id === id; }) : null;
    $('#hero-modal-title').textContent = isEdit ? 'Éditer l\'aventurier' : 'Nouvel aventurier';
    $('#h-id').value = isEdit ? h.id : '';
    $('#h-name').value = isEdit ? h.name : '';
    $('#h-class').innerHTML = '<option value="">—</option>' +
      CLASSES.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    $('#h-class').value = isEdit ? (h.klass || '') : '';
    $('#h-vie').value = isEdit ? h.vie : 4;
    $('#h-endu').value = isEdit ? h.endu : 3;
    $('#h-pvbonus').value = isEdit ? h.pvBonus : 0;
    $('#h-damage').value = isEdit ? h.damage : 2;
    $('#h-rapide').checked = isEdit ? !!h.rapide : false;
    $('#h-notes').value = isEdit ? (h.notes || '') : '';
    $('#h-image').value = isEdit ? (h.imageUrl || '') : '';
    heroAttacks = isEdit ? JSON.parse(JSON.stringify(h.attacks || [])) : [];
    buildAttacksEditor($('#h-attacks'), heroAttacks);
    heroSkills = isEdit ? mergeSkills(h.skills) : emptySkills();
    buildSkillsEditor($('#h-skills'), heroSkills);
    heroEquipment = isEdit ? normalizeEquip(h.equipment) : { mainG: null, mainD: null, armorId: null, objectId: null };
    buildHeroEquipmentUI();
    heroStartTalents = (isEdit && Array.isArray(h.startTalents)) ? h.startTalents.slice() : [];
    buildHeroTalentsUI();
    $('#h-class').onchange = buildHeroTalentsUI;
    $('#btn-delete-hero').hidden = !isEdit;
    updateHeroPvPreview();
    $('#hero-modal').hidden = false;
    $('#h-name').focus();
  }

  // Remplit un menu déroulant d'équipement avec les objets de l'inventaire
  function fillEquipSelect(sel, list, selectedId, noneLabel) {
    sel.innerHTML = '<option value="">' + noneLabel + '</option>' +
      list.map(function (it) {
        const meta = it.category === 'armor' ? ' (DEF ' + (it.def || 0) + ')'
          : (it.category === 'weapon' ? ' (' + (it.hands === 2 ? '2 mains' : '1 main') + (it.ranged ? ', dist.' : '') + ')' : '');
        return '<option value="' + it.id + '"' + (it.id === selectedId ? ' selected' : '') + '>' + esc(it.name) + meta + '</option>';
      }).join('');
    sel.value = selectedId || '';
  }

  // 4 emplacements d'équipement (menus déroulants), uniquement les objets de l'inventaire
  function buildHeroEquipmentUI() {
    const items = Store.state.items.filter(function (i) { return (i.qty || 1) > 0; });
    const hands = items.filter(function (i) { return i.category === 'weapon' || (i.category === 'armor' && i.slot === 'shield'); });
    const bodies = items.filter(function (i) { return i.category === 'armor' && (i.slot || 'body') === 'body'; });
    const objects = items.filter(function (i) { return i.category === 'object' || i.category === 'misc'; });

    fillEquipSelect($('#h-maing'), hands, heroEquipment.mainG, 'Vide');
    fillEquipSelect($('#h-maind'), hands, heroEquipment.mainD, 'Vide');
    fillEquipSelect($('#h-armor'), bodies, heroEquipment.armorId, 'Aucune');
    fillEquipSelect($('#h-object'), objects, heroEquipment.objectId, 'Aucun');

    $('#h-maing').onchange = function () { heroEquipment.mainG = this.value || null; updateEquipPreview(); };
    $('#h-maind').onchange = function () { heroEquipment.mainD = this.value || null; updateEquipPreview(); };
    $('#h-armor').onchange = function () { heroEquipment.armorId = this.value || null; updateEquipPreview(); };
    $('#h-object').onchange = function () { heroEquipment.objectId = this.value || null; updateEquipPreview(); };

    updateEquipPreview();
  }

  function unequipAll() {
    heroEquipment = { mainG: null, mainD: null, armorId: null, objectId: null };
    buildHeroEquipmentUI();
  }

  // Liste à boutons des talents de niveau 1 (génériques + classe choisie) pour l'éditeur d'aventurier
  function buildHeroTalentsUI() {
    const box = $('#h-talents');
    if (!box) return;
    const klass = $('#h-class').value;
    const tals = level1Talents(klass);
    // Élague les talents sélectionnés qui ne sont plus disponibles (ex. changement de classe)
    const ids = tals.map(function (t) { return t.id; });
    heroStartTalents = heroStartTalents.filter(function (id) { return ids.indexOf(id) >= 0; });
    if (!tals.length) { box.innerHTML = '<p class="hint">Aucun talent de niveau 1 disponible.</p>'; return; }
    box.innerHTML = tals.map(function (t) {
      const kind = wizTalentKind(t);
      const sel = heroStartTalents.indexOf(t.id) >= 0;
      return '<button type="button" class="lvl-choice-btn lvl-tal-btn' + (kind ? ' lvl-tal-' + kind : '') + (sel ? ' selected' : '') + '" ' +
        'data-tal="' + esc(t.id) + '" title="' + esc(t.description || '') + '">' +
        '<span class="lvl-tal-name">' + esc(t.name || '(sans nom)') + '</span>' +
        '<span class="lvl-tal-lvl">' + esc(kind ? (KIND_BADGE[kind] || 'Talent') : 'Talent') + ' · Niv. 1</span>' +
      '</button>';
    }).join('');
    box.querySelectorAll('.lvl-tal-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-tal');
        const idx = heroStartTalents.indexOf(id);
        if (idx >= 0) heroStartTalents.splice(idx, 1);
        else heroStartTalents.push(id);
        buildHeroTalentsUI();
      });
    });
  }

  function updateEquipPreview() {
    const fake = { equipment: heroEquipment, attacks: [] };
    const atks = heroDerivedAttacks(heroEquipment);
    const names = atks.map(function (a) {
      return a.name.split(' — ')[0] + ' ' + Inventory.poolBadges(a.dice) + (a.vicieuse ? ' (Vicieuse)' : '');
    });
    $('#h-equip-preview').innerHTML = '🛡 DEF totale : <strong>' + heroDef(fake) + '</strong>' +
      (names.length ? ' · ⚔ ' + names.join(' / ') : ' · aucune arme → mains nues');
  }

  function saveHero(e) {
    e.preventDefault();
    const id = $('#h-id').value || Store.uid();
    const existing = Store.state.heroes.find(function (x) { return x.id === id; });
    const s = scope();
    const data = {
      id: id, name: $('#h-name').value.trim() || 'Aventurier',
      klass: $('#h-class').value,
      vie: parseInt($('#h-vie').value, 10) || 1,
      endu: parseInt($('#h-endu').value, 10) || 1,
      pvBonus: parseInt($('#h-pvbonus').value, 10) || 0,
      damage: parseInt($('#h-damage').value, 10) || 0,
      rapide: $('#h-rapide').checked,
      notes: $('#h-notes').value.trim(),
      imageUrl: $('#h-image').value.trim() || null,
      attacks: heroAttacks,
      skills: mergeSkills(heroSkills),
      startTalents: heroStartTalents.slice(),
      equipment: {
        mainG: heroEquipment.mainG || null,
        mainD: heroEquipment.mainD || null,
        armorId: heroEquipment.armorId || null,
        objectId: heroEquipment.objectId || null,
        twoH: !!heroEquipment.twoH,
      },
      // Équipement de base (pré-tiré) : restauré au début de chaque partie
      baseEquipment: {
        mainG: heroEquipment.mainG || null,
        mainD: heroEquipment.mainD || null,
        armorId: heroEquipment.armorId || null,
        objectId: heroEquipment.objectId || null,
        twoH: !!heroEquipment.twoH,
      },
      // Pré-construit (Admin) → adventureId null ; Joueur → lié à l'aventure courante.
      adventureId: existing ? (existing.adventureId || null) : (s.mode === 'player' ? s.advId : null),
    };
    if (existing) Object.assign(existing, data);
    else Store.state.heroes.push(data);
    Store.save();
    $('#hero-modal').hidden = true;
    renderHeroes();
    global.dispatchEvent(new CustomEvent('heroes-changed'));
  }

  // Copie un aventurier pré-construit dans le groupe d'une aventure
  function clonePrebuilt(prebuiltId, advId) {
    const src = Store.state.heroes.find(function (h) { return h.id === prebuiltId; });
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = Store.uid();
    copy.adventureId = advId;
    copy.prebuiltId = prebuiltId; // origine : empêche d'ajouter deux fois le même modèle
    // L'équipement défini sur le pré-construit devient l'équipement de base du clone
    copy.baseEquipment = JSON.parse(JSON.stringify(src.baseEquipment || src.equipment || {}));
    delete copy.pv; // PV au maximum
    Store.state.heroes.push(copy);
    Store.save();
    renderHeroes();
    global.dispatchEvent(new CustomEvent('heroes-changed'));
    return copy.id;
  }

  function openPrebuiltPicker() {
    const s = scope();
    // Exclut les pré-construits déjà présents dans le groupe (un même modèle une seule fois)
    const used = {};
    adventureHeroes(s.advId).forEach(function (h) { if (h.prebuiltId) used[h.prebuiltId] = true; });
    const list = prebuiltHeroes().filter(function (h) { return !used[h.id]; });
    const box = $('#prebuilt-list');
    box.innerHTML = list.length
      ? list.map(function (h) {
          return '<div class="setup-row">' +
            '<span class="setup-name">' + esc(h.name) +
              (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
            '<span class="stat-pills compact"><span class="stat-pill">❤ ' + heroPv(h) + '</span>' +
              '<span class="stat-pill">⚔ ' + h.damage + '</span></span>' +
            '<button type="button" class="primary small pb-pick" data-id="' + h.id + '">Ajouter</button>' +
          '</div>';
        }).join('')
      : '<p class="empty">' + (prebuiltHeroes().length
          ? 'Tous les aventuriers pré-construits sont déjà dans le groupe.'
          : 'Aucun aventurier pré-construit. Le MJ peut en créer en mode Admin.') + '</p>';
    $('#prebuilt-modal').hidden = false;
    box.querySelectorAll('.pb-pick').forEach(function (b) {
      b.addEventListener('click', function () {
        clonePrebuilt(b.getAttribute('data-id'), s.advId);
        $('#prebuilt-modal').hidden = true;
      });
    });
  }

  // ================= MONSTRES =================
  let monsterAttacks = [];
  let monsterTalents = [];
  let monsterEquip = [];   // [{ itemId, loot }]  armes/armures équipées
  let monsterLoot = [];    // [{ itemId, loot, qty }]  butin du groupe

  // Éditeur de loot (équipement de l'adversaire ou butin du groupe)
  function buildLootEditor(container, list, opts) {
    opts = opts || {};
    function itemOpts(sel) {
      const items = Store.state.items.filter(function (i) { return !opts.cats || opts.cats.indexOf(i.category) >= 0; });
      return '<option value="">(choisir)</option>' + items.map(function (i) {
        return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + '</option>';
      }).join('');
    }
    function lootOpts(sel) {
      const v = (sel != null ? sel : 30);
      let o = '';
      for (let p = 0; p <= 100; p += 10) o += '<option value="' + p + '"' + (p === v ? ' selected' : '') + '>' + p + '%</option>';
      return o;
    }
    container.innerHTML = list.length ? list.map(function (row, idx) {
      return '<div class="loot-row" data-i="' + idx + '">' +
        '<select class="loot-item">' + itemOpts(row.itemId) + '</select>' +
        '<label class="loot-pct">Loot <select class="loot-loot">' + lootOpts(row.loot) + '</select></label>' +
        (opts.withQty ? '<label class="loot-qty">×<input type="number" class="loot-q" min="1" value="' + (row.qty || 1) + '" /></label>' : '') +
        '<button type="button" class="icon-btn loot-del">✕</button>' +
      '</div>';
    }).join('') : '<p class="hint">Aucun.</p>';
    container.querySelectorAll('.loot-row').forEach(function (rowEl) {
      const idx = +rowEl.getAttribute('data-i');
      rowEl.querySelector('.loot-item').onchange = function () { list[idx].itemId = this.value; };
      rowEl.querySelector('.loot-loot').onchange = function () { list[idx].loot = parseInt(this.value, 10) || 0; };
      const q = rowEl.querySelector('.loot-q');
      if (q) q.oninput = function () { list[idx].qty = Math.max(1, parseInt(this.value, 10) || 1); };
      rowEl.querySelector('.loot-del').onclick = function () { list.splice(idx, 1); buildLootEditor(container, list, opts); };
    });
  }

  const TYPE_RANK = { standard: 0, alpha: 1, solitaire: 2, boss: 3 };

  // Déclencheurs du moteur de combat (registre fixe). Chaque talent du
  // catalogue (CRAINTIF, FUYARD, HORDE…) se rattache à l'un d'eux ; le champ X
  // (variable, ajusté par monstre) est stocké sous la clé paramKey du trigger.
  const TRIGGER_DEFS = [
    { id: 'flee_on_big_hit',    label: 'Fuite si X+ dégâts en un coup', paramKey: 'threshold', paramLabel: 'Seuil dégâts', defaultVal: 10 },
    { id: 'flee_after_turns',   label: 'Fuite après le tour X',          paramKey: 'turns',     paramLabel: 'Après tour',   defaultVal: 3  },
    { id: 'ally_contact_bonus', label: '+X dégâts par allié dans sa zone', paramKey: 'bonus',   paramLabel: 'Bonus/allié',  defaultVal: 1  },
    { id: 'slow',               label: 'Lent (pas d\'attaque s\'il se déplace)', paramKey: 'none', paramLabel: '', defaultVal: 0, noParam: true },
    { id: 'zone_support',       label: '+X dégâts aux adversaires de sa zone',  paramKey: 'bonus',   paramLabel: 'Bonus zone',  defaultVal: 1  },
    { id: 'armor_charges',      label: 'Blindage X (ignore X sources de dégâts)', paramKey: 'charges', paramLabel: 'Charges',   defaultVal: 1  },
    { id: 'mark_target_dice',   label: 'Proie : +X dés (couleur) contre un aventurier désigné', paramKey: 'count', paramLabel: 'Nb de dés', defaultVal: 1, colorParam: true, modeParam: true },
    { id: 'pull_to_zone',       label: 'Happe : déplace un aventurier dans sa zone avant d\'attaquer', paramKey: 'none', paramLabel: '', defaultVal: 0, noParam: true },
    { id: 'counter_attack',     label: 'Riposte : contre-attaque qui l\'attaque (1×/tour)', paramKey: 'none', paramLabel: '', defaultVal: 0, noParam: true },
  ];
  // Couleurs de dés offrables pour le talent « Proie » (offensives).
  const MARK_DICE_COLORS = [
    { key: 'white',  label: 'Blanc (Simple)' },
    { key: 'bone',   label: 'Orange (Léger)' },
    { key: 'red',    label: 'Rouge (Lourd)' },
    { key: 'blue',   label: 'Bleu (Mystique)' },
    { key: 'yellow', label: 'Jaune (Phase)' },
    { key: 'black',  label: 'Noir (Mortel)' },
  ];
  // Critères de désignation de la cible pour le talent « Proie ».
  const MARK_TARGET_MODES = [
    { key: 'most_pv',   label: 'Le plus de PV' },
    { key: 'least_pv',  label: 'Le moins de PV' },
    { key: 'least_def', label: 'La plus faible DEF' },
    { key: 'most_def',  label: 'La plus forte DEF' },
    { key: 'random',    label: 'Aléatoire' },
  ];
  function triggerDef(id) {
    return TRIGGER_DEFS.find(function (d) { return d.id === id; }) || TRIGGER_DEFS[0];
  }
  function montalentCatalog() { return Store.loadMonsterTalents(); }
  function catalogEntry(catId, trigger) {
    const cat = montalentCatalog();
    return cat.find(function (c) { return c.id === catId; }) ||
           cat.find(function (c) { return c.trigger === trigger; }) || cat[0] || null;
  }

  // Crée un talent de monstre à partir d'une entrée du catalogue
  function newTalent() {
    const cat = montalentCatalog();
    const entry = cat[0] || { id: 'flee', trigger: 'flee_on_big_hit', defaultVal: 10 };
    const def = triggerDef(entry.trigger);
    const t = { catId: entry.id, trigger: entry.trigger };
    t[def.paramKey] = (entry.defaultVal !== undefined) ? entry.defaultVal : def.defaultVal;
    return t;
  }

  function buildTalentsEditor(container, talents) {
    container.innerHTML = '';
    const cat = montalentCatalog();
    if (!cat.length) {
      container.innerHTML = '<p class="hint">Aucun talent au catalogue. Crée-en dans l\'onglet « Talents Adv. ».</p>';
      return;
    }
    if (!talents.length) {
      container.innerHTML = '<p class="hint">Aucun talent.</p>';
      return;
    }
    talents.forEach(function (t, idx) {
      // Rattache au catalogue (compat. ancien format sans catId)
      let entry = catalogEntry(t.catId, t.trigger);
      if (entry) { t.catId = entry.id; t.trigger = entry.trigger; }
      const row = document.createElement('div');
      row.className = 'talent-row';
      row.innerHTML =
        '<select class="tl-trigger">' +
          cat.map(function (c) {
            return '<option value="' + c.id + '"' + (t.catId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
          }).join('') +
        '</select>' +
        '<span class="tl-param-label"></span>' +
        '<input type="number" class="tl-param" min="0" style="width:60px">' +
        '<select class="tl-color" style="display:none">' +
          MARK_DICE_COLORS.map(function (c) { return '<option value="' + c.key + '">' + esc(c.label) + '</option>'; }).join('') +
        '</select>' +
        '<select class="tl-mode" style="display:none">' +
          MARK_TARGET_MODES.map(function (c) { return '<option value="' + c.key + '">' + esc(c.label) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>';

      const selEl  = row.querySelector('.tl-trigger');
      const lblEl  = row.querySelector('.tl-param-label');
      const paramIn = row.querySelector('.tl-param');
      const colorEl = row.querySelector('.tl-color');
      const modeEl  = row.querySelector('.tl-mode');

      function syncParam() {
        const def = triggerDef(t.trigger);
        // Talent sans valeur variable (ex. LENT) : on masque le champ X.
        const hide = !!def.noParam;
        lblEl.style.display = hide ? 'none' : '';
        paramIn.style.display = hide ? 'none' : '';
        lblEl.textContent = def.paramLabel + ' ';
        paramIn.value = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
        // Sélecteur de couleur de dé : visible uniquement pour le talent PROIE.
        colorEl.style.display = def.colorParam ? '' : 'none';
        if (def.colorParam) colorEl.value = t.markColor || 'white';
        // Sélecteur de critère de cible : visible uniquement pour le talent PROIE.
        modeEl.style.display = def.modeParam ? '' : 'none';
        if (def.modeParam) modeEl.value = t.targetMode || 'most_pv';
      }
      syncParam();

      colorEl.addEventListener('change', function () { t.markColor = colorEl.value; });
      modeEl.addEventListener('change', function () { t.targetMode = modeEl.value; });

      selEl.addEventListener('change', function () {
        const e = catalogEntry(selEl.value, null);
        const oldKey = triggerDef(t.trigger).paramKey;
        t.catId = e.id; t.trigger = e.trigger;
        const def = triggerDef(t.trigger);
        if (def.paramKey !== oldKey) delete t[oldKey];
        if (t[def.paramKey] === undefined) t[def.paramKey] = (e.defaultVal !== undefined) ? e.defaultVal : def.defaultVal;
        if (def.colorParam && !t.markColor) t.markColor = 'white';
        if (def.modeParam && !t.targetMode) t.targetMode = 'most_pv';
        syncParam();
      });
      paramIn.addEventListener('input', function () {
        const def = triggerDef(t.trigger);
        t[def.paramKey] = Math.max(0, parseInt(paramIn.value, 10) || 0);
      });
      row.querySelector('.tl-del').addEventListener('click', function () {
        talents.splice(idx, 1);
        buildTalentsEditor(container, talents);
      });
      container.appendChild(row);
    });
  }

  function talentsSummary(talents) {
    if (!talents || !talents.length) return '';
    return talents.map(function (t) {
      const entry = catalogEntry(t.catId, t.trigger);
      if (!entry) return '';
      const def = triggerDef(entry.trigger);
      if (def.noParam) return '<span class="talent-badge">' + esc(entry.name) + '</span>';
      const val = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
      let extra = '';
      if (def.colorParam) {
        const dt = D.DICE_TYPES[t.markColor || 'white'];
        extra += ' ' + (dt ? dt.emoji : '');
      }
      if (def.modeParam) {
        const md = MARK_TARGET_MODES.find(function (x) { return x.key === (t.targetMode || 'most_pv'); });
        if (md) extra += ' · ' + esc(md.label);
      }
      return '<span class="talent-badge">' + esc(entry.name) + ' ' + val + extra + '</span>';
    }).join('');
  }

  // ---------- Onglet « Talents Adv. » (catalogue MJ/Admin) ----------
  // Languette d'un talent adverse — même design que l'onglet Classes (Aventuriers).
  function talentAdvStrip(c, i) {
    const def = triggerDef(c.trigger);
    return '<div class="inv-strip-row tal-row tal-kind-none">' +
      '<div class="inv-strip tal-strip" data-edit="' + i + '" title="' + esc(c.desc || def.label) + '">' +
        '<span class="inv-strip-name">' + esc(c.name || '(sans nom)') + '</span>' +
        '<span class="inv-strip-val">' +
          '<span class="tal-lvl">X = ' + (c.defaultVal !== undefined ? c.defaultVal : def.defaultVal) + '</span>' +
        '</span>' +
      '</div>' +
      '<button class="inv-strip-edit" data-edit="' + i + '" title="Éditer">✎</button>' +
    '</div>';
  }

  function renderTalentsAdv() {
    const list = $('#talentadv-list');
    if (!list) return;
    const cat = montalentCatalog();
    const strips = cat.length
      ? cat.slice()
          .map(function (c, i) { return { c: c, i: i }; })
          .sort(function (a, b) { return (a.c.name || '').localeCompare(b.c.name || ''); })
          .map(function (o) { return talentAdvStrip(o.c, o.i); }).join('')
      : '<p class="inv-col-empty">Aucun talent. Ajoute-en un avec le bouton « + Nouveau talent ».</p>';
    list.innerHTML = '<div class="tal-cols"><div class="tal-col">' +
        '<div class="tal-col-hdr klass-adversaire">' +
          '<span class="tal-col-name">⚔️ Talents adverses</span>' +
          '<span class="tag">' + cat.length + '</span>' +
          '<button class="ghost small tl-col-add tadv-col-add">+</button>' +
        '</div>' +
        '<div class="tal-col-body">' + strips + '</div>' +
      '</div></div>';

    list.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTalentAdvModal(+el.getAttribute('data-edit'));
      });
    });
    const add = list.querySelector('.tadv-col-add');
    if (add) add.addEventListener('click', function () { openTalentAdvModal(null); });
  }

  // ---- Mini-fenêtre d'édition d'un talent adverse ----
  let editingAdv = null; // index dans le catalogue, ou null en création

  function openTalentAdvModal(i) {
    const m = $('#talentadv-modal');
    if (!m) return;
    const cat = montalentCatalog();
    const existing = (i !== null && cat[i]) ? cat[i] : null;
    editingAdv = existing ? i : null;
    const c = existing || { name: '', trigger: 'flee_on_big_hit', defaultVal: triggerDef('flee_on_big_hit').defaultVal, desc: '' };
    $('#talentadv-modal-title').textContent = existing ? 'Éditer le talent adverse' : 'Ajouter un talent adverse';
    $('#tadv-f-id').value = (existing && existing.id) || '';
    $('#tadv-f-name').value = c.name || '';
    $('#tadv-f-trigger').innerHTML = TRIGGER_DEFS.map(function (d) {
      return '<option value="' + d.id + '"' + (c.trigger === d.id ? ' selected' : '') + '>' + esc(d.label) + '</option>';
    }).join('');
    $('#tadv-f-defval').value = (c.defaultVal !== undefined) ? c.defaultVal : triggerDef(c.trigger).defaultVal;
    $('#tadv-f-desc').value = c.desc || '';
    $('#tadv-f-delete').hidden = !existing;
    m.hidden = false;
    $('#tadv-f-name').focus();
  }

  function closeTalentAdvModal() { $('#talentadv-modal').hidden = true; editingAdv = null; }

  function submitTalentAdv(ev) {
    ev.preventDefault();
    const cat = montalentCatalog();
    const data = {
      id: $('#tadv-f-id').value || ('tal_' + Store.uid()),
      name: ($('#tadv-f-name').value || '').trim() || 'NOUVEAU',
      trigger: $('#tadv-f-trigger').value,
      defaultVal: Math.max(0, parseInt($('#tadv-f-defval').value, 10) || 0),
      desc: ($('#tadv-f-desc').value || '').trim(),
    };
    if (editingAdv !== null && cat[editingAdv]) cat[editingAdv] = data;
    else cat.push(data);
    Store.saveMonsterTalents(cat);
    closeTalentAdvModal();
    renderTalentsAdv();
  }

  function deleteTalentAdv() {
    if (editingAdv === null) { closeTalentAdvModal(); return; }
    if (!confirm('Supprimer ce talent du catalogue ?')) return;
    const cat = montalentCatalog();
    cat.splice(editingAdv, 1);
    Store.saveMonsterTalents(cat);
    closeTalentAdvModal();
    renderTalentsAdv();
  }

  function addMonsterTalentToCatalog() { openTalentAdvModal(null); }

  function renderMonsters() {
    const list = $('#monster-list');
    refreshFamilyControls();
    const term = ($('#monster-search').value || '').toLowerCase().trim();
    const type = $('#monster-filter-type').value;
    const family = ($('#monster-filter-family') || {}).value || '';
    const sort = ($('#monster-sort') || {}).value || 'danger';
    const monsters = Store.state.monsters.filter(function (m) {
      if (type && m.type !== type) return false;
      if (family && (m.family || '') !== family) return false;
      if (term && m.name.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
    monsters.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'type') return (TYPE_RANK[b.type] || 0) - (TYPE_RANK[a.type] || 0) || a.name.localeCompare(b.name);
      if (sort === 'family') return (a.family || '~').localeCompare(b.family || '~') || a.name.localeCompare(b.name);
      return (b.xp || 0) - (a.xp || 0); // danger : par XP décroissante
    });
    if (!monsters.length) {
      list.innerHTML = '<p class="empty">Aucun monstre.</p>';
      return;
    }
    list.innerHTML = monsters.map(function (m) {
      return '<div class="roster-card type-' + m.type + '">' +
        '<div class="roster-head">' +
          '<span class="roster-name">' + esc(m.name) + '</span>' +
          '<span class="tag type">' + (TYPE_LABEL[m.type] || m.type) + '</span>' +
          (m.family ? '<span class="tag">' + esc(m.family) + '</span>' : '') +
          (m.rapide ? '<span class="tag">Rapide</span>' : '') +
          (m.esquive ? '<span class="tag">Esq. 6+</span>' : '') +
          '<button class="ghost small" data-edit-monster="' + m.id + '">Éditer</button>' +
          '<button class="ghost small del-btn" data-del-monster="' + m.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="stat-pills">' +
          '<span class="stat-pill">❤ <b>' + m.pv + '</b></span>' +
          '<span class="stat-pill">🛡 <b>' + monsterTotalDef(m) + '</b></span>' +
          '<span class="stat-pill">⚔ <b>' + m.damage + '</b></span>' +
          '<span class="stat-pill">✦ <b>' + m.xp + '</b> XP</span>' +
          '<span class="stat-pill">🎯 ' + (MENACE_LABEL[m.menace] || m.menace) + '</span>' +
        '</div>' +
        '<div class="roster-section">' +
          '<div class="roster-label">Attaques</div>' +
          '<div class="atk-badges">' + attacksSummary(monsterCombatAttacks(m)) + '</div>' +
        '</div>' +
        (m.talents && m.talents.length ? '<div class="roster-section"><div class="roster-label">Talents</div><div class="talent-badges">' + talentsSummary(m.talents) + '</div></div>' : '') +
        (m.notes ? '<div class="roster-notes">' + esc(m.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-monster]').forEach(function (b) {
      b.addEventListener('click', function () { openMonsterModal(b.getAttribute('data-edit-monster')); });
    });
    list.querySelectorAll('[data-del-monster]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-del-monster');
        const m = Store.state.monsters.find(function (x) { return x.id === id; });
        if (m && confirm('Supprimer « ' + m.name + ' » du bestiaire ?')) {
          Store.state.monsters = Store.state.monsters.filter(function (x) { return x.id !== id; });
          Store.save(); renderMonsters();
        }
      });
    });
  }

  // Met à jour la liste des familles (filtre + datalist) selon le bestiaire
  function refreshFamilyControls() {
    const families = [];
    Store.state.monsters.forEach(function (m) {
      if (m.family && families.indexOf(m.family) === -1) families.push(m.family);
    });
    families.sort();
    const sel = $('#monster-filter-family');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">Toutes familles</option>' +
        families.map(function (f) { return '<option value="' + esc(f) + '">' + esc(f) + '</option>'; }).join('');
      sel.value = cur;
    }
    const dl = $('#family-list');
    if (dl) dl.innerHTML = families.map(function (f) { return '<option value="' + esc(f) + '">'; }).join('');
  }

  function openMonsterModal(id) {
    const isEdit = !!id;
    const m = isEdit ? Store.state.monsters.find(function (x) { return x.id === id; }) : null;
    $('#monster-modal-title').textContent = isEdit ? 'Éditer le monstre' : 'Nouveau monstre';
    $('#m-id').value = isEdit ? m.id : '';
    $('#m-name').value = isEdit ? m.name : '';
    $('#m-family').value = isEdit ? (m.family || '') : '';
    refreshFamilyControls();
    $('#m-pv').value = isEdit ? m.pv : 6;
    $('#m-def').value = isEdit ? m.def : 3;
    $('#m-damage').value = isEdit ? m.damage : 2;
    $('#m-xp').value = isEdit ? m.xp : 5;
    $('#m-type').value = isEdit ? m.type : 'standard';
    $('#m-socle').value = isEdit ? m.socle : 'medium';
    $('#m-menace').value = isEdit ? m.menace : 'closest';
    $('#m-esquive').checked = isEdit ? !!m.esquive : false;
    $('#m-rapide').checked = isEdit ? !!m.rapide : false;
    $('#m-notes').value = isEdit ? (m.notes || '') : '';
    $('#m-image').value = isEdit ? (m.imageUrl || '') : '';
    monsterAttacks = isEdit ? JSON.parse(JSON.stringify(m.attacks || [])) : [newAttack()];
    buildAttacksEditor($('#m-attacks'), monsterAttacks);
    monsterEquip = isEdit ? JSON.parse(JSON.stringify(m.equipment || [])) : [];
    buildLootEditor($('#m-equip'), monsterEquip, { cats: ['weapon', 'armor'] });
    monsterLoot = isEdit ? JSON.parse(JSON.stringify(m.loot || [])) : [];
    buildLootEditor($('#m-loot'), monsterLoot, { withQty: true });
    monsterTalents = isEdit ? JSON.parse(JSON.stringify(m.talents || [])) : [];
    buildTalentsEditor($('#m-talents'), monsterTalents);
    $('#btn-delete-monster').hidden = !isEdit;
    $('#monster-modal').hidden = false;
    $('#m-name').focus();
  }

  function saveMonster(e) {
    e.preventDefault();
    const id = $('#m-id').value || Store.uid();
    const existing = Store.state.monsters.find(function (x) { return x.id === id; });
    const data = {
      id: id, name: $('#m-name').value.trim() || 'Monstre',
      family: $('#m-family').value.trim(),
      pv: parseInt($('#m-pv').value, 10) || 1,
      def: parseInt($('#m-def').value, 10) || 0,
      damage: parseInt($('#m-damage').value, 10) || 0,
      xp: parseInt($('#m-xp').value, 10) || 0,
      type: $('#m-type').value,
      socle: $('#m-socle').value,
      menace: $('#m-menace').value,
      esquive: $('#m-esquive').checked,
      rapide: $('#m-rapide').checked,
      notes: $('#m-notes').value.trim(),
      imageUrl: $('#m-image').value.trim() || null,
      attacks: monsterAttacks,
      equipment: monsterEquip.filter(function (r) { return r.itemId; }),
      loot: monsterLoot.filter(function (r) { return r.itemId; }),
      talents: monsterTalents,
    };
    if (existing) Object.assign(existing, data);
    else Store.state.monsters.push(data);
    Store.save();
    $('#monster-modal').hidden = true;
    renderMonsters();
  }

  function init() {
    // Aventuriers
    $('#btn-add-hero').addEventListener('click', function () { openHeroModal(null); });
    $('#btn-add-prebuilt').addEventListener('click', function () { openPrebuiltPicker(); });
    $('#prebuilt-close').addEventListener('click', function () { $('#prebuilt-modal').hidden = true; });
    $('#prebuilt-modal').addEventListener('click', function (e) { if (e.target.id === 'prebuilt-modal') $('#prebuilt-modal').hidden = true; });
    $('#hero-modal-close').addEventListener('click', function () { $('#hero-modal').hidden = true; });
    $('#hw-close').addEventListener('click', function () { $('#hero-wizard-modal').hidden = true; });
    $('#hw-back').addEventListener('click', wizBack);
    $('#hw-next').addEventListener('click', wizNext);
    $('#hero-wizard-modal').addEventListener('click', function (e) { if (e.target.id === 'hero-wizard-modal') $('#hero-wizard-modal').hidden = true; });
    $('#hero-sheet-close').addEventListener('click', function () { $('#hero-sheet-modal').hidden = true; });
    $('#hero-sheet-modal').addEventListener('click', function (e) { if (e.target.id === 'hero-sheet-modal') $('#hero-sheet-modal').hidden = true; });
    $('#hero-modal').addEventListener('click', function (e) { if (e.target.id === 'hero-modal') $('#hero-modal').hidden = true; });
    $('#hero-form').addEventListener('submit', saveHero);
    $('#h-add-attack').addEventListener('click', function () {
      heroAttacks.push(newAttack()); buildAttacksEditor($('#h-attacks'), heroAttacks);
    });
    ['h-vie', 'h-endu', 'h-pvbonus'].forEach(function (idn) {
      $('#' + idn).addEventListener('input', updateHeroPvPreview);
    });
    $('#h-class').addEventListener('change', updateHeroPvPreview);
    $('#h-unequip').addEventListener('click', unequipAll);
    $('#btn-delete-hero').addEventListener('click', function () {
      const id = $('#h-id').value;
      if (id && confirm('Supprimer cet aventurier ?')) {
        Store.state.heroes = Store.state.heroes.filter(function (x) { return x.id !== id; });
        Store.save(); $('#hero-modal').hidden = true; renderHeroes();
        global.dispatchEvent(new CustomEvent('heroes-changed'));
      }
    });

    // Monstres
    $('#btn-add-monster').addEventListener('click', function () { openMonsterModal(null); });
    $('#monster-modal-close').addEventListener('click', function () { $('#monster-modal').hidden = true; });
    $('#monster-modal').addEventListener('click', function (e) { if (e.target.id === 'monster-modal') $('#monster-modal').hidden = true; });
    $('#monster-form').addEventListener('submit', saveMonster);
    $('#m-add-attack').addEventListener('click', function () {
      monsterAttacks.push(newAttack()); buildAttacksEditor($('#m-attacks'), monsterAttacks);
    });
    $('#m-add-talent').addEventListener('click', function () {
      monsterTalents.push(newTalent()); buildTalentsEditor($('#m-talents'), monsterTalents);
    });
    $('#m-add-equip').addEventListener('click', function () {
      monsterEquip.push({ itemId: '', loot: 30 }); buildLootEditor($('#m-equip'), monsterEquip, { cats: ['weapon', 'armor'] });
    });
    $('#m-add-loot').addEventListener('click', function () {
      monsterLoot.push({ itemId: '', loot: 30, qty: 1 }); buildLootEditor($('#m-loot'), monsterLoot, { withQty: true });
    });
    $('#monster-search').addEventListener('input', renderMonsters);
    $('#monster-filter-type').addEventListener('change', renderMonsters);
    $('#monster-filter-family').addEventListener('change', renderMonsters);
    $('#monster-sort').addEventListener('change', renderMonsters);
    $('#btn-delete-monster').addEventListener('click', function () {
      const id = $('#m-id').value;
      if (id && confirm('Supprimer ce monstre ?')) {
        Store.state.monsters = Store.state.monsters.filter(function (x) { return x.id !== id; });
        Store.save(); $('#monster-modal').hidden = true; renderMonsters();
      }
    });

    // Talents Adverses (catalogue)
    const addTal = $('#btn-add-talentadv');
    if (addTal) addTal.addEventListener('click', addMonsterTalentToCatalog);
    const tadvForm = $('#talentadv-form');
    if (tadvForm) tadvForm.addEventListener('submit', submitTalentAdv);
    const tadvClose = $('#talentadv-modal-close');
    if (tadvClose) tadvClose.addEventListener('click', closeTalentAdvModal);
    const tadvDel = $('#tadv-f-delete');
    if (tadvDel) tadvDel.addEventListener('click', deleteTalentAdv);
    const tadvModal = $('#talentadv-modal');
    if (tadvModal) tadvModal.addEventListener('click', function (ev) { if (ev.target.id === 'talentadv-modal') closeTalentAdvModal(); });

    renderHeroes();
    renderMonsters();
  }

  global.Combatants = {
    init: init,
    renderHeroes: renderHeroes,
    renderMonsters: renderMonsters,
    renderTalentsAdv: renderTalentsAdv,
    renderProgress: renderProgress,
    openHeroModal: openHeroModal,
    openHeroSheet: openHeroSheet,
    openPrebuiltPicker: openPrebuiltPicker,
    adventureHeroes: adventureHeroes,
    prebuiltHeroes: prebuiltHeroes,
    clonePrebuilt: clonePrebuilt,
    heroGear: heroGear,
    normalizeEquip: normalizeEquip,
    weaponAttacks: weaponAttacks,
    monsterCombatAttacks: monsterCombatAttacks,
    monsterTalentLabels: monsterTalentLabels,
    monsterTotalDef: monsterTotalDef,
    heroPv: heroPv,
    heroCurPv: heroCurPv,
    heroRestShort: heroRestShort,
    heroRestLong: heroRestLong,
    heroDef: heroDef,
    heroCombatAttacks: heroCombatAttacks,
    resolveHeroTalents: resolveHeroTalents,
    attacksSummary: attacksSummary,
    heroCardHtml: heroCardHtml,
    TYPE_LABEL: TYPE_LABEL,
    MENACE_LABEL: MENACE_LABEL,
    RANGE_LABEL: RANGE_LABEL,
    ensureStartEquipment: ensureStartEquipment,
    PLAYABLE_CLASSES: PLAYABLE_CLASSES,
  };
})(window);
