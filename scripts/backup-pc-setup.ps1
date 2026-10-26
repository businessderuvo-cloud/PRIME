param([string]$Server = '__PRIME_SERVER__')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
try {
  $answer = [System.Windows.Forms.MessageBox]::Show('Vuoi attivare una copia dei dati PRIME su questo computer? Verranno installati il componente di backup e, se necessario, il runtime ufficiale Node.js nel tuo profilo Windows. La copia sul server resta attiva.', 'PRIME · Copia facoltativa sul PC', 'YesNo', 'Question')
  if ($answer -ne 'Yes') { exit 0 }
  $pairCode = [Microsoft.VisualBasic.Interaction]::InputBox('Incolla il codice di collegamento creato dal titolare nella dashboard PRIME (valido 10 minuti).', 'PRIME · Collega questo computer')
  if ([string]::IsNullOrWhiteSpace($pairCode)) { exit 0 }
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = 'Scegli la cartella in cui conservare le copie cifrate di PRIME'
  $picker.ShowNewFolderButton = $true
  if ($picker.ShowDialog() -ne 'OK') { exit 0 }
  $chosenFolder = $picker.SelectedPath
  $componentRoot = Join-Path $env:LOCALAPPDATA 'PRIME\backup-runtime'
  New-Item -ItemType Directory -Path $componentRoot -Force | Out-Null
  $nodePath = $null
  $installed = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($installed) {
    $major = & $installed.Source -p 'process.versions.node.split(String.fromCharCode(46))[0]'
    if ([int]$major -ge 24) { $nodePath = $installed.Source }
  }
  if (-not $nodePath) {
    $nodePath = Join-Path $componentRoot 'node\node.exe'
    if (-not (Test-Path -LiteralPath $nodePath)) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $manifest = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -UseBasicParsing).Content
      $nodeArchive = [regex]::Match($manifest, '(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-x64\.zip)\s*$')
      if (-not $nodeArchive.Success) { throw 'Non è stato possibile verificare il runtime ufficiale Node.js.' }
      $zipName = $nodeArchive.Groups[2].Value
      $zipFile = Join-Path $componentRoot $zipName
      Invoke-WebRequest ('https://nodejs.org/dist/latest-v24.x/' + $zipName) -OutFile $zipFile -UseBasicParsing
      if ((Get-FileHash -LiteralPath $zipFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nodeArchive.Groups[1].Value) { throw 'Controllo integrità Node.js non riuscito.' }
      Expand-Archive -LiteralPath $zipFile -DestinationPath $componentRoot -Force
      $expanded = Join-Path $componentRoot ($zipName -replace '\.zip$', '')
      # Copy only the verified runtime binary; no global installation or admin rights needed.
      New-Item -ItemType Directory -Path (Join-Path $componentRoot 'node') -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path $expanded 'node.exe') -Destination $nodePath -Force
    }
  }
  $component = Join-Path $componentRoot 'backup-companion.mjs'
  Invoke-WebRequest ($Server + '/backup-companion.mjs') -OutFile $component -UseBasicParsing
  $env:PRIME_PC_SETUP_SERVER = $Server
  $env:PRIME_PC_SETUP_CODE = $pairCode.Trim()
  $env:PRIME_PC_SETUP_FOLDER = $chosenFolder
  & $nodePath $component --setup-ui
  if ($LASTEXITCODE -ne 0) { throw 'Collegamento non completato. Consulta il messaggio nella finestra e riprova con un nuovo codice dalla dashboard.' }
  [System.Windows.Forms.MessageBox]::Show('Copia PC attivata e prima copia verificata. Le successive vengono aggiornate ogni 24 ore, anche con browser chiuso, quando il PC è acceso e il tuo utente Windows è connesso. Puoi disattivare il collegamento dalla dashboard PRIME.', 'PRIME · Backup attivato', 'OK', 'Information') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'PRIME · Configurazione non completata', 'OK', 'Error') | Out-Null
  exit 1
} finally {
  Remove-Item Env:PRIME_PC_SETUP_CODE -ErrorAction SilentlyContinue
  Remove-Item Env:PRIME_PC_SETUP_SERVER -ErrorAction SilentlyContinue
  Remove-Item Env:PRIME_PC_SETUP_FOLDER -ErrorAction SilentlyContinue
}
