"""
Stage 1: Audio Analysis
- Transcribes audio with word-level timestamps via OpenAI Whisper
- Analyzes song structure, themes, and mood via GPT-4o
"""
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)


def transcribe_audio(audio_path: str) -> dict:
    """Returns word-level timestamped transcript from Whisper."""
    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"]
        )
    return {
        "text": response.text,
        "segments": [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in response.segments
        ],
        "words": [
            {"word": w.word, "start": w.start, "end": w.end}
            for w in (response.words or [])
        ],
        "duration": response.duration,
        "language": response.language
    }


def analyze_song(transcript: dict) -> dict:
    """Uses GPT-4o to extract themes, mood, structure, and narrative arc."""
    prompt = f"""You are a creative director analyzing a song for music video production.

LYRICS WITH TIMESTAMPS:
{json.dumps(transcript["segments"], indent=2)}

SONG DURATION: {transcript["duration"]} seconds

Analyze this song and return a JSON object with this structure:
{{
  "themes": ["theme1", "theme2"],
  "mood": "overall emotional tone",
  "narrative_arc": "2-3 sentence story/emotional journey",
  "sections": [
    {{"name": "intro|verse|chorus|bridge|outro",
      "start_time": 0.0, "end_time": 30.0,
      "lyric_summary": "what is expressed here",
      "emotional_peak": false}}
  ],
  "key_moments": [
    {{"time": 45.2, "lyric": "specific lyric",
      "significance": "why this matters visually"}}
  ],
  "color_mood": "warm/cool/dark/bright/etc",
  "energy_level": "low/medium/high/building/explosive",
  "visual_keywords": ["keyword1", "keyword2", "keyword3"]
}}
Return ONLY valid JSON."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7
    )
    return json.loads(response.choices[0].message.content)


def run_full_analysis(audio_path: str) -> dict:
    """Runs the complete Stage 1 analysis pipeline."""
    transcript = transcribe_audio(audio_path)
    analysis = analyze_song(transcript)
    return {"transcript": transcript, "analysis": analysis}
