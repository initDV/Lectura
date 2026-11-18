package io.github.initdv.lectura;

import android.os.Process;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Fixed, public, checksummed voice archives. Only these entries are ever installed. */
final class VoicePacks {
    static final Spec ESTELLE=new Spec("estelle","pocket",193598080,
        "6068d9e5fa2b91c92bda8a3d874c34a3f99799cd5bef45634644b4e37febf718",
        "https://github.com/ByBrawe/Okuvia-models/releases/download/pocket-multilingual-preset-20261026/fr-pocket-tts-202610-preset.zip",
        Map.of("models/flow_lm_main.onnx",302364168,"models/flow_lm_flow.onnx",39081891,"models/mimi_decoder.onnx",41422037,
            "models/text_conditioner.onnx",16388310,"models/tokenizer.model",68071,"voices/estelle.preset",3785492,
            "manifest.json",1286,"MODEL_LICENSE.txt",18657,"VOICE_ATTRIBUTION.md",640));
    static final Spec KOKORO=new Spec("kokoro-siwis","kokoro",132353410,
        "72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653",
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2",
        Map.of("model.int8.onnx",114202993,"voices.bin",28200960,"tokens.txt",687,"LICENSE",11358,"README.md",730));
    private static final String KOKORO_ROOT="kokoro-int8-multi-lang-v1_0/";
    private static final long MIB=1024L*1024;
    private final File models;
    VoicePacks(File models){this.models=models;}
    static final class Spec {
        final String id,engine,sha,url;
        final long bytes,installedBytes;
        final Map<String,Integer> files;
        Spec(String id,String engine,long bytes,String sha,String url,Map<String,Integer> files) {
            this.id=id;this.engine=engine;this.bytes=bytes;this.sha=sha;this.url=url;this.files=files;
            installedBytes=files.values().stream().mapToLong(Integer::longValue).sum();
        }
        boolean supported(){return Hd.supported()&&(this==ESTELLE?Process.is64Bit():Kokoro.supported());}
    }
    static Spec byId(String id){return id.equals(ESTELLE.id)?ESTELLE:id.equals(KOKORO.id)?KOKORO:null;}
    File path(Spec s){return new File(models,s.id+"-1");}
    File partial(Spec s){return new File(models,s.id+"-1.part");}
    boolean installed(Spec s){File dir=path(s);if(!dir.isDirectory())return false;
        for(var e:s.files.entrySet())if(new File(dir,e.getKey()).length()!=e.getValue())return false;
        return true;
    }
    void remove(Spec s){erase(path(s));partial(s).delete();}
    static void erase(File f){File[] children=f.listFiles();if(children!=null)for(File child:children)erase(child);f.delete();}

    void download(Spec s,Hd.Progress progress)throws IOException {
        if(!s.supported())throw new IOException("Moteur de voix indisponible sur cet appareil.");
        if(installed(s))return;
        File archive=partial(s);long start=archive.length();
        if(start>s.bytes){archive.delete();start=0;}
        if(models.getUsableSpace()<s.bytes-start+s.installedBytes+24*MIB)throw new IOException("Espace insuffisant pour télécharger et installer la voix.");
        if(start<s.bytes)transfer(s,archive,start,progress);
        if(archive.length()!=s.bytes)throw new IOException("Téléchargement incomplet : reprends l’installation.");
        if(!s.sha.equals(sha256(archive))){archive.delete();throw new IOException("L’archive vocale a changé ou est corrompue (SHA-256). Aucun modèle installé.");}
        Pcm.interrupted();progress.update(s.bytes,s.bytes);
        File staged=Files.createTempDirectory(models.toPath(),s.id+".install-").toFile();
        try {
            if(s==ESTELLE)zip(s,archive,staged);else tar(s,archive,staged);
            Pcm.interrupted();File target=path(s);erase(target);
            Files.move(staged.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE);
            archive.delete();
        }finally{erase(staged);}
    }
    private static void transfer(Spec s,File to,long start,Hd.Progress progress)throws IOException {
        HttpURLConnection c=connection(s.url,start);
        try {
            int status=c.getResponseCode();
            if(status==200)start=0;
            else if(status!=206||!String.valueOf(c.getHeaderField("Content-Range")).equals("bytes "+start+"-"+(s.bytes-1)+"/"+s.bytes))
                throw new IOException("Téléchargement de la voix : réponse HTTP "+status+" ou reprise invalide.");
            byte[] bytes=new byte[65536];long pos=start,last=start;
            try(InputStream in=new BufferedInputStream(c.getInputStream());FileOutputStream out=new FileOutputStream(to,start>0)) {
                for(int n;(n=in.read(bytes))>=0;) {
                    Pcm.interrupted();if(pos+n>s.bytes)throw new IOException("Taille de l’archive vocale incorrecte.");
                    out.write(bytes,0,n);pos+=n;
                    if(pos-last>=512*1024||pos==s.bytes){progress.update(pos,s.bytes);last=pos;}
                }
            }
        }finally{c.disconnect();}
    }
    private static HttpURLConnection connection(String path,long start)throws IOException {
        URL url=new URL(path);
        for(int redirect=0;redirect<5;redirect++) {
            Pcm.interrupted();String host=url.getHost();
            if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||url.getPort()!=-1&&url.getPort()!=443
                ||!Set.of("github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(host))
                throw new IOException("Adresse de téléchargement non autorisée.");
            HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(16000);c.setReadTimeout(6000);c.setRequestProperty("Accept-Encoding","identity");
            if(start>0)c.setRequestProperty("Range","bytes="+start+"-");
            try {
                int status=c.getResponseCode();if(status<300||status>399)return c;
                String next=c.getHeaderField("Location");if(next==null)throw new IOException("Redirection incomplète.");
                url=new URL(url,next);
            }catch(IOException|RuntimeException e){c.disconnect();throw e;}
            c.disconnect();
        }
        throw new IOException("Trop de redirections pour la voix.");
    }
    static String sha256(File f)throws IOException {
        try(InputStream in=new BufferedInputStream(new FileInputStream(f))) {
            MessageDigest sha=MessageDigest.getInstance("SHA-256");byte[] bytes=new byte[65536];
            for(int n;(n=in.read(bytes))>=0;){Pcm.interrupted();sha.update(bytes,0,n);}
            byte[] hash=sha.digest();StringBuilder hex=new StringBuilder(64);
            for(byte b:hash){hex.append(Character.forDigit((b&255)>>>4,16)).append(Character.forDigit(b&15,16));}return hex.toString();
        }catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private static void zip(Spec s,File archive,File dest)throws IOException {
        try(ZipFile zip=new ZipFile(archive)) {
            for(var e:s.files.entrySet()) {
                ZipEntry item=zip.getEntry(e.getKey());
                if(item==null||item.isDirectory()||item.getSize()!=e.getValue())throw new IOException("Fichier du modèle Estelle invalide : "+e.getKey());
                try(InputStream in=zip.getInputStream(item)){extract(in,dest,e.getKey(),e.getValue());if(in.read()!=-1)throw new IOException("Taille ZIP incohérente.");}
            }
        }
    }
    private static void tar(Spec s,File archive,File dest)throws IOException {
        try(InputStream file=new BufferedInputStream(new FileInputStream(archive));InputStream in=bzip(file)) {
            byte[] header=new byte[512];Set<String> seen=new HashSet<>();long total=0;
            while(readHeader(in,header)&&header[0]!=0) {
                Pcm.interrupted();String name=cString(header,0,100);long size;
                try{String octal=cString(header,124,12).trim();size=Long.parseLong(octal.isEmpty()?"0":octal,8);}
                catch(NumberFormatException e){throw new IOException("En-tête TAR invalide.",e);}
                if(size<0||(total+=((size+511)/512+1)*512)>210*MIB)throw new IOException("Archive Kokoro trop volumineuse.");
                String shortName=name.startsWith(KOKORO_ROOT)?name.substring(KOKORO_ROOT.length()):"";
                Integer expected=s.files.get(shortName);
                if(expected!=null) {
                    if(!seen.add(shortName)||expected!=size||header[156]!='0'&&header[156]!=0)throw new IOException("Entrée Kokoro invalide.");
                    extract(in,dest,shortName,size);
                }else skip(in,size);
                skip(in,(512-size%512)%512);
            }
            if(seen.size()!=s.files.size())throw new IOException("Archive Kokoro incomplète.");
        }
    }
    private static boolean readHeader(InputStream in,byte[] header)throws IOException {
        int pos=0;while(pos<header.length){int n=in.read(header,pos,header.length-pos);if(n<0){if(pos==0)return false;throw new IOException("Archive tronquée.");}pos+=n;}return true;
    }
    private static String cString(byte[] b,int start,int n){int i=0;while(i<n&&b[start+i]!=0)i++;return new String(b,start,i,StandardCharsets.US_ASCII);}
    private static InputStream bzip(InputStream in)throws IOException {
        try{return (InputStream)Class.forName("org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream")
            .getConstructor(InputStream.class).newInstance(in);}
        catch(ReflectiveOperationException|LinkageError e){throw new IOException("Décompression Kokoro indisponible.",e);}
    }
    private static void skip(InputStream in,long size)throws IOException {
        while(size>0){Pcm.interrupted();long n=in.skip(Math.min(size,65536));if(n==0){if(in.read()<0)throw new IOException("Archive tronquée.");n=1;}size-=n;}
    }
    private static void extract(InputStream in,File dir,String name,long size)throws IOException {
        // The name is from our literal allowlist, never a resolved arbitrary archive path.
        File to=new File(dir,name);File parent=to.getParentFile();if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("Stockage de la voix inaccessible.");
        try(FileOutputStream out=new FileOutputStream(to)) {
            byte[] bytes=new byte[65536];long remain=size;
            while(remain>0){Pcm.interrupted();int n=in.read(bytes,0,(int)Math.min(remain,bytes.length));if(n<0)throw new IOException("Archive tronquée.");out.write(bytes,0,n);remain-=n;}
        }
    }
}
