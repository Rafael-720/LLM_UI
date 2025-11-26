import os
import sys
import zipfile
import urllib.request
import shutil

FFMPEG_URL = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
DEST_DIR = os.path.dirname(os.path.abspath(__file__))
FFMPEG_EXE = "ffmpeg.exe"

def setup_ffmpeg():
    # Check if ffmpeg is already here
    if os.path.exists(os.path.join(DEST_DIR, FFMPEG_EXE)):
        print("ffmpeg.exe already exists in the application folder.")
        return

    # Check if ffmpeg is in PATH
    if shutil.which("ffmpeg"):
        print("ffmpeg is already installed and in PATH.")
        return

    print("ffmpeg not found. Downloading portable version...")
    zip_path = os.path.join(DEST_DIR, "ffmpeg.zip")
    
    try:
        print(f"Downloading from {FFMPEG_URL}...")
        urllib.request.urlretrieve(FFMPEG_URL, zip_path)
        print("Download complete. Extracting...")

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Find the ffmpeg.exe inside the zip (it's usually in a subfolder)
            ffmpeg_file = None
            for file in zip_ref.namelist():
                if file.endswith("bin/ffmpeg.exe"):
                    ffmpeg_file = file
                    break
            
            if not ffmpeg_file:
                print("Error: Could not find ffmpeg.exe in the downloaded zip.")
                return

            # Extract only ffmpeg.exe to current dir
            with zip_ref.open(ffmpeg_file) as source, open(os.path.join(DEST_DIR, FFMPEG_EXE), "wb") as target:
                shutil.copyfileobj(source, target)
        
        print(f"ffmpeg.exe extracted to {DEST_DIR}")

    except Exception as e:
        print(f"Failed to setup ffmpeg: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

if __name__ == "__main__":
    setup_ffmpeg()
