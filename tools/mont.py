# 画像を横に並べる。python3 tools/mont.py 出力.png 幅 高さ 画像...
import sys, subprocess
out, w, h, imgs = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
args = []
for f in imgs: args += ['-i', f]
fl = ''.join(f'[{i}]scale={w}:{h}[v{i}];' for i in range(len(imgs))) + ''.join(f'[v{i}]' for i in range(len(imgs))) + f'hstack={len(imgs)}'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-filter_complex', fl, out], check=True)
