// Exports every SkinnedMeshRenderer / MeshRenderer of each rig exactly as Unity sees it
// (mesh-space vertices with current blend shapes, uv, triangles per submesh, bone weights,
// bindposes, bone paths, material texture/shader, sorting).  Run: -executeMethod RefMesh.Run
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class RefMesh
{
    static readonly CultureInfo ci = CultureInfo.InvariantCulture;

    public static void Run()
    {
        Directory.CreateDirectory("mesh");
        var done = new HashSet<string>();
        foreach (var line in File.ReadAllLines("jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var p = line.Split('|');
            if (!done.Add(p[0])) continue;
            try { Export(p[0], p[1]); }
            catch (System.Exception e) { Debug.LogError("MESH FAIL " + p[0] + " " + e); }
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

    static void F(StringBuilder sb, float v) { sb.Append(v.ToString("0.#####", ci)); }

    // shader name + every float/range/color property value of a material
    static void Mat(StringBuilder sb, Material mat)
    {
        sb.Append("\"mat\":{\"shader\":\"").Append(mat && mat.shader ? mat.shader.name : "").Append("\",\"p\":{");
        if (mat && mat.shader)
        {
            int n = ShaderUtil.GetPropertyCount(mat.shader); bool f = true;
            for (int i = 0; i < n; i++)
            {
                var nm = ShaderUtil.GetPropertyName(mat.shader, i);
                var ty = ShaderUtil.GetPropertyType(mat.shader, i);
                if (ty == ShaderUtil.ShaderPropertyType.Color)
                {
                    var c = mat.GetColor(nm);
                    if (!f) sb.Append(','); f = false;
                    sb.Append('"').Append(nm).Append("\":["); F(sb, c.r); sb.Append(','); F(sb, c.g); sb.Append(','); F(sb, c.b); sb.Append(','); F(sb, c.a); sb.Append(']');
                }
                else if (ty == ShaderUtil.ShaderPropertyType.Float || ty == ShaderUtil.ShaderPropertyType.Range)
                {
                    if (!f) sb.Append(','); f = false;
                    sb.Append('"').Append(nm).Append("\":"); F(sb, mat.GetFloat(nm));
                }
                else if (ty == ShaderUtil.ShaderPropertyType.TexEnv && nm == "_MainTex")
                {
                    // tiling/offset (animated by some effect clips as material._MainTex_ST)
                    var s = mat.GetTextureScale(nm); var o = mat.GetTextureOffset(nm);
                    if (s != Vector2.one || o != Vector2.zero)
                    {
                        if (!f) sb.Append(','); f = false;
                        sb.Append("\"_MainTex_ST\":["); F(sb, s.x); sb.Append(','); F(sb, s.y); sb.Append(','); F(sb, o.x); sb.Append(','); F(sb, o.y); sb.Append(']');
                    }
                }
            }
        }
        sb.Append("}}");
    }

    static void Export(string id, string prefabPath)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        var go = (GameObject)Object.Instantiate(prefab);
        var animator = go.GetComponentInChildren<Animator>(true);
        var root = (animator ? animator.gameObject : go).transform;
        // sibling index among same-named siblings, to disambiguate duplicated paths
        var sb = new StringBuilder("{\"parts\":[");
        bool first = true;
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
        {
            Mesh mesh = null; Transform[] bones = null; Matrix4x4[] bind = null;
            var smr = r as SkinnedMeshRenderer;
            if (smr) { mesh = smr.sharedMesh; bones = smr.bones; bind = mesh ? mesh.bindposes : null; }
            else if (r is MeshRenderer) { var mf = r.GetComponent<MeshFilter>(); mesh = mf ? mf.sharedMesh : null; }
            if (!mesh || !mesh.isReadable && false) continue;
            Vector3[] verts;
            if (smr && mesh.blendShapeCount > 0)
            {
                verts = mesh.vertices;
                var dv = new Vector3[verts.Length];
                for (int s = 0; s < mesh.blendShapeCount; s++)
                {
                    float w = smr.GetBlendShapeWeight(s) / 100f;
                    if (w == 0) continue;
                    int fc = mesh.GetBlendShapeFrameCount(s);
                    mesh.GetBlendShapeFrameVertices(s, fc - 1, dv, null, null);
                    for (int i = 0; i < verts.Length; i++) verts[i] += dv[i] * w;
                }
            }
            else verts = mesh.vertices;
            var uv = mesh.uv;
            var bw = smr ? mesh.boneWeights : null;
            var mats = r.sharedMaterials;
            for (int sm = 0; sm < mesh.subMeshCount; sm++)
            {
                var mat = mats.Length > 0 ? mats[Mathf.Min(sm, mats.Length - 1)] : null;
                var tex = mat && mat.HasProperty("_MainTex") ? mat.mainTexture : null;
                // Shader Forge shaders name their texture differently (e.g. 3Dbase_shader: _Diffuse)
                if (!tex && mat)
                    foreach (var tn in mat.GetTexturePropertyNames())
                        if ((tex = mat.GetTexture(tn)) != null) break;
                var tris = mesh.GetTriangles(sm);
                if (!first) sb.Append(','); first = false;
                sb.Append("{\"path\":\"").Append(PathOf(r.transform, root).Replace("\"", "\\\"")).Append("\"")
                  .Append(",\"sib\":").Append(r.transform.GetSiblingIndex())
                  .Append(",\"kind\":\"").Append(smr ? "skin" : "mesh").Append("\"")
                  .Append(",\"on\":").Append(r.enabled ? 1 : 0)
                  .Append(",\"layer\":\"").Append(r.sortingLayerName).Append("\",\"order\":").Append(r.sortingOrder)
                  .Append(",\"tex\":\"").Append(tex ? AssetDatabase.GetAssetPath(tex) : "").Append("\"")
                  .Append(",\"shader\":\"").Append(mat && mat.shader ? mat.shader.name : "").Append("\"");
                sb.Append(','); Mat(sb, mat);
                var col = mat && mat.HasProperty("_Color") ? mat.color : Color.white;
                sb.Append(",\"color\":["); F(sb, col.r); sb.Append(','); F(sb, col.g); sb.Append(','); F(sb, col.b); sb.Append(','); F(sb, col.a); sb.Append(']');
                sb.Append(",\"pos\":[");
                for (int i = 0; i < verts.Length; i++) { if (i > 0) sb.Append(','); F(sb, verts[i].x); sb.Append(','); F(sb, verts[i].y); sb.Append(','); F(sb, verts[i].z); }
                sb.Append("],\"uv\":[");
                for (int i = 0; i < verts.Length; i++) { if (i > 0) sb.Append(','); var u = i < uv.Length ? uv[i] : Vector2.zero; F(sb, u.x); sb.Append(','); F(sb, u.y); }
                sb.Append("],\"idx\":[").Append(string.Join(",", tris)).Append(']');
                if (smr && bw != null && bw.Length == verts.Length)
                {
                    sb.Append(",\"si\":[");
                    for (int i = 0; i < bw.Length; i++) { if (i > 0) sb.Append(','); sb.Append(bw[i].boneIndex0).Append(',').Append(bw[i].boneIndex1).Append(',').Append(bw[i].boneIndex2).Append(',').Append(bw[i].boneIndex3); }
                    sb.Append("],\"sw\":[");
                    for (int i = 0; i < bw.Length; i++) { if (i > 0) sb.Append(','); F(sb, bw[i].weight0); sb.Append(','); F(sb, bw[i].weight1); sb.Append(','); F(sb, bw[i].weight2); sb.Append(','); F(sb, bw[i].weight3); }
                    sb.Append("],\"bones\":[");
                    for (int i = 0; i < bones.Length; i++) { if (i > 0) sb.Append(','); sb.Append('"').Append(bones[i] ? PathOf(bones[i], root).Replace("\"", "\\\"") : "").Append('"'); }
                    sb.Append("],\"bind\":[");
                    for (int i = 0; i < bind.Length; i++) { for (int k = 0; k < 16; k++) { if (i > 0 || k > 0) sb.Append(','); F(sb, bind[i][k]); } }
                    sb.Append(']');
                }
                sb.Append('}');
            }
        }
        sb.Append("],\"sprites\":[");
        first = true;
        foreach (var sr in go.GetComponentsInChildren<SpriteRenderer>(true))
        {
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"path\":\"").Append(PathOf(sr.transform, root).Replace("\"", "\\\"")).Append("\",\"sib\":").Append(sr.transform.GetSiblingIndex()).Append(',');
            Mat(sb, sr.sharedMaterial);
            sb.Append('}');
        }
        // geometry of every sprite in the sheets these renderers use (tight sprite meshes; swaps use the same sheets)
        sb.Append("],\"spriteMesh\":{");
        first = true;
        var sheets = new HashSet<string>();
        foreach (var sr in go.GetComponentsInChildren<SpriteRenderer>(true))
            if (sr.sprite) sheets.Add(AssetDatabase.GetAssetPath(sr.sprite));
        foreach (var sheet in sheets)
            foreach (var sp in AssetDatabase.LoadAllAssetsAtPath(sheet).OfType<Sprite>())
            {
                if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sp, out string sguid, out long sid)) continue;
                if (!first) sb.Append(','); first = false;
                sb.Append('"').Append(sguid.Substring(0, 8)).Append(':').Append(sid).Append("\":{\"v\":[");
                var sv = sp.vertices; var su = sp.uv; var st = sp.triangles;
                for (int i = 0; i < sv.Length; i++) { if (i > 0) sb.Append(','); F(sb, sv[i].x); sb.Append(','); F(sb, sv[i].y); }
                sb.Append("],\"u\":[");
                for (int i = 0; i < su.Length; i++) { if (i > 0) sb.Append(','); F(sb, su[i].x); sb.Append(','); F(sb, su[i].y); }
                sb.Append("],\"t\":[");
                for (int i = 0; i < st.Length; i++) { if (i > 0) sb.Append(','); sb.Append(st[i]); }
                sb.Append("]}");
            }
        sb.Append("}}");
        File.WriteAllText("mesh/" + id + ".json", sb.ToString());
        Object.DestroyImmediate(go);
        Debug.Log("MESHED " + id);
    }
}
