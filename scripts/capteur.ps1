# Capteur : raccourcis clavier globaux, actifs dans tous les logiciels (DPI, navigateur...).
#  - Ctrl+Alt+T : copie le texte selectionne et l'envoie a l'IA (dossier ouvert de la Synthese patient).
#  - Ctrl+Alt+P : lance l'outil de capture de Windows ; la zone capturee est envoyee a l'IA.
# Les envois passent par la passerelle locale (127.0.0.1). Icone dans la zone de notification.
# Lance par Demarrer.bat (mode complet). Compatible Windows PowerShell 5.1, ASCII uniquement.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$racine = Split-Path $PSScriptRoot -Parent
$journal = Join-Path $racine 'journal'
New-Item -ItemType Directory -Force $journal | Out-Null
$journalCapteur = Join-Path $journal 'capteur.log'
function Noter([string]$message) {
    try { Add-Content -Path $journalCapteur -Value ('{0:HH:mm:ss}  {1}' -f (Get-Date), $message) -Encoding Ascii } catch {}
}

$url = "http://127.0.0.1:$($env:PORT_DICTEE)/boite"
$toucheTexte = if ($env:TOUCHE_TEXTE) { $env:TOUCHE_TEXTE.ToUpper()[0] } else { 'T' }
$toucheImage = if ($env:TOUCHE_IMAGE) { $env:TOUCHE_IMAGE.ToUpper()[0] } else { 'P' }

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Text;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class FenetreRaccourcis : Form {
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modificateurs, uint touche);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int touche);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder texte, int taille);

    public int Dernier = 0;

    public static string TitreFenetreActive() {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(GetForegroundWindow(), sb, 256);
        return sb.ToString();
    }

    protected override void WndProc(ref Message m) {
        if (m.Msg == 0x0312) { Dernier = m.WParam.ToInt32(); }
        base.WndProc(ref m);
    }

    protected override void SetVisibleCore(bool value) { base.SetVisibleCore(false); }
}
"@

function Envoyer([string]$type, [string]$contenu, [string]$source) {
    $json = ConvertTo-Json -InputObject @{ type = $type; contenu = $contenu; source = $source } -Compress
    $octets = [Text.Encoding]::UTF8.GetBytes($json)
    $null = Invoke-WebRequest -Uri $url -Method Post -Body $octets -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 10
}

# Attend que Ctrl, Alt et Maj soient relaches (sinon la copie simulee devient Ctrl+Alt+C).
function Attendre-Relachement {
    $debut = Get-Date
    while ((([FenetreRaccourcis]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0) -or
           (([FenetreRaccourcis]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0) -or
           (([FenetreRaccourcis]::GetAsyncKeyState(0x10) -band 0x8000) -ne 0)) {
        if (((Get-Date) - $debut).TotalSeconds -gt 2) { break }
        Start-Sleep -Milliseconds 30
    }
}

function Bulle([string]$message) {
    $icone.ShowBalloonTip(2500, 'IA locale', $message, [System.Windows.Forms.ToolTipIcon]::Info)
}

function Capturer-Texte {
    $source = [FenetreRaccourcis]::TitreFenetreActive()
    Attendre-Relachement
    [System.Windows.Forms.Clipboard]::Clear()
    [System.Windows.Forms.SendKeys]::SendWait('^c')
    $texte = ''
    for ($i = 0; $i -lt 10 -and -not $texte; $i++) {
        Start-Sleep -Milliseconds 100
        $texte = [System.Windows.Forms.Clipboard]::GetText()
    }
    if (-not $texte.Trim()) { Bulle 'Aucun texte selectionne.'; return }
    Envoyer 'texte' $texte $source
    Noter "texte envoye ($($texte.Length) caracteres)"
    Bulle "Texte envoye a l'IA ($($texte.Length) caracteres)."
}

function Capturer-Image {
    $source = [FenetreRaccourcis]::TitreFenetreActive()
    Attendre-Relachement
    [System.Windows.Forms.Clipboard]::Clear()
    Start-Process 'ms-screenclip:'
    # L'utilisateur selectionne une zone ; l'image arrive dans le presse-papier (60 s maximum).
    $debut = Get-Date
    while (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
        if (((Get-Date) - $debut).TotalSeconds -gt 60) { Bulle 'Capture annulee.'; return }
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 200
    }
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    $flux = New-Object IO.MemoryStream
    $image.Save($flux, [System.Drawing.Imaging.ImageFormat]::Png)
    $donnees = 'data:image/png;base64,' + [Convert]::ToBase64String($flux.ToArray())
    $image.Dispose(); $flux.Dispose()
    Envoyer 'image' $donnees $source
    Noter "capture envoyee ($([int]($donnees.Length / 1024)) Ko)"
    Bulle "Capture d'ecran envoyee a l'IA."
}

# --- Fenetre invisible, raccourcis et icone de notification ---
$fenetre = New-Object FenetreRaccourcis
$null = $fenetre.Handle
$MOD = 0x0001 -bor 0x0002 -bor 0x4000   # Alt + Ctrl, sans repetition
$okTexte = [FenetreRaccourcis]::RegisterHotKey($fenetre.Handle, 1, $MOD, [uint32][char]$toucheTexte)
$okImage = [FenetreRaccourcis]::RegisterHotKey($fenetre.Handle, 2, $MOD, [uint32][char]$toucheImage)
Noter "----- demarrage : Ctrl+Alt+$toucheTexte (texte) $okTexte, Ctrl+Alt+$toucheImage (capture) $okImage"
Set-Content -Path (Join-Path $journal 'capteur.pid') -Value $PID -Encoding Ascii

$icone = New-Object System.Windows.Forms.NotifyIcon
$icone.Icon = [System.Drawing.SystemIcons]::Information
$icone.Text = "IA locale : Ctrl+Alt+$toucheTexte texte, Ctrl+Alt+$toucheImage capture"
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$null = $menu.Items.Add('Arreter les raccourcis', $null, { [System.Windows.Forms.Application]::Exit() })
$icone.ContextMenuStrip = $menu
$icone.Visible = $true
if (-not ($okTexte -and $okImage)) { Bulle "Raccourci deja utilise par un autre logiciel : voir journal\capteur.log" }

$minuterie = New-Object System.Windows.Forms.Timer
$minuterie.Interval = 100
$minuterie.Add_Tick({
    $id = $fenetre.Dernier
    if ($id -eq 0) { return }
    $fenetre.Dernier = 0
    $minuterie.Stop()
    try {
        if ($id -eq 1) { Capturer-Texte } elseif ($id -eq 2) { Capturer-Image }
    } catch {
        Noter "erreur : $($_.Exception.Message)"
        Bulle "Envoi impossible (l'IA est-elle lancee ?)."
    } finally { $minuterie.Start() }
})
$minuterie.Start()

try { [System.Windows.Forms.Application]::Run() }
finally {
    [void][FenetreRaccourcis]::UnregisterHotKey($fenetre.Handle, 1)
    [void][FenetreRaccourcis]::UnregisterHotKey($fenetre.Handle, 2)
    $icone.Visible = $false
    $icone.Dispose()
}
