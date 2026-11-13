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
   fichiers temporaires et vide le presse-papier. Les dossiers et les enregistrements audio (§ 5) ne sont
   pas effacés, sauf réglage contraire.

**Mode complet ou mode secours** (indiqué dans la fenêtre noire). Le mode complet utilise une petite
passerelle PowerShell locale. Si PowerShell est bloqué sur le poste, le **mode secours** démarre
automatiquement : le brouillon (§ 4.1) et la discussion intégrée fonctionnent, mais rien n'est enregistré
(pas de dossiers, ni de réglages sur le disque), et il n'y a ni dictée dans la page (dictée de secours
dans la fenêtre noire : `Entrée` pour commencer, `q` pour arrêter) ni raccourcis clavier.

## 3. Barre du haut

- **Dossiers** (espace de travail, § 4.1) et **Discussion** (§ 4.2) ; **⚙ Réglages** (§ 4.3).
- **🎙 Dicter** (ou `F2`, touche modifiable dans les réglages) : enregistre le micro ; **Arrêter** (même
  touche) lance la transcription. Le temps restant est affiché. Le texte s'insère dans le dernier champ
  utilisé (par défaut, la zone de notes du dossier), au curseur ou à la fin selon le réglage. S'il n'y a
  pas de champ (interface de discussion de llamafile), il est copié dans le presse-papier : coller avec `Ctrl+V`.
  - Au premier usage de la session, le navigateur demande l'autorisation du micro : accepter.
  - **▶** réécoute le dernier enregistrement ; **Réessayer** relance la transcription du même fichier.
  - **Fichier audio…** transcrit un enregistrement existant (wav, mp3, m4a, ogg…).
  - Les corrections du dictionnaire de transcription (§ 4.3) sont appliquées au texte.
- **Modèles ▾** : changer de modèle sans redémarrer.
  - *Rédaction / discussion* (fichiers `.gguf` de `ressources\`) : choisir puis **Charger** (environ une
    minute ; images disponibles si le fichier mmproj correspondant est présent).
  - *Transcription* (fichiers `ggml*.bin`) : pris en compte dès la dictée suivante.
- À droite : modèle chargé et « (images) » s'il accepte les images.

## 4. Les onglets

### 4.1 Dossiers (espace de travail)
Une seule fenêtre de travail, en trois colonnes.

**À gauche : la liste des dossiers.**
- **📝 Brouillon** : toujours disponible, pour un travail rapide. Rien n'est enregistré : son contenu est
  perdu à la fermeture de la page. **Enregistrer comme dossier** le transforme en dossier.
- **+ Nouveau** : crée un dossier, enregistré dans `donnees\patients\`. Libellé de préférence non
  identifiant (initiales, chambre, date). Recherche par libellé.

**Au centre : le contenu du dossier.**
1. Zone de saisie : **notes libres** tapées ou **dictées**, ou **texte collé** (compte rendu, biologie…),
   avec un titre facultatif. **Ajouter au dossier** en fait un élément. On peut aussi coller une image,
   ajouter des **Fichiers…** (PDF, images, texte) ou les glisser dans la colonne. Une note dictée garde
   son enregistrement : bouton **▶** pour le réécouter.
2. Chaque élément peut être **décoché** pour ne pas être utilisé. La page indique la place occupée dans
   la mémoire du modèle.
3. **Relire** : cliquer sur le texte d'un élément l'affiche en entier (**Tout déplier** pour tous) ;
   **Lire** l'ouvre en grand dans une liseuse, où il peut être corrigé (◀ ▶ pour passer d'un élément à
   l'autre ; la dictée s'y insère aussi).
4. **Depuis un autre logiciel** (DPI, résultats, imagerie) :
   - sélectionner du texte puis **`Ctrl+Alt+T`** : le texte est ajouté au dossier ouvert ;
   - **`Ctrl+Alt+P`** : l'outil de capture de Windows s'ouvre ; la zone sélectionnée est ajoutée.
   Une bulle confirme l'envoi (icône dans la zone de notification).

**À droite : les créations**, à partir des éléments cochés. Un texte resté dans la zone de saisie est
d'abord ajouté au dossier. `Ctrl+Entrée` lance l'outil choisi.
- **Synthèse** : résumé, antécédents, histoire chronologique, traitements, examens, problèmes actifs,
  points à vérifier. Le modèle cite ses sources ([Élément 2]). Consignes complémentaires possibles.
- **Document** : compte rendu, courrier, ordonnance, demande d'IRM, certificat… selon les modèles de
  documents (§ 4.3). Avec un seul élément coché (par exemple une dictée), il est traité comme les notes
  des exemples du modèle ; avec plusieurs, comme un dossier.
- **Question** : question libre sur le dossier.
- **Anonymisation** : voir ci-dessous.

Le résultat s'affiche en direct (phase, **réflexion du modèle** s'il en produit, statistiques). Il est
**modifiable** et enregistré dans le dossier (**Créations du dossier**). **Modifier** applique une
consigne (« plus court »…), **Version précédente** l'annule, **Lire en grand** ouvre la liseuse,
**Copier** puis coller dans le DPI, **Ajouter aux éléments** permet de réutiliser le résultat (par exemple
une synthèse) pour une autre création.

Le contexte général, la signature, le glossaire et les formulations types (§ 4.3) sont pris en compte
automatiquement : par exemple, « ROT vifs mais reste de l'examen neuro normal » donne un examen
neurologique complet où seuls les réflexes sont décrits comme vifs.

Les images ne sont utilisables qu'avec le fichier mmproj ; au plus les 4 dernières sont envoyées.
Si le dossier est trop long pour la mémoire du modèle : décocher des éléments ou augmenter `CONTEXTE`.

**Anonymisation** (des éléments texte cochés) :
1. Saisir nom, prénom(s), date de naissance, et d'autres éléments à masquer (proches, adresse,
   n° de dossier…), un par ligne. **Détecter avec l'IA** ajoute à cette liste les noms, lieux et
   identifiants repérés par le modèle : à vérifier.
2. **Anonymiser** : les éléments deviennent des jetons : `[NOM]`, `[PRENOM]`, `[DATE_NAISSANCE]`,
   `[MASQUE_1]`, `[EMAIL_1]`, `[TELEPHONE_1]`, `[NIR_1]` et, si la case est cochée, `[DATE_1]`… (les dates
   d'examen sont gardées par défaut). Les variantes de casse et d'accents sont reconnues (LEFEVRE, Lefèvre).
   La liste des remplacements s'affiche sous le résultat.
3. Le texte anonymisé commence par son identifiant `[ANON-AAAAMMJJ-HHMMSS]` ; la table de correspondance
   est enregistrée dans `donnees\anonymisation\`.
4. **Désanonymiser un texte** : coller dans le cadre « Résultat » un texte contenant les jetons et
   l'identifiant (par exemple retravaillé ailleurs), puis **Rétablir le résultat**.

La détection automatique n'est pas infaillible : **relire le texte anonymisé avant de le diffuser.**

### 4.2 Discussion
Par défaut, **l'interface de discussion de llamafile**, préréglée en français pour la neurologie :
historique, pièces jointes (PDF, images, texte), modification et régénération des réponses.
- Cette interface n'existe **qu'en anglais** (le modèle répond en français). Pour une interface en
  français, plus simple, qui reçoit directement la dictée et le contexte général : ⚙ Réglages → Général
  → Discussion → « Interface intégrée ».
- La dictée y est copiée dans le presse-papier : coller avec `Ctrl+V`.
- Les discussions ne sont pas enregistrées (effacées à la fermeture de la fenêtre InPrivate).

### 4.3 ⚙ Réglages
Le bouton ouvre les réglages, **← Retour** ramène à l'onglet en cours. Tout est enregistré dans
`ressources\` (`reglages.json`, dossier `prompts\`), donc conservé lors des mises à jour. Bouton
**Enregistrer les réglages** en bas.
- **Général** : onglet affiché au démarrage, thème (automatique, clair, sombre), taille du texte,
  touche de dictée (F2 à F10), insertion de la dictée (au curseur ou à la fin), copie automatique du
  document rédigé, confirmation avant de retirer un élément, interface de discussion.
- **Contexte général et signature** : **contexte général (pré-prompt)**, texte libre transmis au modèle
  à chaque demande (votre activité, vos destinataires, votre style ; à garder court) ; signature des
  courriers (remplace `[NOM]`, `[HÔPITAL]` et le service dans les modèles) ; créativité et longueur de la
  rédaction ; affichage de la réflexion.
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
  (aucune donnée de patient ne doit y rester), puis l'enregistrer. Les documents fournis ne sont pas
  enregistrés. Compter environ une minute par document.
- **Abréviations (glossaire)** : abréviations du service, transmises au modèle pour comprendre les notes.
  Case **« utilisable »** : cochée, le modèle peut écrire l'abréviation dans le document (IRM) ; décochée,
  il l'écrit toujours en toutes lettres (SEP → sclérose en plaques).
- **Formulations types** : textes types transmis au modèle (ex. « examen neurologique normal » → examen
  complet). Vos notes restent telles quelles ; quand elles y font référence, même en abrégé ou avec des
  exceptions (« ROT vifs mais reste de l'examen normal »), le modèle rédige le texte type en l'adaptant.
  À vérifier à la relecture : un petit modèle peut oublier une exception. Gardez les textes courts.
- **Transcription** : options de whisper (§ 7) et **dictionnaire de transcription**, qui corrige ce que
  Whisper comprend mal (« natalisumab » → « natalizumab ») ; les formes correctes lui sont aussi données
  comme vocabulaire.
- **Données** : suppression des enregistrements audio à l'arrêt (désactivée par défaut), durée de
  conservation des enregistrements (au-delà, ils sont supprimés au démarrage ; « illimitée » par défaut).

## 5. Données enregistrées et confidentialité

| Où | Quoi | Effacé ? |
|---|---|---|
| `donnees\patients\` | dossiers : éléments et créations | non (bouton « Supprimer le dossier ») |
| `donnees\audio\` | enregistrements des dictées (réécoute depuis les éléments) | non, sauf réglage « Données » |
| `donnees\anonymisation\` | tables de correspondance (permettent de réidentifier) | non |
| `donnees\archives\` | documents des versions précédentes (onglet Historique supprimé) | selon la durée de conservation |
| `dictees\` | fichiers temporaires de la dictée de secours | à l'arrêt |
| `app\dictee\` | dernière transcription de la dictée de secours | à l'arrêt |
| `journal\` | journaux techniques (durées, erreurs), **sans texte dicté** | non |
| navigateur | brouillon en mémoire seulement ; quelques réglages d'affichage (fenêtre InPrivate) | à la fermeture |

- Le dossier **`donnees\` contient des données de santé** : il doit rester sur le disque chiffré, ne
  jamais être copié sur un poste ni une messagerie. Les tables d'anonymisation sont aussi sensibles que
  les documents d'origine.
- Pour un travail sans rien enregistrer, utiliser le **Brouillon**.
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
├── donnees/         *  données conservées : dossiers, audio des dictées, tables d'anonymisation
├── app/                page de l'IA (dossiers, discussion, réglages), prompts/ (modèles de documents d'origine),
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
