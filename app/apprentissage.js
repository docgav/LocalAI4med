// Personnaliser → « Créer un modèle à partir d'exemples » : à partir de plusieurs courriers du même type,
// le modèle déduit un modèle de document (rubriques, style, formules d'usage), propose un exemple fictif,
// et relève les abréviations (→ glossaire) et les termes spécialisés (→ vocabulaire de la transcription).
// Les courriers ne sont ni enregistrés ni archivés : ils restent en mémoire le temps de l'analyse.
// Méthode : chaque courrier est analysé séparément (la mémoire du modèle ne permet pas de tous les lire
// ensemble), puis les analyses sont fusionnées en un seul modèle.
'use strict';

{
  const el = {
    titre: $('ap-titre'), zone: $('ap-zone'), fichiers: $('ap-fichiers'), choix: $('ap-choix'), coller: $('ap-coller'),
    ajouter: $('ap-ajouter'), liste: $('ap-liste'), exemple: $('ap-exemple'), analyser: $('ap-analyser'),
    arreter: $('ap-arreter'), info: $('ap-info'), resultats: $('ap-resultats'), fichier: $('ap-fichier'),
    modele: $('ap-modele'), enregistrer: $('ap-enregistrer'), abreviations: $('ap-abreviations'), termes: $('ap-termes'),
    ajouterReglages: $('ap-ajouter-reglages'), infoResultats: $('ap-info-resultats'),
  };
  const LONGUEUR_LUE = 8000;   // caractères lus par courrier (≈ 2 300 tokens)
  let courriers = [];           // [{nom, texte}]
  let controleur = null;
  let jsonImpose = true;        // response_format accepté par le serveur ?

  // --- Courriers fournis ---
  function afficherCourriers() {
    el.liste.innerHTML = '';
    courriers.forEach((c, i) => {
      const ligne = document.createElement('div');
      ligne.className = 'ligne';
      const nom = document.createElement('span');
      nom.textContent = `${i + 1}. ${c.nom} (${c.texte.length.toLocaleString('fr-FR')} caractères${c.texte.length > LONGUEUR_LUE ? ', début seulement' : ''})`;
      const retirer = document.createElement('button');
      retirer.textContent = '×'; retirer.title = 'Retirer';
      retirer.addEventListener('click', () => { courriers.splice(i, 1); afficherCourriers(); });
      ligne.append(nom, retirer);
      el.liste.appendChild(ligne);
    });
    el.analyser.disabled = courriers.length < 2;
    el.analyser.title = courriers.length < 2 ? 'Fournissez au moins 2 courriers (5 à 10 idéalement)' : '';
  }

  async function ajouterFichiers(liste) {
    for (const f of liste) {
      try {
        const texte = (await lireDocument(f, { maxCaracteres: 60000 })).filter((p) => p.type === 'texte').map((p) => p.contenu).join('\n');
        if (!texte.trim()) throw new Error('aucun texte lisible (document scanné ?)');
        courriers.push({ nom: f.name, texte: texte.trim() });
      } catch (e) { alert(f.name + ' : ' + e.message); }
    }
    afficherCourriers();
  }
  el.fichiers.addEventListener('click', () => el.choix.click());
  el.choix.addEventListener('change', () => { ajouterFichiers([...el.choix.files]); el.choix.value = ''; });
  el.zone.addEventListener('dragover', (e) => { e.preventDefault(); el.zone.classList.add('survol'); });
  el.zone.addEventListener('dragleave', () => el.zone.classList.remove('survol'));
  el.zone.addEventListener('drop', (e) => { e.preventDefault(); el.zone.classList.remove('survol'); ajouterFichiers([...e.dataTransfer.files]); });
  el.ajouter.addEventListener('click', () => {
    const t = el.coller.value.trim();
    if (!t) return el.coller.focus();
    courriers.push({ nom: 'Texte collé ' + (courriers.length + 1), texte: t });
    el.coller.value = '';
    afficherCourriers();
  });

  // --- Appel au modèle avec réponse JSON (imposée par le serveur si possible) ---
  async function demanderJson(systeme, utilisateur, schema, max_tokens) {
    const messages = [{ role: 'system', content: systeme }, { role: 'user', content: utilisateur }];
    const options = { signal: controleur.signal, temperature: 0, max_tokens };
    let r;
    try {
      r = await appelerModele(messages, { ...options, extra: jsonImpose ? { response_format: { type: 'json_schema', json_schema: { schema } } } : undefined });
    } catch (e) {
      if (e.name === 'AbortError' || !jsonImpose) throw e;
      jsonImpose = false;   // serveur qui refuse response_format : on demande simplement du JSON
      r = await appelerModele(messages, options);
    }
    const t = r.texte;
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  }

  const SCHEMA_COURRIER = {
    type: 'object',
    properties: {
      rubriques: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, contenu: { type: 'string' } }, required: ['titre', 'contenu'] } },
      style: { type: 'string' },
      formules: { type: 'array', items: { type: 'string' } },
      abreviations: { type: 'array', items: { type: 'object', properties: { terme: { type: 'string' }, definition: { type: 'string' } }, required: ['terme', 'definition'] } },
      termes: { type: 'array', items: { type: 'string' } },
    },
    required: ['rubriques', 'style', 'formules', 'abreviations', 'termes'],
  };
  const CONSIGNE_COURRIER = 'Tu analyses la forme d\'un document médical pour en déduire un modèle réutilisable. Réponds uniquement en JSON :\n' +
    '- "rubriques" : les parties du document dans l\'ordre, avec pour chacune son titre (tel qu\'écrit, ou un titre court si la partie n\'en a pas) et "contenu" : ce qu\'on y trouve en général, décrit sans aucune donnée du patient ;\n' +
    '- "style" : ton, temps des verbes, longueur, phrases ou listes ;\n' +
    '- "formules" : formules d\'usage réutilisables (appel, introduction, conclusion, politesse), sans nom ni donnée de patient ;\n' +
    '- "abreviations" : les abréviations médicales utilisées et leur signification ;\n' +
    '- "termes" : les termes spécialisés (médicaments, examens, scores, pathologies) qu\'un logiciel de dictée pourrait mal reconnaître.\n' +
    'N\'inclus jamais de nom, de date, de lieu ni d\'information propre au patient.';

  const SCHEMA_EXEMPLE = {
    type: 'object',
    properties: { notes: { type: 'string' }, document: { type: 'string' } },
    required: ['notes', 'document'],
  };

  // Nom proposé : numéro suivant les modèles existants (ordre du menu), puis le titre sans accents.
  async function nomDeFichier(titre) {
    const base = titre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'nouveau_modele';
    let numero = 1;
    try {
      for (const d of await chargerDocuments()) { const n = parseInt(d.fichier, 10); if (n >= numero) numero = n + 1; }
    } catch {}
    return `${numero}_${base}.txt`;
  }

  // --- Analyse ---
  el.analyser.addEventListener('click', async () => {
    const titre = el.titre.value.trim();
    if (!titre) { el.titre.focus(); el.info.textContent = 'Indiquez le type de document.'; return; }
    controleur = new AbortController();
    el.analyser.disabled = true; el.arreter.hidden = false; el.resultats.hidden = true;
    const t0 = performance.now();
    const duree = () => `${Math.round((performance.now() - t0) / 1000)} s`;
    const analyses = [];
    try {
      // 1. Un courrier à la fois
      for (const [i, c] of courriers.entries()) {
        el.info.textContent = `Analyse du courrier ${i + 1}/${courriers.length} (${c.nom})… ${duree()}`;
        try { analyses.push(await demanderJson(CONSIGNE_COURRIER, `Type de document : ${titre}\n\n${c.texte.slice(0, LONGUEUR_LUE)}`, SCHEMA_COURRIER, 1200)); }
        catch (e) { if (e.name === 'AbortError') throw e; console.warn(c.nom, e); }
      }
      if (!analyses.length) throw new Error('aucun courrier n\'a pu être analysé');

      // 2. Fusion en un modèle général
      el.info.textContent = `Rédaction du modèle général… ${duree()}`;
      const resume = analyses.map((a, i) => `Courrier ${i + 1} :\n` +
        `Rubriques : ${(a.rubriques || []).map((r) => `${r.titre} (${r.contenu})`).join(' > ')}\n` +
        `Style : ${a.style || ''}\nFormules : ${(a.formules || []).join(' | ')}`).join('\n\n');
      const consignes = (await appelerModele([
        { role: 'system', content: 'Tu rédiges les consignes d\'un modèle de document médical, destinées à un assistant de rédaction. ' +
          'À partir des analyses de plusieurs exemples, écris en français : 1. une phrase qui décrit le document et son destinataire ; ' +
          '2. la liste numérotée des rubriques, dans l\'ordre le plus fréquent, en regroupant les titres équivalents, avec pour chacune ce qu\'elle doit contenir ; ' +
          'indique les rubriques facultatives ; 3. le style attendu ; 4. les formules d\'usage les plus fréquentes ; ' +
          '5. la règle : n\'écrire une rubrique que si les notes contiennent l\'information, sinon [À COMPLÉTER] pour les rubriques indispensables. ' +
          'Aucune donnée de patient. Réponds uniquement par les consignes, sans titre ni commentaire.' },
        { role: 'user', content: `Type de document : ${titre}\nNombre d'exemples : ${analyses.length}\n\n${resume}` },
      ], { signal: controleur.signal, temperature: 0.2, max_tokens: 1500, surTexte: (t) => { el.modele.value = t; } })).texte;

      // 3. Exemple fictif (facultatif)
      let exemple = null;
      if (el.exemple.checked) {
        el.info.textContent = `Rédaction d'un exemple fictif… ${duree()}`;
        try {
          exemple = await demanderJson('Tu crées un exemple d\'apprentissage entièrement fictif. Réponds uniquement en JSON : "notes" = notes brèves et abrégées ' +
            'd\'un médecin, comme dictées ; "document" = le document complet rédigé à partir de ces notes en suivant exactement les consignes. ' +
            'Patient et données inventés, sans nom réel ; signature : Dr [NOM].', `Type de document : ${titre}\n\nConsignes :\n${consignes}`, SCHEMA_EXEMPLE, 2000);
        } catch (e) { if (e.name === 'AbortError') throw e; console.warn('exemple', e); }
      }

      el.fichier.value = await nomDeFichier(titre);
      el.modele.value = `### TITRE\n${titre}\n\n### CONSIGNES\n${consignes.trim()}\n` +
        (exemple && exemple.notes && exemple.document ? `\n### EXEMPLE NOTES\n${exemple.notes.trim()}\n\n### EXEMPLE DOCUMENT\n${exemple.document.trim()}\n` : '');
      afficherReleves(analyses);
      el.resultats.hidden = false;
      el.info.textContent = `Terminé en ${duree()} (${analyses.length}/${courriers.length} courriers analysés). Relisez le modèle : aucune donnée de patient ne doit y rester.`;
    } catch (e) {
      el.info.textContent = e.name === 'AbortError' ? 'Arrêté.' : 'Erreur : ' + e.message;
    } finally {
      controleur = null; el.arreter.hidden = true; el.analyser.disabled = courriers.length < 2;
    }
  });
  el.arreter.addEventListener('click', () => controleur && controleur.abort());

  // --- Abréviations et termes relevés (avec le nombre de courriers où ils apparaissent) ---
  function afficherReleves(analyses) {
    const glossaire = new Set((reglages.glossaire || []).map((g) => g.terme.toLowerCase()));
    const vocab = ((reglages.transcription || {}).vocabulaire || '').toLowerCase();
    const abrev = new Map(), termes = new Map();
    for (const a of analyses) {
      const vus = new Set();
      for (const x of a.abreviations || []) {
        const t = String(x.terme || '').trim(), d = String(x.definition || '').trim();
        if (!t || !d || t.length > 15 || vus.has(t.toLowerCase())) continue;
        vus.add(t.toLowerCase());
        const e = abrev.get(t.toLowerCase()) || { terme: t, definitions: new Map(), n: 0 };
        e.n++; e.definitions.set(d, (e.definitions.get(d) || 0) + 1);
        abrev.set(t.toLowerCase(), e);
      }
      for (const x of new Set((a.termes || []).map((t) => String(t).trim()).filter((t) => t && t.length < 60))) {
        const e = termes.get(x.toLowerCase()) || { terme: x, n: 0 };
        e.n++; termes.set(x.toLowerCase(), e);
      }
    }
    el.abreviations.innerHTML = '';
    const listeAbrev = [...abrev.values()].sort((a, b) => b.n - a.n);
    for (const e of listeAbrev) {
      const definition = [...e.definitions.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const deja = glossaire.has(e.terme.toLowerCase());
      const ligne = document.createElement('div');
      ligne.className = 'releve';
      ligne.innerHTML = '<input type="checkbox" data-r="choisi"><strong></strong><input data-r="definition"><span class="discret"></span>' +
        '<label class="case"><input type="checkbox" data-r="autorisee" checked> utilisable</label>';
      ligne.querySelector('[data-r=choisi]').checked = !deja;
      ligne.querySelector('[data-r=choisi]').disabled = deja;
      ligne.querySelector('strong').textContent = e.terme;
      ligne.querySelector('[data-r=definition]').value = definition;
      ligne.querySelector('span').textContent = deja ? 'déjà dans le glossaire' : `${e.n} courrier(s)`;
      if (deja) ligne.querySelector('label.case').hidden = true;
      ligne.dataset.terme = e.terme;
      el.abreviations.appendChild(ligne);
    }
    if (!listeAbrev.length) el.abreviations.textContent = 'Aucune abréviation relevée.';
    el.termes.innerHTML = '';
    const listeTermes = [...termes.values()].sort((a, b) => b.n - a.n).slice(0, 60);
    for (const e of listeTermes) {
      const deja = vocab.includes(e.terme.toLowerCase());
      const puce = document.createElement('label');
      puce.className = 'puce';
      puce.innerHTML = '<input type="checkbox"> <span></span>';
      puce.querySelector('input').checked = !deja && e.n > 1;
      puce.querySelector('span').textContent = `${e.terme} (${e.n})`;
      puce.dataset.terme = e.terme;
      el.termes.appendChild(puce);
    }
    if (!listeTermes.length) el.termes.textContent = 'Aucun terme relevé.';
  }

  el.enregistrer.addEventListener('click', async () => {
    const fichier = el.fichier.value.trim();
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*\.txt$/.test(fichier)) { el.infoResultats.textContent = 'Nom de fichier invalide.'; return; }
    try {
      await passerelleJson('/documents?fichier=' + encodeURIComponent(fichier), { methode: 'POST', corps: el.modele.value });
      document.dispatchEvent(new Event('documents-modifies'));
      el.infoResultats.textContent = `Modèle « ${el.titre.value.trim()} » enregistré : il est disponible dans Rédaction et Synthèse patient.`;
    } catch (e) { el.infoResultats.textContent = 'Erreur : ' + e.message; }
  });

  el.ajouterReglages.addEventListener('click', async () => {
    const glossaire = [...el.abreviations.querySelectorAll('.releve')]
      .filter((l) => l.querySelector('[data-r=choisi]').checked && !l.querySelector('[data-r=choisi]').disabled)
      .map((l) => ({ terme: l.dataset.terme, definition: l.querySelector('[data-r=definition]').value.trim(), autorisee: l.querySelector('[data-r=autorisee]').checked }))
      .filter((g) => g.definition);
    const termes = [...el.termes.querySelectorAll('.puce')].filter((p) => p.querySelector('input').checked).map((p) => p.dataset.terme);
    if (!glossaire.length && !termes.length) { el.infoResultats.textContent = 'Rien de sélectionné.'; return; }
    try {
      await window.personnaliserAjouter({ glossaire, termes });
      el.infoResultats.textContent = `${glossaire.length} abréviation(s) ajoutée(s) au glossaire, ${termes.length} terme(s) au vocabulaire de la transcription.`;
      // Éléments ajoutés : cases désactivées pour éviter les doublons.
      el.abreviations.querySelectorAll('.releve [data-r=choisi]:checked').forEach((c) => { c.disabled = true; c.closest('.releve').querySelector('span').textContent = 'ajouté'; });
      el.termes.querySelectorAll('.puce input:checked').forEach((c) => { c.disabled = true; });
    } catch (e) { el.infoResultats.textContent = 'Erreur : ' + e.message; }
  });

  configPrete.then(() => {
    afficherCourriers();
    if (config.mode !== 'complet') { el.enregistrer.disabled = true; el.enregistrer.title = 'Indisponible en mode secours'; }
  });
}
