import importlib
import shutil
import requests
import sys
import os

def check_import(module_name):
    try:
        importlib.import_module(module_name)
        print(f"[OK] {module_name} is installed.")
        return True
    except ImportError:
        print(f"[FAIL] {module_name} is NOT installed.")
        return False

def check_command(command):
    if shutil.which(command):
        print(f"[OK] {command} is found in PATH.")
        return True
    else:
        print(f"[FAIL] {command} is NOT found in PATH.")
        return False

def check_ollama():
    try:
        resp = requests.get("http://localhost:11434/api/tags")
        if resp.status_code == 200:
            print("[OK] Ollama is running and accessible.")
            return True
        else:
            print(f"[FAIL] Ollama returned status code {resp.status_code}.")
            return False
    except requests.exceptions.ConnectionError:
        print("[FAIL] Ollama is NOT reachable at http://localhost:11434.")
        return False

def check_directory(path):
    if os.path.exists(path) and os.path.isdir(path):
        print(f"[OK] Directory '{path}' exists.")
        return True
    else:
        print(f"[FAIL] Directory '{path}' does NOT exist.")
        return False

def main():
    print("--- Verifying Setup ---")
    all_good = True
    
    # Check Python dependencies
    dependencies = ["fastapi", "uvicorn", "requests", "whisper"]
    # Note: python-multipart is used by fastapi for form data but imported as multipart sometimes or just used internally.
    # We'll check the main ones.
    for dep in dependencies:
        if not check_import(dep):
            all_good = False

    # Check ffmpeg
    if not check_command("ffmpeg"):
        all_good = False

    # Check Ollama
    if not check_ollama():
        all_good = False

    # Check static directory
    if not check_directory("static"):
        all_good = False

    if all_good:
        print("\n[SUCCESS] Environment seems ready.")
    else:
        print("\n[WARNING] Some checks failed. See above.")

if __name__ == "__main__":
    main()
