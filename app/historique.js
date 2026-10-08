// Onglet Historique : documents enregistrés automatiquement dans donnees/archives (rédactions,
// transcriptions, discussions intégrées, anonymisations, productions de la synthèse patient).
'use strict';

{
  const el = {
    type: $('hi-type'), recherche: $('hi-recherche'), liste: $('hi-liste'), vue: $('hi-vue'), titre: $('hi-titre'),
    copier: $('hi-copier'), reprendre: $('hi-reprendre'), supprimer: $('hi-supprimer'), info: $('hi-info'),
  };
  const NOMS = { redaction: 'Rédaction', transcription: 'Transcription', discussion: 'Discussion', anonymisation: 'Anonymisation', synthese: 'Synthèse patient' };
  let courante = null;   // {fichier, archive}

  async function lister() {
    if (config.mode !== 'complet') { el.info.textContent = 'Historique disponible en mode complet seulement.'; return; }
    const params = new URLSearchParams();
    if (el.type.value) params.set('type', el.type.value);
    if (el.recherche.value.trim()) params.set('texte', el.recherche.value.trim());
    try {
      const r = await passerelleJson('/archives?' + params.toString());
      el.liste.innerHTML = '';
      for (const a of r.archives) {
        const b = document.createElement('button');
        b.className = 'element-liste' + (courante && courante.fichier === a.fichier ? ' actif' : '');
        b.innerHTML = '<span class="discret"></span><strong></strong>';
        b.querySelector('span').textContent = `${a.date || ''} – ${NOMS[a.type] || a.type}`;
        b.querySelector('strong').textContent = a.titre || '(sans titre)';
        b.addEventListener('click', () => afficher(a.fichier));
        el.liste.appendChild(b);
      }
      el.info.textContent = r.archives.length ? `${r.archives.length} document(s)${r.archives.length >= 300 ? ' (les 300 plus récents)' : ''}.` : 'Aucun document.';
    } catch (e) { el.info.textContent = 'Erreur : ' + e.message; }
  }

  // Texte lisible d'une archive selon son type.
  function mettreEnForme(a) {
    const d = a.donnees || {};
    switch (a.type) {
      case 'redaction': {
        const versions = d.versions || [];
        return `Modèle : ${d.modele}\n\nNOTES\n${d.notes}\n\nDOCUMENT${versions.length > 1 ? ' (dernière version)' : ''}\n${versions[versions.length - 1] || ''}` +
          (versions.length > 1 ? `\n\nVERSIONS PRÉCÉDENTES\n${versions.slice(0, -1).join('\n\n')}` : '');
      }
      case 'transcription': return `${d.texte}\n\n(enregistrement : donnees\\audio\\${d.audio || '—'}, ${d.duree_audio || '?'} s)`;
      case 'discussion': return (d.messages || []).map((m) => `${m.role === 'user' ? 'VOUS' : 'IA'} :\n${m.content}`).join('\n\n');
      case 'anonymisation': return `${d.texte}`;
      case 'synthese': return `Dossier : ${d.dossier}\n${d.question ? 'Question : ' + d.question + '\n' : ''}${d.consignes ? 'Consignes : ' + d.consignes + '\n' : ''}\n${d.texte}`;
      default: return JSON.stringify(d, null, 2);
    }
  }

  // Texte à copier : le document lui-même plutôt que toute la mise en forme.
  function documentPrincipal(a) {
    const d = a.donnees || {};
    if (a.type === 'redaction') return (d.versions || []).slice(-1)[0] || '';
    if (a.type === 'transcription' || a.type === 'anonymisation' || a.type === 'synthese') return d.texte || '';
    return mettreEnForme(a);
  }

  async function afficher(fichier) {
    try {
      const archive = await passerelleJson('/archive?fichier=' + encodeURIComponent(fichier));
      courante = { fichier, archive };
      el.titre.textContent = `${NOMS[archive.type] || archive.type} – ${archive.date} – ${archive.titre}`;
      el.vue.textContent = mettreEnForme(archive);
      // Transcription : enregistrement réécoutable s'il est encore conservé (donnees\audio).
      const audio = $('hi-audio'), nomAudio = archive.type === 'transcription' && (archive.donnees || {}).audio;
      audio.hidden = !nomAudio;
      if (nomAudio) audio.src = `http://127.0.0.1:${config.dictee}/audio?fichier=${encodeURIComponent(nomAudio)}`;
      else audio.removeAttribute('src');
      el.reprendre.hidden = !['redaction', 'transcription'].includes(archive.type);
      [el.copier, el.supprimer].forEach((b) => { b.hidden = false; });
      el.liste.querySelectorAll('.element-liste').forEach((b) => b.classList.remove('actif'));
    } catch (e) { el.info.textContent = 'Erreur : ' + e.message; }
  }

  el.copier.addEventListener('click', () => courante && copierTexte(documentPrincipal(courante.archive), el.copier));
  // Reprendre : notes (et document) remis dans l'onglet Rédaction.
  el.reprendre.addEventListener('click', () => {
    if (!courante) return;
    const d = courante.archive.donnees || {};
    $('notes').value = courante.archive.type === 'redaction' ? d.notes : d.texte;
    if (courante.archive.type === 'redaction') $('sortie').value = (d.versions || []).slice(-1)[0] || '';
    afficherVue('redaction');
  });
  el.supprimer.addEventListener('click', async () => {
    if (!courante || !confirm('Supprimer définitivement ce document de l\'historique ?')) return;
    try {
      await passerelleJson('/archive-supprimer?fichier=' + encodeURIComponent(courante.fichier), { methode: 'POST' });
      courante = null; el.vue.textContent = ''; el.titre.textContent = '';
      [el.copier, el.supprimer, el.reprendre].forEach((b) => { b.hidden = true; });
      lister();
    } catch (e) { el.info.textContent = 'Erreur : ' + e.message; }
  });

  let minuterie = null;
  el.recherche.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(lister, 400); });
  el.type.addEventListener('change', lister);
  document.querySelector('[data-vue=historique]').addEventListener('click', lister);
  configPrete.then(() => { if (vueActive === 'historique') lister(); });
}
