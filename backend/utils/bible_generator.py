"""
Exports a project's full state as a Markdown continuity bible document.
"""
from database import db_get_project, db_get_assets
from datetime import datetime


def export_bible(project_id: str) -> str:
    project = db_get_project(project_id)
    if not project:
        return f"# Error: project {project_id} not found"
    assets = db_get_assets(project_id)

    treatment = project.get("treatment") or {}
    elements = project.get("elements") or {}

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
        # elem assets have state_id unpacked from metadata
        char_assets = {a.get("state_id"): a.get("url")
                       for a in assets_of("element")
                       if char["id"] in (a.get("state_id") or "")}
        for state in char.get("states", []):
            lines.append(f"| {state['state_name']} | {char_assets.get(state['state_id'], '_pending_')} |")
        lines.append("")

    lines += ["---", "", "## 🗺️ Backgrounds", ""]
    for bg in elements.get("backgrounds", []):
        # background assets store the extractor id as elem_id
        bg_url = next((a["url"] for a in assets_of("background")
                       if a.get("elem_id") == bg["id"]), "_pending_")
        lines += [f"### {bg['name']} (`{bg['id']}`)",
                  f"**Asset:** {bg_url}", f"**Prompt:** {bg.get('image_prompt', bg.get('prompt', ''))}", ""]

    lines += ["---", "", "## 🎞️ Storyboard", "",
              "| Panel | Time | Scene | URL |",
              "|-------|------|-------|-----|"]
    panels = sorted(assets_of("panel"),
                    key=lambda p: p.get("panel_index", 0))
    for p in panels:
        lines.append(
            f"| {p.get('panel_index', '')} | — | {str(p.get('scene_description', ''))[:50]} | {p.get('url', '')} |"
        )

    if project.get("video_url"):
        lines += ["", "---", "", "## ✅ Final Video", "", f"**{project['video_url']}**"]

    return "\n".join(lines)
