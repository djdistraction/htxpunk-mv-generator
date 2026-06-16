"""
Stage 1 — Audio Analysis
Transcription: local Whisper (CPU) — free, no API key needed.
Analysis: Groq LLM — free tier.

When you get a GPU: set whisper_model=large-v3 for better accuracy.
"""
import json
import tempfile
from pathlib import Path
from openai import OpenAI
from config import settings

# Lazy-load whisper to avoid slow import at startup
_whisper_model = None

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        print(f"Loading Whisper {settings.whisper_model} model...")
        _whisper_model = whisper.load_model(settings.whisper_model)
    return _whisper_model

def _groq_client():
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1"
    )

def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio file using local Whisper. Returns segments + word timestamps."""
    model = _get_whisper()
    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        verbose=False,
    )
    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "words": [
                {"word": w["word"].strip(), "start": round(w["start"], 2), "end": round(w["end"], 2)}
                for w in seg.get("words", [])
            ]
        })
    return {
        "language": result.get("language", "en"),
        "text": result.get("text", "").strip(),
        "segments": segments,
    }

def analyze_song(transcript: dict, audio_path: str) -> dict:
    """Use Groq LLM to interpret the song's meaning and generate visual keywords."""
    lyrics_with_timestamps = "\n".join(
        f"[{seg['start']:.1f}s] {seg['text']}" for seg in transcript["segments"]
    )
    client = _groq_client()
    response = client.chat.completions.create(
        model=settings.groq_model,
        response_format={"type": "json_object"},
        temperature=0.4,
        messages=[
            {"role": "system", "content": (
                "You are a music video director analyzing a song for visual storytelling. "
                "Return a JSON object only."
            )},
            {"role": "user", "content": f"""Analyze this song's lyrics and structure.

LYRICS WITH TIMESTAMPS:
{lyrics_with_timestamps}

Return JSON with these fields:
- themes: list of 3-5 main themes
- mood: overall emotional tone (string)
- narrative_arc: how the story/emotion develops (string)
- sections: list of {{name, start_time, end_time, energy_level 1-10, description}}
- key_moments: list of {{timestamp, lyric, visual_opportunity}} for the 5-8 most visually compelling moments
- color_mood: 3 color words that match the song's feeling
- energy_level: overall 1-10
- visual_keywords: list of 10 concrete visual concepts this song evokes
- song_duration: estimate in seconds based on latest timestamp"""}
        ]
    )
    return json.loads(response.choices[0].message.content)

def run_full_analysis(audio_path: str) -> dict:
    """Run transcription + analysis. Called by pipeline worker."""
    print(f"Transcribing {audio_path}...")
    transcript = transcribe_audio(audio_path)
    print("Analyzing song meaning...")
    analysis = analyze_song(transcript, audio_path)
    analysis["transcript"] = transcript
    return analysis
