// Onglet Discussion.
// Mode complet : affiche l'interface de discussion par défaut de llamafile (iframe), préréglée par
// discussion-config.json au lancement du serveur.
// Mode secours : discussion intégrée ci-dessous, avec images et documents (PDF, texte) joints.
// Les PDF sont lus localement par pdf.js (app/lib/pdfjs). Rien n'est conservé après « Nouvelle discussion ».
'use strict';

{
  const el = {
    fil: $('fil'), saisie: $('saisie'), envoyer: $('envoyer'), arreter: $('arreter-discussion'),
    joindre: $('joindre'), fichier: $('fichier'), pieces: $('pieces'), nouvelle: $('nouvelle'),
    zone: $('discussion-perso'), info: $('info-discussion'),
  };

  const TAILLE_IMAGE = 1024;      // côté maximal des images envoyées (px)
  const MAX_CARACTERES = 15000;   // texte maximal par document joint (≈ 4000 tokens)
  const PAGES_SCANNEES = 3;       // pages d'un PDF scanné envoyées en image

  let consignes = 'Tu es un assistant pour un neurologue hospitalier. Réponds en français, de façon précise et concise. N\'invente jamais de donnée.';
  let historique = [];   // messages au format API
  let enAttente = [];    // pièces jointes du prochain message : {type: 'image', nom, url} | {type: 'texte', nom, contenu}
  let controleur = null;

  // Même message système que l'interface de llamafile.
  lireTexte('discussion-config.json')
    .then((t) => { const c = JSON.parse(t).systemMessage; if (c) consignes = c; })
    .catch(() => {});

  // Mode complet : interface de llamafile, chargée à la première ouverture de l'onglet.
  configPrete.then(() => {
    if (config.mode !== 'complet') return;
    const url = `http://127.0.0.1:${config.llm}/`;
    $('discussion-perso').hidden = true;
    $('discussion-llama').hidden = false;
    $('ui-llama-lien').href = url;
    const charger = () => { if (!$('ui-llama').src) $('ui-llama').src = url; };
    if (vueActive === 'discussion') charger();
    document.querySelector('[data-vue=discussion]').addEventListener('click', charger);
  });

  // --- Rendu Markdown minimal et sûr (le texte est échappé avant mise en forme) ---
  function echapper(t) {
    return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function enLigne(t) {
    return t.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }
  function markdown(source) {
    const blocs = echapper(source).split(/```/);
    return blocs.map((bloc, i) => {
      if (i % 2) return '<pre><code>' + bloc.replace(/^[^\n]*\n/, '') + '</code></pre>';
      const html = []; let liste = null;
      const fermerListe = () => { if (liste) { html.push(`</${liste}>`); liste = null; } };
      for (const ligne of bloc.split('\n')) {
        let m;
        if ((m = ligne.match(/^(#{1,4})\s+(.*)/))) { fermerListe(); html.push(`<h4>${enLigne(m[2])}</h4>`); }
        else if ((m = ligne.match(/^\s*[-*•]\s+(.*)/))) {
          if (liste !== 'ul') { fermerListe(); html.push('<ul>'); liste = 'ul'; }
          html.push(`<li>${enLigne(m[1])}</li>`);
        } else if ((m = ligne.match(/^\s*\d+[.)]\s+(.*)/))) {
          if (liste !== 'ol') { fermerListe(); html.push('<ol>'); liste = 'ol'; }
          html.push(`<li>${enLigne(m[1])}</li>`);
        } else if (ligne.trim()) { fermerListe(); html.push(`<p>${enLigne(ligne)}</p>`); }
        else fermerListe();
      }
      fermerListe();
      return html.join('');
    }).join('');
  }

  // --- Affichage des messages ---
  function ajouterBulle(role, texte, pieces = []) {
    const bulle = document.createElement('div');
    bulle.className = 'bulle ' + role;
    for (const p of pieces) {
      if (p.type === 'image') {
        const img = document.createElement('img'); img.src = p.url; img.alt = p.nom; bulle.appendChild(img);
      } else {
        const puce = document.createElement('span'); puce.className = 'puce'; puce.textContent = '📄 ' + p.nom; bulle.appendChild(puce);
      }
    }
    const corps = document.createElement('div');
    corps.className = 'corps';
    if (role === 'assistant') corps.innerHTML = markdown(texte); else corps.textContent = texte;
    bulle.appendChild(corps);
    if (role === 'assistant') {
      const copier = document.createElement('button');
      copier.className = 'copier'; copier.textContent = 'Copier';
      copier.addEventListener('click', () => copierTexte(bulle.dataset.texte || '', copier));
      bulle.appendChild(copier);
    }
    bulle.dataset.texte = texte;
    el.fil.appendChild(bulle);
    el.fil.scrollTop = el.fil.scrollHeight;
    return bulle;
  }

  function majBulle(bulle, texte) {
    bulle.dataset.texte = texte;
    bulle.querySelector('.corps').innerHTML = markdown(texte);
    el.fil.scrollTop = el.fil.scrollHeight;
  }

  // --- Pièces jointes ---
  function afficherPieces() {
    el.pieces.innerHTML = '';
    enAttente.forEach((p, i) => {
      const puce = document.createElement('span');
      puce.className = 'puce';
      puce.textContent = (p.type === 'image' ? '🖼 ' : '📄 ') + p.nom + ' ';
      const retirer = document.createElement('button');
      retirer.textContent = '×'; retirer.title = 'Retirer';
      retirer.addEventListener('click', () => { enAttente.splice(i, 1); afficherPieces(); });
      puce.appendChild(retirer);
      el.pieces.appendChild(puce);
    });
  }

  function chargerImage(url) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img); img.onerror = () => ko(new Error('image illisible'));
      img.src = url;
    });
  }

  // Réduit l'image pour limiter le nombre de tokens et la mémoire utilisée.
  async function imageVersJpeg(source) {
    const img = await chargerImage(source);
    const echelle = Math.min(1, TAILLE_IMAGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * echelle); canvas.height = Math.round(img.height * echelle);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function lireFichier(fichier, comme) {
    return new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = () => ko(r.error);
      if (comme === 'url') r.readAsDataURL(fichier); else if (comme === 'texte') r.readAsText(fichier, 'utf-8'); else r.readAsArrayBuffer(fichier);
    });
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

  // Extrait le texte d'un PDF ; s'il n'en contient pas (scan), envoie les premières pages en image.
  async function lirePdf(fichier) {
    const pdfjs = await chargerPdfjs();
    const doc = await pdfjs.getDocument({ data: await lireFichier(fichier, 'binaire'), isEvalSupported: false }).promise;
    let texte = '';
    for (let n = 1; n <= doc.numPages && texte.length < MAX_CARACTERES; n++) {
      const page = await doc.getPage(n);
      const contenu = await page.getTextContent();
      texte += contenu.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
    }
    if (texte.trim().length > 20) return [{ type: 'texte', nom: fichier.name, contenu: texte }];
    if (!serveur.vision) throw new Error(`${fichier.name} ne contient pas de texte (document scanné) et le modèle n'accepte pas les images.`);
    const pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, PAGES_SCANNEES); n++) {
      const page = await doc.getPage(n);
      const vue = page.getViewport({ scale: 1 });
      const echelle = TAILLE_IMAGE / Math.max(vue.width, vue.height);
      const v = page.getViewport({ scale: echelle });
      const canvas = document.createElement('canvas');
      canvas.width = v.width; canvas.height = v.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: v }).promise;
      pages.push({ type: 'image', nom: `${fichier.name} p.${n}`, url: canvas.toDataURL('image/jpeg', 0.85) });
    }
    return pages;
  }

  async function ajouterFichiers(liste) {
    for (const f of liste) {
      el.info.textContent = 'Lecture de ' + f.name + '…';
      try {
        if (f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|opus|aac|flac)$/i.test(f.name)) {
          // Un fichier audio déposé ici est transcrit, et le texte inséré dans la zone de saisie.
          if (window.transcrireFichierAudio) window.transcrireFichierAudio(f);
          continue;
        }
        if (f.type.startsWith('image/')) {
          if (!serveur.vision) throw new Error('le modèle a été lancé sans module image (fichier mmproj absent, voir TELECHARGEMENTS.md).');
          enAttente.push({ type: 'image', nom: f.name, url: await imageVersJpeg(await lireFichier(f, 'url')) });
        } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          enAttente.push(...await lirePdf(f));
        } else if (f.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.name)) {
          enAttente.push({ type: 'texte', nom: f.name, contenu: await lireFichier(f, 'texte') });
        } else {
          throw new Error('format non pris en charge (images, PDF, texte ou audio).');
        }
      } catch (e) {
        alert(f.name + ' : ' + e.message);
      }
    }
    el.info.textContent = '';
    afficherPieces();
  }

  el.joindre.addEventListener('click', () => el.fichier.click());
  el.fichier.addEventListener('change', () => { ajouterFichiers([...el.fichier.files]); el.fichier.value = ''; });
  el.zone.addEventListener('dragover', (e) => { e.preventDefault(); el.zone.classList.add('survol'); });
  el.zone.addEventListener('dragleave', () => el.zone.classList.remove('survol'));
  el.zone.addEventListener('drop', (e) => {
    e.preventDefault(); el.zone.classList.remove('survol');
    ajouterFichiers([...e.dataTransfer.files]);
  });
  el.saisie.addEventListener('paste', (e) => {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (images.length) { e.preventDefault(); ajouterFichiers(images); }
  });

  // --- Envoi ---
  function construireContenu(texte, pieces) {
    let complet = texte;
    for (const p of pieces.filter((x) => x.type === 'texte')) {
      let contenu = p.contenu.trim();
      if (contenu.length > MAX_CARACTERES) contenu = contenu.slice(0, MAX_CARACTERES) + '\n[… document tronqué]';
      complet += `\n\n--- Document joint : ${p.nom} ---\n${contenu}\n--- Fin du document ---`;
    }
    const images = pieces.filter((x) => x.type === 'image');
    if (!images.length) return complet;
    return [{ type: 'text', text: complet }, ...images.map((p) => ({ type: 'image_url', image_url: { url: p.url } }))];
  }

  async function envoyer() {
    const texte = el.saisie.value.trim();
    if ((!texte && !enAttente.length) || controleur) return;
    const pieces = enAttente; enAttente = []; afficherPieces();
    el.saisie.value = '';
    ajouterBulle('user', texte, pieces);
    historique.push({ role: 'user', content: construireContenu(texte || 'Analyse ce document.', pieces) });

    const bulle = ajouterBulle('assistant', '…');
    controleur = new AbortController();
    el.envoyer.disabled = true; el.arreter.hidden = false;
    el.info.textContent = 'Lecture…';
    let recu = '';
    try {
      const r = await appelerModele([{ role: 'system', content: consignes }, ...historique], {
        signal: controleur.signal,
        surEtat: (m) => { el.info.textContent = m; },
        surTexte: (t) => { recu = t; majBulle(bulle, t); el.info.textContent = 'Rédaction…'; },
      });
      recu = r.texte; majBulle(bulle, recu);
      el.info.textContent = r.bilan;
    } catch (e) {
      if (e.name === 'AbortError') el.info.textContent = 'Arrêté.';
      else {
        el.info.textContent = '';
        majBulle(bulle, (recu ? recu + '\n\n' : '') + '**Erreur :** ' + e.message +
          (/context|contexte|exceed/i.test(e.message) ? '\n\nLa discussion est trop longue : commencez une nouvelle discussion ou joignez un document plus court.' : ''));
      }
    } finally {
      if (recu) historique.push({ role: 'assistant', content: recu });
      else historique.pop();  // échec sans réponse : on retire la question pour pouvoir la renvoyer
      controleur = null;
      el.envoyer.disabled = false; el.arreter.hidden = true;
    }
  }

  el.envoyer.addEventListener('click', envoyer);
  el.saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
  });
  el.arreter.addEventListener('click', () => controleur && controleur.abort());
  el.nouvelle.addEventListener('click', () => {
    if (historique.length && !confirm('Effacer la discussion en cours ?')) return;
    if (controleur) controleur.abort();
    historique = []; enAttente = []; afficherPieces();
    el.fil.innerHTML = ''; el.saisie.value = ''; el.info.textContent = '';
  });

  document.addEventListener('serveur-pret', () => {
    el.joindre.title = serveur.vision ? 'Joindre des images, PDF ou fichiers texte' : 'Joindre des PDF ou fichiers texte (images : module mmproj absent)';
  });
}
