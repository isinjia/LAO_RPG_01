// 대화용 전신 일러스트: 2DModel 프리팹을 기본 자세로 두고 'face' 자리에 표정 스프라이트를 끼워
// 투명 배경 PNG로 찍는다. Run: Unity -batchmode -executeMethod RefPortrait.Run  (portrait_jobs.txt: out|prefab|facePng)
using System.IO;
using UnityEditor;
using UnityEngine;

public static class RefPortrait
{
    const int H = 1400;

    public static void Run()
    {
        Directory.CreateDirectory("portrait");
        foreach (var line in File.ReadAllLines("portrait_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|');
            try { One(p[0], p[1], p.Length > 2 ? p[2] : ""); }
            catch (System.Exception e) { Debug.LogError("PORTRAIT FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    static void One(string outName, string prefabPath, string facePath)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var go = (GameObject)Object.Instantiate(prefab);
        go.transform.position = new Vector3(0, 0, 0);
        // 로비용 애니메이터가 붙어 있으면 첫 프레임 자세로
        var animator = go.GetComponentInChildren<Animator>(true);
        if (animator && animator.runtimeAnimatorController)
        {
            var clips = animator.runtimeAnimatorController.animationClips;
            foreach (var c in clips) if (c.name.EndsWith("_lobby")) { c.SampleAnimation(animator.gameObject, 0f); break; }
        }
        // 표정
        if (!string.IsNullOrEmpty(facePath))
        {
            var sp = AssetDatabase.LoadAssetAtPath<Sprite>(facePath);
            foreach (var sr in go.GetComponentsInChildren<SpriteRenderer>(true))
                if (sr.gameObject.name == "face") { sr.sprite = sp; sr.enabled = true; sr.gameObject.SetActive(true); }
        }
        // 화면 효과용(왜곡 등)은 빼고, 보이는 렌더러만으로 영역 계산
        Bounds b = new Bounds(); bool has = false;
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
        {
            if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
            if (r.sharedMaterial && r.sharedMaterial.shader && r.sharedMaterial.shader.name.Contains("Distortion")) { r.enabled = false; continue; }
            if (r is ParticleSystemRenderer) { r.enabled = false; continue; }
            if (!has) { b = r.bounds; has = true; } else b.Encapsulate(r.bounds);
        }
        if (!has) { Object.DestroyImmediate(go); return; }
        int w = Mathf.Clamp(Mathf.RoundToInt(H * b.size.x / Mathf.Max(0.01f, b.size.y)), 64, 4096);
        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = b.size.y / 2f * 1.01f;
        cam.aspect = (float)w / H;
        cam.transform.position = new Vector3(b.center.x, b.center.y, b.center.z - 50f);
        cam.nearClipPlane = 0.01f; cam.farClipPlane = 200f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0, 0, 0, 0);
        var rt = new RenderTexture(w, H, 24, RenderTextureFormat.ARGB32);
        rt.antiAliasing = 4;
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(w, H, TextureFormat.RGBA32, false);
        tex.ReadPixels(new Rect(0, 0, w, H), 0, 0);
        tex.Apply();
        File.WriteAllBytes(Path.Combine("portrait", outName + ".png"), tex.EncodeToPNG());
        RenderTexture.active = null;
        cam.targetTexture = null;
        Object.DestroyImmediate(rt); Object.DestroyImmediate(camGo); Object.DestroyImmediate(go); Object.DestroyImmediate(tex);
        Debug.Log("PORTRAIT OK " + outName + " " + w + "x" + H);
    }
}
