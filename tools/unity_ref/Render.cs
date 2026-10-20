// Ground-truth renderer: poses each rig exactly like RefDump (clip sample + Puppet2D), renders it
// with an orthographic camera to a transparent PNG and dumps the camera rect plus every skinned
// renderer's baked world vertices.  Run: Unity -batchmode -executeMethod RefRender.Run
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class RefRender
{
    const int SIZE = 512;

    public static void Run()
    {
        var jobs = File.ReadAllLines("render_jobs.txt");
        Directory.CreateDirectory("render");
        foreach (var line in jobs)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|'); // id|prefab|clipKey|clipPath|time
            try { RenderOne(p[0], p[1], p[2], p[3], float.Parse(p[4], CultureInfo.InvariantCulture)); }
            catch (System.Exception e) { Debug.LogError("RENDER FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    static string PathOf(Transform t, Transform root)
    {
        if (t == root) return "";
        var s = t.name;
        while (t.parent != null && t.parent != root) { t = t.parent; s = t.name + "/" + s; }
        return t.parent == root ? s : "~" + s;
    }

    static void RenderOne(string id, string prefabPath, string clipKey, string clipPath, float time)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
        var go = (GameObject)Object.Instantiate(prefab);
        go.transform.position = Vector3.zero;
        var animator = go.GetComponentInChildren<Animator>(true);
        var animRoot = animator ? animator.gameObject : go;
        var gcs = go.GetComponentsInChildren<Puppet2D.Puppet2D_GlobalControl>(true);
        foreach (var gc in gcs) gc.Refresh();
        // sample sequentially up to the frame, like the game does
        int n = Mathf.RoundToInt(time * 24f);
        for (int f = 0; f <= n; f++)
        {
            clip.SampleAnimation(animRoot, Mathf.Min(clip.length, f / 24f));
            foreach (var gc in gcs) gc.Run();
        }
        // Puppet2D control/bone gizmo sprites are editor-only (hidden in game)
        foreach (var sr in go.GetComponentsInChildren<SpriteRenderer>(true))
            if (sr.sortingLayerName == "bone_and_ik" || (sr.sprite && (sr.sprite.name.Contains("Control") || sr.sprite.name.Contains("ffd"))) || sr.GetComponent<Puppet2D.Puppet2D_Bone>())
                sr.enabled = false;
        // screen-space effects (distortion) are not part of the character's look
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            if (r.sharedMaterial && r.sharedMaterial.shader && r.sharedMaterial.shader.name.Contains("Distortion")) r.enabled = false;
        // bounds of visible sprite renderers (same rule as the web runtime's measure)
        var b = new Bounds(); bool has = false;
        foreach (var r in go.GetComponentsInChildren<Renderer>(false))
        {
            if (!r.enabled || r is ParticleSystemRenderer || r.sortingLayerName == "bone_and_ik") continue;
            if (r.bounds.extents.x > 30 || r.bounds.extents.y > 30) continue; // full-screen backdrops
            if (has) b.Encapsulate(r.bounds); else { b = r.bounds; has = true; }
        }
        float half = Mathf.Max(b.extents.x, b.extents.y) * 1.1f;
        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = half;
        cam.transform.position = new Vector3(b.center.x, b.center.y, -50);
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0, 0, 0, 0);
        cam.nearClipPlane = 0.01f; cam.farClipPlane = 200;
        var rt = new RenderTexture(SIZE, SIZE, 24, RenderTextureFormat.ARGB32);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false);
        tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0);
        tex.Apply();
        File.WriteAllBytes("render/" + id + "_" + clipKey + "_" + time.ToString("0.##", CultureInfo.InvariantCulture) + ".png", tex.EncodeToPNG());
        RenderTexture.active = null;

        var ci = CultureInfo.InvariantCulture;
        var sb = new StringBuilder();
        sb.Append("{\"cx\":").Append(b.center.x.ToString(ci)).Append(",\"cy\":").Append(b.center.y.ToString(ci))
          .Append(",\"half\":").Append(half.ToString(ci)).Append(",\"skins\":[");
        bool first = true;
        foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
        {
            if (!smr.sharedMesh) continue;
            var m = new Mesh();
            smr.BakeMesh(m, true);
            var v = m.vertices;
            var tr = smr.transform;
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"path\":\"").Append(PathOf(tr, animRoot.transform)).Append("\",\"on\":")
              .Append(smr.enabled && smr.gameObject.activeInHierarchy ? 1 : 0).Append(",\"v\":[");
            for (int i = 0; i < v.Length; i++)
            {
                var w = tr.position + tr.rotation * v[i]; // BakeMesh(useScale) already applied scale
                if (i > 0) sb.Append(',');
                sb.Append(w.x.ToString("0.####", ci)).Append(',').Append(w.y.ToString("0.####", ci));
            }
            sb.Append("]}");
        }
        sb.Append("]}");
        File.WriteAllText("render/" + id + "_" + clipKey + "_" + time.ToString("0.##", CultureInfo.InvariantCulture) + ".json", sb.ToString());
        Object.DestroyImmediate(camGo);
        Object.DestroyImmediate(go);
        Debug.Log("RENDERED " + id + " " + clipKey);
    }
}
