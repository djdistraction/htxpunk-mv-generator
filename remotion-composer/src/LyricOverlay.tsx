import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";

interface LyricOverlayProps {
  text: string;
  durationInFrames: number;
}

export const LyricOverlay: React.FC<LyricOverlayProps> = ({
  text,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const ANIM_FRAMES = 8;
  // A segment shorter than 2*ANIM_FRAMES can't fit a fade-in and fade-out
  // without the interpolate() input range going non-monotonic (e.g.
  // [0, 8, -7, 1] for a 1-frame segment) — confirmed as a real crash via a
  // real forced-alignment segment shorter than expected, not a hypothetical.
  // Below that length, skip the animation and just show static text rather
  // than throwing.
  const canAnimate = durationInFrames > ANIM_FRAMES * 2;

  const translateY = canAnimate
    ? interpolate(frame, [0, ANIM_FRAMES], [20, 0], { extrapolateRight: "clamp" })
    : 0;

  const opacity = canAnimate
    ? interpolate(
        frame,
        [0, ANIM_FRAMES, durationInFrames - ANIM_FRAMES, durationInFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 1;

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 80 }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          fontFamily: "'Arial Black', Impact, sans-serif",
          fontSize: 64,
          fontWeight: 900,
          color: "#fff",
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.2,
          textShadow: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 20px rgba(0,0,0,0.9)",
          letterSpacing: "0.02em",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
