@echo off
echo ====================================================
echo  Launching Agentic AI Command Center (Full-Stack)
echo ====================================================
start "Backend (FastAPI + LangGraph)" cmd /k "%~dp0start-backend.bat"
timeout /t 3 /nobreak >nul
start "Frontend (React + React Flow)" cmd /k "%~dp0start-frontend.bat"
echo.
echo Backend URL:  http://localhost:8000/docs
echo Frontend URL: http://localhost:5173
echo ====================================================
