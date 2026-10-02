# Passerelle de dictee : recoit l'audio enregistre par la page (WAV 16 kHz mono), l'enregistre
# dans dictees\, le transcrit avec whisperfile et renvoie le texte en JSON.
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
$origines = @("http://127.0.0.1:$($env:PORT)", "http://localhost:$($env:PORT)")
$dossier = Join-Path $racine 'dictees'
$journal = Join-Path $racine 'journal'
New-Item -ItemType Directory -Force $dossier, $journal | Out-Null
Set-Content -Path (Join-Path $journal 'dictee.pid') -Value $PID -Encoding Ascii

# Vitesse : nombre de threads (defaut : coeurs physiques) et options de decodage (-bs 1 = glouton, rapide).
$threads = 0
if ($env:WHISPER_THREADS) { $threads = [int]$env:WHISPER_THREADS }
if ($threads -le 0) {
    try { $threads = [int](Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum } catch { $threads = 0 }
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
    if ($null -ne $objet) { $json = ConvertTo-Json -InputObject $objet -Compress }
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

# Derniere valeur « progress = NN% » ecrite par whisperfile (-pp) sur sa sortie d'erreur.
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
    $arguments = "-m `"$modele`" -f `"$wav`" -l fr -t $threads $optionsWhisper -otxt -of `"$base`" -np -pp --prompt `"$vocab`""
    $p = Start-Process -FilePath $whisper -ArgumentList $arguments -NoNewWindow -PassThru `
        -RedirectStandardError $erreurs -RedirectStandardOutput $sortie
    $null = $p.Handle   # necessaire en PowerShell 5.1 pour lire ExitCode ensuite
    try {
        $derniere = -1
        while (-not $p.HasExited) {
            Start-Sleep -Milliseconds 400
            $prog = Lire-Progression $erreurs
            if ($prog -ne $derniere) { Ecrire-Ligne $flux @{ progression = $prog }; $derniere = $prog }
        }
        $p.WaitForExit()
    } finally {
        # Page fermee ou connexion coupee : on arrete la transcription en cours.
        if (-not $p.HasExited) { $p.Kill() }
        Remove-Item $sortie -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $txt)) { throw "transcription echouee (code $($p.ExitCode), voir journal\whisper.log)" }
    $texte = [IO.File]::ReadAllText($txt, [Text.Encoding]::UTF8)
    Remove-Item $txt -ErrorAction SilentlyContinue
    return $texte.Trim()
}

$ecoute = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$ecoute.Start()
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
        $orig = $req.Entetes['origin']
        if ($orig) {
            if ($origines -notcontains $orig) { Repondre $flux 403 @{ erreur = 'origine refusee' } $origine; continue }
            $origine = $orig
        }
        $chemin = $req.Chemin
        if ($req.Methode -eq 'OPTIONS') {
            Repondre $flux 204 $null $origine
        } elseif ($req.Methode -eq 'GET' -and $chemin -like '/etat*') {
            Repondre $flux 200 @{ ok = $true; whisper = (Test-Path $whisper); modele = (Test-Path $modele); threads = $threads } $origine
        } elseif ($req.Methode -eq 'POST' -and $chemin -like '/transcrire*') {
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
        } else {
            Repondre $flux 404 @{ erreur = 'adresse inconnue' } $origine
        }
    } catch {
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
