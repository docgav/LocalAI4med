// Onglet Rédaction : notes ou dictée → document structuré selon un modèle de app/prompts.
// Aucune donnée patient n'est conservée par le navigateur (seul le type de document choisi est mémorisé).
'use strict';

{
  const el = {
    type: $('type'), notes: $('notes'), sortie: $('sortie'), consigne: $('consigne'),
    rediger: $('rediger'), stop: $('stop'), reinserer: $('reinserer'), effacer: $('effacer'),
    affiner: $('affiner'), copier: $('copier'), annuler: $('annuler'), infoGeneration: $('info-generation'),
    reflexion: $('reflexion'), reflexionTexte: $('reflexion-texte'), stats: $('stats-generation'),
  };

  let consignesCommunes = '';  // _commun.txt
  const modeles = [];          // [{fichier, titre, consignes, exemples: [{notes, document}]}]
  let conversation = null;     // messages de la dernière rédaction, pour « Modifier »
  let versionPrecedente = null;
  let controleur = null;       // AbortController de la génération en cours
  let archive = null;          // rédaction en cours, enregistrée dans donnees/archives

  async function chargerModeles() {
    let docs = [];
    try { docs = await chargerDocuments(); }
    catch { alert('Modèles de documents introuvables : lancez l\'IA avec Demarrer.bat.'); }
    const commun = docs.find((d) => d.fichier === '_commun.txt');
    consignesCommunes = commun ? analyserModele(commun.contenu.replace(/\r\n/g, '\n'), '_commun.txt').consignes : '';
    const choixAvant = modeles[+el.type.value] ? modeles[+el.type.value].fichier : null;
    modeles.length = 0;
    for (const d of docs) {
      if (!d.fichier.startsWith('_')) modeles.push(analyserModele(d.contenu.replace(/\r\n/g, '\n'), d.fichier));
    }
    el.type.innerHTML = '';
    modeles.forEach((m, i) => el.type.add(new Option(m.titre, String(i))));
    let memorise = choixAvant;
    if (!memorise) { try { memorise = localStorage.getItem('type'); } catch {} }
    const idx = modeles.findIndex((m) => m.fichier === memorise);
    if (idx >= 0) el.type.value = String(idx);
  }
  // Rechargés après modification dans l'onglet Personnaliser.
  document.addEventListener('documents-modifies', chargerModeles);

  el.type.addEventListener('change', () => {
    try { localStorage.setItem('type', modeles[+el.type.value].fichier); } catch {}
  });

  // Consignes en système, exemples en tours de dialogue (few-shot), puis les notes.
  // Consignes (+ glossaire) en système, exemples en tours de dialogue (few-shot), puis les notes.
  // La signature des réglages remplace [NOM], [HÔPITAL] et le service, y compris dans les exemples.
  function construireMessages(modele, notes) {
    const systeme = appliquerSignature([consignesCommunes, modele.consignes, consignesPersonnelles()].filter(Boolean).join('\n\n'));
    const messages = [{ role: 'system', content: systeme }];
    for (const ex of modele.exemples) {
      messages.push({ role: 'user', content: ex.notes });
      messages.push({ role: 'assistant', content: appliquerSignature(ex.document) });
    }
    messages.push({ role: 'user', content: notes });
    return messages;
  }

  // Affichage pendant la génération : phase (lecture des notes, réflexion, rédaction), réflexion du
  // modèle s'il y en a, et statistiques en direct, comme dans l'interface de discussion.
  async function generer(messages) {
    controleur = new AbortController();
    occupe(true);
    el.sortie.value = '';
    el.reflexionTexte.textContent = '';
    el.reflexion.hidden = true;
    el.stats.textContent = '';
    const montrerReflexion = (reglages.redaction || {}).afficher_reflexion !== false;
    const t0 = performance.now();
    let phase = 'Lecture des notes', texte = '', dernieresStats = null;
    const afficherPhase = () => {
      el.infoGeneration.textContent = `${phase}… ${Math.round((performance.now() - t0) / 1000)} s`;
    };
    afficherPhase();
    const minuteur = setInterval(afficherPhase, 500);
    try {
      const resultat = await appelerModele(messages, {
        signal: controleur.signal,
        surReflexion: (r) => {
          phase = 'Réflexion';
          if (!montrerReflexion) return;
          el.reflexion.hidden = false;
          el.reflexionTexte.textContent = r;
          el.reflexionTexte.scrollTop = el.reflexionTexte.scrollHeight;
        },
        surStats: (t) => { dernieresStats = t; el.stats.textContent = bilanGeneration(t); },
        surTexte: (t) => {
          phase = 'Rédaction';
          texte = t;
          el.sortie.value = t;
          el.sortie.scrollTop = el.sortie.scrollHeight;
        },
      });
      el.infoGeneration.textContent = '';
      el.stats.textContent = resultat.bilan;
      if (resultat.reflexion && montrerReflexion) el.reflexion.open = false;
      return resultat.texte;
    } catch (e) {
      if (e.name === 'AbortError') { el.infoGeneration.textContent = 'Arrêté.'; return texte.trim(); }
      el.infoGeneration.textContent = 'Erreur : ' + e.message;
      return null;
    } finally {
      clearInterval(minuteur);
      if (dernieresStats && !el.stats.textContent) el.stats.textContent = bilanGeneration(dernieresStats);
      controleur = null;
      occupe(false);
    }
  }

  function occupe(oui) {
    el.rediger.disabled = oui; el.affiner.disabled = oui;
    el.stop.hidden = !oui;
    el.sortie.readOnly = oui;
  }

  async function rediger() {
    const modele = modeles[+el.type.value];
    const notes = el.notes.value.trim();
    if (!modele) return alert('Aucun modèle de document chargé.');
    if (!notes) return el.notes.focus();
    memoriserVersion();
    const messages = construireMessages(modele, notes);
    const document = await generer(messages);
    if (document !== null) {
      conversation = messages;
      if (reglagesGeneraux().copie_auto) copierTexte(document, el.copier);
      // Archivage (donnees/archives) : une archive par rédaction, mise à jour à chaque modification.
      archive = { modele: modele.titre, notes, versions: [document] };
      archive.fichier = await archiver('redaction', `${modele.titre} – ${notes.slice(0, 60)}`, archive);
    }
  }

  async function affiner() {
    const consigne = el.consigne.value.trim();
    const actuel = el.sortie.value.trim();
    if (!consigne || !actuel || !conversation) return el.consigne.focus();
    memoriserVersion();
    // La version affichée (éventuellement corrigée à la main) devient la réponse de référence.
    const messages = conversation.concat(
      { role: 'assistant', content: actuel },
      { role: 'user', content: 'Modifie le document selon cette consigne, et renvoie le document complet : ' + consigne },
    );
    const document = await generer(messages);
    if (document !== null) {
      conversation = messages; el.consigne.value = '';
      if (reglagesGeneraux().copie_auto) copierTexte(document, el.copier);
      if (archive) {
        archive.versions.push(`[Modification : ${consigne}]\n${document}`);
        archive.fichier = await archiver('redaction', `${archive.modele} – ${archive.notes.slice(0, 60)}`, archive, archive.fichier) || archive.fichier;
      }
    }
  }

  function memoriserVersion() {
    if (el.sortie.value.trim()) { versionPrecedente = el.sortie.value; el.annuler.disabled = false; }
  }

  el.rediger.addEventListener('click', rediger);
  el.affiner.addEventListener('click', affiner);
  el.consigne.addEventListener('keydown', (e) => { if (e.key === 'Enter') affiner(); });
  el.stop.addEventListener('click', () => controleur && controleur.abort());
  el.annuler.addEventListener('click', () => {
    if (versionPrecedente === null) return;
    el.sortie.value = versionPrecedente; versionPrecedente = null; el.annuler.disabled = true;
  });
  document.addEventListener('keydown', (e) => {
    if (vueActive === 'redaction' && e.key === 'Enter' && e.ctrlKey && !el.rediger.disabled) { e.preventDefault(); rediger(); }
  });
  el.copier.addEventListener('click', () => el.sortie.value && copierTexte(el.sortie.value, el.copier));
  el.reinserer.addEventListener('click', () => insererDerniereDictee().catch(() => alert('Aucune dictée disponible.')));

  el.effacer.addEventListener('click', () => {
    if (reglagesGeneraux().confirmer_effacement !== false && !confirm('Effacer les notes et le document ?')) return;
    if (controleur) controleur.abort();
    el.notes.value = ''; el.sortie.value = ''; el.consigne.value = '';
    conversation = null; versionPrecedente = null; el.annuler.disabled = true;
    el.infoGeneration.textContent = '';
    el.stats.textContent = ''; el.reflexionTexte.textContent = ''; el.reflexion.hidden = true;
  });

  reglagesPrets.then(chargerModeles);
}
