import React from "react";
import { Composition } from "remotion";
import { MusicVideo } from "./MusicVideo";
import type { TimelineData } from "./types";

export const Root: React.FC = () => {
  const defaultTimeline: TimelineData = {
    fps: 25,
    durationInFrames: 375,
    audioSrc: "",
    panels: [],
  };

  return (
    <Composition
      id="MusicVideo"
      component={MusicVideo}
      durationInFrames={defaultTimeline.durationInFrames}
      fps={defaultTimeline.fps}
      width={1920}
      height={1080}
      defaultProps={defaultTimeline}
    />
  );
};
