"""
Canonical WOW OH! production data.

Embedded so the demo seeds with no external file. This mirrors the WOW OH!
production shot sheet + continuity bible: a single magical venue that
transforms from corporate office-nightmare into a liberating dance club as
Mr. V discovers his power, ending on his glowing green eyes.
"""

CONTINUITY_BIBLE = {
    "core_concept": "Single continuous magical venue transformation",
    "visual_world": (
        "One nightclub venue that morphs from a cold corporate office-nightmare "
        "into a vibrant neon dance club as the protagonist gains confidence."
    ),
    "color_palette": ["poisonous green", "purple", "amber", "black", "hot pink"],
    "motion_style": "dynamic cuts, Ken Burns parallax, glitch transitions on stress beats",
    "transformation_logic": (
        "As Mr. V's confidence grows the venue shifts from grey corporate to "
        "saturated neon; lighting warms, the crowd swells."
    ),
    "office_nightmare_rules": [
        "sharp geometric layouts", "cold blue/grey lighting",
        "oppressive negative space", "Stress Monster looming",
    ],
    "final_image": "everything fades to black except Mr. V's glowing green eyes",
    "banned_mistakes": [
        "no context switching (office props in club or vice versa)",
        "Mr. V never looks less confident as the song progresses",
        "no outdoor scenery — it is all one venue",
        "no readable text or brand logos",
    ],
}

CHARACTERS = {
    "Mr_V": {
        "role": "Protagonist",
        "description": "stylish frontman who discovers his power through dance",
        "states": ["stressed", "gaining_confidence", "fully_confident", "glowing_triumphant"],
    },
    "DJ_Voodoo": {"role": "DJ", "description": "masked DJ conducting the venue's transformation"},
    "The_Dolls": {"role": "Dancers", "description": "stylized dancers who evolve with the venue"},
    "The_Boss": {"role": "Antagonist", "description": "the Stress Monster — embodiment of workplace dread"},
    "House_Band": {"role": "Band", "description": "live band energizing the room"},
}

STYLE_PROMPT = (
    "psychedelic electronic music video, glitch aesthetic, neon rim light, "
    "high contrast, cinematic, stylized animation"
)


def _shot(n, start, end, cue, location, chars, camera, action, mood, cont, neg, section, priority):
    return {
        "shot_number": str(n),
        "start_time": start,
        "end_time": end,
        "audio_cue": cue,
        "location": location,
        "characters": chars,
        "camera": camera,
        "action": action,
        "mood": mood,
        "continuity_rules": cont,
        "negative_constraints": neg,
        "section": section,
        "priority": priority,
    }


_OFFICE_NEG = ["no neon", "no club lighting", "no crowd"]
_CLUB_NEG = ["no daylight", "no office furniture", "no corporate grey"]

# 30 shots, ~185s total.
SHOTS = [
    _shot(1, "0:00", "0:06", "intro synth swell", "grey corporate office at night",
          ["Mr_V"], "slow push-in on a lone desk", "Mr. V slumped at a desk under a flickering fluorescent light",
          "oppressive", ["establish office-nightmare", "cold lighting"], _OFFICE_NEG, "Intro", "High"),
    _shot(2, "0:06", "0:12", "ticking clock", "office corridor",
          ["Mr_V", "The_Boss"], "wide, deep shadows", "The Stress Monster looms at the end of the corridor",
          "menacing", ["Stress Monster looming", "cold lighting"], _OFFICE_NEG, "Intro", "High"),
    _shot(3, "0:12", "0:18", "first beat hit", "office, desk",
          ["Mr_V"], "close-up on eyes", "A faint green spark flickers in Mr. V's eyes",
          "spark of hope", ["green spark foreshadows finale"], _OFFICE_NEG, "Intro", "High"),
    _shot(4, "0:18", "0:24", "bass drop teaser", "office wall dissolving",
          ["Mr_V"], "whip pan", "The office wall glitches, neon bleeding through the cracks",
          "transition", ["glitch transition", "begin transformation"], [], "Intro", "High"),
    _shot(5, "0:24", "0:30", "WOW OH! (verse 1)", "half-office half-club",
          ["Mr_V", "The_Dolls"], "tracking shot", "Mr. V stands as the room morphs around him, Dolls appear",
          "awakening", ["venue mid-transformation"], [], "Verse", "High"),
    _shot(6, "0:30", "0:36", "verse line 1", "club forming",
          ["Mr_V"], "low angle hero shot", "Mr. V straightens up, gaining confidence",
          "rising", ["Mr_V gaining confidence"], _CLUB_NEG, "Verse", "High"),
    _shot(7, "0:36", "0:42", "verse line 2", "club, dance floor",
          ["The_Dolls"], "medium, neon backlight", "The Dolls begin to dance, amber light sweeps",
          "playful", ["neon palette online"], _CLUB_NEG, "Verse", "Medium"),
    _shot(8, "0:42", "0:48", "pre-chorus build", "club, DJ booth",
          ["DJ_Voodoo"], "crane up", "DJ Voodoo raises hands, energy building",
          "building", ["DJ conducts transformation"], _CLUB_NEG, "Verse", "High"),
    _shot(9, "0:48", "0:55", "WOW OH! (chorus)", "club, main floor",
          ["Mr_V", "The_Dolls", "House_Band"], "sweeping wide", "Full chorus: Mr. V leads the dance, neon everywhere",
          "euphoric", ["peak neon", "Mr_V confident"], _CLUB_NEG, "Chorus1", "High"),
    _shot(10, "0:55", "1:01", "chorus hook", "club, above floor",
          ["Mr_V"], "overhead spin", "Mr. V spins, hot pink light trails",
          "euphoric", ["hot pink trails"], _CLUB_NEG, "Chorus1", "High"),
    _shot(11, "1:01", "1:07", "chorus line", "club, crowd",
          ["The_Dolls", "House_Band"], "handheld energy", "Crowd and band lock into the groove",
          "joyful", ["crowd swells"], _CLUB_NEG, "Chorus1", "Medium"),
    _shot(12, "1:07", "1:13", "chorus tail", "club wide",
          ["Mr_V", "The_Dolls"], "slow pull-back", "The whole venue pulses in unison",
          "triumphant", ["venue fully club"], _CLUB_NEG, "Chorus1", "Medium"),
    _shot(13, "1:13", "1:20", "stress verse", "office glitching back",
          ["Mr_V", "The_Boss"], "unstable dutch tilt", "The Stress Monster claws the club back toward office grey",
          "anxious", ["glitch back to stress", "Stress Monster returns"], [], "StressVerse", "High"),
    _shot(14, "1:20", "1:27", "stress line", "half-glitched venue",
          ["Mr_V"], "tight close-up", "Mr. V resists, jaw set, green glow intensifies",
          "defiant", ["Mr_V never less confident"], [], "StressVerse", "High"),
    _shot(15, "1:27", "1:33", "release", "venue snapping back to club",
          ["Mr_V", "DJ_Voodoo"], "fast push-in", "Mr. V banishes the Stress Monster, neon floods back",
          "liberating", ["release back to neon"], _CLUB_NEG, "ReleaseVerse", "High"),
    _shot(16, "1:33", "1:39", "release line", "club, full color",
          ["The_Dolls"], "orbit shot", "Dolls erupt in celebratory dance",
          "ecstatic", ["peak color"], _CLUB_NEG, "ReleaseVerse", "Medium"),
    _shot(17, "1:39", "1:46", "club showcase", "club, signature wide",
          ["Mr_V", "The_Dolls", "DJ_Voodoo", "House_Band"], "signature crane wide",
          "Hero shot of the entire transformed venue", "grand",
          ["showcase full cast"], _CLUB_NEG, "ClubShowcase", "High"),
    _shot(18, "1:46", "1:52", "WOW OH! (chorus 2)", "club, main floor",
          ["Mr_V", "The_Dolls"], "sweeping wide", "Second chorus bigger than the first",
          "euphoric", ["bigger than chorus1"], _CLUB_NEG, "Chorus2", "High"),
    _shot(19, "1:52", "1:58", "chorus 2 hook", "club, above",
          ["Mr_V"], "overhead spin", "Mr. V fully in command, green eyes blazing",
          "triumphant", ["Mr_V fully confident"], _CLUB_NEG, "Chorus2", "High"),
    _shot(20, "1:58", "2:04", "chorus 2 line", "club, crowd",
          ["The_Dolls", "House_Band"], "handheld", "Crowd at maximum energy",
          "joyful", ["max crowd"], _CLUB_NEG, "Chorus2", "Medium"),
    _shot(21, "2:04", "2:10", "chorus 2 tail", "club wide",
          ["Mr_V"], "pull-back", "The venue glows at full saturation",
          "euphoric", ["full saturation"], _CLUB_NEG, "Chorus2", "Medium"),
    _shot(22, "2:10", "2:17", "bridge", "club dimming for the bridge",
          ["Mr_V", "DJ_Voodoo"], "slow dolly", "Lights dim to a spotlight on Mr. V and DJ Voodoo",
          "intimate", ["bridge mood shift, still club"], _CLUB_NEG, "Bridge", "High"),
    _shot(23, "2:17", "2:23", "bridge line", "spotlight",
          ["Mr_V"], "tight portrait", "Mr. V quietly powerful, green eyes steady",
          "reflective", ["green eyes steady"], _CLUB_NEG, "Bridge", "Medium"),
    _shot(24, "2:23", "2:30", "final bridge build", "club re-igniting",
          ["Mr_V", "The_Dolls"], "rising crane", "Energy rebuilds, Dolls re-enter the light",
          "anticipation", ["rebuild to finale"], _CLUB_NEG, "FinalBridge", "High"),
    _shot(25, "2:30", "2:36", "final build 2", "club, full cast gathering",
          ["Mr_V", "DJ_Voodoo", "House_Band"], "wide", "The whole cast gathers for the final hit",
          "building", ["gather full cast"], _CLUB_NEG, "FinalBridge", "High"),
    _shot(26, "2:36", "2:42", "final build 3", "club, light columns",
          ["The_Dolls"], "low wide", "Columns of green and pink light erupt",
          "building", ["light columns"], _CLUB_NEG, "FinalBridge", "Medium"),
    _shot(27, "2:42", "2:48", "final build 4", "club, on Mr_V",
          ["Mr_V"], "push-in to face", "Camera races toward Mr. V's face",
          "climactic", ["approach finale"], _CLUB_NEG, "FinalBridge", "High"),
    _shot(28, "2:48", "2:55", "FINAL HIT — WOW OH!", "club exploding with light",
          ["Mr_V", "The_Dolls", "DJ_Voodoo", "House_Band"], "explosive wide",
          "The final hit: the venue detonates with neon, full cast freeze-frame", "climactic",
          ["biggest moment of the video"], _CLUB_NEG, "FinalHit", "High"),
    _shot(29, "2:55", "3:01", "outro fade", "venue fading to black",
          ["Mr_V"], "slow pull to black", "Everything fades except Mr. V",
          "resolving", ["begin fade to final image"], [], "Outro", "High"),
    _shot(30, "3:01", "3:05", "final image", "pure black",
          ["Mr_V"], "static close-up", "Only Mr. V's glowing green eyes remain in the dark",
          "iconic", ["final image: glowing green eyes only"], [], "Outro", "High"),
]

METADATA = {
    "title": "WOW OH!",
    "total_shots": len(SHOTS),
    "runtime_seconds": 185,
    "sections": "Intro, Verse, Chorus1, StressVerse, ReleaseVerse, ClubShowcase, "
                "Chorus2, Bridge, FinalBridge, FinalHit, Outro",
}
