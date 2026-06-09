@echo off
echo ==========================================
echo REDSU Scoring - org_id Migration
echo ==========================================
echo.
echo WARNING: This script migrates the database
echo from the old history-table architecture to
echo the new org_id column architecture.
echo.
echo MAKE SURE you have backed up the database
echo before proceeding!
echo.
pause
echo.

REM Auto-detect MySQL if not in PATH
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
REM Build MySQL command with conditional password (same as setup-local.bat)
if "%DB_PASS%"=="" (
    set MYSQL_CMD=mysql -u %DB_USER% -h %DB_HOST% -P %DB_PORT%
) else (
    set MYSQL_CMD=mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT%
)

echo ==========================================
echo Connecting: %DB_USER%@%DB_HOST%:%DB_PORT%  -^>  %DB_NAME%
echo ==========================================
echo.

echo [1/4] Testing connection...
%MYSQL_CMD% -e "SELECT 1 AS test;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect. Check host / port / user / password.
    pause
    exit /b 1
)
echo        OK.

echo [2/4] Verifying database exists...
%MYSQL_CMD% -e "USE `%DB_NAME%`;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database '%DB_NAME%' does not exist. Run setup-local.bat first.
    pause
    exit /b 1
)
echo        OK.

echo [3/4] Running migration ^(migrate_org_id.sql^) ...
echo        This may take a while depending on data size.
%MYSQL_CMD% %DB_NAME% < "%~dp0migrate_org_id.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Migration failed. See errors above.
    echo        Restore from backup and investigate before retrying.
    pause
    exit /b 1
)
echo        OK.

echo [4/4] Verifying migration...
echo        Checking org_id columns ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'org_id' ORDER BY TABLE_NAME;" 2>nul
echo.
echo        Checking is_paused column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'is_paused';" 2>nul
echo.
echo        Checking allow_self_assessment column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME = 'allow_self_assessment';" 2>nul
echo.
echo        Checking calculation_method column ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '%DB_NAME%' AND COLUMN_NAME IN ('calculation_method', 'trim_high_count', 'trim_low_count') ORDER BY TABLE_NAME, COLUMN_NAME;" 2>nul
echo.
echo        Checking history tables removed ...
%MYSQL_CMD% %DB_NAME% -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '%DB_NAME%' AND TABLE_NAME LIKE '%%_history';" 2>nul
echo.

echo ==========================================
echo Migration complete!
echo   Database: %DB_NAME%
echo   Host:Port: %DB_HOST%:%DB_PORT%
echo.
echo New features added:
echo   - rate_target_rules.allow_self_assessment (default 1^)
echo   - clause_template_configs.calculation_method (default weighted_average^)
echo   - clause_template_configs.trim_high_count / trim_low_count (default 0^)
echo.
echo The 16 history tables have been dropped.
echo All org-scoped tables now use org_id column.
echo Switching organizations no longer requires
echo data migration - it updates system_config only.
echo ==========================================
pause
