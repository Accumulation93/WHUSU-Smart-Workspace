#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
BRANCH="${REDSU_DEPLOY_BRANCH:-feature/audit}"
REPO_DIR="${REDSU_REPO_DIR:-/home/ubuntu/redsu_scoring}"

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "部署入口拒绝非法 SHA" >&2
  exit 64
fi

git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
REMOTE_SHA="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"
if [[ "$REMOTE_SHA" != "$TARGET_SHA" ]]; then
  echo "部署入口跳过过期提交：$TARGET_SHA，当前分支头：$REMOTE_SHA"
  exit 0
fi

TEMP_SCRIPT="$(mktemp /tmp/redsu-deploy.XXXXXX.sh)"
cleanup() {
  rm -f "$TEMP_SCRIPT"
}
trap cleanup EXIT

git -C "$REPO_DIR" show "$TARGET_SHA:server/scripts/deployProduction.sh" > "$TEMP_SCRIPT"
bash -n "$TEMP_SCRIPT"
exec bash "$TEMP_SCRIPT" "$TARGET_SHA"
