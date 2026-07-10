import React from "react";
import { Composition } from "remotion";
import { MusicVideo } from "./MusicVideo";
import { LyricVideo } from "./LyricVideo";
import type { TimelineData, LyricVideoData } from "./types";

export const Root: React.FC = () => {
  const defaultTimeline: TimelineData = {
    fps: 25,
    durationInFrames: 375,
    audioSrc: "",
    panels: [],
  };

  const defaultLyricVideo: LyricVideoData = {
    fps: 25,
    durationInFrames: 375,
    audioSrc: "",
    segments: [],
    backgroundColor: "#111111",
  };

  return (
    <>
      <Composition
        id="MusicVideo"
        component={MusicVideo}
        durationInFrames={defaultTimeline.durationInFrames}
        fps={defaultTimeline.fps}
        width={1920}
        height={1080}
        defaultProps={defaultTimeline}
      />
      <Composition
        id="LyricVideo"
        component={LyricVideo}
        durationInFrames={defaultLyricVideo.durationInFrames}
        fps={defaultLyricVideo.fps}
        width={1920}
        height={1080}
        defaultProps={defaultLyricVideo}
        // Without this, durationInFrames/fps above are static — a render
        // passing different values via --props renders for the hardcoded
        // default length regardless of what the props say. Confirmed as a
        // real bug during development: props correctly specified 150 frames
        // (6s), but the render came out 375 frames (15s), silently reusing
        // this composition's placeholder default. calculateMetadata is what
        // makes the *actual* per-render props (not just defaultProps) drive
        // the real output length.
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
        })}
      />
    </>
  );
};
