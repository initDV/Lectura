package io.github.initdv.lectura;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Locale;

/** Immutable drawings, dictionaries and tokens from the audited web source. */
final class Refs {
    final Context context;
    final JSONObject defaults, themes, expressions, neutral, icons, fr, en;
    final RigPose rig;
    final AichaMotion.Visages visages;
    final Typeface mono;
    final ArrayList<JSONObject> characters = new ArrayList<>();
    Refs(Context c) {
        context = c;
        mono = Typeface.createFromAsset(c.getAssets(), "jetbrains-mono.ttf");
        defaults = json("defaults.json"); themes = json("themes.json");
        JSONObject poses = json("expressions.json"); neutral = object(poses, "neutral"); expressions = object(poses, "expressions");
        rig = new RigPose(neutral, expressions);
        visages = new AichaMotion.Visages(object(poses, "visages"));
        icons = json("icons.json"); fr = json("fr.json"); en = json("en.json");
        JSONArray index = array(json("characters/index.json"), "personnages");
        for (int i = 0; i < index.length(); i++) characters.add(json("characters/" + index.optString(i) + ".json"));
    }
    InputStream open(String file) throws IOException { return context.getAssets().open(file); }
    String text(String file) {
        try (InputStream in = open(file)) { return new String(read(in, 4_000_000), StandardCharsets.UTF_8); }
        catch (IOException e) { throw new IllegalStateException(file, e); }
    }
    static byte[] read(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] bytes = new byte[8192];
        for (int n; (n=in.read(bytes)) != -1;) {
            if (out.size()+n>max) throw new IOException("Fichier trop volumineux.");
            out.write(bytes,0,n);
        }
        return out.toByteArray();
    }
    JSONObject json(String file) { return parse(text(file)); }
    JSONObject character(String id) {
        for (JSONObject def : characters) if (def.optString("id").equals(id)) return def;
        return null;
    }
    String label(String lang, String key, Object... values) {
        String s = (lang.equals("en") ? en : fr).optString(key, fr.optString(key, key));
        for (int i = 0; i + 1 < values.length; i += 2) s = s.replace("{" + values[i] + "}", String.valueOf(values[i+1]));
        return s;
    }
    static JSONObject parse(String text) {
        try { return new JSONObject(text); }
        catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    static JSONObject object(JSONObject o, String k) { JSONObject v = o.optJSONObject(k); return v == null ? new JSONObject() : v; }
    static JSONArray array(JSONObject o, String k) { JSONArray v = o.optJSONArray(k); return v == null ? new JSONArray() : v; }
    static JSONObject put(JSONObject o, String k, Object v) {
        try { return o.put(k,v); }
        catch (JSONException e) { throw new IllegalArgumentException(k, e); }
    }
    static JSONObject merge(JSONObject a, JSONObject b) {
        JSONObject o = new JSONObject();
        for (JSONObject p : new JSONObject[]{a,b}) for (Iterator<String> it = p.keys(); it.hasNext();) { String k = it.next(); put(o,k,p.opt(k)); }
        return o;
    }
    static int color(String s) {
        if (s.matches("#[0-9a-fA-F]{3}")) s = "#"+s.charAt(1)+s.charAt(1)+s.charAt(2)+s.charAt(2)+s.charAt(3)+s.charAt(3);
        try { return Color.parseColor(s); } catch (IllegalArgumentException e) { return Color.BLACK; }
    }
    static int color(JSONObject o, String k) { return color(o.optString(k,"#000000")); }
    static float clamp(float v, float a, float b) { return Math.max(a,Math.min(b,v)); }
    static String size(long bytes) {
        if (bytes < 1048576) return Math.max(1,Math.round(bytes/1024d))+" Ko";
        if (bytes < 1073741824L) return String.format(Locale.ROOT,bytes < 10485760 ? "%.1f Mo" : "%.0f Mo",bytes/1048576d);
        return String.format(Locale.ROOT,"%.1f Go",bytes/1073741824d);
    }
    static String time(long ms) { long s=Math.max(0,ms/1000); return String.format(Locale.ROOT,"%d:%02d",s/60,s%60); }
}
