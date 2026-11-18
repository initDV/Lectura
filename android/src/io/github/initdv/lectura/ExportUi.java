package io.github.initdv.lectura;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.view.View;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.VideoView;
import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** Record/stop/download workflow and the private « Mes vidéos » library. */
final class ExportUi implements AutoCloseable {
    final MainActivity a;final Ui u;final Movies movies;final File temp;
    final ExecutorService executor=Executors.newSingleThreadExecutor();
    MediaExport.Recording recording;
    Future<?> task;
    private long origin,lastFrame=-1;
    private boolean finishing,markedPlaying,closed;
    private double markedRate;
    private File mediaToOffer;
    private boolean offerAudio;
    private String offerName;
    private VideoView showing;
    ExportUi(MainActivity a){
        this.a=a;u=a.ui;movies=new Movies(a);temp=Library.dir(a.getCacheDir(),"exports");
        File[] stale=temp.listFiles();if(stale!=null)for(File old:stale)if(old.lastModified()<System.currentTimeMillis()-86400000L)old.delete();
    }
    private String t(String key,Object... args){return a.t(key,args);}
    boolean active(){return recording!=null&&!finishing;}
    boolean capturing(){return active()&&origin>0;}
    boolean busy(){return recording!=null;}
    void toggle(){
        if(finishing)return;
        if(recording!=null){stop();return;}
        if(!a.pro){a.note(t("pro.requis.video"),"info");return;}
        if(a.reading==null||a.preparing){a.note(t("scene.err.rienACapturer"),"info");return;}
        Reading reading=a.reading;Stage stage=a.stage;
        if(reading.playing)reading.pause();reading.seek(0);reading.terminal.shown=0;a.playState();
        boolean portrait=!a.db.settings.optString("formatVideo").equals("16:9");
        String title=a.project.base();
        try{
            MediaExport.Recording session=new MediaExport.Recording(portrait?720:1280,portrait?1280:720,temp,reading.pcm);
            recording=session;origin=0;lastFrame=-1;markedRate=0;markedPlaying=false;
            task=executor.submit(()->{try{
                File file=session.run(null,()->a.handler.post(()->{
                    if(closed||recording!=session||a.stage!=stage)return;
                    stage.recording=true;origin=System.nanoTime();
                    a.note(t(session.sound!=null?"scene.videoDebut":"scene.videoSansSon"),session.sound!=null?"info":"warn",7000);
                    a.startPlaying();mark(true);frame(0);
                }));
                a.handler.post(()->{
                    if(recording!=session){file.delete();return;}
                    recording=null;finishing=false;stage.recording=false;
                    if(mediaToOffer!=null)mediaToOffer.delete();mediaToOffer=file;offerName=title;offerAudio=session.sound!=null;
                    a.note(t("scene.video.verifOk","detail",session.w+" × "+session.h+" · "+SharedMedia.extension(file.getName()).toUpperCase(Locale.ROOT)),"ok",8000);
                    foreground();
                });
            }catch(Exception e){a.handler.post(()->{if(recording==session){recording=null;finishing=false;stage.recording=false;if(!(e instanceof CancellationException))a.report("video",e);}});}});
        }catch(Exception e){a.report("video",e);}
    }
    void mark(boolean force){
        MediaExport.Recording r=recording;Reading p=a.reading;if(r==null||p==null||origin==0||finishing||r.sound==null)return;
        if(force||markedPlaying!=p.playing||markedRate!=p.rate){
            // Read the current rendered clock only once; time() can trigger the end callback.
            boolean nowPlaying=p.playing;markedPlaying=nowPlaying;markedRate=p.rate;
            r.mark(new MediaExport.Mark(nowUs(),p.time(),p.rate,nowPlaying));
        }
    }
    private long nowUs(){return Math.max(0,(System.nanoTime()-origin)/1000);}
    void frame(double sceneTime){
        MediaExport.Recording r=recording;if(r==null||origin==0||finishing||a.stage==null)return;
        long index=nowUs()*30/1_000_000;if(index<=lastFrame||!r.room())return;long timestamp=lastFrame<0?0:index*1_000_000/30;
        Bitmap bitmap=Bitmap.createBitmap(r.w,r.h,Bitmap.Config.ARGB_8888);
        a.stage.exportDraw(new Canvas(bitmap),r.w,r.h,false,sceneTime);r.offer(bitmap,timestamp);lastFrame=index;
    }
    void naturalEnd(){if(active()&&origin>0){MediaExport.Recording r=recording;a.handler.postDelayed(()->{if(recording==r)stop();},600);}}
    void stop(){
        if(!active())return;
        if(origin==0){abandon();return;}
        finishing=true;recording.end(nowUs());if(a.stage!=null)a.stage.recording=false;
        if(a.reading!=null&&a.reading.playing)a.reading.pause();a.playState();
    }
    void abandon(){
        if(recording!=null){recording.cancel();recording=null;if(task!=null)task.cancel(true);}
        finishing=false;origin=0;if(a.stage!=null)a.stage.recording=false;
    }
    void foreground(){if(a.isForeground&&!closed&&mediaToOffer!=null&&a.modal==null&&a.stage!=null)offer();}
    void offer(){
        File file=mediaToOffer;if(file==null)return;String base=offerName,ext=SharedMedia.extension(file.getName());boolean sound=offerAudio;
        LinearLayout body=a.sheet(t("dl.titre"));
        u.add(body,u.small(a.db.locale().equals("en")?"Choose the format. Formats not available on this device are greyed out.":"Choisis le format. Les formats indisponibles sur cet appareil sont grisés."),0);
        u.add(body,u.text(a.db.locale().equals("en")?"Videos are saved to Movies/Lectura. Use Share to send the file.":"Les vidéos sont enregistrées dans Movies/Lectura. Utilise Partager pour envoyer le fichier.",13.6f,0xff7fdfff,400),8);
        CheckBox keep=new CheckBox(a);u.style(keep,15,u.text,500);keep.setChecked(true);keep.setText(t("dl.garder"));keep.setButtonTintList(android.content.res.ColorStateList.valueOf(u.accent));u.add(body,keep,8);
        for(String option:new String[]{"mp4","webm","mp3"}){
            boolean audio=option.equals("mp3"),active=audio?sound:option.equals(ext);
            LinearLayout row=u.col();row.setBackground(u.shape(0,6,0xff333333,1));u.pad(row,8,8);u.add(body,row,8);
            u.add(row,u.text(option.toUpperCase(Locale.ROOT),15,u.text,700),0);
            String help=audio?t(sound?"dl.mp3.genere":"scene.videoSansSon"):active?sound?t("dl.formatVideo"):t("scene.videoSansSon"):
                (a.db.locale().equals("en")?"Recorded as ":"Enregistré en ")+ext.toUpperCase(Locale.ROOT)+".";
            u.add(row,u.small(help),4);
            if(!active){row.setAlpha(.5f);continue;}
            if(!audio)u.add(row,u.small(Refs.size(file.length())),4);
            LinearLayout r=u.row();u.add(row,r,6);
            addAction(r,t("dl.bouton.telecharger"),()->take(file,base,option,keep.isChecked(),false,sound));u.gap(r,6);
            addAction(r,t("dl.bouton.partager"),()->take(file,base,option,keep.isChecked(),true,sound));
        }
        a.modalCleanup=()->{if(mediaToOffer==file){mediaToOffer=null;file.delete();}};
    }
    private void addAction(LinearLayout row,String s,Runnable r){TextView b=u.button(s,null,r);u.pad(b,8,0);u.grow(row,b);}
    private void take(File file,String base,String ext,boolean keep,boolean share,boolean sound){
        if(mediaToOffer!=file)return;mediaToOffer=null;a.dismiss();output(file,base,ext,keep,share,sound);
    }
    private void output(File original,String base,String ext,boolean keep,boolean share,boolean sound){
        boolean mp3=ext.equals("mp3");if(mp3&&!sound){a.note(t("dl.mp3.echec"),"error");original.delete();return;}
        if(mp3)a.note(t("dl.mp3.encours"),"info");
        String name=base+"."+ext;
        executor.submit(()->{
            File encoded=original;
            try{
                if(mp3){encoded=File.createTempFile("lecture-",".mp3",temp);Mp3.transcode(original,encoded,temp);}
                if(keep){try{movies.save(encoded,name);}catch(IOException e){a.handler.post(()->a.report("mes-videos",e));}}
                long size=encoded.length();
                if(share){Uri uri=SharedMedia.reserveShare(a,encoded,name);a.handler.post(()->share(uri,name));}
                else {SharedMedia.publish(a,encoded,name);a.handler.post(()->{
                    if(!closed)a.note(mp3?t("dl.mp3.ok","taille",Refs.size(size)):t("scene.videoPrete","format",ext.toUpperCase(Locale.ROOT),"taille",Refs.size(size)),"ok");});}
            }catch(Exception e){a.handler.post(()->a.report(mp3?"audio-export":"video-export",e));}
            finally{if(encoded!=original)encoded.delete();original.delete();}
        });
    }
    private void share(Uri uri,String name){if(closed||!a.isForeground)return;try{SharedMedia.share(a,uri,name);}catch(Exception e){a.report("partage",e);}}
    void library(){
        LinearLayout r=a.sheet(t("mv.titre"));try{
            var files=movies.list();if(files.isEmpty()){u.add(r,u.small(t("mv.vide")),0);return;}
            DateTimeFormatter time=DateTimeFormatter.ofPattern(a.db.locale().equals("en")?"MM/dd/yyyy, HH:mm:ss":"dd/MM/yyyy HH:mm:ss").withZone(ZoneId.systemDefault());
            for(Movies.Entry e:files){
                LinearLayout panel=u.col();panel.setBackground(u.shape(0,6,0xff333333,1));u.pad(panel,9,9);u.add(r,panel,6);
                u.add(panel,u.text(e.title,15,u.text,700),0);u.add(panel,u.small(time.format(Instant.parse(e.date))+" · "+e.format.toUpperCase(Locale.ROOT)+" · "+Refs.size(e.file.length())),3);
                LinearLayout row=u.row();u.add(panel,row,6);
                addAction(row,t("mv.lire"),()->view(e));u.gap(row,6);
                addAction(row,t("mv.partager"),()->executor.submit(()->{try{Uri uri=SharedMedia.reserveShare(a,e.file,e.name());a.handler.post(()->share(uri,e.name()));}catch(Exception x){a.handler.post(()->a.report("partage",x));}}));u.gap(row,6);
                addAction(row,t("mv.supprimer"),()->{movies.delete(e);a.note(t("mv.supprimee"),"ok");library();});
            }
        }catch(Exception e){a.report("mes-videos",e);}
    }
    private void view(Movies.Entry entry){
        if(!entry.file.isFile()){a.note(t("mv.introuvable"),"warn");return;}
        LinearLayout r=a.sheet(t("mv.lecteur"));VideoView video=new VideoView(a);showing=video;video.setBackgroundColor(0xff000000);
        r.addView(video,u.lp(Ui.MATCH,entry.format.equals("mp3")?100:Math.min(a.viewportHeight()*.7f,450)));
        MediaController controller=new MediaController(a);controller.setAnchorView(video);video.setMediaController(controller);
        video.setOnErrorListener((player,error,extra)->{a.report("lecture-video",new IOException(error+" / "+extra));return true;});
        video.setOnPreparedListener(player->{video.setBackgroundColor(0);video.start();});video.setVideoPath(entry.file.getPath());
        u.add(r,u.button(t("commun.fermer"),null,a::dismiss),8);a.modalCleanup=()->{controller.hide();video.stopPlayback();if(showing==video)showing=null;};
    }
    void background(){if(active())stop();if(showing!=null&&showing.isPlaying())showing.pause();}
    @Override public void close(){closed=true;abandon();executor.shutdown();if(mediaToOffer!=null){mediaToOffer.delete();mediaToOffer=null;}}
}
