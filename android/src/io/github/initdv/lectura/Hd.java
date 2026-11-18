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
import java.io.RandomAccessFile;
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

/** Piper VITS: the five model files and ten voices used by Pages. Never downloads on launch. */
final class Hd implements AutoCloseable {
    private static final String BASE="https://initdv.github.io/Lectura/models/";
    private static final long LIMIT=150L*1024*1024,PHRASE_LIMIT=80L*1024*1024;
    final List<JSONObject> voices=new ArrayList<>();
    private final File models,phrases,whole;
    private final G2p g2p;
    private final Map<String,float[]> l1=new LinkedHashMap<>(16,.75f,true);
    private long l1Bytes;
    private Ort ort;
    private String loaded="";
    private JSONObject catalogue;
    interface Progress {void update(long value,long total);}
    static final class Synthesis {
        final Pcm pcm;final List<Script.Segment> segments;
        Synthesis(Pcm pcm,List<Script.Segment> segments){this.pcm=pcm;this.segments=segments;}
    }
    Hd(Refs refs){
        Context context=refs.context;models=Library.dir(context.getFilesDir(),"models");phrases=Library.dir(context.getCacheDir(),"phrases");whole=Library.dir(context.getCacheDir(),"synthese");
        JSONArray data=array(refs.json("hd-voices.json"),"voices");
        for(int i=0;i<data.length();i++)voices.add(data.optJSONObject(i));g2p=new G2p(refs.json("g2p.json"));
        try{catalogue=Library.readJson(new File(models,"index.json"));}catch(Exception ignored){try{catalogue=refs.json("hd-index.json");}catch(Exception ignored2){}}
    }
    static boolean supported(){try{Class.forName("ai.onnxruntime.OrtEnvironment",false,Hd.class.getClassLoader());return true;}catch(ClassNotFoundException e){return false;}}
    JSONObject voice(String id){for(JSONObject v:voices)if(v.optString("id").equals(id))return v;return null;}
    private String model(JSONObject voice){return voice.optString("modele");}
    private File part(String name){return new File(models,name);}
    private File onnx(JSONObject v){return part(model(v)+".onnx");}
    private File cfg(JSONObject v){return part(model(v)+".onnx.json");}
    boolean installed(JSONObject v){return v!=null&&onnx(v).length()>1024*1024&&cfg(v).isFile();}
    List<JSONObject> installed(){List<JSONObject> out=new ArrayList<>();if(supported())for(JSONObject v:voices)if(installed(v))out.add(v);return out;}
    private JSONObject deployed(JSONObject v){JSONArray a=catalogue==null?new JSONArray():array(catalogue,"voix");for(int i=0;i<a.length();i++){
        JSONObject entry=a.optJSONObject(i);if(entry!=null&&entry.optString("id").equals(v.optString("id")))return entry;}return new JSONObject();}
    long size(JSONObject v){long s=array(deployed(v),"parts").optJSONObject(0)==null?0:array(deployed(v),"parts").optJSONObject(0).optLong("taille")+6000;
        return s>0?s:installed(v)?onnx(v).length()+cfg(v).length():0;}
    private static HttpURLConnection connect(String name,long start)throws IOException {
        if(!name.matches("[a-z]+\\.onnx(?:\\.json)?|index\\.json"))throw new IOException("Fichier HD non reconnu.");
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+name).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(4500);
        c.setRequestProperty("Accept-Encoding","identity");if(start>0)c.setRequestProperty("Range","bytes="+start+"-");return c;
    }
    void download(String id,Progress progress)throws IOException {
        if(!supported())throw new IOException("Runtime ONNX Android absent.");
        JSONObject v=voice(id);if(v==null)throw new IOException("Voix Lectura HD inconnue : "+id);
        if(installed(v))return;
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
                byte[] b=new byte[64*1024];long position=from,last=0;
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
    void remove(String id){JSONObject v=voice(id);if(v==null)return;if(loaded.equals(model(v)))close();onnx(v).delete();part(onnx(v).getName()+".part").delete();cfg(v).delete();}
    void removeAll(){close();for(File dir:new File[]{models,phrases,whole}){File[] all=dir.listFiles();if(all!=null)for(File f:all)f.delete();}l1.clear();l1Bytes=0;}
    private String digest(File file)throws IOException {try(InputStream in=new BufferedInputStream(new FileInputStream(file))){MessageDigest sha=hash("SHA-256");byte[] b=new byte[65536];
        for(int n;(n=in.read(b))!=-1;){Pcm.interrupted();sha.update(b,0,n);}return hex(sha.digest());}}
    private static MessageDigest hash(String alg){try{return MessageDigest.getInstance(alg);}catch(Exception e){throw new IllegalStateException(e);}}
    private static String hex(byte[] b){char[] hex="0123456789abcdef".toCharArray(),s=new char[b.length*2];for(int i=0;i<b.length;i++){s[i*2]=hex[(b[i]&255)>>>4];s[i*2+1]=hex[b[i]&15];}return new String(s);}
    private static String key(String alg,String s){return hex(hash(alg).digest(s.getBytes(StandardCharsets.UTF_8)));}
    private void remember(String key,float[] pcm){
        float[] prev=l1.put(key,pcm);l1Bytes+=4L*(pcm.length-(prev==null?0:prev.length));while(l1Bytes>8*1024*1024&&l1.size()>1){String first=l1.keySet().iterator().next();l1Bytes-=4L*l1.remove(first).length;}}
    private float[] phrase(JSONObject v,String text,JSONObject config,float speed,int rate)throws Exception {
        String id=key("SHA-1","v1|"+v.optString("id")+"|"+speed+"|"+text);float[] out=l1.get(id);if(out!=null)return out;
        File f=new File(phrases,id+".f32");if(f.length()>0&&f.length()%4==0&&f.length()<64*1024*1024){try(InputStream in=new FileInputStream(f)){
            byte[] raw=Refs.read(in,64*1024*1024);out=new float[raw.length/4];ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(out);
            f.setLastModified(System.currentTimeMillis());remember(id,out);return out;
        }catch(IOException e){f.delete();}}
        if(ort==null||!loaded.equals(model(v))){close();ort=new Ort(onnx(v));loaded=model(v);}
        String ph=g2p.phrase(text);out=ph.isEmpty()?new float[0]:ort.synth(G2p.ids(ph,object(config,"phoneme_id_map")),object(config,"inference"),speed,config.optInt("num_speakers",1)>1?v.optInt("speakerId",config.optInt("default_speaker_id",0)):-1);
        if(out.length==0)out=new float[(int)Math.round(rate*.3)];
        if(out.length*4L>64*1024*1024)throw new IOException("Phrase trop longue pour la synthèse Lectura HD.");
        remember(id,out);
        try(FileOutputStream data=new FileOutputStream(f)){ByteBuffer b=ByteBuffer.allocate(16384).order(ByteOrder.LITTLE_ENDIAN);for(float x:out){b.putFloat(x);if(!b.hasRemaining()){data.write(b.array());b.clear();}}
            if(b.position()>0)data.write(b.array(),0,b.position());}catch(IOException e){f.delete();}
        prune(phrases,".f32",Integer.MAX_VALUE,PHRASE_LIMIT);return out;
    }
    private static void prune(File dir,String extension,int count,long bytes){
        File[] f=dir.listFiles((d,n)->n.endsWith(extension));if(f==null)return;
        Arrays.sort(f,Comparator.comparingLong(File::lastModified).reversed());long size=0;
        for(int i=0;i<f.length;i++)if((size+=f[i].length())>bytes||i>=count){if(extension.equals(".wav"))new File(dir,f[i].getName().replace(".wav",".json")).delete();f[i].delete();}
    }
    void prewarm(String text,String id,float speed)throws Exception {
        JSONObject v=voice(id);if(!installed(v))return;JSONObject config=Library.readJson(cfg(v));int rate=object(config,"audio").optInt("sample_rate",22050),n=0;
        for(Script.Segment p:Script.split(text)){Pcm.interrupted();if(p.type==Script.SPOKEN){phrase(v,p.text,config,speed,rate);if(++n>=5)break;}}
    }
    Synthesis synth(String text,String id,float speed,int cps,Progress progress)throws Exception {
        if(text.length()>12000)throw new IOException("12000");
        JSONObject v=voice(id);if(!installed(v))throw new IOException("voix HD non installée");
        String key=key("SHA-256","v1|"+id+"|"+speed+"|"+cps+"|"+text);File wav=new File(whole,key+".wav"),json=new File(whole,key+".json");
        JSONObject config=Library.readJson(cfg(v));int rate=object(config,"audio").optInt("sample_rate",22050);if(rate<8000||rate>48000)throw new IOException("Fréquence Piper invalide.");
        if(wav.length()>44&&json.isFile())try{List<Script.Segment> saved=Script.locate(text,array(Library.readJson(json),"segments"),true);
            if(saved!=null){progress.update(1,1);return new Synthesis(new Pcm(wav,1,rate,(wav.length()-44)/2,false),saved);}}catch(Exception ignored){}
        List<Script.Segment> parts=Script.split(text);if(parts.isEmpty())throw new IOException("Texte vide.");
        File raw=File.createTempFile("piper-",".f32",whole),staging=File.createTempFile("piper-",".part",whole);
        long frames=0;float peak=0;try{
            try(RandomAccessFile out=new RandomAccessFile(raw,"rw")){
                ByteBuffer b=ByteBuffer.allocate(16384).order(ByteOrder.LITTLE_ENDIAN);byte[] blank=new byte[16384];
                for(int i=0;i<parts.size();i++){
                    Pcm.interrupted();Script.Segment p=parts.get(i),next=i+1<parts.size()?parts.get(i+1):null;double pause=next==null?.15:text.substring(p.end,next.start).contains("\n")?.45:.22;
                    p.from=Math.round(frames*1000./rate);long extra=Math.round(rate*pause/Math.max(.5,speed));progress.update(i,parts.size());
                    if(p.type==Script.SPOKEN){float[] x=phrase(v,p.text,config,speed,rate);frames+=x.length;
                        for(float value:x){peak=Math.max(peak,Math.abs(value));b.putFloat(value);if(!b.hasRemaining()){out.write(b.array());b.clear();}}
                        if(b.position()>0){out.write(b.array(),0,b.position());b.clear();}
                    }else extra+=Math.round(rate*(double)p.text.length()/(cps*speed));
                    frames+=extra;if(4*frames>Pcm.MAX_BYTES)throw new IOException("Synthèse trop volumineuse.");long gap=extra*4;
                    while(gap>0){int n=(int)Math.min(gap,blank.length);out.write(blank,0,n);gap-=n;}p.to=Math.round(frames*1000./rate);
                }
            }
            float gain=peak>.001?Math.min(4,.9f/peak):1;
            try(RandomAccessFile in=new RandomAccessFile(raw,"r");RandomAccessFile out=new RandomAccessFile(staging,"rw")){
                Pcm.header(out,1,rate,frames*2);
                ByteBuffer b=ByteBuffer.allocate(16384).order(ByteOrder.LITTLE_ENDIAN),dest=ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN);
                for(long pos=0;pos<frames;){Pcm.interrupted();int count=(int)Math.min(4096,frames-pos);in.readFully(b.array(),0,count*4);b.clear();dest.clear();
                    for(int i=0;i<count;i++)dest.putShort(Pcm.sample(b.getFloat()*gain));out.write(dest.array(),0,count*2);pos+=count;}
            }
            Files.move(staging.toPath(),wav.toPath(),StandardCopyOption.REPLACE_EXISTING);Library.writeJson(json,put(new JSONObject(),"segments",Script.encode(parts)));
            prune(whole,".wav",6,Long.MAX_VALUE);progress.update(parts.size(),parts.size());return new Synthesis(new Pcm(wav,1,rate,frames,false),parts);
        }finally{raw.delete();staging.delete();}
    }
    @Override public void close(){if(ort!=null){ort.close();ort=null;}loaded="";}

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
