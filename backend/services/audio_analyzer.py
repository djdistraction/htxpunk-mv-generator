"""
Stage 1 — Audio Analysis
Transcription: faster-whisper (CPU, int8) — free, no API key needed.
  - Python 3.13 compatible replacement for openai-whisper
  - ~2x faster on CPU, lower memory usage
  - When you get a GPU: set device="cuda", compute_type="float16"
Analysis: Groq LLM — free tier.
"""
import json
from pathlib import Path
from openai import OpenAI
from config import settings
from utils.groq_json import call_groq_json

# Lazy-load model to avoid slow import at startup
_whisper_model = None

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import os
        # Work around a known huggingface_hub bug: the first WhisperModel(...)
        # call triggers a threaded snapshot_download() of the model files.
        # When progress bars are disabled (the default outside an interactive
        # terminal), huggingface_hub swaps in `disabled_tqdm`, which never
        # initializes the class-level `_lock` real tqdm sets up — so the
        # first thread to touch it crashes with
        # "type object 'disabled_tqdm' has no attribute '_lock'".
        # Forcing progress bars on avoids the broken stand-in entirely.
        os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "0")
        try:
            from huggingface_hub.utils import enable_progress_bars
            enable_progress_bars()
        except Exception:
            pass

        from faster_whisper import WhisperModel
        print(f"Loading faster-whisper '{settings.whisper_model}' model...")
        _whisper_model = WhisperModel(
            settings.whisper_model,
            device="cpu",
            compute_type="int8",  # most efficient on CPU
        )
    return _whisper_model

def _groq_client():
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1"
    )

def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio file using faster-whisper. Returns segments + word timestamps."""
    model = _get_whisper()
    segments_iter, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=True,  # skip silence automatically
    )

    segments = []
    full_text_parts = []
    for seg in segments_iter:
        words = []
        for w in (seg.words or []):
            words.append({
                "word": w.word.strip(),
                "start": round(w.start, 2),
                "end": round(w.end, 2),
            })
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": words,
        })
        full_text_parts.append(seg.text.strip())

    return {
        "language": info.language,
        "text": " ".join(full_text_parts),
        "segments": segments,
    }

def analyze_song(transcript: dict, audio_path: str,
                 creative_brief: str = "", reference_notes: str = "") -> dict:
    """Use Groq LLM to interpret the song's meaning and generate visual keywords.

    If the user supplied a creative brief or reference material, weave it in so
    the analysis reflects their vision rather than starting from a blank slate.
    """
    lyrics_with_timestamps = "\n".join(
        f"[{seg['start']:.1f}s] {seg['text']}" for seg in transcript["segments"]
    )

    context_block = ""
    if creative_brief.strip():
        context_block += (
            f"\n\nARTIST'S CREATIVE VISION (prioritize this — it is what they want):\n"
            f"\"{creative_brief.strip()}\""
        )
    if reference_notes.strip():
        context_block += (
            f"\n\nSUPPORTING REFERENCES the artist provided (characters, places, "
            f"mood boards, ideas):\n{reference_notes.strip()}"
        )

    client = _groq_client()
    system_prompt = (
        "You are a music video director analyzing a song for visual storytelling. "
        "Return a JSON object only. All numeric fields (start_time, end_time, "
        "timestamp, energy_level, song_duration) must be plain numbers in seconds, "
        "e.g. 87 or 87.5 — never expressions or formulas like 1.45 * 60."
    )
    user_prompt = f"""Analyze this song's lyrics and structure.

LYRICS WITH TIMESTAMPS:
{lyrics_with_timestamps}{context_block}

Return JSON with these fields:
- themes: list of 3-5 main themes
- mood: overall emotional tone (string)
- narrative_arc: how the story/emotion develops (string)
- sections: list of {{name, start_time, end_time, energy_level 1-10, description}} — start_time/end_time are plain numbers in seconds
- key_moments: list of {{timestamp, lyric, visual_opportunity}} for the 5-8 most visually compelling moments — timestamp is a plain number in seconds
- color_mood: 3 color words that match the song's feeling
- energy_level: overall 1-10
- visual_keywords: list of 10 concrete visual concepts this song evokes
- song_duration: estimate in seconds based on latest timestamp (plain number)"""

    content = call_groq_json(
        client, model=settings.groq_model, system=system_prompt,
        user=user_prompt, temperature=0.4,
    )
    return json.loads(content)

def run_full_analysis(audio_path: str, creative_brief: str = "",
                      reference_notes: str = "") -> dict:
    """Run transcription + analysis. Called by pipeline worker."""
    print(f"Transcribing {audio_path}...")
    transcript = transcribe_audio(audio_path)
    print("Analyzing song meaning...")
    analysis = analyze_song(transcript, audio_path,
                            creative_brief=creative_brief,
                            reference_notes=reference_notes)
    analysis["transcript"] = transcript
    return analysis
