// Onglet Synthèse patient : un dossier par patient (donnees/patients/<id>.json, disque chiffré) qui
// réunit des éléments (texte collé, PDF, images, envois du capteur par raccourci clavier) et les
// productions du modèle : synthèse de l'histoire, questions/réponses, documents rédigés.
'use strict';

{
  const el = {
    liste: $('sy-liste'), nouveau: $('sy-nouveau'), recherche: $('sy-recherche'), boiteInfo: $('sy-boite'),
    vide: $('sy-vide'), dossier: $('sy-dossier'), libelle: $('sy-libelle'), supprimer: $('sy-supprimer'),
    elements: $('sy-elements'), coller: $('sy-coller'), ajouterTexte: $('sy-ajouter-texte'), fichiers: $('sy-fichiers'),
    choixFichiers: $('sy-choix-fichiers'), zone: $('sy-zone'), taille: $('sy-taille'),
    resume: $('sy-resume'), question: $('sy-question'), poser: $('sy-poser'), type: $('sy-type'), consignes: $('sy-consignes'),
    rediger: $('sy-rediger'), arreter: $('sy-arreter'), sortie: $('sy-sortie'), info: $('sy-info'), stats: $('sy-stats'),
    reflexion: $('sy-reflexion'), reflexionTexte: $('sy-reflexion-texte'), copier: $('sy-copier'), productions: $('sy-productions'),
    onglet: document.querySelector('[data-vue=synthese]'),
  };

  let dossier = null;          // dossier ouvert
  let patients = [];
  let enAttente = [];          // éléments reçus du capteur quand aucun dossier n'est ouvert
  let controleur = null;
  let modelesDoc = [];
  let consignesCommunes = '';
  const MAX_IMAGES = 4;        // images envoyées au modèle par requête (les plus récentes)

  const nouvelId = () => 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const disponible = () => config.mode === 'complet';

  // --- Liste des dossiers ---
  async function chargerListe() {
    if (!disponible()) return;
    const r = await passerelleJson('/patients');
    patients = r.patients;
    afficherListe();
  }

  function afficherListe() {
    const filtre = el.recherche.value.trim().toLowerCase();
    el.liste.innerHTML = '';
    for (const p of patients) {
      if (filtre && !String(p.libelle || '').toLowerCase().includes(filtre)) continue;
      const b = document.createElement('button');
      b.className = 'element-liste' + (dossier && dossier.id === p.id ? ' actif' : '');
      b.innerHTML = '<strong></strong><span class="discret"></span>';
      b.querySelector('strong').textContent = p.libelle || p.id;
      b.querySelector('span').textContent = 'modifié ' + p.modifie;
      b.addEventListener('click', () => ouvrir(p.id));
      el.liste.appendChild(b);
    }
  }

  async function ouvrir(id) {
    dossier = await passerelleJson(`/patient?id=${encodeURIComponent(id)}`);
    dossier.elements = dossier.elements || [];
    dossier.productions = dossier.productions || [];
    el.vide.hidden = true; el.dossier.hidden = false;
    el.libelle.value = dossier.libelle || '';
    el.sortie.textContent = ''; el.stats.textContent = ''; el.reflexion.hidden = true;
    afficherElements(); afficherProductions(); afficherListe();
    if (enAttente.length) { const e = enAttente; enAttente = []; for (const x of e) ajouterElement(x); afficherBoite(); }
  }

  el.nouveau.addEventListener('click', async () => {
    const libelle = prompt('Libellé du dossier (ex. initiales, chambre, date) :', '');
    if (libelle === null) return;
    dossier = { id: nouvelId(), libelle: libelle.trim() || 'Sans titre', cree: maintenant(), elements: [], productions: [] };
    await enregistrer(true);
    await chargerListe();
    await ouvrir(dossier.id);
  });
  el.recherche.addEventListener('input', afficherListe);
  el.libelle.addEventListener('change', () => { dossier.libelle = el.libelle.value.trim() || 'Sans titre'; enregistrer().then(chargerListe); });
  el.supprimer.addEventListener('click', async () => {
    if (!dossier || !confirm(`Supprimer définitivement le dossier « ${dossier.libelle} » et tout son contenu ?`)) return;
    await passerelleJson(`/patient-supprimer?id=${encodeURIComponent(dossier.id)}`, { methode: 'POST' });
    dossier = null; el.dossier.hidden = true; el.vide.hidden = false;
    chargerListe();
  });

  // --- Enregistrement (différé pour regrouper les modifications) ---
  let minuterieEnregistrement = null;
  async function enregistrer(immediat) {
    if (!dossier) return;
    clearTimeout(minuterieEnregistrement);
    const envoyer = () => passerelleJson(`/patient?id=${encodeURIComponent(dossier.id)}`, { methode: 'POST', corps: dossier })
      .catch((e) => { el.info.textContent = 'Enregistrement impossible : ' + e.message; });
    if (immediat) return envoyer();
    minuterieEnregistrement = setTimeout(envoyer, 600);
  }

  // --- Éléments du dossier ---
  function ajouterElement(e) {
    dossier.elements.push({ id: nouvelId(), date: maintenant(), actif: true, ...e });
    afficherElements();
    enregistrer();
  }

  function estimationTokens() {
    const actifs = dossier.elements.filter((e) => e.actif !== false);
    const texte = actifs.filter((e) => e.type === 'texte').reduce((n, e) => n + e.contenu.length, 0);
    const images = Math.min(MAX_IMAGES, actifs.filter((e) => e.type === 'image').length);
    return Math.round(texte / 3.5 + images * 280);
  }

  function afficherElements() {
    el.elements.innerHTML = '';
    dossier.elements.forEach((e, i) => {
      const carte = document.createElement('div');
      carte.className = 'carte-element' + (e.actif === false ? ' inactif' : '');
      const entete = document.createElement('div');
      entete.className = 'ligne';
      const actif = document.createElement('input');
      actif.type = 'checkbox'; actif.checked = e.actif !== false; actif.title = 'Inclure dans les demandes au modèle';
      actif.addEventListener('change', () => { e.actif = actif.checked; afficherElements(); enregistrer(); });
      const titre = document.createElement('strong');
      titre.textContent = `${i + 1}. ${e.type === 'image' ? '🖼' : '📄'} ${e.nom || 'Texte'}`;
      const date = document.createElement('span');
      date.className = 'discret'; date.textContent = e.date + (e.source ? ` – ${e.source}` : '');
      const retirer = document.createElement('button');
      retirer.textContent = '×'; retirer.title = 'Retirer du dossier';
      retirer.addEventListener('click', () => { if (confirm('Retirer cet élément du dossier ?')) { dossier.elements.splice(i, 1); afficherElements(); enregistrer(); } });
      entete.append(actif, titre, date, retirer);
      carte.appendChild(entete);
      if (e.type === 'image') { const img = document.createElement('img'); img.src = e.url; carte.appendChild(img); }
      else { const t = document.createElement('div'); t.className = 'apercu'; t.textContent = e.contenu.slice(0, 400) + (e.contenu.length > 400 ? '…' : ''); carte.appendChild(t); }
      el.elements.appendChild(carte);
    });
    const tokens = estimationTokens(), limite = serveur.nctx || 8192;
    el.taille.textContent = `Éléments inclus : environ ${tokens.toLocaleString('fr-FR')} tokens sur ${limite.toLocaleString('fr-FR')} de mémoire du modèle.`;
    el.taille.className = tokens > limite * 0.75 ? 'avertissement' : 'discret';
    if (tokens > limite * 0.75) el.taille.textContent += ' Trop long : décochez des éléments ou augmentez CONTEXTE dans config.bat.';
  }

  el.ajouterTexte.addEventListener('click', () => {
    const t = el.coller.value.trim();
    if (!t || !dossier) return;
    ajouterElement({ type: 'texte', nom: t.split('\n')[0].slice(0, 60), contenu: t });
    el.coller.value = '';
  });

  async function ajouterFichiers(liste) {
    if (!dossier) return;
    for (const f of liste) {
      el.info.textContent = 'Lecture de ' + f.name + '…';
      try {
        for (const p of await lireDocument(f, { maxCaracteres: 100000, pagesScannees: 4 })) {
          ajouterElement(p.type === 'image' ? { type: 'image', nom: p.nom, url: p.url } : { type: 'texte', nom: p.nom, contenu: p.contenu });
        }
      } catch (e) { alert(f.name + ' : ' + e.message); }
    }
    el.info.textContent = '';
  }
  el.fichiers.addEventListener('click', () => el.choixFichiers.click());
  el.choixFichiers.addEventListener('change', () => { ajouterFichiers([...el.choixFichiers.files]); el.choixFichiers.value = ''; });
  el.zone.addEventListener('dragover', (e) => { e.preventDefault(); el.zone.classList.add('survol'); });
  el.zone.addEventListener('dragleave', () => el.zone.classList.remove('survol'));
  el.zone.addEventListener('drop', (e) => { e.preventDefault(); el.zone.classList.remove('survol'); ajouterFichiers([...e.dataTransfer.files]); });
  el.coller.addEventListener('paste', (e) => {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (images.length) { e.preventDefault(); ajouterFichiers(images); }
  });

  // --- Boîte de réception : envois du capteur (Ctrl+Alt+T texte sélectionné, Ctrl+Alt+P capture) ---
  function afficherBoite() {
    el.boiteInfo.textContent = enAttente.length ? `${enAttente.length} élément(s) reçu(s) : ouvrez ou créez un dossier pour les ajouter.` : '';
    el.onglet.textContent = enAttente.length ? `Synthèse patient (${enAttente.length})` : 'Synthèse patient';
  }

  async function releverBoite() {
    if (!disponible()) return;
    try {
      const r = await passerelleJson('/boite');
      for (const x of r.elements || []) {
        const element = x.type === 'image'
          ? { type: 'image', nom: 'Capture d\'écran', url: await imageVersJpeg(x.contenu, 1600), source: x.source }
          : { type: 'texte', nom: x.contenu.split('\n')[0].slice(0, 60), contenu: x.contenu, source: x.source };
        if (dossier) {
          ajouterElement(element);
          el.info.textContent = `Reçu dans « ${dossier.libelle} » : ${element.type === 'image' ? 'capture d\'écran' : 'texte'}${x.source ? ' de ' + x.source : ''}.`;
          if (vueActive !== 'synthese') el.onglet.classList.add('flash');
          setTimeout(() => el.onglet.classList.remove('flash'), 2000);
        } else {
          enAttente.push(element);
        }
      }
      afficherBoite();
    } catch {}
    setTimeout(releverBoite, 2000);
  }

  // --- Contexte envoyé au modèle ---
  function contexte() {
    const actifs = dossier.elements.filter((e) => e.actif !== false);
    const textes = actifs.map((e, i) => (e.type === 'texte' ? `--- Élément ${dossier.elements.indexOf(e) + 1} : ${e.nom || 'texte'} (${e.date}${e.source ? ', ' + e.source : ''}) ---\n${e.contenu.trim()}` : null)).filter(Boolean);
    const images = serveur.vision ? actifs.filter((e) => e.type === 'image').slice(-MAX_IMAGES) : [];
    const notes = images.map((e) => `--- Élément ${dossier.elements.indexOf(e) + 1} : image « ${e.nom} » (${e.date}) jointe ---`);
    return { texte: `Dossier patient « ${dossier.libelle} » :\n\n` + [...textes, ...notes].join('\n\n'), images };
  }

  function messageUtilisateur(consigne) {
    const c = contexte();
    const texte = `${c.texte}\n\n=== Demande ===\n${consigne}`;
    if (!c.images.length) return { role: 'user', content: texte };
    return { role: 'user', content: [{ type: 'text', text: texte }, ...c.images.map((e) => ({ type: 'image_url', image_url: { url: e.url } }))] };
  }

  const REGLES = 'Tu es l\'assistant d\'un neurologue hospitalier. Tu travailles uniquement à partir des éléments du dossier fourni. ' +
    'N\'invente jamais d\'information. Quand tu affirmes un fait, cite l\'élément source entre crochets, par exemple [Élément 2]. ' +
    'Signale les informations manquantes ou contradictoires. Réponds en français, de façon structurée et concise.';

  async function produire(outil, titre, messages, extra = {}) {
    if (!dossier || controleur) return;
    if (!dossier.elements.some((e) => e.actif !== false)) { el.info.textContent = 'Ajoutez d\'abord des éléments au dossier.'; return; }
    controleur = new AbortController();
    el.arreter.hidden = false;
    [el.resume, el.poser, el.rediger].forEach((b) => { b.disabled = true; });
    el.sortie.textContent = ''; el.stats.textContent = ''; el.reflexionTexte.textContent = ''; el.reflexion.hidden = true;
    const t0 = performance.now();
    let phase = 'Lecture du dossier';
    const minuteur = setInterval(() => { el.info.textContent = `${phase}… ${Math.round((performance.now() - t0) / 1000)} s`; }, 500);
    let texte = '';
    try {
      const r = await appelerModele(messages, {
        signal: controleur.signal,
        surReflexion: (x) => { phase = 'Réflexion'; if ((reglages.redaction || {}).afficher_reflexion !== false) { el.reflexion.hidden = false; el.reflexionTexte.textContent = x; } },
        surStats: (t) => { el.stats.textContent = bilanGeneration(t); },
        surTexte: (x) => { phase = 'Rédaction'; texte = x; el.sortie.textContent = x; el.sortie.scrollTop = el.sortie.scrollHeight; },
      });
      texte = r.texte;
      el.stats.textContent = r.bilan;
      el.info.textContent = '';
    } catch (e) {
      el.info.textContent = e.name === 'AbortError' ? 'Arrêté.' : 'Erreur : ' + e.message +
        (/context|exceed/i.test(e.message) ? ' (dossier trop long : décochez des éléments)' : '');
    } finally {
      clearInterval(minuteur);
      controleur = null; el.arreter.hidden = true;
      [el.resume, el.poser, el.rediger].forEach((b) => { b.disabled = false; });
    }
    if (texte.trim()) {
      const production = { id: nouvelId(), outil, titre, texte: texte.trim(), date: maintenant(), ...extra };
      dossier.productions.unshift(production);
      enregistrer();
      afficherProductions();
      archiver('synthese', `${dossier.libelle} – ${titre}`, { dossier: dossier.libelle, ...production });
    }
  }

  el.resume.addEventListener('click', () => produire('resume', 'Synthèse de l\'histoire', [
    { role: 'system', content: appliquerSignature([REGLES, consignesPersonnelles()].filter(Boolean).join('\n\n')) },
    messageUtilisateur('Rédige la synthèse du dossier avec les rubriques suivantes : 1. Résumé en trois lignes. ' +
      '2. Antécédents. 3. Histoire de la maladie, dans l\'ordre chronologique avec les dates. 4. Traitements actuels et antérieurs. ' +
      '5. Examens complémentaires et résultats importants. 6. Problèmes actifs. 7. Points à vérifier (informations manquantes ou contradictoires).'),
  ]));

  const poser = () => {
    const q = el.question.value.trim();
    if (!q) return el.question.focus();
    produire('question', 'Question : ' + q.slice(0, 80), [
      { role: 'system', content: [REGLES, consignesPersonnelles()].filter(Boolean).join('\n\n') },
      messageUtilisateur('Réponds à cette question. Si la réponse ne figure pas dans le dossier, dis-le clairement.\nQuestion : ' + q),
    ], { question: q });
    el.question.value = '';
  };
  el.poser.addEventListener('click', poser);
  el.question.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); poser(); } });

  el.rediger.addEventListener('click', () => {
    const m = modelesDoc[+el.type.value];
    if (!m) return;
    const messages = [{ role: 'system', content: appliquerSignature([consignesCommunes, m.consignes, consignesPersonnelles(),
      'Les notes sont remplacées ici par un dossier patient : utilise uniquement les informations utiles au document demandé, et cite si besoin [Élément n].'].filter(Boolean).join('\n\n')) }];
    for (const ex of m.exemples) { messages.push({ role: 'user', content: ex.notes }, { role: 'assistant', content: appliquerSignature(ex.document) }); }
    const consignes = el.consignes.value.trim();
    messages.push(messageUtilisateur(`Rédige le document « ${m.titre} » à partir du dossier.${consignes ? '\nConsignes complémentaires : ' + consignes : ''}`));
    produire('redaction', m.titre, messages, { consignes });
  });
  el.arreter.addEventListener('click', () => controleur && controleur.abort());
  el.copier.addEventListener('click', () => el.sortie.textContent && copierTexte(el.sortie.textContent, el.copier));

  function afficherProductions() {
    el.productions.innerHTML = '';
    for (const p of dossier.productions) {
      const b = document.createElement('button');
      b.className = 'element-liste';
      b.innerHTML = '<strong></strong><span class="discret"></span>';
      b.querySelector('strong').textContent = p.titre;
      b.querySelector('span').textContent = p.date;
      b.addEventListener('click', () => { el.sortie.textContent = p.texte; el.stats.textContent = `${p.titre} – ${p.date}`; el.reflexion.hidden = true; });
      el.productions.appendChild(b);
    }
  }

  async function chargerModelesDoc() {
    try {
      const docs = await chargerDocuments();
      const commun = docs.find((d) => d.fichier === '_commun.txt');
      consignesCommunes = commun ? analyserModele(commun.contenu.replace(/\r\n/g, '\n'), '_commun.txt').consignes : '';
      modelesDoc = docs.filter((d) => !d.fichier.startsWith('_')).map((d) => analyserModele(d.contenu.replace(/\r\n/g, '\n'), d.fichier));
      el.type.innerHTML = '';
      modelesDoc.forEach((m, i) => el.type.add(new Option(m.titre, String(i))));
    } catch (e) { console.warn(e); }
  }
  document.addEventListener('documents-modifies', chargerModelesDoc);
  document.addEventListener('serveur-pret', () => { if (dossier) afficherElements(); });

  reglagesPrets.then(async () => {
    if (!disponible()) {
      el.vide.textContent = 'La synthèse patient a besoin de la passerelle (mode complet) pour enregistrer les dossiers : indisponible en mode secours.';
      el.nouveau.disabled = true;
      return;
    }
    chargerModelesDoc();
    try { await chargerListe(); } catch (e) { el.vide.textContent = 'Dossiers illisibles : ' + e.message; }
    releverBoite();
  });
}
