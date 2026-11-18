package io.github.initdv.lectura;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Separate signed test APK; no test hooks, keys, or Pro bypass in the product. */
public final class DeviceChecks extends Instrumentation {
    private Bundle args;
    @Override public void onCreate(Bundle options){args=options;start();}
    @Override public void onStart(){
        Bundle out=new Bundle();try{
            Context ctx=getTargetContext(); Refs refs=new Refs(ctx);String note=refsAndModels(refs);
            note+=" | "+media(ctx);
            if("true".equals(args.getString("hd")))note+=" | "+hd(refs);
            out.putString("stream","\nLECTURA_OK "+note+"\n");finish(Activity.RESULT_OK,out);
        }catch(Throwable e){out.putString("stream","\nLECTURA_ERROR "+android.util.Log.getStackTraceString(e)+"\n");finish(Activity.RESULT_CANCELED,out);}
    }
    private static void require(boolean b,String msg) {if(!b)throw new AssertionError(msg);}
    private String refsAndModels(Refs refs)throws Exception {
        require(refs.characters.size()==43,"Catalogue personnages");
        Bitmap frame=Bitmap.createBitmap(200,330,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(frame);
        for(JSONObject def:refs.characters){Sprite s=new Sprite(refs,def);s.rich=true;s.expression("enthousiaste",1,"triste",.3);
            for(int i=0;i<8;i++){s.viseme=i%4;s.letter="aeiou".substring(i%5,i%5+1);s.tick(i*16);}
            s.svg.fit(c,0,0,200,330,true);
        }
        frame.recycle();JSONObject fixture;
        try(InputStream in=getContext().getAssets().open("fixtures.json")){fixture=Refs.parse(new String(Refs.read(in,1000000),StandardCharsets.UTF_8));}
        G2p g=new G2p(refs.json("g2p.json"));JSONArray tests=fixture.getJSONArray("phrases");
        for(int i=0;i<tests.length();i++){JSONArray row=tests.getJSONArray(i);String actual=g.phrase(row.getString(0));require(actual.equals(row.getString(1)),"G2P : "+row.getString(0)+" | "+actual+" != "+row.getString(1));}
        tests=fixture.getJSONArray("timeline");for(int i=0;i<tests.length();i++){
            JSONObject t=tests.getJSONObject(i);String clean=Script.clean(t.getString("t"));require(clean.equals(t.getString("text")),"Nettoyage Markdown");
            long ms=Script.estimate(clean,1.25,28);require(ms==t.getLong("duration"),"Durée estimée");
            List<Script.Segment> parts=Script.timing(clean,ms,.5);Script.Timeline timeline=new Script.Timeline(clean,parts);JSONArray values=t.getJSONArray("positions");
            for(int k=0;k<values.length();k++){JSONArray row=values.getJSONArray(k);require(timeline.charAt(row.getLong(0))==row.getInt(1),"Positions des caractères");}
        }
        return "43 rigs, 8 cas G2P et 8 chronologies conformes aux fixtures";
    }
    private String media(Context ctx)throws Exception {
        File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
        File wav=new File(dir,"tone.wav");int rate=48000;long frames=rate*2;
        try(RandomAccessFile out=new RandomAccessFile(wav,"rw")){Pcm.header(out,1,rate,frames*2);
            for(int i=0;i<frames;i++){short x=(short)(11000*Math.sin(2*Math.PI*440*i/rate));out.writeByte(x&255);out.writeByte(x>>8);}}
        MainActivity a=(MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<Throwable> setup=new AtomicReference<>();
        runOnMainSync(()->{try{
            a.dismiss();a.project.text=a.t("voix.exemple");a.render("scene");
            var kw=new Script.Keywords(a.refs,"fr",false,new JSONObject());List<Script.Segment> p=Script.timing(a.project.text,2000,1);
            a.reading=new Reading(a.project.text,p,kw,true,null,a.talk,null,a.project,1,()->{},code->{});
            a.mood=new Mood(a.refs,"fr",kw,false,true);a.reading.terminal.shown=a.project.text.length();
        }catch(Throwable e){setup.set(e);}});if(setup.get()!=null)throw new AssertionError(setup.get());
        try(Pcm pcm=Pcm.decode(wav,dir)){
            require(pcm.duration()>=1999,"Durée décodée WAV");
            for(String ext:new String[]{"mp4","webm"}){
                int w=ext.equals("mp4")?1280:720,h=ext.equals("mp4")?720:1280;
                File encoded=encode(a,pcm,dir,ext,w,h);File named=new File(dir,"lectura-test."+ext);Files.move(encoded.toPath(),named.toPath(),StandardCopyOption.REPLACE_EXISTING);
                Uri shared=SharedMedia.reserveShare(ctx,named,named.getName());try(InputStream in=ctx.getContentResolver().openInputStream(shared)){require(in!=null&&in.read()>=0,"Flux URI " + ext);}
                try(Pcm decoded=Pcm.decode(named,dir)){require(decoded.duration()>1200,"Audio réel " + ext);short[] b=new short[4096];int n=decoded.read(decoded.rate/2,b,4096);int peak=0;for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)b[i]));require(peak>5000,"Audio audible "+ext);}
                if(ext.equals("mp4")){
                    File mp3=new File(dir,"lectura-test.mp3");Mp3.transcode(named,mp3,dir);
                    MediaExtractor x=new MediaExtractor();try{x.setDataSource(mp3.getPath());require(x.getTrackCount()==1&&MediaFormat.MIMETYPE_AUDIO_MPEG.equals(x.getTrackFormat(0).getString(MediaFormat.KEY_MIME)),"Vrai MP3");}finally{x.release();}
                    Uri saved=SharedMedia.publish(ctx,named,named.getName());require(saved!=null,"MediaStore");ctx.getContentResolver().delete(saved,null,null);
                    Uri shareAudio=SharedMedia.reserveShare(ctx,mp3,mp3.getName());try(InputStream in=ctx.getContentResolver().openInputStream(shareAudio)){require(in!=null&&in.read()>=0,"Flux URI MP3");}
                }
            }
        }finally{wav.delete();runOnMainSync(a::finish);}
        return "MP4 H.264/AAC, WebM VPx/Opus, MP3, décodage des pistes, MediaStore et flux de partage";
    }
    private File encode(MainActivity a,Pcm pcm,File dir,String ext,int w,int h)throws Exception {
        MediaExport.Recording r=new MediaExport.Recording(w,h,dir,pcm);ExecutorService worker=Executors.newSingleThreadExecutor();CountDownLatch start=new CountDownLatch(1);
        Future<File> done=worker.submit(()->r.run(ext,start::countDown));try{
            while(!start.await(200,TimeUnit.MILLISECONDS)){if(done.isDone())return done.get();}
            r.mark(new MediaExport.Mark(0,0,1,true));
            for(int i=0;i<48;i++){
                while(!r.room()){if(done.isDone())return done.get();Thread.sleep(3);}
                final int frame=i;Bitmap bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
                runOnMainSync(()->{a.stage.sprite.tick(1000+frame*1000./30);a.reading.terminal.shown=a.reading.text.length()*frame/47;
                    a.stage.exportDraw(new Canvas(bitmap),w,h,false,frame*1000./30);});r.offer(bitmap,i*1_000_000L/30);
            }
            r.end(1_600_000);return done.get(40,TimeUnit.SECONDS);
        }finally{r.cancel();worker.shutdownNow();}
    }
    private String hd(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            require(Hd.supported(),"AAR ONNX absent");h.download("gilles",(a,b)->{});
            String text="Bonjour Lectura.\n$ echo\nTrès bien !";
            try(Pcm f=h.synth(text,"gilles",1,28,(a,b)->{}).pcm){require(f.frames>f.rate,"Synthèse ONNX vide");}
            try(Pcm cached=h.synth(text,"gilles",1,28,(a,b)->{}).pcm){require(cached.frames>cached.rate,"Cache Piper");}
            h.remove("gilles");require(!h.installed(h.voice("gilles")),"Suppression modèle Piper");return "Voix Piper Gilles originale, synthèse, cache et suppression";
        }
    }
}
