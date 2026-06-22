import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
} from "remotion";
import type { TimelineData } from "./types";
import { Panel } from "./Panel";
import { LyricOverlay } from "./LyricOverlay";
import { Particles } from "./Particles";

export const MusicVideo: React.FC<TimelineData> = ({
  audioSrc,
  panels,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Audio track */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* Panel sequences — crossfade handled inside Panel */}
      {panels.map((panel, i) => {
        const duration = panel.endFrame - panel.startFrame;
        return (
          <Sequence
            key={i}
            from={panel.startFrame}
            durationInFrames={duration}
            name={`Panel-${i}`}
          >
            <Panel
              imageSrc={panel.imageSrc}
              effect={panel.effect}
              durationInFrames={duration}
              fps={fps}
              hasPrev={i > 0}
              hasNext={i < panels.length - 1}
            />

            {/* Particle overlay, energy-driven */}
            {(panel.energyLevel ?? 0) > 0.3 && (
              <Particles
                energyLevel={panel.energyLevel ?? 0.5}
                durationInFrames={duration}
              />
            )}

            {/* Lyric overlay */}
            {panel.lyric && (
              <LyricOverlay text={panel.lyric} durationInFrames={duration} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
