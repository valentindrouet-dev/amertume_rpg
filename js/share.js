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
  function buildBundle() {
    var prebuilts = Store.state.heroes.filter(function (h) { return !h.adventureId; });
    return {
      v: 1,
      publishedAt: Date.now(),
      adventures: Store.loadAdventures(),
      monsters: Store.state.monsters || [],
      items: Store.state.items || [],
      prebuilts: prebuilts,
      classes: Store.loadClasses(),
    };
  }

  // Applique un bundle reçu : remplace le contenu MJ, préserve les données du joueur
  function applyBundle(b) {
    if (!b) return;
    if (Array.isArray(b.adventures)) Store.saveAdventures(b.adventures);
    if (Array.isArray(b.classes)) Store.saveClasses(b.classes);
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
