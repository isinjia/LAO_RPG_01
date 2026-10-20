@echo off
cd /d "%~dp0"
set PORT=8795
set URL=http://localhost:%PORT%/index.html
if "%~1"=="open" goto open

set PY=
py -3 --version >nul 2>nul && set PY=py -3
if not defined PY python --version >nul 2>nul && set PY=python
if not defined PY (
  echo [ERROR] Python 3 is not installed. Install it from https://www.python.org and run again.
  pause
  exit /b 1
)

rem server already running: just open the game
netstat -ano | findstr /c:":%PORT% " | findstr /c:"LISTENING" >nul
if not errorlevel 1 goto open

echo Starting server: %URL%
echo Close this window to stop the server.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & call "%~f0" open"
%PY% tools\serve.py %PORT%
pause
exit /b 0

:open
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (start "" "%CHROME%" "%URL%") else (start "" "%URL%")
exit /b 0
