#!/usr/bin/env python3
"""
Cairo-based video frame renderer.
Reads manifest.json and renders each frame as PNG.
Character style: serious, composed, dark palette.
"""

import os
import sys
import json
import math
import random
import cairo
from pathlib import Path

def get_env_int(name, default):
    val = os.getenv(name, '').strip()
    return int(val) if val.isdigit() else default

def get_env_float(name, default):
    val = os.getenv(name, '').strip()
    try:
        return float(val) if val else default
    except ValueError:
        return default

# ============================================================================
# Configuration
# ============================================================================
W = get_env_int('RENDER_WIDTH', 640)
H = get_env_int('RENDER_HEIGHT', 480)
FPS = get_env_int('FPS', 24)
STAR_COUNT = get_env_int('STAR_COUNT', 30)
STAR_SEED = get_env_int('STAR_SEED', 42)

# Scale factor for the alien character.
# Substantially reduced from 5.0 to 3.5 to ensure antennae stay in frame.
CHAR_SCALE = get_env_float('CHAR_SCALE', 3.5)

# Expression-specific parameters
EXPR = {
    'HAPPY': {
        'brow_dy': -3,
        'eye_sq': 0.70,
        'pupil_dy': 1,
        'blush': False,
        'wobble_spd': 0.012,
        'wobble_amp': 1.2,
        'aura': (0.25, 0.45, 0.35),
        'bg': (0.10, 0.12, 0.11),
        'sparkle': False,
    },
    'SAD': {
        'brow_dy': 6,
        'eye_sq': 1.10,
        'pupil_dy': -2,
        'blush': False,
        'wobble_spd': 0.008,
        'wobble_amp': 0.8,
        'aura': (0.15, 0.20, 0.35),
        'bg': (0.08, 0.09, 0.14),
        'sparkle': False,
    },
    'ANGRY': {
        'brow_dy': 10,
        'eye_sq': 0.75,
        'pupil_dy': 3,
        'blush': False,
        'wobble_spd': 0.06,
        'wobble_amp': 2.5,
        'aura': (0.50, 0.10, 0.08),
        'bg': (0.12, 0.07, 0.07),
        'sparkle': False,
    },
    'SURPRISED': {
        'brow_dy': -10,
        'eye_sq': 1.40,
        'pupil_dy': -4,
        'blush': False,
        'wobble_spd': 0.04,
        'wobble_amp': 1.5,
        'aura': (0.40, 0.35, 0.15),
        'bg': (0.11, 0.10, 0.07),
        'sparkle': False,
    },
    'LAUGHING': {
        'brow_dy': -3,
        'eye_sq': 0.30,
        'pupil_dy': 4,
        'blush': False,
        'wobble_spd': 0.09,
        'wobble_amp': 3.0,
        'aura': (0.20, 0.40, 0.28),
        'bg': (0.09, 0.11, 0.10),
        'sparkle': False,
    },
    'WAVING': {
        'brow_dy': -2,
        'eye_sq': 0.80,
        'pupil_dy': 1,
        'blush': False,
        'wobble_spd': 0.015,
        'wobble_amp': 1.0,
        'aura': (0.18, 0.30, 0.45),
        'bg': (0.09, 0.10, 0.13),
        'sparkle': False,
    },
    'IDLE': {
        'brow_dy': 0,
        'eye_sq': 0.90,
        'pupil_dy': 0,
        'blush': False,
        'wobble_spd': 0.010,
        'wobble_amp': 0.7,
        'aura': (0.20, 0.25, 0.35),
        'bg': (0.09, 0.10, 0.12),
        'sparkle': False,
    },
    'THINK': {
        'brow_dy': 4,
        'eye_sq': 0.95,
        'pupil_dy': -2,
        'blush': False,
        'wobble_spd': 0.008,
        'wobble_amp': 0.5,
        'aura': (0.22, 0.18, 0.35),
        'bg': (0.09, 0.08, 0.12),
        'sparkle': False,
    },
}

# ============================================================================
# Utility functions
# ============================================================================
def set_color(ctx, r, g, b, a=1.0):
    """Set source color."""
    ctx.set_source_rgba(r, g, b, a)


def draw_circle(ctx, x, y, radius):
    """Draw filled circle."""
    ctx.arc(x, y, radius, 0, 2 * math.pi)
    ctx.fill()


def draw_ellipse(ctx, x, y, rx, ry):
    """Draw filled ellipse."""
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(rx, ry)
    ctx.arc(0, 0, 1, 0, 2 * math.pi)
    ctx.restore()
    ctx.fill()


def generate_stars(count, seed, w, h):
    """Generate deterministic star field."""
    rng = random.Random(seed)
    stars = []
    for _ in range(count):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h * 0.7)  # Upper 70% only
        brightness = rng.uniform(0.3, 1.0)
        size = rng.uniform(0.5, 2.0)
        stars.append((x, y, brightness, size))
    return stars


# ============================================================================
# Drawing functions
# ============================================================================
def draw_background(ctx, t, cfg, cx, cy, w, h, stars):
    """Draw background with stars and gradient."""
    # Get expression config
    bg_color = cfg.get('bg', (0.96, 0.97, 0.99))
    aura_color = cfg.get('aura', (0.5, 0.7, 0.85))

    # Fill background
    set_color(ctx, *bg_color)
    ctx.rectangle(0, 0, w, h)
    ctx.fill()

    # Aura glow (soft radial)
    pat = cairo.RadialGradient(cx, cy, 0, cx, cy, 300)
    pat.add_color_stop_rgba(0, aura_color[0], aura_color[1], aura_color[2], 0.15)
    pat.add_color_stop_rgba(1, aura_color[0], aura_color[1], aura_color[2], 0.0)
    ctx.set_source(pat)
    ctx.arc(cx, cy, 300, 0, 2 * math.pi)
    ctx.fill()

    # Draw stars — brighter against dark background
    for sx, sy, brightness, size in stars:
        set_color(ctx, brightness, brightness, brightness * 1.1, 0.55)
        draw_circle(ctx, sx, sy, size)

    # Ground fog (linear gradient)
    pat = cairo.LinearGradient(0, h * 0.6, 0, h)
    pat.add_color_stop_rgba(0, 0, 0, 0, 0)
    pat.add_color_stop_rgba(1, 0, 0, 0, 0.08)
    ctx.set_source(pat)
    ctx.rectangle(0, h * 0.6, w, h * 0.4)
    ctx.fill()


def draw_antennae(ctx, t, cx, cy, cfg):
    """Sharp rigid antenna spikes — no sway, pointed metallic tips."""
    head_cy = cy - 14
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)

    for sign, phase_off in [(-1, 0), (1, math.pi / 3)]:
        base_x = cx + sign * 8
        base_y = head_cy - 20

        # Rigid: tiny rotation only, no friendly sway
        tilt = math.sin(t * 0.018 + phase_off) * 0.8
        tip_x = base_x + sign * (4 + tilt)
        tip_y = base_y - 18

        # Stem — dark grey, sharp edges
        set_color(ctx, 0.35, 0.35, 0.40)
        ctx.set_line_width(2.0)
        ctx.move_to(base_x, base_y)
        ctx.line_to(tip_x, tip_y)
        ctx.stroke()

        # Sharp conical tip — dark teal glow, no pink softness
        set_color(ctx, 0.0, 0.55, 0.60, 0.30)
        draw_circle(ctx, tip_x, tip_y, 4)
        set_color(ctx, 0.05, 0.70, 0.75)
        draw_circle(ctx, tip_x, tip_y, 2.2)
        # Hard specular dot
        set_color(ctx, 0.80, 1.0, 1.0, 0.85)
        draw_circle(ctx, tip_x - 0.5, tip_y - 0.5, 0.7)


def draw_arms(ctx, t, cx, cy, mouth_open, expression, cfg):
    """Arms with expression-aware poses. Hands always clear the head."""
    body_cy = cy + 14
    head_cy = cy - 14
    wobble_spd = cfg.get('wobble_spd', 0.01)
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)

    for sign in (-1, 1):
        base_x = cx + sign * 12
        base_y = body_cy - 2

        if expression == 'WAVING' and sign == 1:
            # Right arm raised high and wide — hand well outside head
            # shoulder → elbow goes up-out, forearm continues up
            wave = math.sin(t * 0.18) * 0.25
            elbow_x = base_x + sign * 18 * math.cos(-0.55 + wave)
            elbow_y = base_y + 18 * math.sin(-0.55 + wave)
            hand_x  = elbow_x + sign * 16 * math.cos(-0.90 + wave)
            hand_y  = elbow_y + 16 * math.sin(-0.90 + wave)

        elif expression == 'THINK' and sign == 1:
            # Right arm swings wide to side, hand rests beside jaw — never behind head
            elbow_x = cx + sign * 30
            elbow_y = body_cy + 4
            hand_x  = cx + sign * 38
            hand_y  = head_cy + 16   # beside lower face, x well outside head edge

        elif expression == 'ANGRY':
            # Arms angled slightly downward — tense
            arm_angle = 0.15 + math.sin(t * wobble_spd) * 0.03
            elbow_x = base_x + sign * 14 * math.cos(arm_angle)
            elbow_y = base_y + 14 * math.sin(arm_angle)
            hand_x  = elbow_x + sign * 12 * math.cos(arm_angle + 0.1)
            hand_y  = elbow_y + 12 * math.sin(arm_angle + 0.1)

        elif expression in ('HAPPY', 'LAUGHING'):
            # Arms slightly raised — cheerful
            arm_angle = -0.20 + math.sin(t * wobble_spd) * 0.05
            elbow_x = base_x + sign * 14 * math.cos(arm_angle)
            elbow_y = base_y + 14 * math.sin(arm_angle)
            hand_x  = elbow_x + sign * 12 * math.cos(arm_angle + 0.15)
            hand_y  = elbow_y + 12 * math.sin(arm_angle + 0.15)

        else:
            # Default: arms nearly horizontal, slight droop
            arm_angle = 0.05 + math.sin(t * wobble_spd) * 0.04
            elbow_x = base_x + sign * 14 * math.cos(arm_angle)
            elbow_y = base_y + 14 * math.sin(arm_angle)
            hand_x  = elbow_x + sign * 12 * math.cos(arm_angle + 0.15)
            hand_y  = elbow_y + 12 * math.sin(arm_angle + 0.15)

        # Upper arm
        set_color(ctx, 0.32, 0.38, 0.42)
        ctx.set_line_width(4.5)
        ctx.move_to(base_x, base_y)
        ctx.line_to(elbow_x, elbow_y)
        ctx.stroke()

        # Elbow joint cap
        set_color(ctx, 0.34, 0.40, 0.45)
        draw_circle(ctx, elbow_x, elbow_y, 2.8)

        # Forearm
        set_color(ctx, 0.28, 0.34, 0.38)
        ctx.set_line_width(4.0)
        ctx.move_to(elbow_x, elbow_y)
        ctx.line_to(hand_x, hand_y)
        ctx.stroke()

        # Rounded hand
        set_color(ctx, 0.36, 0.42, 0.46)
        draw_circle(ctx, hand_x, hand_y, 3.5)


def draw_legs(ctx, t, cx, cy, cfg):
    """Short straight legs with knee cap and wide flat boot."""
    body_cy = cy + 14
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)

    for sign in (-1, 1):
        base_x = cx + sign * 7
        base_y = body_cy + 12

        ankle_x = base_x
        ankle_y = base_y + 14

        # Leg shaft
        set_color(ctx, 0.30, 0.36, 0.40)
        ctx.set_line_width(5.5)
        ctx.move_to(base_x, base_y)
        ctx.line_to(ankle_x, ankle_y)
        ctx.stroke()

        # Knee cap
        set_color(ctx, 0.34, 0.40, 0.44)
        draw_circle(ctx, base_x, base_y + 5, 3.0)

        # Wide flat boot
        set_color(ctx, 0.22, 0.26, 0.30)
        ctx.save()
        ctx.translate(ankle_x, ankle_y + 1)
        ctx.scale(2.4, 0.70)
        draw_circle(ctx, 0, 0, 4)
        ctx.restore()



def draw_body(ctx, t, cx, cy, cfg):
    """Head slightly larger than torso, connected by a short neck."""
    wobble_spd = cfg.get('wobble_spd', 0.01)
    wobble_amp = cfg.get('wobble_amp', 1)
    float_y = math.sin(t * wobble_spd) * wobble_amp

    # head_cy offset kept at -14 from centre; torso at +14
    head_cy = cy - 14 + float_y
    body_cy = cy + 14 + float_y

    # ---- Torso — rounded oval, noticeably smaller than head ----
    set_color(ctx, 0.28, 0.34, 0.38)
    draw_ellipse(ctx, cx, body_cy, 11, 13)

    # Chest panel highlight
    set_color(ctx, 0.35, 0.42, 0.46, 0.55)
    ctx.save()
    ctx.translate(cx, body_cy - 2)
    ctx.scale(1.0, 0.55)
    draw_ellipse(ctx, 0, 0, 6, 7)
    ctx.restore()

    # ---- Neck connecting head to torso ----
    set_color(ctx, 0.30, 0.36, 0.40)
    ctx.rectangle(cx - 3, head_cy + 20, 6, 8)
    ctx.fill()

    # ---- Head — circle, radius ~28 (bigger than torso width 11) ----
    # Drop shadow
    set_color(ctx, 0.08, 0.10, 0.12, 0.45)
    draw_circle(ctx, cx + 1.5, head_cy + 2, 24)
    # Main head
    set_color(ctx, 0.34, 0.40, 0.44)
    draw_circle(ctx, cx, head_cy, 22)

    # Jaw / chin — slightly flattened bottom
    set_color(ctx, 0.30, 0.36, 0.40)
    ctx.save()
    ctx.translate(cx, head_cy + 13)
    ctx.scale(1.0, 0.40)
    draw_ellipse(ctx, 0, 0, 17, 11)
    ctx.restore()

    # Subtle top highlight
    set_color(ctx, 0.60, 0.70, 0.76, 0.18)
    ctx.save()
    ctx.translate(cx - 5, head_cy - 10)
    ctx.scale(1.0, 0.50)
    draw_circle(ctx, 0, 0, 8)
    ctx.restore()


def draw_eyes(ctx, t, cx, cy, cfg):
    """Large round eyes: white → blue iris → tall dark pupil → specular."""
    eye_sq = cfg.get('eye_sq', 0.90)
    pupil_dy = cfg.get('pupil_dy', 0)
    head_cy = cy - 14

    # Blink: every 220 frames, brief and fast
    phase = (t % 220) / 220.0
    if 0.45 < phase < 0.48:
        blink = 1.0 - (phase - 0.45) / 0.03
    elif 0.48 < phase < 0.51:
        blink = (phase - 0.48) / 0.03
    else:
        blink = 0.0

    for sign in (-1, 1):
        ex = cx + sign * 11
        ey = head_cy - 1

        eye_h = max(0.06, eye_sq * (1.0 - blink * 0.95))

        # Large round eye white
        set_color(ctx, 0.88, 0.90, 0.92)
        ctx.save()
        ctx.translate(ex, ey)
        ctx.scale(1.0, eye_h)
        draw_ellipse(ctx, 0, 0, 9, 10)
        ctx.restore()

        # Blue iris — fills most of the white
        set_color(ctx, 0.20, 0.45, 0.65, 0.92)
        py = ey + pupil_dy * 0.5
        ctx.save()
        ctx.translate(ex, ey + pupil_dy * 0.3)
        ctx.scale(1.0, eye_h)
        draw_ellipse(ctx, 0, 0, 7, 8)
        ctx.restore()

        # Tall vertical pupil (rotated oval)
        set_color(ctx, 0.04, 0.04, 0.06)
        ctx.save()
        ctx.translate(ex, py)
        ctx.scale(0.55, eye_h)   # narrow x, keep y — gives tall oval
        draw_circle(ctx, 0, 0, 6)
        ctx.restore()

        # Primary specular — upper left
        set_color(ctx, 0.90, 0.95, 1.0, 0.90)
        draw_circle(ctx, ex - 3, py - 4 * eye_h, 2.2)
        # Secondary soft shine — lower right
        set_color(ctx, 0.70, 0.85, 1.0, 0.45)
        draw_circle(ctx, ex + 2.5, py + 2 * eye_h, 1.2)


def draw_brows(ctx, t, cx, cy, cfg):
    """Thick rectangular brows — filled rect for solid block look."""
    brow_dy = cfg.get('brow_dy', 0)
    head_cy = cy - 14

    set_color(ctx, 0.18, 0.20, 0.22)
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)

    for sign in (-1, 1):
        bx1 = cx + sign * 4
        by1 = head_cy - 14 + brow_dy
        bx2 = cx + sign * 16
        by2 = head_cy - 17 + brow_dy * 0.5

        # Draw as thick filled stroke
        ctx.set_line_width(4.0)
        ctx.move_to(bx1, by1)
        ctx.line_to(bx2, by2)
        ctx.stroke()


def draw_mouth(ctx, t, cx, cy, mouth_open, expression):
    """Tight, controlled mouth. Minimal movement. No cute cat shapes."""
    head_cy = cy - 14
    mx = cx
    my = head_cy + 14
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)
    ctx.set_line_width(2.0)
    set_color(ctx, 0.18, 0.20, 0.22)

    if expression in ('HAPPY', 'WAVING'):
        # Slight composed upturn — not a wide grin
        w = 6 + mouth_open * 1.5
        ctx.move_to(mx - w, my + 1)
        ctx.curve_to(mx - w, my + 3 + mouth_open * 3,
                     mx + w, my + 3 + mouth_open * 3,
                     mx + w, my + 1)
        ctx.stroke()

    elif expression == 'LAUGHING':
        # Open but controlled — no exaggerated gap
        ctx.move_to(mx - 8, my)
        ctx.curve_to(mx - 8, my + 4 + mouth_open * 6,
                     mx + 8, my + 4 + mouth_open * 6,
                     mx + 8, my)
        ctx.close_path()
        set_color(ctx, 0.10, 0.10, 0.12)
        ctx.fill()

    elif expression == 'SAD':
        # Flat downward line — stoic, not weepy
        w = 7
        ctx.move_to(mx - w, my + 2)
        ctx.curve_to(mx - w, my + 2 - mouth_open * 3 - 1,
                     mx + w, my + 2 - mouth_open * 3 - 1,
                     mx + w, my + 2)
        ctx.stroke()

    elif expression == 'SURPRISED':
        # Tight O — restrained
        set_color(ctx, 0.12, 0.12, 0.14)
        ctx.save()
        ctx.translate(mx, my + 2)
        ctx.scale(1.0, max(0.4, mouth_open * 1.2))
        draw_ellipse(ctx, 0, 0, 5, 7)
        ctx.restore()

    elif expression == 'ANGRY':
        # Hard flat line with slight downward press
        ctx.move_to(mx - 9, my + 1)
        ctx.line_to(mx + 9, my + 1)
        ctx.stroke()
        # Tight jaw clench indicator
        ctx.move_to(mx - 9, my + 1)
        ctx.curve_to(mx - 5, my + 3, mx + 5, my + 3, mx + 9, my + 1)
        ctx.stroke()

    else:
        # Default: thin neutral line, barely open
        set_color(ctx, 0.18, 0.20, 0.22)
        ctx.save()
        ctx.translate(mx, my + 1)
        open_h = 1 + mouth_open * 4
        ctx.scale(1.0, open_h / 7)
        draw_ellipse(ctx, 0, 0, 5, 7)
        ctx.restore()



def draw_blush(ctx, cx, cy, cfg):
    """No blush on a serious character."""
    return


def draw_sparkles(ctx, t, cx, cy, cfg):
    """No sparkles on a serious character."""
    return


def draw_alien(ctx, t, cx, cy, mouth_open, expression, frame_idx):
    """Draw the serious, composed character."""
    expr = EXPR.get(expression, EXPR['IDLE'])

    # Scale the entire character uniformly around its centre
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(CHAR_SCALE, CHAR_SCALE)
    ctx.translate(-cx, -cy)

    # 1. Sparkles (behind character)
    draw_sparkles(ctx, t, cx, cy, expr)

    # 2. Antennae
    draw_antennae(ctx, t, cx, cy, expr)

    # 3. Arms
    draw_arms(ctx, t, cx, cy, mouth_open, expression, expr)

    # 4. Legs
    draw_legs(ctx, t, cx, cy, expr)

    # 5. Body + Head
    draw_body(ctx, t, cx, cy, expr)

    # 6. Blush (on top of head face area)
    draw_blush(ctx, cx, cy, expr)

    # 7. Eyes
    draw_eyes(ctx, t, cx, cy, expr)

    # 8. Brows
    draw_brows(ctx, t, cx, cy, expr)

    # 9. Mouth
    draw_mouth(ctx, t, cx, cy, mouth_open, expression)

    ctx.restore()



def draw_subtitle(ctx, frame_data, w, h):
    """Draw subtitle with rolling word highlight."""
    words = frame_data.get('words', [])
    if not words or not frame_data.get('subVisible', False):
        return

    wordIndex = frame_data.get('wordIndex', -1)
    if wordIndex < 0:
        return

    # Show window of words around current word
    start = max(0, wordIndex - 4)
    end = min(len(words), wordIndex + 6)
    visible_words = words[start:end]

    # Prepare text
    ctx.set_font_size(14)
    set_color(ctx, 1, 1, 1, 0.85)

    # Measure total width
    y = h - 30
    ctx.text_path(' '.join(visible_words) + ' ')
    extents = ctx.text_extents(' '.join(visible_words) + ' ')
    total_w = extents[2] + 20

    x = (w - total_w) / 2

    # Draw pill background
    pill_h = 24
    pill_x = x - 10
    pill_y = y - pill_h / 2 - 5

    set_color(ctx, 0, 0, 0, 0.3)
    ctx.new_path()
    ctx.arc(pill_x + 12, pill_y + pill_h / 2, 12, math.pi, 0)
    ctx.arc(pill_x + total_w - 2, pill_y + pill_h / 2, 12, 0, math.pi)
    ctx.close_path()
    ctx.fill()

    # Draw words
    word_x = x
    for i, word in enumerate(visible_words):
        actual_wi = start + i

        # Color: bright for current word, dim for others
        if actual_wi == wordIndex:
            set_color(ctx, 0.85, 0.75, 1.0, 1.0)
        else:
            set_color(ctx, 1, 1, 1, 0.85)

        ctx.move_to(word_x, y)
        ctx.show_text(word + ' ')

        # Measure word width for next position
        extents = ctx.text_extents(word + ' ')
        word_x += extents[4]


def draw_progress(ctx, frame_idx, total_frames, w, h):
    """Draw progress bar at bottom."""
    progress = frame_idx / max(1, total_frames - 1)

    bar_y = h - 2
    bar_w = w * progress

    set_color(ctx, 0.3, 0.8, 0.5)
    ctx.rectangle(0, bar_y, bar_w, 2)
    ctx.fill()


# ============================================================================
# Main renderer loop
# ============================================================================
def main(manifest_path, frames_dir):
    print(f"[Renderer] Loading manifest: {manifest_path}")
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    frames = manifest['frames']
    total = len(frames)
    print(f"[Renderer] Total frames: {total}")

    # Generate stars once
    stars = generate_stars(STAR_COUNT, STAR_SEED, W, H)

    # Create surface
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)

    # Render
    for i, frame_data in enumerate(frames):
        if i % 100 == 0:
            print(f"[Renderer] Rendering frame {i}/{total}")

        t = frame_data['frame']
        mouth_open = frame_data['mouth']
        expression = frame_data['expression']
        # Lowered cy from H/2 + 60 to H/2 + 100 to provide maximum headroom for antennae.
        cx, cy = W / 2, H / 2 + 100

        # Draw layers
        draw_background(ctx, t, EXPR.get(expression, EXPR['IDLE']), cx, cy, W, H, stars)
        draw_alien(ctx, t, cx, cy, mouth_open, expression, i)
        draw_subtitle(ctx, frame_data, W, H)
        draw_progress(ctx, i, total, W, H)

        # Write frame
        output_file = Path(frames_dir) / f"frame_{i:06d}.png"
        surface.write_to_png(str(output_file))

        # Clear surface for next frame
        ctx.set_operator(cairo.OPERATOR_CLEAR)
        ctx.rectangle(0, 0, W, H)
        ctx.fill()
        ctx.set_operator(cairo.OPERATOR_OVER)

    print(f"[Renderer] Complete: {total} frames rendered")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 renderer.py <manifest.json> <frames_dir>")
        sys.exit(1)

    main(sys.argv[1], sys.argv[2])
