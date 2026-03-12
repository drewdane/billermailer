@echo off
setlocal enabledelayedexpansion

REM --- Always run from this script's folder ---
cd /d "%~dp0"

REM --- Ensure folders exist ---
if not exist "data\input" mkdir "data\input"
if not exist "data\output" mkdir "data\output"

REM --- Pick a CSV (default to Downloads), then copy it into data\input with timestamp ---
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName System.Windows.Forms; " ^
  "$dlg = New-Object System.Windows.Forms.OpenFileDialog; " ^
  "$dlg.Title = 'Select TripMaster CSV export'; " ^
  "$dlg.Filter = 'CSV files (*.csv)|*.csv|All files (*.*)|*.*'; " ^
  "$dlg.InitialDirectory = [Environment]::GetFolderPath('UserProfile') + '\Downloads'; " ^
  "$dlg.Multiselect = $false; " ^
  "if($dlg.ShowDialog() -ne 'OK'){ exit 1 }; " ^
  "$dlg.FileName"` ) do set "PICKED=%%I"

if not defined PICKED (
  echo No file selected. Exiting.
  exit /b 1
)

REM --- Build a safe timestamp for the archived filename ---
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%T"

REM --- Copy to predictable location (archive) ---
set "ARCHIVE=data\input\tripmaster_%TS%.csv"
copy /y "%PICKED%" "%ARCHIVE%" >nul

echo Selected:
echo   %PICKED%
echo Archived to:
echo   %ARCHIVE%
echo.

REM --- Run harvest ---
node bm-harvest.js --in "%ARCHIVE%" --out "data\output\bm_harvest_latest.csv" --skipped "data\output\bm_skipped_latest.csv"
if errorlevel 1 (
  echo.
  echo Harvest failed.
  pause
  exit /b 1
)

REM --- Build review packets ---
node bm-reviewpackets.js --in "data\output\bm_harvest_latest.csv" --outDir "data\output\review"
if errorlevel 1 (
  echo.
  echo Review packet build failed.
  pause
  exit /b 1
)

REM --- Start server and open browser ---
start "" "http://localhost:8787"
node bm-review-server.js --dir "%cd%\data\output\review"