import subprocess
import sys
import os

os.chdir(r'c:\Users\Asus\OneDrive\Documents\projects\autoConMan')

# Run Node with output capture
result = subprocess.run(
    ['node', 'app_final.js', 'test_script.txt', 'output/'],
    capture_output=True,
    text=True,
    timeout=60
)

output = f"""===== EXECUTION REPORT =====
Exit Code: {result.returncode}

===== STDOUT =====
{result.stdout if result.stdout else '(empty)'}

===== STDERR =====
{result.stderr if result.stderr else '(empty)'}

===== FILES IN OUTPUT ====="""

import glob
for f in sorted(glob.glob('output/*')):
    output += '\n  ' + f

# Also read manifest if exists
if os.path.exists('output/manifest.json'):
    with open('output/manifest.json', 'r') as f:
        output += '\n\n===== MANIFEST CONTENT =====\n'
        output += f.read()

# Write report
with open('execution_report.txt', 'w') as f:
    f.write(output)

print(output)
