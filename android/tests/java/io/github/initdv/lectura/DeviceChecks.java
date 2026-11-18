package io.github.initdv.lectura;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Process;
import android.os.ResultReceiver;
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
    private boolean failed;
    @Override public void onStart(){
        Context ctx=getTargetContext(); Refs refs=new Refs(ctx);
        check("surfaces",()->surfaces(ctx));
        check("fixtures",()->refsAndModels(refs));
        check("audio-importe",()->imported(ctx));
        check("tts",()->tts(ctx));
        check("enregistrement",()->recordFromScene(ctx));
        for(String format:new String[]{"mp4","webm"})check(format,()->media(ctx,format));
        if("true".equals(args.getString("hd"))){
            check("piper",()->hd(refs));
            check("piper-mls",()->mls(refs));
        }
        Bundle out=new Bundle();out.putString("stream","\nLECTURA_COMPLETE\n");
        finish(failed?Activity.RESULT_CANCELED:Activity.RESULT_OK,out);
    }
    private interface Check { String run() throws Exception; }
    private void check(String name,Check c){
        String message;
        try{String result=c.run();message=(result.startsWith("hors test")?"LECTURA_SKIP ":"LECTURA_OK ")+name+" : "+result;}
        catch(Throwable e){
            failed=true;message="LECTURA_ERROR "+name+" : "+e+"\n"+android.util.Log.getStackTraceString(e);
        }
        Bundle status=new Bundle();status.putString("stream","\n"+message+"\n");sendStatus(0,status);
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
    private static JSONArray bounds(View v){
        JSONArray box=new JSONArray();if(v==null)return box;int[] xy=new int[2];v.getLocationOnScreen(xy);
        return box.put(xy[0]).put(xy[1]).put(v.getWidth()).put(v.getHeight());
    }
    private static View action(View view,String label){
        if(view.getVisibility()!=View.VISIBLE)return null;
        if(view.hasOnClickListeners()&&(label.contentEquals(view.getContentDescription()==null?"":view.getContentDescription())
            ||view instanceof TextView&&label.contentEquals(((TextView)view).getText())))return view;
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){
            View match=action(group.getChildAt(i),label);if(match!=null)return match;
        }}return null;
    }
    private void click(MainActivity a,String label)throws Exception{
        main(()->{View v=action(a.modal==null?a.content:a.modal,label);
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
            main(()->{
                JSONObject boxes=new JSONObject();ViewGroup sheet=(ViewGroup)((ViewGroup)a.modal).getChildAt(0);
                ViewGroup body=(ViewGroup)sheet.getChildAt(0);
                boxes.put("dialog",bounds(sheet));boxes.put("title",bounds(body.getChildAt(0)));
                boxes.put("name",bounds(named(sheet,a.t("editeur.titreProjet"))));
                for(String label:new String[]{"Enregistrer","Projets","Importer .txt / .md","Aperçu sans son","Plein écran"})boxes.put(label,bounds(named(sheet,label)));
                Library.writeJson(new File(dir,"android-menu-boxes.json"),boxes);
            });
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
    private void waitFor(String message,java.util.function.BooleanSupplier condition,long millis)throws Exception {
        long deadline=android.os.SystemClock.uptimeMillis()+millis;AtomicReference<Boolean> ready=new AtomicReference<>();
        while(android.os.SystemClock.uptimeMillis()<deadline){main(()->ready.set(condition.getAsBoolean()));if(ready.get())return;Thread.sleep(80);}
        throw new AssertionError(message);
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
        JSONObject subtitles=fixture.getJSONObject("subtitles");Project p=new Project(refs.defaults);
        Script.importSubtitles(subtitles.getString("vtt"),p);require(p.text.equals(subtitles.getString("text")),"Texte VTT");
        List<Script.Segment> parts=p.recalc();require(p.subtitles&&Script.subtitles(parts,false).equals(subtitles.getString("srt")),"Export SRT");
        require(Script.subtitles(parts,true).equals(subtitles.getString("exported")),"Export VTT");
        require(Project.fromJson(p.json()).text.equals(p.text),"Projet version 1");
        int pro=0;for(var i=refs.expressions.keys();i.hasNext();)if(refs.expressions.getJSONObject(i.next()).optBoolean("pro"))pro++;
        require(pro==fixture.getInt("proExpressions"),"Expressions Pro");
        JSONObject licence=fixture.getJSONObject("licence");String key=licence.getString("key");JSONObject pub=licence.getJSONObject("public");
        require(Library.verify(key,"lectura-ci",pub).isEmpty(),"Licence Web Crypto/Android");
        require(Library.verify(key,"autre-appareil",pub).equals("installation"),"Licence liée à l'installation");
        require(!Library.verify(key.replaceFirst("^.","_"),"lectura-ci",pub).isEmpty(),"Licence altérée");
        return "43 rigs, "+pro+" expressions Pro, 8 cas G2P, 8 chronologies, SRT/VTT, projet v1 et licence P-256";
    }
    private File tone(Context ctx,int seconds)throws Exception {
        File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
        File wav=File.createTempFile("tone-",".wav",dir);int rate=48000,frames=rate*seconds;
        try(RandomAccessFile out=new RandomAccessFile(wav,"rw")){Pcm.header(out,1,rate,frames*2);
            for(int i=0;i<frames;i++){short x=(short)(11000*Math.sin(2*Math.PI*440*i/rate));out.writeByte(x&255);out.writeByte(x>>8);}}
        return wav;
    }
    private MainActivity open(Context ctx){return (MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
    private String imported(Context ctx)throws Exception{
        MainActivity a=open(ctx);File input=tone(ctx,6);
        try{
            main(()->{a.dismiss();a.open(new Project(a.db.settings));a.scene.edit.setText("Bonjour, ceci est une leçon.");a.importAudio(Uri.fromFile(input),"tonalité.wav");});
            waitFor("Import audio non terminé",()->a.project.fileAudio&&a.db.audio(a.project).isFile(),10000);
            main(()->{a.muted=true;a.launch(false);});
            waitFor("Lecture synchronisée du WAV",()->a.reading!=null&&a.reading.playing&&a.reading.time()>350&&a.reading.terminal.shown>0,10000);
            main(()->{
                require(a.reading.pcm!=null&&a.reading.duration>=5900,"Piste fichier perdue");
                require(a.reading.viseme(a.reading.time(),700,true)>0,"Lip-sync audio importé");
                a.reading.pause();a.playState();require(!a.reading.playing,"Pause WAV");
                a.seek(1500);a.project.speed=1.25f;a.adjustRate();a.startPlaying();
            });
            waitFor("Reprise du fichier",()->a.reading!=null&&a.reading.playing&&a.reading.time()>1700,10000);
            main(a::stop);return "WAV copié et décodé via le chemin d'import, lecture, pause, avance, vitesse et lip-sync sous muet";
        }finally{input.delete();main(()->{a.db.audio(a.project).delete();a.finish();});}
    }
    private String tts(Context ctx)throws Exception{
        MainActivity a=open(ctx);
        try{
            waitFor("Initialisation TextToSpeech",()->a.talk.ready||a.talk.failure,7000);
            AtomicReference<String> voice=new AtomicReference<>();
            main(()->{var v=a.talk.choose("fr","");if(v!=null&&!v.isNetworkConnectionRequired())voice.set(v.getName());});
            if(voice.get()==null)return "hors test de lecture : aucune voix française locale exploitable sur cette image";
            main(()->{a.dismiss();a.open(new Project(a.db.settings));a.selectVoice("webspeech",voice.get());a.scene.edit.setText("Bonjour.\n$ echo test\nLectura lit un texte.");a.launch(false);});
            waitFor("TextToSpeech n'a pas terminé la phrase et la commande",()->a.reading!=null&&a.reading.ended,17000);
            return "voix française locale, lecture jusqu'au bout avec une commande non prononcée";
        }finally{main(a::finish);}
    }
    private void shareGrant(MainActivity a,File media)throws Exception {
        String name=media.getName();Uri uri=SharedMedia.reserveShare(a,media,name);
        AtomicReference<Bundle> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        main(()->{
            Intent intent=SharedMedia.shareIntent(a,uri,name).setComponent(new ComponentName(getContext().getPackageName(),ShareReceiver.class.getName()));
            intent.putExtra("lectura.test.result",new ResultReceiver(a.handler){
                @Override protected void onReceiveResult(int code,Bundle data){data.putInt("status",code);result.set(data);done.countDown();}
            });a.startActivity(intent);
        });
        require(done.await(8,TimeUnit.SECONDS),"Récepteur de partage absent : "+name);
        Bundle received=result.get();
        require(received.getInt("status")==Activity.RESULT_OK&&received.getInt("uid")==getContext().getApplicationInfo().uid
            &&received.getInt("uid")!=Process.myUid()&&SharedMedia.mime(SharedMedia.extension(name)).equals(received.getString("mime")),
            "Partage interapplications : "+name+" ; "+received);
        waitFor("Retour depuis le récepteur",()->a.isForeground,6000);
    }
    private String recordFromScene(Context ctx)throws Exception {
        MainActivity a=open(ctx);File wave=tone(ctx,6);File dir=wave.getParentFile();String title="verification-lectura-"+System.nanoTime();
        try{
            main(()->{
                a.dismiss();a.record();require(!a.exports.active(),"Enregistrement gratuit autorisé");
                // Exercise the Pro UI in the signed test process; never write a licence or change the production key.
                a.pro=true;a.open(new Project(a.db.settings));a.db.set("formatVideo","9:16");a.project.title=title;
                a.scene.edit.setText("Bonjour, ceci est une leçon. Deuxième phrase. Dernière phrase.");a.importAudio(Uri.fromFile(wave),"tonalité.wav");
            });
            waitFor("Import pour enregistrement",()->a.project.fileAudio,10000);
            main(()->{a.muted=true;a.launch(false);});
            waitFor("Lecture initiale",()->a.reading!=null&&a.reading.pcm!=null&&a.reading.time()>300,10000);
            click(a,"Menu");click(a,"Enregistrer la vidéo");
            waitFor("Démarrage enregistrement de la scène",()->a.exports.capturing()&&a.reading.playing,15000);
            Thread.sleep(350);main(()->{a.project.speed=1.25f;a.adjustRate();});
            Thread.sleep(1200);click(a,"Menu");click(a,"Arrêter l’enregistrement");
            waitFor("Dialogue Télécharger",()->a.modal!=null&&action(a.modal,"Télécharger")!=null,15000);
            click(a,"Télécharger");
            Movies lib=new Movies(ctx);Movies.Entry movie=null;
            for(int i=0;i<100&&movie==null;i++){
                for(Movies.Entry e:lib.list())if(e.title.equals(title)){movie=e;break;}
                if(movie==null)Thread.sleep(100);
            }
            require(movie!=null,"Enregistrement absent de Mes vidéos");
            try {
                require(movie.format.equals("mp4"),"Sortie MP4 portrait attendue sur cet émulateur");
                MediaExport.verify(movie.file,new MediaExport.Format(MediaFormat.MIMETYPE_VIDEO_AVC,false),720,1280,true);
                try(Pcm decoded=Pcm.decode(movie.file,dir)){
                    short[] audio=new short[4096];int n=decoded.read(decoded.rate/2,audio,audio.length),peak=0;
                    for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)audio[i]));require(peak>5000,"L'export de scène ignore le son d'écoute coupé");
                }
                Files.copy(movie.file.toPath(),new File(dir,"lectura-scene-portrait.mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);
                click(a,"Menu");click(a,"Mes vidéos");click(a,"Lire");
                waitFor("Lecture depuis Mes vidéos",()->{
                    android.widget.VideoView video=video(a.modal);return video!=null&&video.isPlaying();
                },10000);
                main(a::dismiss);
            }finally{lib.delete(movie);}
            return "Menu Pro : enregistrer/arrêter, MP4 portrait avec son malgré le muet, télécharger, conserver et lire dans Mes vidéos";
        }finally{
            wave.delete();main(()->{a.db.audio(a.project).delete();a.finish();});
            var catalog=android.provider.MediaStore.Video.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY);
            ctx.getContentResolver().delete(catalog,android.provider.MediaStore.MediaColumns.DISPLAY_NAME+" = ?",new String[]{title+".mp4"});
        }
    }
    private static android.widget.VideoView video(View root){
        if(root instanceof android.widget.VideoView)return (android.widget.VideoView)root;
        if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){
            android.widget.VideoView child=video(group.getChildAt(i));if(child!=null)return child;
        }}return null;
    }
    private String media(Context ctx,String ext)throws Exception {
        File wav=tone(ctx,2),dir=wav.getParentFile();
        MainActivity a=(MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<Throwable> setup=new AtomicReference<>();
        runOnMainSync(()->{try{
            a.dismiss();a.project.text=a.t("voix.exemple");a.render("scene");
            var kw=new Script.Keywords(a.refs,"fr",false,new JSONObject());List<Script.Segment> p=Script.timing(a.project.text,2000,1);
            a.reading=new Reading(a.project.text,p,kw,true,null,a.talk,null,a.project,1,()->{},code->{});
            a.mood=new Mood(a.refs,"fr",kw,false,true);a.muted=true;a.reading.volume(0,true);a.reading.terminal.shown=a.project.text.length();
        }catch(Throwable e){setup.set(e);}});if(setup.get()!=null)throw new AssertionError(setup.get());
        try(Pcm pcm=Pcm.decode(wav,dir)){
            require(pcm.duration()>=1999,"Durée décodée WAV");
            {
                int w=ext.equals("mp4")?1280:720,h=ext.equals("mp4")?720:1280;
                File encoded=encode(a,pcm,dir,ext,w,h);File named=new File(dir,"lectura-test."+ext);Files.move(encoded.toPath(),named.toPath(),StandardCopyOption.REPLACE_EXISTING);
                shareGrant(a,named);
                try(Pcm decoded=Pcm.decode(named,dir)){require(decoded.duration()>1200,"Audio réel " + ext);short[] b=new short[4096];int n=decoded.read(decoded.rate/2,b,4096);int peak=0;for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)b[i]));require(peak>5000,"Audio audible "+ext);
                    int crossings=0;for(int i=1;i<n;i++)if(b[i-1]<0&&b[i]>=0)crossings++;
                    double hz=crossings*(double)decoded.rate/n;require(hz>400&&hz<490,"Fréquence après accélération "+hz+" Hz");}
                if(ext.equals("mp4")){
                    File mp3=new File(dir,"lectura-test.mp3");Mp3.transcode(named,mp3,dir);
                    MediaExtractor x=new MediaExtractor();try{x.setDataSource(mp3.getPath());require(x.getTrackCount()==1&&MediaFormat.MIMETYPE_AUDIO_MPEG.equals(x.getTrackFormat(0).getString(MediaFormat.KEY_MIME)),"Vrai MP3");}finally{x.release();}
                    Uri saved=SharedMedia.publish(ctx,named,named.getName());
                    try(InputStream in=ctx.getContentResolver().openInputStream(saved)){require(in!=null&&in.read()>=0,"MediaStore");}
                    finally{ctx.getContentResolver().delete(saved,null,null);}
                    Movies lib=new Movies(ctx);lib.save(named,named.getName());Movies.Entry entry=new Movies(ctx).list().get(0);
                    require(entry.file.length()==named.length()&&entry.format.equals(ext),"Mes vidéos persistant");lib.delete(entry);
                    try(Pcm decoded=Pcm.decode(mp3,dir)){
                        require(decoded.duration()>1200,"Durée MP3");short[] probe=new short[4096];int n=decoded.read(decoded.rate/2,probe,probe.length),peak=0;
                        for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)probe[i]));require(peak>4000,"MP3 muet");
                    }
                    shareGrant(a,mp3);
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
            r.mark(new MediaExport.Mark(0,0,1.25,true));
            for(int i=0;i<48;i++){
                while(!r.room()){if(done.isDone())return done.get();require(System.nanoTime()<deadline,"Encodage bloqué : "+ext);Thread.sleep(3);}
                final int frame=i;Bitmap bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
                runOnMainSync(()->{a.stage.sprite.tick(1000+frame*1000./30);a.reading.terminal.shown=a.reading.text.length()*frame/47;
                    a.stage.exportDraw(new Canvas(bitmap),w,h,false,frame*1000./30);});r.offer(bitmap,i*1_000_000L/30);
            }
            r.end(1_600_000);return done.get(40,TimeUnit.SECONDS);
        }finally{r.cancel();worker.shutdownNow();}
    }
    private String mls(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            JSONObject one=h.voice("mls_f1"),two=h.voice("mls_m1");
            require(one!=null&&two!=null&&one.optString("modele").equals(two.optString("modele")),"Catalogue MLS partagé");
            require(one.getInt("speakerId")==0&&two.getInt("speakerId")==3,"Identifiants MLS d’origine");
            h.remove("mls_f1");h.download("mls_f1",(n,total)->{});
            try {
                require(h.installed(two),"Un seul téléchargement pour les locuteurs MLS");
                String sentence="Bonjour, voici les voix de Lectura.";
                try(Pcm a=h.synth(sentence,"mls_f1",1,28,(n,total)->{}).pcm;
                    Pcm b=h.synth(sentence,"mls_m1",1,28,(n,total)->{}).pcm){
                    short[] x=new short[a.rate],y=new short[b.rate];
                    int m=a.read(0,x,x.length),n=b.read(0,y,y.length);
                    require(a.duration()>700&&b.duration()>700&&peak(x,m)>1000&&peak(y,n)>1000
                        &&!java.util.Arrays.equals(x,y),"Deux sorties MLS audibles et distinctes");
                }
            }finally{h.remove("mls_f1");}
            require(!h.installed(two),"Suppression du modèle commun MLS");
            return "Modèle MLS d’origine commun aux locuteurs 0 et 3, deux synthèses PCM audibles et distinctes";
        }
    }
    private static int peak(short[] samples,int n){int p=0;for(int i=0;i<n;i++)p=Math.max(p,Math.abs((int)samples[i]));return p;}
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
