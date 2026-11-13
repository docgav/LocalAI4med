// Espace de travail (onglet Dossiers) : un dossier réunit des éléments (notes libres ou dictées, textes
// collés, PDF, images, envois du capteur par raccourci clavier) ; les outils de droite en tirent des
// créations (synthèse, document, réponse, texte anonymisé), enregistrées dans le dossier.
// Dossiers : donnees/patients/<id>.json (disque chiffré, mode complet). Le brouillon n'est jamais
// enregistré : il reste en mémoire jusqu'à la fermeture de la page.
'use strict';

{
  const el = {
    nouveau: $('tr-nouveau'), recherche: $('tr-recherche'), liste: $('tr-liste'), infoDossiers: $('tr-info-dossiers'),
    libelle: $('tr-libelle'), garder: $('tr-garder'), supprimer: $('tr-supprimer'), avertBrouillon: $('tr-avert-brouillon'),
    zone: $('tr-zone'), titreNote: $('tr-titre-note'), saisie: $('tr-saisie'), ajouter: $('tr-ajouter'),
    fichiers: $('tr-fichiers'), choixFichiers: $('tr-choix-fichiers'), vider: $('tr-vider'),
    taille: $('tr-taille'), toutInclure: $('tr-tout-inclure'), deplier: $('tr-deplier'), elements: $('tr-elements'),
    syConsignes: $('tr-sy-consignes'), syLancer: $('tr-sy-lancer'),
    type: $('tr-type'), docConsignes: $('tr-doc-consignes'), docLancer: $('tr-doc-lancer'),
    question: $('tr-question'), questionLancer: $('tr-question-lancer'),
    anDetecter: $('an-detecter'), anLancer: $('an-lancer'), anTable: $('an-table'), anRetablir: $('an-retablir'),
    sortieTitre: $('tr-sortie-titre'), info: $('tr-info'), reflexion: $('tr-reflexion'), reflexionTexte: $('tr-reflexion-texte'),
    sortie: $('tr-sortie'), stats: $('tr-stats'), ligneAffiner: $('tr-ligne-affiner'), consigne: $('tr-consigne'),
    affiner: $('tr-affiner'), copier: $('tr-copier'), annuler: $('tr-annuler'), lireSortie: $('tr-lire-sortie'),
    versDossier: $('tr-vers-dossier'), arreter: $('tr-arreter'), productions: $('tr-productions'),
    productionsTitre: $('tr-productions-titre'),
    liseuse: $('liseuse'), liTitre: $('li-titre'), liPosition: $('li-position'), liPrec: $('li-prec'), liSuiv: $('li-suiv'),
    liFermer: $('li-fermer'), liInfo: $('li-info'), liTexte: $('li-texte'), liImage: $('li-image'), liCopier: $('li-copier'),
    onglet: document.querySelector('[data-vue=travail]'),
  };

  const MAX_IMAGES = 4;   // images envoyées au modèle par demande (les plus récentes)
  const NOMS_OUTILS = { synthese: 'Synthèse', resume: 'Synthèse', document: 'Document', redaction: 'Document', question: 'Question', anonymisation: 'Anonymisation' };
  const nouvelId = () => 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const complet = () => config.mode === 'complet';
  const confirmer = (message) => reglagesGeneraux().confirmer_effacement === false || confirm(message);

  const brouillon = { id: null, brouillon: true, libelle: 'Brouillon', elements: [], productions: [] };
  let dossier = brouillon;     // dossier affiché
  let patients = [];           // liste des dossiers enregistrés
  let outil = 'synthese';
  let controleur = null;       // génération en cours
  let courante = null;         // création affichée à droite (objet de dossier.productions)
  let conversation = null;     // messages qui l'ont produite, pour « Modifier »
  let versionPrecedente = null;
  let audiosSaisie = [];       // enregistrements des dictées insérées dans la saisie
  let toutDeplie = false;
  const deplies = new Set();   // éléments dont le texte complet est affiché
  let modelesDoc = [], consignesCommunes = '';

  // --- Dictée : insérée dans le dernier champ utilisé (la saisie par défaut, la liseuse si elle est ouverte) ---
  let dernierChamp = null;
  $('vue-travail').addEventListener('focusin', (e) => {
    const t = e.target;
    if (t.matches('textarea, input:not([type]), input[type=text]') && t !== el.libelle) dernierChamp = t;
  });
  vues.travail.cibleDictee = () => {
    if (el.liseuse.open) return el.liTexte.hidden ? null : el.liTexte;
    if (dernierChamp && !dernierChamp.closest('[hidden]') && !dernierChamp.readOnly) return dernierChamp;
    return el.saisie;
  };
  // Enregistrement de la dictée rattaché à la note qui la reçoit (réécoute depuis l'élément).
  document.addEventListener('dictee-transcrite', (e) => {
    if (vueActive !== 'travail' || !e.detail.fichier) return;
    const cible = vues.travail.cibleDictee();
    if (cible === el.saisie) audiosSaisie.push(e.detail.fichier);
    else if (cible === el.liTexte && lecture && lecture.liste === 'elements') {
      const x = itemLecture().x;
      (x.audio = x.audio || []).push(e.detail.fichier);
      enregistrer();
    }
  });

  // --- Liste des dossiers ---
  async function chargerListe() {
    if (!complet()) return;
    try { patients = (await passerelleJson('/patients')).patients || []; }
    catch (e) { el.infoDossiers.textContent = 'Dossiers illisibles : ' + e.message; }
    afficherListe();
  }

  function afficherListe() {
    const filtre = el.recherche.value.trim().toLowerCase();
    el.liste.innerHTML = '';
    const ajouterBouton = (titre, detail, actif, action) => {
      const b = document.createElement('button');
      b.className = 'element-liste' + (actif ? ' actif' : '');
      b.innerHTML = '<strong></strong><span class="discret"></span>';
      b.querySelector('strong').textContent = titre;
      b.querySelector('span').textContent = detail;
      b.addEventListener('click', action);
      el.liste.appendChild(b);
    };
    if (!filtre) {
      const n = brouillon.elements.length;
      ajouterBouton('📝 Brouillon', 'non enregistré' + (n ? ` – ${n} élément(s)` : ''), dossier === brouillon, () => ouvrir(null));
    }
    for (const p of patients) {
      if (filtre && !String(p.libelle || '').toLowerCase().includes(filtre)) continue;
      ajouterBouton(p.libelle || p.id, 'modifié ' + (p.modifie || ''), dossier.id === p.id, () => ouvrir(p.id));
    }
  }

  async function ouvrir(id) {
    if (controleur) controleur.abort();
    await enregistrerMaintenant();
    if (id === null) dossier = brouillon;
    else {
      try { dossier = await passerelleJson(`/patient?id=${encodeURIComponent(id)}`); }
      catch (e) { el.infoDossiers.textContent = 'Ouverture impossible : ' + e.message; return; }
      dossier.elements = dossier.elements || [];
      dossier.productions = dossier.productions || [];
    }
    deplies.clear();
    afficherDossier();
    montrerCreation(null);
    afficherListe();
  }

  function afficherDossier() {
    const b = !!dossier.brouillon;
    el.libelle.value = b ? 'Brouillon (non enregistré)' : dossier.libelle || '';
    el.libelle.readOnly = b;
    el.garder.hidden = !b || !complet();
    el.avertBrouillon.hidden = !b;
    el.supprimer.textContent = b ? 'Vider le brouillon' : 'Supprimer le dossier';
    afficherElements();
    afficherProductions();
  }

  const demanderLibelle = () => prompt('Libellé du dossier (de préférence non identifiant : initiales, chambre, date) :', '');

  el.nouveau.addEventListener('click', async () => {
    const libelle = demanderLibelle();
    if (libelle === null) return;
    if (controleur) controleur.abort();
    await enregistrerMaintenant();
    dossier = { id: nouvelId(), libelle: libelle.trim() || 'Sans titre', cree: maintenant(), elements: [], productions: [] };
    aEnregistrer = dossier;
    await enregistrerMaintenant();
    deplies.clear(); afficherDossier(); montrerCreation(null);
    await chargerListe();
  });

  // Brouillon → dossier enregistré (éléments et créations compris).
  el.garder.addEventListener('click', async () => {
    const libelle = demanderLibelle();
    if (libelle === null) return;
    dossier = { id: nouvelId(), libelle: libelle.trim() || 'Sans titre', cree: maintenant(), elements: brouillon.elements, productions: brouillon.productions };
    brouillon.elements = []; brouillon.productions = [];
    aEnregistrer = dossier;
    await enregistrerMaintenant();
    afficherDossier();
    await chargerListe();
  });

  el.recherche.addEventListener('input', afficherListe);
  el.libelle.addEventListener('change', () => {
    if (dossier.brouillon) return;
    dossier.libelle = el.libelle.value.trim() || 'Sans titre';
    enregistrer();
    setTimeout(chargerListe, 800);
  });

  el.supprimer.addEventListener('click', async () => {
    if (dossier.brouillon) {
      if (!brouillon.elements.length && !brouillon.productions.length) return;
      if (!confirmer('Vider le brouillon (éléments et créations) ?')) return;
      brouillon.elements = []; brouillon.productions = [];
      afficherDossier(); montrerCreation(null); afficherListe();
      return;
    }
    if (!confirm(`Supprimer définitivement le dossier « ${dossier.libelle} » et tout son contenu ?`)) return;
    if (controleur) controleur.abort();
    aEnregistrer = null; clearTimeout(minuterieEnregistrement);
    try { await passerelleJson(`/patient-supprimer?id=${encodeURIComponent(dossier.id)}`, { methode: 'POST' }); }
    catch (e) { el.infoDossiers.textContent = 'Suppression impossible : ' + e.message; return; }
    dossier = brouillon;
    afficherDossier(); montrerCreation(null);
    await chargerListe();
  });

  // --- Enregistrement (différé pour regrouper les modifications ; jamais pour le brouillon) ---
  let aEnregistrer = null, minuterieEnregistrement = null;
  function enregistrer() {
    if (dossier.brouillon) return;
    aEnregistrer = dossier;
    clearTimeout(minuterieEnregistrement);
    minuterieEnregistrement = setTimeout(enregistrerMaintenant, 600);
  }
  async function enregistrerMaintenant() {
    clearTimeout(minuterieEnregistrement);
    const d = aEnregistrer;
    aEnregistrer = null;
    if (!d) return;
    try { await passerelleJson(`/patient?id=${encodeURIComponent(d.id)}`, { methode: 'POST', corps: d }); }
    catch (e) { el.info.textContent = 'Enregistrement impossible : ' + e.message; }
  }
  window.addEventListener('beforeunload', (e) => {
    const enAttente = !!aEnregistrer;
    if (enAttente) enregistrerMaintenant();
    if (enAttente || brouillon.elements.length || brouillon.productions.length) { e.preventDefault(); e.returnValue = ''; }
  });

  // --- Éléments du dossier ---
  const actifs = () => dossier.elements.filter((e) => e.actif !== false);

  function ajouterElement(e) {
    dossier.elements.push({ id: nouvelId(), date: maintenant(), actif: true, ...e });
    afficherElements();
    enregistrer();
    if (dossier.brouillon) afficherListe();
  }

  function estimationTokens() {
    const a = actifs();
    const texte = a.filter((e) => e.type === 'texte').reduce((n, e) => n + e.contenu.length, 0);
    const images = serveur.vision ? Math.min(MAX_IMAGES, a.filter((e) => e.type === 'image').length) : 0;
    return Math.round(texte / 3.5 + images * 280);
  }

  function ecouter(fichier) {
    const lecteur = new Audio(`http://127.0.0.1:${config.dictee}/audio?fichier=${encodeURIComponent(fichier)}`);
    lecteur.onerror = () => { el.info.textContent = `Enregistrement introuvable (supprimé ?) : donnees\\audio\\${fichier}`; };
    lecteur.play().catch(() => {});
  }

  function bouton(texte, titre, action) {
    const b = document.createElement('button');
    b.textContent = texte; b.title = titre;
    b.addEventListener('click', action);
    return b;
  }

  function afficherElements() {
    el.elements.innerHTML = '';
    if (!dossier.elements.length) {
      const p = document.createElement('p');
      p.className = 'discret';
      p.textContent = 'Aucun élément. Tapez ou dictez des notes ci-dessus, collez un texte ou une image, ou ajoutez des fichiers (PDF, images).';
      el.elements.appendChild(p);
    }
    dossier.elements.forEach((e, i) => {
      const carte = document.createElement('div');
      carte.className = 'carte-element' + (e.actif === false ? ' inactif' : '') + (toutDeplie || deplies.has(e.id) ? ' deplie' : '');
      const entete = document.createElement('div');
      entete.className = 'ligne';
      const actif = document.createElement('input');
      actif.type = 'checkbox'; actif.checked = e.actif !== false; actif.title = 'Inclure dans les créations';
      actif.addEventListener('change', () => { e.actif = actif.checked; afficherElements(); enregistrer(); });
      const titre = document.createElement('strong');
      const icone = e.type === 'image' ? '🖼' : e.audio && e.audio.length ? '🎙' : e.source === 'création' ? '✎' : '📄';
      titre.textContent = `${i + 1}. ${icone} ${e.nom || 'Texte'}`;
      const date = document.createElement('span');
      date.className = 'discret';
      date.textContent = e.date + (e.source ? ` – ${e.source}` : '');
      entete.append(actif, titre, date);
      (e.audio || []).forEach((f, n) => entete.appendChild(bouton(e.audio.length > 1 ? `▶${n + 1}` : '▶', 'Réécouter la dictée', () => ecouter(f))));
      entete.appendChild(bouton('Lire', 'Lire et modifier le texte complet', () => ouvrirLiseuse('elements', i)));
      entete.appendChild(bouton('×', 'Retirer du dossier', () => {
        if (!confirmer('Retirer cet élément du dossier ?')) return;
        dossier.elements.splice(i, 1); afficherElements(); enregistrer();
        if (dossier.brouillon) afficherListe();
      }));
      carte.appendChild(entete);
      if (e.type === 'image') {
        const img = document.createElement('img');
        img.src = e.url; img.title = 'Agrandir';
        img.addEventListener('click', () => ouvrirLiseuse('elements', i));
        carte.appendChild(img);
      } else {
        const t = document.createElement('div');
        t.className = 'apercu';
        t.textContent = e.contenu;
        t.title = 'Cliquer pour déplier / replier';
        t.addEventListener('click', () => {
          if (window.getSelection().toString()) return;   // sélection de texte en cours
          if (deplies.has(e.id)) deplies.delete(e.id); else deplies.add(e.id);
          carte.classList.toggle('deplie');
        });
        carte.appendChild(t);
      }
      el.elements.appendChild(carte);
    });
    const tous = dossier.elements.length && dossier.elements.every((e) => e.actif !== false);
    el.toutInclure.textContent = tous ? 'Tout exclure' : 'Tout inclure';
    const tokens = estimationTokens(), limite = serveur.nctx || 8192;
    el.taille.textContent = `${actifs().length}/${dossier.elements.length} élément(s) inclus : environ ${tokens.toLocaleString('fr-FR')} tokens sur ${limite.toLocaleString('fr-FR')}.`;
    el.taille.className = tokens > limite * 0.75 ? 'avertissement' : 'discret';
    if (tokens > limite * 0.75) el.taille.textContent += ' Trop long : décochez des éléments ou augmentez CONTEXTE.';
  }

  el.toutInclure.addEventListener('click', () => {
    const tous = dossier.elements.every((e) => e.actif !== false);
    dossier.elements.forEach((e) => { e.actif = !tous; });
    afficherElements(); enregistrer();
  });
  el.deplier.addEventListener('click', () => {
    toutDeplie = !toutDeplie;
    if (!toutDeplie) deplies.clear();
    el.deplier.textContent = toutDeplie ? 'Tout replier' : 'Tout déplier';
    afficherElements();
  });

  // Saisie (notes libres, dictée, texte collé) → nouvel élément.
  function ajouterSaisie() {
    const t = el.saisie.value.trim();
    if (!t) return false;
    const audio = audiosSaisie;
    ajouterElement({
      type: 'texte', nom: el.titreNote.value.trim() || t.split('\n')[0].slice(0, 60), contenu: t,
      ...(audio.length ? { source: 'dictée', audio } : {}),
    });
    el.saisie.value = ''; el.titreNote.value = ''; audiosSaisie = [];
    return true;
  }
  el.ajouter.addEventListener('click', () => { if (!ajouterSaisie()) el.saisie.focus(); });
  el.vider.addEventListener('click', () => {
    if (el.saisie.value.trim() && !confirmer('Effacer le texte en cours de saisie ?')) return;
    el.saisie.value = ''; el.titreNote.value = ''; audiosSaisie = [];
  });

  async function ajouterFichiers(liste) {
    for (const f of liste) {
      el.info.textContent = 'Lecture de ' + f.name + '…';
      try {
        if (f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|opus|aac|flac)$/i.test(f.name)) {
          // Fichier audio : transcrit, le texte va dans la saisie.
          dernierChamp = el.saisie;
          if (window.transcrireFichierAudio) window.transcrireFichierAudio(f);
          continue;
        }
        for (const p of await lireDocument(f, { maxCaracteres: 100000, pagesScannees: 4 })) {
          ajouterElement(p.type === 'image' ? { type: 'image', nom: p.nom, url: p.url } : { type: 'texte', nom: p.nom, contenu: p.contenu });
        }
      } catch (e) { alert(f.name + ' : ' + e.message); }
    }
    el.info.textContent = '';
  }
  el.fichiers.addEventListener('click', () => el.choixFichiers.click());
  el.choixFichiers.addEventListener('change', () => { ajouterFichiers([...el.choixFichiers.files]); el.choixFichiers.value = ''; });
  const colonneCentre = el.zone.closest('section');
  colonneCentre.addEventListener('dragover', (e) => { e.preventDefault(); el.zone.classList.add('survol'); });
  colonneCentre.addEventListener('dragleave', (e) => { if (!colonneCentre.contains(e.relatedTarget)) el.zone.classList.remove('survol'); });
  colonneCentre.addEventListener('drop', (e) => { e.preventDefault(); el.zone.classList.remove('survol'); ajouterFichiers([...e.dataTransfer.files]); });
  el.saisie.addEventListener('paste', (e) => {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (images.length) { e.preventDefault(); ajouterFichiers(images); }
  });

  // --- Boîte de réception : envois du capteur (Ctrl+Alt+T texte sélectionné, Ctrl+Alt+P capture) ---
  async function releverBoite() {
    try {
      const r = await passerelleJson('/boite');
      for (const x of r.elements || []) {
        const element = x.type === 'image'
          ? { type: 'image', nom: 'Capture d\'écran', url: await imageVersJpeg(x.contenu, 1600), source: x.source }
          : { type: 'texte', nom: x.contenu.split('\n')[0].slice(0, 60), contenu: x.contenu, source: x.source };
        ajouterElement(element);
        el.infoDossiers.textContent = `Reçu dans « ${dossier.brouillon ? 'Brouillon' : dossier.libelle} » : ${element.type === 'image' ? 'capture d\'écran' : 'texte'}${x.source ? ' de ' + x.source : ''}.`;
        if (vueActive !== 'travail') { el.onglet.classList.add('flash'); setTimeout(() => el.onglet.classList.remove('flash'), 2000); }
      }
    } catch {}
    setTimeout(releverBoite, 2000);
  }

  // --- Liseuse : texte complet d'un élément, d'une création ou du résultat, modifiable ---
  let lecture = null;   // {liste: 'elements' | 'productions' | 'sortie', index}
  function itemLecture() {
    if (lecture.liste === 'sortie') return { l: [lecture.objet], x: lecture.objet };
    const l = lecture.liste === 'elements' ? dossier.elements : dossier.productions;
    return { l, x: l[lecture.index] };
  }
  function ouvrirLiseuse(liste, index, objet) {
    lecture = { liste, index: index || 0, objet };
    remplirLiseuse();
    if (!el.liseuse.open) el.liseuse.showModal();
    if (!el.liTexte.hidden) { el.liTexte.focus(); el.liTexte.setSelectionRange(0, 0); el.liTexte.scrollTop = 0; }
  }
  function remplirLiseuse() {
    const { l, x } = itemLecture();
    if (!x) { el.liseuse.close(); return; }
    const image = x.type === 'image';
    el.liTitre.value = lecture.liste === 'elements' ? x.nom || '' : x.titre || '';
    el.liPosition.textContent = lecture.liste === 'sortie' ? '' : `${lecture.liste === 'elements' ? 'Élément' : 'Création'} ${lecture.index + 1} / ${l.length}`;
    el.liInfo.textContent = [x.date, x.source, x.outil && NOMS_OUTILS[x.outil]].filter(Boolean).join(' – ');
    el.liTexte.hidden = image;
    el.liImage.hidden = !image;
    if (image) el.liImage.src = x.url;
    else { el.liTexte.value = lecture.liste === 'elements' ? x.contenu : x.texte; el.liTexte.scrollTop = 0; }
    el.liPrec.disabled = lecture.index <= 0;
    el.liSuiv.disabled = lecture.index >= l.length - 1;
    el.liCopier.hidden = image;
  }
  el.liTexte.addEventListener('input', () => {
    const { x } = itemLecture();
    if (lecture.liste === 'elements') x.contenu = el.liTexte.value;
    else x.texte = el.liTexte.value;
    if (x === courante || lecture.liste === 'sortie') el.sortie.value = el.liTexte.value;
    if (lecture.liste !== 'sortie') enregistrer();
  });
  el.liTitre.addEventListener('input', () => {
    const { x } = itemLecture();
    if (lecture.liste === 'elements') x.nom = el.liTitre.value; else x.titre = el.liTitre.value;
    if (x === courante) el.sortieTitre.textContent = x.titre;
    if (lecture.liste !== 'sortie') enregistrer();
  });
  el.liPrec.addEventListener('click', () => { lecture.index--; remplirLiseuse(); });
  el.liSuiv.addEventListener('click', () => { lecture.index++; remplirLiseuse(); });
  el.liFermer.addEventListener('click', () => el.liseuse.close());
  el.liCopier.addEventListener('click', () => copierTexte(el.liTexte.value, el.liCopier));
  el.liseuse.addEventListener('close', () => { lecture = null; afficherElements(); afficherProductions(); });

  // --- Créations ---
  function afficherProductions() {
    el.productions.innerHTML = '';
    el.productionsTitre.textContent = `Créations du dossier (${dossier.productions.length})`;
    dossier.productions.forEach((p, i) => {
      const ligne = document.createElement('div');
      ligne.className = 'ligne';
      const b = document.createElement('button');
      b.className = 'element-liste' + (p === courante ? ' actif' : '');
      b.innerHTML = '<strong></strong><span class="discret"></span>';
      b.querySelector('strong').textContent = p.titre;
      b.querySelector('span').textContent = `${NOMS_OUTILS[p.outil] || ''} – ${p.date}`;
      b.addEventListener('click', () => montrerCreation(p));
      ligne.append(b, bouton('×', 'Supprimer cette création', () => {
        if (!confirmer(`Supprimer la création « ${p.titre} » ?`)) return;
        dossier.productions.splice(i, 1);
        if (p === courante) montrerCreation(null); else afficherProductions();
        enregistrer();
      }));
      el.productions.appendChild(ligne);
    });
  }

  function montrerCreation(p, messages = null) {
    courante = p; conversation = messages;
    versionPrecedente = null; el.annuler.disabled = true;
    el.sortie.value = p ? p.texte : '';
    el.sortieTitre.textContent = p ? p.titre : 'Résultat';
    el.stats.textContent = p ? `${NOMS_OUTILS[p.outil] || ''} – ${p.date}` : '';
    el.reflexion.hidden = true;
    el.ligneAffiner.hidden = !!p && p.outil === 'anonymisation';
    afficherProductions();
  }
  el.sortie.addEventListener('input', () => { if (courante) { courante.texte = el.sortie.value; enregistrer(); } });

  // Génération en flux dans le cadre « Résultat » : phase, réflexion, statistiques.
  // Renvoie {texte, statut: 'ok' | 'arrete' | 'erreur'}.
  async function generer(messages) {
    controleur = new AbortController();
    occupe(true);
    el.sortie.value = ''; el.stats.textContent = ''; el.reflexionTexte.textContent = ''; el.reflexion.hidden = true;
    const montrerReflexion = (reglages.redaction || {}).afficher_reflexion !== false;
    const t0 = performance.now();
    let phase = 'Lecture du dossier', texte = '';
    const afficherPhase = () => { el.info.textContent = `${phase}… ${Math.round((performance.now() - t0) / 1000)} s`; };
    afficherPhase();
    const minuteur = setInterval(afficherPhase, 500);
    try {
      const r = await appelerModele(messages, {
        signal: controleur.signal,
        surReflexion: (x) => {
          phase = 'Réflexion';
          if (!montrerReflexion) return;
          el.reflexion.hidden = false; el.reflexionTexte.textContent = x;
          el.reflexionTexte.scrollTop = el.reflexionTexte.scrollHeight;
        },
        surStats: (t) => { el.stats.textContent = bilanGeneration(t); },
        surTexte: (x) => { phase = 'Rédaction'; texte = x; el.sortie.value = x; el.sortie.scrollTop = el.sortie.scrollHeight; },
      });
      el.info.textContent = '';
      el.stats.textContent = r.bilan;
      if (r.reflexion && montrerReflexion) el.reflexion.open = false;
      return { texte: r.texte, statut: 'ok' };
    } catch (e) {
      if (e.name === 'AbortError') { el.info.textContent = 'Arrêté.'; return { texte: texte.trim(), statut: 'arrete' }; }
      el.info.textContent = 'Erreur : ' + e.message + (/context|exceed/i.test(e.message) ? ' (dossier trop long : décochez des éléments)' : '');
      return { texte: '', statut: 'erreur' };
    } finally {
      clearInterval(minuteur);
      controleur = null;
      occupe(false);
    }
  }

  function occupe(oui) {
    [el.syLancer, el.docLancer, el.questionLancer, el.anLancer, el.anDetecter, el.affiner].forEach((b) => { b.disabled = oui; });
    el.arreter.hidden = !oui;
    el.sortie.readOnly = oui;
  }

  // Texte resté dans la saisie : ajouté au dossier avant une création.
  function ajouterSaisieAuto() {
    if (ajouterSaisie()) el.info.textContent = 'Texte de la saisie ajouté au dossier.';
  }

  // construire() est appelé après l'ajout de la saisie, pour que les messages en tiennent compte.
  async function produire(outilProd, titre, construire, extra = {}) {
    if (controleur) return;
    ajouterSaisieAuto();
    if (!actifs().length) { el.info.textContent = 'Ajoutez d\'abord des éléments au dossier (ou cochez-en).'; return; }
    const messages = construire();
    const r = await generer(messages);
    if (!r.texte) return;
    const p = { id: nouvelId(), outil: outilProd, titre, texte: r.texte, date: maintenant(), ...extra };
    dossier.productions.unshift(p);
    enregistrer();
    const bilan = el.stats.textContent;
    montrerCreation(p, messages);
    el.stats.textContent = bilan;
    if (outilProd === 'document' && reglagesGeneraux().copie_auto) copierTexte(r.texte, el.copier);
  }

  // --- Contexte envoyé au modèle ---
  function contexte() {
    const a = actifs();
    const textes = a.filter((e) => e.type === 'texte').map((e) =>
      `--- Élément ${dossier.elements.indexOf(e) + 1} : ${e.nom || 'texte'} (${e.date}${e.source ? ', ' + e.source : ''}) ---\n${e.contenu.trim()}`);
    const images = serveur.vision ? a.filter((e) => e.type === 'image').slice(-MAX_IMAGES) : [];
    const notes = images.map((e) => `--- Élément ${dossier.elements.indexOf(e) + 1} : image « ${e.nom} » (${e.date}) jointe ---`);
    const libelle = dossier.brouillon ? '' : ` « ${dossier.libelle} »`;
    return { texte: `Dossier patient${libelle} :\n\n` + [...textes, ...notes].join('\n\n'), images };
  }

  function messageDossier(consigne) {
    const c = contexte();
    const texte = `${c.texte}\n\n=== Demande ===\n${consigne}`;
    if (!c.images.length) return { role: 'user', content: texte };
    return { role: 'user', content: [{ type: 'text', text: texte }, ...c.images.map((e) => ({ type: 'image_url', image_url: { url: e.url } }))] };
  }

  // Message système : parties propres à l'outil, puis contexte général, glossaire et formulations types.
  const systeme = (...parties) => appliquerSignature([...parties, consignesPersonnelles()].filter(Boolean).join('\n\n'));
  const complement = (c) => (c ? '\nConsignes complémentaires : ' + c : '');

  const REGLES = 'Tu es l\'assistant d\'un neurologue hospitalier. Tu travailles uniquement à partir des éléments du dossier fourni. ' +
    'N\'invente jamais d\'information. Quand tu affirmes un fait, cite l\'élément source entre crochets, par exemple [Élément 2]. ' +
    'Signale les informations manquantes ou contradictoires. Réponds en français, de façon structurée et concise.';

  function lancerSynthese() {
    const consignes = el.syConsignes.value.trim();
    produire('synthese', 'Synthèse de l\'histoire', () => [
      { role: 'system', content: systeme(REGLES) },
      messageDossier('Rédige la synthèse du dossier avec les rubriques suivantes : 1. Résumé en trois lignes. ' +
        '2. Antécédents. 3. Histoire de la maladie, dans l\'ordre chronologique avec les dates. 4. Traitements actuels et antérieurs. ' +
        '5. Examens complémentaires et résultats importants. 6. Problèmes actifs. 7. Points à vérifier (informations manquantes ou contradictoires).' +
        complement(consignes)),
    ], { consignes });
  }

  function lancerQuestion() {
    const q = el.question.value.trim();
    if (!q) return el.question.focus();
    el.question.value = '';
    produire('question', 'Question : ' + q.slice(0, 80), () => [
      { role: 'system', content: systeme(REGLES) },
      messageDossier('Réponds à cette question. Si la réponse ne figure pas dans le dossier, dis-le clairement.\nQuestion : ' + q),
    ], { question: q });
  }

  // Document : consignes du modèle en système, exemples en tours de dialogue (few-shot), puis les notes.
  // Un seul élément texte coché : envoyé tel quel, comme les notes des exemples ; sinon, le dossier.
  function lancerDocument() {
    const m = modelesDoc[+el.type.value];
    if (!m) { el.info.textContent = 'Aucun modèle de document chargé.'; return; }
    const consignes = el.docConsignes.value.trim();
    produire('document', m.titre, () => {
      const a = actifs();
      const seul = a.length === 1 && a[0].type === 'texte';
      const messages = [{ role: 'system', content: systeme(consignesCommunes, m.consignes, seul ? '' :
        'Les notes sont remplacées ici par un dossier patient composé de plusieurs éléments : utilise uniquement les informations utiles au document demandé.') }];
      for (const ex of m.exemples) messages.push({ role: 'user', content: ex.notes }, { role: 'assistant', content: appliquerSignature(ex.document) });
      messages.push(seul ? { role: 'user', content: a[0].contenu.trim() + (consignes ? `\n\n(Consignes complémentaires : ${consignes})` : '') }
        : messageDossier(`Rédige le document « ${m.titre} » à partir du dossier.` + complement(consignes)));
      return messages;
    }, { consignes, modele: m.fichier });
  }

  async function affiner() {
    const consigne = el.consigne.value.trim();
    const actuel = el.sortie.value.trim();
    if (!consigne || !actuel || controleur) return el.consigne.focus();
    // La version affichée (éventuellement corrigée à la main) devient la réponse de référence.
    const base = conversation || [{ role: 'system', content: systeme('Tu es l\'assistant d\'un neurologue hospitalier. Réponds en français.') },
      { role: 'user', content: 'Voici le document à modifier.' }];
    const messages = base.concat(
      { role: 'assistant', content: actuel },
      { role: 'user', content: 'Modifie le document selon cette consigne, et renvoie le document complet : ' + consigne },
    );
    const precedent = el.sortie.value;
    const r = await generer(messages);
    if (r.statut !== 'ok' || !r.texte) { el.sortie.value = precedent; return; }
    versionPrecedente = precedent; el.annuler.disabled = false;
    conversation = messages; el.consigne.value = '';
    if (courante) {
      (courante.versions = courante.versions || []).push(precedent);
      courante.texte = r.texte;
      enregistrer();
      if (courante.outil === 'document' && reglagesGeneraux().copie_auto) copierTexte(r.texte, el.copier);
    }
  }

  el.annuler.addEventListener('click', () => {
    if (versionPrecedente === null) return;
    el.sortie.value = versionPrecedente;
    if (courante) { courante.texte = versionPrecedente; enregistrer(); }
    versionPrecedente = null; el.annuler.disabled = true;
  });

  // --- Anonymisation des éléments cochés ---
  function optionsAnonymisation() {
    return {
      nom: $('an-nom').value, prenom: $('an-prenom').value, naissance: $('an-naissance').value, autres: $('an-autres').value,
      dates: $('an-dates').checked, tel: $('an-tel').checked, mail: $('an-mail').checked, nir: $('an-nir').checked,
    };
  }
  const textesActifs = () => actifs().filter((e) => e.type === 'texte').map((e) => e.contenu.trim()).join('\n\n');

  async function anonymiser() {
    if (controleur) return;
    ajouterSaisieAuto();
    const source = textesActifs();
    if (!source) { el.info.textContent = 'Cochez au moins un élément texte à anonymiser.'; return; }
    const o = optionsAnonymisation();
    if (!o.nom.trim() && !o.autres.trim() &&
      !confirm('Aucun nom saisi : seuls les éléments détectés automatiquement (dates, téléphones…) seront masqués. Continuer ?')) return;
    const id = Anonymisation.nouvelIdentifiant();
    const r = Anonymisation.anonymiser(source, o);
    const p = { id: nouvelId(), outil: 'anonymisation', titre: `Texte anonymisé ${id}`, texte: `[${id}]\n${r.texte}`, date: maintenant(), anon: id };
    dossier.productions.unshift(p);
    enregistrer();
    montrerCreation(p);
    el.stats.textContent = r.correspondances.length ? 'Masqué : ' + r.correspondances.map((c) => `${c.jeton} = ${c.valeur}`).join(' ; ') : 'Rien n\'a été masqué.';
    if (!complet()) { el.info.textContent = 'Mode secours : la table de correspondance n\'est pas enregistrée (désanonymisation impossible plus tard).'; return; }
    try {
      await passerelleJson(`/correspondance?id=${id}`, { methode: 'POST', corps: { id, date: maintenant(), libelle: dossier.brouillon ? 'Brouillon' : dossier.libelle, correspondances: r.correspondances } });
      el.info.textContent = `${r.correspondances.length} élément(s) masqué(s). Table : donnees\\anonymisation\\${id}.json`;
      chargerTables();
    } catch (e) { el.info.textContent = 'Table non enregistrée : ' + e.message; }
  }

  // Détection des noms et identifiants par le modèle, ajoutés à « Autres éléments » pour relecture.
  el.anDetecter.addEventListener('click', async () => {
    ajouterSaisieAuto();
    const source = textesActifs();
    if (!source) { el.info.textContent = 'Cochez au moins un élément texte.'; return; }
    el.anDetecter.disabled = true;
    el.info.textContent = 'Recherche des éléments identifiants par l\'IA…';
    try {
      const r = await appelerModele([
        { role: 'system', content: 'Tu repères les informations permettant d\'identifier des personnes dans un texte médical. Réponds uniquement par un objet JSON : {"personnes": [noms et prénoms de personnes, tels qu\'écrits], "lieux": [adresses, villes, établissements], "identifiants": [numéros de dossier, IPP, téléphones, etc.]}. Ne liste ni les maladies, ni les médicaments, ni les examens.' },
        { role: 'user', content: source.slice(0, 12000) },
      ], { temperature: 0, max_tokens: 800 });
      const json = JSON.parse(r.texte.slice(r.texte.indexOf('{'), r.texte.lastIndexOf('}') + 1));
      const trouves = [...(json.personnes || []), ...(json.lieux || []), ...(json.identifiants || [])].map(String).map((x) => x.trim()).filter(Boolean);
      const autres = $('an-autres');
      const deja = new Set(autres.value.split(/[\n;]+/).map((x) => x.trim().toLowerCase()));
      const nouveaux = trouves.filter((x) => !deja.has(x.toLowerCase()));
      autres.value = [autres.value.trim(), ...nouveaux].filter(Boolean).join('\n');
      el.info.textContent = nouveaux.length ? `${nouveaux.length} élément(s) ajouté(s) à la liste : vérifiez-la, puis « Anonymiser ».` : 'Aucun élément supplémentaire trouvé.';
    } catch (e) {
      el.info.textContent = 'Détection impossible : ' + e.message;
    } finally { el.anDetecter.disabled = false; }
  });

  async function chargerTables() {
    if (!complet()) return;
    try {
      const r = await passerelleJson('/correspondances');
      el.anTable.innerHTML = '<option value="">Identifiant lu dans le texte</option>';
      for (const c of r.correspondances) el.anTable.add(new Option(`${c.id} – ${c.libelle || ''}`, c.id));
    } catch (e) { console.warn(e); }
  }

  // Désanonymisation du texte du cadre « Résultat » (non enregistrée dans le dossier).
  el.anRetablir.addEventListener('click', async () => {
    const texte = el.sortie.value;
    if (!texte.trim()) { el.info.textContent = 'Collez d\'abord le texte à rétablir dans le cadre « Résultat ».'; el.sortie.focus(); return; }
    const lu = texte.match(/\[?(ANON-\d{8}-\d{6})\]?/);
    const id = el.anTable.value || (lu && lu[1]);
    if (!id) { el.info.textContent = 'Identifiant ANON-… introuvable : choisissez la table dans la liste.'; return; }
    try {
      const table = await passerelleJson(`/correspondance?id=${id}`);
      montrerCreation(null);
      el.sortie.value = Anonymisation.retablir(texte, table.correspondances);
      el.sortieTitre.textContent = `Texte rétabli (${id})`;
      el.info.textContent = 'Texte rétabli (non enregistré dans le dossier).';
    } catch (e) { el.info.textContent = `Table ${id} introuvable : ${e.message}`; }
  });

  // --- Outils ---
  function choisirOutil(nom) {
    if (!$('outil-' + nom)) nom = 'synthese';
    outil = nom;
    document.querySelectorAll('[data-outil]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.outil === nom)));
    document.querySelectorAll('.panneau-outil').forEach((p) => { p.hidden = p.id !== 'outil-' + nom; });
    try { localStorage.setItem('outil', nom); } catch {}
  }
  document.querySelectorAll('[data-outil]').forEach((b) => b.addEventListener('click', () => choisirOutil(b.dataset.outil)));
  const LANCER = { synthese: lancerSynthese, document: lancerDocument, question: lancerQuestion, anonymisation: anonymiser };

  el.syLancer.addEventListener('click', lancerSynthese);
  el.docLancer.addEventListener('click', lancerDocument);
  el.questionLancer.addEventListener('click', lancerQuestion);
  el.question.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); lancerQuestion(); } });
  el.anLancer.addEventListener('click', anonymiser);
  el.affiner.addEventListener('click', affiner);
  el.consigne.addEventListener('keydown', (e) => { if (e.key === 'Enter') affiner(); });
  el.arreter.addEventListener('click', () => controleur && controleur.abort());
  el.copier.addEventListener('click', () => el.sortie.value && copierTexte(el.sortie.value, el.copier));
  el.lireSortie.addEventListener('click', () => {
    if (courante) ouvrirLiseuse('productions', dossier.productions.indexOf(courante));
    else if (el.sortie.value.trim()) ouvrirLiseuse('sortie', 0, { titre: el.sortieTitre.textContent, texte: el.sortie.value });
  });
  el.versDossier.addEventListener('click', () => {
    const t = el.sortie.value.trim();
    if (!t) return;
    ajouterElement({ type: 'texte', nom: courante ? courante.titre : el.sortieTitre.textContent, contenu: t, source: 'création' });
    el.info.textContent = 'Résultat ajouté aux éléments du dossier.';
  });
  // Ctrl+Entrée : lance l'outil choisi.
  document.addEventListener('keydown', (e) => {
    if (vueActive === 'travail' && !el.liseuse.open && e.key === 'Enter' && e.ctrlKey && !controleur) { e.preventDefault(); LANCER[outil](); }
  });

  // --- Modèles de documents (app/prompts + ressources/prompts) ---
  async function chargerModelesDoc() {
    let docs = [];
    try { docs = await chargerDocuments(); } catch { el.info.textContent = 'Modèles de documents introuvables : lancez l\'IA avec Demarrer.bat.'; }
    const commun = docs.find((d) => d.fichier === '_commun.txt');
    consignesCommunes = commun ? analyserModele(commun.contenu.replace(/\r\n/g, '\n'), '_commun.txt').consignes : '';
    const choixAvant = modelesDoc[+el.type.value] ? modelesDoc[+el.type.value].fichier : null;
    modelesDoc = docs.filter((d) => !d.fichier.startsWith('_')).map((d) => analyserModele(d.contenu.replace(/\r\n/g, '\n'), d.fichier));
    el.type.innerHTML = '';
    modelesDoc.forEach((m, i) => el.type.add(new Option(m.titre, String(i))));
    let memorise = choixAvant;
    if (!memorise) { try { memorise = localStorage.getItem('type'); } catch {} }
    const idx = modelesDoc.findIndex((m) => m.fichier === memorise);
    if (idx >= 0) el.type.value = String(idx);
  }
  el.type.addEventListener('change', () => { try { localStorage.setItem('type', modelesDoc[+el.type.value].fichier); } catch {} });
  document.addEventListener('documents-modifies', chargerModelesDoc);
  document.addEventListener('serveur-pret', afficherElements);

  reglagesPrets.then(async () => {
    let o = null;
    try { o = localStorage.getItem('outil'); } catch {}
    choisirOutil(o || 'synthese');
    afficherDossier();
    afficherListe();
    chargerModelesDoc();
    if (!complet()) {
      el.nouveau.disabled = true;
      el.infoDossiers.textContent = 'Mode secours : seul le brouillon est disponible (rien n\'est enregistré). Les dossiers ont besoin de la passerelle.';
      return;
    }
    await chargerListe();
    chargerTables();
    releverBoite();
  });
}
