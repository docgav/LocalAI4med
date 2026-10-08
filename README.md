# IA locale portable pour la pratique médicale

Assistant d'IA qui tourne entièrement sur le poste, depuis un disque USB chiffré, sans installation :
dictée et transcription, rédaction de courriers et d'ordonnances, discussion, synthèse de dossier patient,
anonymisation de documents. Rien ne sort de la machine : tous les services écoutent uniquement sur
`127.0.0.1` et la page n'utilise aucune ressource externe.

**Tout document produit est un brouillon à relire**, en particulier les ordonnances (risque d'invention
de posologie, normalement signalée par `[À PRÉCISER]`).

---

## 1. Première installation

1. Copier le contenu du ZIP du dépôt dans un dossier `IA` à la racine du disque (chiffré par BitLocker To Go).
2. Télécharger les programmes et modèles dans `IA\ressources\` : voir **[TELECHARGEMENTS.md](TELECHARGEMENTS.md)**.
3. Facultatif : réglages personnels dans `ressources\config_perso.bat` (voir § 6) ; le reste se règle
   dans **⚙ Réglages** (bouton en haut à droite de la page).

## 2. Démarrer et arrêter

1. Double-cliquer sur **`Demarrer.bat`**.
   - Si les deux versions de Gemma sont présentes : `1` = E2B (rapide, postes de 8 Go), `2` = E4B
     (plus précis, 16 Go de RAM conseillés) ; sans réponse, E2B après 10 s.
   - Le chargement du modèle est affiché (« chargement du modèle… 24 s »), puis la page s'ouvre dans une
     **fenêtre InPrivate** d'Edge.
2. **Gardez la fenêtre noire ouverte** pendant toute la session.
3. En fin de session : taper **`Q`** puis Entrée dans la fenêtre noire. Cela arrête l'IA, efface les
   fichiers temporaires et vide le presse-papier. Les enregistrements audio et les documents conservés
   (§ 5) ne sont pas effacés, sauf réglage contraire.

**Mode complet ou mode secours** (indiqué dans la fenêtre noire). Le mode complet utilise une petite
passerelle PowerShell locale. Si PowerShell est bloqué sur le poste, le **mode secours** démarre
automatiquement : rédaction et discussion intégrée disponibles, mais pas la dictée dans la page (dictée
de secours dans la fenêtre noire : `Entrée` pour commencer, `q` pour arrêter), ni la synthèse patient,
l'historique, l'enregistrement des réglages et les raccourcis clavier.

## 3. Barre du haut (commune à tous les onglets)

- **🎙 Dicter** (ou `F2`, touche modifiable dans les réglages) : enregistre le micro ; **Arrêter** (même touche) lance la transcription. Le temps
  restant est affiché. Le texte s'insère (au curseur, ou à la fin selon le réglage) dans la zone de saisie de l'onglet affiché (ou est copié dans le
  presse-papier s'il n'y en a pas : il suffit alors de coller avec `Ctrl+V`).
  - Au premier usage de la session, le navigateur demande l'autorisation du micro : accepter.
  - **▶** réécoute le dernier enregistrement ; **Réessayer** relance la transcription du même fichier.
  - **Fichier audio…** transcrit un enregistrement existant (wav, mp3, m4a, ogg…).
  - Les corrections du dictionnaire de transcription (§ 4.6) sont appliquées au texte.
- **Modèles ▾** : changer de modèle sans redémarrer.
  - *Rédaction / discussion* (fichiers `.gguf` de `ressources\`) : choisir puis **Charger** (environ une
    minute ; images disponibles si le fichier mmproj correspondant est présent).
  - *Transcription* (fichiers `ggml*.bin`) : pris en compte dès la dictée suivante.
- En haut à droite : modèle chargé et « (images) » s'il accepte les images, puis **⚙ Réglages** (§ 4.6) ;
  **← Retour** (ou un nouveau clic sur ⚙) ramène à l'onglet précédent.

## 4. Les onglets

### 4.1 Rédaction
1. Dicter ou taper les notes.
2. Choisir le type de document (courrier, compte rendu, ordonnance, demande d'IRM, certificat…).
3. **Rédiger** (`Ctrl+Entrée`). La page affiche la phase en cours, la **réflexion du modèle** s'il en
   produit (cadre repliable) et les **statistiques** (tokens lus, tokens rédigés, vitesse).
4. Corriger le texte à la main, ou donner une consigne (« plus court »…) puis **Modifier** ;
   **Version précédente** annule la dernière modification.
5. **Copier**, puis coller dans le DPI.

La signature, le glossaire et les formulations types (§ 4.6) sont pris en compte automatiquement :
par exemple, « ROT vifs mais reste de l'examen neuro normal » donne un examen neurologique complet
où seuls les réflexes sont décrits comme vifs.

### 4.2 Discussion
Par défaut, **l'interface de discussion de llamafile**, préréglée en français pour la neurologie :
historique, pièces jointes (PDF, images, texte), modification et régénération des réponses.
- Cette interface n'existe **qu'en anglais** (le modèle répond en français). Pour une interface en
  français, plus simple : ⚙ Réglages → Général → Discussion → « Interface intégrée ».
- La dictée y est copiée dans le presse-papier : coller avec `Ctrl+V`.
- Son historique est effacé à la fermeture de la fenêtre InPrivate ; seule la discussion intégrée est
  conservée dans l'Historique.

### 4.3 Synthèse patient
Un **dossier par patient**, qui réunit des éléments et les productions du modèle.
1. **Nouveau** : donner un libellé (de préférence non identifiant : initiales, chambre, date).
2. Ajouter des éléments : coller du texte (**Ajouter le texte**), coller une image, **Ajouter des
   fichiers…** (PDF, images, texte) ou glisser-déposer. Chaque élément peut être décoché pour ne pas être
   envoyé au modèle. La page indique la place occupée dans la mémoire du modèle.
3. **Depuis un autre logiciel** (DPI, résultats, imagerie) :
   - sélectionner du texte puis **`Ctrl+Alt+T`** : le texte est envoyé dans le dossier ouvert ;
   - **`Ctrl+Alt+P`** : l'outil de capture de Windows s'ouvre ; la zone sélectionnée est envoyée.
   Une bulle confirme l'envoi (icône dans la zone de notification). Si aucun dossier n'est ouvert, les
   éléments attendent dans la page.
4. Outils : **Synthèse de l'histoire** (antécédents, histoire chronologique, traitements, examens,
   problèmes actifs, points à vérifier), **questions** sur le dossier, **rédaction** d'un document du
   type choisi à partir du dossier. Le modèle cite ses sources ([Élément 2]). Les productions sont
   gardées dans le dossier.

Les images ne sont utilisables qu'avec le fichier mmproj ; au plus les 4 dernières sont envoyées.
Si le dossier est trop long pour la mémoire du modèle : décocher des éléments ou augmenter `CONTEXTE`.

### 4.4 Anonymisation
1. Saisir nom, prénom(s), date de naissance, et d'autres éléments à masquer (proches, adresse,
   n° de dossier…), un par ligne. **Détecter avec l'IA** ajoute à cette liste les noms, lieux et
   identifiants repérés par le modèle : à vérifier.
2. Coller le texte ou **Ouvrir un fichier** (texte ou PDF), puis **Anonymiser**.
   Les éléments deviennent des jetons : `[NOM]`, `[PRENOM]`, `[DATE_NAISSANCE]`, `[MASQUE_1]`,
   `[EMAIL_1]`, `[TELEPHONE_1]`, `[NIR_1]` et, si la case est cochée, `[DATE_1]`… (les dates d'examen sont
   gardées par défaut). Les variantes de casse et d'accents sont reconnues (LEFEVRE, Lefèvre).
3. Le texte anonymisé commence par son identifiant `[ANON-AAAAMMJJ-HHMMSS]` ; la table de correspondance
   est enregistrée dans `donnees\anonymisation\`.
4. **Désanonymiser** : coller un texte contenant les jetons et l'identifiant (par exemple un texte
   retravaillé ailleurs) ; les valeurs d'origine sont rétablies.

La détection automatique n'est pas infaillible : **relire le texte anonymisé avant de le diffuser.**

### 4.5 Historique
Tous les documents produits, enregistrés automatiquement : rédactions (avec les notes et chaque
version), transcriptions, discussions de l'interface intégrée, productions de la synthèse patient,
textes anonymisés. Filtre par type, recherche dans le contenu, **Copier le document**, **Reprendre dans
Rédaction**, **Supprimer**. Pour une transcription, l'enregistrement audio peut être réécouté tant qu'il
est conservé.

### 4.6 ⚙ Réglages (bouton en haut à droite)
Ce n'est pas un onglet : le bouton ouvre les réglages, **← Retour** ramène à l'outil en cours.
Tout est enregistré dans `ressources\` (`reglages.json`, dossier `prompts\`), donc conservé lors des
mises à jour. Bouton **Enregistrer les réglages** en bas.
- **Général** : onglet affiché au démarrage, thème (automatique, clair, sombre), taille du texte,
  touche de dictée (F2 à F10), insertion de la dictée (au curseur ou à la fin), copie automatique du
  document rédigé, confirmation avant d'effacer, interface de discussion.
- **Rédaction et signature** : signature des courriers (remplace `[NOM]`, `[HÔPITAL]` et le service dans
  les modèles), créativité et longueur de la rédaction, affichage de la réflexion.
- **Transcription** : options de whisper (§ 7).
- **Données** : conservation automatique des documents, suppression des enregistrements audio à
  l'arrêt (désactivée par défaut), durée de conservation (au-delà, les documents et enregistrements
  plus anciens sont supprimés au démarrage ; « illimitée » par défaut).
- **Modèles de documents** : modifier un modèle (votre version remplace l'originale, qui reste
  récupérable), en créer un, modifier les consignes communes (`_commun.txt`). Format :
  ```
  ### TITRE
  Courrier d'adressage
  ### CONSIGNES
  Ce que le modèle doit faire, la structure attendue…
  ### EXEMPLE NOTES
  notes fictives
  ### EXEMPLE DOCUMENT
  le document attendu pour ces notes
  ```
  Deux ou trois paires d'exemples suffisent ; **exemples fictifs uniquement**.
- **Créer un modèle à partir d'exemples** : fournir plusieurs documents du même type (5 à 10, PDF ou
  texte, par exemple des comptes rendus d'hospitalisation). Le modèle analyse chacun, en déduit un modèle
  général (rubriques, style, formules d'usage), peut créer un exemple fictif, et relève les abréviations
  (→ glossaire) et les termes spécialisés (→ vocabulaire de la transcription). Relire le modèle proposé
  (aucune donnée de patient ne doit y rester), puis l'enregistrer. Les documents fournis ne sont ni
  enregistrés ni archivés. Compter environ une minute par document.
- **Formulations types** : textes types transmis au modèle (ex. « examen neurologique normal » → examen
  complet). Vos notes restent telles quelles ; quand elles y font référence, même en abrégé ou avec des
  exceptions (« ROT vifs mais reste de l'examen normal »), le modèle rédige le texte type en l'adaptant.
  À vérifier à la relecture : un petit modèle peut oublier une exception. Gardez les textes courts.
- **Dictionnaire de transcription** : corrige ce que Whisper comprend mal (« natalisumab » → « natalizumab ») ;
  les formes correctes lui sont aussi données comme vocabulaire.
- **Glossaire** : abréviations du service, transmises au modèle pour comprendre les notes. Case
  **« utilisable »** : cochée, le modèle peut écrire l'abréviation dans le document (IRM) ; décochée, il
  l'écrit toujours en toutes lettres (SEP → sclérose en plaques).

## 5. Données enregistrées et confidentialité

| Où | Quoi | Effacé ? |
|---|---|---|
| `donnees\archives\` | documents produits (onglet Historique) | non (suppression à la main dans l'Historique) |
| `donnees\patients\` | dossiers de la synthèse patient | non (bouton « Supprimer le dossier ») |
| `donnees\anonymisation\` | tables de correspondance (permettent de réidentifier) | non |
| `donnees\audio\` | enregistrements des dictées (réécoute dans l'Historique) | non, sauf réglage « Données » |
| `dictees\` | fichiers temporaires de la dictée de secours | à l'arrêt |
| `app\dictee\` | dernière transcription de la dictée de secours | à l'arrêt |
| `journal\` | journaux techniques (durées, erreurs), **sans texte dicté** | non |
| navigateur | rien de patient (fenêtre InPrivate) ; seuls quelques réglages d'affichage | à la fermeture |

- Le dossier **`donnees\` contient des données de santé** : il doit rester sur le disque chiffré, ne
  jamais être copié sur un poste ni une messagerie. Les tables d'anonymisation sont aussi sensibles que
  les documents d'origine.
- La conservation automatique, la suppression de l'audio et la durée de conservation se règlent dans
  ⚙ Réglages → Données (les dossiers patients et les tables d'anonymisation restent enregistrés,
  puisque c'est leur fonction).
- Ce stockage doit figurer dans le dossier de validation (DSI/RSSI, registre RGPD du service).

## 6. Mettre à jour

Télécharger le nouveau ZIP et copier son contenu par-dessus le dossier `IA` en acceptant de remplacer.
`ressources\` (programmes, modèles, réglages, modèles de documents personnels) et `donnees\` ne sont pas
touchés.

Réglages techniques (noms des modèles, ports, contexte…) : créer `ressources\config_perso.bat` et y
recopier seulement les lignes `set` de `config.bat` à modifier. Exemple :
```
set "CONTEXTE=16384"
set "PORT_DICTEE=8091"
```

## 7. Accélérer la transcription

1. **Installer whisper.cpp officiel** dans `ressources\whisper-cpp\` (voir
   [TELECHARGEMENTS.md](TELECHARGEMENTS.md)) : whisperfile 0.10.6 n'utilise pas les instructions AVX2 des
   processeurs (sur un Xeon E-2124G : 250 s pour 20 s d'audio, dont 219 s d'encodage).
2. Vérifier la taille du modèle `ggml-medium-q5_0.bin` : environ 540 Mo (1,4 Go = version non compressée,
   plus lente). `ggml-small-q5_1.bin` est environ 3 fois plus rapide, mais moins précis.
3. ⚙ Réglages → Transcription : « Fenêtre adaptée aux dictées courtes » (plus rapide sous 30 s,
   à tester). « Décodage rapide » est activé par défaut.
4. Portable branché sur secteur, en mode « Performances optimales » ; disque sur un port USB 3.

Chaque transcription ajoute une ligne de durées dans `journal\dictee.log` (sans texte) ; le modèle
utilisé y est noté, ce qui permet de comparer.

## 8. Dépannage

| Problème | Piste |
|---|---|
| La fenêtre noire se ferme ou affiche une erreur au démarrage | Lire le message. Vérifier que le dossier `app` est complet (recopier le ZIP) et les noms des fichiers de `ressources\` (pas de `.exe.exe`, voir TELECHARGEMENTS). |
| « Le serveur n'a pas démarré » | La fin de `journal\serveur.log` s'affiche : elle commence par la commande lancée et finit par le code d'arrêt de llamafile. Vérifier le nom du modèle, tester `ressources\llamafile.exe --version`, antivirus. |
| « mode secours » inattendu | Lire `journal\passerelle.log`. « impossible d'écouter sur le port 8081 » : un autre logiciel utilise ce port, mettre `set "PORT_DICTEE=8091"` dans `ressources\config_perso.bat`. Fichier absent : PowerShell est bloqué sur le poste. |
| Bouton « Dicter » grisé | Le survol du bouton indique la cause (passerelle absente, ou programme / modèle de transcription manquant dans `ressources\`). |
| Transcription très lente | § 7. Le détail des durées est dans `journal\dictee.log` et `journal\whisper.log`. |
| `Ctrl+Alt+T` / `Ctrl+Alt+P` sans effet | Lire `journal\capteur.log` : raccourci déjà pris par un autre logiciel (changer `TOUCHE_TEXTE` / `TOUCHE_IMAGE` dans `ressources\config_perso.bat`), ou PowerShell bloqué. Dans certains logiciels, la copie simulée ne fonctionne pas : copier (`Ctrl+C`) puis coller dans la synthèse. |
| Page sans types de document (mode secours) | Toujours lancer par `Demarrer.bat`, qui prépare la liste. |
| Rédaction lente | La vitesse (tokens/s) s'affiche. Fermer les autres applications, raccourcir les exemples, préférer E2B. |
| Le modèle « réfléchit » longtemps | Ajouter `--reasoning-budget 0` dans `OPTIONS_LLM` (`ressources\config_perso.bat`). |
| La dictée de secours ne démarre pas | Supprimer `micro.txt` pour rechoisir le micro ; si PowerShell est bloqué, y écrire le nom du micro (liste : `ressources\ffmpeg.exe -list_devices true -f dshow -i dummy`). |

## 9. Contenu du disque

```
IA/
├── Demarrer.bat / Arreter.bat   démarrage (fenêtre noire) et arrêt
├── config.bat                   réglages techniques (surchargés par ressources\config_perso.bat)
├── ressources/      *  programmes, modèles, réglages et modèles de documents personnels (TELECHARGEMENTS.md)
├── donnees/         *  documents conservés : archives, audio, dossiers patients, tables d'anonymisation
├── app/                page de l'IA (onglets), prompts/ (modèles de documents d'origine),
│                       discussion-config.json (préréglages de la discussion), lib/pdfjs (lecture des PDF)
├── scripts/            dictee-serveur.ps1 (passerelle), capteur.ps1 (raccourcis clavier),
│                       serveur.bat, arrêt et nettoyage, dictée de secours (dictee.bat, micro.ps1)
├── dictees/            fichiers temporaires de la dictée de secours
├── journal/            journaux techniques
└── dev/                serveur factice pour tester la page sans modèle
```
`*` : jamais dans le dépôt GitHub.

## 10. Points de vigilance

- **Validation DSI/RSSI indispensable** avant tout usage réel : exécutables non signés, scripts
  PowerShell, raccourcis clavier globaux, ports USB, **stockage de données de santé** (`donnees\`).
- Chiffrer le disque avec BitLocker To Go ; ne jamais copier `donnees\` ailleurs.
- Préférer des libellés de dossiers et des dictées pseudonymisés ; navigateur sans extensions.
- Relire tout document produit, et tout texte anonymisé avant diffusion.

## Développement

`python3 dev/serveur_factice.py 8080` imite llamafile pour tester la page sous Linux ou macOS
(voir [CLAUDE.md](CLAUDE.md) pour l'architecture et les tests de la passerelle).
