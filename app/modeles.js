// Menu « ⚙ Modèles » : choix du modèle de rédaction (llamafile relancé par la passerelle) et du
// modèle de transcription (pris en compte à la dictée suivante). Mode complet uniquement.
'use strict';

{
  const el = {
    reglages: $('reglages'), llm: $('choix-llm'), charger: $('charger-llm'),
    whisper: $('choix-whisper'), info: $('info-modeles'),
  };
  const passerelle = () => `http://127.0.0.1:${config.dictee}`;

  function remplir(select, liste, actif) {
    select.innerHTML = '';
    for (const m of liste) {
      const taille = m.taille_mo >= 1024 ? `${(m.taille_mo / 1024).toFixed(1)} Go` : `${m.taille_mo} Mo`;
      select.add(new Option(`${m.nom.replace(/\.(gguf|bin)$/i, '')} (${taille})`, m.nom, false, m.nom === actif));
    }
  }

  async function lister() {
    const r = await (await fetch(passerelle() + '/modeles', { cache: 'no-store' })).json();
    remplir(el.llm, r.llm, r.llm_actif);
    remplir(el.whisper, r.whisper, r.whisper_actif);
    el.charger.disabled = true;
    return r;
  }

  async function poster(chemin) {
    const rep = await fetch(passerelle() + chemin, { method: 'POST' });
    const r = await rep.json();
    if (!rep.ok) throw new Error(r.erreur || 'erreur ' + rep.status);
    return r;
  }

  el.whisper.addEventListener('change', async () => {
    try {
      await poster('/choisir-whisper?nom=' + encodeURIComponent(el.whisper.value));
      el.info.textContent = 'Transcription : ' + el.whisper.selectedOptions[0].textContent + ' (dès la prochaine dictée)';
    } catch (e) { el.info.textContent = 'Erreur : ' + e.message; lister(); }
  });

  el.llm.addEventListener('change', () => { el.charger.disabled = false; });

  el.charger.addEventListener('click', async () => {
    const nom = el.llm.value;
    if (!confirm(`Charger ${nom} ?\nLe modèle actuel est arrêté ; la rédaction et la discussion seront indisponibles pendant le chargement (environ une minute).`)) return;
    el.charger.disabled = true;
    try {
      await poster('/charger-llm?nom=' + encodeURIComponent(nom));
    } catch (e) { el.info.textContent = 'Erreur : ' + e.message; return; }
    // Attente du nouveau modèle ; l'état du serveur (en haut à droite) sera relu.
    serveur.modele = ''; serveur.pret = false;
    const t0 = Date.now();
    const attendre = async () => {
      let pret = false;
      try { pret = (await fetch(config.api + 'health', { cache: 'no-store' })).ok; } catch {}
      const s = Math.round((Date.now() - t0) / 1000);
      if (pret) {
        el.info.textContent = `Modèle de rédaction chargé en ${s} s.`;
        const cadre = $('ui-llama');
        if (cadre && cadre.src) cadre.src = cadre.src;   // recharge l'interface de discussion
        return;
      }
      if (s > 600) { el.info.textContent = 'Le modèle ne répond pas : voir journal\\serveur.log.'; return; }
      el.info.textContent = `Chargement du modèle de rédaction… ${s} s`;
      setTimeout(attendre, 2000);
    };
    setTimeout(attendre, 2000);
  });

  configPrete.then(async () => {
    if (config.mode !== 'complet') return;
    try { await lister(); el.reglages.hidden = false; } catch (e) { console.warn(e); }
  });
}
