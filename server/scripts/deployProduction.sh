#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
BRANCH="${REDSU_DEPLOY_BRANCH:-feature/audit}"
REPO_DIR="${REDSU_REPO_DIR:-/home/ubuntu/redsu_scoring}"
RELEASES_DIR="${REDSU_RELEASES_DIR:-/home/ubuntu/redsu_releases}"
CURRENT_LINK="${REDSU_CURRENT_LINK:-/home/ubuntu/redsu_current}"
SHARED_DIR="${REDSU_SHARED_DIR:-/home/ubuntu/redsu_shared}"
DEPLOY_DIR="${REDSU_DEPLOY_DIR:-/home/ubuntu/redsu_deploy}"
STATE_DIR="$DEPLOY_DIR/state"
LOG_DIR="$DEPLOY_DIR/logs"
BACKUP_DIR="$DEPLOY_DIR/backups"
MAINTENANCE_FLAG="${REDSU_MAINTENANCE_FLAG:-/var/lib/redsu-deploy/maintenance.flag}"
LOCK_FILE="$DEPLOY_DIR/deploy.lock"
DRAIN_SECONDS="${REDSU_DRAIN_SECONDS:-35}"
PUBLIC_HEALTH_URL="${REDSU_PUBLIC_HEALTH_URL:-https://accumulation93.com/api/health}"
RELEASE_KEEP_COUNT="${REDSU_RELEASE_KEEP_COUNT:-5}"

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "部署 SHA 必须是 40 位小写十六进制" >&2
  exit 64
fi

mkdir -p "$RELEASES_DIR" "$SHARED_DIR" "$STATE_DIR" "$LOG_DIR" "$BACKUP_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S)-${TARGET_SHA:0:12}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "已有生产部署正在执行，本次提交交由后续任务处理"
  exit 75
fi

STARTED_AT="$(date +%s)"
OLD_RELEASE=""
OLD_SHA=""
NEW_RELEASE="$RELEASES_DIR/$TARGET_SHA"
SNAPSHOT=""
MAINTENANCE_ACTIVE=0
MIGRATION_STARTED=0
RELEASE_SWITCHED=0
WORKER_STOPPED=0

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

atomic_link() {
  local target="$1"
  local temporary="$CURRENT_LINK.next.$$"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$CURRENT_LINK"
}

read_port() {
  node -e "require('dotenv').config({path:process.argv[1]});process.stdout.write(process.env.PORT||'3000')" "$SHARED_DIR/server.env"
}

wait_for_health() {
  local port="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 4 "http://127.0.0.1:${port}/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

reload_release() {
  local root="$1"
  REDSU_SERVER_ROOT="$CURRENT_LINK/server" pm2 startOrReload "$root/server/ecosystem.config.js" --only redsu-scoring --update-env
  REDSU_SERVER_ROOT="$CURRENT_LINK/server" pm2 startOrReload "$root/server/ecosystem.config.js" --only redsu-notification-worker --update-env
}

rollback() {
  local failed_line="$1"
  trap - ERR
  set +e
  log "部署在第 ${failed_line} 行失败，开始自动恢复"
  if [[ "$MIGRATION_STARTED" -eq 1 && -n "$SNAPSHOT" && -f "$SNAPSHOT" ]]; then
    log "停止 API 与通知 Worker，释放数据库连接"
    pm2 stop redsu-scoring >/dev/null 2>&1 || true
    pm2 stop redsu-notification-worker >/dev/null 2>&1 || true
    log "恢复部署前数据库快照"
    node "$NEW_RELEASE/server/scripts/deploymentDatabase.js" restore "$SNAPSHOT"
  fi
  if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    log "切回旧版本 $OLD_SHA"
    atomic_link "$OLD_RELEASE"
    reload_release "$OLD_RELEASE"
    local port
    port="$(read_port)"
    if wait_for_health "$port"; then
      if [[ "$MAINTENANCE_ACTIVE" -eq 1 ]]; then rm -f "$MAINTENANCE_FLAG"; fi
      log "旧版本和数据库恢复成功"
    else
      log "旧版本健康检查仍失败，保留维护状态"
      touch "$MAINTENANCE_FLAG"
    fi
  else
    log "未找到可回退的旧 release，保留维护状态"
    touch "$MAINTENANCE_FLAG"
  fi
  if [[ -d "$NEW_RELEASE" && "$NEW_RELEASE" != "$OLD_RELEASE" ]]; then
    git -C "$REPO_DIR" worktree remove --force "$NEW_RELEASE" >/dev/null 2>&1 || true
  fi
  exit 1
}

trap 'rollback "$LINENO"' ERR

log "开始部署 $TARGET_SHA"
[[ -d "$REPO_DIR/.git" ]] || { log "远端仓库不存在"; exit 1; }
[[ -f "$SHARED_DIR/server.env" ]] || { log "共享 server.env 不存在"; exit 1; }
if [[ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]]; then
  log "远端仓库存在已跟踪修改，拒绝覆盖"
  exit 1
fi

if [[ -L "$CURRENT_LINK" ]]; then
  OLD_RELEASE="$(readlink -f "$CURRENT_LINK")"
  OLD_SHA="$(basename "$OLD_RELEASE")"
fi

git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
REMOTE_SHA="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"
if [[ "$REMOTE_SHA" != "$TARGET_SHA" ]]; then
  log "提交已被更新的分支头替代，跳过过期部署：当前 $REMOTE_SHA"
  exit 0
fi
git -C "$REPO_DIR" switch "$BRANCH"
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
[[ "$(git -C "$REPO_DIR" rev-parse HEAD)" == "$TARGET_SHA" ]] || { log "拉取结果与目标 SHA 不一致"; exit 1; }

if [[ -n "$OLD_SHA" && "$OLD_SHA" =~ ^[0-9a-f]{40}$ ]] && git -C "$REPO_DIR" diff --quiet "$OLD_SHA" "$TARGET_SHA" -- server; then
  printf '%s\n' "$TARGET_SHA" > "$STATE_DIR/repository_sha"
  log "服务端目录未变化，仅同步远端仓库"
  exit 0
fi

if [[ -e "$NEW_RELEASE" ]]; then
  [[ "$NEW_RELEASE" != "$OLD_RELEASE" ]] || { log "目标版本已经在运行"; exit 0; }
  git -C "$REPO_DIR" worktree remove --force "$NEW_RELEASE"
fi
git -C "$REPO_DIR" worktree add --detach "$NEW_RELEASE" "$TARGET_SHA"
ln -s "$SHARED_DIR/server.env" "$NEW_RELEASE/server/.env"

log "安装锁定的生产依赖"
npm --prefix "$NEW_RELEASE/server" ci --omit=dev --no-audit --no-fund
log "执行发布前语法与自动化检查"
while IFS= read -r -d '' file; do node --check "$file"; done < <(find "$NEW_RELEASE/server" -path '*/node_modules' -prune -o -name '*.js' -type f -print0)
node "$NEW_RELEASE/server/test/deploymentAutomation.test.js"

PLAN_JSON="$(node "$NEW_RELEASE/server/scripts/runDeploymentMigrations.js" plan | tail -n 1)"
PENDING_COUNT="$(printf '%s' "$PLAN_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(String(JSON.parse(s).pendingCount)))")"
if [[ "$PENDING_COUNT" -gt 0 ]]; then
  log "检测到 $PENDING_COUNT 个待执行迁移，进入维护状态"
  touch "$MAINTENANCE_FLAG"
  MAINTENANCE_ACTIVE=1
  pm2 stop redsu-notification-worker || true
  WORKER_STOPPED=1
  sleep "$DRAIN_SECONDS"
  SNAPSHOT="$BACKUP_DIR/pre-${TARGET_SHA}-$(date +%Y%m%d-%H%M%S).sql.gz"
  node "$NEW_RELEASE/server/scripts/deploymentDatabase.js" backup "$SNAPSHOT"
  MIGRATION_STARTED=1
  node "$NEW_RELEASE/server/scripts/runDeploymentMigrations.js" apply --sha "$TARGET_SHA"
fi

log "原子切换服务版本"
atomic_link "$NEW_RELEASE"
RELEASE_SWITCHED=1
reload_release "$NEW_RELEASE"
PORT="$(read_port)"
wait_for_health "$PORT"
curl --fail --silent --show-error --max-time 8 "$PUBLIC_HEALTH_URL" >/dev/null

printf '%s\n' "$TARGET_SHA" > "$STATE_DIR/server_sha"
printf '%s\n' "$TARGET_SHA" > "$STATE_DIR/repository_sha"
if [[ "$MAINTENANCE_ACTIVE" -eq 1 ]]; then
  rm -f "$MAINTENANCE_FLAG"
  MAINTENANCE_ACTIVE=0
fi

mapfile -t RELEASES < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
if [[ "${#RELEASES[@]}" -gt "$RELEASE_KEEP_COUNT" ]]; then
  for release in "${RELEASES[@]:$RELEASE_KEEP_COUNT}"; do
    resolved="$(readlink -f "$release")"
    [[ "$resolved" == "$RELEASES_DIR/"* ]] || continue
    [[ "$resolved" == "$(readlink -f "$CURRENT_LINK")" ]] && continue
    git -C "$REPO_DIR" worktree remove --force "$resolved" || true
  done
fi
git -C "$REPO_DIR" worktree prune

trap - ERR
ELAPSED="$(( $(date +%s) - STARTED_AT ))"
log "部署成功，用时 ${ELAPSED}s，运行版本 $TARGET_SHA"
