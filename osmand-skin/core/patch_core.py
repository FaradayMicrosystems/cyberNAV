#!/usr/bin/env python3
"""Wireframe 3D buildings: patches the building shaders inside OsmAnd's prebuilt map engine.

Usage: patch_core.py <OsmAndCore_androidNativeRelease.aar or .apk> <output>

OsmAnd's 3D buildings are drawn by its C++ engine (libOsmAndCoreWithJNI.so), whose GLSL shaders
are plain text in the library. This swaps three shader snippets for cyberNAV versions of the
same length or shorter (padded with spaces), so nothing else in the library moves:

1. Vertex shader: short buildings are drawn taller. A vertex at height h > 0 goes to
   h + 7 * exp(-h / 12): a 3 m shed becomes ~8.5 m, a 10 m house ~13 m, a 40 m tower ~40.3 m.
2. Building fragment shader: walls are near-black and opaque with phosphor-green edge lines
   (wall corners, ground line and roofline), 1.5 px wide at any zoom. Faces still hide what is
   behind them, so it reads as hidden-line wireframe.
3. Fallback building shader (used while the engine starts up): the same colours, much darker.

Every shader input and uniform stays in use, so the engine's variable lookups still succeed.

Each snippet must be found exactly once, or the script stops: a newer OsmAnd engine that
changed these shaders fails the build instead of shipping unpatched or broken buildings.
"""
import re, sys, zipfile

PATCHES = [
    ("taller short buildings (vertex shader)",
     rb"float vertexHeight = in_vs_heights\.x / param_vs_metersPerUnit;\s*"
     rb"float terrainElevation = in_vs_heights\.y \* param_vs_zScaleFactor / param_vs_metersPerUnit;\s*"
     rb"float elevation = terrainElevation \+ vertexHeight;",
     b"float hh=in_vs_heights.x;hh=hh>0.0?hh+7.0*exp(-hh/12.0):hh;"
     b"float vertexHeight=hh/param_vs_metersPerUnit;"
     b"float elevation=in_vs_heights.y*param_vs_zScaleFactor/param_vs_metersPerUnit+vertexHeight;"),
    ("wireframe walls (building fragment shader)",
     rb"void main\(\)\s*\{\s*vec3 v = normalize\(param_fs_cameraPosition - v2f_pointPosition\);\s*"
     rb"vec3 n = normalize\(v2f_pointNormal\);\s*bool top = abs\(n\.y\) > 0\.0;"
     rb".*?FRAGMENT_COLOR_OUTPUT = vec4\(clamp\(color, 0\.0, 1\.0\), alpha\);\s*\}",
     b"void main(){"
     b"vec3 v=normalize(param_fs_cameraPosition-v2f_pointPosition);"
     b"vec3 n=normalize(v2f_pointNormal);"
     b"float l=max(dot(-param_fs_lightDirection,n),0.0)*0.025+abs(dot(n,v))*0.01;"
     b"vec3 face=vec3(0.008,0.02,0.012)+l*vec3(0.5,1.0,0.6)+v2f_pointColor.rgb*0.01;"
     b"float e=1.0;"
     b"if(abs(n.y)<0.01){vec2 q=v2f_sizes.xy;vec2 w=max(fwidth(q)*1.5,vec2(1e-5));"
     b"vec2 m=min(q,1.0-q)/w;e=clamp(min(m.x,m.y)-0.5,0.0,1.0);}"
     b"vec3 color=mix(vec3(0.72,1.0,0.48),face,e);"
     b"float alpha=param_fs_alpha*min(param_fs_fadeHeight/v2f_height,1.0);"
     b"FRAGMENT_COLOR_OUTPUT=vec4(color,alpha);}"),
    ("dark faces (fallback building shader)",
     rb"vec3 color = v2f_pointColor\.rgb \* d;",
     b"vec3 color=v2f_pointColor.rgb*d*.08;"),
]

def patch_lib(data: bytes) -> bytes:
    for name, pattern, new in PATCHES:
        hits = list(re.finditer(pattern, data, re.S))
        if len(hits) != 1:
            sys.exit(f"patch_core: '{name}': expected 1 match, found {len(hits)}. OsmAnd's engine changed; update patch_core.py.")
        m = hits[0]
        old_len = m.end() - m.start()
        if len(new) > old_len:
            sys.exit(f"patch_core: '{name}': replacement is {len(new)} bytes, room for {old_len}.")
        data = data[:m.start()] + new + b" " * (old_len - len(new)) + data[m.end():]
        print(f"  {name}: patched ({len(new)}/{old_len} bytes)")
    return data

def main(src, dst):
    patched = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename.endswith("/libOsmAndCoreWithJNI.so"):
                print(info.filename)
                data = patch_lib(data)
                patched += 1
            zout.writestr(info, data)
    if not patched:
        sys.exit("patch_core: no libOsmAndCoreWithJNI.so found")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
