#!/usr/bin/env python3
"""
autoConMan Modular Cairo Video Renderer
Separates configuration, utilities, and rendering components into logical classes.
"""

import os
import sys
import json
import math
import random
import cairo
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

# ============================================================================
# Configuration & Constants
# ============================================================================

class Config:
    """Centralized configuration for the rendering engine."""
    WIDTH = int(os.getenv('RENDER_WIDTH', 640))
    HEIGHT = int(os.getenv('RENDER_HEIGHT', 480))
    FPS = int(os.getenv('FPS', 24))
    STAR_COUNT = int(os.getenv('STAR_COUNT', 30))
    STAR_SEED = int(os.getenv('STAR_SEED', 42))
    CHAR_SCALE = float(os.getenv('CHAR_SCALE', 3.5))

    EXPRESSIONS = {
        'HAPPY': {
            'brow_dy': -3, 'eye_sq': 0.70, 'pupil_dy': 1, 'blush': False,
            'wobble_spd': 0.012, 'wobble_amp': 1.2, 'aura': (0.25, 0.45, 0.35), 'bg': (0.10, 0.12, 0.11)
        },
        'SAD': {
            'brow_dy': 6, 'eye_sq': 1.10, 'pupil_dy': -2, 'blush': False,
            'wobble_spd': 0.008, 'wobble_amp': 0.8, 'aura': (0.15, 0.20, 0.35), 'bg': (0.08, 0.09, 0.14)
        },
        'ANGRY': {
            'brow_dy': 10, 'eye_sq': 0.75, 'pupil_dy': 3, 'blush': False,
            'wobble_spd': 0.06, 'wobble_amp': 2.5, 'aura': (0.50, 0.10, 0.08), 'bg': (0.12, 0.07, 0.07)
        },
        'SURPRISED': {
            'brow_dy': -10, 'eye_sq': 1.40, 'pupil_dy': -4, 'blush': False,
            'wobble_spd': 0.04, 'wobble_amp': 1.5, 'aura': (0.40, 0.35, 0.15), 'bg': (0.11, 0.10, 0.07)
        },
        'LAUGHING': {
            'brow_dy': -3, 'eye_sq': 0.30, 'pupil_dy': 4, 'blush': False,
            'wobble_spd': 0.09, 'wobble_amp': 3.0, 'aura': (0.20, 0.40, 0.28), 'bg': (0.09, 0.11, 0.10)
        },
        'WAVING': {
            'brow_dy': -2, 'eye_sq': 0.80, 'pupil_dy': 1, 'blush': False,
            'wobble_spd': 0.015, 'wobble_amp': 1.0, 'aura': (0.18, 0.30, 0.45), 'bg': (0.09, 0.10, 0.13)
        },
        'IDLE': {
            'brow_dy': 0, 'eye_sq': 0.90, 'pupil_dy': 0, 'blush': False,
            'wobble_spd': 0.010, 'wobble_amp': 0.7, 'aura': (0.20, 0.25, 0.35), 'bg': (0.09, 0.10, 0.12)
        },
        'THINK': {
            'brow_dy': 4, 'eye_sq': 0.95, 'pupil_dy': -2, 'blush': False,
            'wobble_spd': 0.008, 'wobble_amp': 0.5, 'aura': (0.22, 0.18, 0.35), 'bg': (0.09, 0.08, 0.12)
        },
    }

# ============================================================================
# Utilities
# ============================================================================

class DrawUtils:
    """Helper methods for common Cairo drawing operations."""
    @staticmethod
    def set_color(ctx, r, g, b, a=1.0):
        ctx.set_source_rgba(r, g, b, a)

    @staticmethod
    def draw_circle(ctx, x, y, radius):
        ctx.arc(x, y, radius, 0, 2 * math.pi)
        ctx.fill()

    @staticmethod
    def draw_ellipse(ctx, x, y, rx, ry):
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(rx, ry)
        ctx.arc(0, 0, 1, 0, 2 * math.pi)
        ctx.restore()
        ctx.fill()

    @staticmethod
    def generate_stars(count, seed, w, h):
        rng = random.Random(seed)
        stars = []
        for _ in range(count):
            x = rng.uniform(0, w)
            y = rng.uniform(0, h * 0.7)
            brightness = rng.uniform(0.3, 1.0)
            size = rng.uniform(0.5, 2.0)
            stars.append((x, y, brightness, size))
        return stars

# ============================================================================
# Rendering Components
# ============================================================================

class CharacterRenderer:
    """Handles drawing of the avatar character."""
    def __init__(self, ctx, cx, cy):
        self.ctx = ctx
        self.cx = cx
        self.cy = cy

    def draw(self, t, mouth_open, expression_name):
        expr_cfg = Config.EXPRESSIONS.get(expression_name, Config.EXPRESSIONS['IDLE'])
        
        self.ctx.save()
        self.ctx.translate(self.cx, self.cy)
        self.ctx.scale(Config.CHAR_SCALE, Config.CHAR_SCALE)
        self.ctx.translate(-self.cx, -self.cy)

        self._draw_antennae(t, expr_cfg)
        self._draw_arms(t, mouth_open, expression_name, expr_cfg)
        self._draw_legs(t, expr_cfg)
        self._draw_body(t, expr_cfg)
        self._draw_eyes(t, expr_cfg)
        self._draw_brows(t, expr_cfg)
        self._draw_mouth(t, mouth_open, expression_name)

        self.ctx.restore()

    def _draw_antennae(self, t, cfg):
        head_cy = self.cy - 14
        self.ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        for sign, phase_off in [(-1, 0), (1, math.pi / 3)]:
            base_x = self.cx + sign * 8
            base_y = head_cy - 20
            tilt = math.sin(t * 0.018 + phase_off) * 0.8
            tip_x = base_x + sign * (4 + tilt)
            tip_y = base_y - 18
            DrawUtils.set_color(self.ctx, 0.35, 0.35, 0.40)
            self.ctx.set_line_width(2.0)
            self.ctx.move_to(base_x, base_y)
            self.ctx.line_to(tip_x, tip_y)
            self.ctx.stroke()
            DrawUtils.set_color(self.ctx, 0.0, 0.55, 0.60, 0.30)
            DrawUtils.draw_circle(self.ctx, tip_x, tip_y, 4)
            DrawUtils.set_color(self.ctx, 0.05, 0.70, 0.75)
            DrawUtils.draw_circle(self.ctx, tip_x, tip_y, 2.2)

    def _draw_arms(self, t, mouth_open, expression, cfg):
        body_cy = self.cy + 14
        wobble_spd = cfg.get('wobble_spd', 0.01)
        self.ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        for sign in (-1, 1):
            base_x = self.cx + sign * 12
            base_y = body_cy - 2
            arm_angle = 0.05 + math.sin(t * wobble_spd) * 0.04
            if expression == 'WAVING' and sign == 1:
                wave = math.sin(t * 0.18) * 0.25
                elbow_x = base_x + sign * 18 * math.cos(-0.55 + wave)
                elbow_y = base_y + 18 * math.sin(-0.55 + wave)
                hand_x  = elbow_x + sign * 16 * math.cos(-0.90 + wave)
                hand_y  = elbow_y + 16 * math.sin(-0.90 + wave)
            else:
                elbow_x = base_x + sign * 14 * math.cos(arm_angle)
                elbow_y = base_y + 14 * math.sin(arm_angle)
                hand_x  = elbow_x + sign * 12 * math.cos(arm_angle + 0.15)
                hand_y  = elbow_y + 12 * math.sin(arm_angle + 0.15)
            DrawUtils.set_color(self.ctx, 0.32, 0.38, 0.42)
            self.ctx.set_line_width(4.5)
            self.ctx.move_to(base_x, base_y)
            self.ctx.line_to(elbow_x, elbow_y)
            self.ctx.stroke()
            DrawUtils.set_color(self.ctx, 0.28, 0.34, 0.38)
            self.ctx.set_line_width(4.0)
            self.ctx.move_to(elbow_x, elbow_y)
            self.ctx.line_to(hand_x, hand_y)
            self.ctx.stroke()
            DrawUtils.set_color(self.ctx, 0.36, 0.42, 0.46)
            DrawUtils.draw_circle(self.ctx, hand_x, hand_y, 3.5)

    def _draw_legs(self, t, cfg):
        body_cy = self.cy + 14
        self.ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        for sign in (-1, 1):
            base_x = self.cx + sign * 7
            base_y = body_cy + 12
            ankle_x = base_x
            ankle_y = base_y + 14
            DrawUtils.set_color(self.ctx, 0.30, 0.36, 0.40)
            self.ctx.set_line_width(5.5)
            self.ctx.move_to(base_x, base_y)
            self.ctx.line_to(ankle_x, ankle_y)
            self.ctx.stroke()
            DrawUtils.set_color(self.ctx, 0.22, 0.26, 0.30)
            self.ctx.save()
            self.ctx.translate(ankle_x, ankle_y + 1)
            self.ctx.scale(2.4, 0.70)
            DrawUtils.draw_circle(self.ctx, 0, 0, 4)
            self.ctx.restore()

    def _draw_body(self, t, cfg):
        wobble_spd = cfg.get('wobble_spd', 0.01)
        wobble_amp = cfg.get('wobble_amp', 1)
        float_y = math.sin(t * wobble_spd) * wobble_amp
        head_cy = self.cy - 14 + float_y
        body_cy = self.cy + 14 + float_y
        DrawUtils.set_color(self.ctx, 0.28, 0.34, 0.38)
        DrawUtils.draw_ellipse(self.ctx, self.cx, body_cy, 11, 13)
        DrawUtils.set_color(self.ctx, 0.30, 0.36, 0.40)
        self.ctx.rectangle(self.cx - 3, head_cy + 20, 6, 8)
        self.ctx.fill()
        DrawUtils.set_color(self.ctx, 0.34, 0.40, 0.44)
        DrawUtils.draw_circle(self.ctx, self.cx, head_cy, 22)

    def _draw_eyes(self, t, cfg):
        eye_sq = cfg.get('eye_sq', 0.90)
        pupil_dy = cfg.get('pupil_dy', 0)
        head_cy = self.cy - 14
        phase = (t % 220) / 220.0
        blink = 0.0
        if 0.45 < phase < 0.48: blink = 1.0 - (phase - 0.45) / 0.03
        elif 0.48 < phase < 0.51: blink = (phase - 0.48) / 0.03

        for sign in (-1, 1):
            ex = self.cx + sign * 11
            ey = head_cy - 1
            eye_h = max(0.06, eye_sq * (1.0 - blink * 0.95))
            DrawUtils.set_color(self.ctx, 0.88, 0.90, 0.92)
            self.ctx.save()
            self.ctx.translate(ex, ey)
            self.ctx.scale(1.0, eye_h)
            DrawUtils.draw_ellipse(self.ctx, 0, 0, 9, 10)
            self.ctx.restore()
            DrawUtils.set_color(self.ctx, 0.04, 0.04, 0.06)
            self.ctx.save()
            self.ctx.translate(ex, ey + pupil_dy * 0.5)
            self.ctx.scale(0.55, eye_h)
            DrawUtils.draw_circle(self.ctx, 0, 0, 6)
            self.ctx.restore()

    def _draw_brows(self, t, cfg):
        brow_dy = cfg.get('brow_dy', 0)
        head_cy = self.cy - 14
        DrawUtils.set_color(self.ctx, 0.18, 0.20, 0.22)
        self.ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        for sign in (-1, 1):
            bx1, by1 = self.cx + sign * 4, head_cy - 14 + brow_dy
            bx2, by2 = self.cx + sign * 16, head_cy - 17 + brow_dy * 0.5
            self.ctx.set_line_width(4.0)
            self.ctx.move_to(bx1, by1)
            self.ctx.line_to(bx2, by2)
            self.ctx.stroke()

    def _draw_mouth(self, t, mouth_open, expression):
        head_cy = self.cy - 14
        mx, my = self.cx, head_cy + 14
        self.ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        self.ctx.set_line_width(2.0)
        DrawUtils.set_color(self.ctx, 0.18, 0.20, 0.22)
        if expression in ('HAPPY', 'WAVING'):
            w = 6 + mouth_open * 1.5
            self.ctx.move_to(mx - w, my + 1)
            self.ctx.curve_to(mx - w, my + 3 + mouth_open * 3, mx + w, my + 3 + mouth_open * 3, mx + w, my + 1)
            self.ctx.stroke()
        elif expression == 'LAUGHING':
            self.ctx.move_to(mx - 8, my)
            self.ctx.curve_to(mx - 8, my + 4 + mouth_open * 6, mx + 8, my + 4 + mouth_open * 6, mx + 8, my)
            self.ctx.close_path()
            DrawUtils.set_color(self.ctx, 0.10, 0.10, 0.12)
            self.ctx.fill()
        elif expression == 'SURPRISED':
            DrawUtils.set_color(self.ctx, 0.12, 0.12, 0.14)
            self.ctx.save()
            self.ctx.translate(mx, my + 2)
            self.ctx.scale(1.0, max(0.4, mouth_open * 1.2))
            DrawUtils.draw_ellipse(self.ctx, 0, 0, 5, 7)
            self.ctx.restore()
        else:
            self.ctx.save()
            self.ctx.translate(mx, my + 1)
            open_h = 1 + mouth_open * 4
            self.ctx.scale(1.0, open_h / 7)
            DrawUtils.draw_ellipse(self.ctx, 0, 0, 5, 7)
            self.ctx.restore()

class BackgroundRenderer:
    """Handles drawing of the environment."""
    def __init__(self, ctx, w, h, stars):
        self.ctx = ctx
        self.w = w
        self.h = h
        self.stars = stars

    def draw(self, expression_name, cx, cy):
        expr_cfg = Config.EXPRESSIONS.get(expression_name, Config.EXPRESSIONS['IDLE'])
        bg_color = expr_cfg.get('bg', (0.1, 0.1, 0.1))
        aura_color = expr_cfg.get('aura', (0.2, 0.3, 0.4))
        
        DrawUtils.set_color(self.ctx, *bg_color)
        self.ctx.rectangle(0, 0, self.w, self.h)
        self.ctx.fill()
        
        pat = cairo.RadialGradient(cx, cy, 0, cx, cy, 300)
        pat.add_color_stop_rgba(0, aura_color[0], aura_color[1], aura_color[2], 0.15)
        pat.add_color_stop_rgba(1, aura_color[0], aura_color[1], aura_color[2], 0.0)
        self.ctx.set_source(pat)
        self.ctx.arc(cx, cy, 300, 0, 2 * math.pi)
        self.ctx.fill()
        
        for sx, sy, brightness, size in self.stars:
            DrawUtils.set_color(self.ctx, brightness, brightness, brightness * 1.1, 0.55)
            DrawUtils.draw_circle(self.ctx, sx, sy, size)

class SubtitleRenderer:
    """Handles drawing of subtitle overlays."""
    def __init__(self, ctx, w, h):
        self.ctx = ctx
        self.w = w
        self.h = h

    def draw(self, frame_data):
        words = frame_data.get('words', [])
        if not words or not frame_data.get('subVisible', False): return
        wordIndex = frame_data.get('wordIndex', -1)
        if wordIndex < 0: return

        start = max(0, wordIndex - 4)
        end = min(len(words), wordIndex + 6)
        visible_words = words[start:end]

        self.ctx.set_font_size(14)
        y = self.h - 30
        extents = self.ctx.text_extents(' '.join(visible_words) + ' ')
        total_w = extents[2] + 20
        x = (self.w - total_w) / 2

        DrawUtils.set_color(self.ctx, 0, 0, 0, 0.3)
        self.ctx.new_path()
        self.ctx.arc(x + 2, y - 10, 12, math.pi, 0)
        self.ctx.arc(x + total_w - 2, y - 10, 12, 0, math.pi)
        self.ctx.close_path()
        self.ctx.fill()

        word_x = x
        for i, word in enumerate(visible_words):
            actual_wi = start + i
            if actual_wi == wordIndex: DrawUtils.set_color(self.ctx, 0.85, 0.75, 1.0, 1.0)
            else: DrawUtils.set_color(self.ctx, 1, 1, 1, 0.85)
            self.ctx.move_to(word_x, y)
            self.ctx.show_text(word + ' ')
            word_x += self.ctx.text_extents(word + ' ')[4]

# ============================================================================
# Engine
# ============================================================================

def render_frame_worker(args):
    """Orchestrates the rendering of a single frame in a worker process."""
    frame_idx, frame_data, frames_dir, stars = args
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, Config.WIDTH, Config.HEIGHT)
    ctx = cairo.Context(surface)
    
    cx, cy = Config.WIDTH / 2, Config.HEIGHT / 2 + 100
    expression = frame_data['expression']
    
    bg_renderer = BackgroundRenderer(ctx, Config.WIDTH, Config.HEIGHT, stars)
    bg_renderer.draw(expression, cx, cy)
    
    char_renderer = CharacterRenderer(ctx, cx, cy)
    char_renderer.draw(frame_data['frame'], frame_data['mouth'], expression)
    
    sub_renderer = SubtitleRenderer(ctx, Config.WIDTH, Config.HEIGHT)
    sub_renderer.draw(frame_data)
    
    # Progress bar
    progress = frame_idx / max(1, frame_data['total_frames'] - 1)
    DrawUtils.set_color(ctx, 0.3, 0.8, 0.5)
    ctx.rectangle(0, Config.HEIGHT - 2, Config.WIDTH * progress, 2)
    ctx.fill()

    output_file = Path(frames_dir) / f"frame_{frame_idx:06d}.png"
    surface.write_to_png(str(output_file))
    return True

def main(manifest_path, frames_dir):
    print(f"[Renderer] Loading manifest: {manifest_path}")
    with open(manifest_path, 'r') as f: manifest = json.load(f)
    frames = manifest['frames']
    total = len(frames)
    stars = DrawUtils.generate_stars(Config.STAR_COUNT, Config.STAR_SEED, Config.WIDTH, Config.HEIGHT)
    worker_args = [(i, {**f, 'total_frames': total}, frames_dir, stars) for i, f in enumerate(frames)]
    max_workers = os.cpu_count() or 4
    print(f"[Renderer] Processing {total} frames with {max_workers} processes...")
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        list(executor.map(render_frame_worker, worker_args))
    print("[Renderer] Complete.")

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(1)
    main(sys.argv[1], sys.argv[2])
