import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { KenBurnsEffect } from "./types";

const CROSSFADE_FRAMES = 12; // ~0.5s at 25fps

interface PanelProps {
  imageSrc: string;
  effect: KenBurnsEffect;
  durationInFrames: number;
  fps: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  imageSrc,
  effect,
  durationInFrames,
  hasPrev,
  hasNext,
}) => {
  const frame = useCurrentFrame();
  const progress = frame / Math.max(durationInFrames - 1, 1);

  // ── Ken Burns motion ──────────────────────────────────────────────
  let scale = 1;
  let translateX = 0;

  switch (effect) {
    case "zoom-in":
      scale = interpolate(progress, [0, 1], [1.0, 1.15]);
      break;
    case "zoom-out":
      scale = interpolate(progress, [0, 1], [1.15, 1.0]);
      break;
    case "pan-right":
      scale = 1.1;
      translateX = interpolate(progress, [0, 1], [-3, 3]);
      break;
    case "pan-left":
      scale = 1.1;
      translateX = interpolate(progress, [0, 1], [3, -3]);
      break;
  }

  // ── Crossfade opacity ─────────────────────────────────────────────
  let opacity = 1;
  if (hasPrev && frame < CROSSFADE_FRAMES) {
    opacity = interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1]);
  }
  if (hasNext && frame > durationInFrames - CROSSFADE_FRAMES) {
    const fadeStart = durationInFrames - CROSSFADE_FRAMES;
    opacity = interpolate(frame, [fadeStart, durationInFrames], [1, 0]);
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={imageSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${translateX}%)`,
        }}
      />
    </AbsoluteFill>
  );
};
