package io.github.initdv.lectura;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import static io.github.initdv.lectura.Refs.*;

/** Native text voices, serialized inference and bounded caches. No voice downloads on launch. */
final class Hd implements AutoCloseable {
    private static final String BASE="https://initdv.github.io/Lectura/models/";
    private static final long LIMIT=150L*1024*1024,PHRASE_LIMIT=80L*1024*1024;
    private static final int WARM_CHARS=320, PIPER_WARM_PHRASES=3;
    final List<JSONObject> voices=new ArrayList<>();
    private final File models,phrases,whole;
    private final G2p g2p;
    private final VoicePacks packs;
    private final JSONObject pronunciation;
    private final Map<String,float[]> l1=new LinkedHashMap<>(16,.75f,true);
    private long l1Bytes;
    private Ort ort;
    private Pocket pocket;
    private Kokoro kokoro;
    private String loaded="";
    private JSONObject catalogue;
    interface Progress {void update(long value,long total);}
    static final class Synthesis {
        final Pcm pcm;final List<Script.Segment> segments;
        Synthesis(Pcm pcm,List<Script.Segment> segments){this.pcm=pcm;this.segments=segments;}
    }
    Hd(Refs refs){
        Context context=refs.context;models=Library.dir(context.getFilesDir(),"models");phrases=Library.dir(context.getCacheDir(),"phrases");whole=Library.dir(context.getCacheDir(),"synthese");
        packs=new VoicePacks(models);
        JSONArray data=array(refs.json("hd-voices.json"),"voices");
        for(int i=0;i<data.length();i++)voices.add(data.optJSONObject(i));g2p=new G2p(refs.json("g2p.json"));pronunciation=refs.json("prononciation.json");
        try{catalogue=Library.readJson(new File(models,"index.json"));}catch(Exception ignored){try{catalogue=refs.json("hd-index.json");}catch(Exception ignored2){}}
    }
    static boolean supported(){try{Class.forName("ai.onnxruntime.OrtEnvironment",false,Hd.class.getClassLoader());return true;}catch(ClassNotFoundException|LinkageError e){return false;}}
    JSONObject voice(String id){for(JSONObject v:voices)if(v.optString("id").equals(id))return v;return null;}
    static String engine(JSONObject voice){return voice==null?"piper":voice.optString("moteur","piper");}
    static boolean hdEngine(String engine){return engine.equals("piper")||engine.equals("kokoro")||engine.equals("pocket");}
    private String model(JSONObject voice){return voice.optString("modele");}
    private VoicePacks.Spec pack(JSONObject v){return v==null?null:VoicePacks.byId(v.optString("id"));}
    long diskSize(JSONObject v){VoicePacks.Spec spec=pack(v);return spec==null?size(v):spec.installedBytes;}
    boolean available(JSONObject v){VoicePacks.Spec spec=pack(v);return spec==null?supported():spec.supported();}
    List<String> automatic(String lang){
        List<String> names=new ArrayList<>();if(lang.equals("fr"))for(String id:List.of("estelle","siwis","tom"))if(installed(voice(id)))names.add(id);return names;
    }
    String autoVoice(String lang){List<String> names=automatic(lang);return names.isEmpty()?"":names.get(0);}
    private File part(String name){return new File(models,name);}
    private File onnx(JSONObject v){return part(model(v)+".onnx");}
    private File cfg(JSONObject v){return part(model(v)+".onnx.json");}
    boolean installed(JSONObject v){return v!=null&&available(v)&&modelOnDisk(v);}
    List<JSONObject> installed(){List<JSONObject> out=new ArrayList<>();if(supported())for(JSONObject v:voices)if(installed(v))out.add(v);return out;}
    /** Fichiers locaux seulement : ni initialisation de moteur, ni accès réseau. */
    static final class VoiceStorage {
        final List<String> ids,names;
        final long installedBytes,partialBytes;
        VoiceStorage(List<JSONObject> voices,long installedBytes,long partialBytes){
            List<String> ids=new ArrayList<>(),names=new ArrayList<>();
            for(JSONObject v:voices){ids.add(v.optString("id"));names.add(v.optString("nom"));}
            this.ids=List.copyOf(ids);this.names=List.copyOf(names);this.installedBytes=installedBytes;this.partialBytes=partialBytes;
        }
    }
    private boolean modelOnDisk(JSONObject v){
        VoicePacks.Spec spec=pack(v);
        return spec==null?onnx(v).length()>1024*1024&&cfg(v).isFile():packs.installed(spec);
    }
    private File archiveInProgress(JSONObject v){
        VoicePacks.Spec spec=pack(v);
        return spec==null?part(onnx(v).getName()+".part"):packs.partial(spec);
    }
    List<VoiceStorage> voiceStorage(){
        Map<String,List<JSONObject>> groups=new LinkedHashMap<>();
        for(JSONObject v:voices)groups.computeIfAbsent(engine(v)+":"+model(v),k->new ArrayList<>()).add(v);
        List<VoiceStorage> out=new ArrayList<>();
        for(List<JSONObject> group:groups.values()){
            JSONObject v=group.get(0);VoicePacks.Spec spec=pack(v);
            boolean installed=modelOnDisk(v);
            long complete=installed?(spec!=null?spec.installedBytes:onnx(v).length()+cfg(v).length()):0;
            long partial=archiveInProgress(v).length()+(!installed&&spec==null?cfg(v).length():0);
            if(complete==0&&partial==0)continue;
            out.add(new VoiceStorage(group,complete,partial));
        }
        return out;
    }
    /** À appeler dans la file des opérations vocales, après confirmation. Garde tout modèle installé. */
    void discardPartial(String id)throws IOException {
        JSONObject v=voice(id);if(v==null)return;
        Files.deleteIfExists(archiveInProgress(v).toPath());
        if(pack(v)==null&&!modelOnDisk(v))Files.deleteIfExists(cfg(v).toPath());
    }
    private JSONObject deployed(JSONObject v){JSONArray a=catalogue==null?new JSONArray():array(catalogue,"voix");for(int i=0;i<a.length();i++){
        JSONObject entry=a.optJSONObject(i);if(entry!=null&&entry.optString("id").equals(v.optString("id")))return entry;}return new JSONObject();}
    long size(JSONObject v){
        VoicePacks.Spec spec=pack(v);if(spec!=null)return spec.bytes;
        JSONObject source=deployed(v),part=array(source,"parts").optJSONObject(0);
        long bytes=part==null?0:part.optLong("taille")+source.optLong("tailleConfig",6000);
        return bytes>0?bytes:installed(v)?onnx(v).length()+cfg(v).length():0;
    }
    String attribution(JSONObject v){
        VoicePacks.Spec spec=pack(v);
        if(spec==VoicePacks.ESTELLE)return "Kyutai Pocket TTS et voix Estelle · CC BY 4.0 · ONNX par Okuvia";
        if(spec==VoicePacks.KOKORO)return "Kokoro / Sherpa-ONNX · Apache-2.0 · SIWIS French Speech Synthesis Database, University of Edinburgh · CC BY 4.0";
        if(model(v).equals("siwis"))return "SIWIS French Speech Synthesis Database · University of Edinburgh · CC BY 4.0";
        return deployed(v).optString("attribution","rhasspy/piper-voices");
    }
    private static HttpURLConnection connect(String name,long start)throws IOException {
        if(!name.matches("[a-z]+\\.onnx(?:\\.json)?|index\\.json"))throw new IOException("Fichier HD non reconnu.");
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+name).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(4500);
        c.setRequestProperty("Accept-Encoding","identity");if(start>0)c.setRequestProperty("Range","bytes="+start+"-");return c;
    }
    void download(String id,Progress progress)throws IOException {
        if(!supported())throw new IOException("Runtime ONNX Android absent.");
        JSONObject v=voice(id);if(v==null)throw new IOException("Voix Lectura HD inconnue : "+id);
        if(installed(v))return;
        VoicePacks.Spec spec=pack(v);if(spec!=null){packs.download(spec,progress);return;}
        if(catalogue==null){HttpURLConnection c=connect("index.json",0);try{
            if(c.getResponseCode()!=200)throw new IOException("Catalogue Lectura HD : HTTP "+c.getResponseCode());
            try(InputStream in=c.getInputStream()){catalogue=parse(new String(Refs.read(in,350000),StandardCharsets.UTF_8));Library.writeJson(part("index.json"),catalogue);}
        }finally{c.disconnect();}}
        JSONObject entry=deployed(v),p=array(entry,"parts").optJSONObject(0);
        if(p==null||array(entry,"parts").length()!=1||!p.optString("fichier").equals(onnx(v).getName())||!entry.optString("config").equals(cfg(v).getName()))
            throw new IOException("Le catalogue Pages a changé pour « "+v.optString("nom")+" ».");
        long n=p.optLong("taille");if(n<1024*1024||n>LIMIT)throw new IOException("Taille du modèle Lectura HD invalide.");
        if(!cfg(v).isFile()){
            HttpURLConnection c=connect(cfg(v).getName(),0);try{
                if(c.getResponseCode()!=200)throw new IOException("Configuration HD : HTTP "+c.getResponseCode());
                try(InputStream in=c.getInputStream()){
                    JSONObject data=parse(new String(Refs.read(in,700_000),StandardCharsets.UTF_8));
                    if(!data.has("phoneme_id_map")||!data.has("audio")||!data.has("inference"))throw new IOException("Configuration Piper invalide.");
                    Library.writeJson(cfg(v),data);
                }
            }finally{c.disconnect();}
        }
        File target=onnx(v),temp=part(target.getName()+".part");long from=temp.length();if(from>n){temp.delete();from=0;}
        if(from<n){
            if(n-from+16*1024*1024>models.getUsableSpace())throw new IOException("Espace insuffisant pour la voix Lectura HD.");
            HttpURLConnection c=connect(target.getName(),from);try{
                int status=c.getResponseCode();if(status!=200&&status!=206)throw new IOException("Téléchargement HD : HTTP "+status);
                if(status==200)from=0;else if(!String.valueOf(c.getHeaderField("Content-Range")).startsWith("bytes "+from+"-"))throw new IOException("Reprise de téléchargement invalide.");
                if(from>0)progress.update(from,n);
                byte[] b=new byte[64*1024];long position=from,last=from;
                try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(temp,from>0)){
                    for(int k;(k=in.read(b))!=-1;){Pcm.interrupted();if((position+=k)>n){temp.delete();throw new IOException("Modèle HD incomplet ou taille modifiée.");}out.write(b,0,k);
                        if(position-last>=256*1024||position==n){progress.update(position,n);last=position;}}
                }
            }finally{c.disconnect();}
        }
        if(temp.length()!=n)throw new IOException("Téléchargement interrompu : reprends l’installation de la voix.");
        String expected=p.optString("sha256");if(!expected.isEmpty()&&!expected.equalsIgnoreCase(digest(temp))){temp.delete();throw new IOException("Modèle Piper corrompu : "+target.getName());}
        Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);progress.update(n,n);
    }
    void remove(String id){JSONObject v=voice(id);if(v==null)return;if(loaded.equals(model(v)))close();VoicePacks.Spec spec=pack(v);if(spec!=null){packs.remove(spec);return;}onnx(v).delete();part(onnx(v).getName()+".part").delete();cfg(v).delete();}
    void removeAll(){close();for(File dir:new File[]{models,phrases,whole}){File[] all=dir.listFiles();if(all!=null)for(File f:all)VoicePacks.erase(f);}l1.clear();l1Bytes=0;}
    private String digest(File file)throws IOException {try(InputStream in=new BufferedInputStream(new FileInputStream(file))){MessageDigest sha=hash("SHA-256");byte[] b=new byte[65536];
        for(int n;(n=in.read(b))!=-1;){Pcm.interrupted();sha.update(b,0,n);}return hex(sha.digest());}}
    private static MessageDigest hash(String alg){try{return MessageDigest.getInstance(alg);}catch(Exception e){throw new IllegalStateException(e);}}
    private static String hex(byte[] b){char[] hex="0123456789abcdef".toCharArray(),s=new char[b.length*2];for(int i=0;i<b.length;i++){s[i*2]=hex[(b[i]&255)>>>4];s[i*2+1]=hex[b[i]&15];}return new String(s);}
    private static String key(String alg,String s){return hex(hash(alg).digest(s.getBytes(StandardCharsets.UTF_8)));}
    private void remember(String key,float[] pcm){
        float[] prev=l1.put(key,pcm);l1Bytes+=4L*(pcm.length-(prev==null?0:prev.length));while(l1Bytes>8*1024*1024&&l1.size()>1){String first=l1.keySet().iterator().next();l1Bytes-=4L*l1.remove(first).length;}}
    private float[] phrase(JSONObject v,String text,JSONObject config)throws Exception {
        boolean estelle=pack(v)==VoicePacks.ESTELLE;
        String id=key("SHA-1",(estelle?"phrase-mimi-4|":pack(v)==null?"phrase-piper-fr-5|":"phrase-4|")+v.optString("id")+"|"+text);float[] out=l1.get(id);if(out!=null)return out;
        File f=new File(phrases,id+".f32");long bytes=f.length();
        int stride=estelle?Mimi.SAMPLES_PER_LATENT*4:4,limit=estelle?Mimi.MAX_FRAMES*stride:64*1024*1024;
        if(bytes>0&&bytes%stride==0&&bytes<=limit){try(InputStream in=new FileInputStream(f)){
            byte[] raw=Refs.read(in,limit);out=new float[raw.length/4];ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(out);
            f.setLastModified(System.currentTimeMillis());remember(id,out);return out;
        }catch(IOException e){f.delete();}}
        ensureLoaded(v);
        if(pocket!=null)out=pocket.generate(text);
        else if(kokoro!=null)out=kokoro.generate(text);
        else {
            String ph=g2p.phrase(text,v.optString("id").equals("siwis"));
            out=ph.isEmpty()?new float[0]:ort.synth(G2p.ids(ph,object(config,"phoneme_id_map")),object(config,"inference"),1,
                config.optInt("num_speakers",1)>1?v.optInt("speakerId",config.optInt("default_speaker_id",0)):-1);
        }
        for(float sample:out)if(!Float.isFinite(sample))throw new IOException("La voix a produit un signal non fini.");
        if(out.length*4L>64*1024*1024)throw new IOException("Phrase trop longue pour la synthèse Lectura HD.");
        remember(id,out);
        Pcm.interrupted(); // A finished fragment can be reused; no I/O or further inference after cancellation.
        File part=new File(phrases,f.getName()+".part");
        try {
            try(FileOutputStream data=new FileOutputStream(part)){ByteBuffer b=ByteBuffer.allocate(16384).order(ByteOrder.LITTLE_ENDIAN);for(float x:out){b.putFloat(x);if(!b.hasRemaining()){data.write(b.array());b.clear();}}
                if(b.position()>0)data.write(b.array(),0,b.position());}
            Files.move(part.toPath(),f.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        }catch(IOException ignored){ /* The cache is optional; keep the complete samples in memory. */ }
        finally{part.delete();}
        prune(phrases,".f32",Integer.MAX_VALUE,PHRASE_LIMIT);return out;
    }
    private static void prune(File dir,String extension,int count,long bytes){
        File[] f=dir.listFiles((d,n)->n.endsWith(extension));if(f==null)return;
        Arrays.sort(f,Comparator.comparingLong(File::lastModified).reversed());long size=0;
        for(int i=0;i<f.length;i++)if((size+=f[i].length())>bytes||i>=count){if(extension.equals(".wav"))new File(dir,f[i].getName().replace(".wav",".json")).delete();f[i].delete();}
    }
    private void ensureLoaded(JSONObject voice)throws Exception {
        if(loaded.equals(model(voice)))return;
        close();Pcm.interrupted();VoicePacks.Spec spec=pack(voice);
        try {
            if(spec==VoicePacks.ESTELLE)pocket=new Pocket(packs.path(spec));
            else if(spec==VoicePacks.KOKORO)kokoro=new Kokoro(packs.path(spec),g2p);
            else ort=new Ort(onnx(voice));
            loaded=model(voice);
        }catch(LinkageError e){close();throw new IOException("Runtime vocal indisponible sur ce processeur.",e);}
    }
    void preload(String id)throws Exception {JSONObject v=voice(id);if(installed(v))ensureLoaded(v);}
    void prewarm(String text,String id)throws Exception {
        JSONObject v=voice(id);if(!installed(v))return;
        boolean piper=pack(v)==null;
        JSONObject config=piper?Library.readJson(cfg(v)):null;int n=0,chars=0;
        for(SpeechPlan.Fragment p:SpeechPlan.plan(text,"fr",object(pronunciation,"fr"))){
            Pcm.interrupted();
            if(p.spoken.isEmpty())continue;
            if((chars+=p.spoken.length())>WARM_CHARS)break;
            phrase(v,p.spoken,config);
            if(++n>=(piper?PIPER_WARM_PHRASES:1))break;
        }
    }
    Synthesis synth(String text,String id,int cps,Progress progress)throws Exception {
        if(text.length()>SpeechPlan.MAX_TEXT)throw new IOException("Texte trop long pour la synthèse.");
        JSONObject v=voice(id);if(!installed(v))throw new IOException("Voix HD non installée.");
        VoicePacks.Spec spec=pack(v);boolean estelle=spec==VoicePacks.ESTELLE;
        String key=key("SHA-256",(estelle?"rendu-mimi-6|":"rendu-6|")+id+"|"+cps+"|"+text);
        File wav=new File(whole,key+".wav"),json=new File(whole,key+".json");
        JSONObject config=spec==null?Library.readJson(cfg(v)):null;
        int rate=estelle?Pocket.RATE:config==null?24000:object(config,"audio").optInt("sample_rate",22050);
        List<SpeechPlan.Fragment> plan=SpeechPlan.plan(text,"fr",object(pronunciation,"fr"));
        Synthesis saved=VoiceRender.cached(wav,json,plan,rate,progress);if(saved!=null)return saved;
        Synthesis result=VoiceRender.render(whole,wav,json,plan,rate,cps,
            estelle?VoiceRender.Profile.ESTELLE:id.equals("siwis")?VoiceRender.Profile.SIWIS:VoiceRender.Profile.STANDARD,
            w->phrase(v,w,config),progress);
        prune(whole,".wav",6,Pcm.MAX_BYTES);return result;
    }
    @Override public void close(){
        if(ort!=null){ort.close();ort=null;}
        if(pocket!=null){pocket.close();pocket=null;}
        if(kokoro!=null){kokoro.close();kokoro=null;}
        loaded="";
    }

    /** Official Java API through a narrow boundary: the SDK-only checkpoint can be built without the AAR. */
    private static final class Ort implements AutoCloseable {
        final Object environment,session;final Class<?> envType, tensorType;final Method run;
        Ort(File file)throws Exception {
            try{
                envType=Class.forName("ai.onnxruntime.OrtEnvironment");tensorType=Class.forName("ai.onnxruntime.OnnxTensor");
                Class<?> options=Class.forName("ai.onnxruntime.OrtSession$SessionOptions");environment=envType.getMethod("getEnvironment").invoke(null);
                AutoCloseable opts=(AutoCloseable)options.getConstructor().newInstance();try(AutoCloseable acquire=opts){
                    options.getMethod("setIntraOpNumThreads",int.class).invoke(opts,1);
                    options.getMethod("setInterOpNumThreads",int.class).invoke(opts,1);
                    session=envType.getMethod("createSession",String.class,options).invoke(environment,file.getPath(),opts);
                }
                run=Class.forName("ai.onnxruntime.OrtSession").getMethod("run",Map.class);
            }catch(InvocationTargetException e){throw new IOException("ONNX : "+e.getCause(),e.getCause());}
            catch(LinkageError e){throw new IOException("Runtime ONNX indisponible pour ce processeur.",e);}
        }
        float[] synth(long[] ids,JSONObject options,float rate,int speaker)throws Exception {
            Map<String,Object> input=new HashMap<>();try{
                input.put("input",ints(ids,new long[]{1,ids.length}));input.put("input_lengths",ints(new long[]{ids.length},new long[]{1}));
                float[] scale={(float)options.optDouble("noise_scale",.667),(float)(options.optDouble("length_scale",1)/rate),(float)options.optDouble("noise_w",.8)};
                input.put("scales",tensorType.getMethod("createTensor",envType,FloatBuffer.class,long[].class).invoke(null,environment,FloatBuffer.wrap(scale),new long[]{3}));
                if(speaker>=0)input.put("sid",ints(new long[]{speaker},new long[]{1}));
                try(AutoCloseable result=(AutoCloseable)run.invoke(session,input)){
                    Object output=result.getClass().getMethod("get",int.class).invoke(result,0);
                    FloatBuffer f=(FloatBuffer)tensorType.getMethod("getFloatBuffer").invoke(output);float[] a=new float[f.remaining()];f.get(a);return a;
                }
            }catch(InvocationTargetException e){throw new IOException("ONNX : "+e.getCause(),e.getCause());}
            finally{for(Object o:input.values())((AutoCloseable)o).close();}
        }
        private Object ints(long[] values,long[] shape)throws Exception{return tensorType.getMethod("createTensor",envType,LongBuffer.class,long[].class).invoke(null,environment,LongBuffer.wrap(values),shape);}
        @Override public void close(){try{((AutoCloseable)session).close();}catch(Exception ignored){}}
    }
}
