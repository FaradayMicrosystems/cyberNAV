#!/usr/bin/env python3
"""Phosphor HUD recolouring for OsmAnd.

Usage:
  recolor.py render <default.render.xml>   map style: every colour onto a phosphor-green ramp
  recolor.py colors <res/values/colors.xml> app theme: dark-theme greys and accents onto the HUD palette

Night map: each colour keeps its brightness and takes phosphor green: dark ground, dim areas, bright
roads, labels and route. Day (light) map: the same monochrome look as dark ink on pale phosphor
paper, for reading in sunlight. Strong reds stay red so warnings still read as warnings.

Then the night map is stripped down to a cold, minimal display (minimal_night): pure black ground,
phosphor-green main roads, softer green side streets, a yellow route, and nothing else (no areas,
water, labels, icons, rails or paths). Buildings keep their rules, so 3D buildings still draw.
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

# Daylight ramp (light mode): luminance onto ink-on-paper phosphor tones, readable in sun.
PAPER = [(0.00, (0x06, 0x16, 0x0a)), (0.35, (0x1b, 0x42, 0x1e)), (0.60, (0x4f, 0x7a, 0x3c)),
         (0.78, (0xa3, 0xbf, 0x91)), (0.90, (0xd2, 0xe2, 0xc4)), (1.00, (0xf4, 0xf9, 0xee))]

def ramp_on(stops, t):
    t = max(0.0, min(1.0, t))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(round(x + (y - x) * k) for x, y in zip(ca, cb))
    return stops[-1][1]

def recolor_day(hexstr):
    a = None
    if len(hexstr) == 8: a, rgb = hexstr[:2], hexstr[2:]
    else: rgb = hexstr
    r, g, b = (int(rgb[i:i + 2], 16) for i in (0, 2, 4))
    if is_alert(r, g, b): nr, ng, nb = 0xc8, 0x32, 0x1e  # alert red, darkened for daylight
    else:
        # Areas stay pale; saturated colours (main roads, route, highlights) sit a little darker so
        # they stand out, and text and lines read as dark ink.
        _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        nr, ng, nb = ramp_on(PAPER, lum(r, g, b) - 0.12 * s)
    out = f"{nr:02X}{ng:02X}{nb:02X}"
    return "#" + (a + out if a else out)

# Rule tags as OsmAnd's parser sees them (RenderingRulesStorage): case/switch rules can hold
# apply/apply_if children, which load after the rule and override it.
CASES = {"case", "filter", "switch", "group"}
APPLIES = {"apply", "apply_if", "groupFilter"}
FULLHEX = re.compile(r"#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})")

def colour_attrs(e):
    return [k for k, v in e.attrib.items() if FULLHEX.fullmatch(v)]

def attrs_set_below(e):
    """Attributes set by any rule nested in e that can apply in night mode."""
    out = set()
    def walk(x):
        for c in x:
            if not isinstance(c.tag, str) or c.get("nightMode") == "false": continue
            out.update(c.attrib); walk(c)
    walk(e)
    return out

def render(path):
    """Night branches get the phosphor ramp, day branches the paper ramp. A colour shared by both
    modes becomes the paper colour plus an added <apply_if nightMode="true"> child with the phosphor
    colour. The added override loads after nested rules, so it is only added when no nested rule
    sets the same attribute; otherwise that colour keeps the phosphor value in both modes."""
    import xml.etree.ElementTree as ET
    tree = ET.parse(path, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True)))
    root = tree.getroot()
    stats = {"night": 0, "day": 0, "split": 0, "shared": 0}

    def walk(e, ctx):
        if not isinstance(e.tag, str): return
        nm = e.get("nightMode")
        ctx = "night" if nm == "true" else "day" if nm == "false" else ctx
        attrs = colour_attrs(e)
        if attrs:
            if ctx == "night":
                for k in attrs: e.set(k, recolor(e.get(k)[1:])); stats["night"] += 1
            elif ctx == "day":
                for k in attrs: e.set(k, recolor_day(e.get(k)[1:])); stats["day"] += 1
            elif e.tag == "renderingConstant":
                name = e.get("name", "")
                day = name.endswith("_day") or name.endswith("Day")
                for k in attrs:
                    e.set(k, recolor_day(e.get(k)[1:]) if day else recolor(e.get(k)[1:]))
                    stats["day" if day else "shared"] += 1
            else:
                night_set = set()
                for c in e:
                    if isinstance(c.tag, str) and c.get("nightMode") == "true":
                        night_set.update(c.attrib)
                below = attrs_set_below(e) if (e.tag in CASES or e.tag in APPLIES) else None
                night_vals = {}
                for k in attrs:
                    v = e.get(k)[1:]
                    if k in night_set:  # night already overrides it: day-only colour
                        e.set(k, recolor_day(v)); stats["day"] += 1
                    elif below is not None and k not in below:
                        e.set(k, recolor_day(v)); night_vals[k] = recolor(v); stats["split"] += 1
                    else:
                        e.set(k, recolor(v)); stats["shared"] += 1
                if night_vals:
                    n = ET.Element("apply_if", {"nightMode": "true", **night_vals})
                    first = next((i for i, c in enumerate(e) if isinstance(c.tag, str) and c.tag in APPLIES), len(e))
                    e.insert(first, n)
        for c in list(e):
            walk(c, ctx)

    for k in colour_attrs(root):  # style-level defaultColor (day fallback)
        root.set(k, recolor_day(root.get(k)[1:]))
    for c in list(root):
        walk(c, None)
    minimal_night(root)
    root.set("cybernav", "phosphor-hud")
    tree.write(path, encoding="utf-8", xml_declaration=True)
    print("  render colours:", ", ".join(f"{k} {v}" for k, v in stats.items()))

# Night map, minimal: what stays visible at night, and in which colour.
NIGHT_GROUND = "#000000"   # pure black land, water and sky
MAIN_ROAD = "#B8FF7A"      # phosphor (HUD token "phosphor"), as in the cyberNAV UI
SIDE_ROAD = "#668E44"      # the same green, softer (HUD token "ink-muted": phosphor at ~55% over black)
ROUTE = "#FFDF3D"          # active route: yellow
KEEP_POLYGONS = {"building", "building:part"}  # buildings keep drawing (3D wireframe)
# highway value -> (colour, min zoom, widths by zoom band)
MAIN_W = [(9, "1"), (12, "1.5"), (14, "2:2"), (16, "3:3"), (18, "4.5:4.5"), (None, "6:6")]
SIDE_W = [(14, "1:1"), (16, "1.5:1.5"), (18, "2.5:2.5"), (None, "3.5:3.5")]
NIGHT_ROADS = {
    **{v: (MAIN_ROAD, 5, MAIN_W) for v in ("motorway", "motorway_link", "trunk", "trunk_link")},
    **{v: (MAIN_ROAD, 8, MAIN_W) for v in ("primary", "primary_link")},
    **{v: (MAIN_ROAD, 10, MAIN_W) for v in ("secondary", "secondary_link")},
    **{v: (MAIN_ROAD, 12, MAIN_W) for v in ("tertiary", "tertiary_link")},
    **{v: (SIDE_ROAD, 13, SIDE_W) for v in ("residential", "unclassified", "living_street", "road")},
    **{v: (SIDE_ROAD, 15, SIDE_W) for v in ("service", "pedestrian", "track", "busway")},
}

def top_rules(section):
    """(parent, rule) for every rule the style parsers register by tag/value: top-level cases,
    and the cases inside top-level switches that have no tag/value of their own."""
    out = []
    def walk(parent):
        for c in list(parent):
            if not isinstance(c.tag, str) or c.tag not in CASES: continue
            if c.get("tag") is not None and c.get("value") is not None: out.append((parent, c))
            else: walk(c)
    walk(section)
    return out

def night_off(section, keep=lambda rule: False):
    """Every rule in the section stops matching at night (no match = nothing drawn)."""
    n = 0
    for parent, rule in top_rules(section):
        if keep(rule): continue
        if rule.get("nightMode") == "true": parent.remove(rule)
        else: rule.set("nightMode", "false")
        n += 1
    return n

def minimal_night(root):
    import xml.etree.ElementTree as ET
    stats = {}
    for a in root.iter("renderingAttribute"):
        if a.get("name") == "defaultColor":  # map ground at night: pure black
            for c in a.iter():
                if c.get("nightMode") == "true" and c.get("attrColorValue"): c.set("attrColorValue", NIGHT_GROUND)
        elif a.get("name") == "route":  # active route at night: yellow line, green turn arrows
            for c in a.iter():
                if c.get("nightMode") == "true":
                    c.set("color", ROUTE); c.set("color_0", "#00000000"); c.set("color_2", "#806F1F"); c.set("color_3", MAIN_ROAD)
    stats["labels"] = night_off(root.find("text"))
    stats["icons"] = night_off(root.find("point"))
    stats["areas"] = night_off(root.find("polygon"), keep=lambda r: r.get("tag") in KEEP_POLYGONS)
    line = root.find("line")
    stats["lines"] = night_off(line)
    for i, (value, (colour, minzoom, widths)) in enumerate(NIGHT_ROADS.items()):
        rule = ET.Element("case", {"tag": "highway", "value": value, "nightMode": "true", "minzoom": str(minzoom),
                                   "color": colour, "cap": "ROUND", "strokeWidth": widths[-1][1]})
        for maxzoom, w in widths[:-1]:
            ET.SubElement(rule, "case", {"maxzoom": str(maxzoom), "strokeWidth": w})
        line.insert(i, rule)
    stats["night roads"] = len(NIGHT_ROADS)
    print("  minimal night map:", ", ".join(f"{k} {v}" for k, v in stats.items()))

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
