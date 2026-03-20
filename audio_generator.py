#!/usr/bin/env python3
"""
Audio Generator - Produces TTS audio synchronized to the frame manifest.

Flow:
  1. Extract speech segments from the manifest (group consecutive subVisible frames).
  2. Generate a gTTS .mp3 for each segment.
  3. Composite all clips at their correct timestamps → one AudioClip matching
     the video duration.
"""

import os
import tempfile
import asyncio
import edge_tts
from moviepy import AudioFileClip, CompositeAudioClip


# Map expressions to edge-tts voice parameters
# format: (pitch, rate)
VOICE_MAP = {
    'HAPPY': ('+5Hz', '+10%'),
    'LAUGHING': ('+8Hz', '+20%'),
    'SAD': ('-5Hz', '-15%'),
    'ANGRY': ('-3Hz', '+5%'),
    'SURPRISED': ('+10Hz', '+10%'),
    'IDLE': ('+0Hz', '+0%'),
    'THINK': ('-2Hz', '-5%'),
    'WAVING': ('+2Hz', '+0%'),
}

DEFAULT_VOICE = 'en-US-ChristopherNeural'


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


async def generate_segment_audio(text, mp3_path, expression):
    """Helper to generate a single segment using edge-tts."""
    pitch, rate = VOICE_MAP.get(expression, VOICE_MAP['IDLE'])
    communicate = edge_tts.Communicate(text, DEFAULT_VOICE, pitch=pitch, rate=rate)
    await communicate.save(mp3_path)


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
    fps = manifest['fps']
    total_duration = manifest['totalFrames'] / fps

    segments = extract_speech_segments(manifest)
    if not segments:
        print('[AudioGenerator] No speech segments found.')
        return None

    print(f'[AudioGenerator] Generating Neural TTS for {len(segments)} segment(s)...')

    audio_clips = []

    for i, seg in enumerate(segments):
        mp3_path = os.path.join(temp_dir, f'seg_{i:04d}.mp3')
        seg_duration = seg['end_time'] - seg['start_time']

        # Generate Neural TTS
        try:
            print(f'[AudioGenerator] Generating TTS for: "{seg["text"][:30]}..." ({seg["expression"]})')
            asyncio.run(generate_segment_audio(seg['text'], mp3_path, seg['expression']))
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

    # Use a real temp directory for segments
    with tempfile.TemporaryDirectory() as temp_dir:
        audio = build_audio_track(manifest, temp_dir)
        if audio:
            audio.write_audiofile(output_path, fps=44100, verbose=False, logger=None)
            print(f'[AudioGenerator] Success: {output_path}')
        else:
            print('[AudioGenerator] No audio segments to write.')


if __name__ == '__main__':
    main()
