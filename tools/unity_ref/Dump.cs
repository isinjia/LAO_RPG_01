// Ground-truth dumper: samples original clips on the original prefabs, runs Puppet2D
// (exactly like Puppet2D_GlobalControl.LateUpdate does in the game) and records every
// transform's world pose per frame.  Run: Unity -batchmode -executeMethod RefDump.Run
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class RefDump
{
    const float FPS = 24f;

    public static void Run()
    {
        var jobs = File.ReadAllLines("jobs.txt");
        Directory.CreateDirectory("out");
        foreach (var line in jobs)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|'); // id|prefab|clipKey|clipPath
            try { DumpOne(p[0], p[1], p[2], p[3]); }
            catch (System.Exception e) { Debug.LogError("DUMP FAIL " + line + " " + e); }
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

    static void DumpOne(string id, string prefabPath, string clipKey, string clipPath)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
        if (prefab == null || clip == null) { Debug.LogError("missing " + prefabPath + " / " + clipPath); return; }
        var go = (GameObject)Object.Instantiate(prefab);
        var animator = go.GetComponentInChildren<Animator>(true);
        var animRoot = animator ? animator.gameObject : go;
        var gcs = go.GetComponentsInChildren<Puppet2D.Puppet2D_GlobalControl>(true);
        foreach (var gc in gcs) gc.Refresh();

        var all = animRoot.GetComponentsInChildren<Transform>(true);
        var sb = new StringBuilder();
        var ci = CultureInfo.InvariantCulture;
        sb.Append("{\"paths\":[");
        for (int i = 0; i < all.Length; i++) { if (i > 0) sb.Append(','); sb.Append('"').Append(PathOf(all[i], animRoot.transform).Replace("\"", "\\\"")).Append('"'); }
        sb.Append("],\"len\":").Append(clip.length.ToString(ci)).Append(",\"frames\":[");
        int n = Mathf.RoundToInt(clip.length * FPS) + 1;
        for (int f = 0; f < n; f++)
        {
            float t = Mathf.Min(clip.length, f / FPS);
            clip.SampleAnimation(animRoot, t);
            foreach (var gc in gcs) if (gc.isActiveAndEnabled || true) gc.Run();
            if (f > 0) sb.Append(',');
            sb.Append('[');
            for (int i = 0; i < all.Length; i++)
            {
                var tr = all[i];
                var pos = tr.position; var q = tr.rotation; var ls = tr.lossyScale;
                if (i > 0) sb.Append(',');
                sb.Append('[')
                  .Append(pos.x.ToString("0.#####", ci)).Append(',').Append(pos.y.ToString("0.#####", ci)).Append(',').Append(pos.z.ToString("0.#####", ci)).Append(',')
                  .Append(q.x.ToString("0.#####", ci)).Append(',').Append(q.y.ToString("0.#####", ci)).Append(',').Append(q.z.ToString("0.#####", ci)).Append(',').Append(q.w.ToString("0.#####", ci)).Append(',')
                  .Append(ls.x.ToString("0.####", ci)).Append(',').Append(ls.y.ToString("0.####", ci)).Append(',')
                  .Append(tr.gameObject.activeInHierarchy ? 1 : 0).Append(']');
            }
            sb.Append(']');
        }
        sb.Append("]}");
        File.WriteAllText("out/" + id + "_" + clipKey + ".json", sb.ToString());
        Object.DestroyImmediate(go);
        Debug.Log("DUMPED " + id + " " + clipKey + " frames=" + n);
    }
}
