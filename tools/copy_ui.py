"""잘라 둔 원작 UI 조각(tools/ui_src, extract_ui.py) 중 게임이 쓰는 것만 assets/ui 로 옮긴다.  python tools/copy_ui.py"""
import os, shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'tools', 'ui_src')
DST = os.path.join(ROOT, 'assets', 'ui')
USE = {
    'DialogAtlas_v2': ['UI_Dialog_Main_CharDialog_HUD_BTN_2', 'UI_Dialog_Main_CharDialog_Frame_CharName_3', 'image_out_G', 'UI_Dialog_Main_CharDialog_acc_2'],
    'masterAtlas': ['UI_WolrdMap_Chapter_Icon_%s_%s' % (k, c) for k in ('Base', 'Main', 'Selected', 'Selected_OL', 'Lock', 'Tail') for c in ('Yel', 'Red', 'Grn')]
                   + ['UI_WolrdMap_Chapter_Icon_Main_WH', 'UI_WolrdMap_Chapter_Icon_Base_WH', 'UI_WolrdMap_Chapter_Icon_Story_WH', 'UI_WolrdMap_Chapter_Icon_tag',
                      'UI_WolrdMap_StageInfo', 'UI_WolrdMap_StageInfo_Deco', 'UI_WolrdMap_StageInfo_Triangle', 'UI_WolrdMap_Titlebg', 'UI_Worldmap_Main_Map_stage_line',
                      'UI_WolrdMap_Squad_btn_BattleStart', 'UI_WolrdMap_Squad_bg', 'UI_WolrdMap_SquadIconBG', 'UI_WolrdMap_Squad_Slot1_bg', 'UI_WolrdMap_Squad_Slot2_bg',
                      'UI_WolrdMap_Squad_Slot2_bg_select', 'UI_WolrdMap_detailinfo_upbg_LB', 'UI_WolrdMap_tab_active', 'UI_WolrdMap_tab_deactive', 'UI_WolrdMap_Squad_deco3_title',
                      'UI_WolrdMap_EnemyIcon_BG', 'UI_WolrdMap_Star_In'],
    'masterAtlas_V2': ['back_Btn', 'UI_Title_Bar_01', 'Bg_Popup_TitleBg', 'UI_Common_Button_00', 'UI_Common_Button_01', 'UI_Common_Button_02', 'UI_btn_02', 'UI_btn_02_White',
                       'frame_Cha_formation_icon_W', 'frame_Cha_formation_icon_mask', 'frame_Cha_formation_Leader', 'Icon_leader', 'UI_Squad_Type_1', 'UI_Squad_Type_2', 'UI_Squad_Type_3',
                       'UI_Common_Frame_03', 'UI_Popup_BG_01', 'Bg_Dot', 'deco_title', 'UI_Common_Deco_01', 'icon_battle', 'UI_Icon_Squad'],
    'BattleAtlas': ['UI_Battle_text_battlestart', 'UI_Battle_text_missionstart', 'UI_Battle_Main_missionclear_background_1', 'UI_Battle_Main_missionclear_background_2',
                    'UI_Battle_Main_missionclear_box', 'UI_Battle_Main_missionclear_label_2', 'UI_Battle_Main_missionclear_acc', 'UI_Battle_bar_fill', 'UI_Battle_bar_frame'],
}


def main():
    os.makedirs(DST, exist_ok=True)
    n = 0
    for atlas, names in USE.items():
        for nm in names:
            src = os.path.join(SRC, atlas, nm + '.png')
            if not os.path.exists(src):
                print('없음:', atlas, nm); continue
            shutil.copyfile(src, os.path.join(DST, nm + '.png')); n += 1
    print('UI 조각', n)


if __name__ == '__main__':
    main()
