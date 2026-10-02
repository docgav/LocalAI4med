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
// surTexte(texte), surReflexion(raisonnement) et surStats(timings) sont appelés au fil de la réponse.
// timings (llama-server) : prompt_n / prompt_ms (lecture), predicted_n / predicted_per_second (rédaction).
async function appelerModele(messages, { signal, surTexte, surReflexion, surStats, surEtat, max_tokens, temperature } = {}) {
  await configPrete;
  await reglagesPrets;
  const r = reglages.redaction || {};
  const debut = performance.now();
  let texte = '', reflexion = '', timings = null;
  const rep = await fetch(config.api + 'v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      messages, stream: true, top_p: 0.9, cache_prompt: true, timings_per_token: true,
      temperature: temperature ?? r.temperature ?? 0.3,
      max_tokens: max_tokens ?? r.longueur_max ?? 2048,
    }),
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
      if (paquet.timings) { timings = paquet.timings; if (surStats) surStats(timings); }
      const delta = paquet.choices && paquet.choices[0] && paquet.choices[0].delta;
      if (!delta) continue;
      if (delta.reasoning_content) {
        reflexion += delta.reasoning_content;
        if (surReflexion) surReflexion(reflexion);
        else if (!texte && surEtat) surEtat('Réflexion…');
      }
      if (delta.content) {
        texte += delta.content;
        if (surTexte) surTexte(texte);
      }
    }
  }
  const duree = (performance.now() - debut) / 1000;
  return { texte: texte.trim(), reflexion, timings, duree, bilan: bilanGeneration(timings, duree) };
}

// Résumé lisible des statistiques de génération.
function bilanGeneration(t, duree) {
  const nb = (x) => Math.round(x).toLocaleString('fr-FR');
  const s = (ms) => (ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const morceaux = [];
  if (duree !== undefined) morceaux.push(`Terminé en ${Math.round(duree)} s`);
  if (t && t.prompt_n !== undefined) morceaux.push(`lecture : ${nb(t.prompt_n)} tokens en ${s(t.prompt_ms)} s`);
  if (t && t.predicted_n) morceaux.push(`rédaction : ${nb(t.predicted_n)} tokens à ${t.predicted_per_second.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} tokens/s`);
  return morceaux.join(' – ');
}

// --- Réglages et personnalisation ---
// Mode complet : ressources/reglages.json via la passerelle (survit aux mises à jour).
// Mode secours : réglages par défaut, modifications gardées dans le navigateur seulement.
let reglages = {};
async function chargerReglages() {
  await configPrete;
  try {
    const url = config.mode === 'complet' ? `http://127.0.0.1:${config.dictee}/reglages` : 'reglages-defaut.json';
    reglages = JSON.parse(await lireTexte(url));
  } catch { reglages = {}; }
  if (config.mode !== 'complet') {
    try { const l = localStorage.getItem('reglages'); if (l) reglages = JSON.parse(l); } catch {}
  }
  return reglages;
}
const reglagesPrets = chargerReglages();

async function enregistrerReglages(nouveaux) {
  reglages = nouveaux;
  if (config.mode !== 'complet') { try { localStorage.setItem('reglages', JSON.stringify(nouveaux)); } catch {} return; }
  const rep = await fetch(`http://127.0.0.1:${config.dictee}/reglages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nouveaux, null, 2),
  });
  const r = await rep.json();
  if (!rep.ok) throw new Error(r.erreur || 'erreur ' + rep.status);
  document.dispatchEvent(new Event('reglages-modifies'));
}

// Expression qui trouve un mot ou une expression entière (lettres accentuées comprises).
function motEntier(expr) {
  const echappe = expr.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${echappe}(?![\\p{L}\\p{N}])`, 'giu');
}

// Corrections des erreurs de transcription fréquentes (dictionnaire de transcription).
function corrigerTranscription(texte) {
  for (const d of reglages.dictionnaire_transcription || []) {
    if (d.entendu && d.entendu.trim() && d.ecrit !== undefined) texte = texte.replace(motEntier(d.entendu), d.ecrit);
  }
  return texte;
}

// Raccourcis : une expression est remplacée par son texte complet (sauf s'il est déjà présent).
function developperRaccourcis(texte) {
  for (const r of reglages.raccourcis || []) {
    if (!r.declencheur || !r.declencheur.trim() || !r.texte || texte.includes(r.texte)) continue;
    texte = texte.replace(motEntier(r.declencheur), r.texte);
  }
  return texte;
}

// Glossaire et signature ajoutés aux consignes du modèle.
function consignesPersonnelles() {
  const g = (reglages.glossaire || []).filter((x) => x.terme && x.definition);
  return g.length ? 'Abréviations et termes du service (à utiliser pour comprendre les notes) :\n' +
    g.map((x) => `- ${x.terme} = ${x.definition}`).join('\n') : '';
}
function appliquerSignature(texte) {
  const s = reglages.signature || {};
  if (s.nom) texte = texte.split('[NOM]').join(s.nom);
  if (s.hopital) texte = texte.split('[HÔPITAL]').join(s.hopital);
  if (s.service) texte = texte.split('Service de neurologie').join(s.service);
  return texte;
}

// Modèles de documents : passerelle (défaut + personnels) en mode complet, fichiers statiques sinon.
async function chargerDocuments() {
  await configPrete;
  if (config.mode === 'complet') {
    const r = JSON.parse(await lireTexte(`http://127.0.0.1:${config.dictee}/documents`));
    return r.documents;
  }
  const docs = [];
  const fichiers = (await lireTexte('prompts/_liste.txt')).split('\n').map((f) => f.trim()).filter(Boolean);
  for (const f of ['_commun.txt', ...fichiers]) {
    try { docs.push({ fichier: f, origine: 'defaut', contenu: await lireTexte('prompts/' + encodeURIComponent(f)) }); } catch {}
  }
  return docs;
}

// --- Onglets ---
// Interface de discussion de llamafile (anglais, complète) ou intégrée (français), selon les réglages.
function discussionLlamafile() {
  return config.mode === 'complet' && ((reglages.discussion || {}).interface || 'llamafile') === 'llamafile';
}

// Zone qui reçoit la dictée dans chaque onglet. L'interface de discussion de llamafile (mode complet)
// est sur une autre origine : la dictée y est copiée dans le presse-papier.
const vues = {
  redaction: { cibleDictee: () => $('notes') },
  personnaliser: { cibleDictee: () => null },
  synthese: { cibleDictee: () => ($('sy-dossier').hidden ? null : $('sy-coller')) },
  anonymisation: { cibleDictee: () => $('an-entree') },
  historique: { cibleDictee: () => null },
  discussion: { cibleDictee: () => (discussionLlamafile() ? null : $('saisie')) },
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
  await reglagesPrets;
  texte = developperRaccourcis(corrigerTranscription(texte));
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
      serveur.nctx = (props.default_generation_settings && props.default_generation_settings.n_ctx) || 8192;
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

// --- Lecture de fichiers déposés (images, PDF, texte), sans rien envoyer hors du poste ---
const TAILLE_IMAGE = 1024;   // côté maximal des images transmises au modèle (px)

function lireFichier(fichier, comme) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result); r.onerror = () => ko(r.error);
    if (comme === 'url') r.readAsDataURL(fichier); else if (comme === 'texte') r.readAsText(fichier, 'utf-8'); else r.readAsArrayBuffer(fichier);
  });
}

function chargerImage(url) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = () => ko(new Error('image illisible'));
    img.src = url;
  });
}

// Réduit l'image (JPEG) pour limiter le nombre de tokens et la place occupée.
async function imageVersJpeg(source, taille = TAILLE_IMAGE) {
  const img = await chargerImage(source);
  const echelle = Math.min(1, taille / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * echelle); canvas.height = Math.round(img.height * echelle);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

let pdfjsPret = null;
function chargerPdfjs() {
  if (!pdfjsPret) {
    pdfjsPret = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'lib/pdfjs/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => ko(new Error('pdf.js introuvable (app/lib/pdfjs)'));
      document.head.appendChild(s);
    });
  }
  return pdfjsPret;
}

// Extrait le texte d'un PDF ; s'il n'en contient pas (scan), renvoie les premières pages en image.
async function lirePdf(fichier, { maxCaracteres = 15000, pagesScannees = 3 } = {}) {
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({ data: await lireFichier(fichier, 'binaire'), isEvalSupported: false }).promise;
  let texte = '';
  for (let n = 1; n <= doc.numPages && texte.length < maxCaracteres; n++) {
    const page = await doc.getPage(n);
    const contenu = await page.getTextContent();
    texte += contenu.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
  }
  if (texte.trim().length > 20) return [{ type: 'texte', nom: fichier.name, contenu: texte }];
  if (!serveur.vision) throw new Error(`${fichier.name} ne contient pas de texte (document scanné) et le modèle n'accepte pas les images.`);
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, pagesScannees); n++) {
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: 1 });
    const v = page.getViewport({ scale: TAILLE_IMAGE / Math.max(vue.width, vue.height) });
    const canvas = document.createElement('canvas');
    canvas.width = v.width; canvas.height = v.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: v }).promise;
    pages.push({ type: 'image', nom: `${fichier.name} p.${n}`, url: canvas.toDataURL('image/jpeg', 0.85) });
  }
  return pages;
}

// Fichier quelconque → pièces [{type: 'texte', nom, contenu} | {type: 'image', nom, url}].
async function lireDocument(f, options = {}) {
  if (f.type.startsWith('image/')) {
    if (!serveur.vision) throw new Error('le modèle a été lancé sans module image (fichier mmproj absent, voir TELECHARGEMENTS.md).');
    return [{ type: 'image', nom: f.name, url: await imageVersJpeg(await lireFichier(f, 'url')) }];
  }
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return lirePdf(f, options);
  if (f.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.name)) return [{ type: 'texte', nom: f.name, contenu: await lireFichier(f, 'texte') }];
  throw new Error('format non pris en charge (images, PDF ou texte).');
}

// --- Passerelle : appels JSON et archivage des documents produits ---
async function passerelleJson(chemin, { methode = 'GET', corps } = {}) {
  const rep = await fetch(`http://127.0.0.1:${config.dictee}${chemin}`, {
    method: methode, cache: 'no-store',
    headers: corps !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corps === undefined ? undefined : (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  });
  const texte = new TextDecoder('utf-8').decode(await rep.arrayBuffer());
  let r = {};
  try { r = JSON.parse(texte); } catch {}
  if (!rep.ok) throw new Error(r.erreur || 'erreur ' + rep.status);
  return r;
}

function maintenant() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// Enregistre un document produit dans donnees/archives (disque chiffré). Renvoie le nom du fichier,
// à repasser pour mettre à jour la même archive (ex. discussion qui continue). Mode complet seulement.
async function archiver(type, titre, donnees, fichier) {
  await reglagesPrets;
  if (config.mode !== 'complet' || reglages.archivage === false) return null;
  try {
    const chemin = fichier ? `/archiver?fichier=${encodeURIComponent(fichier)}` : `/archiver?type=${type}`;
    const r = await passerelleJson(chemin, { methode: 'POST', corps: { type, titre: String(titre || '').slice(0, 120), date: maintenant(), donnees } });
    return r.fichier;
  } catch (e) { console.warn('archivage impossible', e); return null; }
}
