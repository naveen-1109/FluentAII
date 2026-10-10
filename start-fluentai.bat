@echo off
rem Starts FluentAI: speech service, API and web app, each in its own window.
rem Close those windows to stop the app.
cd /d "%~dp0"

if not exist "backend\node_modules" (
  echo Installing API packages, first run only...
  pushd backend & call npm install & popd
)
if not exist "frontend\node_modules" (
  echo Installing web app packages, first run only...
  pushd frontend & call npm install & popd
)

if exist "speech-service\.venv\Scripts\python.exe" (
  start "FluentAI speech service (port 8000)" /D "%~dp0speech-service" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
) else (
  echo Speech service not set up yet: see README. The app still opens, but analysis will not work.
)
start "FluentAI API (port 4000)" /D "%~dp0backend" cmd /k "npm run dev"
start "FluentAI web app (port 5173)" /D "%~dp0frontend" cmd /k "npm run dev"

echo Waiting for the servers to start...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173
echo FluentAI is opening in your browser. Admins sign in on the same page with the admin credentials.
timeout /t 5 >nul
