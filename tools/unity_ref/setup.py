"""Build a tiny Unity project that reproduces the original SD rigs (prefab + clips +
Puppet2D scripts, GUIDs preserved) so RefDump can export ground-truth bone poses.

Usage: python tools/unity_ref/setup.py [id ...]   then run Unity (see run_ref.sh)
"""
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import build_sd as B  # noqa: E402

PROJ = os.path.join(HERE, "proj")
PUPPET = r"E:/LAO/Google_QA_6.0/Assets/Libs/Puppet2D"
SRC_ROOT = B.ROOT
DEFAULT = ["brownie", "leprechaun", "valkyrie", "raven", "sylphid", "labiata", "hela",
           "e_Centurion_N", "e_NightChick_N"]
CLIPS = ["idle", "atk", "skill", "win", "move", "die"]
DEP_EXT = (".prefab", ".fbx", ".anim", ".controller", ".png", ".mat", ".shader", ".asset", ".tga", ".psd", ".jpg")


def copy_asset(src, copied):
    src = src.replace("\\", "/")
    rel = os.path.relpath(src, SRC_ROOT).replace("\\", "/")
    if src in copied:
        return "Assets/Ref/" + rel
    if not os.path.exists(src):
        return None
    dst = os.path.join(PROJ, "Assets", "Ref", rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    if os.path.exists(src + ".meta"):
        shutil.copyfile(src + ".meta", dst + ".meta")
    copied.add(src)
    # nested prefabs / models referenced by guid
    if src.lower().endswith((".prefab", ".controller", ".mat")):
        text = open(src, encoding="utf-8", errors="ignore").read()
        for g in set(re.findall(r"guid: ([0-9a-f]{32})", text)):
            p = B.guid_index().get(g)
            if p and p.lower().endswith(DEP_EXT):
                copy_asset(p, copied)
    return "Assets/Ref/" + rel


def main():
    ids = sys.argv[1:] or DEFAULT
    if ids == ["all"]:
        ids = list(B.UNITS) + ["e_" + k for k in B.ENEMIES]
    os.makedirs(os.path.join(PROJ, "Assets", "Editor"), exist_ok=True)
    if not os.path.exists(os.path.join(PROJ, "Assets", "Puppet2D")):
        shutil.copytree(PUPPET, os.path.join(PROJ, "Assets", "Puppet2D"))
        if os.path.exists(PUPPET + ".meta"):
            shutil.copyfile(PUPPET + ".meta", os.path.join(PROJ, "Assets", "Puppet2D.meta"))
    shutil.copyfile(os.path.join(HERE, "Dump.cs"), os.path.join(PROJ, "Assets", "Editor", "RefDump.cs"))
    shutil.copyfile(os.path.join(HERE, "Render.cs"), os.path.join(PROJ, "Assets", "Editor", "RefRender.cs"))
    # shaders (with includes) and sorting layers from the game project
    shader_src = SRC_ROOT + "/AssetBundleResource/Shader"
    shader_dst = os.path.join(PROJ, "Assets", "Ref", "AssetBundleResource", "Shader")
    if not os.path.exists(shader_dst):
        shutil.copytree(shader_src, shader_dst)
    os.makedirs(os.path.join(PROJ, "ProjectSettings"), exist_ok=True)
    shutil.copyfile(os.path.join(SRC_ROOT, "..", "ProjectSettings", "TagManager.asset"), os.path.join(PROJ, "ProjectSettings", "TagManager.asset"))
    copied, jobs = set(), []
    for uid in ids:
        if uid.startswith("e_"):
            prefab = B.MONSTER_DIR + "/" + B.ENEMIES[uid[2:]] + ".prefab"
            anims = B.pick_clips(B.controller_anims(prefab))
        else:
            char_dir, prefab = B.find_char(B.UNITS[uid])
            anims = B.find_anims(char_dir, B.UNITS[uid])
            if "move" not in anims or "idle" not in anims:
                anims = dict(B.pick_clips(B.controller_anims(prefab)), **anims)
        pref_rel = copy_asset(prefab, copied)
        for k in CLIPS:
            if k in anims:
                clip_rel = copy_asset(anims[k], copied)
                jobs.append("|".join([uid, pref_rel, k, clip_rel]))
    rjobs = []
    poses = {"idle": ["0"], "move": ["0.2", "0.45"], "atk": ["0.5", "1", "1.6", "2.4"], "skill": ["1", "2.2"]}
    for j in jobs:
        uid, pref, k, clip = j.split("|")
        for t in poses.get(k, []):
            rjobs.append("|".join([uid, pref, k, clip, t]))
    with open(os.path.join(PROJ, "render_jobs.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(rjobs) + "\n")
    with open(os.path.join(PROJ, "jobs.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(jobs) + "\n")
    print("assets:", len(copied), "jobs:", len(jobs))


if __name__ == "__main__":
    main()
