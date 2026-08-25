/*
 * Export / Import COMPLETS (JSON + PDF).
 *
 * - Bundle d'AVENTURE : l'aventure entière (chapitres, scènes, tous les blocs,
 *   connecteurs, zones de combat, barrières, rencontres aléatoires…) PLUS tout
 *   ce qu'elle référence : monstres, talents adverses, objets, talents de
 *   parchemin. La collecte parcourt l'arbre JSON entier (clés monsterId /
 *   itemId), si bien qu'aucun bloc présent ou futur ne peut être oublié.
 * - Exports JSON par onglet (bestiaire, armurerie, classes & talents,
 *   encyclopédie, aventuriers) : copie INTÉGRALE des objets, sans perte.
 * - Export GLOBAL : toutes les clés amertume_* du localStorage, chaînes brutes,
 *   pour tout restaurer sur un autre navigateur / ordinateur.
 * - Export PDF : fenêtre d'impression stylée (une page par scène pour les
 *   aventures), à enregistrer en PDF via le navigateur.
 *
 * RÈGLE ABSOLUE : les EXPORTS ne modifient JAMAIS le localStorage. Seuls les
 * IMPORTS écrivent, sur action explicite de l'utilisateur et après confirmation.
 */
(function (global) {
  'use strict';

  // ---------- Téléchargements ----------
  function downloadText(name, text, mime) {
    const blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadJSON(name, obj) {
    downloadText(name, JSON.stringify(obj, null, 2));
  }
  function stamp() {
    const d = new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function slugFile(s) {
    return String(s || 'export').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
  }

  // ---------- Collecte des références d'une aventure ----------
  // Parcourt N'IMPORTE QUELLE structure JSON et relève tous les monsterId /
  // itemId rencontrés, où qu'ils soient (zones de combat de scène, blocs de
  // combat, conséquences d'échec/réussite, récompenses, rencontres aléatoires…).
  function collectIds(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(function (x) { collectIds(x, out); }); return; }
    Object.keys(node).forEach(function (k) {
      const v = node[k];
      if (k === 'monsterId' && typeof v === 'string' && v) out.monsterIds[v] = true;
      if (k === 'itemId' && typeof v === 'string' && v) out.itemIds[v] = true;
      collectIds(v, out);
    });
  }
  function buildAdventureBundle(adv) {
    const out = { monsterIds: {}, itemIds: {} };
    collectIds(adv, out);
    const monsters = (Store.state.monsters || []).filter(function (m) { return out.monsterIds[m.id]; });
    // Talents adverses référencés par les monstres embarqués.
    const advTalentIds = {};
    monsters.forEach(function (m) {
      (m.advTalentIds || []).forEach(function (id) { advTalentIds[id] = true; });
    });
    const advTalents = (Store.loadAdvTalents ? Store.loadAdvTalents() : [])
      .filter(function (t) { return advTalentIds[t.id]; });
    const items = (Store.state.items || []).filter(function (i) { return out.itemIds[i.id]; });
    // Talents de parchemin référencés par les objets embarqués
    // (item.parchEffect = clé d'effet du catalogue OU "par:<idTalentParchemin>").
    const parchIds = {};
    items.forEach(function (i) {
      if (typeof i.parchEffect === 'string' && i.parchEffect.indexOf('par:') === 0) parchIds[i.parchEffect.slice(4)] = true;
    });
    const parchTalents = (Store.loadParchTalents ? Store.loadParchTalents() : [])
      .filter(function (t) { return parchIds[t.id]; });
    return {
      format: 'amertume-adventure-bundle',
      version: 2,
      exportedAt: new Date().toISOString(),
      appVersion: (document.querySelector('.brand-version') || {}).textContent || '',
      adventure: JSON.parse(JSON.stringify(adv)),
      monsters: JSON.parse(JSON.stringify(monsters)),
      advTalents: JSON.parse(JSON.stringify(advTalents)),
      items: JSON.parse(JSON.stringify(items)),
      parchTalents: JSON.parse(JSON.stringify(parchTalents)),
      // Aventuriers pré-tirés de cette aventure (proposés au lancement).
      prebuilts: JSON.parse(JSON.stringify((Store.state.heroes || []).filter(function (h) {
        return !h.adventureId && h.sourceAdventureId === adv.id;
      }))),
    };
  }
  function exportAdventure(advId) {
    const adv = Store.loadAdventures().find(function (a) { return a.id === advId; });
    if (!adv) { alert('Aventure introuvable.'); return; }
    const b = buildAdventureBundle(adv);
    downloadJSON('aventure-' + slugFile(adv.title) + '-' + stamp() + '.json', b);
  }
  function exportAllAdventures() {
    const advs = Store.loadAdventures();
    downloadJSON('aventures-completes-' + stamp() + '.json', {
      format: 'amertume-adventures-all', version: 2, exportedAt: new Date().toISOString(),
      bundles: advs.map(buildAdventureBundle),
      sagas: Store.loadSagas ? Store.loadSagas() : [],
      homeOrder: Store.loadHomeOrder ? Store.loadHomeOrder() : [],
    });
  }

  // Fusionne une liste par id : ajoute les absents, remplace les existants.
  function mergeById(list, incoming) {
    const byId = {};
    list.forEach(function (x, i) { byId[x.id] = i; });
    let added = 0, updated = 0;
    (incoming || []).forEach(function (x) {
      if (!x || !x.id) return;
      if (byId[x.id] !== undefined) { list[byId[x.id]] = x; updated++; }
      else { byId[x.id] = list.length; list.push(x); added++; }
    });
    return { added: added, updated: updated };
  }
  // ---------- Anti-collision & affiliation ----------
  // Réécrit un id partout dans le bundle : id propre de l'objet, références
  // monsterId / itemId (parcours profond), advTalentIds, parchEffect "par:<id>".
  function deepRemapRefs(node, key, from, to) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(function (x) { deepRemapRefs(x, key, from, to); }); return; }
    Object.keys(node).forEach(function (k) {
      if (k === key && node[k] === from) node[k] = to;
      else deepRemapRefs(node[k], key, from, to);
    });
  }
  // Un id entrant entre-t-il en COLLISION avec un objet local étranger ?
  // (même id, mais l'objet local n'appartient pas à cette aventure → sans
  // renommage, l'import écraserait silencieusement le contenu local).
  function foreignClash(localList, id, advId) {
    const loc = localList.find(function (x) { return x && x.id === id; });
    return !!(loc && loc.adventureId !== advId);
  }
  function freeId(localList, bundleList, baseId) {
    let id = baseId, n = 2;
    const taken = function (x) {
      return localList.some(function (o) { return o && o.id === x; }) ||
        bundleList.some(function (o) { return o && o.id === x; });
    };
    while (taken(id)) { id = baseId + '_' + n; n++; }
    return id;
  }
  // Prépare un bundle avant fusion : affilie chaque contenu à l'aventure
  // (adventureId) et renomme les ids en collision avec des contenus étrangers,
  // références réécrites dans TOUT le bundle. Renvoie le nombre de renommages.
  function sanitizeBundle(b) {
    const advId = b.adventure.id;
    let renamed = 0;
    const passes = [
      { list: b.monsters, local: Store.state.monsters || [], refKey: 'monsterId' },
      { list: b.items, local: Store.state.items || [], refKey: 'itemId' },
      { list: b.advTalents, local: Store.loadAdvTalents ? Store.loadAdvTalents() : [], refKey: null, refFn: 'advTalentIds' },
      { list: b.parchTalents, local: Store.loadParchTalents ? Store.loadParchTalents() : [], refKey: null, refFn: 'parch' },
    ];
    passes.forEach(function (p) {
      (p.list || []).forEach(function (obj) {
        if (!obj || !obj.id) return;
        // 1) Affiliation : le contenu importé est rattaché à son aventure.
        if (!obj.adventureId) obj.adventureId = advId;
        // 2) Collision avec un contenu local ÉTRANGER : renommage + réécriture.
        if (foreignClash(p.local, obj.id, advId)) {
          const to = freeId(p.local, p.list, advId + '__' + obj.id);
          const from = obj.id;
          obj.id = to;
          if (p.refKey) deepRemapRefs(b, p.refKey, from, to);
          else if (p.refFn === 'advTalentIds') {
            (b.monsters || []).forEach(function (m) {
              if (Array.isArray(m.advTalentIds)) m.advTalentIds = m.advTalentIds.map(function (x) { return x === from ? to : x; });
            });
          } else if (p.refFn === 'parch') {
            (b.items || []).forEach(function (i) {
              if (i.parchEffect === 'par:' + from) i.parchEffect = 'par:' + to;
            });
          }
          renamed++;
        }
      });
    });
    return renamed;
  }

  function importAdventureBundle(b) {
    if (!b || !b.adventure) { alert('Fichier invalide : bundle d\'aventure attendu.'); return false; }
    // Affiliation + anti-collision AVANT toute fusion : un id déjà pris par un
    // contenu d'une autre aventure est renommé (aucun écrasement silencieux).
    const renamed = sanitizeBundle(b);
    const advs = Store.loadAdventures();
    const exist = advs.findIndex(function (a) { return a.id === b.adventure.id; });
    if (exist >= 0) {
      if (!confirm('L\'aventure « ' + b.adventure.title + ' » existe déjà. La REMPLACER par la version importée ?')) return false;
      advs[exist] = b.adventure;
    } else {
      advs.push(b.adventure);
    }
    Store.saveAdventures(advs);
    const stats = [];
    if (Array.isArray(b.monsters) && b.monsters.length) {
      const r = mergeById(Store.state.monsters, b.monsters);
      stats.push('monstres : +' + r.added + ' / ' + r.updated + ' mis à jour');
    }
    if (Array.isArray(b.items) && b.items.length) {
      const r = mergeById(Store.state.items, b.items);
      stats.push('objets : +' + r.added + ' / ' + r.updated + ' mis à jour');
    }
    Store.save();
    if (Array.isArray(b.advTalents) && b.advTalents.length && Store.loadAdvTalents) {
      const list = Store.loadAdvTalents();
      const r = mergeById(list, b.advTalents);
      Store.saveAdvTalents(list);
      stats.push('talents adverses : +' + r.added + ' / ' + r.updated);
    }
    if (Array.isArray(b.parchTalents) && b.parchTalents.length && Store.loadParchTalents) {
      const list = Store.loadParchTalents();
      const r = mergeById(list, b.parchTalents);
      Store.saveParchTalents(list);
      stats.push('parchemins : +' + r.added + ' / ' + r.updated);
    }
    // Tolérance : certaines IA rangent les pré-tirés sous `heroes` ou dans
    // l'aventure elle-même (`adventure.prebuilts`) — on accepte les trois.
    if (!Array.isArray(b.prebuilts) || !b.prebuilts.length) {
      if (Array.isArray(b.heroes) && b.heroes.length) b.prebuilts = b.heroes;
      else if (b.adventure && Array.isArray(b.adventure.prebuilts) && b.adventure.prebuilts.length) b.prebuilts = b.adventure.prebuilts;
    }
    if (Array.isArray(b.prebuilts) && b.prebuilts.length) {
      const heroes = Store.state.heroes;
      const norm = function (x) {
        return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      };
      const itemByName = function (name) {
        if (!name) return null;
        const n = norm(name);
        return (Store.state.items || []).find(function (i) { return norm(i.name) === n; }) || null;
      };
      let added = 0, updated = 0;
      b.prebuilts.forEach(function (h) {
        if (!h || !h.id) return;
        // Pré-tiré : disponible au lancement (pas d'adventureId), mais tracé
        // comme venant de cette aventure (export / nettoyage).
        h.adventureId = null;
        h.sourceAdventureId = b.adventure.id;
        // Équipement par NOM (equipmentNames) : résolu contre l'Armurerie de
        // l'utilisateur APRÈS la fusion des objets du bundle — les ids locaux
        // sont inconnus de l'IA, les noms du catalogue de base sont stables.
        if (h.equipmentNames) {
          const en = h.equipmentNames;
          const pick = function (nm) { const it = itemByName(nm); return it ? it.id : null; };
          h.equipment = {
            mainD: pick(en.mainD), mainG: pick(en.mainG),
            armorId: pick(en.armor), objectId: pick(en.object), twoH: false,
          };
          h.baseEquipment = JSON.parse(JSON.stringify(h.equipment));
          delete h.equipmentNames;
        }
        if (!Array.isArray(h.startTalents)) h.startTalents = [];
        if (!Array.isArray(h.attacks)) h.attacks = [];
        if (!h.skills) h.skills = {};
        const exist = heroes.findIndex(function (x) { return x.id === h.id; });
        if (exist >= 0 && heroes[exist].sourceAdventureId === b.adventure.id) { heroes[exist] = h; updated++; }
        else if (exist >= 0) { h.id = freeId(heroes, b.prebuilts, b.adventure.id + '__' + h.id); heroes.push(h); added++; }
        else { heroes.push(h); added++; }
      });
      Store.save();
      stats.push('aventuriers pré-tirés : +' + added + ' / ' + updated + ' mis à jour');
    }
    if (renamed) stats.push(renamed + ' identifiant(s) renommé(s) pour éviter d\'écraser des contenus existants');
    alert('Aventure « ' + b.adventure.title + ' » importée.' + (stats.length ? '\n' + stats.join('\n') : ''));
    return true;
  }

  // ---------- Nettoyage à la suppression d'une aventure ----------
  // Contenus AFFILIÉS à l'aventure supprimée et non référencés ailleurs :
  // proposés à la suppression (jamais retirés sans confirmation).
  function referencedIds(adventures) {
    const out = { monsterIds: {}, itemIds: {} };
    adventures.forEach(function (a) { collectIds(a, out); });
    return out;
  }
  function cleanupAdventureContent(advId) {
    const remainingAdvs = Store.loadAdventures().filter(function (a) { return a.id !== advId; });
    const used = referencedIds(remainingAdvs);
    const orphMon = (Store.state.monsters || []).filter(function (m) { return m.adventureId === advId && !used.monsterIds[m.id]; });
    const orphItems = (Store.state.items || []).filter(function (i) { return i.adventureId === advId && !used.itemIds[i.id]; });
    const keptMonIds = {};
    (Store.state.monsters || []).forEach(function (m) {
      if (orphMon.indexOf(m) < 0) (m.advTalentIds || []).forEach(function (id) { keptMonIds[id] = true; });
    });
    const advT = Store.loadAdvTalents ? Store.loadAdvTalents() : [];
    const orphTal = advT.filter(function (t) { return t.adventureId === advId && !keptMonIds[t.id]; });
    const orphHeroes = (Store.state.heroes || []).filter(function (h) { return !h.adventureId && h.sourceAdventureId === advId; });
    if (!orphMon.length && !orphItems.length && !orphTal.length && !orphHeroes.length) return;
    const parts = [];
    if (orphMon.length) parts.push(orphMon.length + ' monstre(s) : ' + orphMon.map(function (m) { return m.name; }).join(', '));
    if (orphItems.length) parts.push(orphItems.length + ' objet(s) : ' + orphItems.map(function (i) { return i.name; }).join(', '));
    if (orphTal.length) parts.push(orphTal.length + ' talent(s) adverse(s)');
    if (orphHeroes.length) parts.push(orphHeroes.length + ' aventurier(s) pré-tiré(s) : ' + orphHeroes.map(function (h) { return h.name; }).join(', '));
    if (!confirm('Cette aventure avait des contenus affiliés qui ne sont plus utilisés par aucune autre aventure :\n\n' +
      parts.join('\n') + '\n\nLes supprimer aussi ? (Annuler = les conserver dans vos bibliothèques)')) return;
    if (orphMon.length) Store.state.monsters = Store.state.monsters.filter(function (m) { return orphMon.indexOf(m) < 0; });
    if (orphItems.length) Store.state.items = Store.state.items.filter(function (i) { return orphItems.indexOf(i) < 0; });
    if (orphHeroes.length) Store.state.heroes = Store.state.heroes.filter(function (h) { return orphHeroes.indexOf(h) < 0; });
    Store.save();
    if (orphTal.length && Store.saveAdvTalents) {
      Store.saveAdvTalents(advT.filter(function (t) { return orphTal.indexOf(t) < 0; }));
    }
    refreshAll();
  }

  // ---------- Exports JSON par onglet ----------
  function exportMonstersJSON() {
    downloadJSON('bestiaire-' + stamp() + '.json', {
      format: 'amertume-monsters', version: 1, exportedAt: new Date().toISOString(),
      monsters: Store.state.monsters || [],
      advTalents: Store.loadAdvTalents ? Store.loadAdvTalents() : [],
    });
  }
  function exportItemsJSON() {
    downloadJSON('armurerie-' + stamp() + '.json', {
      format: 'amertume-items', version: 1, exportedAt: new Date().toISOString(),
      items: Store.state.items || [],
      parchTalents: Store.loadParchTalents ? Store.loadParchTalents() : [],
      speciesTalents: Store.loadSpeciesTalents ? Store.loadSpeciesTalents() : [],
      monsterTalents: Store.loadMonsterTalents ? Store.loadMonsterTalents() : [],
    });
  }
  function exportTalentsJSON() {
    downloadJSON('classes-talents-' + stamp() + '.json', {
      format: 'amertume-talents', version: 1, exportedAt: new Date().toISOString(),
      classes: Store.loadClasses(),
      genericTalents: Store.loadGenericTalents(),
      advTalents: Store.loadAdvTalents ? Store.loadAdvTalents() : [],
      parchTalents: Store.loadParchTalents ? Store.loadParchTalents() : [],
      speciesTalents: Store.loadSpeciesTalents ? Store.loadSpeciesTalents() : [],
      monsterTalents: Store.loadMonsterTalents ? Store.loadMonsterTalents() : [],
    });
  }
  function exportHeroesJSON() {
    downloadJSON('aventuriers-' + stamp() + '.json', {
      format: 'amertume-heroes', version: 1, exportedAt: new Date().toISOString(),
      heroes: Store.state.heroes || [],
    });
  }
  function exportTutorialsJSON() {
    downloadJSON('encyclopedie-' + stamp() + '.json', {
      format: 'amertume-tutorials', version: 1, exportedAt: new Date().toISOString(),
      tutorials: Store.loadTutorials ? Store.loadTutorials() : [],
    });
  }

  // Import JSON générique : reconnaît le format et fusionne par id.
  function importJSON(obj) {
    if (!obj || typeof obj !== 'object') { alert('Fichier JSON illisible.'); return; }
    if (obj.format === 'amertume-adventure-bundle') { if (importAdventureBundle(obj)) refreshAll(); return; }
    if (obj.format === 'amertume-adventures-all') {
      if (!confirm('Importer ' + (obj.bundles || []).length + ' aventure(s) complète(s) ?')) return;
      (obj.bundles || []).forEach(function (b) { importAdventureBundle(b); });
      if (Array.isArray(obj.sagas) && Store.saveSagas && confirm('Restaurer aussi l\'organisation de l\'accueil (Grandes Aventures) ?')) {
        Store.saveSagas(obj.sagas);
        if (Array.isArray(obj.homeOrder) && Store.saveHomeOrder) Store.saveHomeOrder(obj.homeOrder);
      }
      refreshAll(); return;
    }
    if (obj.format === 'amertume-global') { importGlobal(obj); return; }
    let done = [];
    if (Array.isArray(obj.monsters)) { const r = mergeById(Store.state.monsters, obj.monsters); Store.save(); done.push('monstres +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.items)) { const r = mergeById(Store.state.items, obj.items); Store.save(); done.push('objets +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.heroes)) { const r = mergeById(Store.state.heroes, obj.heroes); Store.save(); done.push('aventuriers +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.advTalents) && Store.loadAdvTalents) { const l = Store.loadAdvTalents(); const r = mergeById(l, obj.advTalents); Store.saveAdvTalents(l); done.push('talents adverses +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.parchTalents) && Store.loadParchTalents) { const l = Store.loadParchTalents(); const r = mergeById(l, obj.parchTalents); Store.saveParchTalents(l); done.push('parchemins +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.speciesTalents) && Store.loadSpeciesTalents) { const l = Store.loadSpeciesTalents(); const r = mergeById(l, obj.speciesTalents); Store.saveSpeciesTalents(l); done.push('talents d\'espèce +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.monsterTalents) && Store.loadMonsterTalents) { const l = Store.loadMonsterTalents(); const r = mergeById(l, obj.monsterTalents); Store.saveMonsterTalents(l); done.push('talents adverses (catalogue) +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.genericTalents)) { const l = Store.loadGenericTalents(); const r = mergeById(l, obj.genericTalents); Store.saveGenericTalents(l); done.push('talents génériques +' + r.added + '/' + r.updated); }
    if (Array.isArray(obj.classes)) {
      const l = Store.loadClasses();
      obj.classes.forEach(function (c) {
        const i = l.findIndex(function (x) { return x.name === c.name; });
        if (i >= 0) l[i] = c; else l.push(c);
      });
      Store.saveClasses(l); done.push('classes : ' + obj.classes.length);
    }
    if (Array.isArray(obj.tutorials) && Store.saveTutorials) { Store.saveTutorials(obj.tutorials); done.push('encyclopédie : ' + obj.tutorials.length + ' entrées'); }
    if (!done.length) { alert('Format non reconnu — aucun contenu importable trouvé.'); return; }
    alert('Import terminé :\n' + done.join('\n'));
    refreshAll();
  }
  function refreshAll() {
    try { if (global.Adventure) Adventure.render(); } catch (e) {}
    try { if (global.Combatants) { Combatants.renderMonsters(); Combatants.renderHeroes(); } } catch (e) {}
    try { if (global.Inventory) Inventory.render(); } catch (e) {}
    try { if (global.Classes) Classes.render(); } catch (e) {}
    try { if (global.App) App.renderForTab(App.currentTab ? App.currentTab() : ''); } catch (e) {}
  }

  // ---------- Export / restauration GLOBALE ----------
  // Chaînes BRUTES du localStorage : restauration sans aucune perte ni
  // réinterprétation, y compris pour des clés ajoutées dans le futur.
  function exportGlobal() {
    const keys = {};
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && k.indexOf('amertume_') === 0) keys[k] = global.localStorage.getItem(k);
    }
    downloadJSON('amertume-sauvegarde-globale-' + stamp() + '.json', {
      format: 'amertume-global', version: 1, exportedAt: new Date().toISOString(),
      appVersion: (document.querySelector('.brand-version') || {}).textContent || '',
      keys: keys,
    });
  }
  function importGlobal(obj) {
    if (!obj || obj.format !== 'amertume-global' || !obj.keys) { alert('Fichier invalide : sauvegarde globale attendue.'); return; }
    const n = Object.keys(obj.keys).length;
    if (!confirm('RESTAURATION GLOBALE : ' + n + ' clés vont REMPLACER les données actuelles de ce navigateur (aventures, bestiaire, armurerie, classes, sessions…).\n\nContinuer ?')) return;
    if (!confirm('Dernière confirmation — les données actuelles seront écrasées par la sauvegarde du ' + (obj.exportedAt || '?') + '. Restaurer ?')) return;
    Object.keys(obj.keys).forEach(function (k) {
      if (k.indexOf('amertume_') !== 0) return; // on ne touche qu'à nos clés
      try { global.localStorage.setItem(k, obj.keys[k]); } catch (e) {}
    });
    alert('Restauration terminée — la page va se recharger.');
    global.location.reload();
  }

  // ---------- PDF (fenêtre d'impression) ----------
  const PRINT_CSS = [
    '*{box-sizing:border-box}',
    'body{font-family:Georgia,"Times New Roman",serif;color:#2a2018;margin:0;padding:24px;line-height:1.45}',
    'h1{font-size:1.6rem;margin:.2rem 0 .1rem}h2{font-size:1.15rem;margin:.9rem 0 .3rem;border-bottom:2px solid #b98ae0;padding-bottom:.15rem}',
    'h3{font-size:.98rem;margin:.6rem 0 .2rem}',
    '.muted{color:#7a6a58;font-size:.82rem}',
    '.page{page-break-after:always;padding-bottom:12px}',
    '.page:last-child{page-break-after:auto}',
    '.tagrow{display:flex;flex-wrap:wrap;gap:6px;margin:.25rem 0}',
    '.tag{border:1px solid #b9a789;border-radius:10px;padding:1px 8px;font-size:.76rem;background:#f6efe4}',
    '.block{border:1px solid #cdbda6;border-left:4px solid #b9a789;border-radius:6px;padding:8px 10px;margin:.45rem 0;page-break-inside:avoid}',
    '.block.b-test{border-left-color:#6fa8c7}.block.b-action{border-left-color:#d8a24a}.block.b-fight{border-left-color:#d65c40}',
    '.block.b-dialogue{border-left-color:#9b84d8}.block.b-write{border-left-color:#74b85e}',
    '.bhead{font-weight:bold;font-size:.92rem;margin-bottom:.2rem}',
    '.kv{margin:.1rem 0;font-size:.85rem}.kv b{color:#5a4632}',
    'table{border-collapse:collapse;width:100%;font-size:.82rem;margin:.3rem 0}',
    'th,td{border:1px solid #cdbda6;padding:4px 7px;text-align:left;vertical-align:top}',
    'th{background:#efe6d6}',
    '.cols{display:flex;gap:14px;flex-wrap:wrap}.cols>div{flex:1 1 260px}',
    '.guide pre{background:#f3ece0;border:1px solid #cdbda6;border-radius:6px;padding:8px 10px;font-size:.76rem;overflow-x:auto;white-space:pre-wrap;page-break-inside:avoid}',
    '.guide code{background:#f3ece0;border-radius:3px;padding:0 3px;font-size:.85em}',
    '.guide blockquote{border-left:4px solid #b98ae0;margin:.6rem 0;padding:.3rem .8rem;background:#f6f0fa;font-size:.9rem}',
    '.guide h1{page-break-before:always}.guide h1:first-child{page-break-before:auto}',
    '.guide h2{page-break-after:avoid}.guide table{page-break-inside:auto}.guide tr{page-break-inside:avoid}',
    '.guide li{font-size:.9rem;margin:.12rem 0}.guide p{font-size:.92rem;margin:.3rem 0}',
    '@media print{body{padding:0}}',
  ].join('\n');
  function openPrint(title, bodyHtml) {
    const w = global.open('', '_blank');
    if (!w) { alert('Le navigateur a bloqué la fenêtre d\'impression — autorisez les pop-ups pour ce site.'); return; }
    w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>' + PRINT_CSS + '</style></head><body>' + bodyHtml +
      '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>');
    w.document.close();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function diceTxt(d) {
    if (!d) return '—';
    const L = { white: 'blanc', bone: 'os', black: 'noir', red: 'rouge', blue: 'bleu', green: 'vert', pink: 'rose' };
    const parts = [];
    Object.keys(d).forEach(function (k) { if (d[k]) parts.push(d[k] + ' ' + (L[k] || k)); });
    return parts.length ? parts.join(' + ') : '—';
  }

  // --- PDF Aventure : une page par scène, tous les blocs détaillés ---
  const DIFF_TXT = { auto: 'Automatique (0)', facile: 'Facile (1)', moyen: 'Moyen (2)', difficile: 'Difficile (3)', tresdifficile: 'Très Difficile (4)', insurmontable: 'Insurmontable (5)', impossible: 'Impossible (6)' };
  const FX_TXT = { none: 'aucune', pv: 'perte de PV', vie: 'perte de VIE', xp: 'perte d\'XP', state: 'état infligé', item: 'objet perdu', deed: 'Haut Fait subi', combat: 'combat déclenché' };
  function monsterName(id) {
    const m = (Store.state.monsters || []).find(function (x) { return x.id === id; });
    return m ? m.name : ('(monstre ' + id + ')');
  }
  function itemName(id) {
    const i = (Store.state.items || []).find(function (x) { return x.id === id; });
    return i ? i.name : ('(objet ' + id + ')');
  }
  function zonesHtml(zones, barriers) {
    if (!zones || !zones.length) return '';
    let h = '<div class="kv"><b>Zones de combat :</b></div><ul style="margin:.15rem 0 .3rem 1.1rem;font-size:.85rem">';
    zones.forEach(function (z, i) {
      const refs = (z.monsterRefs || []).filter(function (r) { return r.monsterId; })
        .map(function (r) { return (r.count > 1 ? r.count + '× ' : '') + monsterName(r.monsterId); });
      h += '<li>Zone ' + (i + 1) + (z.name ? ' « ' + esc(z.name) + ' »' : '') + ' : ' + (refs.length ? esc(refs.join(', ')) : 'vide') + '</li>';
    });
    h += '</ul>';
    const bk = barriers && Object.keys(barriers).filter(function (k) { return barriers[k] && barriers[k].type; });
    if (bk && bk.length) {
      h += '<div class="kv"><b>Barrières :</b> ' + bk.map(function (k) {
        const b = barriers[k];
        return esc(k) + ' → ' + esc(b.type) + (b.name ? ' (« ' + esc(b.name) + ' »)' : '');
      }).join(' · ') + '</div>';
    }
    return h;
  }
  function rewardsHtml(o) {
    const bits = [];
    if (o.xpReward) bits.push('XP : ' + esc(o.xpReward));
    if (o.goldReward) bits.push('Or : ' + esc(o.goldReward));
    (o.itemRewards || []).forEach(function (r) { if (r.itemId) bits.push((r.qty > 1 ? r.qty + '× ' : '') + esc(itemName(r.itemId))); });
    (o.treasureRewards || []).forEach(function (r) {
      if (r && r.name) bits.push((r.kind === 'rare' ? 'Objet Rare : ' : 'Trésor : ') + esc(r.name) + (r.qty > 1 ? ' ×' + r.qty : '') + (r.value ? ' (' + r.value + ' or)' : ''));
    });
    if (o.deedReward) bits.push('Haut Fait : « ' + esc(o.deedReward) + ' »');
    return bits.length ? '<div class="kv"><b>Récompenses :</b> ' + bits.join(' · ') + '</div>' : '';
  }
  function chainHtml(blk, sceneById) {
    const names = function (ids) {
      return (ids || []).map(function (id) { return '#' + (sceneById[id] || id); }).join(', ');
    };
    const s = Array.isArray(blk.chainSuccessIds) && blk.chainSuccessIds.length ? names(blk.chainSuccessIds) : '';
    const f = Array.isArray(blk.chainFailIds) && blk.chainFailIds.length ? names(blk.chainFailIds) : '';
    if (!s && !f) return '';
    return '<div class="kv"><b>Révèle :</b> ' + (s ? 'si réussite → blocs ' + esc(s) : '') +
      (s && f ? ' · ' : '') + (f ? 'si échec → blocs ' + esc(f) : '') + '</div>';
  }
  function blockHtml(blk, i, scene) {
    const blockNumById = {};
    (scene.blocks || []).forEach(function (b, n) { blockNumById[b.id] = (n + 1); });
    const req = blk.reqSkill ? '<div class="kv"><b>Visible si :</b> ' + esc(blk.reqSkill) + ' ≥ ' + (blk.reqVal || 1) + '</div>' : '';
    // Textes de blocs typés
    if (blk.type !== 'test' && blk.type !== 'fight') {
      return '<div class="block"><div class="bhead">#' + (i + 1) + ' · Texte (' + esc(blk.type || 'narrative') + ')</div>' +
        '<div>' + nl(blk.content || '') + '</div>' + req + '</div>';
    }
    if (blk.type === 'fight') {
      const c = blk.combat || {};
      return '<div class="block b-fight"><div class="bhead">#' + (i + 1) + ' · ⚔️ COMBAT' + (blk.label ? ' — ' + esc(blk.label) : '') + '</div>' +
        (blk.content ? '<div>' + nl(blk.content) + '</div>' : '') +
        zonesHtml(c.combatZones, c.barriers) +
        (blk.winText ? '<div class="kv"><b>Victoire :</b> ' + nl(blk.winText) + '</div>' : '') +
        (blk.failText ? '<div class="kv"><b>Défaite :</b> ' + nl(blk.failText) + '</div>' : '') +
        chainHtml(blk, blockNumById) + req + '</div>';
    }
    // test / action / écriture / dialogue
    const isDlg = !!blk.dialogueMode, isWrite = !!blk.writeMode, isAction = !!blk.actionMode;
    const cls = isDlg ? 'b-dialogue' : isWrite ? 'b-write' : isAction ? 'b-action' : 'b-test';
    const kind = isDlg ? '💬 DIALOGUE' : isWrite ? '✍️ ÉCRITURE' : isAction ? '⚡ ACTION' : '🔍 TEST';
    let h = '<div class="block ' + cls + '"><div class="bhead">#' + (i + 1) + ' · ' + kind + (blk.label ? ' — ' + esc(blk.label) : '') + (blk.mandatory ? ' · 🔒 OBLIGATOIRE' + (blk.mandatoryNarrative ? ' (narratif)' : '') : '') + '</div>';
    if (isDlg) {
      (blk.lines || []).forEach(function (l) {
        h += '<div class="kv">🗣 <b>' + esc(l.speaker || '—') + ' :</b> ' + nl(l.text || '') + '</div>';
      });
      h += '<div class="kv"><b>Choix 1 :</b> ' + esc(blk.label || '') + (blk.altLabel ? ' · <b>Choix 2 :</b> ' + esc(blk.altLabel) : '') + '</div>';
    } else if (isWrite) {
      h += (blk.writeDesc ? '<div>' + nl(blk.writeDesc) + '</div>' : '') +
        '<div class="kv"><b>Consigne :</b> ' + esc(blk.writeInstruction || '') + ' · <b>Réponse(s) :</b> ' + esc(blk.writeAnswers || '') + '</div>';
    } else if (isAction) {
      if (blk.altLabel) h += '<div class="kv"><b>Action 2 :</b> ' + esc(blk.altLabel) + '</div>';
    } else {
      h += '<div class="kv"><b>Compétence :</b> ' + esc(blk.skill || '') + ' · <b>Difficulté :</b> ' + (DIFF_TXT[blk.difficulty] || esc(blk.difficulty || '')) +
        ' · <b>Testeur :</b> ' + esc(blk.who || 'best') + (blk.groupMode ? ' (' + esc(blk.groupMode) + ')' : '') + '</div>';
      if (blk.altSkill) h += '<div class="kv"><b>Alternative :</b> ' + esc(blk.altSkill) + ' (' + (DIFF_TXT[blk.altDifficulty || blk.difficulty] || '') + ')</div>';
      if (blk.retryMode || blk.retry) h += '<div class="kv"><b>Relance :</b> ' + esc(blk.retryMode || 'always') + '</div>';
    }
    if (blk.successText) h += '<div class="kv"><b>Réussite :</b> ' + nl(blk.successText) + '</div>';
    if (blk.failText) h += '<div class="kv"><b>Échec :</b> ' + nl(blk.failText) + '</div>';
    h += rewardsHtml(blk);
    const fx = blk.failEffect;
    if (fx && fx.kind && fx.kind !== 'none') {
      h += '<div class="kv"><b>Conséquence d\'échec :</b> ' + (FX_TXT[fx.kind] || esc(fx.kind)) +
        (fx.val ? ' (' + esc(fx.val) + ')' : '') + (fx.state ? ' — ' + esc(fx.state) : '') + '</div>';
      if (fx.kind === 'combat' && fx.combat) h += zonesHtml(fx.combat.combatZones, fx.combat.barriers);
    }
    const wfx = blk.winEffect;
    if (wfx && wfx.kind && wfx.kind !== 'none') {
      h += '<div class="kv"><b>Effet de réussite :</b> ' + (FX_TXT[wfx.kind] || esc(wfx.kind)) + (wfx.val ? ' (' + esc(wfx.val) + ')' : '') + '</div>';
      if (wfx.kind === 'combat' && wfx.combat) h += zonesHtml(wfx.combat.combatZones, wfx.combat.barriers);
    }
    if (blk.targetSceneId) h += '<div class="kv"><b>Passage débloqué :</b> scène ' + esc(blk.targetSceneId) + '</div>';
    if (blk.rareKeyName) h += '<div class="kv"><b>Objet Rare résolvant :</b> ' + esc(blk.rareKeyName) + (blk.rareConsume ? ' (consommé)' : '') + '</div>';
    h += chainHtml(blk, blockNumById) + req + '</div>';
    return h;
  }
  function scenePage(scene, ch, adv) {
    let h = '<div class="page">';
    h += '<div class="muted">' + esc(adv.title) + ' · Chapitre « ' + esc(ch.title || '') + ' »' +
      (typeof scene.mapX === 'number' ? ' · carte (' + scene.mapX + ',' + scene.mapY + ')' : '') + '</div>';
    h += '<h1>' + esc(scene.title || '(sans titre)') + '</h1>';
    h += '<div class="tagrow"><span class="tag">Type : ' + esc(scene.type || '') + '</span>' +
      (ch.entryId === scene.id ? '<span class="tag">🚪 Entrée du donjon</span>' : '') + '</div>';
    if (scene.fait) h += '<div class="kv"><b>Haut Fait :</b> ' + esc(scene.fait) + '</div>';
    // Combat de la scène
    h += zonesHtml(scene.combatZones, scene.barriers);
    h += rewardsHtml(scene);
    // Blocs
    (scene.blocks || []).forEach(function (b, i) { h += blockHtml(b, i, scene); });
    // Connecteurs partant / arrivant (donjon)
    const links = (ch.links || []).filter(function (l) { return l.from === scene.id || l.to === scene.id; });
    if (links.length) {
      const titleOf = function (id) { const s = (ch.scenes || []).find(function (x) { return x.id === id; }); return s ? s.title : id; };
      h += '<h3>Connecteurs</h3><ul style="margin:.15rem 0 .3rem 1.1rem;font-size:.85rem">';
      links.forEach(function (l) {
        h += '<li>' + esc(titleOf(l.from)) + ' → ' + esc(titleOf(l.to)) +
          (l.label ? ' — « ' + esc(l.label) + ' »' : '') +
          (l.eventSceneId ? ' · ⚡ événement : ' + esc(titleOf(l.eventSceneId)) + (l.eventRepeat ? ' (à chaque passage)' : ' (une fois)') : '') +
          (l.revealTestId ? ' · 🫥 passage secret' : '') +
          (l.randomEnabled ? ' · 🎲 rencontres aléatoires' : '') + '</li>';
      });
      h += '</ul>';
    }
    // Choix narratifs hérités
    if (Array.isArray(scene.choices) && scene.choices.length) {
      h += '<h3>Choix</h3><ul style="margin:.15rem 0 .3rem 1.1rem;font-size:.85rem">';
      scene.choices.forEach(function (c) {
        h += '<li>' + esc(c.label || '') + (c.targetSceneId ? ' → scène ' + esc(c.targetSceneId) : '') + '</li>';
      });
      h += '</ul>';
    }
    h += '</div>';
    return h;
  }
  function adventurePdf(advId) {
    const adv = Store.loadAdventures().find(function (a) { return a.id === advId; });
    if (!adv) return;
    let h = '<div class="page"><h1>' + esc(adv.title) + '</h1>' +
      '<div class="tagrow">' +
      (adv.duration ? '<span class="tag">Durée : ' + esc(adv.duration) + '</span>' : '') +
      (adv.difficulty ? '<span class="tag">Difficulté : ' + esc(adv.difficulty) + '</span>' : '') +
      '<span class="tag">' + (adv.chapters || []).length + ' chapitre(s)</span></div>' +
      (adv.summary ? '<div>' + nl(adv.summary) + '</div>' : '') +
      '<h2>Sommaire</h2><ul>' +
      (adv.chapters || []).map(function (c) {
        return '<li><b>' + esc(c.title || '') + '</b> (' + esc(c.mode || 'linear') + ') — ' +
          (c.scenes || []).map(function (s) { return esc(s.title || ''); }).join(' · ') + '</li>';
      }).join('') + '</ul></div>';
    (adv.chapters || []).forEach(function (ch) {
      (ch.scenes || []).forEach(function (s) { h += scenePage(s, ch, adv); });
      // Rencontres aléatoires du chapitre
      if (Array.isArray(ch.randomEncounters) && ch.randomEncounters.length) {
        h += '<div class="page"><h1>🎲 Rencontres aléatoires — ' + esc(ch.title || '') + '</h1><table><tr><th>Scène</th><th>Chance</th></tr>' +
          ch.randomEncounters.map(function (e) {
            const s = (ch.scenes || []).find(function (x) { return x.id === e.sceneId; });
            return '<tr><td>' + esc(s ? s.title : e.sceneId) + '</td><td>' + (e.chance || 0) + ' %</td></tr>';
          }).join('') + '</table></div>';
      }
    });
    openPrint('Aventure — ' + adv.title, h);
  }

  // --- PDF Bestiaire ---
  function monstersPdf() {
    const advT = Store.loadAdvTalents ? Store.loadAdvTalents() : [];
    const tName = function (id) { const t = advT.find(function (x) { return x.id === id; }); return t ? t.name : id; };
    const TYPES = [['standard', 'Sbires'], ['alpha', 'Alphas'], ['solitaire', 'Solitaires'], ['boss', 'Boss']];
    let h = '<h1>Bestiaire</h1>';
    TYPES.forEach(function (tp) {
      const list = (Store.state.monsters || []).filter(function (m) { return (m.type || 'standard') === tp[0]; });
      if (!list.length) return;
      h += '<h2>' + tp[1] + '</h2>';
      list.forEach(function (m) {
        h += '<div class="block"><div class="bhead">' + esc(m.name) + (m.family ? ' <span class="muted">(' + esc(m.family) + ')</span>' : '') + '</div>' +
          '<div class="kv"><b>PV :</b> ' + m.pv + ' · <b>DEF :</b> ' + m.def + ' · <b>Dégâts :</b> ' + m.damage + ' · <b>XP :</b> ' + m.xp +
          ' · <b>Menace :</b> ' + esc(m.menace || 'closest') + (m.rapide ? ' · Rapide' : '') + (m.esquive ? ' · Esquive' : '') + '</div>' +
          ((m.attacks || []).length ? '<div class="kv"><b>Attaques :</b> ' + m.attacks.map(function (a) {
            return esc(a.name) + ' (' + diceTxt(a.dice) + ', ' + (a.range === 'distance' ? 'distance' : 'contact') +
              (a.targets === 'all' ? ', toutes cibles' : '') + (a.uses ? ', ' + a.uses + '×/combat' : '') + ')';
          }).join(' · ') + '</div>' : '') +
          ((m.advTalentIds || []).length ? '<div class="kv"><b>Talents :</b> ' + m.advTalentIds.map(tName).map(esc).join(', ') + '</div>' : '') +
          (m.notes ? '<div class="kv"><b>Notes :</b> ' + nl(m.notes) + '</div>' : '') +
        '</div>';
      });
    });
    openPrint('Bestiaire', h);
  }

  // --- PDF Armurerie ---
  function itemsPdf() {
    const CATL = { weapon: 'Armes', armor: 'Armures & boucliers', object: 'Objets', ammo: 'Munitions', treasure: 'Trésors', rare: 'Objets Rares', parchment: 'Parchemins', misc: 'Divers' };
    const groups = {};
    (Store.state.items || []).forEach(function (i) {
      const k = i.category || 'misc';
      (groups[k] = groups[k] || []).push(i);
    });
    let h = '<h1>Armurerie</h1>';
    Object.keys(groups).forEach(function (k) {
      h += '<h2>' + esc(CATL[k] || k) + '</h2><table><tr><th>Nom</th><th>Dés / DEF</th><th>Prix</th><th>Effets & notes</th></tr>';
      groups[k].forEach(function (i) {
        h += '<tr><td><b>' + esc(i.name) + '</b>' + (i.hands === 2 ? ' (2 mains)' : '') + (i.ranged ? ' · distance' : '') + '</td>' +
          '<td>' + (typeof i.def === 'number' && i.category === 'armor' ? 'DEF ' + i.def : diceTxt(i.dice)) + '</td>' +
          '<td>' + (i.price || 0) + ' or' + (i.value ? ' · valeur ' + i.value : '') + '</td>' +
          '<td>' + esc((i.traits || []).join(', ')) + (i.effects ? ' ⚡ ' + esc(i.effects) : '') + (i.parchEffect ? ' 📜 ' + esc(i.parchEffect) : '') +
            (i.outOfCombat ? ' · utilisable hors combat' : '') + (i.notes ? ' — ' + esc(i.notes) : '') + '</td></tr>';
      });
      h += '</table>';
    });
    openPrint('Armurerie', h);
  }

  // --- PDF Classes & Talents ---
  function talentsPdf() {
    const effMap = Store.talentEffectMap ? Store.talentEffectMap() : {};
    const tRow = function (t) {
      const effs = (Store.talentEffectList ? Store.talentEffectList(t) : []).map(function (e) {
        const m = effMap[e.effect] || {};
        let d = m.name || e.effect;
        if (e.val) d += ' (' + e.val + ')';
        if (e.choice) d += ' [' + e.choice + ']';
        return d;
      }).join(' + ');
      return '<tr><td><b>' + esc(t.name) + '</b>' + (t.branch ? ' <span class="muted">⑂ ' + esc(t.branch) + '</span>' : '') + '</td>' +
        '<td>Niv. ' + (t.level || 1) + '</td><td>' + esc(t.kind || '') + '</td>' +
        '<td>' + esc(effs) + '</td><td>' + esc(t.description || '') + '</td></tr>';
    };
    const table = function (list) {
      return '<table><tr><th>Talent</th><th>Niveau</th><th>Type</th><th>Effets</th><th>Description</th></tr>' +
        list.map(tRow).join('') + '</table>';
    };
    let h = '<h1>Classes & Talents</h1>';
    h += '<h2>★ Talents génériques</h2>' + table(Store.loadGenericTalents());
    Store.loadClasses().forEach(function (c) {
      h += '<h2>' + esc(c.name) + '</h2>' + ((c.talents || []).length ? table(c.talents) : '<p class="muted">Aucun talent.</p>');
    });
    const parch = Store.loadParchTalents ? Store.loadParchTalents() : [];
    if (parch.length) h += '<h2>📜 Parchemins</h2>' + table(parch);
    const advT = Store.loadAdvTalents ? Store.loadAdvTalents() : [];
    if (advT.length) h += '<h2>⚔️ Talents adverses</h2>' + table(advT);
    openPrint('Classes & Talents', h);
  }

  // --- PDF Aventuriers ---
  function heroesPdf() {
    let h = '<h1>Aventuriers</h1>';
    (Store.state.heroes || []).forEach(function (x) {
      const sk = x.skills || {};
      h += '<div class="block"><div class="bhead">' + esc(x.name) + (x.klass ? ' — ' + esc(Store.normKlass ? Store.normKlass(x.klass) : x.klass) : '') + '</div>' +
        '<div class="kv"><b>VIE :</b> ' + x.vie + ' · <b>ENDU :</b> ' + x.endu + ' · <b>Dégâts :</b> ' + x.damage + (x.rapide ? ' · Rapide' : '') + '</div>' +
        '<div class="kv"><b>Compétences :</b> ' + Object.keys(sk).filter(function (k) { return sk[k]; }).map(function (k) { return k + ' ' + sk[k]; }).join(' · ') + '</div>' +
        (x.notes ? '<div class="kv">' + nl(x.notes) + '</div>' : '') + '</div>';
    });
    openPrint('Aventuriers', h);
  }

  // --- PDF Encyclopédie ---
  function tutorialsPdf() {
    let h = '<h1>Encyclopédie</h1>';
    (Store.loadTutorials ? Store.loadTutorials() : []).forEach(function (t) {
      h += '<div class="block"><div class="bhead">' + esc(t.title || '') + '</div><div>' + nl(t.content || t.text || '') + '</div></div>';
    });
    openPrint('Encyclopédie', h);
  }

  // --- PDF du Guide IA : rendu imprimable du markdown GUIDE_IA.md ---
  // Convertisseur Markdown minimal (titres, tableaux, code, listes, citations,
  // gras/italique/`code`) — suffisant pour le guide, sans dépendance externe.
  function mdInline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>');
  }
  function mdToHtml(md) {
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    let h = '', i = 0, inList = false, inQuote = false;
    const closeAll = function () {
      if (inList) { h += '</ul>'; inList = false; }
      if (inQuote) { h += '</blockquote>'; inQuote = false; }
    };
    while (i < lines.length) {
      const l = lines[i];
      // bloc de code
      if (/^```/.test(l)) {
        closeAll();
        let code = ''; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + '\n'; i++; }
        i++;
        h += '<pre>' + esc(code) + '</pre>';
        continue;
      }
      // tableau
      if (/^\|/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1])) {
        closeAll();
        const heads = l.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        h += '<table><tr>' + heads.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr>';
        i += 2;
        while (i < lines.length && /^\|/.test(lines[i])) {
          const cells = lines[i].split('|').slice(1, -1);
          h += '<tr>' + cells.map(function (c) { return '<td>' + mdInline(c.trim()) + '</td>'; }).join('') + '</tr>';
          i++;
        }
        h += '</table>';
        continue;
      }
      if (/^---+\s*$/.test(l)) { closeAll(); h += '<hr>'; i++; continue; }
      const hm = l.match(/^(#{1,4})\s+(.*)$/);
      if (hm) { closeAll(); const n = hm[1].length; h += '<h' + n + '>' + mdInline(hm[2]) + '</h' + n + '>'; i++; continue; }
      if (/^>\s?/.test(l)) {
        if (inList) { h += '</ul>'; inList = false; }
        if (!inQuote) { h += '<blockquote>'; inQuote = true; }
        h += mdInline(l.replace(/^>\s?/, '')) + '<br>';
        i++; continue;
      }
      const lm = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (lm) {
        if (inQuote) { h += '</blockquote>'; inQuote = false; }
        if (!inList) { h += '<ul>'; inList = true; }
        h += '<li>' + mdInline(lm[1]) + '</li>';
        i++; continue;
      }
      if (!l.trim()) { closeAll(); i++; continue; }
      closeAll();
      h += '<p>' + mdInline(l) + '</p>';
      i++;
    }
    closeAll();
    return h;
  }
  function guidePdf() {
    fetch('GUIDE_IA.md').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (md) {
      openPrint('Guide IA — Amertüme', '<div class="guide">' + mdToHtml(md) + '</div>');
    }).catch(function (e) { alert('Guide introuvable (' + e.message + ').'); });
  }

  // ---------- Câblage ----------
  function readJSONFile(file, cb) {
    const r = new FileReader();
    r.onload = function () {
      try { cb(JSON.parse(r.result)); } catch (e) { alert('JSON illisible : ' + e.message); }
    };
    r.readAsText(file);
  }
  function init() {
    // Boutons déclarés dans le HTML : data-json-export / data-pdf-export / data-json-import
    const ACTIONS = {
      'adventures': exportAllAdventures, 'monsters': exportMonstersJSON, 'items': exportItemsJSON,
      'talents': exportTalentsJSON, 'heroes': exportHeroesJSON, 'tutorials': exportTutorialsJSON,
      'global': exportGlobal,
    };
    const PDFS = {
      'monsters': monstersPdf, 'items': itemsPdf, 'talents': talentsPdf,
      'heroes': heroesPdf, 'tutorials': tutorialsPdf, 'guide': guidePdf,
    };
    document.querySelectorAll('[data-json-export]').forEach(function (b) {
      b.addEventListener('click', function () {
        const fn = ACTIONS[b.getAttribute('data-json-export')];
        if (fn) fn();
      });
    });
    document.querySelectorAll('[data-pdf-export]').forEach(function (b) {
      b.addEventListener('click', function () {
        const fn = PDFS[b.getAttribute('data-pdf-export')];
        if (fn) fn();
      });
    });
    document.querySelectorAll('[data-json-import]').forEach(function (b) {
      b.addEventListener('click', function () {
        const f = document.getElementById('json-file');
        if (f) { f.value = ''; f.click(); }
      });
    });
    const file = document.getElementById('json-file');
    if (file) file.addEventListener('change', function (e) {
      const f = e.target.files[0];
      if (f) readJSONFile(f, importJSON);
    });
  }

  global.ExportIO = {
    init: init,
    exportAdventure: exportAdventure,
    exportAllAdventures: exportAllAdventures,
    adventurePdf: adventurePdf,
    monstersPdf: monstersPdf,
    itemsPdf: itemsPdf,
    talentsPdf: talentsPdf,
    heroesPdf: heroesPdf,
    tutorialsPdf: tutorialsPdf,
    guidePdf: guidePdf,
    exportGlobal: exportGlobal,
    importJSON: importJSON,
    buildAdventureBundle: buildAdventureBundle,
    cleanupAdventureContent: cleanupAdventureContent,
  };
})(window);
