#!/usr/bin/env python3
"""
Audio Generator - Produces TTS audio synchronized to the frame manifest.

Uses Piper TTS (free, offline neural voice) for natural-sounding speech.
Expression-based pitch/tempo modulation applied via FFmpeg post-processing.
Falls back to gTTS if Piper model is not available.

Flow:
  1. Extract speech segments from the manifest.
  2. Generate TTS per segment using Piper (or gTTS fallback).
  3. Apply FFmpeg pitch/tempo filter per expression.
  4. Composite all clips at their correct timestamps → one AudioClip.
"""

import os
import wave
import json
import tempfile
import subprocess
from pathlib import Path
from moviepy import AudioFileClip, CompositeAudioClip


# Piper voice model path — downloaded in cron.yml before npm start
PIPER_MODEL_PATH = os.getenv('PIPER_MODEL_PATH', '/tmp/piper-models/voice.onnx')

# Expression-based FFmpeg modulation
# pitch_semitones: positive = higher pitch, negative = lower
# tempo: 1.0 = normal, >1 = faster, <1 = slower
VOICE_MAP = {
    'HAPPY':     {'pitch': +2.0, 'tempo': 1.08},
    'LAUGHING':  {'pitch': +3.0, 'tempo': 1.15},
    'SAD':       {'pitch': -2.5, 'tempo': 0.88},
    'ANGRY':     {'pitch': -1.0, 'tempo': 1.12},
    'SURPRISED': {'pitch': +3.5, 'tempo': 1.05},
    'WAVING':    {'pitch': +1.5, 'tempo': 1.04},
    'THINK':     {'pitch': -1.0, 'tempo': 0.92},
    'IDLE':      {'pitch':  0.0, 'tempo': 1.00},
}


def extract_speech_segments(manifest):
    """Parse manifest frames into a flat list of speech segments."""
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
            if current_text is not None:
                segments.append({
                    'text': current_text,
                    'start_time': start_frame / fps,
                    'end_time': frame_idx / fps,
                    'expression': current_expr
                })
                current_text = None
                start_frame = None

    if current_text is not None:
        total_frames = manifest['totalFrames']
        segments.append({
            'text': current_text,
            'start_time': start_frame / fps,
            'end_time': total_frames / fps,
            'expression': current_expr
        })

    return segments


def generate_with_piper(text, wav_path):
    """
    Generate WAV audio using Piper TTS (offline neural voice).
    Returns True on success, False if model not available.
    """
    if not Path(PIPER_MODEL_PATH).exists():
        return False

    try:
        from piper.voice import PiperVoice

        voice = PiperVoice.load(PIPER_MODEL_PATH, use_cuda=False)
        with wave.open(wav_path, 'w') as wav_file:
            voice.synthesize(text, wav_file)
        return True
    except Exception as e:
        print(f'[AudioGenerator] Piper error: {e}')
        return False


def generate_with_gtts_fallback(text, wav_path):
    """Fallback: gTTS + convert to WAV via FFmpeg."""
    from gtts import gTTS
    import tempfile

    tmp_mp3 = wav_path.replace('.wav', '_gtts.mp3')
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(tmp_mp3)

    # Convert mp3 to wav for uniform pipeline
    cmd = ['ffmpeg', '-y', '-i', tmp_mp3, wav_path]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if os.path.exists(tmp_mp3):
        os.remove(tmp_mp3)


def apply_expression_filter(input_wav, output_mp3, expression):
    """
    Apply pitch shift + tempo change via FFmpeg based on expression.
    """
    params = VOICE_MAP.get(expression, VOICE_MAP['IDLE'])
    semitones = params['pitch']
    tempo = params['tempo']

    if semitones == 0.0 and tempo == 1.0:
        # No modulation — direct convert to mp3
        cmd = ['ffmpeg', '-y', '-i', input_wav, output_mp3]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return

    # Frequency ratio for semitone shift
    pitch_factor = 2 ** (semitones / 12.0)
    base_rate = 22050
    resampled_rate = int(base_rate * pitch_factor)

    # atempo correction: compensate speed introduced by pitch shift, then apply tempo
    correct_tempo = tempo / pitch_factor

    # Clamp atempo to valid range [0.5, 2.0] using chain
    atempo_filters = []
    remaining = correct_tempo
    while remaining > 2.0:
        atempo_filters.append('atempo=2.0')
        remaining /= 2.0
    while remaining < 0.5:
        atempo_filters.append('atempo=0.5')
        remaining *= 2.0
    atempo_filters.append(f'atempo={remaining:.4f}')

    filter_str = f'asetrate={resampled_rate},aresample={base_rate},' + ','.join(atempo_filters)

    cmd = ['ffmpeg', '-y', '-i', input_wav, '-af', filter_str, output_mp3]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        # On failure, convert without filter
        cmd = ['ffmpeg', '-y', '-i', input_wav, output_mp3]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def generate_segment_audio(text, mp3_path, expression, temp_dir):
    """Generate expressive audio for one segment."""
    wav_path = mp3_path.replace('.mp3', '.wav')

    # Step 1: TTS → WAV
    success = generate_with_piper(text, wav_path)
    if not success:
        print('[AudioGenerator] Piper unavailable — using gTTS fallback.')
        generate_with_gtts_fallback(text, wav_path)

    # Step 2: Apply FFmpeg expression modulation → MP3
    apply_expression_filter(wav_path, mp3_path, expression)

    if os.path.exists(wav_path):
        os.remove(wav_path)


def build_audio_track(manifest, temp_dir):
    """
    Generate TTS audio for all speech segments and composite into one AudioClip.
    """
    fps = manifest.get('fps', 24)
    total_duration = manifest.get('totalFrames', 0) / fps

    segments = extract_speech_segments(manifest)
    if not segments:
        print('[AudioGenerator] No speech segments found.')
        return None

    using_piper = Path(PIPER_MODEL_PATH).exists()
    print(f'[AudioGenerator] TTS engine: {"Piper (Neural)" if using_piper else "gTTS (fallback)"}')
    print(f'[AudioGenerator] Generating {len(segments)} segment(s)...')

    audio_clips = []

    for i, seg in enumerate(segments):
        mp3_path = os.path.join(temp_dir, f'seg_{i:04d}.mp3')
        seg_duration = seg['end_time'] - seg['start_time']
        expression = seg['expression']

        try:
            print(f'[AudioGenerator] [{expression}] "{seg["text"][:45]}..."')
            generate_segment_audio(seg['text'], mp3_path, expression, temp_dir)
        except Exception as e:
            print(f'[AudioGenerator] WARNING: segment {i} failed: {e}')
            continue

        try:
            clip = AudioFileClip(mp3_path)
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
    return CompositeAudioClip(audio_clips)


def main():
    import sys
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
