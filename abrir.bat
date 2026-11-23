@echo off
rem Abre TasaViva en el navegador con un servidor local.
rem Deja esta ventana abierta mientras uses la pagina; cierrala para apagar el servidor.
title TasaViva
cd /d "%~dp0sitio"
echo.
echo  TasaViva se abre en http://localhost:8765
echo  Deja esta ventana abierta mientras uses la pagina.
echo  Cierrala para apagar el servidor.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8765"
python -m http.server 8765 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo  No se pudo iniciar el servidor. Revisa que Python este instalado
  echo  y que el puerto 8765 no este ocupado por otro programa.
  pause
)
