#!/usr/bin/env bash
set -Eeuo pipefail

SESSION="${WHUSU_SMART_WORKSPACE_TMUX_SESSION:-whusu-smart-workspace-collab}"
REPO_DIR="${WHUSU_SMART_WORKSPACE_REPO_DIR:-/home/ubuntu/whusu-smart-workspace}"
DEPLOY_LOG_DIR="${WHUSU_SMART_WORKSPACE_DEPLOY_LOG_DIR:-/home/ubuntu/whusu-smart-workspace-deploy/logs}"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux 会话已存在: $SESSION"
  exit 0
fi

mkdir -p "$DEPLOY_LOG_DIR"
tmux new-session -d -s "$SESSION" -n shell -c "$REPO_DIR"
tmux set-option -t "$SESSION" history-limit 50000
tmux set-option -t "$SESSION" remain-on-exit on
tmux new-window -t "$SESSION" -n api-log -c "$REPO_DIR" "pm2 logs whusu-smart-workspace-api --lines 120 --raw"
tmux new-window -t "$SESSION" -n worker-log -c "$REPO_DIR" "pm2 logs whusu-smart-workspace-notification-worker --lines 120 --raw"
tmux new-window -t "$SESSION" -n deploy-log -c "$REPO_DIR" "while true; do latest=\$(find '$DEPLOY_LOG_DIR' -maxdepth 1 -type f -name 'deploy-*.log' 2>/dev/null | sort | tail -n 1); if [[ -n \"\$latest\" ]]; then tail -n 120 -F \"\$latest\"; else echo '等待首份部署日志'; sleep 5; fi; done"
tmux new-window -t "$SESSION" -n health -c "$REPO_DIR" "while true; do clear; date; printf 'local: '; curl --silent --show-error --max-time 4 http://127.0.0.1:3000/api/health || true; printf '\npublic: '; curl --silent --show-error --max-time 8 https://accumulation93.com/api/health || true; printf '\n'; pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s||'[]')) if(p.name.startsWith('whusu-smart-workspace-')) console.log(p.name+': '+p.pm2_env.status)})\"; sleep 10; done"
tmux select-window -t "$SESSION:shell"
echo "tmux 会话已创建: $SESSION"
