# Detecte les micros via ffmpeg et enregistre le choix dans micro.txt (racine IA).
$racine = Split-Path $PSScriptRoot -Parent
$ff = Join-Path $racine "outils\ffmpeg.exe"
if (-not (Test-Path $ff)) { Write-Host "ffmpeg.exe introuvable dans outils\"; pause; exit }

$sortie = & $ff -hide_banner -list_devices true -f dshow -i dummy 2>&1 | Out-String
$lignes = $sortie -split "`r?`n"

$audio = @(); $section = ""
foreach ($l in $lignes) {
    if ($l -match 'DirectShow video devices') { $section = "video"; continue }
    if ($l -match 'DirectShow audio devices') { $section = "audio"; continue }
    if ($l -match '"([^"]+)"') {
        $nom = $Matches[1]
        if ($nom -like '@device*') { continue }
        if ($section -eq "audio" -or $l -match '\(audio\)') { $audio += $nom }
    }
}
$audio = @($audio | Where-Object { $_ -notmatch 'Mixage|Stereo Mix' } | Select-Object -Unique)

if ($audio.Count -eq 0) { Write-Host "Aucun micro detecte."; pause; exit }

if ($audio.Count -eq 1) {
    $choix = $audio[0]
} else {
    Write-Host "`nMicrophones detectes :`n"
    for ($i = 0; $i -lt $audio.Count; $i++) { Write-Host "  [$i] $($audio[$i])" }
    $n = Read-Host "`nNumero du micro a utiliser"
    $choix = $audio[[int]$n]
}

[System.IO.File]::WriteAllText(
    (Join-Path $racine "micro.txt"), $choix,
    (New-Object System.Text.UTF8Encoding $false))
Write-Host "`nMicro enregistre : $choix"
