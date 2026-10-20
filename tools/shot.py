"""tools/lab/out/<name>.json (게임의 GAME.shot) 을 그림 파일로 풀어 놓는다: python tools/shot.py <name> <out.jpg>"""
import base64, json, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
name = sys.argv[1] if len(sys.argv) > 1 else 'shot'
d = json.load(open(os.path.join(ROOT, 'tools', 'lab', 'out', name + '.json')))['d']
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'lab', 'out', name + '.jpg')
open(out, 'wb').write(base64.b64decode(d.split(',', 1)[1]))
print(out)
