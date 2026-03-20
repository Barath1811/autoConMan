#!/usr/bin/env python3
"""
Video Encoder - Converts PNG frame sequences to MP4 with synchronized TTS audio.
"""

import os
import sys
import json
import tempfile
from pathlib import Path
from moviepy import ImageSequenceClip
import audio_generator


def encode_video(manifest_path, output_path, fps=24, frames_dir=None):
    """
    Encode PNG frame sequence to MP4 video with TTS audio.

    Args:
        manifest_path (str): Path to manifest.json file
        output_path (str): Output MP4 file path
        fps (int): Frames per second (default 24)
        frames_dir (str): Explicit path to the frames directory. If not provided,
                          it is derived from manifest_path as a fallback.

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Load manifest to get frame information
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)

        total_frames = manifest.get('totalFrames', 0)
        print(f"[VideoEncoder] Loading {total_frames} frames...")

        # Use the explicitly provided frames_dir; fall back to deriving it only
        # as a last resort to avoid picking up a stale directory.
        if frames_dir is None:
            frames_dir = os.path.join(os.path.dirname(os.path.abspath(manifest_path)), 'frames')
            print(f"[VideoEncoder] WARNING: frames_dir not provided. Derived from manifest path: {frames_dir}")

        # Build sorted list of PNG files
        frame_files = [
            os.path.join(frames_dir, f'frame_{i:06d}.png')
            for i in range(total_frames)
        ]

        # Verify all frames exist
        missing = [f for f in frame_files if not os.path.exists(f)]
        if missing:
            print(f"[VideoEncoder] ERROR: Missing {len(missing)} frames")
            return False

        print(f"[VideoEncoder] Creating video: {fps} fps...")

        # Create video clip from image sequence
        clip = ImageSequenceClip(frame_files, fps=fps)

        # --- Audio: generate TTS in the same temp dir as the frames ---
        # Use the frames_dir's parent as the audio temp dir so all temp
        # files stay in the same OS temp work dir (outside OneDrive).
        audio_temp_dir = os.path.dirname(frames_dir)
        print("[VideoEncoder] Generating TTS audio...")
        audio_clip = audio_generator.build_audio_track(manifest, audio_temp_dir)

        if audio_clip is not None:
            clip = clip.with_audio(audio_clip)
            print(f"[VideoEncoder] Audio track attached. Duration: {audio_clip.duration:.2f}s")
        else:
            print("[VideoEncoder] WARNING: No audio generated; producing silent video.")

        # Write MP4 — aac audio codec for broad compatibility
        clip.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            logger=None
        )

        print(f"[VideoEncoder] Complete: {output_path}")
        return True

    except Exception as e:
        print(f"[VideoEncoder] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python video_encoder.py <manifest.json> <output.mp4> [fps] [frames_dir]")
        sys.exit(1)

    manifest_path = sys.argv[1]
    output_path = sys.argv[2]
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    # Accept explicit frames_dir to avoid deriving it from manifest_path,
    # which could silently resolve to a stale directory.
    frames_dir = sys.argv[4] if len(sys.argv) > 4 else None

    success = encode_video(manifest_path, output_path, fps, frames_dir)
    sys.exit(0 if success else 1)
