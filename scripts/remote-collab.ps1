param(
  [Parameter(Position = 0)]
  [ValidateSet('status', 'attach', 'logs', 'health', 'retry')]
  [string]$Action = 'status',
  [string]$HostAlias = 'whusu-smart-workspace-prod'
)

$ErrorActionPreference = 'Stop'
$repo = 'Accumulation93/WHUSU-Smart-Workspace'

function Invoke-Remote([string]$Command, [switch]$Interactive) {
  $arguments = @()
  if ($Interactive) {
    $arguments += @('-t', $HostAlias, $Command)
  } else {
    $normalizedCommand = $Command.Replace("`r`n", "`n").Replace("`r", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalizedCommand))
    $arguments += @($HostAlias, "echo $encoded | base64 -d | bash")
  }
  & ssh @arguments
  if ($LASTEXITCODE -ne 0) { throw "SSH command failed with exit code $LASTEXITCODE" }
}

switch ($Action) {
  'status' {
    Invoke-Remote "printf 'repo='; git -C /home/ubuntu/whusu-smart-workspace rev-parse --short HEAD; printf 'server='; cat /home/ubuntu/whusu-smart-workspace-deploy/state/server_sha 2>/dev/null || echo legacy; pm2 status --no-color; tmux list-sessions 2>/dev/null || true"
  }
  'attach' {
    Invoke-Remote "tmux has-session -t whusu-smart-workspace-collab && exec tmux attach-session -t whusu-smart-workspace-collab" -Interactive
  }
  'logs' {
    $command = @'
latest=$(find /home/ubuntu/whusu-smart-workspace-deploy/logs -maxdepth 1 -type f -name "deploy-*.log" 2>/dev/null | sort | tail -n 1)
test -n "$latest" && tail -n 200 "$latest" || echo "No deployment logs yet"
'@
    Invoke-Remote $command
  }
  'health' {
    $public = Invoke-RestMethod -Uri 'https://accumulation93.com/api/health' -TimeoutSec 10
    Write-Output ('public=' + ($public | ConvertTo-Json -Compress))
    $command = @'
cd /home/ubuntu/whusu-smart-workspace-current/server
port=$(node -e "require('dotenv').config({path:'.env'});process.stdout.write(process.env.PORT||'3000')")
curl --fail --silent --show-error "http://127.0.0.1:${port}/api/health"
'@
    Invoke-Remote $command
  }
  'retry' {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs?branch=feature%2Faudit&event=push&per_page=1" -Headers @{ 'User-Agent' = 'WHUSU-Smart-Workspace-Remote-Collab' }
    $run = $runs.workflow_runs[0]
    if (!$run -or $run.status -ne 'completed') {
      throw 'Latest feature/audit workflow is not complete; retry is blocked'
    }
    $jobs = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs/$($run.id)/jobs" -Headers @{ 'User-Agent' = 'WHUSU-Smart-Workspace-Remote-Collab' }
    $qualityJob = @($jobs.jobs | Where-Object { $_.name -eq 'audit-and-test' })
    if ($qualityJob.Count -ne 1 -or $qualityJob[0].conclusion -ne 'success') {
      throw 'Latest feature/audit quality job has not passed; retry is blocked'
    }
    Invoke-Remote "/home/ubuntu/whusu-smart-workspace-deploy/bin/deploy-entrypoint $($run.head_sha)"
  }
}
