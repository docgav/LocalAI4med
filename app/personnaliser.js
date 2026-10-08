// Onglet Personnaliser : réglages, modèles de documents, formulations types, dictionnaire de transcription et
// glossaire. Enregistrés par la passerelle dans ressources\ (reglages.json, prompts\), donc conservés
// lors des mises à jour. Aucune donnée patient ici : uniquement des préférences et des textes types.
'use strict';

{
  const passerelle = () => `http://127.0.0.1:${config.dictee}`;
  const info = (id, texte) => { $(id).textContent = texte; if (texte) setTimeout(() => { if ($(id).textContent === texte) $(id).textContent = ''; }, 6000); };

  // --- Listes éditables (raccourcis, dictionnaires) ---
  function listeEditable(conteneur, champs, elements) {
    conteneur.innerHTML = '';
    const entetes = document.createElement('div');
    entetes.className = 'rangee entetes';
    for (const c of champs) { const s = document.createElement('span'); s.textContent = c.libelle; entetes.appendChild(s); }
    entetes.appendChild(document.createElement('span'));
    conteneur.appendChild(entetes);
    const lignes = document.createElement('div');
    lignes.className = 'liste-editable';
    conteneur.appendChild(lignes);
    const ajouterLigne = (valeurs = {}) => {
      const rangee = document.createElement('div');
      rangee.className = 'rangee';
      for (const c of champs) {
        const champ = document.createElement(c.multiligne ? 'textarea' : 'input');
        champ.dataset.cle = c.cle;
        champ.placeholder = c.exemple || '';
        champ.value = valeurs[c.cle] || '';
        rangee.appendChild(champ);
      }
      const retirer = document.createElement('button');
      retirer.textContent = '×'; retirer.title = 'Retirer';
      retirer.addEventListener('click', () => rangee.remove());
      rangee.appendChild(retirer);
      lignes.appendChild(rangee);
    };
    (elements || []).forEach(ajouterLigne);
    const ajouter = document.createElement('button');
    ajouter.textContent = '+ Ajouter';
    ajouter.addEventListener('click', () => ajouterLigne());
    conteneur.appendChild(ajouter);
    return {
      lire: () => [...lignes.querySelectorAll('.rangee')].map((r) => {
        const o = {};
        r.querySelectorAll('[data-cle]').forEach((ch) => { o[ch.dataset.cle] = ch.value.trim(); });
        return o;
      }).filter((o) => champs.every((c) => o[c.cle])),
    };
  }

  let listes = {};

  function remplir(r) {
    const s = r.signature || {}, red = r.redaction || {}, tr = r.transcription || {}, di = r.discussion || {};
    $('r-nom').value = s.nom || '';
    $('r-service').value = s.service || '';
    $('r-hopital').value = s.hopital || '';
    $('r-temperature').value = red.temperature ?? 0.3;
    $('r-longueur').value = red.longueur_max ?? 2048;
    $('r-reflexion').checked = red.afficher_reflexion !== false;
    $('r-archivage').checked = r.archivage !== false;
    $('r-rapide').checked = tr.rapide !== false;
    $('r-fenetre').checked = !!tr.fenetre_adaptee;
    $('r-threads').value = tr.threads || 0;
    $('r-vocabulaire').value = tr.vocabulaire || '';
    const interfaceChoisie = di.interface || 'llamafile';
    document.querySelectorAll('input[name=r-interface]').forEach((b) => { b.checked = b.value === interfaceChoisie; });
    listes = {
      raccourcis: listeEditable($('liste-raccourcis'), [
        { cle: 'declencheur', libelle: 'Désignation (comme dans vos notes)', exemple: 'examen neurologique normal' },
        { cle: 'texte', libelle: 'Texte type', multiligne: true, exemple: 'Patient conscient et orienté. Paires crâniennes normales…' },
      ], r.raccourcis),
      dictionnaire_transcription: listeEditable($('liste-transcription'), [
        { cle: 'entendu', libelle: 'Transcrit à tort', exemple: 'natalisumab' },
        { cle: 'ecrit', libelle: 'Forme correcte', exemple: 'natalizumab' },
      ], r.dictionnaire_transcription),
      glossaire: listeEditable($('liste-glossaire'), [
        { cle: 'terme', libelle: 'Abréviation / terme', exemple: 'SEP' },
        { cle: 'definition', libelle: 'Signification', exemple: 'sclérose en plaques' },
      ], r.glossaire),
    };
  }

  function lire() {
    const nombre = (id, defaut) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : defaut; };
    const choix = document.querySelector('input[name=r-interface]:checked');
    return {
      signature: { nom: $('r-nom').value.trim(), service: $('r-service').value.trim(), hopital: $('r-hopital').value.trim() },
      redaction: {
        temperature: Math.min(1.5, Math.max(0, nombre('r-temperature', 0.3))),
        longueur_max: Math.round(Math.min(8192, Math.max(256, nombre('r-longueur', 2048)))),
        afficher_reflexion: $('r-reflexion').checked,
      },
      transcription: {
        rapide: $('r-rapide').checked,
        fenetre_adaptee: $('r-fenetre').checked,
        threads: Math.max(0, Math.round(nombre('r-threads', 0))),
        vocabulaire: $('r-vocabulaire').value.trim(),
      },
      discussion: { interface: choix ? choix.value : 'llamafile' },
      archivage: $('r-archivage').checked,
      raccourcis: listes.raccourcis.lire(),
      dictionnaire_transcription: listes.dictionnaire_transcription.lire(),
      glossaire: listes.glossaire.lire(),
    };
  }

  $('perso-enregistrer').addEventListener('click', async () => {
    try {
      await enregistrerReglages(lire());
      info('perso-info', config.mode === 'complet' ? 'Enregistré dans ressources\\reglages.json.' : 'Enregistré dans ce navigateur.');
    } catch (e) { info('perso-info', 'Erreur : ' + e.message); }
  });

  $('perso-defaut').addEventListener('click', async () => {
    if (!confirm('Remplacer le formulaire par les valeurs par défaut ? (rien n\'est enregistré avant « Enregistrer »)')) return;
    try { remplir(JSON.parse(await lireTexte('reglages-defaut.json'))); info('perso-info', 'Valeurs par défaut chargées : cliquez sur « Enregistrer » pour les garder.'); }
    catch (e) { info('perso-info', 'Erreur : ' + e.message); }
  });

  // --- Modèles de documents ---
  let documents = [];
  const MODELE_VIDE = '### TITRE\nNouveau document\n\n### CONSIGNES\nDécrivez ici le document attendu : destinataire, structure, style.\n\n### EXEMPLE NOTES\nnotes fictives\n\n### EXEMPLE DOCUMENT\ndocument attendu pour ces notes\n';

  function documentChoisi() { return documents.find((d) => d.fichier === $('doc-choix').value); }

  function afficherDocument() {
    const d = documentChoisi();
    if (!d) return;
    $('doc-fichier').value = d.fichier;
    $('doc-fichier').disabled = true;
    $('doc-contenu').value = d.contenu.replace(/\r\n/g, '\n');
    $('doc-origine').textContent = { defaut: 'Modèle d\'origine (une modification crée votre version personnelle).',
      modifie: 'Votre version personnelle d\'un modèle d\'origine.', perso: 'Votre modèle personnel.' }[d.origine] || '';
    $('doc-retablir').hidden = d.origine !== 'modifie';
    $('doc-supprimer').hidden = d.origine !== 'perso';
  }

  async function chargerListeDocuments(selection) {
    documents = await chargerDocuments();
    $('doc-choix').innerHTML = '';
    for (const d of documents) {
      const titre = d.fichier === '_commun.txt' ? 'Consignes communes' : analyserModele(d.contenu.replace(/\r\n/g, '\n'), d.fichier).titre;
      $('doc-choix').add(new Option(`${titre} (${d.fichier})`, d.fichier, false, d.fichier === selection));
    }
    afficherDocument();
  }

  async function posterDocument(chemin, corps) {
    const rep = await fetch(passerelle() + chemin, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: corps });
    const r = await rep.json();
    if (!rep.ok) throw new Error(r.erreur || 'erreur ' + rep.status);
  }

  $('doc-choix').addEventListener('change', afficherDocument);
  $('doc-nouveau').addEventListener('click', () => {
    $('doc-choix').value = '';
    $('doc-fichier').disabled = false;
    $('doc-fichier').value = `${documents.filter((d) => !d.fichier.startsWith('_')).length + 1}_nouveau_document.txt`;
    $('doc-contenu').value = MODELE_VIDE;
    $('doc-origine').textContent = 'Nouveau modèle : choisissez un nom de fichier sans accent ni espace, terminé par .txt.';
    $('doc-retablir').hidden = true; $('doc-supprimer').hidden = true;
    $('doc-contenu').focus();
  });

  $('doc-enregistrer').addEventListener('click', async () => {
    const fichier = $('doc-fichier').value.trim();
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*\.txt$/.test(fichier)) { info('doc-info', 'Nom de fichier invalide (lettres, chiffres, - et _, terminé par .txt).'); return; }
    const contenu = $('doc-contenu').value;
    if (!/###\s*TITRE/i.test(contenu) && fichier !== '_commun.txt') { info('doc-info', 'Il manque la section ### TITRE.'); return; }
    try {
      await posterDocument('/documents?fichier=' + encodeURIComponent(fichier), contenu);
      await chargerListeDocuments(fichier);
      document.dispatchEvent(new Event('documents-modifies'));
      info('doc-info', 'Modèle enregistré (ressources\\prompts\\' + fichier + ').');
    } catch (e) { info('doc-info', 'Erreur : ' + e.message); }
  });

  const supprimerPerso = async (message) => {
    const d = documentChoisi();
    if (!d || !confirm(message)) return;
    try {
      await posterDocument('/documents-supprimer?fichier=' + encodeURIComponent(d.fichier), '');
      await chargerListeDocuments(d.origine === 'modifie' ? d.fichier : null);
      document.dispatchEvent(new Event('documents-modifies'));
      info('doc-info', 'Fait.');
    } catch (e) { info('doc-info', 'Erreur : ' + e.message); }
  };
  $('doc-retablir').addEventListener('click', () => supprimerPerso('Supprimer votre version et revenir au modèle d\'origine ?'));
  $('doc-supprimer').addEventListener('click', () => supprimerPerso('Supprimer définitivement ce modèle personnel ?'));

  reglagesPrets.then(async () => {
    remplir(reglages);
    if (config.mode !== 'complet') {
      $('perso-avertissement').hidden = false;
      ['doc-enregistrer', 'doc-retablir', 'doc-supprimer', 'doc-nouveau'].forEach((id) => { $(id).disabled = true; });
      $('doc-origine').textContent = 'Modification des modèles indisponible en mode secours.';
    }
    try { await chargerListeDocuments(); } catch (e) { info('doc-info', 'Erreur : ' + e.message); }
  });
}
