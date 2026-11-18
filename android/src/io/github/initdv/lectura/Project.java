package io.github.initdv.lectura;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import static io.github.initdv.lectura.Refs.*;

/** Web-compatible project model; blobs remain private and are never included in .lectura. */
final class Project {
    String id=UUID.randomUUID().toString(), title="", created=Instant.now().toString(), modified=created, text="";
    String character="robot_lectura",terminalTheme="sombre",font="JetBrains Mono",prompt="",motion="normal",background="#0d0d12";
    String fileName="",engine="webspeech",voice="";
    int cps=28, fontSize=18;
    float speed=1,pitch=1;
    long duration;
    boolean emotions=true,subtitles,fileAudio;
    JSONArray segments=new JSONArray();
    Project(JSONObject settings){
        character=settings.optString("personnageId","robot_lectura");terminalTheme=settings.optString("themeTerminal","sombre");font=settings.optString("policeTerminal","JetBrains Mono");
        cps=settings.optInt("vitesseDefilement",28);fontSize=settings.optInt("tailleTexte",18);
        engine=settings.optString("moteurVoix","webspeech");voice=settings.optString("voixId");speed=(float)settings.optDouble("vitesseVoix",1);pitch=(float)settings.optDouble("hauteurVoix",1);
    }
    static Project fromJson(JSONObject o){
        if(o.optInt("version",1)>1)throw new IllegalArgumentException("Ce projet vient d'une version plus récente de Lectura (format "+o.optString("version")+"). Mets l'application à jour.");
        Project p=new Project(new JSONObject());String id=s(o,"id",p.id);if(!id.isEmpty())p.id=id;
        p.title=cut(s(o,"titre",""),200);p.created=s(o,"creeLe",p.created);p.modified=s(o,"modifieLe",p.modified);p.text=s(o,"texte","");
        p.character=s(o,"personnageId",p.character);if(p.character.equals("professor_1")||p.character.isEmpty())p.character="robot_lectura";else if(p.character.equals("robot"))p.character="robot_rouge";
        JSONObject t=object(o,"terminal"),r=object(o,"reglages"),a=object(o,"audio"),v=object(a,"voix");
        p.terminalTheme=s(t,"theme","sombre");p.font=s(t,"police","JetBrains Mono");p.fontSize=(int)bounded(t,"taille",18,12,40);p.cps=(int)bounded(t,"vitesseCps",28,5,120);
        p.prompt=cut(s(t,"prompt","$ "),12);p.motion=s(r,"mouvements","normal");if(!Set.of("calme","normal","vif").contains(p.motion))p.motion="normal";
        p.background=s(r,"fond",p.background);if(!p.background.matches("(?i)#[0-9a-f]{6}")||p.background.equals("#0b0f14"))p.background="#0d0d12";
        p.emotions=!Boolean.FALSE.equals(r.opt("emotions"));p.subtitles="sous-titres".equals(o.optString("timing"));p.fileAudio="fichier".equals(a.optString("source"));
        p.fileName=s(a,"nomFichier","");p.duration=(long)bounded(a,"dureeMs",0,0,1e9);p.engine=v.optString("moteur");if(!Hd.hdEngine(p.engine)&&!p.engine.equals("auto"))p.engine="webspeech";
        p.voice=s(v,"id","");p.speed=(float)bounded(v,"vitesse",1,.5,2);p.pitch=(float)bounded(v,"hauteur",1,0,2);
        JSONArray segs=array(o,"segments");for(int i=0;i<segs.length();i++){
            JSONObject x=segs.optJSONObject(i);if(x==null||s(x,"texte","").isEmpty())continue;
            JSONObject q=new JSONObject();put(q,"id",p.segments.length()+1);put(q,"texte",s(x,"texte",""));put(q,"debutMs",bounded(x,"debutMs",0,0,1e9));
            put(q,"finMs",bounded(x,"finMs",0,0,1e9));put(q,"expression",s(x,"expression","auto"));p.segments.put(q);
        }
        return p;
    }
    JSONObject json(){
        JSONObject p=new JSONObject(),a=new JSONObject(),v=new JSONObject(),t=new JSONObject(),r=new JSONObject();
        put(p,"version",1);put(p,"id",id);put(p,"titre",title);put(p,"creeLe",created);put(p,"modifieLe",modified);put(p,"texte",text);put(p,"segments",segments);
        put(p,"audio",a);put(a,"source",fileAudio?"fichier":"voix");put(a,"nomFichier",fileName);put(a,"dureeMs",duration);put(a,"voix",v);
        put(v,"moteur",engine);put(v,"id",voice);put(v,"vitesse",speed);put(v,"hauteur",pitch);
        put(p,"timing",subtitles?"sous-titres":"auto");put(p,"personnageId",character);put(p,"terminal",t);put(p,"reglages",r);
        put(t,"theme",terminalTheme);put(t,"police",font);put(t,"taille",fontSize);put(t,"vitesseCps",cps);put(t,"prompt",prompt);
        put(r,"mouvements",motion);put(r,"emotions",emotions);put(r,"fond",background);return p;
    }
    String base(){String base=ascii(title);return base.isEmpty()?"projet":base;}
    static String ascii(String s){return java.text.Normalizer.normalize(s,java.text.Normalizer.Form.NFD).replaceAll("[\\u0300-\\u036f]","").replaceAll("[^A-Za-z0-9]+","-").replaceAll("^-+|-+$","").toLowerCase(java.util.Locale.ROOT);}
    List<Script.Segment> recalc(){
        List<Script.Segment> s=subtitles?Script.locate(text,segments,true):null;
        if(s==null){subtitles=false;s=Script.timing(text,fileAudio&&duration>0?duration:Script.estimate(text,speed,cps),fileAudio?0:.5);Script.reportExpressions(s,segments);segments=Script.encode(s);}return s;
    }
    private static String cut(String s,int n){return s.length()>n?s.substring(0,n):s;}
    private static String s(JSONObject o,String k,String d){Object v=o.opt(k);return v instanceof String?(String)v:d;}
    private static double bounded(JSONObject o,String k,double def,double min,double max){double v=o.optDouble(k,def);return !Double.isFinite(v)?def:Math.max(min,Math.min(max,v));}
}

final class Library {
    final File files,projects,audio;
    final JSONObject settings;
    private final SharedPreferences prefs;
    Library(Refs refs){
        Context c=refs.context;files=c.getFilesDir();projects=dir(files,"projects");audio=dir(files,"audio");
        prefs=c.getSharedPreferences("lectura",Context.MODE_PRIVATE);settings=Refs.merge(refs.defaults,PrefsJson(prefs.getString("settings","{}")));
        // Drop obsolete activation fields on update without touching user projects or media.
        boolean changed=settings.has("licence")||settings.has("idInstallation");
        settings.remove("licence");settings.remove("idInstallation");
        if(changed)saveSettings();
    }
    String locale(){return settings.optString("langue").equals("en")?"en":"fr";}
    void set(String key,Object v){put(settings,key,v);saveSettings();}
    private void saveSettings(){prefs.edit().putString("settings",settings.toString()).apply();}
    static JSONObject PrefsJson(String s){try{return parse(s);}catch(IllegalArgumentException e){return new JSONObject();}}
    static File dir(File base,String sub){File f=new File(base,sub);if(!f.exists()&&!f.mkdirs())throw new IllegalStateException("Stockage : "+sub);return f;}
    File audio(Project p){return new File(audio,storageKey(p)+".audio");}
    private static String storageKey(Project p){return UUID.nameUUIDFromBytes(p.id.getBytes(StandardCharsets.UTF_8)).toString();}
    Project draft(){
        try{JSONObject o=readJson(new File(files,"draft.json"));if(!o.optString("texte").trim().isEmpty())return Project.fromJson(o);}catch(Exception ignored){}
        return new Project(settings);
    }
    void draft(Project p) throws IOException {File f=new File(files,"draft.json");if(p.text.trim().isEmpty())new AtomicFile(f).delete();else writeJson(f,p.json());}
    void save(Project p) throws IOException {p.modified=Instant.now().toString();writeJson(new File(projects,storageKey(p)+".json"),p.json());new AtomicFile(new File(files,"draft.json")).delete();}
    void delete(Project p){new AtomicFile(new File(projects,storageKey(p)+".json")).delete();audio(p).delete();}
    List<Project> projects() throws IOException {
        List<Project> list=new ArrayList<>();File[] fs=projects.listFiles((f,n)->n.endsWith(".json"));
        if(fs!=null)for(File f:fs)list.add(Project.fromJson(readJson(f)));list.sort(Comparator.comparing((Project p)->p.modified).reversed());return list;
    }
    static JSONObject readJson(File f) throws IOException {try(FileInputStream in=new AtomicFile(f).openRead()){return parse(new String(Refs.read(in,8_000_000),StandardCharsets.UTF_8));}}
    static void writeJson(File f,JSONObject o) throws IOException {
        AtomicFile atomic=new AtomicFile(f);FileOutputStream out=atomic.startWrite();try{out.write(o.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(out);}catch(IOException e){atomic.failWrite(out);throw e;}
    }
}
