@echo off
REM CreditNirvana PS2 dashboard launcher (Windows)
cd /d "%~dp0backend"
echo Starting CreditNirvana PS2 dashboard on http://127.0.0.1:8000  ...
"C:\Users\Soumyajit\anaconda3\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000
pause
