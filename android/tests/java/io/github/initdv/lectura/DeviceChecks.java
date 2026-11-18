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
import android.os.Build;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
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
    private final StringBuilder report=new StringBuilder("\n");
    private boolean failed;
    @Override public void onStart(){
        Context ctx=getTargetContext(); Refs refs=new Refs(ctx);
        check("surfaces",()->surfaces(ctx));
        check("fixtures",()->refsAndModels(refs));
        for(String format:new String[]{"mp4","webm"})check(format,()->media(ctx,format));
        if("true".equals(args.getString("hd")))check("piper",()->hd(refs));
        Bundle out=new Bundle();out.putString("stream",report.toString());
        finish(failed?Activity.RESULT_CANCELED:Activity.RESULT_OK,out);
    }
    private interface Check { String run() throws Exception; }
    private void check(String name,Check c){
        try{String result=c.run();report.append("LECTURA_OK ").append(name).append(" : ").append(result).append('\n');}
        catch(Throwable e){
            failed=true;
            report.append("LECTURA_ERROR ").append(name).append(" : ").append(e).append('\n')
                .append(android.util.Log.getStackTraceString(e)).append('\n');
        }
    }
    private interface MainAction { void run() throws Exception; }
    private void main(MainAction fn)throws Exception{
        AtomicReference<Throwable> error=new AtomicReference<>();
        runOnMainSync(()->{try{fn.run();}catch(Throwable e){error.set(e);}});
        Throwable e=error.get();if(e instanceof Exception)throw (Exception)e;if(e instanceof Error)throw (Error)e;
    }
    private static View named(View view,String label){
        if(view.getVisibility()!=View.VISIBLE)return null;
        if(label.contentEquals(view.getContentDescription()==null?"":view.getContentDescription())
            ||view instanceof TextView&&label.contentEquals(((TextView)view).getText()))return view;
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){
            View match=named(group.getChildAt(i),label);if(match!=null)return match;
        }}return null;
    }
    private void click(MainActivity a,String label)throws Exception{
        main(()->{View v=named(a.modal==null?a.content:a.modal,label);
            while(v!=null&&!v.isClickable())v=v.getParent() instanceof View?(View)v.getParent():null;
            require(v!=null&&v.isEnabled()&&v.performClick(),"Contrôle absent ou inactif : "+label);
        });
    }
    private void screen(MainActivity a,File dir,String name)throws Exception{
        Thread.sleep(250);
        CountDownLatch done=new CountDownLatch(1);AtomicReference<Integer> status=new AtomicReference<>();
        Bitmap b=Bitmap.createBitmap(390,780,Bitmap.Config.ARGB_8888);
        try{
            main(()->{
                require(a.root.getWidth()==390&&a.root.getHeight()==780&&a.viewportHeight()==780,
                    "Surface Android "+a.root.getWidth()+"×"+a.root.getHeight()+", hauteur utile "+a.viewportHeight());
                PixelCopy.request(a.getWindow(),b,code->{status.set(code);done.countDown();},a.handler);
            });
            require(done.await(8,TimeUnit.SECONDS)&&status.get()==PixelCopy.SUCCESS,"PixelCopy "+name+" : "+status.get());
            try(FileOutputStream out=new FileOutputStream(new File(dir,"android-"+name+".png"))){require(b.compress(Bitmap.CompressFormat.PNG,100,out),"Capture de "+name);}
        }finally{b.recycle();}
    }
    private String surfaces(Context ctx)throws Exception {
        require(Build.VERSION.SDK_INT==31,"API Android "+Build.VERSION.SDK_INT);
        MainActivity a=(MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
            main(()->{require(a.modal!=null,"Tutoriel au premier démarrage");a.fullscreen();});screen(a,dir,"tuto");
            click(a,"Passer");screen(a,dir,"scene");click(a,"Menu");screen(a,dir,"menu");
            click(a,"Aperçu sans son");
            main(()->a.scene.edit.setText("Bonjour Lectura. Ceci est un essai natif. ".repeat(18)));
            click(a,"Menu");click(a,"Aperçu sans son");
            for(int i=0;i<30;i++){
                AtomicReference<Boolean> ready=new AtomicReference<>();main(()->ready.set(a.reading!=null&&a.reading.playing));
                if(ready.get())break;Thread.sleep(100);
            }
            screen(a,dir,"lecture");click(a,"Pause");click(a,"Reprendre");click(a,"Arrêter");click(a,"Accélérer");
            main(()->{require(a.stopped&&a.reading!=null&&!a.reading.playing&&a.reading.terminal.shown>0,"Arrêt de lecture");
                require(a.project.speed==1.25f,"Vitesse 1.25x");});
            click(a,"Masquer le texte du terminal");main(()->require(a.stage.masked,"Masquage du terminal"));
            click(a,"Afficher le texte du terminal");main(()->require(!a.stage.masked,"Réaffichage du terminal"));
            for(String[] route:new String[][]{{"Projets","projets"},{"Personnages","personnages"},{"Réglages","reglages"},{"Pro","pro"},{"À propos","apropos"}}){
                click(a,"Menu");click(a,route[0]);main(()->require(a.route.equals(route[1]),route[0]));
                click(a,"Retour à la scène");
            }
            return "API 31, installation, tutoriel, scène, menu, aperçu, pause/reprise/arrêt, vitesse, œil, cinq destinations";
        }finally{main(a::finish);}
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
    private String media(Context ctx,String ext)throws Exception {
        File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
        File wav=File.createTempFile("tone-",".wav",dir);int rate=48000;long frames=rate*2;
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
            {
                int w=ext.equals("mp4")?1280:720,h=ext.equals("mp4")?720:1280;
                File encoded=encode(a,pcm,dir,ext,w,h);File named=new File(dir,"lectura-test."+ext);Files.move(encoded.toPath(),named.toPath(),StandardCopyOption.REPLACE_EXISTING);
                Uri shared=SharedMedia.reserveShare(ctx,named,named.getName());try(InputStream in=ctx.getContentResolver().openInputStream(shared)){require(in!=null&&in.read()>=0,"Flux URI " + ext);}
                try(Pcm decoded=Pcm.decode(named,dir)){require(decoded.duration()>1200,"Audio réel " + ext);short[] b=new short[4096];int n=decoded.read(decoded.rate/2,b,4096);int peak=0;for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)b[i]));require(peak>5000,"Audio audible "+ext);}
                if(ext.equals("mp4")){
                    File mp3=new File(dir,"lectura-test.mp3");Mp3.transcode(named,mp3,dir);
                    MediaExtractor x=new MediaExtractor();try{x.setDataSource(mp3.getPath());require(x.getTrackCount()==1&&MediaFormat.MIMETYPE_AUDIO_MPEG.equals(x.getTrackFormat(0).getString(MediaFormat.KEY_MIME)),"Vrai MP3");}finally{x.release();}
                    Uri saved=SharedMedia.publish(ctx,named,named.getName());
                    try(InputStream in=ctx.getContentResolver().openInputStream(saved)){require(in!=null&&in.read()>=0,"MediaStore");}
                    finally{ctx.getContentResolver().delete(saved,null,null);}
                    Movies lib=new Movies(ctx);lib.save(named,named.getName());Movies.Entry entry=new Movies(ctx).list().get(0);
                    require(entry.file.length()==named.length()&&entry.format.equals(ext),"Mes vidéos persistant");lib.delete(entry);
                    Uri shareAudio=SharedMedia.reserveShare(ctx,mp3,mp3.getName());try(InputStream in=ctx.getContentResolver().openInputStream(shareAudio)){require(in!=null&&in.read()>=0,"Flux URI MP3");}
                }
            }
        }finally{wav.delete();runOnMainSync(a::finish);}
        return ext.equals("mp4")?"1280×720 H.264/AAC, MP3, MediaStore, Mes vidéos et flux de partage":
            "720×1280 VPx/Opus, décodage des pistes et flux de partage";
    }
    private File encode(MainActivity a,Pcm pcm,File dir,String ext,int w,int h)throws Exception {
        MediaExport.Recording r=new MediaExport.Recording(w,h,dir,pcm);ExecutorService worker=Executors.newSingleThreadExecutor();CountDownLatch start=new CountDownLatch(1);
        Future<File> done=worker.submit(()->r.run(ext,start::countDown));try{
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!start.await(200,TimeUnit.MILLISECONDS)){if(done.isDone())return done.get();require(System.nanoTime()<deadline,"Démarrage de l'encodeur " +ext);}
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(35);
            r.mark(new MediaExport.Mark(0,0,1,true));
            for(int i=0;i<48;i++){
                while(!r.room()){if(done.isDone())return done.get();require(System.nanoTime()<deadline,"Encodage bloqué : "+ext);Thread.sleep(3);}
                final int frame=i;Bitmap bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
                runOnMainSync(()->{a.stage.sprite.tick(1000+frame*1000./30);a.reading.terminal.shown=a.reading.text.length()*frame/47;
                    a.stage.exportDraw(new Canvas(bitmap),w,h,false,frame*1000./30);});r.offer(bitmap,i*1_000_000L/30);
            }
            r.end(1_600_000);return done.get(40,TimeUnit.SECONDS);
        }finally{r.cancel();worker.shutdownNow();}
    }
    private String hd(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            require(Hd.supported(),"AAR ONNX absent");
            require(h.voices.size()==10,"Catalogue des voix HD");
            File partial=new File(refs.context.getFilesDir(),"models/gilles.onnx.part");
            h.remove("gilles");
            try{h.download("gilles",(a,b)->{if(a<b)throw new java.util.concurrent.CancellationException();});throw new AssertionError("Téléchargement Piper non interrompu");}
            catch(java.util.concurrent.CancellationException expected){require(partial.length()>0,"Reprise Piper sans segment partiel");}
            h.download("gilles",(a,b)->{});require(!partial.exists()&&h.installed(h.voice("gilles")),"Reprise du téléchargement Piper");
            String text="Bonjour Lectura.\n$ echo\nTrès bien !";
            File synthesis;
            try(Pcm f=h.synth(text,"gilles",1,28,(a,b)->{}).pcm){
                require(f.frames>f.rate,"Synthèse ONNX vide");synthesis=f.file;
                short[] samples=new short[f.rate];int n=f.read(0,samples,samples.length),peak=0;
                for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)samples[i]));require(peak>1000,"Synthèse ONNX muette");
            }
            try(Pcm cached=h.synth(text,"gilles",1,28,(a,b)->require(b==1,"Cache non réutilisé")).pcm){require(synthesis.equals(cached.file),"Cache Piper");}
            h.remove("gilles");require(!h.installed(h.voice("gilles")),"Suppression modèle Piper");
            return "Voix Piper Gilles d’origine : téléchargement interrompu/repris, inférence avec PCM audible, cache, suppression";
        }
    }
}
