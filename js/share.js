/*
 * Partage en ligne (Firebase Firestore).
 * Le MJ publie son catalogue (aventures, bestiaire, inventaire, aventuriers
 * pré-construits, classes) dans un document Firestore et obtient un lien court.
 * Les joueurs ouvrent ce lien : le contenu est chargé en lecture seule, leur
 * progression (aventuriers, sessions) reste dans leur propre navigateur.
 */
(function (global) {
  'use strict';

  // Projet Firebase dédié à Amertume (config client — publique par design).
  var firebaseConfig = {
    apiKey: 'AIzaSyB_HfdlCuFa38PDggsmhnV--5T_LNHK_yo',
    authDomain: 'amertume-rpg.firebaseapp.com',
    projectId: 'amertume-rpg',
    storageBucket: 'amertume-rpg.firebasestorage.app',
    messagingSenderId: '550108758899',
    appId: '1:550108758899:web:e99c70d285d97574b83b06',
  };

  var COLLECTION = 'amertume_snapshots';
  var PUB_KEY = 'amertume_pub_id'; // id de publication réutilisé (lien stable)
  var PUB_AT_KEY = 'amertume_pub_at'; // horodatage de la dernière publication
  var db = null;
  var ready = false;

  function init() {
    try {
      if (!global.firebase || !firebase.firestore) { console.warn('[Share] SDK Firebase absent.'); return; }
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      ready = true;
    } catch (e) { console.error('[Share.init]', e); }
  }

  // ---------- Bundle de contenu MJ (jamais les sessions ni héros de joueurs) ----------
  // Appel défensif : une méthode absente (vieille version) ne casse pas la publication.
  function call(name, fallback) {
    try { return Store[name] ? Store[name]() : fallback; } catch (e) { return fallback; }
  }
  function buildBundle() {
    var prebuilts = Store.state.heroes.filter(function (h) { return !h.adventureId; });
    return {
      v: 2,
      publishedAt: Date.now(),
      adventures: Store.loadAdventures(),
      sagas: Store.loadSagas(),
      homeOrder: Store.loadHomeOrder(),
      monsters: Store.state.monsters || [],
      items: Store.state.items || [],
      prebuilts: prebuilts,
      classes: Store.loadClasses(),
      // v2 — TOUS les catalogues de talents éditables en Mode MJ. Sans eux, le
      // joueur retombait sur les talents intégrés par défaut : renommages,
      // créations, masquages et suppressions du MJ étaient perdus.
      genericTalents: call('loadGenericTalents', []),
      genericDeleted: call('loadGenTombstones', []),
      parchTalents: call('loadParchTalents', []),
      advTalents: call('loadAdvTalents', []),
      monsterTalents: call('loadMonsterTalents', []),
      speciesTalents: call('loadSpeciesTalents', []),
      tutorials: call('loadTutorials', []),
    };
  }

  // Applique un bundle reçu : remplace le contenu MJ, préserve les données du joueur
  function applyBundle(b) {
    if (!b) return;
    if (Array.isArray(b.adventures)) Store.saveAdventures(b.adventures);
    if (Array.isArray(b.sagas)) Store.saveSagas(b.sagas);
    if (Array.isArray(b.homeOrder)) Store.saveHomeOrder(b.homeOrder);
    if (Array.isArray(b.classes)) Store.saveClasses(b.classes);
    // Catalogues de talents : on REMPLACE à l'identique (pas de fusion), pour
    // que le joueur voie exactement l'état du MJ au moment de la publication.
    var put = function (name, arr) {
      if (Array.isArray(arr) && Store[name]) { try { Store[name](arr); } catch (e) {} }
    };
    put('saveGenericTalents', b.genericTalents);
    // Talents intégrés supprimés par le MJ : la liste explicite prime sur celle
    // que saveGenericTalents recalcule (elle survit aux versions différentes).
    if (Array.isArray(b.genericDeleted) && Store.saveGenTombstones) {
      try { Store.saveGenTombstones(b.genericDeleted); } catch (e) {}
    }
    put('saveParchTalents', b.parchTalents);
    put('saveAdvTalents', b.advTalents);
    put('saveMonsterTalents', b.monsterTalents);
    put('saveSpeciesTalents', b.speciesTalents);
    put('saveTutorials', b.tutorials);
    if (Array.isArray(b.monsters)) Store.state.monsters = b.monsters;
    if (Array.isArray(b.items)) Store.state.items = b.items;
    // Héros : on conserve ceux du joueur (taggés adventureId), on remplace les pré-construits
    var players = Store.state.heroes.filter(function (h) { return h.adventureId; });
    Store.state.heroes = (b.prebuilts || []).concat(players);
    Store.save();
  }

  // ---------- Publication / chargement ----------
  function publish(cb) {
    if (!ready) { if (cb) cb(new Error('Firebase indisponible.')); return; }
    var id = global.localStorage.getItem(PUB_KEY) || Store.uid();
    var bundle = buildBundle();
    db.collection(COLLECTION).doc(id).set(bundle)
      .then(function () {
        global.localStorage.setItem(PUB_KEY, id);
        global.localStorage.setItem(PUB_AT_KEY, String(bundle.publishedAt));
        if (cb) cb(null, id, bundle);
      })
      .catch(function (e) { if (cb) cb(e); });
  }

  // État de la dernière publication (depuis ce navigateur) : { id, at } ou null
  function lastPublished() {
    var id = global.localStorage.getItem(PUB_KEY);
    if (!id) return null;
    var at = parseInt(global.localStorage.getItem(PUB_AT_KEY), 10);
    return { id: id, at: isNaN(at) ? null : at };
  }

  function load(id, cb) {
    if (!ready) { if (cb) cb(new Error('Firebase indisponible.')); return; }
    db.collection(COLLECTION).doc(id).get()
      .then(function (doc) {
        if (!doc.exists) { if (cb) cb(new Error('Contenu partagé introuvable.')); return; }
        if (cb) cb(null, doc.data());
      })
      .catch(function (e) { if (cb) cb(e); });
  }

  // ---------- Lien ----------
  function parsePubId() {
    var h = (global.location.hash || '').match(/[#&]pub=([^&]+)/);
    if (h) return decodeURIComponent(h[1]);
    var q = (global.location.search || '').match(/[?&]pub=([^&]+)/);
    return q ? decodeURIComponent(q[1]) : null;
  }
  function shareLink(id) {
    return global.location.origin + global.location.pathname + '#pub=' + id;
  }

  global.Share = {
    init: init,
    publish: publish,
    load: load,
    buildBundle: buildBundle,
    applyBundle: applyBundle,
    parsePubId: parsePubId,
    shareLink: shareLink,
    lastPublished: lastPublished,
    isReady: function () { return ready; },
  };
})(window);
