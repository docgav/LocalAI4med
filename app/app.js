// Interface de rédaction. Servie par llamafile (--path app) : l'API est sur la même origine.
// Aucune donnée patient n'est conservée par le navigateur (seul le type de document choisi est mémorisé).
'use strict';

const $ = (id) => document.getElementById(id);
const el = {
  type: $('type'), notes: $('notes'), sortie: $('sortie'), consigne: $('consigne'),
  rediger: $('rediger'), stop: $('stop'), reinserer: $('reinserer'), effacer: $('effacer'),
  affiner: $('affiner'), copier: $('copier'), annuler: $('annuler'),
  etatServeur: $('etat-serveur'), infoDictee: $('info-dictee'), infoGeneration: $('info-generation'),
};

let commun = '';            // consignes communes (_commun.txt)
let modeles = [];           // [{fichier, titre, consignes, exemples: [{notes, document}]}]
let conversation = null;    // messages de la dernière rédaction, pour « Modifier »
let versionPrecedente = null;
let controleur = null;      // AbortController de la génération en cours
let derniereDictee = null;  // identifiant contenu dans dictee/pret.txt

// --- Lecture de fichiers texte en UTF-8, quel que soit l'en-tête renvoyé par le serveur ---
async function lireTexte(url) {
  const sep = url.includes('?') ? '&' : '?';
  const rep = await fetch(url + sep + 't=' + Date.now(), { cache: 'no-store' });
  if (!rep.ok) throw new Error(url + ' : ' + rep.status);
  const texte = new TextDecoder('utf-8').decode(await rep.arrayBuffer());
  return texte.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

// Format des fichiers de app/prompts : sections introduites par « ### TITRE », « ### CONSIGNES »,
// puis autant de paires « ### EXEMPLE NOTES » / « ### EXEMPLE DOCUMENT » que voulu.
function analyserModele(texte, fichier) {
  const m = { fichier, titre: fichier.replace(/\.txt$/, ''), consignes: '', exemples: [] };
  let section = null, tampon = [];
  const fermer = () => {
    const contenu = tampon.join('\n').trim();
    if (section === 'TITRE' && contenu) m.titre = contenu;
    else if (section === 'CONSIGNES') m.consignes = contenu;
    else if (section === 'EXEMPLE NOTES') m.exemples.push({ notes: contenu, document: '' });
    else if (section === 'EXEMPLE DOCUMENT' && m.exemples.length) m.exemples[m.exemples.length - 1].document = contenu;
    tampon = [];
  };
  for (const ligne of texte.split('\n')) {
    const titre = ligne.match(/^###\s*(.+?)\s*$/);
    if (titre) { fermer(); section = titre[1].toUpperCase(); } else tampon.push(ligne);
  }
  fermer();
  m.exemples = m.exemples.filter((e) => e.notes && e.document);
  return m;
}

async function chargerModeles() {
  try {
    commun = analyserModele(await lireTexte('prompts/_commun.txt'), '_commun.txt').consignes;
  } catch { commun = ''; }
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

// --- Construction des messages : consignes en système, exemples en tours de dialogue (few-shot) ---
function construireMessages(modele, notes) {
  const systeme = [commun, modele.consignes].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: systeme }];
  for (const ex of modele.exemples) {
    messages.push({ role: 'user', content: ex.notes });
    messages.push({ role: 'assistant', content: ex.document });
  }
  messages.push({ role: 'user', content: notes });
  return messages;
}

// --- Appel au modèle en streaming (API compatible OpenAI de llamafile) ---
async function generer(messages) {
  controleur = new AbortController();
  occupe(true);
  el.sortie.value = '';
  el.infoGeneration.textContent = 'Lecture des notes…';
  const debut = performance.now();
  let texte = '', timings = null;
  try {
    const rep = await fetch('v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controleur.signal,
      body: JSON.stringify({
        messages, stream: true, temperature: 0.3, top_p: 0.9, max_tokens: 2048, cache_prompt: true,
      }),
    });
    if (!rep.ok) throw new Error('Serveur : ' + rep.status + ' ' + (await rep.text()).slice(0, 300));
    const lecteur = rep.body.getReader();
    const decodeur = new TextDecoder('utf-8');
    let reste = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      reste += decodeur.decode(value, { stream: true });
      const lignes = reste.split('\n');
      reste = lignes.pop();
      for (const ligne of lignes) {
        if (!ligne.startsWith('data:')) continue;
        const donnees = ligne.slice(5).trim();
        if (donnees === '[DONE]') continue;
        let paquet;
        try { paquet = JSON.parse(donnees); } catch { continue; }
        if (paquet.timings) timings = paquet.timings;
        const delta = paquet.choices && paquet.choices[0] && paquet.choices[0].delta;
        if (!delta) continue;
        if (delta.reasoning_content && !texte) el.infoGeneration.textContent = 'Réflexion…';
        if (delta.content) {
          texte += delta.content;
          el.sortie.value = texte;
          el.sortie.scrollTop = el.sortie.scrollHeight;
          el.infoGeneration.textContent = 'Rédaction…';
        }
      }
    }
    const duree = ((performance.now() - debut) / 1000).toFixed(0);
    const vitesse = timings && timings.predicted_per_second ? ` – ${timings.predicted_per_second.toFixed(1)} tokens/s` : '';
    el.infoGeneration.textContent = `Terminé en ${duree} s${vitesse}`;
    return texte.trim();
  } catch (e) {
    if (e.name === 'AbortError') { el.infoGeneration.textContent = 'Arrêté.'; return texte.trim(); }
    el.infoGeneration.textContent = 'Erreur : ' + e.message;
    throw e;
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
  const resultat = await generer(messages).catch(() => null);
  if (resultat !== null) conversation = messages;
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
  const resultat = await generer(messages).catch(() => null);
  if (resultat !== null) { conversation = messages; el.consigne.value = ''; }
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
  if (e.key === 'Enter' && e.ctrlKey && !el.rediger.disabled) { e.preventDefault(); rediger(); }
});

el.copier.addEventListener('click', async () => {
  const texte = el.sortie.value;
  if (!texte) return;
  try { await navigator.clipboard.writeText(texte); }
  catch { el.sortie.select(); document.execCommand('copy'); }
  el.copier.textContent = 'Copié ✓';
  setTimeout(() => { el.copier.textContent = 'Copier'; }, 1500);
});

el.effacer.addEventListener('click', () => {
  if (!confirm('Effacer les notes et le document ?')) return;
  if (controleur) controleur.abort();
  el.notes.value = ''; el.sortie.value = ''; el.consigne.value = '';
  conversation = null; versionPrecedente = null; el.annuler.disabled = true;
  el.infoGeneration.textContent = '';
});

// --- Dictée : scripts\dictee.bat dépose dictee/dictee.txt puis dictee/pret.txt (identifiant unique) ---
function insererDansNotes(texte) {
  texte = texte.trim();
  if (!texte) return;
  const zone = el.notes;
  const avant = zone.value.slice(0, zone.selectionStart);
  const apres = zone.value.slice(zone.selectionEnd);
  const prefixe = avant && !/\s$/.test(avant) ? '\n' : '';
  zone.value = avant + prefixe + texte + apres;
  const pos = (avant + prefixe + texte).length;
  zone.setSelectionRange(pos, pos);
  zone.classList.add('flash');
  setTimeout(() => zone.classList.remove('flash'), 1500);
}

async function lireDictee() {
  return lireTexte('dictee/dictee.txt');
}

async function surveillerDictee() {
  let id = null;
  try { id = (await lireTexte('dictee/pret.txt')).trim(); } catch {}
  if (id && id !== derniereDictee) {
    const premiereLecture = derniereDictee === null;
    derniereDictee = id;
    // Au chargement de la page, ne pas réinsérer une dictée déjà traitée.
    if (!premiereLecture) {
      try {
        insererDansNotes(await lireDictee());
        el.infoDictee.textContent = 'Dictée insérée à ' + new Date().toLocaleTimeString('fr-FR');
      } catch (e) { console.warn(e); }
    }
  } else if (derniereDictee === null) {
    derniereDictee = '';
  }
  setTimeout(surveillerDictee, 1500);
}

el.reinserer.addEventListener('click', async () => {
  try { insererDansNotes(await lireDictee()); }
  catch { alert('Aucune dictée disponible.'); }
});

// --- État du serveur ---
async function surveillerServeur() {
  try {
    const rep = await fetch('health', { cache: 'no-store' });
    const ok = rep.ok;
    el.etatServeur.textContent = ok ? 'Serveur : prêt' : 'Serveur : chargement…';
    el.etatServeur.className = 'etat ' + (ok ? 'ok' : '');
  } catch {
    el.etatServeur.textContent = 'Serveur : arrêté';
    el.etatServeur.className = 'etat ko';
  }
  setTimeout(surveillerServeur, 5000);
}

chargerModeles();
surveillerServeur();
surveillerDictee();
