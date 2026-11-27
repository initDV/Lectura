package io.github.initdv.lectura;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/** Assemble every native engine's fragment PCM on the same presentation clock, at 1×. */
final class VoiceRender {
    static final float PACK_PEAK=.70794576f; // -3 dBFS of headroom for output resampling.
    enum Profile {
        STANDARD(false), SIWIS(false), PACK(true), ESTELLE(true);
        final boolean keepEdges;
        Profile(boolean keepEdges){this.keepEdges=keepEdges;}
    }
    private VoiceRender(){}
    @FunctionalInterface interface Renderer {float[] generate(String text)throws Exception;}

    static Hd.Synthesis cached(File wav,File timings,List<SpeechPlan.Fragment> plan,int rate,Hd.Progress progress) {
        if(wav.length()<=44||!timings.isFile())return null;
        try{
            long frames=Pcm.mono16Frames(wav,rate);
            JSONArray rows=Library.readJson(timings).getJSONArray("spans");
            if(rows.length()!=plan.size())return null;
            List<Script.Segment> parts=new ArrayList<>();
            long previous=0;
            for(int i=0;i<plan.size();i++) {
                JSONArray row=rows.getJSONArray(i);Script.Segment p=plan.get(i).original;
                p.from=row.getLong(0);p.speechEnd=row.getLong(1);p.to=row.getLong(2);
                if(p.from!=previous||p.speechEnd<p.from||p.to<p.speechEnd)return null;
                previous=p.to;parts.add(p);
            }
            if(previous!=ms(frames,rate))return null;
            wav.setLastModified(System.currentTimeMillis());progress.update(1,1);
            return new Hd.Synthesis(new Pcm(wav,1,rate,frames,false),parts);
        }catch(Exception e){return null;}
    }

    static Hd.Synthesis render(File dir,File wav,File timings,List<SpeechPlan.Fragment> plan,int rate,int cps,
                               Renderer renderer,Hd.Progress progress)throws Exception {
        return render(dir,wav,timings,plan,rate,cps,Profile.STANDARD,renderer,progress);
    }
    static Hd.Synthesis render(File dir,File wav,File timings,List<SpeechPlan.Fragment> plan,int rate,int cps,
                               Profile profile,Renderer renderer,Hd.Progress progress)throws Exception {
        if(plan.isEmpty())throw new IOException("Aucun texte à lire.");
        if(rate<8000||rate>48000)throw new IOException("Fréquence de synthèse invalide.");
        List<Script.Segment> parts=new ArrayList<>();JSONArray times=new JSONArray();
        File temp=File.createTempFile("synthese-",".part",dir);boolean keep=false;long frames=0;
        try {
            try(RandomAccessFile out=new RandomAccessFile(temp,"rw")) {
                out.seek(44);byte[] silence=new byte[16384];ByteBuffer pcm=ByteBuffer.allocate(16384).order(ByteOrder.LITTLE_ENDIAN);
                for(int i=0;i<plan.size();i++) {
                    Pcm.interrupted();SpeechPlan.Fragment fragment=plan.get(i);Script.Segment p=fragment.original;
                    p.from=ms(frames,rate);progress.update(i,plan.size());
                    if(!fragment.spoken.isEmpty()) {
                        float[] samples=renderer.generate(fragment.spoken);
                        int[] span=audible(samples,rate);
                        int begin=span[0],end=span[1];
                        if(profile.keepEdges){
                            // Preserve low-energy fricatives/releases next to the speech, without retaining silent model padding.
                            int guard=rate*40/1000;
                            begin=Math.max(0,begin-guard);end=Math.min(samples.length,end+guard);
                            while(begin<span[0]&&Math.abs(samples[begin])<.00006f)begin++;
                            while(end>span[1]&&Math.abs(samples[end-1])<.00006f)end--;
                        }
                        if(fragment.closedQuestion){
                            float[] prosody=QuestionPitch.adjust(samples,span[0],span[1],rate,profile==Profile.SIWIS?70:0);
                            end+=prosody.length-samples.length;samples=prosody;
                        }
                        if((frames+end-begin)*2>Pcm.MAX_BYTES)throw new IOException("Synthèse trop volumineuse.");
                        if(profile==Profile.ESTELLE){
                            samples=estellePresence(samples,begin,end,rate);
                            begin=0;end=samples.length;
                        }
                        float gain=profile.keepEdges?headroom(samples,begin,end):1;
                        int fade=Math.max(1,rate/400); // 2.5 ms de raccord sans clic, sans allonger les silences.
                        pcm.clear();
                        for(int j=begin;j<end;j++) {
                            float edge=Math.min(1,Math.min(j-begin+1,end-j)/(float)fade);
                            pcm.putShort(Pcm.sample(samples[j]*gain*edge));
                            if(!pcm.hasRemaining()){out.write(pcm.array());pcm.clear();}
                        }
                        if(pcm.position()>0)out.write(pcm.array(),0,pcm.position());
                        frames+=end-begin;
                    } else if(p.type==Script.COMMAND||p.type==Script.COMMENT) {
                        long count=Math.round(rate*(double)p.text.length()/Math.max(1,cps));
                        zeros(out,silence,count);frames+=count;
                    }
                    p.speechEnd=ms(frames,rate);
                    long gap=profile==Profile.SIWIS?Math.round(siwisPause(fragment.pauseMs)*rate/1000.):fragment.pauseFrames(rate);zeros(out,silence,gap);frames+=gap;
                    p.to=ms(frames,rate);parts.add(p);times.put(new JSONArray().put(p.from).put(p.speechEnd).put(p.to));
                }
                if(frames==0)throw new IOException("Aucun son n’a été synthétisé.");
                Pcm.header(out,1,rate,frames*2);
            }
            Pcm.interrupted();progress.update(plan.size(),plan.size());
            if(wav==null){Hd.Synthesis s=new Hd.Synthesis(new Pcm(temp,1,rate,frames,true),parts);keep=true;return s;}
            Files.move(temp.toPath(),wav.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            Library.writeJson(timings,Refs.put(new JSONObject(),"spans",times));
            return new Hd.Synthesis(new Pcm(wav,1,rate,frames,false),parts);
        }finally{if(!keep)temp.delete();}
    }
    // Natural French dialogue pacing, limited to Siwis. Keep command/paragraph and question margins.
    static int siwisPause(int ms){switch(ms){case 140:return 105;case 320:return 300;case 400:return 320;default:return ms;}}
    private static void zeros(RandomAccessFile file,byte[] blank,long count)throws IOException {
        long bytes=count*2;
        if(file.getFilePointer()+bytes>Pcm.MAX_BYTES)throw new IOException("Synthèse trop volumineuse.");
        while(bytes>0){Pcm.interrupted();int n=(int)Math.min(bytes,blank.length);file.write(blank,0,n);bytes-=n;}
    }
    private static long ms(long frames,int rate){return Math.round(frames*1000./rate);}

    // Mix +5% of a unity-gain band-pass around 3 kHz into Estelle, not +5% of the whole signal.
    // No resampling, dynamics or change to the cached phrase; this is done before the existing peak guard.
    private static float[] estellePresence(float[] samples,int begin,int end,int rate){
        double omega=2*Math.PI*3000/rate,alpha=Math.sin(omega)/(2*.95),norm=1/(1+alpha);
        double b=alpha*norm,a1=-2*Math.cos(omega)*norm,a2=(1-alpha)*norm;
        float[] out=new float[end-begin];
        double x1=samples[begin],x2=x1,y1=0,y2=0;
        for(int i=0;i<out.length;i++){
            if((i&16383)==0)Pcm.interrupted();
            double x=samples[begin+i],band=b*(x-x2)-a1*y1-a2*y2;
            out[i]=(float)(x+.05*band);
            x2=x1;x1=x;y2=y1;y1=band;
        }
        return out;
    }

    static float headroom(float[] a,int start,int end)throws IOException {
        float peak=0;
        for(int i=start;i<end;i++) {
            if(!Float.isFinite(a[i]))throw new IOException("Échantillon non fini après traitement de la voix.");
            peak=Math.max(peak,Math.abs(a[i]));
        }
        return peak>PACK_PEAK?PACK_PEAK/peak:1;
    }

    static int[] audible(float[] a,int rate)throws IOException {
        if(a.length<rate/100||a.length>rate*90)throw new IOException("Durée de phrase invalide.");
        float peak=0;
        for(float v:a){if(!Float.isFinite(v))throw new IOException("Échantillon non fini dans la voix.");peak=Math.max(peak,Math.abs(v));}
        if(peak<.003f)throw new IOException("La voix a renvoyé un signal vide.");
        // Energy floor far below voiced speech. Keep quiet consonants; trim only edge padding, never interior pauses.
        float floor=Math.max(.0007f,Math.min(.005f,peak*.008f));int win=Math.max(1,rate/250),b=0,e=a.length;
        while(b+win<e&&rms(a,b,b+win)<floor)b+=win;
        while(e-win>b&&rms(a,e-win,e)<floor)e-=win;
        while(b<e&&Math.abs(a[b])<.00006f)b++;
        while(e>b&&Math.abs(a[e-1])<.00006f)e--;
        if(e-b<rate/100)throw new IOException("La voix n’a pas produit de parole détectable.");
        return new int[]{b,e};
    }
    private static double rms(float[] a,int start,int end){double sum=0;for(int i=start;i<end;i++)sum+=(double)a[i]*a[i];return Math.sqrt(sum/(end-start));}
}
