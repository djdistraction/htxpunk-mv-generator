import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

interface ParticlesProps {
  energyLevel: number;
  durationInFrames: number;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export const Particles: React.FC<ParticlesProps> = ({ energyLevel, durationInFrames }) => {
  const frame = useCurrentFrame();
  const particleCount = Math.floor(energyLevel * 30);

  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      x: seededRandom(i * 7) * 100,
      y: seededRandom(i * 13) * 100,
      size: 2 + seededRandom(i * 17) * 8,
      speed: 0.3 + seededRandom(i * 23) * 0.7,
      opacity: 0.3 + seededRandom(i * 31) * 0.5,
      hue: Math.floor(seededRandom(i * 41) * 360),
    }));
  }, [particleCount]);

  const progress = frame / durationInFrames;
  const globalOpacity = progress < 0.1 ? progress / 0.1 : progress > 0.9 ? (1 - progress) / 0.1 : 1;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute" }}>
        {particles.map((p, i) => {
          const drift = (frame * p.speed * 0.3) % 100;
          const cy = ((p.y - drift) % 100 + 100) % 100;
          const twinkle = p.opacity * (0.6 + 0.4 * Math.sin((frame * 0.15 + i) * p.speed));
          return (
            <circle
              key={i}
              cx={`${p.x}%`}
              cy={`${cy}%`}
              r={p.size}
              fill={`hsla(${p.hue}, 90%, 80%, ${twinkle * globalOpacity})`}
              style={{ filter: "blur(1px)" }}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
