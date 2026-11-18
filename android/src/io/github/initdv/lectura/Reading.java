package io.github.initdv.lectura;

import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.SystemClock;
import android.speech.tts.Voice;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;

/** A source clock, a single UTF-16 position and a prepared terminal. Used only on the main thread. */
final class Reading implements AutoCloseable {
    final String text;
    final Script.Timeline timeline;
    final Script.Terminal terminal;
    final Pcm pcm;
    final boolean silent;
    final double duration;
    final float baseRate;
    private final Lip lip;
    private final MediaPlayer player;
    private final Talk.Queue queue;
    private final Runnable finish;
    boolean playing,ended;
    float rate=1,volume=1;
    boolean mute;
    private double position;
    private long mark;
    private int pendingSeek=-1;
    Reading(String text,List<Script.Segment> parts,Script.Keywords keywords, boolean silent,Pcm pcm,Talk talk,Voice voice,
            Project p,float baseRate,Runnable finish,Consumer<String> fail) throws IOException {
        this.text=text; this.silent=silent;this.pcm=pcm;this.baseRate=baseRate;this.finish=finish;
        timeline=new Script.Timeline(text,parts);terminal=new Script.Terminal(text,keywords);
        if(pcm!=null){
            duration=pcm.duration();lip=new Lip(pcm);queue=null;player=new MediaPlayer();
            try(FileInputStream in=new FileInputStream(pcm.file)){
                player.setDataSource(in.getFD());player.prepare();
            } catch(IOException|RuntimeException e){player.release();throw e;}
            player.setOnCompletionListener(ignored->complete());
            player.setOnSeekCompleteListener(ignored->pendingSeek=-1);
            player.setOnErrorListener((ignored,w,e)->{playing=false;fail.accept("audio "+w+"/"+e);return true;});
        }else{
            player=null;lip=null;duration=Math.max(1,silent?text.length()*1000./p.cps:timeline.duration);
            queue=silent?null:new Talk.Queue(talk,voice,text,p.cps,p.speed,p.pitch,this::complete,code->{playing=false;fail.accept(code);});
        }
        rate=p.speed/baseRate;
    }
    private void complete(){if(!playing)return;ended=true;playing=false;position=duration;terminal.shown=text.length();finish.run();}
    double time(){
        if(ended)return duration;
        if(queue!=null)return queue.position()*duration/Math.max(1,text.length());
        if(player!=null)return pendingSeek>=0?pendingSeek:player.getCurrentPosition();
        if(!playing)return position;
        double t=position+(SystemClock.uptimeMillis()-mark)*rate;
        if(t>=duration){complete();return duration;}return t;
    }
    int chars(double time){return ended?text.length():queue==null?timeline.charAt(time):queue.pos;}
    void play(){
        if(playing)return;if(ended)seek(0);playing=true;
        if(queue!=null)queue.play();else if(player!=null){player.start();player.setPlaybackParams(new PlaybackParams().allowDefaults().setSpeed(rate).setPitch(1));}
        else mark=SystemClock.uptimeMillis();
    }
    void pause(){
        if(!playing)return;position=time();playing=false;
        if(queue!=null)queue.pause();if(player!=null)player.pause();if(lip!=null)lip.reset();
    }
    void seek(double ms){
        position=Math.max(0,Math.min(duration-1,ms));ended=false;mark=SystemClock.uptimeMillis();
        if(queue!=null)queue.seek((int)(position/duration*text.length()));
        if(player!=null){pendingSeek=(int)position;player.seekTo(pendingSeek,MediaPlayer.SEEK_CLOSEST);lip.reset();}
    }
    void speed(float speed){
        position=time();mark=SystemClock.uptimeMillis();rate=speed/baseRate;
        if(queue!=null)queue.setRate(speed);
        if(player!=null&&playing)player.setPlaybackParams(new PlaybackParams().allowDefaults().setSpeed(rate).setPitch(1));
    }
    void volume(float v,boolean muted){volume=v;if(player!=null)player.setVolume(muted?0:v,muted?0:v);
        if(queue!=null){queue.volume=v;if(mute!=muted)queue.mute(muted);}mute=muted;}
    int viseme(double time,double frame,boolean pro){
        if(!playing)return 0;if(lip!=null)return lip.read(time,pro);
        if(queue!=null&&!queue.speaking())return 0;int n=queue==null?(int)(time/duration*text.length()):queue.pos;
        return simulated(frame,n<text.length()?text.charAt(n):' ');
    }
    static int simulated(double ms,char c){
        if(Script.space(c)||".,;:!?…()«»\"-".indexOf(c)>=0)return 0;double t=ms/1000,hz=7.5+1.5*Math.sin(t*2.1);
        double a=Math.abs(Math.sin(Math.PI*hz*t))*(.65+.35*Math.sin(t*3.7+1));return a>.72?3:a>.4?2:a>.12?1:0;
    }
    int shape(){return lip==null?48:lip.shape;}
    @Override public void close(){playing=false;if(queue!=null)queue.stop();if(player!=null)player.release();if(pcm!=null)pcm.close();}
}
