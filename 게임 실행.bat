@echo off
chcp 65001 >nul
rem 오르카 전기 - 로컬 서버를 띄우고 크롬으로 실행 (더블클릭)
cd /d "%~dp0"

set PORT=8795
set URL=http://localhost:%PORT%/index.html

where python >nul 2>nul
if errorlevel 1 (
  echo [오류] Python을 찾을 수 없습니다. https://www.python.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe

if exist "%CHROME%" (set OPEN="%CHROME%" "%URL%") else (set OPEN="%URL%")

rem 서버가 이미 떠 있으면 게임만 연다
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  start "" %OPEN%
  exit /b 0
)

echo 서버 시작: %URL%
echo 이 창을 닫으면 서버가 종료됩니다.
rem 서버가 뜬 뒤(2초 후) 크롬을 연다
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" %OPEN%"
python tools\serve.py %PORT%
pause
