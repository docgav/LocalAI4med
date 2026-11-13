// Anonymisation (outil de l'espace de travail) : remplace les éléments identifiants par des jetons
// ([NOM], [DATE_1]…). La table de correspondance est enregistrée dans donnees/anonymisation/ANON-….json
// (disque chiffré) pour pouvoir rétablir le texte d'origine ; l'identifiant ANON-… est écrit en tête du
// texte anonymisé. Ce fichier ne contient que les fonctions de remplacement (sans interface).
'use strict';

const Anonymisation = (() => {
  // Variantes accentuées : « Lefevre » trouve aussi « Lefèvre », « LEFÈVRE »…
  const VARIANTES = { a: 'aàâä', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', c: 'cç', y: 'yÿ' };
  function motifSouple(valeur) {
    const base = valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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
  // o : {nom, prenom, naissance, autres (un par ligne), dates, tel, mail, nir}.
  // Ordre : date de naissance, identifiants techniques (e-mail, téléphone, NIR, qui peuvent contenir
  // un nom), puis expressions longues (prénom + nom, autres éléments), puis nom et prénom seuls, puis dates.
  function anonymiser(texte, o) {
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
    const naissance = (o.naissance || '').trim();
    if (naissance) for (const m of motifsDate(naissance)) remplacer(m, '[DATE_NAISSANCE]', naissance);
    // 2. Identifiants techniques
    if (o.mail) detecter('mail');
    if (o.nir) detecter('nir');
    if (o.tel) detecter('tel');
    // 3. Expressions longues : prénom + nom, autres éléments listés (les plus longs d'abord)
    const nom = (o.nom || '').trim(), prenom = (o.prenom || '').trim();
    if (nom && prenom) {
      remplacer(motifSouple(`${prenom} ${nom}`), '[PRENOM] [NOM]', `${prenom} ${nom}`);
      remplacer(motifSouple(`${nom} ${prenom}`), '[NOM] [PRENOM]', `${nom} ${prenom}`);
    }
    const autres = (o.autres || '').split(/[\n;]+/).map((x) => x.trim()).filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
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
    if (o.dates) detecter('dates');
    return { texte, correspondances };
  }

  function nouvelIdentifiant() {
    const d = new Date(), z = (x) => String(x).padStart(2, '0');
    return `ANON-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  }

  // Désanonymisation : jetons les plus longs d'abord ([DATE_10] avant [DATE_1]).
  function retablir(texte, correspondances) {
    for (const c of [...correspondances].sort((a, b) => b.jeton.length - a.jeton.length)) texte = texte.split(c.jeton).join(c.valeur);
    return texte.replace(/^\s*\[ANON-\d{8}-\d{6}\]\s*\n?/, '');
  }

  return { anonymiser, nouvelIdentifiant, retablir };
})();
