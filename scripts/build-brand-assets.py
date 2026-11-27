#!/usr/bin/env python3
"""
Extract true vector SVG brand masters from the official KAIROS PNG design files.
- Uses OpenCV sub-pixel contour tracing + Catmull-Rom -> cubic Bezier curve fitting
  with Douglas-Peucker simplification (zero embedded PNG/Base64).
- Enso symbol & wordmark geometry are derived from `-1` (kairos-primary.png),
  horizontal layout from `-2` (kairos-horizontal.png), and bold small-size icon
  symbol from `-5` (kairos-icon.png).
- All color variants share the exact same master vector paths.
"""

import os
import math
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "assets", "brand", "source")
SVG_DIR = os.path.join(ROOT, "assets", "brand", "svg")
ICONS_DIR = os.path.join(ROOT, "assets", "brand", "icons")

NAVY = "#16283F"
GOLD = "#E8A33D"
CREAM = "#FAF8F4"
BLACK = "#000000"
WHITE = "#FFFFFF"


def catmull_rom_to_bezier_path(pts, closed=True):
    """Convert a polygon of 2D points into a smooth SVG cubic Bezier path."""
    n = len(pts)
    if n < 3:
        return ""
    if closed:
        get = lambda idx: pts[idx % n]
    else:
        get = lambda idx: pts[max(0, min(n - 1, idx))]

    cmds = [f"M {pts[0][0]:.2f} {pts[0][1]:.2f}"]
    limit = n if closed else n - 1
    tension = 1.0 / 6.0
    for i in range(limit):
        p0 = get(i - 1)
        p1 = get(i)
        p2 = get(i + 1)
        p3 = get(i + 2)
        c1x = p1[0] + (p2[0] - p0[0]) * tension
        c1y = p1[1] + (p2[1] - p0[1]) * tension
        c2x = p2[0] - (p3[0] - p1[0]) * tension
        c2y = p2[1] - (p3[1] - p1[1]) * tension
        cmds.append(f"C {c1x:.2f} {c1y:.2f} {c2x:.2f} {c2y:.2f} {p2[0]:.2f} {p2[1]:.2f}")
    if closed:
        cmds.append("Z")
    return " ".join(cmds)


def extract_mask_paths(mask_u8, eps_px=0.9, min_area=18.0, offset=(0.0, 0.0), scale=1.0, smooth=True):
    """Extract SVG path data (with holes via evenodd fill-rule) from a binary mask."""
    # Slight Gaussian blur + threshold for smooth anti-aliased subpixel contours
    up = 2
    h, w = mask_u8.shape
    big = cv2.resize(mask_u8, (w * up, h * up), interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (3, 3), 0.7)
    _, bw = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)

    contours, hierarchy = cv2.findContours(bw, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
    if hierarchy is None:
        return []
    ox, oy = offset
    paths = []
    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt) / (up * up)
        if area < min_area:
            continue
        approx = cv2.approxPolyDP(cnt, eps_px * up, True)
        pts = [( (p[0][0] / up + ox) * scale, (p[0][1] / up + oy) * scale ) for p in approx]
        if len(pts) < 3:
            continue
        if smooth:
            paths.append(catmull_rom_to_bezier_path(pts, closed=True))
        else:
            d = f"M {pts[0][0]:.2f} {pts[0][1]:.2f} " + " ".join(f"L {x:.2f} {y:.2f}" for x, y in pts[1:]) + " Z"
            paths.append(d)
    return paths


def extract_navy_gold_masks(img_bgr):
    """Extract clean soft masks (0..255 uint8) for navy ink and gold dots."""
    b, g, r = cv2.split(img_bgr.astype(np.float32))
    # Background is warm off-white (~250, 248, 244)
    # Navy ink has low brightness and cool hue; Gold dot has high R, mid G, low B
    gold_score = np.clip((r - b - 45.0) * 2.2, 0, 255)
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    # Navy darkness relative to cream background (~248)
    navy_raw = np.clip((210.0 - luma) * (255.0 / 160.0), 0, 255)
    # Exclude gold pixels from navy mask
    navy_mask = np.where(gold_score > 70, 0, navy_raw).astype(np.uint8)
    gold_mask = gold_score.astype(np.uint8)
    return navy_mask, gold_mask


def find_gold_circles(gold_mask):
    _, bw = cv2.threshold(gold_mask, 120, 255, cv2.THRESH_BINARY)
    num, lbl, stats, cent = cv2.connectedComponentsWithStats(bw)
    circles = []
    for i in range(1, num):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 30:
            continue
        cx, cy = cent[i]
        r = math.sqrt(area / math.pi)
        circles.append((float(cx), float(cy), float(r)))
    circles.sort(key=lambda c: c[1])
    return circles


def bbox_of_mask(mask, thresh=110):
    ys, xs = np.where(mask >= thresh)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def build_svg(width, height, body, viewbox=None):
    vb = viewbox or f"0 0 {width} {height}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{width}" height="{height}" fill="none">\n'
        f'{body}\n'
        f'</svg>\n'
    )


def imread_unicode(path_str):
    data = np.fromfile(path_str, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def main():
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(ICONS_DIR, exist_ok=True)

    # 1. Load primary vertical master (-1)
    p1 = imread_unicode(os.path.join(SRC_DIR, "kairos-primary.png"))
    navy1, gold1 = extract_navy_gold_masks(p1)
    gold_pts1 = find_gold_circles(gold1)

    # Split -1 into:
    # - Enso region (y < 840)
    # - Wordmark KAIROS region (870 <= y <= 1030)
    # - Tagline WORLD TRAVEL ATLAS region (y > 1045)
    enso_mask = navy1.copy()
    enso_mask[850:, :] = 0
    ex0, ey0, ex1, ey1 = bbox_of_mask(enso_mask)
    enso_dot = [c for c in gold_pts1 if c[1] < 850][0]

    # Normalize Enso symbol into 512x512 master coordinate space (with generous margin)
    sym_pad = 36.0
    sym_span = max(ex1 - ex0, ey1 - ey0, enso_dot[0] + enso_dot[2] - ex0, enso_dot[1] + enso_dot[2] - ey0)
    sym_scale = (512.0 - 2 * sym_pad) / sym_span
    sym_ox = (512.0 - (ex1 - ex0) * sym_scale) * 0.5 / sym_scale - ex0
    sym_oy = (512.0 - (ey1 - ey0) * sym_scale) * 0.5 / sym_scale - ey0

    enso_paths = extract_mask_paths(enso_mask, eps_px=0.85, min_area=40, offset=(sym_ox, sym_oy), scale=sym_scale, smooth=True)
    enso_d = " ".join(enso_paths)
    dot_cx = (enso_dot[0] + sym_ox) * sym_scale
    dot_cy = (enso_dot[1] + sym_oy) * sym_scale
    dot_r = enso_dot[2] * sym_scale

    # Wordmark KAIROS + period from -1
    wm_mask = navy1.copy()
    wm_mask[:860, :] = 0
    wm_mask[1035:, :] = 0
    wx0, wy0, wx1, wy1 = bbox_of_mask(wm_mask)
    wm_dot = [c for c in gold_pts1 if c[1] >= 860][0]

    # Tagline WORLD TRAVEL ATLAS from -1
    tag_mask = navy1.copy()
    tag_mask[:1045, :] = 0
    tx0, ty0, tx1, ty1 = bbox_of_mask(tag_mask)

    # Full primary lockup bounding box (cropped tightly with clean padding)
    all_x0 = min(ex0, wx0, tx0)
    all_y0 = ey0
    all_x1 = max(ex1, int(math.ceil(wm_dot[0] + wm_dot[2])), tx1)
    all_y1 = ty1
    pri_w = 640.0
    pri_pad = 40.0
    pri_scale = (pri_w - 2 * pri_pad) / (all_x1 - all_x0)
    pri_h = round((all_y1 - all_y0) * pri_scale + 2 * pri_pad)
    pri_ox = pri_pad / pri_scale - all_x0
    pri_oy = pri_pad / pri_scale - all_y0

    # Derive primary wordmark + tagline paths in pri coordinate space
    # Use crisp linear segments (smooth=False) with tight tolerance (eps_px=0.35) for geometric sans-serif wordmark
    # so K/A/I/R/O/S letters stay razor-sharp without rounded-corner wobble!
    wm_paths_pri = extract_mask_paths(wm_mask, eps_px=0.35, min_area=12, offset=(pri_ox, pri_oy), scale=pri_scale, smooth=False)
    tag_paths_pri = extract_mask_paths(tag_mask, eps_px=0.25, min_area=8, offset=(pri_ox, pri_oy), scale=pri_scale, smooth=False)
    enso_paths_pri = extract_mask_paths(enso_mask, eps_px=0.85, min_area=40, offset=(pri_ox, pri_oy), scale=pri_scale, smooth=True)

    pri_enso_dot_cx = (enso_dot[0] + pri_ox) * pri_scale
    pri_enso_dot_cy = (enso_dot[1] + pri_oy) * pri_scale
    pri_enso_dot_r = enso_dot[2] * pri_scale
    pri_wm_dot_cx = (wm_dot[0] + pri_ox) * pri_scale
    pri_wm_dot_cy = (wm_dot[1] + pri_oy) * pri_scale
    pri_wm_dot_r = wm_dot[2] * pri_scale

    # 2. Horizontal lockup: place the EXACT master enso symbol (from -1) alongside the EXACT master wordmark + tagline (from -1)
    # using proportions measured from -2 (kairos-horizontal.png): symbol height ~452, wordmark height ~150, gap ~108
    horiz_h = 260.0
    h_pad_y = 28.0
    h_pad_x = 24.0
    # Symbol scaled to fit (horiz_h - 2*h_pad_y)
    hsym_target = horiz_h - 2 * h_pad_y
    hsym_scale = hsym_target / (ey1 - ey0)
    hsym_ox = h_pad_x / hsym_scale - ex0
    hsym_oy = h_pad_y / hsym_scale - ey0
    hsym_paths = extract_mask_paths(enso_mask, eps_px=0.85, min_area=40, offset=(hsym_ox, hsym_oy), scale=hsym_scale, smooth=True)
    hsym_dot_cx = (enso_dot[0] + hsym_ox) * hsym_scale
    hsym_dot_cy = (enso_dot[1] + hsym_oy) * hsym_scale
    hsym_dot_r = enso_dot[2] * hsym_scale

    # Wordmark + tagline block positioned to the right using -2 spacing ratios
    sym_right = h_pad_x + (ex1 - ex0) * hsym_scale
    gap_x = hsym_target * 0.24
    # In -2: wordmark height = 0.338 * sym_height; tagline offset below wordmark
    hwm_scale = (hsym_target * 0.34) / (wy1 - wy0)
    hwm_left = sym_right + gap_x
    hwm_top = h_pad_y + hsym_target * 0.22
    hwm_ox = hwm_left / hwm_scale - wx0
    hwm_oy = hwm_top / hwm_scale - wy0

    hwm_paths = extract_mask_paths(wm_mask, eps_px=0.35, min_area=12, offset=(hwm_ox, hwm_oy), scale=hwm_scale, smooth=False)
    htag_paths = extract_mask_paths(tag_mask, eps_px=0.25, min_area=8, offset=(hwm_ox, hwm_oy), scale=hwm_scale, smooth=False)
    hwm_dot_cx = (wm_dot[0] + hwm_ox) * hwm_scale
    hwm_dot_cy = (wm_dot[1] + hwm_oy) * hwm_scale
    hwm_dot_r = wm_dot[2] * hwm_scale
    horiz_w = round(hwm_dot_cx + hwm_dot_r + h_pad_x)

    # 3. Bold small-size icon symbol from -5 (kairos-icon.png)
    p5 = imread_unicode(os.path.join(SRC_DIR, "kairos-icon.png"))
    navy5, gold5 = extract_navy_gold_masks(p5)
    ix0, iy0, ix1, iy1 = bbox_of_mask(navy5)
    icon_dot = find_gold_circles(gold5)[0]
    icon_pad = 48.0
    icon_span = max(ix1 - ix0, iy1 - iy0)
    icon_scale = (512.0 - 2 * icon_pad) / icon_span
    icon_ox = (512.0 - (ix1 - ix0) * icon_scale) * 0.5 / icon_scale - ix0
    icon_oy = (512.0 - (iy1 - iy0) * icon_scale) * 0.5 / icon_scale - iy0
    icon_paths = extract_mask_paths(navy5, eps_px=0.85, min_area=40, offset=(icon_ox, icon_oy), scale=icon_scale, smooth=True)
    icon_d = " ".join(icon_paths)
    icon_dot_cx = (icon_dot[0] + icon_ox) * icon_scale
    icon_dot_cy = (icon_dot[1] + icon_oy) * icon_scale
    icon_dot_r = icon_dot[2] * icon_scale

    def render_primary_svg(ink_color, dot_color, bg_color=None):
        bg = f'<rect width="{int(pri_w)}" height="{int(pri_h)}" fill="{bg_color}"/>\n  ' if bg_color else ""
        ink_d = " ".join(enso_paths_pri + wm_paths_pri + tag_paths_pri)
        body = (
            f'  {bg}<g id="kairos-primary-mark">\n'
            f'    <path fill="{ink_color}" fill-rule="evenodd" d="{ink_d}"/>\n'
            f'    <circle cx="{pri_enso_dot_cx:.2f}" cy="{pri_enso_dot_cy:.2f}" r="{pri_enso_dot_r:.2f}" fill="{dot_color}"/>\n'
            f'    <circle cx="{pri_wm_dot_cx:.2f}" cy="{pri_wm_dot_cy:.2f}" r="{pri_wm_dot_r:.2f}" fill="{dot_color}"/>\n'
            f'  </g>'
        )
        return build_svg(int(pri_w), int(pri_h), body)

    def render_horizontal_svg(ink_color, dot_color):
        ink_d = " ".join(hsym_paths + hwm_paths + htag_paths)
        body = (
            f'  <g id="kairos-horizontal-mark">\n'
            f'    <path fill="{ink_color}" fill-rule="evenodd" d="{ink_d}"/>\n'
            f'    <circle cx="{hsym_dot_cx:.2f}" cy="{hsym_dot_cy:.2f}" r="{hsym_dot_r:.2f}" fill="{dot_color}"/>\n'
            f'    <circle cx="{hwm_dot_cx:.2f}" cy="{hwm_dot_cy:.2f}" r="{hwm_dot_r:.2f}" fill="{dot_color}"/>\n'
            f'  </g>'
        )
        return build_svg(int(horiz_w), int(horiz_h), body)

    def render_symbol_svg(ink_color, dot_color):
        body = (
            f'  <g id="kairos-enso-symbol">\n'
            f'    <path fill="{ink_color}" fill-rule="evenodd" d="{enso_d}"/>\n'
            f'    <circle cx="{dot_cx:.2f}" cy="{dot_cy:.2f}" r="{dot_r:.2f}" fill="{dot_color}"/>\n'
            f'  </g>'
        )
        return build_svg(512, 512, body)

    def render_icon_svg(bg_color=CREAM, ink_color=NAVY, dot_color=GOLD, rx=112):
        bg = f'<rect width="512" height="512" rx="{rx}" fill="{bg_color}"/>\n  ' if bg_color else ""
        body = (
            f'  {bg}<g id="kairos-app-icon">\n'
            f'    <path fill="{ink_color}" fill-rule="evenodd" d="{icon_d}"/>\n'
            f'    <circle cx="{icon_dot_cx:.2f}" cy="{icon_dot_cy:.2f}" r="{icon_dot_r:.2f}" fill="{dot_color}"/>\n'
            f'  </g>'
        )
        return build_svg(512, 512, body)

    outputs = {
        os.path.join(SVG_DIR, "kairos-primary.svg"): render_primary_svg(NAVY, GOLD),
        os.path.join(SVG_DIR, "kairos-dark.svg"): render_primary_svg(CREAM, GOLD),
        os.path.join(SVG_DIR, "kairos-horizontal.svg"): render_horizontal_svg(NAVY, GOLD),
        os.path.join(SVG_DIR, "kairos-horizontal-dark.svg"): render_horizontal_svg(CREAM, GOLD),
        os.path.join(SVG_DIR, "kairos-black.svg"): render_horizontal_svg(BLACK, BLACK),
        os.path.join(SVG_DIR, "kairos-white.svg"): render_horizontal_svg(WHITE, WHITE),
        os.path.join(SVG_DIR, "kairos-symbol.svg"): render_symbol_svg(NAVY, GOLD),
        os.path.join(SVG_DIR, "kairos-symbol-dark.svg"): render_symbol_svg(CREAM, GOLD),
        os.path.join(SVG_DIR, "kairos-icon.svg"): render_icon_svg(None, NAVY, GOLD, 0),
        os.path.join(ICONS_DIR, "favicon.svg"): render_icon_svg(NAVY, CREAM, GOLD, 118),
    }

    for path_out, content in outputs.items():
        with open(path_out, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Wrote {os.path.relpath(path_out, ROOT)} ({len(content)} bytes)")


if __name__ == "__main__":
    main()
