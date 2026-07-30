/*
 * Éditeur des talents génériques et de classe (partie MJ / Admin).
 * Reprend le design de l'Armurerie : carte d'en-tête, recherche, colonnes à
 * languettes (une colonne par groupe : Génériques + 8 classes), édition par
 * mini-fenêtre. Chaque talent peut être relié à un EFFET de la bibliothèque
 * (Action bleu · Réaction violet · Passif vert · Amélioration ambre).
 */
(function (global) {
  'use strict';

  const D = (typeof AmertumeDice !== 'undefined') ? AmertumeDice : null;
  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Toutes les classes connues (données préservées même pour les classes cachées)
  const CLASS_NAMES_ALL = ['Apothicaire', 'Artificier', 'Chasseur', 'Destructeur', 'Déviant',
    'Gardien', 'Lamevent', 'Mystique'];
  // Classes actuellement affichées (sync avec PLAYABLE_CLASSES dans combatants.js)
  const CLASS_NAMES = ['Destructeur', 'Gardien', 'Lamevent', 'Mystique'];
  const USAGE = [
    { value: 'both',   label: 'Combat & hors combat' },
    { value: 'combat', label: 'En combat' },
    { value: 'out',    label: 'Hors combat' },
  ];
  const KIND_LABEL = { action: 'Action', reaction: 'Réaction', passive: 'Passif', critique: 'Critique', garde: 'Garde', upgrade: 'Amélioration', mastery: 'Maîtrise', espece: 'Espèce', parchemin: 'Parchemin' };
  const KIND_SHORT = { action: 'ACT', reaction: 'REAC', passive: 'PASS', critique: 'CRIT', garde: 'GARD', upgrade: 'AME', mastery: 'MAIT', espece: 'ESP', parchemin: 'PAR' };
  const KIND_ORDER = ['action', 'reaction', 'passive', 'critique', 'garde', 'upgrade', 'mastery', 'espece', 'parchemin'];
  // Libellés lisibles des valeurs de choix (les états internes → noms affichés).
  const CHOICE_LABELS = { '': '— Aucun —', feu: 'Feu', gele: 'Gelé', auSol: 'Au sol', affaibli: 'Affaibli', brise: 'Brisé', faille: 'Faille', poison: 'Poison', sbire: 'Sbires', elite: 'Alpha / Solitaire / Boss' };

  let classes = [];
  let generics = [];
  let advTalents = []; // talents adverses nommés (effet-based)
  let parchTalents = []; // talents dédiés aux parchemins (accessibles via objets seulement)
  let term = '';
  let groupFilter = '';

  function effectCatalog() { return Store.talentEffects ? Store.talentEffects() : []; }
  function effectMap() { return Store.talentEffectMap ? Store.talentEffectMap() : {}; }
  function classSlug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  let hiddenClasses = []; // classes non-jouables chargées mais non affichées
  function load() {
    const stored = Store.loadClasses();
    const byName = {};
    stored.forEach(function (c) { byName[c.name] = c; });
    classes = CLASS_NAMES.map(function (name) {
      const c = byName[name] || { name: name, talents: [] };
      if (!Array.isArray(c.talents)) c.talents = [];
      return c;
    });
    // Préserver les données des classes cachées pour ne pas les perdre lors d'un save()
    hiddenClasses = CLASS_NAMES_ALL.filter(function (n) { return CLASS_NAMES.indexOf(n) < 0; })
      .map(function (name) { return byName[name] || { name: name, talents: [] }; });
    generics = Store.loadGenericTalents();
    advTalents = Store.loadAdvTalents();
    parchTalents = Store.loadParchTalents ? Store.loadParchTalents() : [];
  }
  // Sauvegarde les classes affichées + les classes cachées (données préservées)
  function save() { Store.saveClasses(classes.concat(hiddenClasses)); }
  function saveGen() { Store.saveGenericTalents(generics); }
  function persist() {
    save(); saveGen(); Store.saveAdvTalents(advTalents);
    if (Store.saveParchTalents) Store.saveParchTalents(parchTalents);
  }

  function newTalent() {
    // Par défaut « En combat » : c'est de loin le cas le plus fréquent.
    return { id: Store.uid(), name: '', level: 1, usage: 'combat', kind: '', effects: [], description: '' };
  }

  // Type effectif d'un talent (depuis son effet si le kind n'est pas stocké)
  function talentKind(t) {
    return t.kind || (t.effect && effectMap()[t.effect] ? effectMap()[t.effect].kind : '');
  }
  // Tri des talents : par Niveau, puis par Type (KIND_ORDER), puis alphabétique.
  let sortMode = 'level'; // 'level' | 'name'
  function sortTalents(list) {
    return list.slice().sort(function (a, b) {
      if (sortMode === 'name') return (a.name || '').localeCompare(b.name || '');
      const lvl = (a.level || 1) - (b.level || 1);
      if (lvl) return lvl;
      const ka = KIND_ORDER.indexOf(talentKind(a)); const kb = KIND_ORDER.indexOf(talentKind(b));
      const ra = ka < 0 ? 99 : ka; const rb = kb < 0 ? 99 : kb;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }
  function emptyPool() { return D ? D.emptyPool() : { black: 0, red: 0, blue: 0, green: 0, yellow: 0, white: 0, bone: 0 }; }

  // Liste des groupes (Génériques + chaque classe), avec leur tableau de talents
  function groups() {
    const g = [{ key: 'generic', ref: 'generic', name: '★ Génériques', slug: 'generique', list: generics }];
    classes.forEach(function (c) {
      g.push({ key: 'class', ref: c.name, name: c.name, slug: classSlug(c.name), list: c.talents });
    });
    // Talents de PARCHEMIN : accessibles uniquement via un objet Parchemin
    // (jamais débloqués par niveau) — pas de niveau affiché.
    g.push({ key: 'parchment', ref: 'parchment', name: '📜 Parchemins', slug: 'parchemin', list: parchTalents });
    // Groupe des talents adverses (même pool d'effets, noms propres aux adversaires).
    g.push({ key: 'adversary', ref: 'adversary', name: '⚔️ Adversaires', slug: 'adversaire', list: advTalents });
    return g;
  }
  function groupByRef(ref) { return groups().find(function (g) { return g.ref === ref; }) || null; }

  // ---- Bibliothèque des effets (panneau de référence repliable) ----
  // Organisée par CATÉGORIES thématiques (mêmes groupes que le sélecteur
  // d'effet), avec recherche instantanée sur le nom et la description.
  function effectCategories() { return Store.effectCategories ? Store.effectCategories() : []; }
  function effectSearchKey(e) {
    return ((e.name || '') + ' ' + (e.desc || '') + ' ' + (e.effect || '')).toLowerCase();
  }
  function libraryHTML() {
    const cat = effectCatalog();
    const byCat = {};
    cat.forEach(function (e) { const c = e.cat || 'attaque'; (byCat[c] = byCat[c] || []).push(e); });
    const sections = effectCategories().filter(function (c) { return byCat[c.key]; }).map(function (c) {
      const rows = byCat[c.key].map(function (e) {
        return '<div class="lib-row" data-search="' + esc(effectSearchKey(e)) + '">' +
          '<span class="tl-kind tl-kind-' + e.kind + '" title="' + esc(KIND_LABEL[e.kind] || e.kind) + '">' + esc(KIND_SHORT[e.kind] || e.kind) + '</span>' +
          '<b class="lib-eff-name">' + esc(e.name) + '</b>' +
          '<span class="lib-eff-desc">' + esc(e.desc) + '</span>' +
          (e.hasVal ? '<span class="lib-eff-var">X = ' + esc(e.valLabel || 'valeur') + '</span>' : '') +
        '</div>';
      }).join('');
      return '<div class="lib-cat">' +
        '<div class="lib-cat-head">' + esc(c.icon) + ' ' + esc(c.label) +
          ' <span class="tag">' + byCat[c.key].length + '</span></div>' + rows + '</div>';
    }).join('');
    return '<details class="card lib-card">' +
      '<summary><b>📖 Bibliothèque des effets</b> — ' + cat.length + ' effets câblés au moteur, ' +
        effectCategories().length + ' catégories</summary>' +
      '<p class="hint">Chaque effet est actif en combat dès qu\'un talent y est relié. Types : ' +
        '<span class="lib-leg tl-kind-action">Action</span> · ' +
        '<span class="lib-leg tl-kind-reaction">Réaction</span> · ' +
        '<span class="lib-leg tl-kind-passive">Passif</span> · ' +
        '<span class="lib-leg tl-kind-upgrade">Amélioration</span> · ' +
        '<span class="lib-leg tl-kind-mastery">Maîtrise</span>.</p>' +
      '<input type="search" id="lib-search" placeholder="🔍 Rechercher un effet… (nom, description)" />' +
      '<div class="lib-cats">' + sections + '</div>' +
    '</details>';
  }
  // Recherche instantanée dans la bibliothèque : filtre les lignes, masque les
  // catégories vides.
  function wireLibrary(root) {
    const input = root.querySelector('#lib-search');
    if (!input) return;
    input.addEventListener('input', function () {
      const q = input.value.toLowerCase().trim();
      root.querySelectorAll('.lib-cat').forEach(function (catBox) {
        let any = false;
        catBox.querySelectorAll('.lib-row').forEach(function (r) {
          const hit = !q || (r.getAttribute('data-search') || '').indexOf(q) >= 0;
          r.hidden = !hit;
          if (hit) any = true;
        });
        catBox.hidden = !any;
      });
    });
  }

  function render() {
    load();
    const root = $('#classes-root');
    if (!root) return;
    // L'onglet Classes ne montre que les classes et les génériques — le groupe
    // « Adversaires » est réservé à l'onglet Talents Adv.
    const groupOpts = '<option value="">Tous les groupes</option>' +
      groups().filter(function (g) { return g.ref !== 'adversary'; }).map(function (g) {
        return '<option value="' + esc(g.ref) + '"' + (g.ref === groupFilter ? ' selected' : '') + '>' +
          esc(g.name.replace('★ ', '')) + '</option>';
      }).join('');
    root.innerHTML =
      libraryHTML() +
      '<div class="card">' +
        '<div class="card-head">' +
          '<h2>Talents</h2>' +
          '<div style="display:flex; gap:.4rem;">' +
            '<button id="tl-add" class="primary">+ Ajouter</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint">Catalogue des talents d\'aventuriers. Le premier groupe rassemble les ' +
          '<b>talents génériques</b> (accessibles à tous au niveau requis) ; viennent ensuite ' +
          'les talents propres à chaque classe.</p>' +
        '<div class="filters">' +
          '<input id="tl-search" type="search" placeholder="Rechercher…" value="' + esc(term) + '" />' +
          '<select id="tl-groupfilter">' + groupOpts + '</select>' +
          '<select id="tl-sort">' +
            '<option value="level"' + (sortMode === 'level' ? ' selected' : '') + '>Tri : niveau</option>' +
            '<option value="name"' + (sortMode === 'name' ? ' selected' : '') + '>Tri : nom</option>' +
          '</select>' +
        '</div>' +
        '<div id="class-list" class="roster-list inv-strip-layout"></div>' +
      '</div>';
    wireLibrary(root);
    $('#tl-add').addEventListener('click', function () { openTalentModal(null); });
    $('#tl-search').addEventListener('input', function () { term = this.value.toLowerCase().trim(); renderColumns(); });
    $('#tl-groupfilter').addEventListener('change', function () { groupFilter = this.value; renderColumns(); });
    $('#tl-sort').addEventListener('change', function () { sortMode = this.value; renderColumns(); });
    renderColumns();
  }

  function matches(t) {
    if (!term) return true;
    return (t.name || '').toLowerCase().indexOf(term) >= 0 ||
           (t.description || '').toLowerCase().indexOf(term) >= 0;
  }

  // Languette d'un talent (design Armurerie), colorée par type d'effet
  // Nom d'un talent (tous groupes) à partir de son id.
  function talentNameById(id) {
    if (!id) return '';
    let found = '';
    groups().forEach(function (g) {
      (g.list || []).forEach(function (t) { if (t.id === id) found = t.name || ''; });
    });
    return found;
  }
  function talentStrip(t, ref, opts) {
    opts = opts || {};
    const kind = t.kind || (t.effect && effectMap()[t.effect] ? effectMap()[t.effect].kind : '');
    const right =
      (kind ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_SHORT[kind] || kind) + '</span>' : '<span class="tl-kind tl-kind-none">Descriptif</span>') +
      // Les adversaires n'ont pas de niveau : on masque « Niv. x » (opts.hideLevel).
      (opts.hideLevel ? '' : '<span class="tal-lvl">Niv. ' + (t.level || 1) + '</span>');
    // Talent avec prérequis : seulement une flèche d'arborescence devant le nom
    // (même design que l'onglet Talents du mode Joueur), pas le nom complet du prérequis.
    const prereqName = t.prereq ? talentNameById(t.prereq) : '';
    const upgradeMark = prereqName ? '<span class="tpe-upgrade-arrow" title="Évolution de : ' + esc(prereqName) + '">↳</span> ' : '';
    const hidden = !!t.hidden;
    return '<div class="tal-row-wrap">' +
      '<div class="inv-strip-row tal-row tal-kind-' + (kind || 'none') + (hidden ? ' tal-hidden' : '') + '">' +
        '<div class="inv-strip tal-strip" data-desc-toggle="1" title="Voir le descriptif">' +
          '<span class="inv-strip-name">' + upgradeMark + esc(t.name || '(sans nom)') + '</span>' +
          '<span class="inv-strip-val">' + right + '</span>' +
        '</div>' +
        // L'œil (masquer aux aventuriers) n'a pas de sens pour les talents
        // d'adversaires : on l'omet dans l'onglet Talents Adv. (opts.hideEye).
        (opts.hideEye ? '' :
          '<button class="inv-strip-eye' + (hidden ? ' off' : '') + '" data-eye="' + esc(ref) + '" data-tid="' + esc(t.id) + '" ' +
            'title="' + (hidden ? 'Talent masqué aux aventuriers — cliquer pour réactiver' : 'Masquer ce talent aux aventuriers') + '">' +
            (hidden ? '🙈' : '👁') + '</button>') +
        '<button class="inv-strip-edit" data-edit="' + esc(ref) + '" data-tid="' + esc(t.id) + '" title="Éditer">✎</button>' +
      '</div>' +
      (t.description ? '<div class="tal-strip-desc" hidden>' + esc(t.description) + '</div>' : '') +
    '</div>';
  }

  function renderColumns() {
    const box = $('#class-list');
    if (!box) return;
    const shown = groups().filter(function (g) { return g.ref !== 'adversary' && (!groupFilter || g.ref === groupFilter); });
    box.innerHTML = '<div class="tal-cols">' + shown.map(function (g) {
      const items = sortTalents(g.list.filter(matches));
      // Colonne Parchemins : pas de niveau (accès via objet uniquement), pas d'œil.
      const stripOpts = g.ref === 'parchment' ? { hideLevel: true, hideEye: true } : {};
      const strips = items.length
        ? items.map(function (t) { return talentStrip(t, g.ref, stripOpts); }).join('')
        : '<p class="inv-col-empty">—</p>';
      return '<div class="tal-col">' +
        '<div class="tal-col-hdr klass-' + g.slug + '">' +
          '<span class="tal-col-name">' + esc(g.name) + '</span>' +
          '<span class="tag">' + g.list.length + '</span>' +
          '<button class="ghost small tl-col-add" data-ref="' + esc(g.ref) + '">+</button>' +
        '</div>' +
        '<div class="tal-col-body">' + strips + '</div>' +
      '</div>';
    }).join('') + '</div>';

    box.querySelectorAll('.tl-col-add').forEach(function (b) {
      b.addEventListener('click', function () { openTalentModal(null, b.getAttribute('data-ref')); });
    });
    // L'œil masque/réaffiche le talent aux aventuriers (non débloquable ni
    // visible dans les aventures tant qu'il est masqué).
    box.querySelectorAll('.inv-strip-eye[data-eye]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const g = groupByRef(el.getAttribute('data-eye'));
        const t = g && g.list.find(function (x) { return x.id === el.getAttribute('data-tid'); });
        if (!t) return;
        t.hidden = !t.hidden;
        persist();
        renderColumns();
      });
    });
    // Le crayon ouvre l'éditeur ; le corps de la languette déroule le descriptif.
    box.querySelectorAll('.inv-strip-edit[data-edit]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTalentModal(el.getAttribute('data-tid'), el.getAttribute('data-edit'));
      });
    });
    box.querySelectorAll('.tal-strip[data-desc-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        const wrap = el.closest('.tal-row-wrap');
        const desc = wrap ? wrap.querySelector('.tal-strip-desc') : null;
        if (desc) desc.hidden = !desc.hidden;
      });
    });
  }

  // ---- Mini-fenêtre d'édition d'un talent ----
  let editing = null; // { ref, id } du talent en cours d'édition (null = création)

  // ---- Sélecteur d'effet structuré (Type → Catégorie → Effet + recherche) ----
  // Types réellement présents dans le catalogue (chips de filtre du sélecteur).
  const PICKER_KINDS = ['action', 'reaction', 'passive', 'upgrade', 'mastery'];
  // Construit la liste des effets du panneau selon le filtre de type et la
  // recherche de la ligne. Les effets sont groupés par catégorie thématique.
  function buildPickerList(row) {
    const box = row.querySelector('.tl-eff-optlist');
    if (!box) return;
    const q = (row._pickTerm || '').toLowerCase().trim();
    const kindFilter = row._pickKind || '';
    const cur = row.querySelector('.tl-eff-effect').value;
    const cat = effectCatalog().filter(function (e) {
      if (kindFilter && e.kind !== kindFilter) return false;
      return !q || effectSearchKey(e).indexOf(q) >= 0;
    });
    const byCat = {};
    cat.forEach(function (e) { const c = e.cat || 'attaque'; (byCat[c] = byCat[c] || []).push(e); });
    let html = (!q && !kindFilter)
      ? '<button type="button" class="tl-eff-opt tl-eff-opt-none' + (cur ? '' : ' selected') + '" data-key="">— Aucun effet (talent descriptif) —</button>'
      : '';
    effectCategories().filter(function (c) { return byCat[c.key]; }).forEach(function (c) {
      html += '<div class="tl-eff-cat-hdr">' + esc(c.icon) + ' ' + esc(c.label) + '</div>' +
        byCat[c.key].map(function (e) {
          return '<button type="button" class="tl-eff-opt' + (e.effect === cur ? ' selected' : '') + '" data-key="' + esc(e.effect) + '">' +
            '<span class="tl-kind tl-kind-' + e.kind + '">' + esc(KIND_SHORT[e.kind] || e.kind) + '</span>' +
            '<b>' + esc(e.name) + '</b>' +
            '<span class="tl-eff-opt-desc">' + esc(e.desc) + '</span>' +
          '</button>';
        }).join('');
    });
    box.innerHTML = html || '<p class="inv-col-empty">Aucun effet ne correspond à la recherche.</p>';
    box.querySelectorAll('.tl-eff-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        row.querySelector('.tl-eff-effect').value = b.getAttribute('data-key') || '';
        row.querySelector('.tl-eff-picker').hidden = true;
        syncEffectRow(row);
      });
    });
  }
  function openPicker(row) {
    const panel = row.querySelector('.tl-eff-picker');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      buildPickerList(row);
      const s = row.querySelector('.tl-eff-search');
      if (s) { s.value = row._pickTerm || ''; s.focus(); }
    }
  }
  function groupOptions(cur) {
    return groups().map(function (g) {
      return '<option value="' + esc(g.ref) + '"' + (g.ref === cur ? ' selected' : '') + '>' +
        esc(g.name.replace('★ ', '')) + '</option>';
    }).join('');
  }

  // Options de prérequis : tous les talents (génériques + classes), sauf celui édité.
  // Regroupés par groupe pour s'y retrouver. `cur` = id prérequis sélectionné.
  function prereqOptions(selfId, cur) {
    let html = '<option value="">— Aucun —</option>';
    groups().forEach(function (g) {
      const list = (g.list || []).filter(function (t) { return t.id && t.id !== selfId; });
      if (!list.length) return;
      html += '<optgroup label="' + esc(g.name.replace('★ ', '')) + '">' +
        list.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.name || '(sans nom)') + '</option>';
        }).join('') +
      '</optgroup>';
    });
    return html;
  }

  function findTalent(ref, id) {
    const g = groupByRef(ref);
    if (!g) return null;
    return g.list.find(function (t) { return t.id === id; }) || null;
  }

  // ---- Lignes d'effet (multi-effets, chacune avec ses paramètres) ----
  // Met à jour le bouton de sélection, la description et les champs
  // conditionnels (X, portée, dés, choix, cibles) d'une ligne selon l'effet choisi.
  function syncEffectRow(row) {
    const eff = effectMap()[row.querySelector('.tl-eff-effect').value] || null;
    // Bouton de sélection : vignette de type colorée + nom de l'effet choisi.
    const pickBtn = row.querySelector('.tl-eff-pick');
    if (pickBtn) {
      pickBtn.innerHTML = eff
        ? '<span class="tl-kind tl-kind-' + eff.kind + '">' + esc(KIND_SHORT[eff.kind] || eff.kind) + '</span> <b>' + esc(eff.name) + '</b> <span class="tl-eff-pick-caret">▾</span>'
        : '🔍 Choisir un effet… <span class="tl-eff-pick-caret">▾</span>';
      pickBtn.classList.toggle('tl-eff-pick-empty', !eff);
    }
    // Description complète de l'effet sélectionné, toujours visible sous la ligne.
    const descBox = row.querySelector('.tl-eff-seldesc');
    if (descBox) {
      descBox.textContent = eff ? eff.desc : '';
      descBox.hidden = !eff;
    }
    const valWrap = row.querySelector('.tl-eff-val-wrap');
    const rangeWrap = row.querySelector('.tl-eff-range-wrap');
    const diceWrap = row.querySelector('.tl-eff-dice-wrap');
    // Portée des cibles (Nombre X / Toute la zone / Tout le combat) pour les effets multi-cibles.
    const scopeWrap = row.querySelector('.tl-eff-scope-wrap');
    const scopeSel = scopeWrap ? scopeWrap.querySelector('.tl-eff-scope') : null;
    const hasScope = !!(eff && eff.hasScope);
    if (scopeWrap) { scopeWrap.hidden = !hasScope; if (hasScope && scopeSel) scopeSel.value = row._scope || 'count'; }
    const scopeVal = scopeSel ? scopeSel.value : 'count';
    // X masqué si la portée vise tout (zone / combat).
    valWrap.hidden = !(eff && eff.hasVal) || (hasScope && scopeVal !== 'count');
    if (eff && eff.hasVal) {
      // Les effets valDice acceptent un tirage : « 3 » ou « 1d6+1 ».
      row.querySelector('.tl-eff-val-label').textContent = (eff.valLabel || 'Valeur X') +
        (eff.valDice ? ' (fixe ou dés, ex. 1d6)' : '');
    }
    // Camp visé (adversaires / alliés / tout le monde) pour les effets de zone.
    const sideWrap = row.querySelector('.tl-eff-side-wrap');
    const sideSel = sideWrap ? sideWrap.querySelector('.tl-eff-side') : null;
    if (sideWrap) {
      sideWrap.hidden = !(eff && eff.hasSide);
      if (eff && eff.hasSide && sideSel) {
        // Défaut selon le GROUPE du talent : un talent d'adversaire vise les
        // Aventuriers, tous les autres visent les Adversaires. Modifiable à la
        // main ; une valeur déjà choisie ou enregistrée est conservée.
        const grpSel = document.getElementById('tl-f-group');
        const dflt = (grpSel && grpSel.value === 'adversary') ? 'heroes' : 'monsters';
        // Anciennes valeurs RELATIVES ('foes'/'allies'/'both') : équivalent absolu
        // le plus probable ; la valeur n'est réécrite qu'à l'enregistrement.
        const v = row._side || dflt;
        sideSel.value = v === 'foes' ? 'monsters' : v === 'allies' ? 'heroes' : v === 'both' ? 'all' : v;
        if (!sideSel.value) sideSel.value = dflt;
      }
    }
    rangeWrap.hidden = !(eff && eff.hasRange);
    diceWrap.hidden = !(eff && eff.hasDice);
    // Choix paramétrable (compétence, état infligé…) : peuple et affiche le select.
    const choiceWrap = row.querySelector('.tl-eff-choice-wrap');
    if (choiceWrap) {
      const hasChoice = !!(eff && eff.hasChoice);
      choiceWrap.hidden = !hasChoice;
      if (hasChoice) {
        const sel = choiceWrap.querySelector('.tl-eff-choice');
        const prev = row._choice || sel.value || '';
        row.querySelector('.tl-eff-choice-label').textContent = eff.choiceLabel || 'Choix';
        sel.innerHTML = (eff.choices || []).map(function (ch) {
          return '<option value="' + esc(ch) + '"' + (ch === prev ? ' selected' : '') + '>' + esc(CHOICE_LABELS[ch] || ch) + '</option>';
        }).join('');
      }
    }
    const kind = eff ? eff.kind : '';
    row.querySelector('.tl-eff-kind').innerHTML = kind
      ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_LABEL[kind]) + '</span>'
      : '<span class="hint">Descriptif</span>';
  }

  function addEffectRow(e) {
    e = e || {};
    const list = $('#tl-f-effects');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'tl-eff-row';
    row.innerHTML =
      '<div class="tl-eff-top">' +
        '<input type="hidden" class="tl-eff-effect" value="' + esc(Store.canonicalEffect ? Store.canonicalEffect(e.effect || '') : (e.effect || '')) + '" />' +
        '<button type="button" class="tl-eff-pick" title="Choisir l\'effet de ce talent"></button>' +
        '<button type="button" class="tl-eff-del" title="Retirer cet effet">✕</button>' +
      '</div>' +
      '<div class="tl-eff-picker" hidden>' +
        '<input type="search" class="tl-eff-search" placeholder="🔍 Rechercher… (nom, description)" />' +
        '<div class="tl-eff-kindchips">' +
          '<button type="button" class="tl-eff-chip selected" data-kind="">Tous</button>' +
          PICKER_KINDS.map(function (k) {
            return '<button type="button" class="tl-eff-chip tl-chip-' + k + '" data-kind="' + k + '">' + esc(KIND_LABEL[k]) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="tl-eff-optlist"></div>' +
      '</div>' +
      '<p class="tl-eff-seldesc hint" hidden></p>' +
      // Paramètres : une grille de champs uniformes — libellé AU-DESSUS de son
      // contrôle, champs alignés, les dés sur leur propre ligne pleine largeur.
      '<div class="tl-eff-params">' +
        '<span class="tl-eff-kind"></span>' +
        '<label class="tl-eff-field tl-eff-val-wrap" hidden><span class="tl-eff-lbl tl-eff-val-label">Valeur X</span>' +
          '<input type="text" class="tl-eff-val" inputmode="numeric" value="' + esc(e.val != null ? e.val : 0) + '" /></label>' +
        '<label class="tl-eff-field tl-eff-scope-wrap" hidden><span class="tl-eff-lbl">Cibles</span>' +
          '<select class="tl-eff-scope">' +
            '<option value="count">Nombre X</option>' +
            '<option value="zone">Toute la zone</option>' +
            '<option value="all">Tout le combat</option>' +
          '</select></label>' +
        '<label class="tl-eff-field tl-eff-side-wrap" hidden><span class="tl-eff-lbl">Camp visé</span>' +
          '<select class="tl-eff-side" title="Camp touché, quel que soit le porteur du talent">' +
            '<option value="monsters">Adversaires</option>' +
            '<option value="heroes">Aventuriers</option>' +
            '<option value="all">Tous les Combattants</option>' +
          '</select></label>' +
        '<label class="tl-eff-field tl-eff-range-wrap" hidden><span class="tl-eff-lbl">Portée</span>' +
          '<select class="tl-eff-range">' +
            '<option value="contact"' + (e.range === 'contact' ? ' selected' : '') + '>Au contact</option>' +
            '<option value="distance"' + (e.range === 'distance' ? ' selected' : '') + '>À distance</option>' +
          '</select></label>' +
        '<label class="tl-eff-field tl-eff-choice-wrap" hidden><span class="tl-eff-lbl tl-eff-choice-label">Choix</span>' +
          '<select class="tl-eff-choice"></select></label>' +
        '<div class="tl-eff-field tl-eff-dice-wrap" hidden><span class="tl-eff-lbl tl-eff-dice-label">Dés de dégâts</span>' +
          '<div class="tl-eff-dice dice-steppers"></div></div>' +
      '</div>';
    list.appendChild(row);
    // Choix mémorisé (compétence, état…) pour réafficher la sélection à l'édition.
    row._choice = e.choice || '';
    row._scope = e.scope || 'count';
    row._side = e.side || '';
    // Pool de dés propre à la ligne (référence mutée par les steppers)
    row._pool = Object.assign(emptyPool(), e.dice || {});
    if (Inventory && Inventory.buildDiceSteppers) {
      Inventory.buildDiceSteppers(row.querySelector('.tl-eff-dice'), row._pool);
    }
    row.querySelector('.tl-eff-pick').addEventListener('click', function () { openPicker(row); });
    row.querySelector('.tl-eff-search').addEventListener('input', function () {
      row._pickTerm = this.value; buildPickerList(row);
    });
    row.querySelectorAll('.tl-eff-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        row._pickKind = chip.getAttribute('data-kind') || '';
        row.querySelectorAll('.tl-eff-chip').forEach(function (c) { c.classList.toggle('selected', c === chip); });
        buildPickerList(row);
      });
    });
    row.querySelector('.tl-eff-del').addEventListener('click', function () { row.remove(); });
    const choiceSel = row.querySelector('.tl-eff-choice');
    if (choiceSel) choiceSel.addEventListener('change', function () { row._choice = choiceSel.value; });
    const scopeSel2 = row.querySelector('.tl-eff-scope');
    if (scopeSel2) scopeSel2.addEventListener('change', function () { row._scope = scopeSel2.value; syncEffectRow(row); });
    const sideSel2 = row.querySelector('.tl-eff-side');
    if (sideSel2) sideSel2.addEventListener('change', function () { row._side = sideSel2.value; syncEffectRow(row); });
    syncEffectRow(row);
    return row;
  }

  function openTalentModal(id, ref) {
    const m = $('#talent-modal');
    if (!m) return;
    const existing = (id && ref) ? findTalent(ref, id) : null;
    editing = existing ? { ref: ref, id: id } : null;
    const t = existing || newTalent();

    $('#talent-modal-title').textContent = existing ? 'Éditer le talent' : 'Ajouter un talent';
    $('#tl-f-id').value = t.id;
    $('#tl-f-name').value = t.name || '';
    $('#tl-f-group').innerHTML = groupOptions(ref || 'generic');
    // Le camp visé PAR DÉFAUT dépend du groupe : re-synchronise les lignes
    // d'effet dont le camp n'a pas été fixé à la main.
    $('#tl-f-group').onchange = function () {
      document.querySelectorAll('#tl-f-effects .tl-eff-row').forEach(function (row) {
        if (!row._side) syncEffectRow(row);
      });
    };
    $('#tl-f-level').value = t.level || 1;
    $('#tl-f-usage').value = t.usage || 'both';
    if ($('#tl-f-kind')) $('#tl-f-kind').value = t.kindOverride || '';
    const prereqSel = $('#tl-f-prereq');
    if (prereqSel) prereqSel.innerHTML = prereqOptions(t.id, t.prereq || '');
    $('#tl-f-desc').value = t.description || '';
    $('#tl-f-delete').hidden = !existing;
    // Reconstruit les lignes d'effet à partir du talent (multi-effets ou ancien mono-effet)
    $('#tl-f-effects').innerHTML = '';
    const effs = Store.talentEffectList(t);
    effs.forEach(function (e) { addEffectRow(e); });
    if (!effs.length) addEffectRow({});
    m.hidden = false;
    $('#tl-f-name').focus();
  }

  function closeTalentModal() { $('#talent-modal').hidden = true; editing = null; }

  function submitTalent(ev) {
    ev.preventDefault();
    const targetRef = $('#tl-f-group').value;
    const cat = effectMap();
    // Collecte les lignes d'effet (dans l'ordre affiché)
    const effects = [];
    $('#tl-f-effects').querySelectorAll('.tl-eff-row').forEach(function (row) {
      const key = row.querySelector('.tl-eff-effect').value;
      if (!key) return;
      const meta = cat[key] || {};
      const e = { effect: key };
      if (meta.hasVal) {
        const raw = (row.querySelector('.tl-eff-val').value || '').trim();
        // Effets valDice : « 1d6+1 » conservé tel quel (tiré au moment du soin).
        if (meta.valDice && Store.isDiceExpr && Store.isDiceExpr(raw)) e.val = raw;
        else e.val = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
      }
      if (meta.hasRange) e.range = row.querySelector('.tl-eff-range').value || 'contact';
      if (meta.hasDice) e.dice = Object.assign(emptyPool(), row._pool || {});
      if (meta.hasChoice) {
        const cs = row.querySelector('.tl-eff-choice');
        e.choice = (cs && cs.value) || (meta.choices && meta.choices[0]) || '';
      }
      if (meta.hasSide) e.side = row.querySelector('.tl-eff-side').value || 'monsters';
      if (meta.hasScope) {
        const ss = row.querySelector('.tl-eff-scope');
        e.scope = (ss && ss.value) || 'count';
      }
      effects.push(e);
    });
    const first = effects[0] || null;
    const firstMeta = first ? (cat[first.effect] || {}) : null;
    const kindOverride = ($('#tl-f-kind') && $('#tl-f-kind').value) || '';
    // Conserve l'état « masqué » (œil) à travers l'édition du talent.
    const existingHidden = (function () {
      if (!editing) return false;
      const og = groupByRef(editing.ref);
      const ex = og && og.list.find(function (x) { return x.id === editing.id; });
      return ex ? !!ex.hidden : false;
    })();
    const data = {
      id: $('#tl-f-id').value || Store.uid(),
      name: ($('#tl-f-name').value || '').trim() || 'Talent',
      level: Math.max(1, Math.min(Store.maxLevel(), parseInt($('#tl-f-level').value, 10) || 1)),
      usage: $('#tl-f-usage').value,
      effects: effects,
      // Champs « représentatifs » conservés pour la rétro-compat (affichage, coloration)
      effect: first ? first.effect : '',
      // Vignette : override manuel (ex. CRITIQUE) sinon type dérivé du 1ᵉʳ effet.
      kindOverride: kindOverride,
      kind: kindOverride || (firstMeta ? firstMeta.kind : ''),
      val: (first && first.val != null) ? first.val : 0,
      prereq: (($('#tl-f-prereq') && $('#tl-f-prereq').value) || '') || null,
      description: ($('#tl-f-desc').value || '').trim(),
      hidden: existingHidden,
    };
    // Retire l'ancienne occurrence (changement de groupe possible)
    if (editing) {
      const og = groupByRef(editing.ref);
      if (og) { const idx = og.list.findIndex(function (x) { return x.id === editing.id; }); if (idx >= 0) og.list.splice(idx, 1); }
    }
    const dest = groupByRef(targetRef);
    if (dest) dest.list.push(data);
    persist();
    closeTalentModal();
    render(); renderAdvTalents();
  }

  function deleteTalent() {
    if (!editing) { closeTalentModal(); return; }
    const g = groupByRef(editing.ref);
    if (g) {
      const t = g.list.find(function (x) { return x.id === editing.id; });
      if (t && t.effect && !confirm('Ce talent possède un effet de combat intégré (' + t.effect + '). Le supprimer ?')) return;
      const idx = g.list.findIndex(function (x) { return x.id === editing.id; });
      if (idx >= 0) g.list.splice(idx, 1);
    }
    persist();
    closeTalentModal();
    render(); renderAdvTalents();
  }

  function init() {
    const f = $('#talent-form');
    if (f) f.addEventListener('submit', submitTalent);
    const c = $('#talent-modal-close');
    if (c) c.addEventListener('click', closeTalentModal);
    const d = $('#tl-f-delete');
    if (d) d.addEventListener('click', deleteTalent);
    const ae = $('#tl-f-addeffect');
    if (ae) ae.addEventListener('click', function () { addEffectRow({}); });
    const m = $('#talent-modal');
    if (m) m.addEventListener('click', function (ev) { if (ev.target.id === 'talent-modal') closeTalentModal(); });
    // Bouton « + Nouveau talent » de l'onglet Talents Adv. → éditeur d'effets
    // partagé, pré-réglé sur le groupe « Adversaires ».
    const addAdv = $('#btn-add-talentadv');
    if (addAdv) addAdv.addEventListener('click', function () { openTalentModal(null, 'adversary'); });
    render();
  }

  // Onglet Talents Adv. : éditeur des talents adverses nommés (réutilise l'éditeur
  // d'effets des Classes, sur le groupe « adversary »).
  function renderAdvTalents() {
    load();
    const box = document.getElementById('talentadv-list');
    if (!box) return;
    const g = groupByRef('adversary');
    const list = g ? g.list.slice() : [];
    if (!list.length) {
      box.innerHTML = '<p class="inv-col-empty">Aucun talent adverse. Crée-en un avec « + Nouveau talent » — mêmes effets que les talents d\'aventurier.</p>';
      return;
    }
    // Une colonne par TYPE de talent (Action, Réaction, Passif, Espèce…). Les
    // adversaires n'ont pas de niveau : pas de « Niv. x » ni d'œil sur les strips.
    const byKind = {};
    list.forEach(function (t) { const k = talentKind(t) || 'none'; (byKind[k] = byKind[k] || []).push(t); });
    const cols = KIND_ORDER.filter(function (k) { return byKind[k] && byKind[k].length; });
    if (byKind.none && byKind.none.length) cols.push('none'); // talents descriptifs (sans effet/type)
    const stripOpts = { hideLevel: true, hideEye: true };
    const colHtml = cols.map(function (k) {
      const strips = byKind[k].sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .map(function (t) { return talentStrip(t, 'adversary', stripOpts); }).join('');
      const short = (k === 'none') ? '—' : (KIND_SHORT[k] || k);
      const name = (k === 'none') ? 'Descriptifs' : (KIND_LABEL[k] || k);
      return '<div class="tal-col">' +
        '<div class="tal-col-hdr">' +
          '<span class="tal-col-name"><span class="tl-kind tl-kind-' + k + '">' + esc(short) + '</span> ' + esc(name) + '</span>' +
          '<span class="tag">' + byKind[k].length + '</span>' +
          '<button class="ghost small tl-col-add" data-ref="adversary">+</button>' +
        '</div>' +
        '<div class="tal-col-body">' + strips + '</div>' +
      '</div>';
    }).join('');
    box.innerHTML = '<div class="tal-cols">' + colHtml + '</div>';
    box.querySelectorAll('.tl-col-add').forEach(function (b) {
      b.addEventListener('click', function () { openTalentModal(null, b.getAttribute('data-ref')); });
    });
    box.querySelectorAll('.inv-strip-edit[data-edit]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTalentModal(el.getAttribute('data-tid'), el.getAttribute('data-edit'));
      });
    });
    box.querySelectorAll('.tal-strip[data-desc-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        const wrap = el.closest('.tal-row-wrap');
        const desc = wrap ? wrap.querySelector('.tal-strip-desc') : null;
        if (desc) desc.hidden = !desc.hidden;
      });
    });
  }

  global.Classes = { init: init, render: render, renderAdvTalents: renderAdvTalents };
})(window);
