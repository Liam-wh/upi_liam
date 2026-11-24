@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  where py >nul 2>&1
  if errorlevel 1 (
    python -m venv .venv
  ) else (
    py -3 -m venv .venv
  )
  if errorlevel 1 goto fallo
)
".venv\Scripts\python.exe" -c "import flask" >nul 2>&1
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto fallo
)
if /i "%~1"=="activar" (
  ".venv\Scripts\python.exe" -B app.py --activar
) else (
  ".venv\Scripts\python.exe" -B app.py
)
if errorlevel 1 goto fallo
exit /b 0
:fallo
echo No se pudo iniciar la web. Revisa Python 3 y la instalacion de Flask.
pause
exit /b 1
