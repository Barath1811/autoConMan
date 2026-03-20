#!/usr/bin/env python3
"""
Thumbnail Generator - Renders a professional 1280x720 PNG thumbnail.

Takes theme data from Gemini (theme, twoWordTitle, characterPose, accentHex)
and draws a fully themed thumbnail with:
  - Theme-specific gradient background
  - Geometric shapes/patterns matching the theme
  - Cinematic vignette
  - The alien character in the given pose
  - Vertical accent bar
  - Large 2-word title with drop shadow
"""

import os
import sys
import json
import math
import random
import cairo

# ─── Canvas ──────────────────────────────────────────────────────────────────
W, H = 1280, 720

# ─── Font paths (downloaded by cron.yml) ─────────────────────────────────────
FONT_DIR = os.getenv('THUMBNAIL_FONT_DIR', '/tmp/thumbnail-fonts')

THEME_FONTS = {
    'SPORTS':        'BebasNeue-Regular.ttf',
    'FINANCE':       'RobotoSlab-Bold.ttf',
    'POLITICS':      'PlayfairDisplay-Bold.ttf',
    'DISASTER':      'BlackHanSans-Regular.ttf',
    'ENTERTAINMENT': 'Pacifico-Regular.ttf',
    'TECHNOLOGY':    'Orbitron-Bold.ttf',
    'DEFAULT':       'Oswald-Bold.ttf',
}

# ─── Theme visual configs ─────────────────────────────────────────────────────
THEMES = {
    'SPORTS': {
        'bg_stops':  [(0.0, (0.03, 0.22, 0.05)), (1.0, (0.01, 0.10, 0.01))],
        'accent':    (0.00, 0.88, 0.33),
        'pattern':   'field_lines',
        'title_color': (1.0, 0.95, 0.0),
    },
    'FINANCE': {
        'bg_stops':  [(0.0, (0.02, 0.06, 0.18)), (1.0, (0.01, 0.03, 0.10))],
        'accent':    (0.00, 0.85, 0.70),
        'pattern':   'chart_lines',
        'title_color': (0.85, 1.0, 0.85),
    },
    'POLITICS': {
        'bg_stops':  [(0.0, (0.05, 0.07, 0.18)), (1.0, (0.02, 0.03, 0.10))],
        'accent':    (0.95, 0.80, 0.20),
        'pattern':   'flag_stripes',
        'title_color': (1.0, 0.90, 0.30),
    },
    'DISASTER': {
        'bg_stops':  [(0.0, (0.25, 0.05, 0.01)), (1.0, (0.08, 0.01, 0.00))],
        'accent':    (1.0,  0.40, 0.00),
        'pattern':   'radial_cracks',
        'title_color': (1.0, 0.80, 0.50),
    },
    'ENTERTAINMENT': {
        'bg_stops':  [(0.0, (0.25, 0.05, 0.35)), (1.0, (0.08, 0.01, 0.15))],
        'accent':    (1.0,  0.20, 0.70),
        'pattern':   'spotlight_bokeh',
        'title_color': (1.0, 0.95, 0.70),
    },
    'TECHNOLOGY': {
        'bg_stops':  [(0.0, (0.02, 0.18, 0.22)), (1.0, (0.01, 0.06, 0.09))],
        'accent':    (0.10, 0.85, 0.95),
        'pattern':   'hex_grid',
        'title_color': (0.70, 1.0, 1.0),
    },
    'DEFAULT': {
        'bg_stops':  [(0.0, (0.06, 0.05, 0.18)), (1.0, (0.02, 0.02, 0.08))],
        'accent':    (0.55, 0.25, 1.00),
        'pattern':   'star_field',
        'title_color': (0.90, 0.80, 1.0),
    },
}


# ─── Helpers ─────────────────────────────────────────────────────────────────
def hex_to_rgb(hex_str):
    h = hex_str.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def set_color(ctx, r, g, b, a=1.0):
    ctx.set_source_rgba(r, g, b, a)


# ─── Background ──────────────────────────────────────────────────────────────
def draw_gradient_bg(ctx, theme):
    stops = theme['bg_stops']
    grad = cairo.LinearGradient(0, 0, 0, H)
    for pos, (r, g, b) in stops:
        grad.add_color_stop_rgb(pos, r, g, b)
    ctx.set_source(grad)
    ctx.rectangle(0, 0, W, H)
    ctx.fill()


# ─── Pattern functions ────────────────────────────────────────────────────────
def draw_field_lines(ctx, theme):
    """Football pitch markings."""
    ac = theme['accent']
    ctx.set_line_width(2.0)
    set_color(ctx, *ac, 0.12)

    # Horizontal pitch lines
    for y in range(0, H + 60, 60):
        ctx.move_to(0, y)
        ctx.line_to(W, y)
        ctx.stroke()

    # Vertical lines (perspective foreshortened)
    midX = W * 0.55
    for x in range(-300, W + 300, 80):
        ctx.move_to(x, H)
        ctx.line_to(midX + (x - midX) * 0.1, 0)
        ctx.stroke()

    # Centre circle glow
    set_color(ctx, *ac, 0.06)
    ctx.arc(W * 0.68, H * 0.5, 200, 0, 2 * math.pi)
    ctx.fill()
    set_color(ctx, *ac, 0.10)
    ctx.set_line_width(2.5)
    ctx.arc(W * 0.68, H * 0.5, 200, 0, 2 * math.pi)
    ctx.stroke()


def draw_chart_lines(ctx, theme):
    """Stock market candlestick-style chart lines."""
    ac = theme['accent']
    ctx.set_line_width(1.5)

    # Grid
    set_color(ctx, *ac, 0.07)
    for x in range(0, W, 80):
        ctx.move_to(x, 0); ctx.line_to(x, H); ctx.stroke()
    for y in range(0, H, 60):
        ctx.move_to(0, y); ctx.line_to(W, y); ctx.stroke()

    # Rising trend line
    r = random.Random(42)
    points = []
    y_val = H * 0.65
    for x in range(int(W * 0.15), W, 55):
        y_val += r.uniform(-40, 55)
        y_val = max(H * 0.25, min(H * 0.80, y_val))
        points.append((x, y_val))

    # Draw bars
    for i, (x, y) in enumerate(points):
        bar_h = r.randint(20, 80)
        is_up = r.random() > 0.35
        col = (0.10, 0.85, 0.45) if is_up else (0.90, 0.25, 0.35)
        set_color(ctx, *col, 0.40)
        ctx.rectangle(x - 10, y - bar_h if is_up else y, 20, bar_h)
        ctx.fill()

    # Trend line
    set_color(ctx, *ac, 0.55)
    ctx.set_line_width(2.5)
    ctx.move_to(*points[0])
    for pt in points[1:]:
        ctx.line_to(*pt)
    ctx.stroke()


def draw_flag_stripes(ctx, theme):
    """Diagonal flag-like stripes."""
    ac = theme['accent']
    stripe_w = 120
    for i in range(-3, W // stripe_w + 4):
        x = i * stripe_w
        if i % 2 == 0:
            set_color(ctx, *ac, 0.06)
        else:
            set_color(ctx, 1.0, 1.0, 1.0, 0.02)
        ctx.move_to(x, 0)
        ctx.line_to(x + stripe_w, 0)
        ctx.line_to(x + stripe_w - 180, H)
        ctx.line_to(x - 180, H)
        ctx.close_path()
        ctx.fill()


def draw_radial_cracks(ctx, theme):
    """Radial crack/explosion lines for disaster."""
    ac = theme['accent']
    cx, cy = W * 0.65, H * 0.48
    r = random.Random(7)

    # Central glow
    glow = cairo.RadialGradient(cx, cy, 0, cx, cy, 350)
    glow.add_color_stop_rgba(0, *ac, 0.25)
    glow.add_color_stop_rgba(0.5, *ac, 0.06)
    glow.add_color_stop_rgba(1, *ac, 0.0)
    ctx.set_source(glow)
    ctx.arc(cx, cy, 350, 0, 2 * math.pi)
    ctx.fill()

    # Crack lines radiating out
    ctx.set_line_width(1.5)
    for _ in range(22):
        angle = r.uniform(0, 2 * math.pi)
        length = r.uniform(180, 450)
        ex = cx + math.cos(angle) * length
        ey = cy + math.sin(angle) * length
        set_color(ctx, *ac, r.uniform(0.12, 0.40))
        ctx.move_to(cx, cy)
        # Add slight zigzag
        mid_x = (cx + ex) / 2 + r.uniform(-30, 30)
        mid_y = (cy + ey) / 2 + r.uniform(-30, 30)
        ctx.curve_to(mid_x, mid_y, mid_x, mid_y, ex, ey)
        ctx.stroke()


def draw_spotlight_bokeh(ctx, theme):
    """Spotlight and bokeh circles for entertainment."""
    ac = theme['accent']
    r = random.Random(13)

    # Spotlight beams
    for _ in range(4):
        sx = r.uniform(0, W)
        angle = r.uniform(0.6, 2.5)
        beam_w = r.uniform(60, 120)
        set_color(ctx, *ac, 0.06)
        ctx.move_to(sx, 0)
        ctx.line_to(sx + beam_w, H)
        ctx.line_to(sx - beam_w, H)
        ctx.close_path()
        ctx.fill()

    # Bokeh circles
    for _ in range(30):
        bx = r.uniform(0, W)
        by = r.uniform(0, H)
        br = r.uniform(8, 45)
        alpha = r.uniform(0.04, 0.14)
        set_color(ctx, *ac, alpha)
        ctx.set_line_width(1.5)
        ctx.arc(bx, by, br, 0, 2 * math.pi)
        ctx.stroke()


def draw_hex_grid(ctx, theme):
    """Hexagonal grid for technology."""
    ac = theme['accent']
    hex_r = 55
    ctx.set_line_width(1.0)

    row = 0
    y = -hex_r
    while y < H + hex_r * 2:
        cols = int(W / (hex_r * 1.73)) + 3
        for col in range(-1, cols):
            x = col * hex_r * 1.73 + (hex_r * 0.87 if row % 2 else 0)
            # Draw hexagon
            alpha = random.Random(int(x * 7 + y * 11)).uniform(0.04, 0.16)
            set_color(ctx, *ac, alpha)
            for i in range(6):
                angle = math.pi / 3 * i
                px = x + hex_r * 0.9 * math.cos(angle)
                py = y + hex_r * 0.9 * math.sin(angle)
                if i == 0:
                    ctx.move_to(px, py)
                else:
                    ctx.line_to(px, py)
            ctx.close_path()
            ctx.stroke()
        y += hex_r * 1.5
        row += 1


def draw_star_field(ctx, theme):
    """Star field for default theme."""
    r = random.Random(99)
    for _ in range(120):
        sx = r.uniform(0, W)
        sy = r.uniform(0, H * 0.85)
        sz = r.uniform(0.5, 2.5)
        sa = r.uniform(0.3, 0.9)
        set_color(ctx, 1, 1, 1, sa)
        ctx.arc(sx, sy, sz, 0, 2 * math.pi)
        ctx.fill()


PATTERN_FUNCS = {
    'field_lines':    draw_field_lines,
    'chart_lines':    draw_chart_lines,
    'flag_stripes':   draw_flag_stripes,
    'radial_cracks':  draw_radial_cracks,
    'spotlight_bokeh':draw_spotlight_bokeh,
    'hex_grid':       draw_hex_grid,
    'star_field':     draw_star_field,
}


# ─── Vignette ─────────────────────────────────────────────────────────────────
def draw_vignette(ctx):
    """Cinematic dark vignette at all edges."""
    grad = cairo.RadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.75)
    grad.add_color_stop_rgba(0, 0, 0, 0, 0.0)
    grad.add_color_stop_rgba(1, 0, 0, 0, 0.72)
    ctx.set_source(grad)
    ctx.rectangle(0, 0, W, H)
    ctx.fill()


# ─── Character (reuse renderer logic, scaled and positioned) ──────────────────
def draw_character_for_thumbnail(ctx, pose, theme_name):
    """Draw the alien character scaled up, positioned left-centre."""
    import importlib.util
    try:
        spec = importlib.util.spec_from_file_location(
            'renderer',
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renderer.py')
        )
        renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(renderer)

        char_scale = 5.5        # bigger than video (3.5)
        cx, cy = int(W * 0.30), int(H * 0.62)   # left-centre position

        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(char_scale, char_scale)
        ctx.translate(-cx, -cy)

        cfg = renderer.EXPR.get(pose, renderer.EXPR['IDLE'])
        renderer.draw_sparkles(ctx, 0, cx, cy, cfg)
        renderer.draw_antennae(ctx, 0, cx, cy, cfg)
        renderer.draw_arms(ctx, 0, cx, cy, 0.5, pose, cfg)
        renderer.draw_legs(ctx, 0, cx, cy, cfg)
        renderer.draw_body(ctx, 0, cx, cy, cfg)
        renderer.draw_eyes(ctx, 0, cx, cy, cfg)
        renderer.draw_brows(ctx, 0, cx, cy, cfg)
        renderer.draw_mouth(ctx, 0, cx, cy, 0.5, pose)
        ctx.restore()
    except Exception as e:
        print(f'[ThumbnailGen] Character render warning: {e}')


# ─── Text ─────────────────────────────────────────────────────────────────────
def draw_title(ctx, line1, line2, theme, font_path=None):
    """Draw 2-word title (one per line) on the right side."""
    tc = theme['title_color']
    ac = theme['accent']

    # Use Cairo's built-in if font unavailable
    if font_path and os.path.exists(font_path):
        ctx.select_font_face("sans-serif")  # will override with toy font
        # We use Cairo's select_font_face since FreeType paths aren't exposed
        # in basic pycairo. Use a bold match.

    ctx.set_font_size(148)
    ctx.select_font_face("sans-serif", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)

    right_cx = W * 0.68  # horizontal centre of text region

    for row, word in enumerate([line1, line2]):
        ext = ctx.text_extents(word)
        tx = right_cx - ext.width / 2
        ty = H * 0.42 + row * 165

        # Drop shadow
        set_color(ctx, 0, 0, 0, 0.65)
        ctx.move_to(tx + 5, ty + 5)
        ctx.show_text(word)

        # Accent outline glow
        set_color(ctx, *ac, 0.40)
        ctx.move_to(tx + 2, ty + 2)
        ctx.show_text(word)

        # Main text
        set_color(ctx, *tc)
        ctx.move_to(tx, ty)
        ctx.show_text(word)


def draw_accent_bar(ctx, theme):
    """Vertical accent stripe at the left edge."""
    ac = theme['accent']
    grad = cairo.LinearGradient(0, 0, 0, H)
    grad.add_color_stop_rgba(0.0, *ac, 0.0)
    grad.add_color_stop_rgba(0.3, *ac, 0.85)
    grad.add_color_stop_rgba(0.7, *ac, 0.85)
    grad.add_color_stop_rgba(1.0, *ac, 0.0)
    ctx.set_source(grad)
    ctx.rectangle(0, 0, 12, H)
    ctx.fill()


# ─── Main render ──────────────────────────────────────────────────────────────
def render(theme_name, two_word_title, character_pose, accent_hex, output_path):
    theme = THEMES.get(theme_name, THEMES['DEFAULT']).copy()

    # Override accent with AI-generated color if valid
    try:
        theme['accent'] = hex_to_rgb(accent_hex)
    except Exception:
        pass  # keep config default

    words = two_word_title.strip().upper().split()
    line1 = words[0] if len(words) > 0 else 'BREAKING'
    line2 = words[1] if len(words) > 1 else 'NEWS'

    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)

    # 1. Gradient background
    draw_gradient_bg(ctx, theme)

    # 2. Theme pattern
    pattern_key = theme.get('pattern', 'star_field')
    PATTERN_FUNCS.get(pattern_key, draw_star_field)(ctx, theme)

    # 3. Cinematic vignette
    draw_vignette(ctx)

    # 4. Character
    draw_character_for_thumbnail(ctx, character_pose, theme_name)

    # 5. Accent bar
    draw_accent_bar(ctx, theme)

    # 6. Title text (no custom font — Cairo bold)
    font_file = os.path.join(FONT_DIR, THEME_FONTS.get(theme_name, 'Oswald-Bold.ttf'))
    draw_title(ctx, line1, line2, theme, font_file)

    # 7. Save
    surface.write_to_png(output_path)
    print(f'[ThumbnailGen] Saved: {output_path} ({W}x{H})')


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) != 6:
        print('Usage: python thumbnail_generator.py <theme> <twoWordTitle> <pose> <accentHex> <output.png>')
        sys.exit(1)

    render(
        theme_name=sys.argv[1],
        two_word_title=sys.argv[2],
        character_pose=sys.argv[3],
        accent_hex=sys.argv[4],
        output_path=sys.argv[5],
    )
