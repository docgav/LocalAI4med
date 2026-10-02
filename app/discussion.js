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

  const MAX_CARACTERES = 15000;   // texte maximal par document joint (≈ 4000 tokens)
  const PAGES_SCANNEES = 3;       // pages d'un PDF scanné envoyées en image

  let consignes = 'Tu es un assistant pour un neurologue hospitalier. Réponds en français, de façon précise et concise. N\'invente jamais de donnée.';
  let historique = [];   // messages au format API
  let enAttente = [];    // pièces jointes du prochain message : {type: 'image', nom, url} | {type: 'texte', nom, contenu}
  let controleur = null;
  let archiveDiscussion = null;   // fichier d'archive de la discussion en cours

  // Même message système que l'interface de llamafile.
  lireTexte('discussion-config.json')
    .then((t) => { const c = JSON.parse(t).systemMessage; if (c) consignes = c; })
    .catch(() => {});

  // Interface de llamafile (mode complet, réglage par défaut) chargée à la première ouverture de
  // l'onglet ; sinon discussion intégrée (français). Réappliqué quand les réglages changent.
  const ongletDiscussion = document.querySelector('[data-vue=discussion]');
  function chargerCadre() { if (discussionLlamafile() && !$('ui-llama').src) $('ui-llama').src = `http://127.0.0.1:${config.llm}/`; }
  function appliquerInterface() {
    const llama = discussionLlamafile();
    $('discussion-perso').hidden = llama;
    $('discussion-llama').hidden = !llama;
    $('ui-llama-lien').href = `http://127.0.0.1:${config.llm}/`;
    if (llama && vueActive === 'discussion') chargerCadre();
  }
  ongletDiscussion.addEventListener('click', chargerCadre);
  document.addEventListener('reglages-modifies', appliquerInterface);
  reglagesPrets.then(appliquerInterface);

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

  async function ajouterFichiers(liste) {
    for (const f of liste) {
      el.info.textContent = 'Lecture de ' + f.name + '…';
      try {
        if (f.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|opus|aac|flac)$/i.test(f.name)) {
          // Un fichier audio déposé ici est transcrit, et le texte inséré dans la zone de saisie.
          if (window.transcrireFichierAudio) window.transcrireFichierAudio(f);
          continue;
        }
        enAttente.push(...await lireDocument(f, { maxCaracteres: MAX_CARACTERES, pagesScannees: PAGES_SCANNEES }));
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
      if (recu) {
        historique.push({ role: 'assistant', content: recu });
        // Archivage de la discussion (texte seulement, images retirées), mise à jour à chaque réponse.
        const messagesTexte = historique.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content
          : m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n') + ' [image(s) jointe(s)]' }));
        const titre = messagesTexte[0] ? messagesTexte[0].content.slice(0, 80) : 'Discussion';
        archiveDiscussion = await archiver('discussion', titre, { messages: messagesTexte }, archiveDiscussion) || archiveDiscussion;
      }
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
    historique = []; enAttente = []; afficherPieces(); archiveDiscussion = null;
    el.fil.innerHTML = ''; el.saisie.value = ''; el.info.textContent = '';
  });

  document.addEventListener('serveur-pret', () => {
    el.joindre.title = serveur.vision ? 'Joindre des images, PDF ou fichiers texte' : 'Joindre des PDF ou fichiers texte (images : module mmproj absent)';
  });
}
