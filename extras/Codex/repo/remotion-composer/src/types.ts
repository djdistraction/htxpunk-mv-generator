export type KenBurnsEffect = "zoom-in" | "zoom-out" | "pan-right" | "pan-left";

export interface PanelData {
  imageSrc: string;       // absolute local path or file:// URL
  startFrame: number;
  endFrame: number;
  effect: KenBurnsEffect;
  lyric?: string;         // lyric text to display over this panel
  energyLevel?: number;   // 0.0–1.0, drives particle density
}

export interface TimelineData {
  fps: number;
  durationInFrames: number;
  audioSrc: string;       // absolute local path or file:// URL
  panels: PanelData[];
}
