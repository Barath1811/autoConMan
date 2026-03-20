import subprocess
import sys
import os

os.chdir(r'c:\Users\Asus\OneDrive\Documents\projects\autoConMan')

print("===== RUNNING FULL PIPELINE =====\n")

# Run full index.js  
result = subprocess.run(
    ['node', 'index.js', 'test_script.txt', 'output/video.mp4'],
    capture_output=True,
    text=True,
    timeout=600  # 10 minutes
)

print("Exit Code:", result.returncode)
print("\nSTDOUT:")
print(result.stdout if result.stdout else "(empty)")
print("\nSTDERR:")
print(result.stderr if result.stderr else "(empty)")

print("\n===== OUTPUT FILES =====")
import glob
for f in sorted(glob.glob('output/*')):
    try:
        size = os.path.getsize(f)
        if os.path.isdir(f):
            print(f"  {f}/ (directory)")
        else:
            print(f"  {f} ({size} bytes)")
    except:
        pass

print("\n===== FRAMES DIRECTORY =====")
if os.path.exists('output/frames'):
    count = len(glob.glob('output/frames/*.png'))
    print(f"  {count} PNG frames generated")
else:
    print("  (not created)")

print("\n===== VIDEO FILE =====")
if os.path.exists('output/video.mp4'):
    size_mb = os.path.getsize('output/video.mp4') / (1024*1024)
    print(f"  output/video.mp4 created ({size_mb:.1f} MB)")
else:
    print("  output/video.mp4 not found")
