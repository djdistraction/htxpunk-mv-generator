"""
Stage 1 — Audio Analysis
Transcription: faster-whisper (CPU, int8) — free, no API key needed.
  - Python 3.13 compatible replacement for openai-whisper
  - ~2x faster on CPU, lower memory usage
  - When you get a GPU: set device="cuda", compute_type="float16"
Analysis: Groq LLM — free tier.
"""
import json
import re
from pathlib import Path
from openai import OpenAI
from config import settings

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


def _has_groq_key() -> bool:
    key = (settings.groq_api_key or "").strip()
    return bool(key and not key.endswith("_HERE"))


def _fallback_analysis(transcript: dict, creative_brief: str = "", reference_notes: str = "") -> dict:
    """Offline analysis used when no Groq key is configured."""
    segments = transcript.get("segments", [])
    duration = max((float(seg.get("end", 0.0)) for seg in segments), default=180.0)
    duration = max(duration, 30.0)

    section_names = ["intro", "verse", "chorus", "outro"]
    section_span = duration / len(section_names)
    sections = []
    for i, name in enumerate(section_names):
        start = round(i * section_span, 2)
        end = round(duration if i == len(section_names) - 1 else (i + 1) * section_span, 2)
        sections.append({
            "name": name,
            "start_time": start,
            "end_time": end,
            "energy_level": min(10, 4 + i * 2),
            "description": f"{name.title()} section for guided visual planning.",
        })

    if segments:
        sample_step = max(1, len(segments) // 6)
        sampled = segments[::sample_step][:6]
        key_moments = [
            {
                "timestamp": round(float(seg.get("start", 0.0)), 2),
                "lyric": (seg.get("text") or "").strip()[:140],
                "visual_opportunity": "Anchor this moment with a distinct shot or camera move.",
            }
            for seg in sampled
        ]
    else:
        key_moments = []

    source_text = " ".join([transcript.get("text", ""), creative_brief, reference_notes]).lower()
    words = re.findall(r"[a-z]{4,}", source_text)
    seen = set()
    keywords = []
    for w in words:
        if w not in seen:
            seen.add(w)
            keywords.append(w)
        if len(keywords) >= 10:
            break
    if len(keywords) < 10:
        keywords.extend([
            "performance", "symbolic", "contrast", "rhythm", "movement",
            "portrait", "atmosphere", "lighting", "texture", "silhouette",
        ])
    keywords = keywords[:10]

    return {
        "themes": ["performance", "emotion", "visual storytelling"],
        "mood": "guided production mode",
        "narrative_arc": "Build visual intensity over time, then resolve in the final section.",
        "sections": sections,
        "key_moments": key_moments,
        "color_mood": ["neon purple", "midnight blue", "warm amber"],
        "energy_level": 6,
        "visual_keywords": keywords,
        "song_duration": round(duration, 2),
    }

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

    if not _has_groq_key():
        return _fallback_analysis(transcript, creative_brief=creative_brief, reference_notes=reference_notes)

    try:
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
{lyrics_with_timestamps}{context_block}

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
    except Exception:
        return _fallback_analysis(transcript, creative_brief=creative_brief, reference_notes=reference_notes)

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
