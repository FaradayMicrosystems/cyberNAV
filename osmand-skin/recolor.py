#!/usr/bin/env python3
"""Phosphor HUD recolouring for OsmAnd.

Usage:
  recolor.py render <default.render.xml>   map style: every colour onto a phosphor-green ramp
  recolor.py colors <res/values/colors.xml> app theme: dark-theme greys and accents onto the HUD palette

The map style is used in night mode (the skin makes night the default), so the ramp keeps each
colour's brightness and swaps its hue for phosphor green: dark ground, dim areas, bright roads,
labels and route. Strong reds stay red so warnings still read as warnings.
"""
import re, sys, colorsys

# Phosphor HUD ramp (docs/phosphor-hud tokens): ground -> panel -> line -> phosphor -> highlight
RAMP = [(0.00, (0x02, 0x05, 0x03)), (0.18, (0x07, 0x14, 0x0a)), (0.38, (0x16, 0x3a, 0x1a)),
        (0.60, (0x4e, 0x7a, 0x2c)), (0.82, (0xb8, 0xff, 0x7a)), (1.00, (0xe4, 0xff, 0xc8))]
HEX = re.compile(r"#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})\b")

def ramp(t):
    t = max(0.0, min(1.0, t))
    for (a, ca), (b, cb) in zip(RAMP, RAMP[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(round(x + (y - x) * k) for x, y in zip(ca, cb))
    return RAMP[-1][1]

def lum(r, g, b):
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

def is_alert(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return s > 0.55 and l > 0.25 and (h < 0.03 or h > 0.95)  # saturated red

def recolor(hexstr, boost=0.0):
    a = None
    if len(hexstr) == 8: a, rgb = hexstr[:2], hexstr[2:]
    else: rgb = hexstr
    r, g, b = (int(rgb[i:i + 2], 16) for i in (0, 2, 4))
    if is_alert(r, g, b): nr, ng, nb = 0xff, 0x5a, 0x44  # --signal-alert
    else:
        # Saturated colours (roads, routes, highlights) get a lift so they glow over areas.
        _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        nr, ng, nb = ramp(lum(r, g, b) ** 0.85 + 0.12 * s + boost)
    out = f"{nr:02X}{ng:02X}{nb:02X}"
    return "#" + (a + out if a else out)

def render(path):
    s = open(path, encoding="utf-8").read()
    s = HEX.sub(lambda m: recolor(m.group(1)), s)
    s = s.replace('<renderingStyle name="default"', '<renderingStyle name="default" cybernav="phosphor-hud"', 1)
    open(path, "w", encoding="utf-8").write(s)

# App theme: only dark-theme and accent colours are touched; the light theme stays OsmAnd's.
ACCENTS = {"active_color_primary_dark", "active_color_primary_dark_v2", "app_bar_active_dark",
           "active_buttons_and_links_text_dark", "icon_color_active_dark", "switch_button_active_dark",
           "color_dialog_buttons_dark", "nav_track", "osmand_orange", "color_osm_edit_create"}

def colors(path):
    s = open(path, encoding="utf-8").read()
    def sub(m):
        name, val = m.group(1), m.group(2)
        if name in ACCENTS: return m.group(0).replace(val, "#B8FF7A")
        if name.endswith("_dark") or "_dark_" in name:
            return m.group(0).replace(val, recolor(val.lstrip("#")))
        return m.group(0)
    s = re.sub(r'<color name="([^"]+)">(#[0-9A-Fa-f]{6,8})</color>', sub, s)
    open(path, "w", encoding="utf-8").write(s)

if __name__ == "__main__":
    {"render": render, "colors": colors}[sys.argv[1]](sys.argv[2])
