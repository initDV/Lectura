package io.github.initdv.lectura;

import android.speech.tts.Voice;
import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Predicate;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.object;

/** Prepares one scene on the caller's worker; does not schedule or start playback. */
final class AudioPreparation {
    @FunctionalInterface interface Labels {String text(String key,Object... args);}

    static final class Request {
        final Project project;
        final String text,lang;
        final boolean silent,automatic,localReady;
        final List<String> choices;
        final JSONObject personal;
        final Voice systemVoice;
        final File audio,cache;

        Request(Project project,String text,String lang,boolean silent,boolean automatic,List<String> choices,
                JSONObject personal,Voice systemVoice,boolean localReady,File audio,File cache){
            this.project=project;this.text=text;this.lang=lang;this.silent=silent;this.automatic=automatic;
            this.choices=choices;this.personal=personal;this.systemVoice=systemVoice;this.localReady=localReady;
            this.audio=audio;this.cache=cache;
        }
    }

    static final class Result implements AutoCloseable {
        final Pcm pcm;
        final List<Script.Segment> segments;
        final Script.Terminal terminal;
        final Performance performance;
        final AichaTrack aicha;
        final String voiceUsed;

        Result(Pcm pcm,List<Script.Segment> segments,Script.Terminal terminal,Performance performance,AichaTrack aicha,String voiceUsed){
            this.pcm=pcm;this.segments=segments;this.terminal=terminal;this.performance=performance;this.aicha=aicha;this.voiceUsed=voiceUsed;
        }
        @Override public void close(){if(pcm!=null)pcm.close();}
    }

    private final Refs refs;
    private final Hd hd;
    private final Talk talk;

    AudioPreparation(Refs refs,Hd hd,Talk talk){this.refs=refs;this.hd=hd;this.talk=talk;}

    /** The receiver owns the PCM only if delivery accepts it; otherwise the worker closes it. */
    void run(Request request,Labels labels,Hd.Progress progress,Predicate<Result> deliver,Consumer<Exception> fail){
        Pcm decoded=null;boolean delivered=false;
        try{
            Project cfg=request.project;String text=request.text,lang=request.lang;int cps=cfg.cps;
            Script.Keywords words=new Script.Keywords(refs,lang,request.personal);List<Script.Segment> segments;String spokenBy="";
            if(request.silent)segments=Script.timing(text,text.length()*1000./cps,1);
            else if(cfg.fileAudio){
                if(!request.audio.isFile())throw new IOException(labels.text("scene.err.sansAudio"));
                decoded=Pcm.decode(request.audio,request.cache);segments=cfg.subtitles?Script.locate(text,cfg.segments,true):null;
                if(segments==null)segments=Script.timing(text,decoded.duration(),0);
            }else {
                if(!request.automatic&&!request.choices.isEmpty()&&text.length()>SpeechPlan.MAX_TEXT)
                    throw new IOException(labels.text("voix.hd.err.tropLong","max",SpeechPlan.MAX_TEXT,"n",text.length()));
                Hd.Synthesis syn=null;Exception hdError=null;
                for(String id:request.choices){
                    try{
                        if(!hd.installed(hd.voice(id)))throw new IOException(labels.text("voix.hd.err.manquant"));
                        syn=hd.synth(text,id,cps,progress);spokenBy=id;break;
                    }catch(Exception e){Pcm.interrupted();if(!request.automatic)throw e;hdError=e;hd.close();}
                }
                if(syn==null){
                    Voice v=request.systemVoice;
                    if(v==null){if(hdError!=null)throw hdError;
                        throw new IOException(labels.text(request.automatic?"android.voice.noAudio":request.localReady?"voix.err.aucune":"voix.err.absente"));}
                    syn=talk.render(request.cache,text,lang,object(refs.json("prononciation.json"),lang),v,cps,cfg.pitch,progress);spokenBy=v.getName();
                }
                decoded=syn.pcm;segments=syn.segments;
            }
            Script.reportExpressions(text,segments,cfg.segments);if(segments.isEmpty())throw new IOException(labels.text("scene.err.texteVide"));
            Mood mood=new Mood(refs,lang,words,cfg.emotions);
            boolean lectrice=AichaTrack.matches(refs.character(cfg.character));
            double duration=decoded!=null?decoded.duration():Math.max(1,request.silent?text.length()*1000./cps:segments.get(segments.size()-1).to);
            G2p.Profile phones=spokenBy.equals("siwis")?G2p.Profile.SIWIS:spokenBy.equals("kokoro-siwis")?G2p.Profile.KOKORO:G2p.Profile.PIPER;
            AichaTrack aicha=lectrice?new AichaTrack(refs,segments,duration,mood,cfg.emotions,lang,phones,decoded):null;
            Performance performance=lectrice?null:new Performance(segments,mood,refs.rig);
            // Highlighting the complete script can be costly; do it before UI delivery.
            Pcm.interrupted();Script.Terminal terminal=new Script.Terminal(text,words);Pcm.interrupted();
            delivered=deliver.test(new Result(decoded,segments,terminal,performance,aicha,spokenBy));
        }catch(Exception e){fail.accept(e);}finally{if(!delivered&&decoded!=null)decoded.close();}
    }
}
