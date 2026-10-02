// Dictée intégrée : enregistre le micro dans le navigateur, convertit en WAV 16 kHz mono et l'envoie
// à la passerelle locale (scripts/dictee-serveur.ps1), qui sauvegarde le fichier dans dictees\
// et le transcrit avec whisperfile. Le texte est inséré dans l'onglet affiché.
'use strict';

{
  const el = {
    dicter: $('dicter'), micro: $('micro'), niveau: $('niveau'), reessayer: $('reessayer'),
    reecouter: $('reecouter'), info: $('info-dictee'),
  };
  const DUREE_MAX = 10 * 60;  // secondes ; arrêt automatique au-delà

  let passerelle = null;  // URL de la passerelle, si elle répond
  let flux = null, enregistreur = null, morceaux = [], debut = 0, minuterie = null, analyseur = null;
  let dernierAudio = null;   // {wav: Blob, fichier: nom côté passerelle} pour « Réessayer » et « Réécouter »
  let occupe = false;

  function etat(texte) { el.info.textContent = texte; }

  // --- Connexion à la passerelle (port écrit par Demarrer.bat dans dictee/port.txt) ---
  async function connecter() {
    try {
      const port = (await lireTexte('dictee/port.txt')).trim();
      const url = `http://127.0.0.1:${port}`;
      const r = await (await fetch(url + '/etat', { cache: 'no-store' })).json();
      if (!r.whisper || !r.modele) throw new Error('whisperfile ou son modèle absent de ressources\\');
      passerelle = url;
      el.dicter.disabled = false;
      el.dicter.title = 'Dicter (F2)';
      etat('Dictée prête : bouton « Dicter » ou touche F2');
      listerMicros();
    } catch (e) {
      el.dicter.disabled = true;
      el.dicter.title = 'Dictée intégrée indisponible' + (e.message ? ' : ' + e.message : '') + '. Secours : fenêtre noire.';
      etat('Dictée intégrée indisponible : utilisez la fenêtre noire (touche Entrée)');
    }
  }

  async function listerMicros() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const micros = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    // Les noms ne sont visibles qu'après une première autorisation du micro.
    if (micros.length < 2 || !micros[0].label) { el.micro.hidden = true; return; }
    let choisi = null;
    try { choisi = localStorage.getItem('micro'); } catch {}
    el.micro.innerHTML = '';
    for (const m of micros) el.micro.add(new Option(m.label, m.deviceId, false, m.deviceId === choisi));
    el.micro.hidden = false;
  }
  el.micro.addEventListener('change', () => { try { localStorage.setItem('micro', el.micro.value); } catch {} });

  // --- Enregistrement ---
  async function demarrer() {
    if (occupe || !passerelle) return;
    const contraintes = { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    if (!el.micro.hidden && el.micro.value) contraintes.audio.deviceId = { exact: el.micro.value };
    try {
      flux = await navigator.mediaDevices.getUserMedia(contraintes);
    } catch (e) {
      etat('Micro inaccessible : autorisez le micro pour cette page (icône à gauche de l\'adresse).');
      return;
    }
    listerMicros();
    morceaux = [];
    enregistreur = new MediaRecorder(flux);
    enregistreur.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    enregistreur.onstop = terminer;
    enregistreur.start(1000);
    debut = Date.now();
    el.dicter.classList.add('enregistre');
    el.reessayer.hidden = true;
    afficherNiveau();
    minuterie = setInterval(() => {
      const s = Math.floor((Date.now() - debut) / 1000);
      el.dicter.textContent = `■ Arrêter ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= DUREE_MAX) arreter();
    }, 250);
    etat('Enregistrement… cliquez sur « Arrêter » ou F2 pour terminer');
  }

  function afficherNiveau() {
    const ctx = new AudioContext();
    analyseur = { ctx, noeud: ctx.createAnalyser() };
    ctx.createMediaStreamSource(flux).connect(analyseur.noeud);
    const donnees = new Uint8Array(analyseur.noeud.fftSize);
    el.niveau.hidden = false;
    const boucle = () => {
      if (!analyseur) return;
      analyseur.noeud.getByteTimeDomainData(donnees);
      let max = 0;
      for (const v of donnees) max = Math.max(max, Math.abs(v - 128));
      el.niveau.value = Math.min(1, max / 64);
      requestAnimationFrame(boucle);
    };
    boucle();
  }

  function arreter() {
    if (enregistreur && enregistreur.state !== 'inactive') enregistreur.stop();
  }

  async function terminer() {
    clearInterval(minuterie);
    flux.getTracks().forEach((t) => t.stop());
    if (analyseur) { analyseur.ctx.close(); analyseur = null; }
    el.niveau.hidden = true;
    el.dicter.classList.remove('enregistre');
    el.dicter.textContent = '🎙 Dicter';
    const brut = new Blob(morceaux, { type: enregistreur.mimeType });
    try {
      etat('Conversion de l\'audio…');
      dernierAudio = { wav: await versWav16k(brut), fichier: null };
      el.reecouter.hidden = false;
      await transcrire();
    } catch (e) {
      etat('Erreur : ' + e.message);
    }
  }

  // --- Conversion en WAV 16 kHz mono (format attendu par whisperfile) ---
  async function versWav16k(blob) {
    const ctx = new AudioContext();
    let audio;
    try { audio = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close(); }
    const n = Math.max(1, Math.ceil(audio.duration * 16000));
    const hors = new OfflineAudioContext(1, n, 16000);
    const source = hors.createBufferSource();
    source.buffer = audio; source.connect(hors.destination); source.start();
    const pcm = (await hors.startRendering()).getChannelData(0);
    const tampon = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(tampon);
    const ecrire = (pos, txt) => { for (let i = 0; i < txt.length; i++) v.setUint8(pos + i, txt.charCodeAt(i)); };
    ecrire(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); ecrire(8, 'WAVE');
    ecrire(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ecrire(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([tampon], { type: 'audio/wav' });
  }

  // --- Envoi à la passerelle ---
  async function transcrire() {
    if (!dernierAudio) return;
    occupe = true;
    el.dicter.disabled = true;
    el.reessayer.hidden = true;
    const t0 = Date.now();
    etat('Transcription en cours…');
    try {
      // Si la passerelle a déjà sauvegardé ce fichier, on le retranscrit sans le renvoyer.
      const url = passerelle + '/transcrire' + (dernierAudio.fichier ? '?fichier=' + encodeURIComponent(dernierAudio.fichier) : '');
      const rep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: dernierAudio.fichier ? null : dernierAudio.wav,
      });
      const r = await rep.json();
      if (r.fichier) dernierAudio.fichier = r.fichier;
      if (!rep.ok) throw new Error(r.erreur || 'erreur ' + rep.status);
      if (!r.texte) throw new Error('aucun texte reconnu');
      insererTexte(vues[vueActive].cibleDictee(), r.texte);
      etat(`Dictée insérée (${Math.round((Date.now() - t0) / 1000)} s) – audio : dictees\\${r.fichier}`);
    } catch (e) {
      etat('Transcription impossible : ' + e.message + (dernierAudio.fichier ? ` (audio conservé : dictees\\${dernierAudio.fichier})` : ''));
      el.reessayer.hidden = false;
    } finally {
      occupe = false;
      el.dicter.disabled = !passerelle;
    }
  }

  function basculer() {
    if (enregistreur && enregistreur.state === 'recording') arreter(); else demarrer();
  }

  el.dicter.addEventListener('click', basculer);
  el.reessayer.addEventListener('click', transcrire);
  el.reecouter.addEventListener('click', () => {
    if (!dernierAudio) return;
    const lecteur = new Audio(URL.createObjectURL(dernierAudio.wav));
    lecteur.onended = () => URL.revokeObjectURL(lecteur.src);
    lecteur.play();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && !el.dicter.disabled) { e.preventDefault(); basculer(); }
  });

  connecter();
}
