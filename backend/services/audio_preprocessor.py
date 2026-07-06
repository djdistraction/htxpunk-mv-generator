"""
Audio preprocessing — runs after upload, before any AI interpretation.

Four steps, in order, all against the canonical mp3 (see convert_to_mp3):
  1. Read existing file metadata tags (title/artist/composer/album/length)
  2. Isolate a clean vocal stem (audio-separator)
  3. Transcribe that stem with faster-whisper (word-level timestamps)

BPM/Key detection is NOT here — it runs client-side via essentia.js before
upload even completes, since it's cheap enough to run in the browser and
doing so keeps it off this process's CPU budget entirely.
"""
import logging
import os
import shutil
import tempfile
from pathlib import Path

from services.video_assembler import find_ffmpeg

logger = logging.getLogger(__name__)

_ffmpeg_shim_dir: str | None = None


def _ensure_ffmpeg_on_path() -> None:
    """audio-separator shells out to a literal `ffmpeg` on PATH — it has no
    concept of imageio_ffmpeg's bundled (and non-literally-named, e.g.
    ffmpeg-linux-x86_64-v7.0.2) binary the rest of this app falls back to.
    Create a same-named symlink once and prepend its directory to PATH so
    audio-separator's own `subprocess.check_output(["ffmpeg", ...])` finds
    something, without requiring a system-wide ffmpeg install.
    """
    global _ffmpeg_shim_dir
    if shutil.which("ffmpeg"):
        return  # a real ffmpeg is already on PATH — nothing to do
    if _ffmpeg_shim_dir and os.path.exists(os.path.join(_ffmpeg_shim_dir, "ffmpeg")):
        if _ffmpeg_shim_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = _ffmpeg_shim_dir + os.pathsep + os.environ.get("PATH", "")
        return

    real_ffmpeg = find_ffmpeg()
    shim_dir = tempfile.mkdtemp(prefix="ffmpeg_shim_")
    shim_path = os.path.join(shim_dir, "ffmpeg" if os.name != "nt" else "ffmpeg.exe")
    try:
        os.symlink(real_ffmpeg, shim_path)
    except OSError:
        # Some Windows setups restrict symlink creation without elevation —
        # fall back to a real copy, which always works.
        shutil.copy2(real_ffmpeg, shim_path)
    os.chmod(shim_path, 0o755)

    _ffmpeg_shim_dir = shim_dir
    os.environ["PATH"] = shim_dir + os.pathsep + os.environ.get("PATH", "")
    logger.info("[audio_preprocessor] ffmpeg shim ready at %s", shim_path)


def convert_to_mp3(input_path: str, output_path: str) -> str:
    """Convert any accepted upload format to a canonical mp3. Everything
    downstream — metadata tags, vocal separation, transcription, the
    Create Project & Save copy — works off this one file, not whatever
    format the user originally uploaded.

    Already-mp3 uploads are copied verbatim rather than re-encoded: real
    time saved (no ffmpeg pass), and avoids a pointless lossy re-compression
    of a file that's already in the target format.
    """
    if Path(input_path).suffix.lower() == ".mp3":
        shutil.copy2(input_path, output_path)
        return output_path

    import subprocess

    ffmpeg = find_ffmpeg()
    cmd = [ffmpeg, "-y", "-i", input_path, "-codec:a", "libmp3lame", "-q:a", "2", output_path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"mp3 conversion failed for {input_path}:\n{result.stderr[-1500:]}")
    return output_path


def extract_metadata_tags(file_path: str) -> dict:
    """Read title/artist/composer/album/length from file tags, if present.
    Returns empty strings for anything not found — never raises, since a
    missing tag is normal, not an error.

    IMPORTANT: call this on the converted mp3, never the original upload.
    Tested directly: mutagen's easy-tag reader returns nothing for a .wav
    file's embedded metadata even when the tags are genuinely present and
    ffmpeg itself reads them fine — but ffmpeg reliably carries those same
    tags through into the converted mp3's ID3 tags, which mutagen then
    reads correctly. Converting first isn't just about the essentia.js
    decode concern; it's also what makes metadata extraction work at all
    for non-mp3 uploads.
    """
    from mutagen import File as MutagenFile

    result = {"title": "", "artist": "", "composer": "", "album": "", "length": None}
    try:
        f = MutagenFile(file_path, easy=True)
        if f is None:
            return result
        if f.info and getattr(f.info, "length", None):
            result["length"] = round(f.info.length, 2)
        if f.tags:
            for key in ("title", "artist", "composer", "album"):
                values = f.tags.get(key)
                if values:
                    result[key] = str(values[0])
    except Exception as e:
        logger.warning("[audio_preprocessor] metadata read failed for %s: %s", file_path, e)
    return result



# audio-separator's own default (model_bs_roformer_ep_317_sdr_12.9755.ckpt) is a
# transformer-based model with the best isolation quality available, but it's
# heavy enough that a single song measured ~80 minutes on a real CPU-only
# machine — impractical for actual use. Kim_Vocal_2 is a widely-used MDX-Net
# vocal model (ONNX, so CPU inference is well-optimized): noticeably lower
# separation quality than BS-Roformer, but a small fraction of the runtime.
VOCAL_MODEL = "Kim_Vocal_2.onnx"


def separate_vocals(mp3_path: str, output_dir: str) -> str:
    """Isolate a clean vocal stem from the full mix. Returns the path to the
    isolated vocals file.

    Raises on failure rather than silently falling back to the full mix —
    a silent fallback here would reintroduce exactly the transcription
    quality problem this step exists to fix, with no visible signal that
    it happened.
    """
    _ensure_ffmpeg_on_path()
    from audio_separator.separator import Separator

    separator = Separator(output_dir=output_dir, output_single_stem="Vocals")
    separator.load_model(model_filename=VOCAL_MODEL)
    output_files = separator.separate(mp3_path)
    if not output_files:
        raise RuntimeError(f"Vocal separation produced no output for {mp3_path}")

    vocals_path = output_files[0]
    if not os.path.isabs(vocals_path):
        vocals_path = str(Path(output_dir) / vocals_path)
    return vocals_path
