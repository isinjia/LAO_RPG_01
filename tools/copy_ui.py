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
                    'UI_Battle_Main_missionclear_box', 'UI_Battle_Main_missionclear_label_2', 'UI_Battle_Main_missionclear_acc', 'UI_Battle_bar_fill', 'UI_Battle_bar_frame',
                    # 지도 전투 화면 (원작 전투 UI 조각)
                    'UI_Battle_Miss', 'UI_Image_Counter', 'UI_Image_Wait', 'UI_Image_Shield', 'UI_Image_Broke', 'UI_Battle_Caution_text_1', 'UI_Battle_Warning_grid',
                    'UI_Battle_main_Field_cursor_g', 'UI_Battle_main_Field_cursor_r', 'UI_Battle_main_Field_cursor_w', 'UI_Battle_main_Field_cursor_big',
                    'UI_Battle_Main_Field_Frame_selectText_g', 'UI_Battle_Main_Field_Frame_selectText_r', 'UI_Battle_Main_Field_Frame_selectText_w',
                    'UI_Battle_round_circle_2', 'UI_Battle_round_out', 'UI_Battle_round_line_1', 'UI_Battle_round_addin_2', 'UI_Battle_round_arrow_1',
                    'UI_Battle_set_Btn_auto_outline_on', 'UI_Battle_set_Btn_auto_outline_off', 'UI_Battle_set_Btn_auto_arrow_on', 'UI_Battle_set_Btn_auto_arrow_off',
                    'UI_Battle_set_Btn_speed', 'UI_Battle_set_Btn_option', 'UI_Battle_set_Btn_back', 'UI_Battle_set_Btn_mission', 'UI_Battle_TbarIcon_Select_on',
                    'UI_Battle_skillBtn_Select2', 'UI_Battle_Passive_panel_1', 'UI_Battle_Passive_panel_2', 'Icon_mission', 'SkillIconCircle_Move', 'SkillIconCircle_Wait',
                    'SkillIconCircle_None', 'UI_Icon_Counter', 'UI_Icon_Shield', 'UI_Icon_Wait', 'UI_Icon_DoubleAttack', 'UI_Battle_Icon_cross', 'UI_Battle_Main_Field_Icon_defence',
                    'UI_Battle_Main_Acc_yellowline', 'UI_Battle_glow', 'UI_Battle_Ring', 'UI_Battle_Main_Skill_Btn_SkillParts02', 'UI_Battle_Main_Skill_Btn_SkillParts03',
                    'UI_Battle_Atktype_normal', 'UI_Battle_Atktype_fire', 'UI_Battle_Atktype_electric', 'UI_Battle_Atktype_ice', 'UI_Battle_Enemyinfo_Frame_1',
                    'UI_Battle_progress_Icon_boss', 'UI_battle_enemy_info_AimIcon', 'UI_Battle_Main_Grid_ATK_Confirm_Btn', 'UI_Battle_SelectIcon_move', 'UI_Battle_SelectIcon_recovery',
                    'UI_Battle_SelectIcon_info', 'UI_Battle_Main_Field_Frame_selectIcon_outline_r', 'UI_Battle_Main_Field_Frame_selectIcon_outline_g', 'UI_Icon_Ressurrect', 'UI_Battle_Main_Control_Btn_Withrow'],
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
