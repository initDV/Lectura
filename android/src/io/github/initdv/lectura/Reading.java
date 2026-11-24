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
    Performance performance;
    RobotChoreo choreography;
    final boolean silent;
    final double mediaDuration;
    double duration;
    final float baseRate;
    private final Lip lip;
    private final MediaPlayer player;
    private final Talk.Queue queue;
    private final Runnable finish;
    boolean playing,ended;
    private boolean outro;
    float rate=1,volume=1;
    boolean mute;
    private double position;
    private long mark;
    private int pendingSeek=-1;
    private float appliedRate=1;
    Reading(String text,List<Script.Segment> parts,Script.Keywords keywords, boolean silent,Pcm pcm,Talk talk,Voice voice,
            Project p,float baseRate,Runnable finish,Consumer<String> fail) throws IOException {
        this.text=text; this.silent=silent;this.pcm=pcm;this.baseRate=baseRate;this.finish=finish;
        timeline=new Script.Timeline(text,parts);terminal=new Script.Terminal(text,keywords);
        if(pcm!=null){
            mediaDuration=pcm.duration();lip=new Lip(pcm);queue=null;player=new MediaPlayer();
            try(FileInputStream in=new FileInputStream(pcm.file)){
                player.setDataSource(in.getFD());player.prepare();
            } catch(IOException|RuntimeException e){player.release();throw e;}
            player.setOnCompletionListener(ignored->mediaFinished());
            player.setOnSeekCompleteListener(ignored->pendingSeek=-1);
            player.setOnErrorListener((ignored,w,e)->{playing=false;fail.accept("audio "+w+"/"+e);return true;});
        }else{
            player=null;lip=null;mediaDuration=Math.max(1,silent?text.length()*1000./p.cps:timeline.duration);
            queue=silent?null:new Talk.Queue(talk,voice,text,p.cps,p.speed,p.pitch,this::mediaFinished,code->{playing=false;fail.accept(code);});
        }
        duration=mediaDuration;rate=p.speed/baseRate;
    }
    void choreograph(RobotChoreo track){choreography=track;duration=track==null?mediaDuration:track.end;}
    private void mediaFinished(){
        if(!playing||outro)return;
        if(duration>mediaDuration){outro=true;position=mediaDuration;mark=SystemClock.uptimeMillis();if(lip!=null)lip.reset();}
        else complete();
    }
    private void complete(){if(!playing)return;ended=true;playing=false;position=duration;terminal.shown=text.length();finish.run();}
    double time(){
        if(ended)return duration;
        if(!outro){
            if(queue!=null)return queue.position()*mediaDuration/Math.max(1,text.length());
            if(player!=null)return pendingSeek>=0?pendingSeek:player.getCurrentPosition();
        }
        if(!playing)return position;
        double t=position+(SystemClock.uptimeMillis()-mark)*rate;
        if(t>= (outro?duration:mediaDuration)){
            if(outro)complete();else mediaFinished();
            return ended?duration:mediaDuration;
        }
        return t;
    }
    double chars(double time){return ended||outro?text.length():queue==null?timeline.charAt(time):queue.pos;}
    static String letterAt(String text,double chars){
        // scene.js indexes the string with the raw cursor. A fractional SpeechSource cursor
        // selects no letter (the terminal and simulatedViseme still use the integer part).
        int i=(int)chars;
        return i==chars&&i>=0&&i<text.length()?text.substring(i,i+1):"";
    }
    void play(){
        if(playing)return;if(ended)seek(0);playing=true;
        if(outro)mark=SystemClock.uptimeMillis();else playMedia();
    }
    private void playMedia(){
        if(queue!=null)queue.play();else if(player!=null){player.start();applyRate();}else mark=SystemClock.uptimeMillis();
    }
    void pause(){
        if(!playing)return;position=time();playing=false;
        if(!outro)pauseMedia();
    }
    private void pauseMedia(){if(queue!=null)queue.pause();if(player!=null)player.pause();if(lip!=null)lip.reset();}
    void seek(double ms){
        boolean wasOutro=outro;
        position=Math.max(0,Math.min(duration-1,ms));ended=false;mark=SystemClock.uptimeMillis();
        outro=duration>mediaDuration&&position>=mediaDuration;
        if(outro){if(playing&&!wasOutro)pauseMedia();return;}
        if(queue!=null)queue.seek((int)(position/mediaDuration*text.length()));
        if(lip!=null)lip.reset();
        if(player!=null){pendingSeek=(int)position;player.seekTo(pendingSeek,MediaPlayer.SEEK_CLOSEST);}
        if(wasOutro&&playing)playMedia();
    }
    void speed(float speed){
        if(queue!=null)queue.setRate(speed);
        if(queue==null||outro){position=time();mark=SystemClock.uptimeMillis();}
        rate=speed/baseRate;
        if(player!=null&&playing&&!outro)applyRate();
    }
    private void applyRate(){
        if(appliedRate==rate)return; // Leave the default, unmodified 1× mixer path on first playback.
        player.setPlaybackParams(new PlaybackParams().allowDefaults().setSpeed(rate).setPitch(1));appliedRate=rate;
    }
    void volume(float v,boolean muted){volume=Float.isFinite(v)?Math.max(0,Math.min(1,v)):1;
        if(player!=null)player.setVolume(muted?0:volume,muted?0:volume);
        if(queue!=null){queue.volume=volume;if(mute!=muted)queue.mute(muted);}mute=muted;}
    int viseme(double time,double frame,double chars){
        if(!playing||outro)return 0;
        // The requested seek position isn't yet playing. Don't analyse its future samples.
        if(lip!=null){Script.Segment span=timeline.at(time);
            if(pendingSeek>=0||span!=null&&span.speechEnd>=0&&(span.type!=Script.SPOKEN||time>=span.speechEnd)){lip.reset();return 0;}
            return lip.read(time);
        }
        if(queue!=null)return speechViseme(frame,queue.speaking(),text,chars);
        int n=(int)(time/mediaDuration*text.length());
        return simulated(frame,n<text.length()?text.charAt(n):' ');
    }
    static int speechViseme(double frame,boolean speaking,String text,double chars){
        int n=(int)chars;
        return speaking&&n>=0&&n<text.length()?simulated(frame,text.charAt(n)):0;
    }
    static int simulated(double ms,char c){
        if(Script.space(c)||".,;:!?…()«»\"-".indexOf(c)>=0)return 0;double t=ms/1000,hz=7.5+1.5*Math.sin(t*2.1);
        double a=Math.abs(Math.sin(Math.PI*hz*t))*(.65+.35*Math.sin(t*3.7+1));return a>.72?3:a>.4?2:a>.12?1:0;
    }
    int shape(){return lip==null?48:lip.shape;}
    @Override public void close(){playing=false;if(queue!=null)queue.stop();if(player!=null)player.release();if(pcm!=null)pcm.close();}
}
