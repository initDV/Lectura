package io.github.initdv.lectura;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** Prepared on the audio worker, independent of the Canvas and playback frame rate. */
final class AichaTrack {
    final Plan plan;
    final AichaMouth lips;
    final Envelope envelope;

    static boolean matches(JSONObject def){return def!=null&&def.optString("rig").equals("aicha");}
    AichaTrack(Refs refs,String source,List<Script.Segment> segments,double duration,Mood mood,boolean emotions,String lang,G2p.Profile phonesProfile,Pcm pcm){
        var parts=new ArrayList<Part>(segments.size());lips=new AichaMouth();
        G2p french=lang.equals("en")?null:new G2p(refs.json("g2p.json"));
        Script.Segment before=null;
        for(Script.Segment s:segments){
            Pcm.interrupted();boolean spoken=s.type==Script.SPOKEN;
            double end=s.speechEnd<0?s.to:min(s.to,s.speechEnd);
            parts.add(AichaFaces.part(s,before,source,mood.summary(s),emotions));before=s;
            if(spoken&&end>s.from){String phones=french==null?AichaMouth.english(s.text):french.phrase(s.text,phonesProfile);lips.add(phones,s.from,end);}
        }
        plan=AichaMotion.plan(parts,duration,emotions);
        Envelope e=null;
        if(pcm!=null&&duration<=60_000&&pcm.file.length()<=10L*1024*1024){
            try{e=new Envelope(pcm);}catch(IOException ignored){/* A long/unreadable envelope can use the live level. */}
        }
        envelope=e;
    }
    static final class Envelope {
        private final float[] rms;
        private final double frameMs,duration,low,high;
        Envelope(Pcm pcm)throws IOException{
            int step=(int)max(1,round(pcm.rate*16/1000.));frameMs=step*1000./pcm.rate;duration=pcm.duration();
            rms=new float[(int)((pcm.frames+step-1)/step)];double peak=0;
            short[] samples=new short[step*pcm.channels];
            for(int i=0;i<rms.length;i++){
                Pcm.interrupted();int n=pcm.read((long)i*step,samples,step);double amplitude=0;
                for(int c=0;c<pcm.channels;c++){
                    double sum=0;for(int j=0;j<n;j++)sum+=square(samples[j*pcm.channels+c]/32768.);
                    amplitude=max(amplitude,sqrt(sum/n));
                }
                rms[i]=(float)amplitude;peak=max(peak,rms[i]);
            }
            low=bound(peak*.06,.0018,.018);high=max(low*2,peak*.37);
        }
        double level(double ms){
            if(ms<0||ms>=duration||rms.length==0)return 0;
            double u=bound(ms/frameMs-.5,0,rms.length-1);int i=(int)u;
            return smooth(low,high,mix(rms[i],rms[min(i+1,rms.length-1)],u-i));
        }
    }
}
