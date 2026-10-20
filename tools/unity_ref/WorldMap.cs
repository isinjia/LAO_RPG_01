// 원작 3D 지역 지도(3D_worldmap_*)를 그 안의 카메라로 찍고, 작전 지점(point_N)의 화면 위치를 적는다.
// Run: Unity -batchmode -executeMethod RefWorldMap.Run  (worldmap_jobs.txt: out|prefab)  결과: worldmap/<out>.png, .json
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class RefWorldMap
{
    const int W = 2400, H = 1350;

    public static void Run()
    {
        Directory.CreateDirectory("worldmap");
        foreach (var line in File.ReadAllLines("worldmap_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|');
            try { One(p[0], p[1]); }
            catch (System.Exception e) { Debug.LogError("WORLDMAP FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    static void One(string outName, string prefabPath)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var go = (GameObject)Object.Instantiate(prefab);
        // 애니메이터는 첫 프레임 자세로 (카메라 위치·지형 회전)
        foreach (var an in go.GetComponentsInChildren<Animator>(true))
        {
            if (!an.runtimeAnimatorController) continue;
            var clip = an.runtimeAnimatorController.animationClips.FirstOrDefault();
            if (clip) clip.SampleAnimation(an.gameObject, clip.length * 0.5f);
        }
        var cam = go.GetComponentsInChildren<Camera>(true).FirstOrDefault();
        if (!cam) { Debug.LogError("WORLDMAP no camera"); return; }
        cam.gameObject.SetActive(true); cam.enabled = true;
        cam.aspect = (float)W / H;
        // 작전 지점들이 화면 가운데에 넉넉히 오도록 원작 카메라 각도 그대로 위치만 옮긴다
        var ptsT = go.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith("point_")).ToList();
        if (ptsT.Count > 0)
        {
            var c = Vector3.zero; foreach (var t in ptsT) c += t.position; c /= ptsT.Count;
            float minx = 1, maxx = 0, miny = 1, maxy = 0;
            foreach (var t in ptsT) { var v = cam.WorldToViewportPoint(t.position); minx = Mathf.Min(minx, v.x); maxx = Mathf.Max(maxx, v.x); miny = Mathf.Min(miny, v.y); maxy = Mathf.Max(maxy, v.y); }
            float spread = Mathf.Max(maxx - minx, (maxy - miny) * cam.aspect, 0.05f);
            float d0 = Vector3.Dot(c - cam.transform.position, cam.transform.forward);
            float d = d0 * spread / 0.42f;
            cam.transform.position = c - cam.transform.forward * d + cam.transform.up * d * 0.06f;
        }
        var rt = new RenderTexture(W, H, 24, RenderTextureFormat.ARGB32) { antiAliasing = 8 };
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
        tex.ReadPixels(new Rect(0, 0, W, H), 0, 0); tex.Apply();
        File.WriteAllBytes(Path.Combine("worldmap", outName + ".png"), tex.EncodeToPNG());
        var pts = go.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith("point_"))
            .OrderBy(t => int.Parse(t.name.Substring(6)))
            .Select(t => { var v = cam.WorldToViewportPoint(t.position); return string.Format("\"{0}\":[{1:F4},{2:F4}]", t.name.Substring(6), v.x, 1 - v.y); });
        File.WriteAllText(Path.Combine("worldmap", outName + ".json"), "{" + string.Join(",", pts) + "}");
        RenderTexture.active = null; cam.targetTexture = null;
        Object.DestroyImmediate(rt); Object.DestroyImmediate(go); Object.DestroyImmediate(tex);
        Debug.Log("WORLDMAP OK " + outName);
    }
}
