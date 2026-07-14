# Studio v2 — Product pipeline

Canonical spine for HTXpunk Music Video Studio (greenfield `studio/`).

## Alignment note (2026-07-14)

**Element image locking** means real image files as visual references when
building storyboard frames — not text nicknames like `character01` alone.
Text prompts describe action/camera; identity comes from approved element stills
(composited and/or image-conditioned generation).

**Linked motion** uses start/end storyboard frames where the model allows, with
a stills-timed backbone and hero I2V where free GPU budget allows.

**Modal lip sync** is final polish only, after approved base video; free minutes protected.

## Pipeline

1. Foundation (song, rhythm, vocals, lyrics, understanding) — jobs + editable  
2. Treatment — human approve  
3. Element plan (background / foreground / character / object / extra + time ranges)  
4. Element images — approve each still (locked assets)  
5. Storyboard frames — prompts + **visual refs** to element images  
6. Linked clips (frame i → i+1) + stitch → base video  
7. Modal lip sync → user picks final  

Parallel early deliverable: Lyric Video from foundation (Remotion).

See plan approval thread and `quality-ladder.md`.
