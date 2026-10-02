// Fonctions partagées par les onglets Rédaction et Discussion.
// Mode complet : page servie par la passerelle (scripts/dictee-serveur.ps1), API du modèle sur le port
// de llamafile, qui sert aussi son interface de discussion par défaut (affichée dans l'onglet Discussion).
// Mode secours (PowerShell bloqué) : page servie par llamafile (--path app), API sur la même origine.
// Tout reste sur 127.0.0.1 : rien n'est envoyé ailleurs.
'use strict';

const $ = (id) => document.getElementById(id);

// État du serveur, lu sur /props : nom du modèle et prise en charge des images (mmproj chargé).
const serveur = { pret: false, modele: '', vision: false };

// Ports écrits par Demarrer.bat dans dictee/config.json.
const config = { llm: 8080, dictee: 8081, mode: 'secours', api: '' };
const configPrete = (async () => {
  try { Object.assign(config, JSON.parse(await lireTexte('dictee/config.json'))); } catch {}
  if (location.port === String(config.dictee)) {
    config.mode = 'complet';
    config.api = `http://127.0.0.1:${config.llm}/`;
  }
})();

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

// --- Appel au modèle en streaming (API compatible OpenAI de llamafile) ---
// surTexte(texteComplet) est appelé à chaque morceau reçu ; surEtat(message) pour l'affichage.
async function appelerModele(messages, { signal, surTexte, surEtat, max_tokens = 2048 } = {}) {
  await configPrete;
  const debut = performance.now();
  let texte = '', timings = null;
  const rep = await fetch(config.api + 'v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ messages, stream: true, temperature: 0.3, top_p: 0.9, max_tokens, cache_prompt: true }),
  });
  if (!rep.ok) {
    let detail = await rep.text();
    try { detail = JSON.parse(detail).error.message; } catch {}
    throw new Error(String(detail).slice(0, 300));
  }
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
      if (paquet.error) throw new Error(paquet.error.message || 'erreur du serveur');
      if (paquet.timings) timings = paquet.timings;
      const delta = paquet.choices && paquet.choices[0] && paquet.choices[0].delta;
      if (!delta) continue;
      if (delta.reasoning_content && !texte && surEtat) surEtat('Réflexion…');
      if (delta.content) {
        texte += delta.content;
        if (surTexte) surTexte(texte);
      }
    }
  }
  const duree = ((performance.now() - debut) / 1000).toFixed(0);
  const vitesse = timings && timings.predicted_per_second ? ` – ${timings.predicted_per_second.toFixed(1)} tokens/s` : '';
  return { texte: texte.trim(), bilan: `Terminé en ${duree} s${vitesse}` };
}

// --- Onglets ---
// Zone qui reçoit la dictée dans chaque onglet. L'interface de discussion de llamafile (mode complet)
// est sur une autre origine : la dictée y est copiée dans le presse-papier.
const vues = {
  redaction: { cibleDictee: () => $('notes') },
  discussion: { cibleDictee: () => (config.mode === 'complet' ? null : $('saisie')) },
};
let vueActive = 'redaction';

function afficherVue(nom) {
  vueActive = nom;
  document.querySelectorAll('[data-vue]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vue === nom)));
  document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-' + nom; });
  try { localStorage.setItem('vue', nom); } catch {}
}
document.querySelectorAll('[data-vue]').forEach((b) => b.addEventListener('click', () => afficherVue(b.dataset.vue)));
try { const v = localStorage.getItem('vue'); if (vues[v]) afficherVue(v); } catch {}

// --- Dictée : scripts\dictee.bat dépose dictee/dictee.txt puis dictee/pret.txt (identifiant unique) ---
// Le texte est inséré dans la zone de saisie de l'onglet affiché.
function insererTexte(zone, texte) {
  texte = texte.trim();
  if (!texte) return;
  const avant = zone.value.slice(0, zone.selectionStart);
  const apres = zone.value.slice(zone.selectionEnd);
  const prefixe = avant && !/\s$/.test(avant) ? '\n' : '';
  zone.value = avant + prefixe + texte + apres;
  const pos = (avant + prefixe + texte).length;
  zone.setSelectionRange(pos, pos);
  zone.dispatchEvent(new Event('input'));
  zone.classList.add('flash');
  setTimeout(() => zone.classList.remove('flash'), 1500);
}

// Insère le texte dicté dans l'onglet affiché, ou le copie dans le presse-papier s'il n'y a pas de
// zone accessible. Renvoie un court compte rendu pour l'affichage.
async function deposerTexte(texte) {
  const cible = vues[vueActive].cibleDictee();
  if (cible) { insererTexte(cible, texte); return 'insérée'; }
  const bouton = $('copier-dictee');
  bouton.onclick = () => { copierTexte(texte, bouton); };
  try {
    await navigator.clipboard.writeText(texte.trim());
    bouton.hidden = false;
    return 'copiée : collez-la (Ctrl+V) dans la discussion';
  } catch {
    bouton.hidden = false;   // la page n'avait pas le focus : copie au clic
    return 'prête : cliquez sur « Copier la dictée » puis collez-la (Ctrl+V)';
  }
}

async function insererDerniereDictee() {
  const resultat = await deposerTexte(await lireTexte('dictee/dictee.txt'));
  $('info-dictee').textContent = `Dictée ${resultat} (${new Date().toLocaleTimeString('fr-FR')})`;
}

let derniereDictee = null;  // identifiant contenu dans dictee/pret.txt
async function surveillerDictee() {
  let id = null;
  try { id = (await lireTexte('dictee/pret.txt')).trim(); } catch {}
  if (id && id !== derniereDictee) {
    const premiereLecture = derniereDictee === null;
    derniereDictee = id;
    // Au chargement de la page, ne pas réinsérer une dictée déjà traitée.
    if (!premiereLecture) { try { await insererDerniereDictee(); } catch (e) { console.warn(e); } }
  } else if (derniereDictee === null) {
    derniereDictee = '';
  }
  setTimeout(surveillerDictee, 1500);
}

// --- État du serveur ---
async function surveillerServeur() {
  const etat = $('etat-serveur');
  try {
    await configPrete;
    const rep = await fetch(config.api + 'health', { cache: 'no-store' });
    serveur.pret = rep.ok;
    if (rep.ok && !serveur.modele) {
      const props = await (await fetch(config.api + 'props', { cache: 'no-store' })).json();
      serveur.modele = String(props.model_path || '').split(/[\\/]/).pop().replace(/\.gguf$/i, '');
      serveur.vision = !!(props.modalities && props.modalities.vision);
      document.dispatchEvent(new Event('serveur-pret'));
    }
    etat.textContent = rep.ok ? `${serveur.modele || 'Serveur'} : prêt${serveur.vision ? ' (images)' : ''}` : 'Serveur : chargement…';
    etat.className = 'etat ' + (rep.ok ? 'ok' : '');
  } catch {
    serveur.pret = false;
    etat.textContent = 'Serveur : arrêté';
    etat.className = 'etat ko';
  }
  setTimeout(surveillerServeur, 5000);
}

async function copierTexte(texte, bouton) {
  try { await navigator.clipboard.writeText(texte); }
  catch {
    const zone = document.createElement('textarea');
    zone.value = texte; document.body.appendChild(zone); zone.select();
    document.execCommand('copy'); zone.remove();
  }
  if (bouton) {
    const avant = bouton.textContent;
    bouton.textContent = 'Copié ✓';
    setTimeout(() => { bouton.textContent = avant; }, 1500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  surveillerServeur();
  surveillerDictee();
});
