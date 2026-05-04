from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Literal, AsyncGenerator
import uuid
import numpy as np
import wave
import io
import asyncio
from pathlib import Path
from mlx_audio.tts.utils import load_model
from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.models.qwen3_tts.qwen3_tts import Model

app = FastAPI(title="TTS API", version="1.0.0")

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

MODEL_BASE = Path(__file__).parent / "pretrained_models" / "Qwen3-TTS-12Hz-1.7B-Base-8bit"
MODEL_CUSTOM = Path(__file__).parent / "pretrained_models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit"
MODEL_VOICE = Path(__file__).parent / "pretrained_models" / "Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"

# Global model cache
_model_cache = {}


class TtsRequest(BaseModel):
    Text: str = Field(..., description="待合成文本，UTF-8编码")
    Voice: Optional[str] = Field("Serena", description="发音人音色")
    RefAudio: Optional[str] = Field(None, description="参考音频路径(语音克隆时使用)")
    RefText: Optional[str] = Field(None, description="参考音频对应的文本(语音克隆时使用)")
    Instruct: Optional[str] = Field(None, description="声音指令描述(指令模式时使用)")
    Format: Optional[Literal["pcm", "wav", "mp3"]] = Field("wav", description="音频编码格式")
    SampleRate: Optional[int] = Field(24000, description="音频采样率")
    Volume: Optional[int] = Field(50, ge=0, le=100, description="音量0-100")
    SpeechRate: Optional[int] = Field(0, ge=-500, le=500, description="语速-500~500")
    PitchRate: Optional[int] = Field(0, ge=-500, le=500, description="语调-500~500")
    Model: Optional[Literal["clone", "preset", "instruct"]] = Field("preset", description="模型模式")
    Stream: Optional[bool] = Field(False, description="是否启用流式传输")


def get_model_path(model: str) -> Path:
    if model == "clone":
        return MODEL_BASE
    elif model == "preset":
        return MODEL_CUSTOM
    elif model == "instruct":
        return MODEL_VOICE
    return MODEL_CUSTOM


def get_cached_model(model_type: str) -> Model:
    """Get or load cached model"""
    if model_type not in _model_cache:
        _model_cache[model_type] = load_model(
            model_path=get_model_path(model_type),
            model_type="custom_voice"
        )
    return _model_cache[model_type]


def audio_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    """Convert numpy array to WAV bytes"""
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)  # mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio.tobytes())
    return buffer.getvalue()


def generate_streaming_sync(model: Model, req: TtsRequest):
    """Blocking generator for use in thread pool"""
    speed = (req.SpeechRate + 500) / 500 if req.SpeechRate != 0 else 1.0

    kwargs = {
        "text": req.Text,
        "speed": speed,
        "temperature": 0.7,
        "stream": True,
        "streaming_interval": 1.0,
        "verbose": False,
    }

    if req.Model == "clone":
        kwargs["ref_audio"] = req.RefAudio
        kwargs["instruct"] = None
    elif req.Model == "preset":
        kwargs["voice"] = req.Voice
        kwargs["instruct"] = None
    elif req.Model == "instruct":
        kwargs["instruct"] = req.Instruct
        kwargs["voice"] = None

    first_chunk = True
    for result in model.generate(**kwargs):
        audio_np = result.audio
        if isinstance(audio_np, list) and len(audio_np) > 0:
            audio_np = audio_np[0]
        audio_np = np.array(audio_np).flatten()

        wav_bytes = audio_to_wav_bytes(audio_np, result.sample_rate)

        if first_chunk:
            header = f"SR:{result.sample_rate}\n".encode()
            yield header
            first_chunk = False

        yield wav_bytes


@app.post("/stream/v1/tts")
async def tts(req: TtsRequest):
    if not req.Text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if req.Stream:
        if req.Model == "clone" and (not req.RefAudio or not req.RefText):
            raise HTTPException(status_code=400, detail="clone模式需要RefAudio和RefText")
        if req.Model == "instruct" and not req.Instruct:
            raise HTTPException(status_code=400, detail="instruct模式需要Instruct参数")

        async def stream_generator():
            try:
                model = get_cached_model(req.Model)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Model load failed: {str(e)}")

            loop = asyncio.get_event_loop()
            for chunk in await loop.run_in_executor(None, generate_streaming_sync, model, req):
                yield chunk

        return StreamingResponse(
            stream_generator(),
            media_type="audio/wav",
            headers={
                "X-Audio-Sample-Rate": "24000",
                "X-Streaming": "true",
            }
        )

    # Non-streaming mode (original behavior)
    request_id = str(uuid.uuid4())
    output_file = OUTPUT_DIR / f"{request_id}.wav"

    try:
        model = get_cached_model(req.Model)

        speed = (req.SpeechRate + 500) / 500 if req.SpeechRate != 0 else 1.0

        kwargs = {
            "model": model,
            "lang_code": "zh",
            "text": req.Text,
            "speed": speed,
            "temperature": 0.7,
            "cfg_scale": 1.0,
            "ddpm_steps": 10,
        }

        if req.Model == "clone":
            if not req.RefAudio or not req.RefText:
                raise HTTPException(status_code=400, detail="clone模式需要RefAudio和RefText")
            kwargs["ref_audio"] = req.RefAudio
            kwargs["ref_text"] = req.RefText
        elif req.Model == "preset":
            kwargs["voice"] = req.Voice
        elif req.Model == "instruct":
            if not req.Instruct:
                raise HTTPException(status_code=400, detail="instruct模式需要Instruct参数")
            kwargs["instruct"] = req.Instruct

        file_prefix = str(output_file).rsplit(".", 1)[0]
        kwargs["file_prefix"] = file_prefix
        generate_audio(**kwargs)

        actual_file = Path(f"{file_prefix}_000.wav")

        if not actual_file.exists():
            raise HTTPException(status_code=500, detail="Audio generation failed")

        return FileResponse(
            path=actual_file,
            filename=f"{request_id}.wav",
            media_type="audio/wav"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/voices/list")
async def list_voices():
    return {
        "Voices": [
            {"VoiceId": "Serena", "Name": "Serena", "Language": "en-US", "Gender": "Female"},
            {"VoiceId": "Vivian", "Name": "Vivian", "Language": "en-US", "Gender": "Female"},
            {"VoiceId": "Ryan", "Name": "Ryan", "Language": "en-US", "Gender": "Male"},
            {"VoiceId": "Aiden", "Name": "Aiden", "Language": "en-US", "Gender": "Male"},
            {"VoiceId": "Eric", "Name": "Eric", "Language": "en-US", "Gender": "Male"},
            {"VoiceId": "Dylan", "Name": "Dylan", "Language": "en-US", "Gender": "Male"},
        ]
    }


@app.get("/health")
async def health():
    return {"Status": "OK", "Version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7394)
