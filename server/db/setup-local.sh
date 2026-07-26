#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "WHUSU Smart Workspace - Local MySQL Setup"
echo "=========================================="
echo ""

# ---------- Auto-detect MySQL client ----------
if command -v mysql &>/dev/null; then
  true  # already in PATH
else
  FOUND=""
  for candidate in \
    /usr/bin/mysql \
    /usr/local/mysql/bin/mysql \
    /opt/homebrew/bin/mysql \
    /usr/local/bin/mysql; do
    if [ -x "$candidate" ]; then
      dir="$(dirname "$candidate")"
      export PATH="$dir:$PATH"
      FOUND=1
      echo "[INFO] Found MySQL at $candidate"
      break
    fi
  done
  if [ -z "$FOUND" ]; then
    echo "[ERROR] MySQL client not found."
    echo "Please install MySQL 8.0+ or add mysql to PATH."
    echo "  Debian/Ubuntu: sudo apt install mysql-client"
    echo "  RHEL/CentOS:   sudo dnf install mysql"
    echo "  macOS:         brew install mysql-client"
    exit 1
  fi
fi

# ---------- Connection parameters ----------
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASS=""
DB_NAME="whusu_smart_workspace"

read -p "Host     [localhost]: " input
DB_HOST="${input:-$DB_HOST}"

read -p "Port     [3306]: " input
DB_PORT="${input:-$DB_PORT}"

read -p "User     [root]: " input
DB_USER="${input:-$DB_USER}"

read -s -p "Password []: " input
echo ""
DB_PASS="$input"

read -p "Database [whusu_smart_workspace]: " input
DB_NAME="${input:-$DB_NAME}"

# Build password argument (empty password → no -p flag)
if [ -z "$DB_PASS" ]; then
  MYSQL_CMD="mysql -u $DB_USER -h $DB_HOST -P $DB_PORT"
else
  MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS -h $DB_HOST -P $DB_PORT"
fi

echo ""
echo "=========================================="
echo "Connecting: $DB_USER@$DB_HOST:$DB_PORT  ->  $DB_NAME"
echo "=========================================="
echo ""

# ---------- [1/5] Test connection ----------
echo "[1/5] Testing connection..."
if ! $MYSQL_CMD -e "SELECT 1 AS test;" 2>/dev/null; then
  echo "[ERROR] Cannot connect. Check host / port / user / password."
  exit 1
fi
echo "       OK."

# ---------- [2/5] Create database ----------
echo "[2/5] Creating database..."
$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to create database '$DB_NAME'. Check permissions."
  exit 1
fi
echo "       OK."

echo "       Creating tables..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if $MYSQL_CMD "$DB_NAME" < "$SCRIPT_DIR/init.sql" 2>&1; then
  echo "       OK."
else
  echo "[WARN] init.sql finished with errors (see above). Some tables may already exist."
  echo "       Continuing with remaining steps..."
fi

# ---------- [3/5] Seed data ----------
echo "[3/5] Inserting seed data..."
$MYSQL_CMD "$DB_NAME" -e "INSERT IGNORE INTO system_config (id, timezone) VALUES ('default', 8);" 2>/dev/null
echo "       OK."

# ---------- [4/5] Super admin ----------
SUPER_ADMIN_COUNT=$($MYSQL_CMD "$DB_NAME" -sN -e "SELECT COUNT(*) FROM admin_info WHERE admin_level = 'super_admin' AND org_id = '';" 2>/dev/null || echo "0")
SUPER_ADMIN_COUNT="${SUPER_ADMIN_COUNT:-0}"

echo ""
echo "[4/5] Super admin account"
echo "----------------------------------------------"
if [ "$SUPER_ADMIN_COUNT" -ge 1 ] 2>/dev/null; then
  echo "       SKIPPED ($SUPER_ADMIN_COUNT super admin(s) already exist)"
else
  read -p "Create a super admin account? (y/N): " CREATE_ADMIN
  if [ "$CREATE_ADMIN" = "y" ] || [ "$CREATE_ADMIN" = "Y" ] || [ "$CREATE_ADMIN" = "yes" ] || [ "$CREATE_ADMIN" = "YES" ]; then

    while true; do
      read -p "  Name:                 " ADMIN_NAME
      [ -n "$ADMIN_NAME" ] && break
      echo "[ERROR] Name cannot be empty."
    done

    while true; do
      read -p "  Student ID:          " ADMIN_STUDENT_ID
      [ -n "$ADMIN_STUDENT_ID" ] && break
      echo "[ERROR] Student ID cannot be empty."
    done

    while true; do
      read -p "  Invite code:         " ADMIN_INVITE_CODE
      [ -n "$ADMIN_INVITE_CODE" ] && break
      echo "[ERROR] Invite code cannot be empty."
    done

    echo ""
    echo "Creating super admin: $ADMIN_NAME ($ADMIN_STUDENT_ID)"

    # Escape single quotes for SQL
    ESC_NAME="$(printf '%s' "$ADMIN_NAME" | sed "s/'/''/g")"
    ESC_STUDENT="$(printf '%s' "$ADMIN_STUDENT_ID" | sed "s/'/''/g")"
    ESC_INVITE="$(printf '%s' "$ADMIN_INVITE_CODE" | sed "s/'/''/g")"

    if $MYSQL_CMD "$DB_NAME" -e "INSERT INTO admin_info (id, name, student_id, admin_level, bind_status, invite_code, invited_at, invite_expires_at, org_id) VALUES (REPLACE(UUID(), '-', ''), '$ESC_NAME', '$ESC_STUDENT', 'super_admin', 'invited', UPPER('$ESC_INVITE'), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), '');" 2>&1; then
      echo "       Super admin created successfully."
    else
      echo "[ERROR] Failed to create super admin."
    fi
  else
    echo "       Skipped."
  fi
fi

# ---------- [5/5] Show tables ----------
echo ""
echo "[5/5] Tables in $DB_NAME:"
$MYSQL_CMD "$DB_NAME" -e "SHOW TABLES;"

echo ""
echo "=========================================="
echo "Setup complete."
echo "  Database: $DB_NAME"
echo "  Host:Port: $DB_HOST:$DB_PORT"
echo "  User: $DB_USER"
echo "=========================================="

if [ -t 0 ]; then
  read -p "Press Enter to continue..." _
fi
