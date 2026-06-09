@echo off
echo ==========================================
echo REDSU Scoring - MySQL Teardown
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

echo [1/4] Testing connection...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% -e "SELECT 1 AS test;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect. Check host / port / user / password.
    pause
    exit /b 1
)
echo        OK.

echo [2/4] Checking database...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% -e "SHOW DATABASES LIKE '%DB_NAME%';" 2>nul | findstr /c:"%DB_NAME%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo        Database '%DB_NAME%' does not exist.
    echo        Nothing to tear down.
    pause
    exit /b 0
)
echo        Found.

echo.
echo [3/4] Teardown mode
echo ------------------------------------------------
echo   1. Drop all tables in '%DB_NAME%' (keep database)
echo   2. Drop entire database '%DB_NAME%'
echo   3. Cancel
echo.
set /p MODE="Select [1/2/3]: "

if "%MODE%"=="3" goto :cancel
if "%MODE%"=="2" goto :drop_database
if "%MODE%"=="1" goto :drop_tables

echo        Invalid selection.
pause
exit /b 1

:drop_tables
echo.
echo        This will drop ALL tables in '%DB_NAME%'.
set /p CONFIRM="        Type the database name to confirm: "
if not "%CONFIRM%"=="%DB_NAME%" (
    echo        Names do not match. Cancelled.
    pause
    exit /b 0
)

echo [4/4] Dropping all tables in %DB_NAME%...
REM Generate DROP TABLE statements, disable FK checks first
for /f "usebackq skip=1" %%t in (`mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% -e "SHOW TABLES;" 2^>nul`) do (
    mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% %DB_NAME% -e "SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS %%t; SET FOREIGN_KEY_CHECKS = 1;" 2>nul
)
echo        All tables dropped.
goto :done

:drop_database
echo.
echo        This will DROP the entire database '%DB_NAME%'.
set /p CONFIRM="        Type the database name to confirm: "
if not "%CONFIRM%"=="%DB_NAME%" (
    echo        Names do not match. Cancelled.
    pause
    exit /b 0
)

echo [4/4] Dropping database %DB_NAME%...
mysql -u %DB_USER% -p%DB_PASS% -h %DB_HOST% -P %DB_PORT% -e "DROP DATABASE IF EXISTS %DB_NAME%;" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to drop database.
    pause
    exit /b 1
)
echo        Database dropped.

:done
echo.
echo ==========================================
echo Teardown complete.
echo ==========================================
pause
exit /b 0

:cancel
echo        Cancelled.
pause
exit /b 0
