"""
Exports a project's full state as a Markdown continuity bible document.
"""
from database import get_db
from datetime import datetime


def export_bible(project_id: str) -> str:
    db = get_db()
    project = db.table("projects").select("*").eq("id", project_id).single().execute().data
    assets = db.table("assets").select("*").eq("project_id", project_id).execute().data

    treatment = project.get("treatment", {})
    elements = project.get("elements", {})

    def assets_of(t): return [a for a in assets if a["asset_type"] == t]

    lines = [
        f"# 📖 CONTINUITY BIBLE — {project['title']} by {project['artist']}",
        f"*Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*",
        f"*Project ID: {project_id}*  |  *Stage: {project['stage']}*",
        "", "---", "",
        "## 🎯 Logline", treatment.get("logline", "_pending_"), "",
        "## 🎨 Visual Style", treatment.get("visual_style", "_pending_"), "",
        "## 🌈 Color Palette",
    ]
    palette = treatment.get("color_palette", {})
    if palette:
        lines += [
            f"**Primary:** {', '.join(palette.get('primary', []))}",
            f"**Secondary:** {', '.join(palette.get('secondary', []))}",
            f"**Accent:** {', '.join(palette.get('accent', []))}",
        ]
    lines += [
        "", "## 📝 Style Prompt Suffix",
        "```", treatment.get("image_gen_style_prompt", "_pending_"), "```",
        "", "---", "", "## 👤 Characters",
    ]
    for char in elements.get("characters", []):
        lines += [f"### {char['name']} (`{char['id']}`)",
                  f"**Appearance:** {char['base_appearance']}", "",
                  "| State | Asset URL |", "|-------|-----------|"]
        char_assets = {a["metadata"].get("state_id"): a["url"]
                       for a in assets_of("element") if char["id"] in a["metadata"].get("state_id", "")}
        for state in char.get("states", []):
            lines.append(f"| {state['state_name']} | {char_assets.get(state['state_id'], '_pending_')} |")
        lines.append("")

    lines += ["---", "", "## 🗺️ Backgrounds", ""]
    for bg in elements.get("backgrounds", []):
        bg_url = next((a["url"] for a in assets_of("background") if a["metadata"].get("id") == bg["id"]), "_pending_")
        lines += [f"### {bg['name']} (`{bg['id']}`)",
                  f"**Asset:** {bg_url}", f"**Prompt:** {bg['image_prompt']}", ""]

    lines += ["---", "", "## 🎞️ Storyboard", "",
              "| Clip | Frame | Time | Scene | Panel |",
              "|------|-------|------|-------|-------|"]
    panels = sorted(assets_of("storyboard_panel"),
                    key=lambda p: (p["metadata"].get("clip_index", 0), p["metadata"].get("frame_type", "")))
    for p in panels:
        m = p["metadata"]
        lines.append(f"| {m.get('clip_index')} | {m.get('frame_type')} | {m.get('timestamp_start', '')}s | {m.get('scene_description','')[:50]} | {p['url']} |")

    if project.get("video_url"):
        lines += ["", "---", "", "## ✅ Final Video", "", f"**{project['video_url']}**"]

    return "\n".join(lines)
