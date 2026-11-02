#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEPLOY_DIR="${WHUSU_SMART_WORKSPACE_DEPLOY_DIR:-/home/ubuntu/whusu-smart-workspace-deploy}"
CURRENT_LINK="${WHUSU_SMART_WORKSPACE_CURRENT_LINK:-/home/ubuntu/whusu-smart-workspace-current}"
[[ -d "$DEPLOY_DIR" && -f "$CURRENT_LINK/server/scripts/authorizationDeployment.js" ]] || exit 64
case "${1:-}" in stage|activate|status) ;; *) exit 64 ;; esac
# 与正常发布共用锁，禁止在两次进程核对之间切换release。
exec 9>"$DEPLOY_DIR/deploy.lock"
flock -n 9 || exit 75
exec node "$CURRENT_LINK/server/scripts/authorizationDeployment.js" "$@"
