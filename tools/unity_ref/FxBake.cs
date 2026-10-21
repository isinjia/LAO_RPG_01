// 원작 전투 효과 프리팹(입자)을 낱장 그림 묶음(플립북)으로 굽는다.
// 각 장면을 검은 바탕·흰 바탕에 한 번씩 그려 투명도와 미리 곱한 색을 되살린다 (더하기·알파 섞기 입자 모두 맞게).
// Run: Unity -batchmode -executeMethod RefFxBake.Run  (fx_jobs.txt: 이름|프리팹|긴 변 픽셀|초당 장수|최대 초|옵션)
// 옵션: loop=시작초 (계속 도는 효과를 그 초부터 잘라 굽는다), fit=0 (자동 맞춤 끄기), box=반폭  결과: fxbake/<이름>.png, .json
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

public static class RefFxBake
{
    static readonly CultureInfo ci = CultureInfo.InvariantCulture;
    const int Seed = 12345;

    public static void Run()
    {
        Directory.CreateDirectory("fxbake");
        foreach (var line in File.ReadAllLines("fx_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
            var p = line.Split('|');
            try { One(p); }
            catch (System.Exception e) { Debug.LogError("FXBAKE FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    static string F(float v) { return float.IsNaN(v) || float.IsInfinity(v) ? "0" : v.ToString("0.####", ci); }

    // 굽는 동안 쓰는 상태
    class Fx
    {
        public GameObject go;
        public List<ParticleSystem> roots = new List<ParticleSystem>();
        public List<KeyValuePair<GameObject, AnimationClip>> clips = new List<KeyValuePair<GameObject, AnimationClip>>();
        public float length;
    }

    static Fx Make(string prefabPath)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        if (!prefab) throw new System.Exception("프리팹 없음 " + prefabPath);
        var fx = new Fx();
        fx.go = (GameObject)Object.Instantiate(prefab);
        fx.go.SetActive(true);
        fx.go.transform.position = Vector3.zero; fx.go.transform.rotation = Quaternion.identity; fx.go.transform.localScale = Vector3.one;
        // 빠진 스크립트는 떼어 낸다
        foreach (var t in fx.go.GetComponentsInChildren<Transform>(true))
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(t.gameObject);
        // 남은 스크립트는 끈다 (편집기에서는 어차피 돌지 않지만 혹시 모를 실행을 막는다)
        foreach (var mb in fx.go.GetComponentsInChildren<MonoBehaviour>(true)) mb.enabled = false;
        // 셰이더가 깨진(분홍) 재질은 기본 더하기 입자 셰이더로 바꾼다
        var fallback = Shader.Find("Legacy Shaders/Particles/Additive") ?? Shader.Find("Mobile/Particles/Additive");
        foreach (var r in fx.go.GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials;
            bool changed = false;
            for (int i = 0; i < mats.Length; i++)
            {
                var m = mats[i];
                if (!m) continue;
                if (!m.shader || !m.shader.isSupported || m.shader.name == "Hidden/InternalErrorShader")
                {
                    Debug.LogWarning("FXBAKE 셰이더 깨짐 " + prefabPath + " " + r.name + " " + m.name + " " + (m.shader ? m.shader.name : "null"));
                    var tex = m.HasProperty("_MainTex") ? m.GetTexture("_MainTex") : null;
                    var nm = new Material(fallback);
                    if (tex) nm.SetTexture("_MainTex", tex);
                    mats[i] = nm; changed = true;
                }
            }
            if (changed) r.sharedMaterials = mats;
        }
        var all = fx.go.GetComponentsInChildren<ParticleSystem>(true);
        foreach (var ps in all)
        {
            ps.Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            ps.useAutoRandomSeed = false;
            ps.randomSeed = (uint)(Seed + ps.name.GetHashCode() % 1000);
            var m = ps.main;
            float life = m.loop ? m.duration : m.duration + MaxOf(m.startDelay) + MaxOf(m.startLifetime);
            fx.length = Mathf.Max(fx.length, life);
        }
        // 가장 위쪽 입자만 직접 돌린다 (자식·하위 방출은 함께 돈다)
        foreach (var ps in all)
        {
            var t = ps.transform.parent; bool top = true;
            while (t != null) { if (t.GetComponent<ParticleSystem>()) { top = false; break; } t = t.parent; }
            if (top) fx.roots.Add(ps);
        }
        foreach (var an in fx.go.GetComponentsInChildren<Animator>(true))
        {
            var ac = an.runtimeAnimatorController as AnimatorController;
            AnimationClip clip = null;
            if (ac && ac.layers.Length > 0)
            {
                var sm = ac.layers[0].stateMachine;
                var st = sm.defaultState ?? (sm.states.Length > 0 ? sm.states[0].state : null);
                clip = st ? st.motion as AnimationClip : null;
            }
            else if (an.runtimeAnimatorController) clip = an.runtimeAnimatorController.animationClips.FirstOrDefault();
            if (clip) { fx.clips.Add(new KeyValuePair<GameObject, AnimationClip>(an.gameObject, clip)); fx.length = Mathf.Max(fx.length, clip.length); }
            an.enabled = false;
        }
        foreach (var a in fx.go.GetComponentsInChildren<Animation>(true))
        {
            if (a.clip) { fx.clips.Add(new KeyValuePair<GameObject, AnimationClip>(a.gameObject, a.clip)); fx.length = Mathf.Max(fx.length, a.clip.length); }
            a.enabled = false;
        }
        return fx;
    }

    static float MaxOf(ParticleSystem.MinMaxCurve c)
    {
        switch (c.mode)
        {
            case ParticleSystemCurveMode.Constant: return c.constant;
            case ParticleSystemCurveMode.TwoConstants: return c.constantMax;
            case ParticleSystemCurveMode.Curve: return c.curveMultiplier * c.curve.keys.Max(k => k.value);
            default: return c.curveMultiplier * c.curveMax.keys.Max(k => k.value);
        }
    }

    // t 초 때 모습으로 맞춘다
    static void Pose(Fx fx, float t)
    {
        foreach (var kv in fx.clips)
        {
            var c = kv.Value;
            float ct = c.isLooping && c.length > 0 ? t % c.length : Mathf.Min(t, c.length);
            c.SampleAnimation(kv.Key, ct);
        }
        foreach (var ps in fx.roots)
        {
            if (!ps.gameObject.activeInHierarchy) continue;
            ps.Simulate(t, true, true, true);
        }
    }

    static Bounds? WorldBounds(Fx fx)
    {
        Bounds? b = null;
        foreach (var r in fx.go.GetComponentsInChildren<Renderer>(false))
        {
            if (!r.enabled || r is TrailRenderer || r is LineRenderer) continue;
            if (r is ParticleSystemRenderer pr && pr.GetComponent<ParticleSystem>().particleCount == 0) continue;
            var rb = r.bounds;
            if (rb.size.sqrMagnitude < 1e-8f || float.IsNaN(rb.center.x)) continue;
            if (b == null) b = rb; else { var bb = b.Value; bb.Encapsulate(rb); b = bb; }
        }
        return b;
    }

    static Camera cam;
    static RenderTexture rt;
    static Texture2D readTex;

    static Color32[] Shot(Rect box, int w, int h, Color bg)
    {
        if (rt == null || rt.width != w || rt.height != h)
        {
            if (rt) Object.DestroyImmediate(rt);
            if (readTex) Object.DestroyImmediate(readTex);
            rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            readTex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        }
        cam.orthographicSize = box.height / 2;
        cam.aspect = box.width / box.height;
        cam.transform.position = new Vector3(box.center.x, box.center.y, -100);
        cam.backgroundColor = bg;
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        readTex.ReadPixels(new Rect(0, 0, w, h), 0, 0); readTex.Apply();
        RenderTexture.active = null;
        return readTex.GetPixels32();
    }

    // 검은 바탕·흰 바탕 두 장으로 미리 곱한 색 + 투명도를 만든다
    static Color32[] Frame(Rect box, int w, int h)
    {
        var k = Shot(box, w, h, Color.black);
        var wh = Shot(box, w, h, Color.white);
        var o = new Color32[k.Length];
        for (int i = 0; i < k.Length; i++)
        {
            int d = Mathf.Min(wh[i].r - k[i].r, Mathf.Min(wh[i].g - k[i].g, wh[i].b - k[i].b));
            int a = Mathf.Clamp(255 - d, 0, 255);
            byte r = k[i].r, g = k[i].g, b = k[i].b;
            a = Mathf.Max(a, Mathf.Max(r, Mathf.Max(g, b)));
            o[i] = new Color32(r, g, b, (byte)a);
        }
        return o;
    }

    static void One(string[] p)
    {
        string name = p[0], prefabPath = p[1];
        int px = p.Length > 2 && p[2] != "" ? int.Parse(p[2]) : 192;
        float fps = p.Length > 3 && p[3] != "" ? float.Parse(p[3], ci) : 20;
        float maxDur = p.Length > 4 && p[4] != "" ? float.Parse(p[4], ci) : 2f;
        var opt = new Dictionary<string, string>();
        if (p.Length > 5) foreach (var kv in p[5].Split(',')) { var s = kv.Split('='); if (s[0] != "") opt[s[0]] = s.Length > 1 ? s[1] : "1"; }
        float loopStart = opt.ContainsKey("loop") ? float.Parse(opt["loop"], ci) : -1;
        bool loop = loopStart >= 0;

        var fx = Make(prefabPath);
        var camGo = new GameObject("FxBakeCam");
        cam = camGo.AddComponent<Camera>();
        cam.orthographic = true; cam.clearFlags = CameraClearFlags.SolidColor; cam.nearClipPlane = 0.01f; cam.farClipPlane = 1000;
        cam.cullingMask = ~0; cam.allowHDR = false; cam.allowMSAA = true;

        float dur = loop ? maxDur : Mathf.Clamp(fx.length, 0.2f, maxDur);
        int total = Mathf.Max(1, Mathf.RoundToInt(dur * fps));
        float t0 = loop ? loopStart : 0;

        // 1) 그리는 물체 경계로 대강의 상자
        Rect box;
        if (opt.ContainsKey("box")) { float hb = float.Parse(opt["box"], ci); box = new Rect(-hb, -hb, hb * 2, hb * 2); }
        else
        {
            Bounds? ub = null;
            for (int i = 0; i < total; i += Mathf.Max(1, total / 12))
            {
                Pose(fx, t0 + i / fps);
                var b = WorldBounds(fx);
                if (b == null) continue;
                if (ub == null) ub = b; else { var bb = ub.Value; bb.Encapsulate(b.Value); ub = bb; }
            }
            var c = ub?.center ?? Vector3.zero; var e = ub?.extents ?? new Vector3(3, 3, 3);
            float hx = Mathf.Clamp(e.x, 0.3f, 30), hy = Mathf.Clamp(e.y, 0.3f, 30);
            float hh = Mathf.Max(hx, hy) * 1.3f;
            box = new Rect(Mathf.Clamp(c.x, -30, 30) - hh, Mathf.Clamp(c.y, -30, 30) - hh, hh * 2, hh * 2);
        }

        // 2) 낮은 해상도로 그려 실제로 보이는 범위와 보이는 장 구간을 잰다
        int first = -1, last = -1;
        if (!opt.ContainsKey("fit") || opt["fit"] != "0")
        {
            for (int pass = 0; pass < 3; pass++)
            {
                const int R = 192;
                int minX = R, minY = R, maxX = -1, maxY = -1; first = -1; last = -1;
                var sums = new long[total];
                for (int i = 0; i < total; i++)
                {
                    Pose(fx, t0 + i / fps);
                    var f = Frame(box, R, R);
                    for (int y = 0; y < R; y++) for (int x = 0; x < R; x++)
                        {
                            int a = f[y * R + x].a;
                            sums[i] += a;
                            if (a < 10) continue;
                            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
                        }
                }
                // 거의 안 보이는 장은 잘라 낸다: 앞은 가장 진한 장의 3% 미만, 뒤는 0.7% 미만
                long top = sums.Length > 0 ? sums.Max() : 0;
                for (int i = 0; i < total; i++) if (top > 0 && sums[i] >= top * 0.03) { first = i; break; }
                for (int i = total - 1; i >= 0; i--) if (top > 0 && sums[i] >= top * 0.007) { last = i; break; }
                if (first >= 0 && last < first) last = first;
                if (maxX < 0) break;
                bool edge = minX <= 0 || minY <= 0 || maxX >= R - 1 || maxY >= R - 1;
                float sx = box.width / R, sy = box.height / R;
                var nb = Rect.MinMaxRect(box.xMin + minX * sx, box.yMin + minY * sy, box.xMin + (maxX + 1) * sx, box.yMin + (maxY + 1) * sy);
                if (edge && pass < 2)
                {
                    // 가장자리에 닿으면 넓혀서 다시 잰다
                    box = new Rect(box.center.x - box.width * 1.25f, box.center.y - box.height * 1.25f, box.width * 2.5f, box.height * 2.5f);
                    continue;
                }
                float mx = nb.width * 0.06f + sx, my = nb.height * 0.06f + sy;
                box = Rect.MinMaxRect(nb.xMin - mx, nb.yMin - my, nb.xMax + mx, nb.yMax + my);
                break;
            }
        }
        if (first < 0) { first = 0; last = total - 1; }
        if (loop) { first = 0; last = total - 1; }
        int n = last - first + 1;

        // 3) 낱장 크기: 긴 변 px, 4의 배수
        int w, h;
        if (box.width >= box.height) { w = px; h = Mathf.Max(8, Mathf.RoundToInt(px * box.height / box.width / 4f) * 4); }
        else { h = px; w = Mathf.Max(8, Mathf.RoundToInt(px * box.width / box.height / 4f) * 4); }
        // 픽셀 비율에 맞게 상자를 고친다 (가운데 고정)
        float upp = Mathf.Max(box.width / w, box.height / h);
        box = new Rect(box.center.x - w * upp / 2, box.center.y - h * upp / 2, w * upp, h * upp);

        int cols = Mathf.Max(1, Mathf.CeilToInt(Mathf.Sqrt(n * (float)h / w)));
        while (cols * w > 4096) cols--;
        int rows = Mathf.CeilToInt(n / (float)cols);
        var atlas = new Texture2D(cols * w, rows * h, TextureFormat.RGBA32, false);
        var clear = new Color32[atlas.width * atlas.height];
        atlas.SetPixels32(clear);
        int peak = 0; long peakSum = -1;
        for (int i = 0; i < n; i++)
        {
            Pose(fx, t0 + (first + i) / fps);
            var f = Frame(box, w, h);
            long sum = 0;
            for (int j = 0; j < f.Length; j++) sum += f[j].a;
            if (sum > peakSum) { peakSum = sum; peak = i; }
            int cx = i % cols, cy = i / cols;
            // 그림 위쪽이 첫 줄이 되도록 (PNG 위→아래 순서) 아래에서부터 채운다
            atlas.SetPixels32(cx * w, (rows - 1 - cy) * h, w, h, f);
        }
        atlas.Apply();
        File.WriteAllBytes("fxbake/" + name + ".png", atlas.EncodeToPNG());
        // 기준점: 효과 원점(0,0)이 낱장 안 어디에 있는가 (왼쪽 위 0, 오른쪽 아래 1)
        float ax = (0 - box.xMin) / box.width, ay = (box.yMax - 0) / box.height;
        var json = "{\"name\":\"" + name + "\",\"prefab\":\"" + prefabPath.Replace("\\", "/") + "\",\"n\":" + n + ",\"cols\":" + cols + ",\"rows\":" + rows +
            ",\"fps\":" + F(fps) + ",\"w\":" + w + ",\"h\":" + h + ",\"worldW\":" + F(box.width) + ",\"worldH\":" + F(box.height) +
            ",\"ax\":" + F(ax) + ",\"ay\":" + F(ay) + ",\"lead\":" + F(first / fps) + ",\"peak\":" + peak + ",\"loop\":" + (loop ? 1 : 0) +
            ",\"length\":" + F(fx.length) + "}";
        File.WriteAllText("fxbake/" + name + ".json", json);
        Object.DestroyImmediate(fx.go);
        Object.DestroyImmediate(camGo);
        Object.DestroyImmediate(atlas);
        Debug.Log("FXBAKE OK " + name + " n=" + n + " " + w + "x" + h + " box=" + box);
    }
}
