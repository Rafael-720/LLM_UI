@echo off
echo ==========================================
echo      Ollama Audio Interface Launcher
echo ==========================================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed! Please install Python 3.8+ and try again.
    pause
    exit /b
)

echo.
echo Installing/Updating dependencies...
echo Checking for FFmpeg...
python setup_ffmpeg.py

echo Installing PyTorch with CUDA support...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
if %errorlevel% neq 0 (
    echo Failed to install PyTorch. Trying standard install...
    pip install torch torchvision torchaudio
)

pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Failed to install dependencies. Please check your internet connection.
    pause
    exit /b
)

echo.
echo Starting the server...
echo Access the app at: http://localhost:8000
echo Press Ctrl+C to stop.
echo.

python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload

pause
