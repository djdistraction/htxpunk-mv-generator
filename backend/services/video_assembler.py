"""
Stage 8: Final Video Assembly via FFmpeg
- Concatenates all 5-second clips in order
- Mixes in the original audio track, trims to song length
- Outputs final broadcast-quality MP4
"""
import subprocess
import tempfile
import httpx
from pathlib import Path
from utils.storage import upload_file_path


def assemble_video(
    project_id: str,
    clip_urls: list[str],
    audio_url: str,
    output_name: str = "final.mp4"
) -> str:
    """Downloads all clips + audio, concatenates with FFmpeg, uploads result."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # Download clips
        clip_paths = []
        for i, url in enumerate(clip_urls):
            p = tmp / f"clip_{i:04d}.mp4"
            p.write_bytes(httpx.get(url, timeout=120).content)
            clip_paths.append(p)

        # Download audio
        audio_path = tmp / "audio.mp3"
        audio_path.write_bytes(httpx.get(audio_url, timeout=60).content)

        # Write concat list
        concat_list = tmp / "concat.txt"
        concat_list.write_text(
            "\n".join([f"file '{p.as_posix()}'" for p in clip_paths])
        )

        # Step 1: Concatenate video (copy, no re-encode)
        concat_out = tmp / "concat.mp4"
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-c", "copy",
            str(concat_out)
        ], check=True, capture_output=True)

        # Step 2: Mix audio, encode final
        final_out = tmp / output_name
        subprocess.run([
            "ffmpeg", "-y",
            "-i", str(concat_out),
            "-i", str(audio_path),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "slow", "-crf", "18",
            "-c:a", "aac", "-b:a", "320k",
            "-shortest",
            "-movflags", "+faststart",
            str(final_out)
        ], check=True, capture_output=True)

        dest = f"projects/{project_id}/final/{output_name}"
        return upload_file_path(str(final_out), dest, content_type="video/mp4")
