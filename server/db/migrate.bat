@echo off
setlocal enabledelayedexpansion
echo ==========================================
echo REDSU Scoring - Full Database Migration
echo ==========================================
echo.
echo This script runs ALL migrations to bring
echo the database to the latest correct state.
echo All migrations are idempotent — safe to
echo run multiple times.
echo.
echo MAKE SURE you have backed up the database
echo before proceeding!
echo.
pause
echo.

REM ─── Auto-detect MySQL ────────────────────────────
where mysql >nul 2>nul
if %ERRORLEVEL% EQU 0 goto :config

set "MYSQL_FOUND="
if exist "C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe" (
    set "PATH=C:\Program Files\MySQL\MySQL Server 9.7\bin;%PATH%"
    set "MYSQL_FOUND=1"
    echo [INFO] Found MySQL 9.7
)
if not defined MYSQL_FOUND if exist "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" (
    set "PATH=C:\Program Files\MySQL\MySQL Server 8.4\bin;%PATH%"
    set "MYSQL_FOUND=1"
    echo [INFO] Found MySQL 8.4
)
if not defined MYSQL_FOUND if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" (
    set "PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin;%PATH%"
    set "MYSQL_FOUND=1"
    echo [INFO] Found MySQL 8.0
)
if not defined MYSQL_FOUND (
    echo [ERROR] MySQL client not found.
    echo Please install MySQL 8.0+ or add mysql.exe to PATH.
    echo Download: https://dev.mysql.com/downloads/mysql/
    pause
    exit /b 1
)

:config
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=root
set DB_PASS=
set DB_NAME=redsu_scoring

set /p DB_HOST="Host     [localhost]: "
if "%DB_HOST%"=="" set DB_HOST=localhost

set /p DB_PORT="Port     [3306]: "
if "%DB_PORT%"=="" set DB_PORT=3306

set /p DB_USER="User     [root]: "
if "%DB_USER%"=="" set DB_USER=root

set /p DB_PASS="Password []: "

set /p DB_NAME="Database [redsu_scoring]: "
if "%DB_NAME%"=="" set DB_NAME=redsu_scoring

echo.

REM ─── Build MySQL command ──────────────────────────
if "%DB_PASS%"=="" (
    set "MYSQL_CMD=mysql -u %DB_USER% -h %DB_HOST% -P %DB_PORT%"
) else (
    set "MYSQL_CMD=mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT%"
)

echo ==========================================
echo Connecting: %DB_USER%@%DB_HOST%:%DB_PORT%  -^>  %DB_NAME%
echo ==========================================
echo.

REM ─── [1/7] Test connection ─────────────────────────
echo [1/7] Testing connection...
%MYSQL_CMD% -e "SELECT 1 AS test;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect. Check host / port / user / password.
    pause
    exit /b 1
)
echo        OK.

REM ─── [2/7] Verify database ─────────────────────────
echo [2/7] Verifying database exists...
%MYSQL_CMD% -e "USE `%DB_NAME%`;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database '%DB_NAME%' does not exist. Run setup-local.bat first.
    pause
    exit /b 1
)
echo        OK.

REM ─── [3/7] Main org_id migration ───────────────────
echo [3/7] Running main migration ^(migrate_org_id.sql^) ...
echo        This may take a while depending on data size.
%MYSQL_CMD% %DB_NAME% < "%~dp0migrate_org_id.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Main migration failed. See errors above.
    echo        Restore from backup and investigate before retrying.
    pause
    exit /b 1
)
echo        OK.

REM ─── [4/7] Fix permission_id ───────────────────────
echo [4/7] Fixing permission_id column ^(migrate_fix_permission_id.sql^) ...
echo        Drops legacy FK, makes permission_id nullable.
%MYSQL_CMD% %DB_NAME% < "%~dp0migrate_fix_permission_id.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Permission_id fix failed. See errors above.
    echo          This is not fatal — you can run migrate_fix_permission_id.sql manually.
) else (
    echo        OK.
)

REM ─── [5/7] Fix clause_id ───────────────────────────
echo [5/7] Fixing clause_id column ^(migrate_clause_id.sql^) ...
echo        Adds clause_id, copies from permission_id, drops old FKs.
%MYSQL_CMD% %DB_NAME% < "%~dp0migrate_clause_id.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Clause_id fix failed. See errors above.
    echo          This is not fatal — you can run migrate_clause_id.sql manually.
) else (
    echo        OK.
)

REM ─── [6/7] Grade bands migration ───────────────────
echo [6/7] Running grade bands migration ^(migration_grade_bands.sql^) ...
echo        display_mode → clauses, pub_grade_bands, cascade FKs, orphan cleanup.
%MYSQL_CMD% %DB_NAME% < "%~dp0migration_grade_bands.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Grade bands migration failed. See errors above.
    echo          This is not fatal — you can run migration_grade_bands.sql manually.
) else (
    echo        OK.
)

REM ─── [7/7] Audit workflow migration ──────────────────
echo [7/7] Running audit workflow migration ^(migrate_audit_workflow.sql^) ...
echo        Creates audit flow templates, submissions, signatures, stamps tables.
%MYSQL_CMD% %DB_NAME% < "%~dp0migrate_audit_workflow.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Audit workflow migration failed. See errors above.
    echo          This is not fatal — you can run migrate_audit_workflow.sql manually.
) else (
    echo        OK.
)

REM ─── Verify ────────────────────────────────────────
echo.
echo ==========================================
echo Verifying all migrations...
echo.

echo   Checking org_id columns ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'org_id' ORDER BY TABLE_NAME;" 2>nul
echo.

echo   Checking is_paused column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'is_paused';" 2>nul
echo.

echo   Checking allow_self_assessment column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'allow_self_assessment';" 2>nul
echo.

echo   Checking calculation_method column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME IN ('calculation_method', 'trim_high_count', 'trim_low_count') ORDER BY TABLE_NAME, COLUMN_NAME;" 2>nul
echo.

echo   Checking history tables removed ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '%DB_NAME%' AND TABLE_NAME LIKE '%%_history';" 2>nul
echo.

echo   Checking permission_id / clause_id ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND TABLE_NAME = 'merit_list_designations' AND COLUMN_NAME IN ('permission_id', 'clause_id') ORDER BY COLUMN_NAME;" 2>nul
echo.

echo   Checking display_mode column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND TABLE_NAME = 'pub_view_rules' AND COLUMN_NAME = 'display_mode';" 2>nul
echo.

echo   Checking pub_grade_bands table ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = '%DB_NAME%' AND TABLE_NAME = 'pub_grade_bands';" 2>nul
echo.

echo   Checking cascade FKs (ON DELETE CASCADE) ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = '%DB_NAME%' AND TABLE_NAME IN ('pub_view_rule_clauses','pub_merit_rule_clauses','pub_grade_bands','merit_list_designations') ORDER BY TABLE_NAME, CONSTRAINT_NAME;" 2>nul
echo.

echo ==========================================
echo Migration complete!
echo   Database: %DB_NAME%
echo   Host:Port: %DB_HOST%:%DB_PORT%
echo.
echo Migrations applied (all idempotent):
echo   1. migrate_org_id.sql         - org_id columns, history tables dropped
echo   2. migrate_fix_permission_id.sql - permission_id nullable, FK removed
echo   3. migrate_clause_id.sql      - clause_id column, old FK cleanup
echo   4. migration_grade_bands.sql  - display_mode → clauses, cascade FKs, pub_grade_bands
echo   5. migrate_audit_workflow.sql - audit flow templates, submissions, signatures, stamps
echo.
echo New features:
echo   - org-scoped architecture (org_id on all tables)
echo   - allow_self_assessment on rate_target_rules
echo   - calculation_method / trim configs on clause_template_configs
echo   - merit_list_designations uses clause_id (permission_id is legacy)
echo   - pub_view_rule_clauses.display_mode (score ^| grade) per clause
echo   - pub_grade_bands table for customizable grade intervals
echo   - cascade FKs ensure no zombie records on category deletion
echo   - audit workflow system: flow templates, e-signatures, stamps, hash-chain verification
echo ==========================================
pause
endlocal
