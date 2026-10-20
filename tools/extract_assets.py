"""5_LAO_Defence의 초상화·공격 시점 자료에서 이 게임이 쓰는 캐릭터만 골라 옮긴다."""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, '..', '5_LAO_Defence', 'js')
RIGS = ['labiata', 'leona', 'khan', 'daphne', 'brunhild', 'fafnir', 'brownie', 'gnome', 'sylphid', 'leprechaun', 'harpy',
        'e_NightChick_N', 'e_Legion_N', 'e_Predator_N', 'e_Drone_N', 'e_Phalangites_N', 'e_BigChick_N', 'e_BlackKnight_N',
        'e_Goltarion_N', 'e_Executioner_EW', 'e_IronPrince_N', 'e_EmperorChick_N']
ICONS = ['c_3P_Labiata_N', 'c_BR_Leona_N', 'c_BR_Khan_N', 'c_3P_Daphne_N', 'c_BR_Brunhild_N', 'c_BR_Fafnir_N',
         'c_BR_Brownie_N', 'c_BR_Gnome_N', 'c_BR_Sylphid_N', 'c_BR_Leprechaun_N', 'c_BR_Harpy_N',
         'e_NightChick_N', 'e_Legion_N', 'e_Predator_N', 'e_Drone_N', 'e_Phalangites_N', 'e_BigChick_N', 'e_BlackKnight_N',
         'e_Goltarion_N', 'e_Executioner_EW', 'e_IronPrince_N', 'e_EmperorChick_N', 'fx_glow', 'fx_spark', 'fx_ring', 'fx_smoke', 'fx_firehit', 'fx_bolt', 'fx_cross']

def obj_after(text, marker):
    i = text.index(marker)
    return json.JSONDecoder().raw_decode(text[text.index('{', i):])[0]

img = obj_after(open(os.path.join(SRC, 'assets.js'), encoding='utf8').read(), 'window.IMG')
ev = obj_after(open(os.path.join(SRC, 'anim_events.js'), encoding='utf8').read(), 'window.ANIM_EV')
out = {k: img[k] for k in ICONS if k in img}
print('icons missing:', [k for k in ICONS if k not in img])
with open(os.path.join(ROOT, 'js', 'assets.js'), 'w', encoding='utf8') as f:
    f.write('// tools/extract_assets.py 로 생성: 초상화·이펙트 그림 (data URL)\nwindow.IMG = ' + json.dumps(out) + ';\n')
evo = {k: ev[k] for k in RIGS if k in ev}
print('events missing:', [k for k in RIGS if k not in ev])
with open(os.path.join(ROOT, 'js', 'anim_events.js'), 'w', encoding='utf8') as f:
    f.write('// tools/extract_assets.py 로 생성: 공격 클립의 타격 시점(초)\nwindow.ANIM_EV = ' + json.dumps(evo) + ';\n')
