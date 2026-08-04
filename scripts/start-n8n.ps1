$runtime = 'D:\vscod\n8n-runtime'
$envFile = Join-Path $runtime '.env'

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*?)\s*$') {
      Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
    }
  }
}

& (Join-Path $runtime 'node_modules\.bin\n8n.cmd') start
