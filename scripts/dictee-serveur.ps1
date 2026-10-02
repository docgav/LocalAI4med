# Passerelle locale :
#  - sert la page de l'IA (dossier app\) ;
#  - recoit l'audio enregistre par la page (WAV 16 kHz mono), l'enregistre dans dictees\,
#    le transcrit avec whisperfile et renvoie le texte.
# Ecoute uniquement sur 127.0.0.1 et n'accepte que les requetes venant de la page de l'IA.
# Lance par Demarrer.bat, qui fournit la configuration par variables d'environnement.
# Compatible Windows PowerShell 5.1 (pas de syntaxe PowerShell 7).

$ErrorActionPreference = 'Stop'
$racine = Split-Path $PSScriptRoot -Parent
Set-Location $racine
[Environment]::CurrentDirectory = $racine

function Chemin([string]$p) {
    if ([IO.Path]::IsPathRooted($p)) { return $p }
    return (Join-Path $racine $p)
}

$whisper = Chemin $env:WHISPERFILE
$modele  = Chemin $env:MODELE_WHISPER
$vocab   = ($env:VOCABULAIRE -replace '"', '')
$port    = [int]$env:PORT_DICTEE
$origines = @("http://127.0.0.1:$($env:PORT_DICTEE)", "http://localhost:$($env:PORT_DICTEE)",
              "http://127.0.0.1:$($env:PORT)", "http://localhost:$($env:PORT)")
$dossierApp = [IO.Path]::GetFullPath((Join-Path $racine 'app'))
$typesMime = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8';
    '.txt' = 'text/plain; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }
$dossier = Join-Path $racine 'dictees'
$journal = Join-Path $racine 'journal'
New-Item -ItemType Directory -Force $dossier, $journal | Out-Null
# Journal de fonctionnement de la passerelle (etapes et erreurs, jamais de texte dicte).
$journalPasserelle = Join-Path $journal 'passerelle.log'
if ((Test-Path $journalPasserelle) -and (Get-Item $journalPasserelle).Length -gt 200KB) { Remove-Item $journalPasserelle }
function Noter([string]$message) {
    try { Add-Content -Path $journalPasserelle -Value ('{0:HH:mm:ss}  {1}' -f (Get-Date), $message) -Encoding Ascii } catch {}
}
Noter "----- demarrage (PowerShell $($PSVersionTable.PSVersion), port $port, page $($env:PORT))"

# Vitesse : nombre de threads (defaut : coeurs physiques) et options de decodage (-bs 1 = glouton, rapide).
$threads = 0
if ($env:WHISPER_THREADS) { $threads = [int]$env:WHISPER_THREADS }
if ($threads -le 0) {
    try { $threads = [int](Get-CimInstance Win32_Processor -OperationTimeoutSec 5 | Measure-Object -Property NumberOfCores -Sum).Sum } catch { $threads = 0 }
    if ($threads -le 0) { $threads = [Math]::Max(1, [int]([Environment]::ProcessorCount / 2)) }
}
$threads = [Math]::Max(2, $threads)
$optionsWhisper = '-bs 1'
if ($null -ne $env:WHISPER_OPTIONS) { $optionsWhisper = $env:WHISPER_OPTIONS }

$statuts = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 500 = 'Internal Server Error' }

function Lire-Requete($flux) {
    # En-tetes jusqu'a la ligne vide, puis corps selon Content-Length.
    $octets = New-Object System.Collections.Generic.List[byte]
    while ($true) {
        $b = $flux.ReadByte()
        if ($b -lt 0) { return $null }
        $octets.Add([byte]$b)
        $n = $octets.Count
        if ($n -ge 4 -and $octets[$n - 4] -eq 13 -and $octets[$n - 3] -eq 10 -and $octets[$n - 2] -eq 13 -and $octets[$n - 1] -eq 10) { break }
        if ($n -gt 65536) { return $null }
    }
    $lignes = [Text.Encoding]::ASCII.GetString($octets.ToArray()) -split "`r`n"
    $premiere = $lignes[0] -split ' '
    $entetes = @{}
    foreach ($l in $lignes) {
        $i = $l.IndexOf(':')
        if ($i -gt 0) { $entetes[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() }
    }
    $longueur = 0
    if ($entetes.ContainsKey('content-length')) { $longueur = [int]$entetes['content-length'] }
    if ($longueur -gt 200MB) { throw 'enregistrement trop volumineux' }
    $corps = New-Object byte[] $longueur
    $lu = 0
    while ($lu -lt $longueur) {
        $r = $flux.Read($corps, $lu, $longueur - $lu)
        if ($r -le 0) { break }
        $lu += $r
    }
    return @{ Methode = $premiere[0]; Chemin = $premiere[1]; Entetes = $entetes; Corps = $corps }
}

function Repondre($flux, [int]$code, $objet, [string]$origine) {
    $json = ''
    if ($null -ne $objet) { $json = ConvertTo-Json -InputObject $objet -Compress -Depth 5 }
    $corps = [Text.Encoding]::UTF8.GetBytes($json)
    $entete = "HTTP/1.1 $code $($statuts[$code])`r`n" +
        "Content-Type: application/json; charset=utf-8`r`n" +
        "Content-Length: $($corps.Length)`r`n" +
        "Access-Control-Allow-Origin: $origine`r`n" +
        "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
        "Access-Control-Allow-Headers: Content-Type`r`n" +
        "Access-Control-Max-Age: 600`r`n" +
        "Vary: Origin`r`n" +
        "Connection: close`r`n`r`n"
    $e = [Text.Encoding]::ASCII.GetBytes($entete)
    $flux.Write($e, 0, $e.Length)
    if ($corps.Length -gt 0) { $flux.Write($corps, 0, $corps.Length) }
    $flux.Flush()
}

# Fichier statique du dossier app\ (la page elle-meme). Refuse tout chemin hors de ce dossier.
function Servir-Fichier($flux, [string]$chemin) {
    $relatif = [Uri]::UnescapeDataString(($chemin -split '\?')[0]).TrimStart('/')
    if ($relatif -eq '') { $relatif = 'index.html' }
    $complet = [IO.Path]::GetFullPath((Join-Path $dossierApp $relatif))
    $ext = [IO.Path]::GetExtension($complet).ToLower()
    $code = 200
    if (-not $complet.StartsWith($dossierApp + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $complet -PathType Leaf) -or -not $typesMime.ContainsKey($ext)) {
        $code = 404
        $corps = [Text.Encoding]::UTF8.GetBytes('Introuvable')
        $type = 'text/plain; charset=utf-8'
    } else {
        $corps = [IO.File]::ReadAllBytes($complet)
        $type = $typesMime[$ext]
    }
    $entete = "HTTP/1.1 $code $($statuts[$code])`r`n" +
        "Content-Type: $type`r`n" +
        "Content-Length: $($corps.Length)`r`n" +
        "Cache-Control: no-store`r`n" +
        "Connection: close`r`n`r`n"
    $e = [Text.Encoding]::ASCII.GetBytes($entete)
    $flux.Write($e, 0, $e.Length)
    if ($corps.Length -gt 0) { $flux.Write($corps, 0, $corps.Length) }
    $flux.Flush()
}

# --- Choix des modeles pendant la session ---
$dossierRessources = Join-Path $racine 'ressources'
$llmActif = ''
if ($env:LLM_ACTIF) { $llmActif = Split-Path $env:LLM_ACTIF -Leaf }

# Fichiers proposes : modeles de redaction (*.gguf sauf mmproj) et de transcription (ggml*.bin).
function Lister-Modeles([string]$motif, [string]$exclure) {
    $liste = @()
    foreach ($f in (Get-ChildItem -Path $dossierRessources -Filter $motif -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
        if ($exclure -and $f.Name -like $exclure) { continue }
        $liste += @{ nom = $f.Name; taille_mo = [int]($f.Length / 1MB) }
    }
    return ,$liste
}

function Parametre([string]$chemin, [string]$nom) {
    if ($chemin -match "[?&]$nom=([^&]*)") { return [Uri]::UnescapeDataString($Matches[1]) }
    return ''
}

# Arrete llamafile : processus qui ecoute sur le port du modele, sinon par nom d'executable.
function Arreter-LLM {
    $arretes = @()
    try {
        foreach ($c in (Get-NetTCPConnection -LocalPort ([int]$env:PORT) -State Listen -ErrorAction Stop)) {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) { $arretes += "$($proc.ProcessName) ($($proc.Id))"; Stop-Process -Id $proc.Id -Force }
        }
    } catch {}
    $nomExe = [IO.Path]::GetFileNameWithoutExtension($env:LLAMAFILE)
    foreach ($proc in (Get-Process -Name $nomExe -ErrorAction SilentlyContinue)) {
        $arretes += "$($proc.ProcessName) ($($proc.Id))"; Stop-Process -Id $proc.Id -Force
    }
    Noter "arret du modele de redaction : $($arretes -join ', ')"
}

# Relance llamafile avec un autre modele (meme commande que Demarrer.bat, via scripts\serveur.bat).
function Charger-LLM([string]$nom) {
    $mmproj = ''
    if ($env:MODELE_2B -and $nom -eq (Split-Path $env:MODELE_2B -Leaf)) { $mmproj = $env:MMPROJ_2B }
    elseif ($env:MODELE_4B -and $nom -eq (Split-Path $env:MODELE_4B -Leaf)) { $mmproj = $env:MMPROJ_4B }
    elseif (Test-Path (Join-Path $dossierRessources "mmproj-$nom")) { $mmproj = "ressources\mmproj-$nom" }
    Arreter-LLM
    Start-Sleep -Seconds 1
    $env:LLM_ACTIF = "ressources\$nom"
    $env:MMPROJ_ACTIF = $mmproj
    Remove-Item (Join-Path $journal 'serveur.log') -ErrorAction SilentlyContinue
    $cmd = $env:ComSpec
    if (-not $cmd) { $cmd = 'cmd.exe' }
    Start-Process -FilePath $cmd -ArgumentList '/c', 'scripts\serveur.bat' -WorkingDirectory $racine -WindowStyle Minimized
    Noter "chargement du modele de redaction : $nom (images : $mmproj)"
}

# --- Reglages et personnalisation (ressources\, jamais touche par les mises a jour) ---
$fichierReglages = Join-Path $dossierRessources 'reglages.json'
$reglagesDefaut = Join-Path $dossierApp 'reglages-defaut.json'
$dossierPrompts = Join-Path $dossierApp 'prompts'
$dossierPromptsPerso = Join-Path $dossierRessources 'prompts'

function Texte-Reglages {
    foreach ($f in @($fichierReglages, $reglagesDefaut)) {
        if (Test-Path $f) { return [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) }
    }
    return '{}'
}

function Lire-Reglages {
    try { return (Texte-Reglages | ConvertFrom-Json) } catch { Noter "reglages illisibles : $($_.Exception.Message)"; return $null }
}

function Sans-Accents([string]$texte) {
    $d = $texte.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object Text.StringBuilder
    foreach ($c in $d.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($c) }
    }
    return $sb.ToString()
}

# Modeles de documents : ceux de app\prompts, remplaces ou completes par ressources\prompts.
function Lister-Documents {
    $docs = [ordered]@{}
    foreach ($dossierDoc in @($dossierPrompts, $dossierPromptsPerso)) {
        if (-not (Test-Path $dossierDoc)) { continue }
        foreach ($f in (Get-ChildItem -Path $dossierDoc -Filter '*.txt' -File | Sort-Object Name)) {
            if ($f.Name -eq '_liste.txt') { continue }
            $origine = 'defaut'
            if ($dossierDoc -eq $dossierPromptsPerso) { $origine = 'perso'; if ($docs.Contains($f.Name)) { $origine = 'modifie' } }
            $docs[$f.Name] = @{ fichier = $f.Name; origine = $origine; contenu = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) }
        }
    }
    $liste = @()
    foreach ($nomDoc in ($docs.Keys | Sort-Object)) { $liste += $docs[$nomDoc] }
    return ,$liste
}

function Verifier-NomDocument([string]$nomDoc) {
    if ($nomDoc -notmatch '^[A-Za-z0-9_][A-Za-z0-9_-]*\.txt$' -or $nomDoc -eq '_liste.txt') { throw "nom de fichier refuse : $nomDoc" }
}

function Repondre-Json($flux, [string]$json, [string]$origine) {
    $corps = [Text.Encoding]::UTF8.GetBytes($json)
    $entete = "HTTP/1.1 200 OK`r`n" +
        "Content-Type: application/json; charset=utf-8`r`n" +
        "Content-Length: $($corps.Length)`r`n" +
        "Cache-Control: no-store`r`n" +
        "Access-Control-Allow-Origin: $origine`r`n" +
        "Connection: close`r`n`r`n"
    $e = [Text.Encoding]::ASCII.GetBytes($entete)
    $flux.Write($e, 0, $e.Length)
    $flux.Write($corps, 0, $corps.Length)
    $flux.Flush()
}

# --- Donnees conservees (dossier donnees\ sur le disque chiffre, jamais sur le poste) ---
# archives\AAAA-MM-JJ\*.json : documents produits ; patients\<id>.json : dossiers de synthese ;
# anonymisation\<id>.json : tables de correspondance. Chemins construits uniquement a partir de noms valides.
$dossierDonnees = Join-Path $racine 'donnees'
$dossierArchives = Join-Path $dossierDonnees 'archives'
$dossierPatients = Join-Path $dossierDonnees 'patients'
$dossierAnonymisation = Join-Path $dossierDonnees 'anonymisation'
$boite = New-Object System.Collections.ArrayList   # elements envoyes par le capteur (raccourcis clavier)

function Verifier-Motif([string]$valeur, [string]$motif, [string]$quoi) {
    if ($valeur -notmatch $motif) { throw "$quoi refuse : $valeur" }
}

function Ecrire-JsonValide([string]$fichier, [byte[]]$corps, [int]$limiteMo) {
    if ($corps.Length -gt $limiteMo * 1MB) { throw "contenu trop volumineux (plus de $limiteMo Mo)" }
    $null = [Text.Encoding]::UTF8.GetString($corps) | ConvertFrom-Json   # refuse un JSON invalide
    New-Item -ItemType Directory -Force (Split-Path $fichier -Parent) | Out-Null
    [IO.File]::WriteAllBytes($fichier, $corps)
}

function Lire-Fichier([string]$fichier) {
    if (-not (Test-Path $fichier)) { throw 'introuvable' }
    return [IO.File]::ReadAllText($fichier, [Text.Encoding]::UTF8)
}

# Liste des archives (plus recentes d'abord), filtree par type et par texte recherche.
function Lister-Archives([string]$type, [string]$texte) {
    $liste = @()
    if (-not (Test-Path $dossierArchives)) { return ,$liste }
    $fichiers = Get-ChildItem -Path $dossierArchives -Filter '*.json' -File -Recurse | Sort-Object FullName -Descending
    foreach ($f in $fichiers) {
        if ($liste.Count -ge 300) { break }
        $contenu = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
        if ($texte -and $contenu.IndexOf($texte, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        try { $a = $contenu | ConvertFrom-Json } catch { continue }
        if ($type -and $a.type -ne $type) { continue }
        $liste += @{ fichier = "$($f.Directory.Name)/$($f.Name)"; type = $a.type; titre = $a.titre; date = $a.date }
    }
    return ,$liste
}

function Lister-Json([string]$dossierJson, [string[]]$champs) {
    $liste = @()
    if (-not (Test-Path $dossierJson)) { return ,$liste }
    foreach ($f in (Get-ChildItem -Path $dossierJson -Filter '*.json' -File | Sort-Object LastWriteTime -Descending)) {
        $o = @{ id = $f.BaseName; modifie = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
        try {
            $d = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
            foreach ($c in $champs) { $o[$c] = $d.$c }
        } catch {}
        $liste += $o
    }
    return ,$liste
}

# Reponse en flux (une ligne JSON par evenement) pour afficher l'avancement dans la page.
function Ouvrir-Flux($flux, [string]$origine) {
    $entete = "HTTP/1.1 200 OK`r`n" +
        "Content-Type: application/x-ndjson; charset=utf-8`r`n" +
        "Cache-Control: no-store`r`n" +
        "Access-Control-Allow-Origin: $origine`r`n" +
        "Vary: Origin`r`n" +
        "Connection: close`r`n`r`n"
    $e = [Text.Encoding]::ASCII.GetBytes($entete)
    $flux.Write($e, 0, $e.Length)
    $flux.Flush()
}

function Ecrire-Ligne($flux, $objet) {
    $o = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $objet -Compress) + "`n")
    $flux.Write($o, 0, $o.Length)
    $flux.Flush()
}

# Derniere valeur "progress = NN%" ecrite par whisperfile (-pp) sur sa sortie d'erreur.
function Lire-Progression([string]$fichier) {
    try {
        $f = [IO.File]::Open($fichier, 'Open', 'Read', 'ReadWrite')
        try { $texte = (New-Object IO.StreamReader($f)).ReadToEnd() } finally { $f.Close() }
        $m = [regex]::Matches($texte, 'progress =\s*(\d+)%')
        if ($m.Count -gt 0) { return [int]$m[$m.Count - 1].Groups[1].Value }
    } catch {}
    return 0
}

function Transcrire([string]$wav, $flux) {
    $base = Join-Path (Split-Path $wav -Parent) ([IO.Path]::GetFileNameWithoutExtension($wav))
    $txt = "$base.txt"
    $sortie = "$base.sortie"   # la sortie standard contient le texte : jamais dans journal\
    $erreurs = Join-Path $journal 'whisper.log'
    Remove-Item $txt, $sortie, $erreurs -ErrorAction SilentlyContinue
    $dureeAudio = ((Get-Item $wav).Length - 44) / 32000
    # Reglages de la page (ressources\reglages.json) prioritaires sur config.bat.
    $options = $optionsWhisper
    $nbThreads = $threads
    $ctxAdapte = ($env:WHISPER_CTX_ADAPTE -eq '1')
    $prompt = $vocab
    $r = Lire-Reglages
    if ($r -and $r.transcription) {
        $t = $r.transcription
        if ($null -ne $t.rapide) {
            $options = ($options -replace '-bs\s+\d+', '').Trim()
            if ($t.rapide) { $options = "-bs 1 $options" } else { $options = "-bs 5 $options" }
        }
        if ($null -ne $t.fenetre_adaptee) { $ctxAdapte = [bool]$t.fenetre_adaptee }
        if ([int]$t.threads -gt 0) { $nbThreads = [int]$t.threads }
        if ($t.vocabulaire) { $prompt = [string]$t.vocabulaire }
    }
    if ($r -and $r.dictionnaire_transcription) {
        # Les termes corrects du dictionnaire servent aussi de vocabulaire a Whisper.
        $termes = @($r.dictionnaire_transcription | ForEach-Object { $_.ecrit } | Where-Object { $_ } | Select-Object -Unique)
        if ($termes.Count -gt 0) { $prompt = "$prompt " + ($termes -join ', ') + '.' }
    }
    # Sans accents ni guillemets : la ligne de commande n'est pas toujours transmise en UTF-8.
    $prompt = (Sans-Accents $prompt) -replace '"', ''
    if ($prompt.Length -gt 600) { $prompt = $prompt.Substring(0, 600) }
    if ($ctxAdapte) {
        # Fenetre audio reduite a la duree reelle (50 trames par seconde, 1500 = 30 s) : encodage
        # beaucoup plus court pour les dictees breves.
        $ac = [Math]::Min(1500, [Math]::Max(256, [int][Math]::Ceiling($dureeAudio * 50) + 64))
        $options = "$options -ac $ac"
    }
    $arguments = "-m `"$modele`" -f `"$wav`" -l fr -t $nbThreads $options -otxt -of `"$base`" -pp --prompt `"$prompt`""
    $chrono = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $whisper -ArgumentList $arguments -NoNewWindow -PassThru `
        -RedirectStandardError $erreurs -RedirectStandardOutput $sortie
    $null = $p.Handle   # necessaire en PowerShell 5.1 pour lire ExitCode ensuite
    $t100 = $null; $tTexte = $null; $fin = 'sortie du programme'
    try {
        $derniere = -1; $tailleAvant = -1
        while (-not $p.HasExited) {
            Start-Sleep -Milliseconds 300
            $prog = Lire-Progression $erreurs
            if ($prog -ne $derniere) { Ecrire-Ligne $flux @{ progression = $prog }; $derniere = $prog }
            if ($prog -ge 100 -and $null -eq $t100) { $t100 = $chrono.Elapsed.TotalSeconds }
            # Le texte est ecrit des la fin de la transcription ; whisperfile peut ensuite mettre
            # longtemps a se fermer. Fichier present et stable : on n'attend pas la fermeture.
            if (Test-Path $txt) {
                $taille = (Get-Item $txt).Length
                if ($null -eq $tTexte) { $tTexte = $chrono.Elapsed.TotalSeconds }
                if ($taille -eq $tailleAvant -and ($taille -gt 0 -or $prog -ge 100)) { $fin = 'texte pret, programme arrete'; break }
                $tailleAvant = $taille
            }
        }
        if ($p.HasExited) { $p.WaitForExit() }
    } finally {
        # Texte obtenu, ou page fermee / connexion coupee : on arrete whisperfile s'il tourne encore.
        if (-not $p.HasExited) { try { $p.Kill() } catch {} }
        Remove-Item $sortie -ErrorAction SilentlyContinue
        # Journal des durees (aucun texte) pour diagnostiquer les lenteurs.
        $ligne = '{0:yyyy-MM-dd HH:mm:ss}  audio {1:0.0} s  100% a {2:0.0} s  texte a {3:0.0} s  total {4:0.0} s  ({5}, {6} threads, {7}, {8})' -f `
            (Get-Date), $dureeAudio, $t100, $tTexte, $chrono.Elapsed.TotalSeconds, $fin, $nbThreads, $options, (Split-Path $modele -Leaf)
        Add-Content -Path (Join-Path $journal 'dictee.log') -Value $ligne -Encoding Ascii
    }
    if (-not (Test-Path $txt)) { throw "transcription echouee (code $($p.ExitCode), voir journal\whisper.log)" }
    $texte = [IO.File]::ReadAllText($txt, [Text.Encoding]::UTF8)
    Remove-Item $txt -ErrorAction SilentlyContinue
    return $texte.Trim()
}

Noter "whisperfile : $whisper (present : $(Test-Path $whisper)) ; modele present : $(Test-Path $modele) ; $threads threads"
try {
    $ecoute = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
    $ecoute.Start()
} catch {
    Noter "ERREUR : impossible d'ecouter sur le port $port : $($_.Exception.Message)"
    Write-Host "ERREUR : port $port indisponible. Voir journal\passerelle.log"
    Start-Sleep -Seconds 30
    exit 1
}
Noter "en ecoute sur 127.0.0.1:$port"
# PID ecrit seulement une fois le port obtenu (Arreter.bat s'en sert pour fermer la passerelle).
Set-Content -Path (Join-Path $journal 'dictee.pid') -Value $PID -Encoding Ascii
Write-Host "Passerelle de dictee : http://127.0.0.1:$port, $threads threads, options : $optionsWhisper"
Write-Host "Ne pas fermer cette fenetre."

while ($true) {
    $client = $ecoute.AcceptTcpClient()
    $flux = $null
    $nom = $null
    $enFlux = $false
    $origine = $origines[0]
    try {
        $flux = $client.GetStream()
        $flux.ReadTimeout = 30000
        $req = Lire-Requete $flux
        if ($null -eq $req) { continue }
        Noter "$($req.Methode) $(($req.Chemin -split '\?')[0])"
        $orig = $req.Entetes['origin']
        if ($orig) {
            if ($origines -notcontains $orig) { Repondre $flux 403 @{ erreur = 'origine refusee' } $origine; continue }
            $origine = $orig
        }
        $chemin = $req.Chemin
        $route = ($chemin -split '\?')[0]
        if ($req.Methode -eq 'OPTIONS') {
            Repondre $flux 204 $null $origine
        } elseif ($req.Methode -eq 'GET' -and $route -eq '/etat') {
            Repondre $flux 200 @{ ok = $true; whisper = (Test-Path $whisper); modele = (Test-Path $modele); threads = $threads } $origine
        } elseif ($req.Methode -eq 'GET' -and $route -eq '/modeles') {
            Repondre $flux 200 @{
                llm = (Lister-Modeles '*.gguf' 'mmproj*'); llm_actif = $llmActif
                whisper = (Lister-Modeles 'ggml*.bin' ''); whisper_actif = (Split-Path $modele -Leaf)
            } $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/choisir-whisper') {
            $choix = Parametre $chemin 'nom'
            if (-not ((Lister-Modeles 'ggml*.bin' '') | Where-Object { $_.nom -eq $choix })) { throw "modele de transcription inconnu : $choix" }
            $modele = Join-Path $dossierRessources $choix
            Noter "modele de transcription : $choix"
            Repondre $flux 200 @{ ok = $true; whisper_actif = $choix } $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/charger-llm') {
            $choix = Parametre $chemin 'nom'
            if (-not ((Lister-Modeles '*.gguf' 'mmproj*') | Where-Object { $_.nom -eq $choix })) { throw "modele de redaction inconnu : $choix" }
            Charger-LLM $choix
            $llmActif = $choix
            Repondre $flux 200 @{ ok = $true; llm_actif = $choix } $origine
        } elseif ($req.Methode -eq 'GET' -and $route -eq '/reglages') {
            Repondre-Json $flux (Texte-Reglages) $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/reglages') {
            if ($req.Corps.Length -gt 1MB) { throw 'reglages trop volumineux' }
            $texteReglages = [Text.Encoding]::UTF8.GetString($req.Corps)
            $null = $texteReglages | ConvertFrom-Json   # refuse un JSON invalide
            [IO.File]::WriteAllBytes($fichierReglages, $req.Corps)
            Noter "reglages enregistres"
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($req.Methode -eq 'GET' -and $route -eq '/documents') {
            Repondre $flux 200 @{ documents = (Lister-Documents) } $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/documents') {
            $nomDoc = Parametre $chemin 'fichier'
            Verifier-NomDocument $nomDoc
            if ($req.Corps.Length -gt 1MB) { throw 'modele trop volumineux' }
            New-Item -ItemType Directory -Force $dossierPromptsPerso | Out-Null
            [IO.File]::WriteAllBytes((Join-Path $dossierPromptsPerso $nomDoc), $req.Corps)
            Noter "modele de document enregistre : $nomDoc"
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/documents-supprimer') {
            $nomDoc = Parametre $chemin 'fichier'
            Verifier-NomDocument $nomDoc
            Remove-Item (Join-Path $dossierPromptsPerso $nomDoc) -ErrorAction SilentlyContinue
            Noter "modele de document personnel supprime : $nomDoc"
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($route -eq '/archiver' -and $req.Methode -eq 'POST') {
            # ?fichier= : mise a jour d'une archive existante (ex. discussion qui continue)
            $nomArchive = Parametre $chemin 'fichier'
            if ($nomArchive) { Verifier-Motif $nomArchive '^\d{4}-\d{2}-\d{2}/[\w-]+\.json$' 'archive' }
            else {
                $type = (Parametre $chemin 'type') -replace '[^a-z]', ''
                if (-not $type) { $type = 'document' }
                $nomArchive = (Get-Date -Format 'yyyy-MM-dd') + '/' + (Get-Date -Format 'HHmmss-fff') + "-$type.json"
            }
            Ecrire-JsonValide (Join-Path $dossierArchives $nomArchive) $req.Corps 20
            Repondre $flux 200 @{ ok = $true; fichier = $nomArchive } $origine
        } elseif ($route -eq '/archives' -and $req.Methode -eq 'GET') {
            Repondre $flux 200 @{ archives = (Lister-Archives (Parametre $chemin 'type') (Parametre $chemin 'texte')) } $origine
        } elseif ($route -eq '/archive' -and $req.Methode -eq 'GET') {
            $nomArchive = Parametre $chemin 'fichier'
            Verifier-Motif $nomArchive '^\d{4}-\d{2}-\d{2}/[\w-]+\.json$' 'archive'
            Repondre-Json $flux (Lire-Fichier (Join-Path $dossierArchives $nomArchive)) $origine
        } elseif ($route -eq '/archive-supprimer' -and $req.Methode -eq 'POST') {
            $nomArchive = Parametre $chemin 'fichier'
            Verifier-Motif $nomArchive '^\d{4}-\d{2}-\d{2}/[\w-]+\.json$' 'archive'
            Remove-Item (Join-Path $dossierArchives $nomArchive) -ErrorAction SilentlyContinue
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($route -eq '/patients' -and $req.Methode -eq 'GET') {
            Repondre $flux 200 @{ patients = (Lister-Json $dossierPatients @('libelle', 'cree')) } $origine
        } elseif ($route -eq '/patient') {
            $idPatient = Parametre $chemin 'id'
            Verifier-Motif $idPatient '^[A-Za-z0-9_-]{1,64}$' 'dossier'
            $fichierPatient = Join-Path $dossierPatients "$idPatient.json"
            if ($req.Methode -eq 'GET') { Repondre-Json $flux (Lire-Fichier $fichierPatient) $origine }
            else {
                Ecrire-JsonValide $fichierPatient $req.Corps 100
                Repondre $flux 200 @{ ok = $true } $origine
            }
        } elseif ($route -eq '/patient-supprimer' -and $req.Methode -eq 'POST') {
            $idPatient = Parametre $chemin 'id'
            Verifier-Motif $idPatient '^[A-Za-z0-9_-]{1,64}$' 'dossier'
            Remove-Item (Join-Path $dossierPatients "$idPatient.json") -ErrorAction SilentlyContinue
            Noter "dossier patient supprime : $idPatient"
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($route -eq '/correspondances' -and $req.Methode -eq 'GET') {
            Repondre $flux 200 @{ correspondances = (Lister-Json $dossierAnonymisation @('libelle', 'date')) } $origine
        } elseif ($route -eq '/correspondance') {
            $idAnon = Parametre $chemin 'id'
            Verifier-Motif $idAnon '^ANON-\d{8}-\d{6}$' 'identifiant'
            $fichierAnon = Join-Path $dossierAnonymisation "$idAnon.json"
            if ($req.Methode -eq 'GET') { Repondre-Json $flux (Lire-Fichier $fichierAnon) $origine }
            else {
                Ecrire-JsonValide $fichierAnon $req.Corps 5
                Repondre $flux 200 @{ ok = $true } $origine
            }
        } elseif ($route -eq '/boite' -and $req.Methode -eq 'POST') {
            # Envoi du capteur (texte selectionne ou capture d'ecran), conserve jusqu'a lecture par la page.
            $element = [Text.Encoding]::UTF8.GetString($req.Corps) | ConvertFrom-Json
            if ($boite.Count -ge 50) { $boite.RemoveAt(0) }
            [void]$boite.Add(@{ type = [string]$element.type; contenu = [string]$element.contenu; source = [string]$element.source; date = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') })
            Noter "boite : element $($element.type) recu"
            Repondre $flux 200 @{ ok = $true } $origine
        } elseif ($route -eq '/boite' -and $req.Methode -eq 'GET') {
            $elements = @($boite.ToArray())
            $boite.Clear()
            Repondre $flux 200 @{ elements = $elements } $origine
        } elseif ($req.Methode -eq 'POST' -and $route -eq '/transcrire') {
            if ($chemin -match 'fichier=(dictee-[0-9-]+\.wav)') {
                # Nouvel essai sur un enregistrement deja sauvegarde
                $nom = $Matches[1]
                $wav = Join-Path $dossier $nom
                if (-not (Test-Path $wav)) { throw 'enregistrement introuvable' }
            } else {
                if ($req.Corps.Length -lt 1000) { throw 'enregistrement vide' }
                $nom = 'dictee-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.wav'
                $wav = Join-Path $dossier $nom
                [IO.File]::WriteAllBytes($wav, $req.Corps)
            }
            $debut = Get-Date
            Ouvrir-Flux $flux $origine
            $enFlux = $true
            $dureeAudio = [Math]::Round(((Get-Item $wav).Length - 44) / 32000, 1)   # WAV 16 kHz mono 16 bits
            Ecrire-Ligne $flux @{ fichier = $nom; duree_audio = $dureeAudio; threads = $threads }
            $texte = Transcrire $wav $flux
            Ecrire-Ligne $flux @{ texte = $texte; fichier = $nom; duree_audio = $dureeAudio; duree = [Math]::Round(((Get-Date) - $debut).TotalSeconds, 1) }
        } elseif ($req.Methode -eq 'GET') {
            Servir-Fichier $flux $chemin
        } else {
            Repondre $flux 404 @{ erreur = 'adresse inconnue' } $origine
        }
    } catch {
        Noter "erreur : $($_.Exception.Message)"
        if ($null -ne $flux) {
            try {
                if ($enFlux) { Ecrire-Ligne $flux @{ erreur = $_.Exception.Message; fichier = $nom } }
                else { Repondre $flux 500 @{ erreur = $_.Exception.Message; fichier = $nom } $origine }
            } catch {}
        }
    } finally {
        $client.Close()
    }
}
