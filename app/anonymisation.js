// Onglet Anonymisation : remplace les éléments identifiants par des jetons ([NOM], [DATE_1]…) et
// enregistre la table de correspondance dans donnees/anonymisation/ANON-….json (disque chiffré),
// pour pouvoir rétablir le texte d'origine (désanonymisation). L'identifiant ANON-… est écrit en tête
// du texte anonymisé : il suffit de recoller un texte qui le contient pour le désanonymiser.
'use strict';

{
  const el = {
    nom: $('an-nom'), prenom: $('an-prenom'), naissance: $('an-naissance'), autres: $('an-autres'),
    optDates: $('an-dates'), optTel: $('an-tel'), optMail: $('an-mail'), optNir: $('an-nir'),
    entree: $('an-entree'), fichier: $('an-fichier'), ouvrir: $('an-ouvrir'), detecter: $('an-detecter'),
    anonymiser: $('an-anonymiser'), sortie: $('an-sortie'), table: $('an-table'), copier: $('an-copier'),
    info: $('an-info'), choixInverse: $('an-choix-inverse'), entreeInverse: $('an-entree-inverse'),
    desanonymiser: $('an-desanonymiser'), sortieInverse: $('an-sortie-inverse'), copierInverse: $('an-copier-inverse'),
    infoInverse: $('an-info-inverse'),
  };

  // Variantes accentuées : « Lefevre » trouve aussi « Lefèvre », « LEFÈVRE »…
  const VARIANTES = { a: 'aàâä', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', c: 'cç', y: 'yÿ' };
  function motifSouple(valeur) {
    const base = valeur.normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    let motif = '';
    for (const c of base) {
      const min = c.toLowerCase();
      if (VARIANTES[min]) motif += `[${VARIANTES[min]}]`;
      else if (/[\s'’-]/.test(c)) motif += "[\\s'’-]+";
      else motif += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
    return new RegExp(`(?<![\\p{L}\\p{N}])${motif.replace(/(\[\\s'’-\]\+)+/g, "[\\s'’-]+")}(?![\\p{L}\\p{N}])`, 'giu');
  }

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOTIF_MOIS = '(?:janv(?:ier)?|f[ée]v(?:rier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\\.?';

  // Date de naissance saisie → formes possibles dans le texte (12/03/1975, 12.3.75, 12 mars 1975, 1975-03-12).
  function motifsDate(saisie) {
    const m = saisie.trim().match(/^(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{2}|\d{4})$/);
    if (!m) return saisie.trim() ? [motifSouple(saisie)] : [];
    const j = +m[1], mo = +m[2], a = m[3], a2 = a.slice(-2), a4 = a.length === 2 ? `(?:19|20)?${a}` : `(?:${a.slice(0, 2)})?${a2}`;
    const jj = `0?${j}`, mm = `0?${mo}`;
    return [
      new RegExp(`(?<!\\d)${jj}[\\s/.-]${mm}[\\s/.-]${a4}(?!\\d)`, 'g'),
      new RegExp(`(?<!\\d)(?:${a.length === 4 ? a : '(?:19|20)' + a2})-0?${mo}-0?${j}(?!\\d)`, 'g'),
      new RegExp(`(?<!\\d)(?:1er|${jj})\\s+${MOIS[mo - 1] ? MOIS[mo - 1].slice(0, 3) : 'xxx'}\\p{L}*\\.?\\s+${a4}(?!\\d)`, 'giu'),
    ];
  }

  const DETECTEURS = {
    dates: { jeton: 'DATE', motifs: [/(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?!\d)/g, new RegExp(`(?<!\\d)(?:1er|\\d{1,2})\\s+${MOTIF_MOIS}\\s+\\d{4}(?!\\d)`, 'giu')] },
    tel: { jeton: 'TELEPHONE', motifs: [/(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g] },
    mail: { jeton: 'EMAIL', motifs: [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g] },
    nir: { jeton: 'NIR', motifs: [/(?<![\dA-Z])[12]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:\d{2}|2A|2B)\s?\d{3}\s?\d{3}(?:\s?\d{2})?(?![\dA-Z])/g] },
  };

  // Anonymisation : renvoie {texte, correspondances: [{jeton, valeur}]}.
  // Ordre : date de naissance, identifiants techniques (e-mail, téléphone, NIR, qui peuvent contenir
  // un nom), puis expressions longues (prénom + nom, autres éléments), puis nom et prénom seuls, puis dates.
  function anonymiserTexte(texte) {
    const correspondances = [];
    const remplacer = (motif, jeton, valeur) => {
      let trouve = false;
      texte = texte.replace(motif, () => { trouve = true; return jeton; });
      if (trouve && !correspondances.some((c) => c.jeton === jeton)) correspondances.push({ jeton, valeur });
      return trouve;
    };
    const detecter = (cle) => {
      const d = DETECTEURS[cle];
      const valeurs = new Map();
      for (const motif of d.motifs) {
        texte = texte.replace(motif, (trouve) => {
          if (!valeurs.has(trouve)) {
            valeurs.set(trouve, `[${d.jeton}_${valeurs.size + 1}]`);
            correspondances.push({ jeton: valeurs.get(trouve), valeur: trouve });
          }
          return valeurs.get(trouve);
        });
      }
    };
    // 1. Date de naissance
    const naissance = el.naissance.value.trim();
    if (naissance) for (const m of motifsDate(naissance)) remplacer(m, '[DATE_NAISSANCE]', naissance);
    // 2. Identifiants techniques
    if (el.optMail.checked) detecter('mail');
    if (el.optNir.checked) detecter('nir');
    if (el.optTel.checked) detecter('tel');
    // 3. Expressions longues : prénom + nom, autres éléments listés (les plus longs d'abord)
    const nom = el.nom.value.trim(), prenom = el.prenom.value.trim();
    if (nom && prenom) {
      remplacer(motifSouple(`${prenom} ${nom}`), '[PRENOM] [NOM]', `${prenom} ${nom}`);
      remplacer(motifSouple(`${nom} ${prenom}`), '[NOM] [PRENOM]', `${nom} ${prenom}`);
    }
    const autres = el.autres.value.split(/[\n;]+/).map((x) => x.trim()).filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
    let n = 0;
    for (const autre of autres) {
      const existant = correspondances.find((c) => c.valeur.toLowerCase() === autre.toLowerCase());
      const jeton = existant ? existant.jeton : `[MASQUE_${n + 1}]`;
      if (remplacer(motifSouple(autre), jeton, autre) && !existant) n++;
    }
    // 4. Nom et prénom seuls
    if (nom) remplacer(motifSouple(nom), '[NOM]', nom);
    for (const p of prenom.split(/[\s,]+/).filter((x) => x.length > 1)) remplacer(motifSouple(p), '[PRENOM]', prenom);
    // 5. Toutes les autres dates (facultatif : les dates d'examens sont souvent utiles)
    if (el.optDates.checked) detecter('dates');
    return { texte, correspondances };
  }

  function nouvelIdentifiant() {
    const d = new Date(), z = (x) => String(x).padStart(2, '0');
    return `ANON-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  }

  function afficherTable(correspondances) {
    el.table.innerHTML = '';
    for (const c of correspondances) {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = c.jeton;
      const b = document.createElement('td'); b.textContent = c.valeur;
      tr.append(a, b); el.table.appendChild(tr);
    }
  }

  el.anonymiser.addEventListener('click', async () => {
    const source = el.entree.value.trim();
    if (!source) return el.entree.focus();
    if (!el.nom.value.trim() && !el.autres.value.trim()) {
      if (!confirm('Aucun nom saisi : seuls les éléments détectés automatiquement (dates, téléphones…) seront masqués. Continuer ?')) return;
    }
    const id = nouvelIdentifiant();
    const r = anonymiserTexte(source);
    el.sortie.value = `[${id}]\n${r.texte}`;
    afficherTable(r.correspondances);
    if (config.mode !== 'complet') {
      el.info.textContent = 'Mode secours : la table de correspondance n\'est pas enregistrée (désanonymisation impossible plus tard).';
      return;
    }
    try {
      await passerelleJson(`/correspondance?id=${id}`, { methode: 'POST', corps: { id, date: maintenant(), libelle: el.fichier.dataset.nom || 'Texte collé', correspondances: r.correspondances } });
      archiver('anonymisation', `${id} – ${el.fichier.dataset.nom || 'texte collé'}`, { id, texte: el.sortie.value });
      el.info.textContent = `${r.correspondances.length} élément(s) masqué(s). Table enregistrée : donnees\\anonymisation\\${id}.json`;
      chargerCorrespondances();
    } catch (e) { el.info.textContent = 'Table non enregistrée : ' + e.message; }
  });

  // Détection des noms et identifiants par le modèle, ajoutés à « Autres éléments » pour relecture.
  el.detecter.addEventListener('click', async () => {
    const source = el.entree.value.trim();
    if (!source) return el.entree.focus();
    el.detecter.disabled = true;
    el.info.textContent = 'Recherche des éléments identifiants par l\'IA…';
    try {
      const r = await appelerModele([
        { role: 'system', content: 'Tu repères les informations permettant d\'identifier des personnes dans un texte médical. Réponds uniquement par un objet JSON : {"personnes": [noms et prénoms de personnes, tels qu\'écrits], "lieux": [adresses, villes, établissements], "identifiants": [numéros de dossier, IPP, téléphones, etc.]}. Ne liste ni les maladies, ni les médicaments, ni les examens.' },
        { role: 'user', content: source.slice(0, 12000) },
      ], { temperature: 0, max_tokens: 800 });
      const json = JSON.parse(r.texte.slice(r.texte.indexOf('{'), r.texte.lastIndexOf('}') + 1));
      const trouves = [...(json.personnes || []), ...(json.lieux || []), ...(json.identifiants || [])].map(String).map((x) => x.trim()).filter(Boolean);
      const deja = new Set(el.autres.value.split(/[\n;]+/).map((x) => x.trim().toLowerCase()));
      const nouveaux = trouves.filter((x) => !deja.has(x.toLowerCase()));
      el.autres.value = [el.autres.value.trim(), ...nouveaux].filter(Boolean).join('\n');
      el.info.textContent = nouveaux.length ? `${nouveaux.length} élément(s) ajouté(s) à la liste : vérifiez-la, puis « Anonymiser ».` : 'Aucun élément supplémentaire trouvé.';
    } catch (e) {
      el.info.textContent = 'Détection impossible : ' + e.message;
    } finally { el.detecter.disabled = false; }
  });

  el.ouvrir.addEventListener('click', () => el.fichier.click());
  el.fichier.addEventListener('change', async () => {
    const f = el.fichier.files[0];
    el.fichier.value = '';
    if (!f) return;
    try {
      const pieces = await lireDocument(f, { maxCaracteres: 200000 });
      const texte = pieces.filter((p) => p.type === 'texte').map((p) => p.contenu).join('\n\n');
      if (!texte.trim()) throw new Error('aucun texte lisible (document scanné ?)');
      el.entree.value = texte;
      el.fichier.dataset.nom = f.name;
      el.info.textContent = `${f.name} chargé.`;
    } catch (e) { el.info.textContent = `${f.name} : ${e.message}`; }
  });
  el.copier.addEventListener('click', () => el.sortie.value && copierTexte(el.sortie.value, el.copier));

  // --- Désanonymisation ---
  async function chargerCorrespondances() {
    if (config.mode !== 'complet') return;
    try {
      const r = await passerelleJson('/correspondances');
      el.choixInverse.innerHTML = '<option value="">Identifiant lu dans le texte</option>';
      for (const c of r.correspondances) el.choixInverse.add(new Option(`${c.id} – ${c.libelle || ''}`, c.id));
    } catch (e) { console.warn(e); }
  }

  el.desanonymiser.addEventListener('click', async () => {
    let texte = el.entreeInverse.value;
    if (!texte.trim()) return el.entreeInverse.focus();
    const lu = texte.match(/\[?(ANON-\d{8}-\d{6})\]?/);
    const id = el.choixInverse.value || (lu && lu[1]);
    if (!id) { el.infoInverse.textContent = 'Identifiant ANON-… introuvable : choisissez la table dans la liste.'; return; }
    try {
      const table = await passerelleJson(`/correspondance?id=${id}`);
      // Jetons les plus longs d'abord ([DATE_10] avant [DATE_1]).
      for (const c of [...table.correspondances].sort((a, b) => b.jeton.length - a.jeton.length)) texte = texte.split(c.jeton).join(c.valeur);
      el.sortieInverse.value = texte.replace(/^\s*\[ANON-\d{8}-\d{6}\]\s*\n?/, '');
      el.infoInverse.textContent = `Texte rétabli avec la table ${id}.`;
    } catch (e) { el.infoInverse.textContent = `Table ${id} introuvable : ${e.message}`; }
  });
  el.copierInverse.addEventListener('click', () => el.sortieInverse.value && copierTexte(el.sortieInverse.value, el.copierInverse));

  configPrete.then(() => {
    if (config.mode !== 'complet') el.info.textContent = 'Mode secours : anonymisation possible, mais sans enregistrement de la table de correspondance.';
    chargerCorrespondances();
  });
}
