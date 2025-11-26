import os
import shutil
import tempfile
from typing import List, Optional

import requests
import whisper
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import tempfile
from typing import List, Optional

import requests
import whisper
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from diffusers import DiffusionPipeline
import torch
from io import BytesIO
import torch
from io import BytesIO
import base64
import base64
import edge_tts
import asyncio

app = FastAPI()

# Add current directory to PATH so ffmpeg.exe can be found if it's here
os.environ["PATH"] += os.pathsep + os.path.dirname(os.path.abspath(__file__))

# Check for ffmpeg
if not shutil.which("ffmpeg"):
    print("\n\nWARNING: 'ffmpeg' was not found in your PATH or current directory.")
    print("Whisper requires ffmpeg to process audio files.")
    print("Please run setup_ffmpeg.py or install it manually.\n\n")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model
# Default to "base" on "cpu"
current_whisper_model_name = "base"
current_device = "cpu"

import torch
if torch.cuda.is_available():
    print("CUDA is available. Defaulting to GPU.")
    current_device = "cuda"
else:
    print("CUDA not available. Defaulting to CPU.")

print(f"Loading Whisper model: {current_whisper_model_name} on {current_device}...")
try:
    model = whisper.load_model(current_whisper_model_name, device=current_device)
    print("Whisper model loaded.")
except Exception as e:
    print(f"Error loading model on {current_device}: {e}")
    print("Falling back to CPU...")
    current_device = "cpu"
    model = whisper.load_model(current_whisper_model_name, device=current_device)

# Load Image Model (Lazy load or on startup? Let's lazy load to save VRAM for LLM/Whisper if not used)
image_pipe = None
IMAGE_MODEL_ID = "SimianLuo/LCM_Dreamshaper_v7"

def get_image_pipe():
    global image_pipe
    if image_pipe is None:
        print(f"Loading Image Model: {IMAGE_MODEL_ID}...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        try:
            image_pipe = DiffusionPipeline.from_pretrained(IMAGE_MODEL_ID, torch_dtype=dtype, use_safetensors=True)
            image_pipe.to(device)
            print("Image Model loaded.")
        except Exception as e:
            print(f"Error loading image model: {e}")
            raise e
    return image_pipe

OLLAMA_API_BASE = "http://localhost:11434/api"

class ChatRequest(BaseModel):
    model: str
    messages: List[dict]
    stream: bool = True

class ImageRequest(BaseModel):
    prompt: str

@app.post("/api/generate-image")
async def generate_image(request: ImageRequest):
    """Generate image from text"""
    try:
        pipe = get_image_pipe()
        
        # Generate
        # LCM is fast, 4-8 steps is usually enough
        image = pipe(request.prompt, num_inference_steps=8, guidance_scale=8.0).images[0]
        
        # Convert to base64
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        return {"image": f"data:image/png;base64,{img_str}"}
    except Exception as e:
        print(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class AudioRequest(BaseModel):
    text: str
    voice: str = "pt-BR-FranciscaNeural"

@app.post("/api/generate-audio")
async def generate_audio(request: AudioRequest):
    """Generate audio from text using Edge TTS"""
    try:
        print(f"Generating audio for: {request.text[:50]}...")
        communicate = edge_tts.Communicate(request.text, request.voice)
        
        # Generate audio in memory
        mp3_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_data += chunk["data"]
        
        # Convert to base64
        audio_str = base64.b64encode(mp3_data).decode()
        
        return {"audio": f"data:audio/mp3;base64,{audio_str}"}
    except Exception as e:
        print(f"Audio generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class WhisperConfig(BaseModel):
    model_size: str
    device: str

@app.post("/api/settings/whisper")
async def set_whisper_model(config: WhisperConfig):
    """Change the loaded Whisper model and device"""
    global model, current_whisper_model_name, current_device
    
    if config.model_size == current_whisper_model_name and config.device == current_device:
        return {"status": "already_loaded", "model": current_whisper_model_name, "device": current_device}
    
    try:
        print(f"Switching Whisper model to: {config.model_size} on {config.device}...")
        # Unload old model
        del model
        if config.device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        model = whisper.load_model(config.model_size, device=config.device)
        current_whisper_model_name = config.model_size
        current_device = config.device
        print(f"New Whisper model loaded on {current_device}.")
        return {"status": "success", "model": current_whisper_model_name, "device": current_device}
    except Exception as e:
        # If GPU fails, try to fallback to CPU but keep the requested model size if possible, or just fail.
        # Better to fail and let user know.
        raise HTTPException(status_code=500, detail=f"Failed to load model on {config.device}: {str(e)}")

@app.get("/api/settings/whisper")
async def get_whisper_model():
    return {"model": current_whisper_model_name, "device": current_device, "cuda_available": torch.cuda.is_available()}

@app.get("/api/models")
async def list_models():
    """Proxy to Ollama's list models endpoint"""
    try:
        resp = requests.get(f"{OLLAMA_API_BASE}/tags")
        return resp.json()
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="LLM backend is not running or not accessible.")

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe uploaded audio file using Whisper"""
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Save to temp file because Whisper needs a file path
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Transcribe
        print(f"Transcribing file: {tmp_path}")
        result = model.transcribe(tmp_path)
        text = result["text"].strip()
        print(f"Transcription result: {text}")
        return {"text": text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        # Cleanup
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Proxy chat request to Ollama"""
    try:
        # Stream the response from Ollama
        response = requests.post(
            f"{OLLAMA_API_BASE}/chat",
            json=request.dict(),
            stream=True
        )
        
        def iter_content():
            for chunk in response.iter_content(chunk_size=None):
                if chunk:
                    yield chunk

        return StreamingResponse(iter_content(), media_type="application/x-ndjson")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files (Frontend)
# We will create the 'static' directory next
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
