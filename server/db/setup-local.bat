@echo off
echo ==========================================
echo REDSU Scoring - Local MySQL Setup
echo ==========================================
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
echo ==========================================
echo Connecting: %DB_USER%@%DB_HOST%:%DB_PORT%  -^>  %DB_NAME%
echo ==========================================
echo.

echo [1/5] Testing connection...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% -e "SELECT 1 AS test;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect. Check host / port / user / password.
    pause
    exit /b 1
)
echo        OK.

echo [2/5] Creating database...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% -e "CREATE DATABASE IF NOT EXISTS `%DB_NAME%` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create database '%DB_NAME%'. Check permissions.
    pause
    exit /b 1
)
echo        OK.

echo        Creating tables...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% < "%~dp0init.sql" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] init.sql finished with errors ^(see above^). Some tables may already exist.
    echo        Continuing with remaining steps...
) else (
    echo        OK.
)

echo [3/5] Inserting seed data...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% -e "INSERT IGNORE INTO system_config (id, timezone) VALUES ('default', 8);" 2>nul
echo        OK.

REM Check whether a global super admin already exists
set SUPER_ADMIN_COUNT=0
for /f "usebackq skip=1" %%c in (`mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% -e "SELECT COUNT(*) FROM admin_info WHERE admin_level = 'super_admin' AND org_id = '';" 2^>nul`) do set SUPER_ADMIN_COUNT=%%c

echo.
echo [4/5] Super admin account
echo ------------------------------------------------
if %SUPER_ADMIN_COUNT% GEQ 1 (
    echo        SKIPPED ^(%SUPER_ADMIN_COUNT% super admin^(s^) already exist^)
    goto :show_tables
)

set /p CREATE_ADMIN="Create a super admin account? (y/N): "
if /i "%CREATE_ADMIN%"=="y" goto :create_admin
if /i "%CREATE_ADMIN%"=="yes" goto :create_admin
echo        Skipped.
goto :show_tables

:create_admin
set ADMIN_NAME=
set ADMIN_STUDENT_ID=
set ADMIN_INVITE_CODE=

set /p ADMIN_NAME="  Name:                 "
if "%ADMIN_NAME%"=="" (
    echo [ERROR] Name cannot be empty.
    goto :create_admin
)

set /p ADMIN_STUDENT_ID="  Student ID:          "
if "%ADMIN_STUDENT_ID%"=="" (
    echo [ERROR] Student ID cannot be empty.
    goto :create_admin
)

set /p ADMIN_INVITE_CODE="  Invite code:         "
if "%ADMIN_INVITE_CODE%"=="" (
    echo [ERROR] Invite code cannot be empty.
    goto :create_admin
)

echo.
echo Creating super admin: %ADMIN_NAME% ^(%ADMIN_STUDENT_ID%^)
REM Escape single quotes for SQL
setlocal enabledelayedexpansion
set ESC_NAME=!ADMIN_NAME:'=''!
set ESC_STUDENT=!ADMIN_STUDENT_ID:'=''!
set ESC_INVITE=!ADMIN_INVITE_CODE:'=''!
mysql -u !DB_USER! -p!DB_PASS! -h !DB_HOST! -P !DB_PORT! !DB_NAME! -e "INSERT INTO admin_info (id, name, student_id, admin_level, bind_status, invite_code, invited_at, invite_expires_at, org_id) VALUES (REPLACE(UUID(), '-', ''), '!ESC_NAME!', '!ESC_STUDENT!', 'super_admin', 'invited', UPPER('!ESC_INVITE!'), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), '');" 2>&1
if !ERRORLEVEL! NEQ 0 (
    endlocal
    echo [ERROR] Failed to create super admin.
) else (
    endlocal
    echo        Super admin created successfully.
)

:show_tables
echo.
echo [5/5] Tables in %DB_NAME%:
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% -e "SHOW TABLES;"

echo.
echo ==========================================
echo Setup complete.
echo   Database: %DB_NAME%
echo   Host:Port: %DB_HOST%:%DB_PORT%
echo   User: %DB_USER%
echo ==========================================
pause
