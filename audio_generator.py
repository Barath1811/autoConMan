#!/usr/bin/env python3
"""
Audio Generator - Produces TTS audio synchronized to the frame manifest.

Flow:
  1. Extract speech segments from the manifest (group consecutive subVisible frames).
  2. Generate a gTTS .mp3 for each segment.
  3. Apply FFmpeg audio filters (pitch shift + tempo) for expression-based modulation.
  4. Composite all clips at their correct timestamps → one AudioClip matching
     the video duration.
"""

import os
import subprocess
import tempfile
from gtts import gTTS
from moviepy import AudioFileClip, CompositeAudioClip


# Expression-based audio modulation via FFmpeg filters.
# pitch_factor: multiplies sample rate (>1 = higher pitch, <1 = lower pitch)
# tempo_factor: adjusts speaking speed (>1 = faster, <1 = slower)
VOICE_MAP = {
    'HAPPY':     {'pitch_factor': 1.06, 'tempo_factor': 1.08},
    'LAUGHING':  {'pitch_factor': 1.10, 'tempo_factor': 1.15},
    'SAD':       {'pitch_factor': 0.93, 'tempo_factor': 0.88},
    'ANGRY':     {'pitch_factor': 0.97, 'tempo_factor': 1.10},
    'SURPRISED': {'pitch_factor': 1.12, 'tempo_factor': 1.05},
    'WAVING':    {'pitch_factor': 1.04, 'tempo_factor': 1.02},
    'THINK':     {'pitch_factor': 0.98, 'tempo_factor': 0.93},
    'IDLE':      {'pitch_factor': 1.00, 'tempo_factor': 1.00},
}


def extract_speech_segments(manifest):
    """
    Parse manifest frames into a flat list of speech segments.

    Each segment is a dict:
        { 'text': str, 'start_time': float, 'end_time': float, 'expression': str }

    Consecutive frames sharing the same non-empty text are merged into one
    segment. Silence frames (subVisible=False or empty text) produce gaps
    between segments.
    """
    fps = manifest['fps']
    frames = manifest['frames']
    segments = []

    current_text = None
    start_frame = None
    current_expr = 'IDLE'

    for frame_data in frames:
        text = frame_data.get('text', '').strip()
        visible = frame_data.get('subVisible', False)
        expr = frame_data.get('expression', 'IDLE')
        frame_idx = frame_data['frame']

        if visible and text:
            if text != current_text:
                # Flush the previous segment
                if current_text is not None:
                    segments.append({
                        'text': current_text,
                        'start_time': start_frame / fps,
                        'end_time': frame_idx / fps,
                        'expression': current_expr
                    })
                current_text = text
                start_frame = frame_idx
                current_expr = expr
        else:
            # Silence frame — flush any open segment
            if current_text is not None:
                segments.append({
                    'text': current_text,
                    'start_time': start_frame / fps,
                    'end_time': frame_idx / fps,
                    'expression': current_expr
                })
                current_text = None
                start_frame = None

    # Flush anything still open at the end
    if current_text is not None:
        total_frames = manifest['totalFrames']
        segments.append({
            'text': current_text,
            'start_time': start_frame / fps,
            'end_time': total_frames / fps,
            'expression': current_expr
        })

    return segments


def apply_expression_filter(input_mp3, output_mp3, expression):
    """
    Apply pitch and tempo FFmpeg filters based on the expression.
    Falls back to copying the original if FFmpeg fails.
    """
    params = VOICE_MAP.get(expression, VOICE_MAP['IDLE'])
    pitch = params['pitch_factor']
    tempo = params['tempo_factor']
    base_rate = 24000

    # If no modulation needed, just copy
    if pitch == 1.0 and tempo == 1.0:
        import shutil
        shutil.copy(input_mp3, output_mp3)
        return

    # FFmpeg filter chain:
    # 1. asetrate: shift pitch by resampling (changes speed too)
    # 2. aresample: bring back to original sample rate
    # 3. atempo: correct the speed back (or add extra tempo change)
    # atempo is limited to [0.5, 2.0] so chain if needed
    resampled_rate = int(base_rate * pitch)
    atempo = tempo / pitch  # compensate speed from pitch shift

    # Clamp atempo to valid range [0.5, 2.0]
    atempo_chain = []
    remaining = atempo
    while remaining > 2.0:
        atempo_chain.append('atempo=2.0')
        remaining /= 2.0
    while remaining < 0.5:
        atempo_chain.append('atempo=0.5')
        remaining *= 2.0
    atempo_chain.append(f'atempo={remaining:.4f}')

    filter_str = f'asetrate={resampled_rate},aresample={base_rate},' + ','.join(atempo_chain)

    cmd = [
        'ffmpeg', '-y', '-i', input_mp3,
        '-af', filter_str,
        output_mp3
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print(f'[AudioGenerator] WARNING: FFmpeg filter failed for expression {expression}, using original.')
        import shutil
        shutil.copy(input_mp3, output_mp3)


def generate_segment_audio(text, mp3_path, expression, temp_dir):
    """Generate a single segment using gTTS and apply expression-based modulation."""
    raw_mp3 = mp3_path.replace('.mp3', '_raw.mp3')
    
    # Step 1: Generate TTS
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(raw_mp3)

    # Step 2: Apply expression-based pitch/tempo modulation
    apply_expression_filter(raw_mp3, mp3_path, expression)

    # Cleanup raw file
    if os.path.exists(raw_mp3):
        os.remove(raw_mp3)


def build_audio_track(manifest, temp_dir):
    """
    Generate TTS audio for all speech segments in the manifest and composite
    them into a single AudioClip whose duration matches the video.

    Args:
        manifest (dict): Loaded manifest.json dict.
        temp_dir (str): Directory to write temporary .mp3 files.

    Returns:
        CompositeAudioClip | None: Combined audio track, or None if there
                                   are no speech segments.
    """
    fps = manifest.get('fps', 24)
    total_duration = manifest.get('totalFrames', 0) / fps

    segments = extract_speech_segments(manifest)
    if not segments:
        print('[AudioGenerator] No speech segments found.')
        return None

    print(f'[AudioGenerator] Generating TTS for {len(segments)} segment(s)...')

    audio_clips = []

    for i, seg in enumerate(segments):
        mp3_path = os.path.join(temp_dir, f'seg_{i:04d}.mp3')
        seg_duration = seg['end_time'] - seg['start_time']
        expression = seg['expression']

        # Generate TTS with expression modulation
        try:
            print(f'[AudioGenerator] Generating TTS for: "{seg["text"][:40]}..." ({expression})')
            generate_segment_audio(seg['text'], mp3_path, expression, temp_dir)
            print(f'[AudioGenerator] Saved: {mp3_path}')
        except Exception as e:
            print(f'[AudioGenerator] WARNING: TTS failed for segment {i}: {e}')
            continue

        # Load audio clip and position it at the right timestamp
        try:
            clip = AudioFileClip(mp3_path)

            # If TTS is slightly longer than the allocated window, trim it
            if clip.duration > seg_duration:
                clip = clip.subclipped(0, seg_duration)

            clip = clip.with_start(seg['start_time'])
            audio_clips.append(clip)
        except Exception as e:
            print(f'[AudioGenerator] WARNING: Could not load mp3 for segment {i}: {e}')

    if not audio_clips:
        print('[AudioGenerator] No audio clips generated.')
        return None

    print(f'[AudioGenerator] Compositing {len(audio_clips)} clip(s) into {total_duration:.2f}s audio track...')
    composite = CompositeAudioClip(audio_clips)
    return composite


def main():
    import sys
    import json
    if len(sys.argv) != 3:
        print("Usage: python audio_generator.py <manifest.json> <output_audio.mp3>")
        sys.exit(1)

    manifest_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    with tempfile.TemporaryDirectory() as tmp_dir:
        audio = build_audio_track(manifest, tmp_dir)
        if audio:
            audio.write_audiofile(output_path, fps=44100, verbose=False, logger=None)
            print(f'[AudioGenerator] Success: {output_path}')
        else:
            print('[AudioGenerator] No audio segments to write.')


if __name__ == '__main__':
    main()
