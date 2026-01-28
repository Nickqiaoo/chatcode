import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from funasr import AutoModel

app = FastAPI(title="Fun-ASR Service")

SCRIPT_DIR = Path(__file__).resolve().parent
REMOTE_CODE = str(SCRIPT_DIR / "model.py")
MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "FunAudioLLM/Fun-ASR-Nano-2512")
DEVICE = os.environ.get("ASR_DEVICE", "cpu")

model = None


@app.on_event("startup")
def load_model():
    global model
    model = AutoModel(
        model=MODEL_DIR,
        trust_remote_code=True,
        remote_code=REMOTE_CODE,
        device=DEVICE,
    )


@app.post("/asr")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(default="auto"),
    hotwords: str = Form(default=""),
    itn: bool = Form(default=True),
):
    """Transcribe an audio file to text."""
    suffix = os.path.splitext(file.filename or "audio.wav")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        kwargs = {"input": [tmp_path], "cache": {}, "batch_size": 1, "itn": itn}
        if language and language != "auto":
            kwargs["language"] = language
        if hotwords:
            kwargs["hotwords"] = [w.strip() for w in hotwords.split(",") if w.strip()]

        res = model.generate(**kwargs)
        text = res[0]["text"] if res else ""
        return JSONResponse({"text": text})
    finally:
        os.unlink(tmp_path)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_DIR, "device": DEVICE}
