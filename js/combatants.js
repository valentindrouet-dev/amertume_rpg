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
      if (a.targets === 'all') meta.push('toutes cibles');
      if (a.uses > 0) meta.push(a.uses + '×/tour');
      if (a.freeAction) meta.push('gratuite');
      return '<div class="atk-badge">' +
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
    return weaponAttacks(weapons).concat(JSON.parse(JSON.stringify(m.attacks || [])));
  }
  function monsterTotalDef(m) {
    const armorDef = monsterEquipItems(m).filter(function (it) { return it.category === 'armor'; })
      .reduce(function (s, a) { return s + (a.def || 0); }, 0);
    return (m.def || 0) + armorDef;
  }

  // Attaques utilisées en combat : armes + spéciales (+ secours mains nues)
  function heroCombatAttacks(h) {
    let atks = heroDerivedAttacks(h.equipment).concat(JSON.parse(JSON.stringify(h.attacks || [])));
    if (!atks.length) {
      atks = [{ name: 'Mains nues', dice: Object.assign(D.emptyPool(), { white: 1 }),
        range: 'contact', targets: 'one', useOwnDamage: true, effects: Store.noStates() }];
    }
    return atks;
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
            '<div class="pi-line"><span>✦ <b>' + info.xp + '</b> XP' + (player ? '' : ' partagée') + '</span>' +
              '<span class="points-pill">' + info.points + ' pts de talent</span></div>' +
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
  function heroCardHtml(h, opts) {
    opts = opts || {};
    return '<div class="roster-card hero-card' + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '">' +
      '<div class="roster-head hero-head">' +
        (opts.selectable ? '<input type="checkbox" class="hero-pick-cb" data-hero="' + h.id + '"' + (opts.checked ? ' checked' : '') + '>' : '') +
        '<span class="roster-name">' + esc(h.name) + '</span>' +
        (h.klass ? '<span class="class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
        (h.rapide ? '<span class="tag">Rapide</span>' : '') +
      '</div>' +
      '<div class="hero-stat-row">' +
        '<div class="hero-stat"><span class="hs-label">Points de Vie</span><span class="hs-val">' + heroPv(h) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(h) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + h.damage + '</span></div>' +
      '</div>' +
      '<div class="roster-section"><div class="roster-label">Attaques</div>' +
        '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(h)) + '</div></div>' +
      skillsSummary(h.skills) +
      (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '') +
    '</div>';
  }

  function renderHeroes() {
    renderProgress();
    const s = scope();
    const titleEl = $('#heroes-title');
    if (titleEl) titleEl.textContent = s.mode === 'player' ? 'Vos aventuriers' : 'Aventuriers pré-construits';
    const hintEl = $('#heroes-hint');
    if (hintEl) hintEl.textContent = s.mode === 'player'
      ? 'Crée autant d\'aventuriers que tu veux. Ils restent disponibles pour rejouer l\'aventure.'
      : 'Aventuriers modèles, réutilisables par les joueurs via « + Aventurier Pré-Construit ».';
    const preBtn = $('#btn-add-prebuilt');
    if (preBtn) preBtn.hidden = s.mode !== 'player';
    const list = $('#hero-list');
    const heroes = scopedHeroes();
    if (!heroes.length) {
      list.innerHTML = '<p class="empty">Aucun aventurier. Clique sur « + Nouvel Aventurier ».</p>';
      return;
    }
    const player = s.mode === 'player';
    list.innerHTML = heroes.map(function (h) {
      const gear = heroGear(h).map(function (it) { return it.name; });
      return '<div class="roster-card hero-card' + (player ? ' clickable-sheet' : '') + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '"' +
          (player ? ' data-sheet-hero="' + h.id + '" title="Voir la fiche complète"' : '') + '>' +
        '<div class="roster-head hero-head">' +
          '<span class="roster-name">' + esc(h.name) + '</span>' +
          (h.klass ? '<span class="class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
          (h.rapide ? '<span class="tag">Rapide</span>' : '') +
          (player ? '' : '<button class="ghost small" data-edit-hero="' + h.id + '">Éditer</button>') +
          '<button class="ghost small del-btn" data-del-hero="' + h.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="hero-stat-row">' +
          '<div class="hero-stat"><span class="hs-label">Points de Vie</span><span class="hs-val">' + heroPv(h) + '</span></div>' +
          '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(h) + '</span></div>' +
          '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + h.damage + '</span></div>' +
        '</div>' +
        // En mode Joueur, l'équipement n'est pas affiché ici (doublon avec l'onglet Inventaire)
        (player ? '' :
          '<div class="roster-section">' +
            '<div class="roster-label">Équipement</div>' +
            '<div class="roster-gear">' + (gear.length ? esc(gear.join(' · ')) : '<span class="hint">aucun</span>') + '</div>' +
          '</div>') +
        '<div class="roster-section">' +
          '<div class="roster-label">Attaques</div>' +
          '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(h)) + '</div>' +
        '</div>' +
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
  function heroSheetHtml(h) {
    const e = normalizeEquip(h.equipment);
    const gear = [e.mainG, e.mainD, e.armorId, e.objectId].map(itemById).filter(Boolean).map(function (it) { return it.name; });
    return (h.klass ? '<div class="sheet-class class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</div>' : '') +
      '<div class="hero-stat-row">' +
        '<div class="hero-stat"><span class="hs-label">Points de Vie</span><span class="hs-val">' + heroPv(h) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(h) + '</span></div>' +
        '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">+' + h.damage + '</span></div>' +
      '</div>' +
      '<div class="roster-section"><div class="roster-label">Équipement</div>' +
        '<div class="roster-gear">' + (gear.length ? esc(gear.join(' · ')) : '<span class="hint">aucun</span>') + '</div></div>' +
      '<div class="roster-section"><div class="roster-label">Attaques</div>' +
        '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(h)) + '</div></div>' +
      skillsSummary(h.skills) +
      (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '');
  }
  function openHeroSheet(id) {
    const h = Store.state.heroes.find(function (x) { return x.id === id; });
    if (!h) return;
    $('#hero-sheet-title').textContent = h.name;
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
  const WIZ_STEPS = ['Nom', 'Classe', 'Équipement', 'Compétences'];
  function openHeroWizard(advId) {
    wiz = { advId: advId, step: 0, name: '', klass: '', equipment: { mainG: null, mainD: null, armorId: null, objectId: null }, skills: [] };
    $('#hero-wizard-modal').hidden = false;
    renderWizard();
  }
  function updateWizNav() {
    let ok = true;
    if (wiz.step === 0) ok = !!wiz.name.trim();
    else if (wiz.step === 1) ok = !!wiz.klass;
    else if (wiz.step === 3) ok = wiz.skills.length === 2;
    const nb = $('#hw-next'); if (nb) nb.disabled = !ok;
  }
  function renderWizard() {
    const body = $('#hw-body');
    $('#hw-steps').innerHTML = WIZ_STEPS.map(function (s, i) {
      return '<span class="hw-step' + (i === wiz.step ? ' active' : '') + (i < wiz.step ? ' done' : '') + '">' + (i + 1) + '. ' + s + '</span>';
    }).join('');
    if (wiz.step === 0) {
      body.innerHTML = '<label>Nom de l\'aventurier<input type="text" id="hw-name" value="' + esc(wiz.name) + '" placeholder="Son nom…" /></label>';
      const inp = $('#hw-name');
      inp.oninput = function () { wiz.name = this.value; updateWizNav(); };
      setTimeout(function () { inp.focus(); }, 0);
    } else if (wiz.step === 1) {
      const classes = Store.loadClasses();
      body.innerHTML = '<p class="hint">Choisis une classe.</p><div class="hw-class-list">' +
        (classes.length ? classes.map(function (c) {
          return '<button type="button" class="hw-class klass-' + classSlug(c.name) + (wiz.klass === c.name ? ' selected' : '') + '" data-class="' + esc(c.name) + '">' +
            '<span class="hw-class-name">' + esc(c.name) + '</span><span class="hw-class-pv">PV +' + (CLASS_PV[c.name] || 0) + '</span></button>';
        }).join('') : '<p class="empty">Aucune classe définie.</p>') + '</div>';
      body.querySelectorAll('.hw-class').forEach(function (b) {
        b.onclick = function () { wiz.klass = this.getAttribute('data-class'); renderWizard(); };
      });
    } else if (wiz.step === 2) {
      const items = Store.state.items;
      const hands = items.filter(function (i) { return i.category === 'weapon' || (i.category === 'armor' && i.slot === 'shield'); });
      const bodies = items.filter(function (i) { return i.category === 'armor' && (i.slot || 'body') === 'body'; });
      const objects = items.filter(function (i) { return i.category === 'object' || i.category === 'misc'; });
      body.innerHTML = '<p class="hint">Équipement de départ (facultatif).</p>' +
        '<div class="form-row"><label>Main droite<select id="hw-maind"></select></label>' +
        '<label>Main gauche<select id="hw-maing"></select></label></div>' +
        '<div class="form-row"><label>Armure<select id="hw-armor"></select></label>' +
        '<label>Objet<select id="hw-object"></select></label></div>';
      fillEquipSelect($('#hw-maind'), hands, wiz.equipment.mainD, 'Vide');
      fillEquipSelect($('#hw-maing'), hands, wiz.equipment.mainG, 'Vide');
      fillEquipSelect($('#hw-armor'), bodies, wiz.equipment.armorId, 'Aucune');
      fillEquipSelect($('#hw-object'), objects, wiz.equipment.objectId, 'Aucun');
      $('#hw-maind').onchange = function () { wiz.equipment.mainD = this.value || null; };
      $('#hw-maing').onchange = function () { wiz.equipment.mainG = this.value || null; };
      $('#hw-armor').onchange = function () { wiz.equipment.armorId = this.value || null; };
      $('#hw-object').onchange = function () { wiz.equipment.objectId = this.value || null; };
    } else {
      body.innerHTML = '<p class="hint">Choisis <b>2 compétences</b> (chacune +1). ' + wiz.skills.length + '/2</p>' +
        '<div class="hw-skill-list">' + SKILLS.map(function (s) {
          return '<button type="button" class="hw-skill' + (wiz.skills.indexOf(s) >= 0 ? ' selected' : '') + '" data-skill="' + s + '">' + s + '</button>';
        }).join('') + '</div>';
      body.querySelectorAll('.hw-skill').forEach(function (b) {
        b.onclick = function () {
          const s = this.getAttribute('data-skill');
          const idx = wiz.skills.indexOf(s);
          if (idx >= 0) wiz.skills.splice(idx, 1);
          else { if (wiz.skills.length >= 2) return; wiz.skills.push(s); }
          renderWizard();
        };
      });
    }
    const back = $('#hw-back'); if (back) back.style.visibility = wiz.step === 0 ? 'hidden' : 'visible';
    const isLast = wiz.step === WIZ_STEPS.length - 1;
    const nb = $('#hw-next'); if (nb) nb.textContent = isLast ? '✓ Créer l\'aventurier' : 'Suivant →';
    updateWizNav();
  }
  function wizBack() { if (wiz && wiz.step > 0) { wiz.step--; renderWizard(); } }
  function wizNext() {
    if (!wiz || $('#hw-next').disabled) return;
    if (wiz.step < WIZ_STEPS.length - 1) { wiz.step++; renderWizard(); return; }
    const skills = {}; wiz.skills.forEach(function (s) { skills[s] = 1; });
    const eq = {
      mainG: wiz.equipment.mainG || null, mainD: wiz.equipment.mainD || null,
      armorId: wiz.equipment.armorId || null, objectId: wiz.equipment.objectId || null, twoH: false,
    };
    Store.state.heroes.push({
      id: Store.uid(), name: wiz.name.trim() || 'Aventurier', klass: wiz.klass,
      vie: 4, endu: 3, pvBonus: 0, damage: 2, rapide: false, notes: '',
      attacks: [], skills: mergeSkills(skills),
      equipment: eq,
      baseEquipment: JSON.parse(JSON.stringify(eq)),
      adventureId: wiz.advId || null,
    });
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
    heroAttacks = isEdit ? JSON.parse(JSON.stringify(h.attacks || [])) : [];
    buildAttacksEditor($('#h-attacks'), heroAttacks);
    heroSkills = isEdit ? mergeSkills(h.skills) : emptySkills();
    buildSkillsEditor($('#h-skills'), heroSkills);
    heroEquipment = isEdit ? normalizeEquip(h.equipment) : { mainG: null, mainD: null, armorId: null, objectId: null };
    buildHeroEquipmentUI();
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
      attacks: heroAttacks,
      skills: mergeSkills(heroSkills),
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
        '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>';

      const selEl  = row.querySelector('.tl-trigger');
      const lblEl  = row.querySelector('.tl-param-label');
      const paramIn = row.querySelector('.tl-param');

      function syncParam() {
        const def = triggerDef(t.trigger);
        lblEl.textContent = def.paramLabel + ' ';
        paramIn.value = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
      }
      syncParam();

      selEl.addEventListener('change', function () {
        const e = catalogEntry(selEl.value, null);
        const oldKey = triggerDef(t.trigger).paramKey;
        t.catId = e.id; t.trigger = e.trigger;
        const def = triggerDef(t.trigger);
        if (def.paramKey !== oldKey) delete t[oldKey];
        if (t[def.paramKey] === undefined) t[def.paramKey] = (e.defaultVal !== undefined) ? e.defaultVal : def.defaultVal;
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
      const val = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
      return '<span class="talent-badge">' + esc(entry.name) + ' ' + val + '</span>';
    }).join('');
  }

  // ---------- Onglet « Talents Adv. » (catalogue MJ/Admin) ----------
  function renderTalentsAdv() {
    const list = $('#talentadv-list');
    if (!list) return;
    const cat = montalentCatalog();
    if (!cat.length) {
      list.innerHTML = '<p class="empty">Aucun talent. Ajoute-en un avec le bouton ci-dessus.</p>';
      return;
    }
    list.innerHTML = cat.map(function (c, i) {
      const def = triggerDef(c.trigger);
      return '<div class="talentadv-card" data-i="' + i + '">' +
        '<div class="ta-row">' +
          '<input type="text" class="ta-name" value="' + esc(c.name) + '" placeholder="NOM" />' +
          '<select class="ta-trigger">' +
            TRIGGER_DEFS.map(function (d) {
              return '<option value="' + d.id + '"' + (c.trigger === d.id ? ' selected' : '') + '>' + esc(d.label) + '</option>';
            }).join('') +
          '</select>' +
          '<label class="ta-default">X par défaut <input type="number" class="ta-defval" min="0" value="' + (c.defaultVal !== undefined ? c.defaultVal : def.defaultVal) + '" style="width:60px" /></label>' +
          '<button type="button" class="icon-btn ta-del" title="Supprimer">✕</button>' +
        '</div>' +
        '<input type="text" class="ta-desc" value="' + esc(c.desc || '') + '" placeholder="Description (X = valeur variable)" />' +
      '</div>';
    }).join('');

    function commit() { Store.saveMonsterTalents(cat); }

    list.querySelectorAll('.talentadv-card').forEach(function (card) {
      const i = +card.getAttribute('data-i');
      card.querySelector('.ta-name').addEventListener('input', function () { cat[i].name = this.value; commit(); });
      card.querySelector('.ta-trigger').addEventListener('change', function () { cat[i].trigger = this.value; commit(); });
      card.querySelector('.ta-defval').addEventListener('input', function () { cat[i].defaultVal = Math.max(0, parseInt(this.value, 10) || 0); commit(); });
      card.querySelector('.ta-desc').addEventListener('input', function () { cat[i].desc = this.value; commit(); });
      card.querySelector('.ta-del').addEventListener('click', function () {
        if (!confirm('Supprimer ce talent du catalogue ?')) return;
        cat.splice(i, 1); commit(); renderTalentsAdv();
      });
    });
  }

  function addMonsterTalentToCatalog() {
    const cat = montalentCatalog();
    cat.push({ id: 'tal_' + Store.uid(), name: 'NOUVEAU', trigger: 'flee_on_big_hit', defaultVal: 10, desc: '' });
    Store.saveMonsterTalents(cat);
    renderTalentsAdv();
  }

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
    heroGear: heroGear,
    normalizeEquip: normalizeEquip,
    weaponAttacks: weaponAttacks,
    monsterCombatAttacks: monsterCombatAttacks,
    monsterTotalDef: monsterTotalDef,
    heroPv: heroPv,
    heroCurPv: heroCurPv,
    heroRestShort: heroRestShort,
    heroRestLong: heroRestLong,
    heroDef: heroDef,
    heroCombatAttacks: heroCombatAttacks,
    attacksSummary: attacksSummary,
    heroCardHtml: heroCardHtml,
    TYPE_LABEL: TYPE_LABEL,
    MENACE_LABEL: MENACE_LABEL,
    RANGE_LABEL: RANGE_LABEL,
  };
})(window);
