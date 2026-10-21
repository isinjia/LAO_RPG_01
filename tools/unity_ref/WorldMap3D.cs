// 원작 3D 지역 지도(3D_worldmap_*)를 브라우저 3D로 옮기기 위한 자료를 뽑는다.
// 모든 좌표는 three.js 오른손 좌표로 바꿔 적는다 (z 뒤집기: 위치 (x,y,-z), 회전 (-x,-y,z,w), 삼각형 감기 뒤집기).
// Run: Unity -batchmode -executeMethod RefWorldMap3D.Run  (worldmap_jobs.txt: out|prefab)  결과: worldmap3d/<out>.json, worldmap3d/tex/*.png
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

public static class RefWorldMap3D
{
    static readonly CultureInfo ci = CultureInfo.InvariantCulture;
    const float FPS = 15f;
    static Dictionary<Texture, string> texNames;
    static List<string> texInfo;

    public static void Run()
    {
        Directory.CreateDirectory("worldmap3d/tex");
        foreach (var line in File.ReadAllLines("worldmap_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|');
            try { One(p[0], p[1]); }
            catch (System.Exception e) { Debug.LogError("WORLDMAP3D FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    static string F(float v) { return float.IsNaN(v) || float.IsInfinity(v) ? "0" : v.ToString("0.#####", ci); }
    static string V3(Vector3 v) { return "[" + F(v.x) + "," + F(v.y) + "," + F(-v.z) + "]"; }
    static string Q(Quaternion q) { return "[" + F(-q.x) + "," + F(-q.y) + "," + F(q.z) + "," + F(q.w) + "]"; }
    static string Col(Color c) { return "[" + F(c.r) + "," + F(c.g) + "," + F(c.b) + "," + F(c.a) + "]"; }
    static string Str(string s) { return "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }

    static string PathOf(Transform t, Transform root)
    {
        if (t == root) return "";
        var s = t.name;
        while (t.parent != null && t.parent != root) { t = t.parent; s = t.name + "/" + s; }
        return s;
    }

    // 루트 기준 위치·회전·크기
    static string Xf(Transform t, Transform root)
    {
        var m = root.worldToLocalMatrix * t.localToWorldMatrix;
        var pos = (Vector3)m.GetColumn(3);
        var rot = Quaternion.LookRotation(m.GetColumn(2), m.GetColumn(1));
        var scl = new Vector3(m.GetColumn(0).magnitude, m.GetColumn(1).magnitude, m.GetColumn(2).magnitude);
        if (Vector3.Dot(Vector3.Cross(m.GetColumn(0), m.GetColumn(1)), m.GetColumn(2)) < 0) scl.x = -scl.x;
        return "\"pos\":" + V3(pos) + ",\"rot\":" + Q(rot) + ",\"scl\":[" + F(scl.x) + "," + F(scl.y) + "," + F(scl.z) + "]";
    }

    static string Tex(Texture t)
    {
        if (!t) return "null";
        if (texNames.TryGetValue(t, out var n)) return Str(n);
        n = t.name.Replace(' ', '_');
        while (texNames.ContainsValue(n)) n += "_";
        texNames[t] = n;
        texInfo.Add(Str(n) + ":{\"wrapU\":" + (int)t.wrapModeU + ",\"wrapV\":" + (int)t.wrapModeV + ",\"mip\":" + (t.mipmapCount > 1 ? 1 : 0) + ",\"filter\":" + (int)t.filterMode + "}");
        // 읽기 막힌 그림도 화면 그림으로 옮겨 읽는다
        var rt = RenderTexture.GetTemporary(t.width, t.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
        Graphics.Blit(t, rt);
        var prev = RenderTexture.active; RenderTexture.active = rt;
        var tx = new Texture2D(t.width, t.height, TextureFormat.RGBA32, false);
        tx.ReadPixels(new Rect(0, 0, t.width, t.height), 0, 0); tx.Apply();
        File.WriteAllBytes("worldmap3d/tex/" + n + ".png", tx.EncodeToPNG());
        RenderTexture.active = prev; RenderTexture.ReleaseTemporary(rt); Object.DestroyImmediate(tx);
        return Str(n);
    }

    static string Mat(Material mat)
    {
        if (!mat) return "null";
        var sb = new StringBuilder("{\"name\":" + Str(mat.name) + ",\"shader\":" + Str(mat.shader ? mat.shader.name : "") + ",\"queue\":" + mat.renderQueue + ",\"p\":{");
        bool first = true;
        if (mat.shader)
        {
            int n = ShaderUtil.GetPropertyCount(mat.shader);
            for (int i = 0; i < n; i++)
            {
                var nm = ShaderUtil.GetPropertyName(mat.shader, i);
                var ty = ShaderUtil.GetPropertyType(mat.shader, i);
                string v = null;
                if (ty == ShaderUtil.ShaderPropertyType.Color) v = Col(mat.GetColor(nm));
                else if (ty == ShaderUtil.ShaderPropertyType.Vector) { var q = mat.GetVector(nm); v = "[" + F(q.x) + "," + F(q.y) + "," + F(q.z) + "," + F(q.w) + "]"; }
                else if (ty == ShaderUtil.ShaderPropertyType.Float || ty == ShaderUtil.ShaderPropertyType.Range) v = F(mat.GetFloat(nm));
                else if (ty == ShaderUtil.ShaderPropertyType.TexEnv)
                {
                    var s = mat.GetTextureScale(nm); var o = mat.GetTextureOffset(nm);
                    v = "{\"tex\":" + Tex(mat.GetTexture(nm)) + ",\"st\":[" + F(s.x) + "," + F(s.y) + "," + F(o.x) + "," + F(o.y) + "]}";
                }
                if (v == null) continue;
                if (!first) sb.Append(','); first = false;
                sb.Append(Str(nm)).Append(':').Append(v);
            }
        }
        return sb.Append("}}").ToString();
    }

    static string MeshJson(Mesh m)
    {
        var sb = new StringBuilder("{\"name\":" + Str(m.name));
        sb.Append(",\"v\":[").Append(string.Join(",", m.vertices.Select(v => F(v.x) + "," + F(v.y) + "," + F(-v.z)))).Append(']');
        if (m.normals.Length > 0) sb.Append(",\"n\":[").Append(string.Join(",", m.normals.Select(v => F(v.x) + "," + F(v.y) + "," + F(-v.z)))).Append(']');
        if (m.uv.Length > 0) sb.Append(",\"uv\":[").Append(string.Join(",", m.uv.Select(v => F(v.x) + "," + F(v.y)))).Append(']');
        if (m.colors.Length > 0) sb.Append(",\"c\":[").Append(string.Join(",", m.colors.Select(c => F(c.r) + "," + F(c.g) + "," + F(c.b) + "," + F(c.a)))).Append(']');
        sb.Append(",\"sub\":[");
        for (int s = 0; s < m.subMeshCount; s++)
        {
            var tri = m.GetTriangles(s);
            var o = new List<string>();
            for (int i = 0; i + 2 < tri.Length; i += 3) { o.Add(tri[i].ToString()); o.Add(tri[i + 2].ToString()); o.Add(tri[i + 1].ToString()); }
            if (s > 0) sb.Append(',');
            sb.Append('[').Append(string.Join(",", o)).Append(']');
        }
        return sb.Append("]}").ToString();
    }

    static string Curve(ParticleSystem.MinMaxCurve c)
    {
        var sb = new StringBuilder("{\"mode\":" + (int)c.mode + ",\"c\":" + F(c.constant) + ",\"min\":" + F(c.constantMin) + ",\"max\":" + F(c.constantMax) + ",\"m\":" + F(c.curveMultiplier));
        var cv = c.mode == ParticleSystemCurveMode.Curve ? c.curve : c.mode == ParticleSystemCurveMode.TwoCurves ? c.curveMax : null;
        if (cv != null) sb.Append(",\"k\":[").Append(string.Join(",", cv.keys.Select(k => "[" + F(k.time) + "," + F(k.value) + "]"))).Append(']');
        return sb.Append('}').ToString();
    }

    static string Grad(Gradient g)
    {
        if (g == null) return "null";
        return "{\"c\":[" + string.Join(",", g.colorKeys.Select(k => "[" + F(k.time) + "," + F(k.color.r) + "," + F(k.color.g) + "," + F(k.color.b) + "]")) +
            "],\"a\":[" + string.Join(",", g.alphaKeys.Select(k => "[" + F(k.time) + "," + F(k.alpha) + "]")) + "]}";
    }

    static string GradMM(ParticleSystem.MinMaxGradient g)
    {
        return "{\"mode\":" + (int)g.mode + ",\"c\":" + Col(g.color) + ",\"min\":" + Col(g.colorMin) + ",\"max\":" + Col(g.colorMax) + ",\"g\":" + Grad(g.mode == ParticleSystemGradientMode.TwoGradients ? g.gradientMax : g.gradient) + "}";
    }

    static string PS(ParticleSystem ps)
    {
        var m = ps.main; var em = ps.emission; var sh = ps.shape; var col = ps.colorOverLifetime; var sz = ps.sizeOverLifetime; var ro = ps.rotationOverLifetime;
        var ts = ps.textureSheetAnimation; var r = ps.GetComponent<ParticleSystemRenderer>();
        var sb = new StringBuilder("{");
        sb.Append("\"dur\":" + F(m.duration) + ",\"loop\":" + (m.loop ? 1 : 0) + ",\"delay\":" + Curve(m.startDelay) + ",\"life\":" + Curve(m.startLifetime) + ",\"speed\":" + Curve(m.startSpeed));
        sb.Append(",\"size\":" + Curve(m.startSize) + ",\"size3d\":" + (m.startSize3D ? 1 : 0) + ",\"sizeY\":" + Curve(m.startSizeY) + ",\"rot\":" + Curve(m.startRotation) + ",\"color\":" + GradMM(m.startColor));
        sb.Append(",\"max\":" + m.maxParticles + ",\"space\":" + (int)m.simulationSpace + ",\"gravity\":" + Curve(m.gravityModifier) + ",\"scaling\":" + (int)m.scalingMode + ",\"prewarm\":" + (m.prewarm ? 1 : 0));
        sb.Append(",\"em\":{\"on\":" + (em.enabled ? 1 : 0) + ",\"rate\":" + Curve(em.rateOverTime) + ",\"bursts\":[");
        var bs = new ParticleSystem.Burst[em.burstCount]; em.GetBursts(bs);
        sb.Append(string.Join(",", bs.Select(b => "[" + F(b.time) + "," + F(b.count.constant) + "," + b.cycleCount + "," + F(b.repeatInterval) + "]"))).Append("]}");
        sb.Append(",\"shape\":{\"on\":" + (sh.enabled ? 1 : 0) + ",\"type\":" + (int)sh.shapeType + ",\"r\":" + F(sh.radius) + ",\"thick\":" + F(sh.radiusThickness) + ",\"angle\":" + F(sh.angle) + ",\"arc\":" + F(sh.arc) +
            ",\"pos\":" + V3(sh.position) + ",\"rot\":" + V3(sh.rotation) + ",\"scl\":" + V3(sh.scale) + "}");
        sb.Append(",\"col\":" + (col.enabled ? GradMM(col.color) : "null"));
        sb.Append(",\"sz\":" + (sz.enabled ? Curve(sz.size) : "null"));
        sb.Append(",\"rol\":" + (ro.enabled ? Curve(ro.z) : "null"));
        sb.Append(",\"sheet\":" + (ts.enabled ? "{\"x\":" + ts.numTilesX + ",\"y\":" + ts.numTilesY + ",\"frame\":" + Curve(ts.frameOverTime) + ",\"cycles\":" + ts.cycleCount + "}" : "null"));
        if (r) sb.Append(",\"render\":{\"mode\":" + (int)r.renderMode + ",\"mat\":" + Mat(r.sharedMaterial) + ",\"len\":" + F(r.lengthScale) + ",\"vel\":" + F(r.velocityScale) + ",\"align\":" + (int)r.alignment + ",\"mesh\":" + (r.mesh ? MeshJson(r.mesh) : "null") + "}");
        return sb.Append('}').ToString();
    }

    static void One(string outName, string prefabPath)
    {
        texNames = new Dictionary<Texture, string>(); texInfo = new List<string>();
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var go = (GameObject)Object.Instantiate(prefab);
        go.transform.position = Vector3.zero; go.transform.rotation = Quaternion.identity; go.transform.localScale = Vector3.one;
        var root = go.transform;
        var all = go.GetComponentsInChildren<Transform>(true);
        var sb = new StringBuilder("{");

        // 물체: 그려지는 것 (모델·그림 조각·입자)
        sb.Append("\"objs\":[");
        bool first = true;
        foreach (var t in all)
        {
            var parts = new List<string>();
            var mf = t.GetComponent<MeshFilter>(); var mr = t.GetComponent<MeshRenderer>();
            if (mf && mf.sharedMesh && mr) parts.Add("\"mesh\":" + MeshJson(mf.sharedMesh) + ",\"mats\":[" + string.Join(",", mr.sharedMaterials.Select(Mat)) + "]");
            var sr = t.GetComponent<SpriteRenderer>();
            if (sr && sr.sprite)
            {
                var sp = sr.sprite;
                parts.Add("\"sprite\":{\"tex\":" + Tex(sp.texture) + ",\"rect\":[" + F(sp.textureRect.x) + "," + F(sp.textureRect.y) + "," + F(sp.textureRect.width) + "," + F(sp.textureRect.height) +
                    "],\"tw\":" + sp.texture.width + ",\"th\":" + sp.texture.height + ",\"pivot\":[" + F(sp.pivot.x) + "," + F(sp.pivot.y) + "],\"ppu\":" + F(sp.pixelsPerUnit) +
                    ",\"color\":" + Col(sr.color) + ",\"flip\":[" + (sr.flipX ? 1 : 0) + "," + (sr.flipY ? 1 : 0) + "],\"order\":" + sr.sortingOrder + ",\"draw\":" + (int)sr.drawMode + ",\"size\":[" + F(sr.size.x) + "," + F(sr.size.y) + "],\"tile\":" + (int)sr.tileMode + ",\"mat\":" + Mat(sr.sharedMaterial) + "}");
            }
            var ps = t.GetComponent<ParticleSystem>();
            if (ps) parts.Add("\"ps\":" + PS(ps));
            var tr = t.GetComponent<TrailRenderer>();
            if (tr) parts.Add("\"trail\":{\"time\":" + F(tr.time) + ",\"w\":" + F(tr.widthMultiplier) + ",\"wc\":[" + string.Join(",", tr.widthCurve.keys.Select(k => "[" + F(k.time) + "," + F(k.value) + "]")) + "],\"col\":" + Grad(tr.colorGradient) + ",\"mat\":" + Mat(tr.sharedMaterial) + "}");
            var cam = t.GetComponent<Camera>();
            if (cam) parts.Add("\"cam\":{\"fov\":" + F(cam.fieldOfView) + ",\"near\":" + F(cam.nearClipPlane) + ",\"far\":" + F(cam.farClipPlane) + ",\"bg\":" + Col(cam.backgroundColor) + ",\"clear\":" + (int)cam.clearFlags + ",\"depth\":" + F(cam.depth) + ",\"mask\":" + cam.cullingMask + "}");
            if (parts.Count == 0 && !t.name.StartsWith("point_")) continue;
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"path\":" + Str(PathOf(t, root)) + ",\"active\":" + (t.gameObject.activeInHierarchy ? 1 : 0) + ",\"self\":" + (t.gameObject.activeSelf ? 1 : 0) + "," + Xf(t, root) + ",\"layer\":" + t.gameObject.layer);
            foreach (var p in parts) sb.Append(',').Append(p);
            sb.Append('}');
        }
        sb.Append(']');

        // 애니메이터별 상태 → 클립 표본 (카메라·작전 지점 켜짐·이동선)
        var camT = all.FirstOrDefault(t => t.GetComponent<Camera>() && t.name.Contains("3D"));
        if (!camT) camT = all.FirstOrDefault(t => t.GetComponent<Camera>());
        sb.Append(",\"camPath\":" + Str(camT ? PathOf(camT, root) : ""));
        sb.Append(",\"anims\":[");
        first = true;
        foreach (var an in go.GetComponentsInChildren<Animator>(true))
        {
            var ac = an.runtimeAnimatorController as AnimatorController;
            if (!ac) continue;
            var states = ac.layers[0].stateMachine.states;
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"path\":" + Str(PathOf(an.transform, root)) + ",\"ctrl\":" + Str(ac.name) + ",\"default\":" + Str(ac.layers[0].stateMachine.defaultState ? ac.layers[0].stateMachine.defaultState.name : "") + ",\"states\":[");
            bool fs = true;
            foreach (var st in states)
            {
                var clip = st.state.motion as AnimationClip;
                if (!fs) sb.Append(','); fs = false;
                sb.Append("{\"name\":" + Str(st.state.name) + ",\"clip\":" + Str(clip ? clip.name : "") + ",\"speed\":" + F(st.state.speed));
                if (clip)
                {
                    sb.Append(",\"len\":" + F(clip.length) + ",\"loop\":" + (clip.isLooping ? 1 : 0));
                    var binds = AnimationUtility.GetCurveBindings(clip);
                    sb.Append(",\"binds\":[" + string.Join(",", binds.Select(b => Str(b.path + "|" + b.propertyName)).Distinct()) + "]");
                    bool camAnim = binds.Any(b => b.path.StartsWith("camera"));
                    var actPaths = binds.Where(b => b.propertyName == "m_IsActive").Select(b => b.path).Distinct().ToList();
                    if (camT && camAnim)
                    {
                        sb.Append(",\"cam\":[");
                        int n = Mathf.Max(1, Mathf.CeilToInt(clip.length * FPS));
                        for (int i = 0; i <= n; i++)
                        {
                            clip.SampleAnimation(an.gameObject, clip.length * i / n);
                            var m = root.worldToLocalMatrix * camT.localToWorldMatrix;
                            var pos = (Vector3)m.GetColumn(3); var rot = Quaternion.LookRotation(m.GetColumn(2), m.GetColumn(1));
                            if (i > 0) sb.Append(',');
                            sb.Append(F(pos.x) + "," + F(pos.y) + "," + F(-pos.z) + "," + F(-rot.x) + "," + F(-rot.y) + "," + F(rot.z) + "," + F(rot.w));
                        }
                        sb.Append(']');
                    }
                    if (actPaths.Count > 0)
                    {
                        clip.SampleAnimation(an.gameObject, 0);
                        sb.Append(",\"on\":[" + string.Join(",", actPaths.Where(p => an.transform.Find(p) && an.transform.Find(p).gameObject.activeSelf).Select(Str)) + "]");
                    }
                }
                sb.Append('}');
            }
            sb.Append("]}");
        }
        sb.Append("],\"texInfo\":{" + string.Join(",", texInfo) + "}}");
        File.WriteAllText(Path.Combine("worldmap3d", outName + ".json"), sb.ToString());
        // 비교용 기준 그림: 상태 이름@초 (브라우저에서 ?wm=상태@초 로 같은 자세를 띄워 견준다)
        foreach (var pair in new[] { "S_Default@0", "S_12@18.45", "S_08@28.6" })
        {
            var sp = pair.Split('@');
            var an = go.GetComponentsInChildren<Animator>(true).FirstOrDefault(a => a.runtimeAnimatorController is AnimatorController c && c.layers[0].stateMachine.states.Any(x => x.state.name == sp[0]));
            if (!an || !camT) continue;
            var clip = ((AnimatorController)an.runtimeAnimatorController).layers[0].stateMachine.states.First(x => x.state.name == sp[0]).state.motion as AnimationClip;
            clip.SampleAnimation(an.gameObject, float.Parse(sp[1], ci));
            var cam = camT.GetComponent<Camera>();
            cam.gameObject.SetActive(true); cam.enabled = true; cam.aspect = 16f / 9f;
            var rt = new RenderTexture(1280, 720, 24, RenderTextureFormat.ARGB32) { antiAliasing = 8 };
            cam.targetTexture = rt; cam.Render();
            RenderTexture.active = rt;
            var tx = new Texture2D(1280, 720, TextureFormat.RGBA32, false);
            tx.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0); tx.Apply();
            File.WriteAllBytes("worldmap3d/ref_" + sp[0] + "_" + sp[1] + ".png", tx.EncodeToPNG());
            RenderTexture.active = null; cam.targetTexture = null;
            Object.DestroyImmediate(rt); Object.DestroyImmediate(tx);
        }
        Object.DestroyImmediate(go);
        Debug.Log("WORLDMAP3D OK " + outName + " tex " + texNames.Count);
    }
}
