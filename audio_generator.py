#!/usr/bin/env python3
"""
Audio Generator - Produces TTS audio synchronized to the frame manifest.

Uses Google Cloud Text-to-Speech (Neural2 voices) for natural-sounding speech,
with SSML prosody tags for expression-based pitch and rate modulation.
Falls back to gTTS if Cloud TTS is unavailable.

Flow:
  1. Extract speech segments from the manifest.
  2. Generate TTS audio per segment with expression-specific SSML.
  3. Composite all clips at their correct timestamps → one AudioClip.
"""

import os
import json
import tempfile
import subprocess
from moviepy import AudioFileClip, CompositeAudioClip


# Expression-based SSML prosody modifiers
# pitch: semitones (+2st = higher, -2st = lower)
# rate: speaking rate percentage ("90%" = slower, "110%" = faster)
VOICE_MAP = {
    'HAPPY':     {'pitch': '+2st', 'rate': '110%'},
    'LAUGHING':  {'pitch': '+3st', 'rate': '120%'},
    'SAD':       {'pitch': '-2st', 'rate': '85%'},
    'ANGRY':     {'pitch': '-1st', 'rate': '115%'},
    'SURPRISED': {'pitch': '+4st', 'rate': '108%'},
    'WAVING':    {'pitch': '+1st', 'rate': '105%'},
    'THINK':     {'pitch': '-1st', 'rate': '90%'},
    'IDLE':      {'pitch': '+0st', 'rate': '100%'},
}

# Google Cloud TTS voice - en-US-Neural2-J is a natural, expressive male voice.
# Other options: en-US-Neural2-D (male), en-US-Neural2-F (female), en-US-Studio-O (male, highest quality)
CLOUD_TTS_VOICE = os.getenv('TTS_VOICE_NAME', 'en-US-Neural2-J')
CLOUD_TTS_LANGUAGE = 'en-US'


def extract_speech_segments(manifest):
    """
    Parse manifest frames into a flat list of speech segments.
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


def generate_with_cloud_tts(text, mp3_path, expression):
    """
    Generate audio using Google Cloud Text-to-Speech with SSML prosody.
    Returns True on success, False on failure.
    """
    try:
        from google.cloud import texttospeech
        import google.oauth2.service_account

        # Load credentials from environment variable (same as Drive/YouTube)
        credentials_json = os.getenv('GOOGLE_CREDENTIALS')
        if not credentials_json:
            return False

        credentials_info = json.loads(credentials_json)
        credentials = google.oauth2.service_account.Credentials.from_service_account_info(
            credentials_info,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )

        client = texttospeech.TextToSpeechClient(credentials=credentials)

        # Build SSML with expression-specific prosody
        modifiers = VOICE_MAP.get(expression, VOICE_MAP['IDLE'])
        ssml = (
            f'<speak>'
            f'<prosody pitch="{modifiers["pitch"]}" rate="{modifiers["rate"]}">'
            f'{text}'
            f'</prosody>'
            f'</speak>'
        )

        synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
        voice = texttospeech.VoiceSelectionParams(
            language_code=CLOUD_TTS_LANGUAGE,
            name=CLOUD_TTS_VOICE,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        with open(mp3_path, 'wb') as f:
            f.write(response.audio_content)

        return True

    except Exception as e:
        print(f'[AudioGenerator] Cloud TTS unavailable ({e}), falling back to gTTS.')
        return False


def generate_with_gtts_fallback(text, mp3_path, expression):
    """
    Fallback: gTTS + FFmpeg expression modulation.
    """
    from gtts import gTTS

    raw_mp3 = mp3_path.replace('.mp3', '_raw.mp3')

    # Generate neutral TTS
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(raw_mp3)

    # Apply FFmpeg pitch/tempo modulation based on expression
    modifiers = VOICE_MAP.get(expression, VOICE_MAP['IDLE'])

    # Parse rate percentage to a float ratio
    rate_str = modifiers['rate'].replace('%', '')
    tempo = float(rate_str) / 100.0

    # Parse pitch semitones to a frequency ratio
    pitch_str = modifiers['pitch'].replace('st', '').replace('+', '')
    semitones = float(pitch_str)
    pitch_factor = 2 ** (semitones / 12.0)

    # Build FFmpeg filter chain
    resampled_rate = int(24000 * pitch_factor)
    correct_tempo = tempo / pitch_factor

    # Clamp atempo to valid range [0.5, 2.0]
    atempo_filters = []
    remaining = correct_tempo
    while remaining > 2.0:
        atempo_filters.append('atempo=2.0')
        remaining /= 2.0
    while remaining < 0.5:
        atempo_filters.append('atempo=0.5')
        remaining *= 2.0
    atempo_filters.append(f'atempo={remaining:.4f}')

    filter_str = f'asetrate={resampled_rate},aresample=24000,' + ','.join(atempo_filters)

    cmd = ['ffmpeg', '-y', '-i', raw_mp3, '-af', filter_str, mp3_path]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        import shutil
        shutil.copy(raw_mp3, mp3_path)

    if os.path.exists(raw_mp3):
        os.remove(raw_mp3)


def generate_segment_audio(text, mp3_path, expression):
    """
    Generate audio: try Google Cloud TTS first, fall back to gTTS.
    """
    success = generate_with_cloud_tts(text, mp3_path, expression)
    if not success:
        generate_with_gtts_fallback(text, mp3_path, expression)


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

    print(f'[AudioGenerator] Generating TTS for {len(segments)} segment(s) [{CLOUD_TTS_VOICE}]...')

    audio_clips = []

    for i, seg in enumerate(segments):
        mp3_path = os.path.join(temp_dir, f'seg_{i:04d}.mp3')
        seg_duration = seg['end_time'] - seg['start_time']
        expression = seg['expression']

        try:
            print(f'[AudioGenerator] {expression}: "{seg["text"][:40]}..."')
            generate_segment_audio(seg['text'], mp3_path, expression)
        except Exception as e:
            print(f'[AudioGenerator] WARNING: TTS failed for segment {i}: {e}')
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
