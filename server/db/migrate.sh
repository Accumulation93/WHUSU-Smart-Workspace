#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "REDSU Scoring - org_id Migration"
echo "=========================================="
echo ""
echo "WARNING: This script migrates the database"
echo "from the old history-table architecture to"
echo "the new org_id column architecture."
echo ""
echo "MAKE SURE you have backed up the database"
echo "before proceeding!"
echo ""
read -rp "Press Enter to continue, Ctrl+C to cancel..."

# ─── auto-detect mysql ──────────────────────────────
detect_mysql() {
  if command -v mysql &>/dev/null; then
    echo "[INFO] Found mysql in PATH"
    return 0
  fi

  local search_paths=(
    /usr/bin/mysql
    /usr/local/bin/mysql
    /usr/local/mysql/bin/mysql
    /opt/mysql/bin/mysql
    /usr/local/opt/mysql-client/bin/mysql
    /opt/homebrew/bin/mysql
  )
  for candidate in "${search_paths[@]}"; do
    if [[ -x "$candidate" ]]; then
      MYSQL_BIN="$candidate"
      echo "[INFO] Found mysql at $MYSQL_BIN"
      return 0
    fi
  done

  return 1
}

MYSQL_BIN=""
if ! detect_mysql; then
  echo "[ERROR] MySQL client not found."
  echo "Install mysql-client (apt install mysql-client / yum install mysql / brew install mysql-client)"
  echo "or add mysql to PATH and retry."
  exit 1
fi

run_mysql() {
  local mysql_cmd="${MYSQL_BIN:-mysql}"
  if [ -z "$DB_PASS" ]; then
    "$mysql_cmd" -u "$DB_USER" -h "$DB_HOST" -P "$DB_PORT" --connect-timeout=10 "$@"
  else
    "$mysql_cmd" -u "$DB_USER" -p"$DB_PASS" -h "$DB_HOST" -P "$DB_PORT" --connect-timeout=10 "$@"
  fi
}

# ─── config ─────────────────────────────────────────
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_USER="root"
DB_PASS=""
DB_NAME="redsu_scoring"

read -rp "Host     [$DB_HOST]: " input; DB_HOST="${input:-$DB_HOST}"
read -rp "Port     [$DB_PORT]: " input; DB_PORT="${input:-$DB_PORT}"
read -rp "User     [$DB_USER]: " input; DB_USER="${input:-$DB_USER}"
read -rsp "Password []: " DB_PASS; echo ""
read -rp "Database [$DB_NAME]: " input; DB_NAME="${input:-$DB_NAME}"

echo ""
echo "=========================================="
echo "Connecting: $DB_USER@$DB_HOST:$DB_PORT  ->  $DB_NAME"
echo "=========================================="
echo ""

# ─── [1/5] test connection ──────────────────────────
echo "[1/5] Testing connection..."
if ! run_mysql -e "SELECT 1 AS test;"; then
  echo ""
  echo "[ERROR] Cannot connect. Check host / port / user / password."
  echo "       Common causes:"
  echo "       - MySQL not listening on $DB_HOST:$DB_PORT (check bind-address, skip-networking)"
  echo "       - Firewall blocking port $DB_PORT"
  echo "       - User '$DB_USER' lacks remote access (check mysql.user Host column)"
  echo "       - Password contains special shell characters (use single quotes around it)"
  echo "       - SSL/TLS required by server (add --ssl-mode=REQUIRED or --ssl-ca=...)"
  exit 1
fi
echo "       OK."

# ─── [2/5] verify database ──────────────────────────
echo "[2/5] Verifying database exists..."
if ! run_mysql -e "USE \`$DB_NAME\`;"; then
  echo "[ERROR] Database '$DB_NAME' does not exist. Run setup-local.sh first."
  exit 1
fi
echo "       OK."

# ─── [3/5] run migration ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "[3/5] Running main migration (migrate_org_id.sql) ..."
echo "       This may take a while depending on data size."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_org_id.sql" 2>&1; then
  echo "[ERROR] Migration failed. See errors above."
  echo "       Restore from backup and investigate before retrying."
  exit 1
fi
echo "       OK."

# ─── [4/5] fix permission_id ─────────────────────────
echo "[4/5] Fixing permission_id column (migrate_fix_permission_id.sql) ..."
echo "       Drops legacy FK, makes permission_id nullable."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_fix_permission_id.sql" 2>&1; then
  echo "[ERROR] Permission_id fix failed. See errors above."
  echo "       This is not fatal — you can run migrate_fix_permission_id.sql manually."
else
  echo "       OK."
fi

# ─── [5/5] verify ───────────────────────────────────
echo "[5/5] Verifying migration..."
echo "       Checking org_id columns ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'org_id' ORDER BY TABLE_NAME;" 2>/dev/null || true
echo ""
echo "       Checking is_paused column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'is_paused';" 2>/dev/null || true
echo ""
echo "       Checking allow_self_assessment column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'allow_self_assessment';" 2>/dev/null || true
echo ""
echo "       Checking calculation_method column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME IN ('calculation_method', 'trim_high_count', 'trim_low_count') ORDER BY TABLE_NAME, COLUMN_NAME;" 2>/dev/null || true
echo ""
echo "       Checking history tables removed ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME LIKE '%_history';" 2>/dev/null || true
echo ""
echo "       Checking permission_id nullable ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'merit_list_designations' AND COLUMN_NAME IN ('permission_id', 'clause_id') ORDER BY COLUMN_NAME;" 2>/dev/null || true
echo ""

echo "=========================================="
echo "Migration complete!"
echo "  Database: $DB_NAME"
echo "  Host:Port: $DB_HOST:$DB_PORT"
echo ""
echo "New features added:"
echo "  - rate_target_rules.allow_self_assessment (default 1)"
echo "  - clause_template_configs.calculation_method (default weighted_average)"
echo "  - clause_template_configs.trim_high_count / trim_low_count (default 0)"
echo ""
echo "The 16 history tables have been dropped."
echo "All org-scoped tables now use org_id column."
echo "Switching organizations no longer requires"
echo "data migration - it updates system_config only."
echo ""
echo "merit_list_designations:"
echo "  - clause_id is the active reference (FK → pub_merit_rule_clauses)"
echo "  - permission_id is now nullable (legacy, no FK)"
echo "=========================================="
