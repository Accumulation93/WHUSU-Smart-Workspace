#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "WHUSU Smart Workspace - Full Database Migration"
echo "=========================================="
echo ""
echo "This script runs ALL migrations to bring"
echo "the database to the latest correct state."
echo "All migrations are idempotent — safe to"
echo "run multiple times."
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
DB_NAME="whusu_smart_workspace"

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

# ─── [1/7] test connection ──────────────────────────
echo "[1/7] Testing connection..."
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

# ─── [2/7] verify database ──────────────────────────
echo "[2/7] Verifying database exists..."
if ! run_mysql -e "USE \`$DB_NAME\`;"; then
  echo "[ERROR] Database '$DB_NAME' does not exist. Run setup-local.sh first."
  exit 1
fi
echo "       OK."

# ─── [3/7] run main org_id migration ────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "[3/7] Running main migration (migrate_org_id.sql) ..."
echo "       This may take a while depending on data size."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_org_id.sql" 2>&1; then
  echo "[ERROR] Main migration failed. See errors above."
  echo "       Restore from backup and investigate before retrying."
  exit 1
fi
echo "       OK."

# ─── [4/7] fix permission_id ─────────────────────────
echo "[4/7] Fixing permission_id column (migrate_fix_permission_id.sql) ..."
echo "       Drops legacy FK, makes permission_id nullable."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_fix_permission_id.sql" 2>&1; then
  echo "[ERROR] Permission_id fix failed. See errors above."
  echo "       This is not fatal — you can run migrate_fix_permission_id.sql manually."
else
  echo "       OK."
fi

# ─── [5/7] fix clause_id ─────────────────────────────
echo "[5/7] Fixing clause_id column (migrate_clause_id.sql) ..."
echo "       Adds clause_id, copies from permission_id, drops old FKs."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_clause_id.sql" 2>&1; then
  echo "[ERROR] Clause_id fix failed. See errors above."
  echo "       This is not fatal — you can run migrate_clause_id.sql manually."
else
  echo "       OK."
fi

# ─── [6/7] grade bands migration ─────────────────────
echo "[6/7] Running grade bands migration (migration_grade_bands.sql) ..."
echo "       display_mode → clauses, pub_grade_bands, cascade FKs, orphan cleanup."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migration_grade_bands.sql" 2>&1; then
  echo "[ERROR] Grade bands migration failed. See errors above."
  echo "       This is not fatal — you can run migration_grade_bands.sql manually."
else
  echo "       OK."
fi

# ─── [7/7] audit workflow migration ──────────────────
echo "[7/7] Running audit workflow migration (migrate_audit_workflow.sql) ..."
echo "       Creates audit flow templates, submissions, signatures, stamps tables."

if ! run_mysql "$DB_NAME" < "$SCRIPT_DIR/migrate_audit_workflow.sql" 2>&1; then
  echo "[ERROR] Audit workflow migration failed. See errors above."
  echo "       This is not fatal — you can run migrate_audit_workflow.sql manually."
else
  echo "       OK."
fi

# ─── verify ─────────────────────────────────────────
echo ""
echo "=========================================="
echo "Verifying all migrations..."
echo ""

echo "  Checking org_id columns ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'org_id' ORDER BY TABLE_NAME;" 2>/dev/null || true
echo ""

echo "  Checking is_paused column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'is_paused';" 2>/dev/null || true
echo ""

echo "  Checking allow_self_assessment column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME = 'allow_self_assessment';" 2>/dev/null || true
echo ""

echo "  Checking calculation_method column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND COLUMN_NAME IN ('calculation_method', 'trim_high_count', 'trim_low_count') ORDER BY TABLE_NAME, COLUMN_NAME;" 2>/dev/null || true
echo ""

echo "  Checking history tables removed ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME LIKE '%_history';" 2>/dev/null || true
echo ""

echo "  Checking permission_id / clause_id ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'merit_list_designations' AND COLUMN_NAME IN ('permission_id', 'clause_id') ORDER BY COLUMN_NAME;" 2>/dev/null || true
echo ""

echo "  Checking display_mode column ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'pub_view_rules' AND COLUMN_NAME = 'display_mode';" 2>/dev/null || true
echo ""

echo "  Checking pub_grade_bands table ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'pub_grade_bands';" 2>/dev/null || true
echo ""

echo "  Checking cascade FKs (ON DELETE CASCADE) ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '$DB_NAME' AND TABLE_NAME IN ('pub_view_rule_clauses','pub_merit_rule_clauses','pub_grade_bands','merit_list_designations') ORDER BY TABLE_NAME, CONSTRAINT_NAME;" 2>/dev/null || true
echo ""

echo "  Checking audit tables ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME LIKE 'audit_%' ORDER BY TABLE_NAME;" 2>/dev/null || true
echo ""

echo "  Checking scope_type column (identity approval scope) ..."
run_mysql "$DB_NAME" -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'audit_submission_steps' AND COLUMN_NAME IN ('scope_type','scope_department_id','scope_work_group_id') ORDER BY COLUMN_NAME;" 2>/dev/null || true
echo ""

echo "=========================================="
echo "Migration complete!"
echo "  Database: $DB_NAME"
echo "  Host:Port: $DB_HOST:$DB_PORT"
echo ""
echo "Migrations applied (all idempotent):"
echo "  1. migrate_org_id.sql         — org_id columns, history tables dropped"
echo "  2. migrate_fix_permission_id.sql — permission_id nullable, FK removed"
echo "  3. migrate_clause_id.sql      — clause_id column, old FK cleanup"
echo "  4. migration_grade_bands.sql  — display_mode → clauses, cascade FKs, pub_grade_bands"
echo "  5. migrate_audit_workflow.sql - audit flow: templates, submissions, e-signatures, stamps, scope-based approval"
echo ""
echo "New features:"
echo "  - org-scoped architecture (org_id on all tables)"
echo "  - allow_self_assessment on rate_target_rules"
echo "  - calculation_method / trim configs on clause_template_configs"
echo "  - merit_list_designations uses clause_id (permission_id is legacy)"
echo "  - pub_view_rule_clauses.display_mode (score | grade) per clause"
echo "  - pub_grade_bands table for customizable grade intervals"
echo "  - cascade FKs ensure no zombie records on category deletion"
echo "  - audit workflow: flow templates, e-signatures, stamps, hash-chain verification"
echo "  - scope-based identity approval: same_department, same_work_group, specific_department, specific_work_group"
echo "=========================================="
