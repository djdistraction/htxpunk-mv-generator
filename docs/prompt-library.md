# 📚 Prompt Library

Reusable prompt patterns for each pipeline stage. Use these for testing or manual generation.

---

## Stage 1 — Audio Analysis (GPT-4o)
See `services/audio_analyzer.py → analyze_song()`.
Inputs: Whisper timestamped segments.
Outputs: themes, mood, sections, key moments, visual keywords.

**Tips:**
- If lyrics are unclear, run Whisper with `language="en"` to force English
- For instrumental sections, GPT-4o will infer mood from section context

---

## Stage 2 — Visual Treatment (GPT-4o)
See `services/treatment_generator.py`.
Inputs: song analysis + raw lyrics.
Outputs: logline, visual style, color palette, characters, locations.

**Tips:**
- Temperature 0.85 gives more creative, unexpected results
- Add "Be bold and specific. Avoid clichés." to push for originality
- If treatment feels generic, include genre and reference artists in the prompt

---

## Stage 3 — Element Extraction (GPT-4o)
See `services/element_extractor.py`.
Inputs: approved treatment + song sections.
Outputs: complete element registry with image gen prompts.

**Tips:**
- Review the element list before generating — fewer elements = cheaper + more consistent
- Aim for 3–5 character states and 2–4 backgrounds per song

---

## Stages 4-5 — Image Generation (FLUX.1)

**Background prompt structure:**
```
[Location description]. Wide establishing shot. No people or figures.
Static background. [Time of day]. [Weather/atmosphere]. [Lighting details].
[style_suffix]
```

**Element prompt structure:**
```
[Character name and appearance], [pose/state description].
Full body shot. Plain white background. Centered. No shadows on background.
[style_suffix]
```

**Consistency tip:** Always append the project style suffix. For characters,
reuse the same seed value across regenerations to maintain appearance.

---

## Stage 6 — Scene Planning (GPT-4o)
See `services/storyboard_builder.py`.
Inputs: treatment, element registry with all state IDs, song segments.
Outputs: ordered panel list mapping timestamps to visual compositions.

**Tips:**
- Ensure every clip_index has both "open" and "close" panels
- Open→close changes should be subtle for smooth animation (e.g., expression shift)
- For high-energy chorus sections, more dramatic element changes work well

---

## Stage 7 — Video Generation (RunwayML Gen-4)

**Scene description prompt structure:**
```
Smooth cinematic [action description]. [mood]. Camera [static/slow pan/push in].
```

**Tips:**
- Short, specific prompts work better than long ones for Gen-4
- Very similar frame pairs = subtle, realistic motion
- Very different frame pairs = more dramatic but potentially less stable motion
- Use `gen4_turbo` for speed (same quality, 2x faster than standard)
