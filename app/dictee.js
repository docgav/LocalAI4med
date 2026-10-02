// Dictée intégrée : enregistre le micro dans le navigateur, convertit en WAV 16 kHz mono et l'envoie
// à la passerelle locale (scripts/dictee-serveur.ps1), qui sauvegarde le fichier dans dictees\
// et le transcrit avec whisperfile. Le texte est inséré dans l'onglet affiché.
'use strict';

{
  const el = {
    dicter: $('dicter'), micro: $('micro'), niveau: $('niveau'), reessayer: $('reessayer'),
    reecouter: $('reecouter'), info: $('info-dictee'), fichier: $('audio-fichier'), choix: $('audio-choix'),
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
      el.fichier.disabled = false;
      el.dicter.title = 'Dicter (F2)';
      etat('Dictée prête : bouton « Dicter » ou touche F2');
      listerMicros();
    } catch (e) {
      el.dicter.disabled = true;
      el.fichier.disabled = true;
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
    const pcm = retirerSilences((await hors.startRendering()).getChannelData(0));
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

  // Retire les silences de début et de fin (moins d'audio = transcription plus courte).
  // Trames de 20 ms ; seuil relatif au niveau maximal ; marge de 0,3 s conservée de chaque côté.
  function retirerSilences(pcm) {
    const trame = 320, marge = 16000 * 0.3;
    const niveaux = [];
    for (let i = 0; i < pcm.length; i += trame) {
      let somme = 0;
      const fin = Math.min(pcm.length, i + trame);
      for (let j = i; j < fin; j++) somme += pcm[j] * pcm[j];
      niveaux.push(Math.sqrt(somme / (fin - i)));
    }
    const seuil = Math.max(0.005, Math.max(...niveaux) * 0.05);
    const premier = niveaux.findIndex((n) => n > seuil);
    if (premier < 0) return pcm;
    let dernier = niveaux.length - 1;
    while (dernier > premier && niveaux[dernier] <= seuil) dernier--;
    const debut = Math.max(0, premier * trame - marge);
    const fin = Math.min(pcm.length, (dernier + 1) * trame + marge);
    return pcm.subarray(debut, fin);
  }

  // --- Estimation du temps de transcription ---
  // Durée ≈ CHARGEMENT + facteur × durée audio. Le facteur est appris sur ce poste après chaque
  // transcription (seul ce nombre est mémorisé dans le navigateur, aucune donnée patient).
  const CHARGEMENT = 3;
  function lireFacteur() {
    try { const f = parseFloat(localStorage.getItem('facteurTranscription')); if (f > 0) return f; } catch {}
    return 1;   // valeur de départ : autant de temps que la durée de l'audio
  }
  function apprendreFacteur(dureeAudio, duree) {
    if (dureeAudio < 3) return;
    const mesure = Math.min(10, Math.max(0.05, (duree - CHARGEMENT) / dureeAudio));
    try { localStorage.setItem('facteurTranscription', String(0.5 * lireFacteur() + 0.5 * mesure)); } catch {}
  }
  function formaterDuree(s) {
    s = Math.max(0, Math.round(s));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
  }

  // --- Envoi à la passerelle ---
  async function transcrire() {
    if (!dernierAudio) return;
    occupe = true;
    el.dicter.disabled = true;
    el.fichier.disabled = true;
    el.reessayer.hidden = true;
    const t0 = Date.now();
    const dureeAudio = Math.max(0, (dernierAudio.wav.size - 44) / 32000);
    const estimation = CHARGEMENT + lireFacteur() * dureeAudio;
    let progression = 0, resteAuPoint = null, instantPoint = 0;
    // Temps restant : estimation apprise, corrigée par l'avancement réel quand whisperfile le donne
    // (il ne le donne que par tranches de 30 s d'audio).
    const afficher = () => {
      const ecoule = (Date.now() - t0) / 1000;
      let reste = estimation - ecoule;
      // Compte à rebours depuis la dernière progression reçue (évite les à-coups entre deux mises à jour).
      if (resteAuPoint !== null) reste = resteAuPoint - (ecoule - instantPoint);
      const pourcent = Math.min(99, Math.max(progression, Math.round((100 * ecoule) / (ecoule + Math.max(reste, 0.5)))));
      etat(reste > 1 && progression < 100
        ? `Transcription de ${formaterDuree(dureeAudio)} d'audio… reste environ ${formaterDuree(reste)} (${pourcent} %)`
        : `Transcription de ${formaterDuree(dureeAudio)} d'audio… presque terminé`);
    };
    afficher();
    const minuteur = setInterval(afficher, 500);
    try {
      // Si la passerelle a déjà sauvegardé ce fichier, on le retranscrit sans le renvoyer.
      const url = passerelle + '/transcrire' + (dernierAudio.fichier ? '?fichier=' + encodeURIComponent(dernierAudio.fichier) : '');
      const rep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: dernierAudio.fichier ? null : dernierAudio.wav,
      });
      if (!rep.ok) {
        const r = await rep.json().catch(() => ({}));
        if (r.fichier) dernierAudio.fichier = r.fichier;
        throw new Error(r.erreur || 'erreur ' + rep.status);
      }
      // Réponse en flux : une ligne JSON par événement (fichier, progression, puis texte ou erreur).
      const lecteur = rep.body.getReader();
      const decodeur = new TextDecoder('utf-8');
      let reste = '', fin = null;
      for (;;) {
        const { value, done } = await lecteur.read();
        if (done) break;
        reste += decodeur.decode(value, { stream: true });
        const lignes = reste.split('\n');
        reste = lignes.pop();
        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const r = JSON.parse(ligne);
          if (r.fichier) dernierAudio.fichier = r.fichier;
          if (typeof r.progression === 'number' && r.progression > progression) {
            progression = r.progression;
            instantPoint = (Date.now() - t0) / 1000;
            if (progression < 100) resteAuPoint = (instantPoint * (100 - progression)) / progression;
          }
          if ('texte' in r || r.erreur) fin = r;
        }
      }
      if (!fin) throw new Error('connexion interrompue');
      if (fin.erreur) throw new Error(fin.erreur);
      if (!fin.texte) throw new Error('aucun texte reconnu');
      clearInterval(minuteur);
      insererTexte(vues[vueActive].cibleDictee(), fin.texte);
      apprendreFacteur(fin.duree_audio, fin.duree);
      etat(`Dictée insérée : ${formaterDuree(fin.duree_audio)} d'audio transcrites en ${formaterDuree(fin.duree)} – audio : dictees\\${fin.fichier}`);
    } catch (e) {
      clearInterval(minuteur);
      etat('Transcription impossible : ' + e.message + (dernierAudio.fichier ? ` (audio conservé : dictees\\${dernierAudio.fichier})` : ''));
      el.reessayer.hidden = false;
    } finally {
      occupe = false;
      el.dicter.disabled = !passerelle;
      el.fichier.disabled = !passerelle;
    }
  }

  // --- Fichier audio choisi par l'utilisateur (wav, mp3, m4a…) : même traitement qu'une dictée ---
  async function transcrireFichier(f) {
    if (occupe || !passerelle) return;
    if (enregistreur && enregistreur.state === 'recording') return;
    try {
      etat(`Conversion de ${f.name}…`);
      dernierAudio = { wav: await versWav16k(f), fichier: null };
    } catch {
      etat(`${f.name} : format audio non reconnu par le navigateur (essayer wav ou mp3).`);
      return;
    }
    el.reecouter.hidden = false;
    await transcrire();
  }
  window.transcrireFichierAudio = transcrireFichier;

  el.fichier.addEventListener('click', () => el.choix.click());
  el.choix.addEventListener('change', () => {
    if (el.choix.files[0]) transcrireFichier(el.choix.files[0]);
    el.choix.value = '';
  });

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
