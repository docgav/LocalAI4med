// Onglet Rédaction : notes ou dictée → document structuré selon un modèle de app/prompts.
// Aucune donnée patient n'est conservée par le navigateur (seul le type de document choisi est mémorisé).
'use strict';

{
  const el = {
    type: $('type'), notes: $('notes'), sortie: $('sortie'), consigne: $('consigne'),
    rediger: $('rediger'), stop: $('stop'), reinserer: $('reinserer'), effacer: $('effacer'),
    affiner: $('affiner'), copier: $('copier'), annuler: $('annuler'), infoGeneration: $('info-generation'),
  };

  let consignesCommunes = '';  // _commun.txt
  const modeles = [];          // [{fichier, titre, consignes, exemples: [{notes, document}]}]
  let conversation = null;     // messages de la dernière rédaction, pour « Modifier »
  let versionPrecedente = null;
  let controleur = null;       // AbortController de la génération en cours

  async function chargerModeles() {
    try {
      consignesCommunes = analyserModele(await lireTexte('prompts/_commun.txt'), '_commun.txt').consignes;
    } catch { consignesCommunes = ''; }
    let fichiers = [];
    try {
      fichiers = (await lireTexte('prompts/_liste.txt')).split('\n').map((f) => f.trim()).filter(Boolean);
    } catch {
      alert('Liste des modèles introuvable : lancez l\'IA avec Demarrer.bat.');
    }
    for (const f of fichiers) {
      try { modeles.push(analyserModele(await lireTexte('prompts/' + encodeURIComponent(f)), f)); }
      catch (e) { console.warn(e); }
    }
    el.type.innerHTML = '';
    modeles.forEach((m, i) => el.type.add(new Option(m.titre, String(i))));
    let memorise = null;
    try { memorise = localStorage.getItem('type'); } catch {}
    const idx = modeles.findIndex((m) => m.fichier === memorise);
    if (idx >= 0) el.type.value = String(idx);
  }

  el.type.addEventListener('change', () => {
    try { localStorage.setItem('type', modeles[+el.type.value].fichier); } catch {}
  });

  // Consignes en système, exemples en tours de dialogue (few-shot), puis les notes.
  function construireMessages(modele, notes) {
    const systeme = [consignesCommunes, modele.consignes].filter(Boolean).join('\n\n');
    const messages = [{ role: 'system', content: systeme }];
    for (const ex of modele.exemples) {
      messages.push({ role: 'user', content: ex.notes });
      messages.push({ role: 'assistant', content: ex.document });
    }
    messages.push({ role: 'user', content: notes });
    return messages;
  }

  async function generer(messages) {
    controleur = new AbortController();
    occupe(true);
    el.sortie.value = '';
    el.infoGeneration.textContent = 'Lecture des notes…';
    let texte = '';
    try {
      const resultat = await appelerModele(messages, {
        signal: controleur.signal,
        surEtat: (m) => { el.infoGeneration.textContent = m; },
        surTexte: (t) => {
          texte = t;
          el.sortie.value = t;
          el.sortie.scrollTop = el.sortie.scrollHeight;
          el.infoGeneration.textContent = 'Rédaction…';
        },
      });
      el.infoGeneration.textContent = resultat.bilan;
      return resultat.texte;
    } catch (e) {
      if (e.name === 'AbortError') { el.infoGeneration.textContent = 'Arrêté.'; return texte.trim(); }
      el.infoGeneration.textContent = 'Erreur : ' + e.message;
      return null;
    } finally {
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
    if (await generer(messages) !== null) conversation = messages;
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
    if (await generer(messages) !== null) { conversation = messages; el.consigne.value = ''; }
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
    if (!confirm('Effacer les notes et le document ?')) return;
    if (controleur) controleur.abort();
    el.notes.value = ''; el.sortie.value = ''; el.consigne.value = '';
    conversation = null; versionPrecedente = null; el.annuler.disabled = true;
    el.infoGeneration.textContent = '';
  });

  chargerModeles();
}
