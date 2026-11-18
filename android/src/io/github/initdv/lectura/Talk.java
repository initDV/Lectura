package io.github.initdv.lectura;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** One native TTS service; stale utterance callbacks are ignored after seek/pause/navigation. */
final class Talk implements AutoCloseable {
    private final Handler main=new Handler(Looper.getMainLooper());
    private final TextToSpeech tts;
    boolean ready,failure;
    private boolean closed;
    private String current="";
    private Listener listener;
    interface Listener {
        default void start(){} default void range(int start){} default void done(){} default void error(String code){}
    }
    Talk(Context c,Runnable init){
        tts=new TextToSpeech(c,status->main.post(()->{if(closed)return;ready=status==TextToSpeech.SUCCESS;failure=!ready;init.run();}));
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            private void event(String id,java.util.function.Consumer<Listener> callback){main.post(()->{if(current.equals(id)&&listener!=null)callback.accept(listener);});}
            @Override public void onStart(String id){event(id,Listener::start);}
            @Override public void onRangeStart(String id,int start,int end,int frame){event(id,l->l.range(start));}
            @Override public void onDone(String id){event(id,Listener::done);}
            @Override public void onError(String id){onError(id,TextToSpeech.ERROR);}
            @Override public void onError(String id,int code){event(id,l->l.error(String.valueOf(code)));}
        });
    }
    static boolean local(Voice v){return v!=null&&!v.isNetworkConnectionRequired()
        &&!v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);}
    List<Voice> voices(String lang){
        List<Voice> out=new ArrayList<>();var voices=ready?tts.getVoices():null;
        if(voices!=null)for(Voice v:voices)if(local(v)&&v.getLocale().getLanguage().equals(lang))out.add(v);
        out.sort(Comparator.comparing(Voice::getName));return out;
    }
    Voice choose(String lang,String id){
        List<Voice> voices=voices(lang);for(Voice v:voices)if(v.getName().equals(id))return v;
        Voice def=ready?tts.getDefaultVoice():null;if(def!=null&&voices.contains(def))return def;
        return voices.isEmpty()?null:voices.get(0);
    }
    void speak(String text,Voice voice,float speed,float pitch,float volume,Listener l){
        cancel();current=UUID.randomUUID().toString();listener=l;
        if(!ready||!local(voice)||tts.setVoice(voice)!=TextToSpeech.SUCCESS){l.error("voix");return;}
        tts.setSpeechRate(speed);tts.setPitch(Math.max(.05f,pitch));Bundle b=new Bundle();b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,volume);
        if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,b,current)==TextToSpeech.ERROR)l.error("synthèse");
    }
    Hd.Synthesis render(File cache,String source,String lang,org.json.JSONObject lexicon,Voice voice,int cps,
                        float pitch,Hd.Progress progress)throws Exception {
        return VoiceRender.render(cache,null,null,SpeechPlan.plan(source,lang,lexicon),24000,cps,
            text->renderPhrase(cache,text,voice,pitch),progress);
    }
    private float[] renderPhrase(File cache,String text,Voice voice,float pitch)throws Exception {
        Pcm.interrupted();
        if(text.length()>TextToSpeech.getMaxSpeechInputLength())throw new IOException("Phrase trop longue pour la voix système.");
        String id=UUID.randomUUID().toString();File file=File.createTempFile("systeme-",".wav",cache);
        CompletableFuture<Void> synth=new CompletableFuture<>();
        Listener callback=new Listener(){
            @Override public void done(){synth.complete(null);}
            @Override public void error(String code){synth.completeExceptionally(new IOException("Synthèse locale Android : "+code));}
        };
        try {
            main.post(()->{
                if(synth.isDone())return;
                if(closed||!ready||!local(voice)||tts.setVoice(voice)!=TextToSpeech.SUCCESS){callback.error("voix locale indisponible");return;}
                current=id;listener=callback;
                tts.setSpeechRate(1);tts.setPitch(Math.max(.05f,pitch));
                try{if(tts.synthesizeToFile(text,new Bundle(),file,id)!=TextToSpeech.SUCCESS)callback.error("fichier refusé");}
                catch(RuntimeException e){synth.completeExceptionally(e);}
            });
            try{synth.get(30,TimeUnit.SECONDS);}
            catch(InterruptedException e){Thread.currentThread().interrupt();Pcm.interrupted();throw e;}
            catch(TimeoutException e){throw new IOException("Le moteur vocal local ne répond pas.",e);}
            catch(ExecutionException e){throw new IOException(e.getCause().getMessage(),e.getCause());}
            Pcm.interrupted();
            try(Pcm pcm=Pcm.decode(file,cache)) {
                if(pcm.frames>90L*pcm.rate)throw new IOException("Phrase système trop longue.");
                short[] raw=new short[(int)pcm.frames*pcm.channels];pcm.read(0,raw,(int)pcm.frames);
                float[] res=new float[(int)Math.round(pcm.frames*24000./pcm.rate)];
                for(int i=0;i<res.length;i++) {
                    double pos=i*pcm.rate/24000.;int j=Math.min((int)pcm.frames-1,(int)pos),k=Math.min((int)pcm.frames-1,j+1);
                    float a=raw[pcm.channels*j],b=raw[pcm.channels*k];
                    if(pcm.channels==2){a=(a+raw[pcm.channels*j+1])*.5f;b=(b+raw[pcm.channels*k+1])*.5f;}
                    res[i]=(float)((a+(b-a)*(pos-j))/32768.);
                }
                return res;
            }
        }finally {
            boolean running=!synth.isDone();synth.cancel(false);
            main.post(()->{if(current.equals(id)){if(running)cancel();else{current="";listener=null;}}});
            file.delete();
        }
    }
    void cancel(){current="";listener=null;if(ready)tts.stop();}
    @Override public void close(){closed=true;cancel();tts.shutdown();}

    @FunctionalInterface interface Speech {
        void speak(String text,float rate,float pitch,float volume,Listener listener);
    }
    static final class Queue {
        final String text;private final List<Script.Segment> chunks;
        private final Speech speech;private final Runnable cancel;private final java.util.function.LongSupplier now;
        private final int typing;private final float pitch;
        private final Handler handler=new Handler(Looper.getMainLooper());
        private final Runnable onEnd;private final java.util.function.Consumer<String> onError;
        float rate,volume=1; boolean playing,started,silent,muted;double pos;
        private int index,gen;private double cps,anchor,cap,first=-1;private long t0,anchorT,lastEvent,firstT;
        private Runnable timer;
        Queue(Talk talk,Voice voice,String text,int typing,float rate,float pitch,Runnable end,java.util.function.Consumer<String> error){
            this((s,r,p,v,l)->talk.speak(s,voice,r,p,v,l),talk::cancel,SystemClock::uptimeMillis,text,typing,rate,pitch,end,error);
        }
        Queue(Speech speech,Runnable cancel,java.util.function.LongSupplier now,String text,int typing,float rate,float pitch,
              Runnable end,java.util.function.Consumer<String> error){
            this.speech=speech;this.cancel=cancel;this.now=now;this.text=text;this.typing=typing;this.rate=rate;this.pitch=pitch;
            chunks=Script.chunks(text);cps=Script.VOICE_CPS*(double)rate;onEnd=end;onError=error;
        }
        void play(){if(playing)return;if(pos>=text.length())pos=0;playing=true;from((int)pos);}
        void pause(){position();stop();}
        void stop(){playing=false;clear();}
        private void clear(){gen++;if(timer!=null)handler.removeCallbacks(timer);timer=null;cancel.run();}
        void seek(double n){pos=Math.max(0,Math.min(text.length(),Math.floor(n)));if(!playing)return;clear();started=false;lastEvent=clock();later(()->from((int)pos),90);}
        void setRate(float r){cps*=(double)r/rate;rate=r;if(playing)seek(position());}
        void mute(boolean b){muted=b;if(playing)seek(position());}
        private void later(Runnable fn,long delay){if(timer!=null)handler.removeCallbacks(timer);int generation=gen;timer=()->{if(playing&&generation==gen)fn.run();};handler.postDelayed(timer,delay);}
        private long clock(){return now.getAsLong();}
        private void from(int at){
            gen++;index=0;while(index<chunks.size()&&chunks.get(index).end<=at)index++;
            if(index==chunks.size()){finish();return;}
            int generation=gen;Script.Segment c=chunks.get(index);int off=Math.max(0,at-c.start);
            silent=c.type!=Script.SPOKEN;if(!silent)while(off>0&&!Script.space(c.text.charAt(off-1)))off--;
            int base=c.start+off;pos=base;anchor=base;t0=anchorT=lastEvent=clock();cap=c.end;first=-1;started=silent;
            if(silent){later(this::next,(long)((c.end-base)*1000/(typing*rate))+220);return;}
            speech.speak(c.text.substring(off),rate,pitch,muted?0:volume,new Listener(){
                @Override public void start(){if(gen==generation){started=true;lastEvent=anchorT=clock();anchor=base;}}
                @Override public void range(int i){if(gen!=generation)return;started=true;long t=lastEvent=clock();int abs=base+i;
                    if(first<0){first=abs;firstT=t;}else if(t-firstT>600)cps=Math.max(5,Math.min(45,cps*.6+(abs-first)/(t-firstT)*400));
                    anchor=Math.max(abs,Math.min(pos,abs+14));anchorT=t;cap=abs+16;
                }
                @Override public void done(){if(gen!=generation)return;double dt=(clock()-t0)/1000.;if(first<0&&dt>.4)cps=Math.max(5,Math.min(45,cps*.5+((c.end-base)/dt)*.5));next();}
                @Override public void error(String code){if(gen==generation){stop();onError.accept(code);}}
            });
        }
        private void next(){if(index+1<chunks.size())from(chunks.get(index+1).start);else finish();}
        private void finish(){playing=false;pos=text.length();onEnd.run();}
        double position(){
            if(!playing||index>=chunks.size())return pos;Script.Segment c=chunks.get(index);long t=clock();
            if(started)pos=Math.max(pos,Math.min(Math.min(c.end,cap),anchor+(t-anchorT)*(silent?typing*(double)rate:cps)/1000));
            if(!silent&&t-lastEvent>6000+(started?(c.end-c.start)*3000/cps:0)){stop();onError.accept(started?"bloquee":"non-demarree");}
            return pos;
        }
        boolean speaking(){return playing&&started&&!silent;}
    }
}
