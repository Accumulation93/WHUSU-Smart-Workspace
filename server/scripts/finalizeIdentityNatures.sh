#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DEPLOY_DIR="${WHUSU_SMART_WORKSPACE_DEPLOY_DIR:-/home/ubuntu/whusu-smart-workspace-deploy}"
CURRENT_LINK="${WHUSU_SMART_WORKSPACE_CURRENT_LINK:-/home/ubuntu/whusu-smart-workspace-current}"
[[ -d "$DEPLOY_DIR" && -f "$CURRENT_LINK/server/scripts/finalizeIdentityNatures.js" ]] || exit 64
exec 9>"$DEPLOY_DIR/deploy.lock"
flock -n 9 || exit 75
exec node "$CURRENT_LINK/server/scripts/finalizeIdentityNatures.js" "$@"
