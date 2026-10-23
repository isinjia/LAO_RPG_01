"""tools/lab/out/*.json (브라우저 시험 화면) -> 같은 이름 .jpg"""
import base64, json, os, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
for n in sys.argv[1:]:
    d = json.load(open(os.path.join(D, n + '.json')))['d']
    open(os.path.join(D, n + '.jpg'), 'wb').write(base64.b64decode(d.split(',', 1)[1]))
    print(os.path.join(D, n + '.jpg'))
