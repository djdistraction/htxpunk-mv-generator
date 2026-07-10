import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
} from "remotion";
import type { LyricVideoData } from "./types";
import { LyricOverlay } from "./LyricOverlay";

// Lyric Video v1: captions timed to the approved transcript, rendered over a
// flat color or gradient background — zero dependency on Panel, per-shot
// images, element extraction, or shot manifests. Reuses LyricOverlay.tsx as
// the same well-built caption component the Cinematic pipeline already uses,
// just without needing an AI-generated image behind it.
export const LyricVideo: React.FC<LyricVideoData> = ({
  audioSrc,
  segments,
  backgroundColor,
  backgroundGradient,
}) => {
  const { fps } = useVideoConfig();

  const background = backgroundGradient
    ? `linear-gradient(135deg, ${backgroundGradient[0]}, ${backgroundGradient[1]})`
    : backgroundColor || "#111111";

  return (
    <AbsoluteFill style={{ background }}>
      {audioSrc && <Audio src={audioSrc} />}

      {segments.map((segment, i) => {
        const startFrame = Math.max(0, Math.round(segment.start * fps));
        const endFrame = Math.round(segment.end * fps);
        const durationInFrames = Math.max(1, endFrame - startFrame);
        if (!segment.text?.trim()) return null;

        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={durationInFrames}
            name={`Lyric-${i}`}
          >
            <LyricOverlay text={segment.text} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
