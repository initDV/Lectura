package io.github.initdv.lectura;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.view.KeyEvent;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Process;
import android.os.ResultReceiver;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
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
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Separate signed test APK; no instrumentation hooks in the product. */
public final class DeviceChecks extends Instrumentation {
    private Bundle args;
    @Override public void onCreate(Bundle options){args=options;start();}
    private boolean failed;
    @Override public void onStart(){
        Context ctx=getTargetContext(); Refs refs=new Refs(ctx);
        switch(args.getString("mode","clean")){
            case "download":
                check("reseau-avant-telechargement",()->{
                    waitFor("Reconnexion après le mode avion",()->ctx.getSystemService(ConnectivityManager.class).getActiveNetwork()!=null
                        &&Settings.Global.getInt(ctx.getContentResolver(),Settings.Global.AIRPLANE_MODE_ON,0)==0,30000);
                    return "Mode avion désactivé, réseau Android de nouveau actif";
                });
                check("piper",()->hd(refs));
                check("piper-mls",()->mls(refs));
                break;
            case "offline-hd":
                check("piper-en-avion",()->offlineHd(ctx));
                break;
            default:
                check("avion",()->airplane(ctx));
                check("surfaces",()->surfaces(ctx));
                check("fixtures",()->refsAndModels(refs));
                check("catalogue-et-reglages",()->fullAccess(ctx));
                check("lips-reference",()->lipsReference(ctx,refs));
                check("audio-importe",()->imported(ctx));
                check("tts-local",()->tts(ctx));
                check("sous-titres-et-capture",()->subtitlesAndPng(ctx));
                check("video-interface",()->recordFromScene(ctx));
                for(String format:new String[]{"mp4","webm"})check(format,()->media(ctx,format));
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
            boolean espeak="true".equals(args.getString("espeak"));
            waitFor("La fenêtre de test et la voix locale doivent être prêtes",()->a.isForeground&&a.hasWindowFocus()
                &&(!espeak||a.talk.voices("fr").stream().anyMatch(v->!v.isNetworkConnectionRequired())),15000);
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
            main(()->{a.dismiss();a.scene.edit.setText("Bonjour Lectura. Ceci est un essai natif. ".repeat(18));});
            click(a,"Menu");click(a,"Aperçu sans son");
            // Click in the same UI callback that observes the playing state. PixelCopy and PNG
            // encoding are kept out of this time-sensitive part of the transport test.
            try{
                waitFor("Aperçu en cours et contrôle Pause disponibles",()->{
                    if(!a.isForeground||!a.hasWindowFocus()||a.modal!=null||a.reading==null||!a.reading.silent
                        ||!a.reading.playing||a.reading.terminal.shown==0)return false;
                    View pause=action(a.content,a.t("scene.pause"));
                    return pause!=null&&pause.isEnabled()&&pause.performClick();
                },10000);
            }catch(AssertionError e){
                AtomicReference<String> detail=new AtomicReference<>();
                main(()->detail.set("focus="+a.hasWindowFocus()+", premierPlan="+a.isForeground+", modal="+(a.modal!=null)
                    +", bouton="+(a.scene==null?"absent":a.scene.launch.getText())+", préparation="+a.preparing
                    +", lecture="+(a.reading==null?"absente":a.reading.playing+"/"+a.reading.ended+" chars="+a.reading.terminal.shown)));
                throw new AssertionError(e.getMessage()+" ; "+detail.get(),e);
            }
            main(()->require(!a.reading.playing&&!a.reading.ended&&!a.stopped,"La commande Pause doit suspendre l’aperçu"));
            screen(a,dir,"lecture");click(a,"Reprendre");
            main(()->require(a.reading.playing,"L’aperçu n’a pas repris"));
            click(a,"Arrêter");click(a,"Accélérer");
            main(()->{require(a.stopped&&a.reading!=null&&!a.reading.playing&&a.reading.terminal.shown>0,"Arrêt de lecture");
                require(a.project.speed==1.25f,"Vitesse 1.25x");});
            click(a,"Masquer le texte du terminal");main(()->require(a.stage.masked,"Masquage du terminal"));
            click(a,"Afficher le texte du terminal");main(()->require(!a.stage.masked,"Réaffichage du terminal"));
            for(String[] route:new String[][]{{"Projets","projets"},{"Personnages","personnages"},{"Réglages","reglages"},{"À propos","apropos"}}){
                click(a,"Menu");click(a,route[0]);main(()->require(a.route.equals(route[1]),route[0]));
                click(a,"Retour à la scène");
            }
            return "API 31, installation, tutoriel, scène, menu, aperçu, pause/reprise/arrêt, vitesse, œil, quatre destinations de base";
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
        for(JSONObject def:refs.characters){Sprite s=new Sprite(refs,def);s.expression("enthousiaste",1,"triste",.3);
            for(int i=0;i<8;i++){s.viseme=i%4;s.letter="aeiou".substring(i%5,i%5+1);s.tick(i*16);}
            s.svg.fit(c,0,0,200,330,true);
        }
        frame.recycle();JSONObject fixture=fixtures();
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
        JSONArray characters=fixture.getJSONArray("characters"),expressions=fixture.getJSONArray("expressions");
        require(characters.length()==43&&expressions.length()==38,"Catalogue de référence");
        for(int i=0;i<characters.length();i++)require(refs.characters.get(i).optString("id").equals(characters.getString(i)),"Ordre du catalogue");
        JSONObject personal=Refs.put(new JSONObject(),"ci",Refs.put(new JSONObject(),"mots",new JSONArray().put("lecturaciunique")));
        Script.Keywords words=new Script.Keywords(refs,"fr",personal);
        require(words.find("GDScript lecturaciunique").size()==2,"Dictionnaires étendu et personnalisé");
        Mood mood=new Mood(refs,"fr",words,true);
        for(int i=0;i<expressions.length();i++){
            String id=expressions.getString(i);Script.Segment part=Script.timing("Bonjour.",1000,0).get(0);part.expression=id;
            require(mood.pose(part,0).expr.equals(id),"Pose remplacée : "+id);
        }
        Script.Segment mixed=Script.timing("Bravo, je suis triste.",2000,0).get(0);
        require(!mood.summary(mixed).second.isEmpty()&&!mood.pose(mixed,mixed.text.length()).mix.isEmpty(),"Mélange d’émotions indisponible");
        return "43 rigs, 38 poses, mélange d’émotions, mots étendus/personnalisés, 8 cas G2P, 8 chronologies, SRT/VTT et projet v1";
    }
    private JSONObject fixtures()throws Exception{
        try(InputStream in=getContext().getAssets().open("fixtures.json")){
            return Refs.parse(new String(Refs.read(in,1000000),StandardCharsets.UTF_8));
        }
    }
    private File assetFile(Context ctx,String name)throws Exception{
        File target=File.createTempFile("fixture-",".wav",ctx.getCacheDir());
        try(InputStream in=getContext().getAssets().open(name)){
            Files.copy(in,target.toPath(),StandardCopyOption.REPLACE_EXISTING);
        }catch(Exception e){target.delete();throw e;}
        return target;
    }
    private String lipsReference(Context ctx,Refs refs)throws Exception {
        JSONObject f=fixtures().getJSONObject("lips");String text=f.getString("text");
        JSONArray speech=f.getJSONArray("speech"),audio=f.getJSONArray("audio"),paths=f.getJSONArray("paths");
        int speechFrames=0;
        for(int i=0;i<speech.length();i++){
            JSONArray trace=speech.getJSONArray(i);speechFrames+=trace.length();
            main(()->{
                long[] clock={0};Talk.Listener[] events={null};float rate=(float)f.getDouble("speed");int cps=f.getInt("cps");
                Talk.Queue q=new Talk.Queue((words,speed,pitch,vol,l)->{require(speed==rate,"Vitesse TTS");events[0]=l;},
                    ()->{},()->clock[0],text,cps,rate,1,()->{},code->{throw new AssertionError(code);});
                Script.Timeline timeline=new Script.Timeline(text,Script.timing(text,Script.estimate(text,rate,cps),(double)Script.VOICE_CPS/cps));
                try {
                    for(int j=0;j<trace.length();j++){
                        JSONArray r=trace.getJSONArray(j);long t=clock[0]=r.getLong(0);
                        switch(r.getString(1)){
                            case "play":q.play();break;case "pause":q.pause();break;
                            case "start":events[0].start();break;case "end":events[0].done();break;case "range":events[0].range(r.getInt(2));break;
                            default:break;
                        }
                        double pos=q.position();Script.Segment part=timeline.segment((int)pos);
                        int level=q.playing&&part!=null&&Script.type(part.text)==Script.SPOKEN?Reading.speechViseme(t,q.speaking(),text,pos):0;
                        require(Math.abs(pos-r.getDouble(3))<1e-9,"Position TTS à "+t+" ms : "+pos+" / "+r.getDouble(3));
                        require(level==r.getInt(4)&&Reading.letterAt(text,pos).equals(r.getString(5)),"Bouche TTS à "+t+" ms");
                    }
                }finally{q.stop();}
            });
        }
        File input=assetFile(ctx,"lips-reference.wav");
        int spectral=0;
        try(Pcm pcm=Pcm.decode(input,ctx.getCacheDir())){
            Lip lip=new Lip(pcm);Script.Timeline timeline=new Script.Timeline(text,Script.timing(text,pcm.duration(),0));
            for(int i=0;i<audio.length();i++){
                JSONArray r=audio.getJSONArray(i);double t=r.getDouble(0);int pos=timeline.charAt(t);
                Script.Segment part=timeline.segment(pos);int level=part!=null&&Script.type(part.text)==Script.SPOKEN?lip.read(t):0;
                if(level>0&&lip.shape!=48)spectral++;
                require(pos==r.getInt(1)&&level==r.getInt(2),"Fenêtre PCM à "+t+" ms : "+pos+"/"+level+" ; attendu "+r);
            }
        }finally{input.delete();}
        require(spectral>0,"Aucune variation spectrale de la bouche");
        String[] nodes={"levre-creux","levre-haut","levre-bas","bouche-dents","bouche-langue"};
        String[] keys={"interieur","levreHaut","levreBas","dents","langue"};
        for(int i=0;i<paths.length();i++){
            JSONObject p=paths.getJSONObject(i),expected=p.getJSONObject("paths");Sprite s=new Sprite(refs,refs.character("wend"));
            s.expression(p.getString("expr"),1,"",0);s.viseme=p.getInt("level");s.letter=p.getString("letter");s.tick(16);
            for(int j=0;j<nodes.length;j++){
                Svg.Node node=s.svg.get(nodes[j]);String d=expected.getString(keys[j]);
                require(node.alpha==(d.isEmpty()?0:1),"Visibilité "+nodes[j]);
                if(!d.isEmpty())require(Arrays.equals(node.current.approximate(.04f),Svg.parsePath(d).approximate(.04f)),"Tracé "+nodes[j]+" (cas "+i+")");
            }
        }
        return speechFrames+" images TTS (callbacks rejoués, avec/sans limites de mots), "+audio.length()+" fenêtres du même WAV ("+spectral+" variations spectrales) et "+paths.length()+" formes Wend : positions/niveaux/tracés de référence à 1,25×";
    }
    private static boolean noNetwork(Context ctx){
        return Settings.Global.getInt(ctx.getContentResolver(),Settings.Global.AIRPLANE_MODE_ON,0)==1
            &&ctx.getSystemService(ConnectivityManager.class).getActiveNetwork()==null;
    }
    private String airplane(Context ctx)throws Exception{
        waitFor("Mode avion sans réseau actif",()->noNetwork(ctx),10000);
        return "Mode avion actif ; aucun réseau Android disponible pour Lectura";
    }
    private static final java.util.regex.Pattern SALES_COPY=java.util.regex.Pattern.compile(
        "(?iu)\\bpro\\b|paywall|licen[cs]e key|clé de licence|identifiant d’installation|installation id");
    private static void noSalesCopy(View v){
        String visible=String.valueOf(v.getContentDescription());
        if(v instanceof TextView)visible+=" / "+((TextView)v).getText()+" / "+((TextView)v).getHint();
        require(!SALES_COPY.matcher(visible).find(),"Mention commerciale : "+visible);
        if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)noSalesCopy(group.getChildAt(i));}
    }
    private void available(View root,String label){
        View v=action(root,label);require(v!=null&&v.isEnabled(),"Fonction indisponible : "+label);
    }
    private String fullAccess(Context ctx)throws Exception{
        MainActivity a=open(ctx);
        try {
            main(()->{
                require(!a.db.settings.has("idInstallation")&&!a.db.settings.has("licence"),"Identifiant ou clé générée");
                require(!Arrays.asList(a.getAssets().list("")).contains("license-key.json"),"Clé produit dans l’APK");
                Voice network=new Voice("network",java.util.Locale.FRENCH,300,300,true,java.util.Set.of());
                Voice missing=new Voice("missing",java.util.Locale.FRENCH,300,300,false,java.util.Set.of(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
                require(!Talk.local(network)&&!Talk.local(missing),"Voix distante ou non installée proposée");
                Project p=new Project(a.db.settings);p.text="Bonjour Lectura.";a.open(p);
            });
            click(a,"Menu");click(a,"Personnages");
            for(JSONObject def:a.refs.characters){
                click(a,def.getString("nom"));
                main(()->require(a.project.character.equals(def.optString("id")),"Sélection : "+def.optString("id")));
            }
            click(a,"Hacker");click(a,a.t("editeur.expressions")+" (1)");click(a,a.t("editeur.expressionDe","n",1));
            List<String> poses=Screens.expressions(a.refs);
            main(()->{require(poses.size()==39,"38 poses + Auto");noSalesCopy(a.modal);
                for(String id:poses.subList(1,poses.size()))available(a.modal,a.t("expr."+id));});
            click(a,a.t("expr.colere"));click(a,"Retour à la scène");
            main(()->{
                require(a.stage.sprite.svg.root.attr("aria-label").equals("Hacker"),"Personnage Hacker non rendu");
                require(a.project.recalc().get(0).expression.equals("colere"),"Pose imposée non conservée");
                a.content.requestFocus();
                for(int i=0;i<poses.size()-2;i++)a.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_E));
                require(a.forced.equals(poses.get(poses.size()-1)),"Raccourci E incomplet");
            });
            for(String lang:new String[]{"fr","en"})main(()->{
                a.db.set("langue",lang);a.go("scene");noSalesCopy(a.content);a.menu();noSalesCopy(a.modal);
                for(String key:List.of("editeur.importerSrt","menu.exporterSrt","menu.exporterVtt","scene.capture","scene.enregistrer","menu.mesVideos"))
                    available(a.modal,a.t(key));
                a.go("personnages");noSalesCopy(a.content);
                a.go("reglages");noSalesCopy(a.content);
                require(named(a.content,a.t("reglages.vitesse")) instanceof android.widget.SeekBar&&named(a.content,a.t("reglages.vitesse")).isEnabled(),"Réglage CPS absent");
                available(a.content,a.t("reglages.mots.ajouter"));require(named(a.content,a.t("voix.hd.titre"))!=null,"Réglages voix HD");
                a.go("apropos");noSalesCopy(a.content);require(named(a.content,"R")!=null,"Raccourci R absent");
                require(named(a.content,a.t("apropos.licences"))!=null,"Attributions légales absentes");
            });
            main(()->{a.db.set("langue","fr");a.go("reglages");
                available(a.content,"Sombre");available(a.content,"JetBrains Mono");});
            click(a,"Sombre");click(a,"Matrix");click(a,"JetBrains Mono");click(a,"Système");
            main(()->{
                android.widget.SeekBar speed=(android.widget.SeekBar)named(a.content,a.t("reglages.vitesse"));
                Bundle progress=new Bundle();progress.putFloat(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,85);
                require(speed.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId(),progress),"Vitesse du terminal indisponible");
                a.go("scene");require(a.project.cps==90&&a.stage.term.optString("nom").equals("Matrix")
                    &&a.stage.termFont.equals(android.graphics.Typeface.MONOSPACE),"Réglages terminal non appliqués");
                a.db.set("personnageId","robot_lectura");a.db.set("themeTerminal","sombre");
                a.db.set("policeTerminal","JetBrains Mono");a.db.set("vitesseDefilement",28);
            });
            return "43 personnages sélectionnés, 38 poses + Auto, FR/EN sans offre ni clé ; terminal, mots personnalisés, vidéo, sous-titres et galerie accessibles";
        }finally{main(a::finish);}
    }
    // Use the real menu actions and the platform activity-result contract. No DocumentsUI is
    // needed on the test device: the monitor returns a local document owned by the test app.
    private void document(MainActivity a,String label,String intentAction,File file)throws Exception {
        IntentFilter filter=new IntentFilter(intentAction);filter.addCategory(Intent.CATEGORY_OPENABLE);filter.addDataType("*/*");
        ActivityMonitor monitor=addMonitor(filter,new ActivityResult(Activity.RESULT_OK,new Intent().setData(Uri.fromFile(file))),true);
        try{
            click(a,a.t("scene.menu"));click(a,label);
            waitFor("Résultat du sélecteur : "+label,()->monitor.getHits()==1&&a.result==null,5000);
        }finally{removeMonitor(monitor);}
    }
    private String subtitlesAndPng(Context ctx)throws Exception{
        MainActivity a=open(ctx);File dir=ctx.getExternalFilesDir("verification");File input=tone(ctx,6);
        File srt=new File(dir,"lectura-export.srt"),vtt=new File(dir,"lectura-export.vtt"),png=new File(dir,"lectura-capture.png");
        JSONObject f=fixtures().getJSONObject("subtitles");
        try{
            main(()->a.open(new Project(a.db.settings)));
            Files.write(vtt.toPath(),f.getString("vtt").getBytes(StandardCharsets.UTF_8));
            document(a,a.t("editeur.importerSrt"),Intent.ACTION_OPEN_DOCUMENT,vtt);
            main(()->require(a.project.subtitles&&a.project.text.equals(f.optString("text")),"Import VTT via le menu"));
            document(a,a.t("menu.exporterSrt"),Intent.ACTION_CREATE_DOCUMENT,srt);
            require(new String(Files.readAllBytes(srt.toPath()),StandardCharsets.UTF_8).equals(f.getString("srt")),"Horodatages/export SRT");
            document(a,a.t("editeur.importerSrt"),Intent.ACTION_OPEN_DOCUMENT,srt);
            document(a,a.t("menu.exporterVtt"),Intent.ACTION_CREATE_DOCUMENT,vtt);
            require(new String(Files.readAllBytes(vtt.toPath()),StandardCharsets.UTF_8).equals(f.getString("exported")),"Réimport SRT et export VTT");
            main(()->a.importAudio(Uri.fromFile(input),"tonalité.wav"));
            waitFor("Import audio associé aux sous-titres",()->a.project.fileAudio,10000);
            main(()->a.launch(false));
            waitFor("Lecture sous-titrée",()->a.reading!=null&&a.reading.playing,10000);
            main(()->{
                Reading r=a.reading;require(r.timeline.parts.get(0).from==500&&r.timeline.parts.get(1).from==2500,"Timecodes non appliqués au WAV");
                require(r.timeline.charAt(499)==0&&r.timeline.charAt(1000)>0,"Révélation du texte selon les repères");
                a.stop();
            });
            document(a,a.t("scene.capture"),Intent.ACTION_CREATE_DOCUMENT,png);
            BitmapFactory.Options image=new BitmapFactory.Options();image.inJustDecodeBounds=true;BitmapFactory.decodeFile(png.getPath(),image);
            require(image.outWidth==1080&&image.outHeight==1920,"PNG portrait absent ou invalide");
            return "Import VTT et SRT, exports exacts, timecodes pris en compte sur le WAV, PNG 1080×1920";
        }finally{input.delete();main(()->{a.db.audio(a.project).delete();a.finish();});}
    }
    private File tone(Context ctx,int seconds)throws Exception {
        File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
        File wav=File.createTempFile("tone-",".wav",dir);int rate=48000,frames=rate*seconds;
        try(RandomAccessFile out=new RandomAccessFile(wav,"rw")){Pcm.header(out,1,rate,frames*2);
            for(int i=0;i<frames;i++){short x=(short)(11000*Math.sin(2*Math.PI*440*i/rate));out.writeByte(x&255);out.writeByte(x>>8);}}
        return wav;
    }
    private MainActivity open(Context ctx){return (MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
    // Observe the values from the actual drawn frame. t is a playback-clock sample, not an audio timestamp.
    private JSONArray sampleReading(MainActivity a,File dir,String name,long timeout)throws Exception {
        waitFor("Démarrage de la lecture : "+name,()->a.reading!=null&&a.reading.playing,10000);
        JSONArray frames=new JSONArray();boolean[] end={false};double[] duration={0};
        long start=android.os.SystemClock.uptimeMillis();
        while(!end[0]&&android.os.SystemClock.uptimeMillis()-start<timeout){
            main(()->{
                Reading r=a.reading;require(r!=null&&(r.playing||r.ended),"Lecture interrompue : "+name);
                Sprite s=a.stage.sprite;duration[0]=r.duration;
                frames.put(new JSONArray().put(android.os.SystemClock.uptimeMillis()-start).put(r.terminal.shown).put(s.viseme).put(s.letter));
                end[0]=r.ended;
            });
            if(!end[0])Thread.sleep(24);
        }
        require(end[0],"Lecture incomplète : "+name);
        Library.writeJson(new File(dir,"android-lips-"+name+".json"),new JSONObject().put("durationMs",duration[0]).put("frames",frames));
        int open=0;for(int i=0;i<frames.length();i++)if(frames.getJSONArray(i).getInt(2)>0)open++;
        require(open>0&&frames.getJSONArray(frames.length()-1).getInt(1)>0,"Aucune animation de bouche ou de terminal : "+name);
        return frames;
    }
    private String imported(Context ctx)throws Exception{
        MainActivity a=open(ctx);boolean spoken=Arrays.asList(getContext().getAssets().list("")).contains("lips-spoken.wav");
        String name=spoken?"lips-spoken.wav":"lips-reference.wav";File input=assetFile(ctx,name),dir=ctx.getExternalFilesDir("verification");
        var test=fixtures().getJSONObject("lips");String text=test.getString("text");float speed=(float)test.getDouble("speed");
        try{
            main(()->{a.dismiss();Project p=new Project(a.db.settings);p.speed=speed;p.text=text;a.open(p);a.importAudio(Uri.fromFile(input),name);});
            waitFor("Import audio non terminé",()->a.project.fileAudio&&a.db.audio(a.project).isFile(),10000);
            main(()->{a.muted=true;a.launch(false);});
            JSONArray frames=sampleReading(a,dir,"wav",18000);
            main(()->{
                require(a.reading.pcm!=null&&a.reading.terminal.shown==text.length()&&a.reading.rate==speed,"Lecture WAV à la vitesse prévue");
                a.startPlaying();
            });
            waitFor("Redémarrage du WAV",()->a.reading.playing&&a.reading.time()>200,6000);
            main(()->{a.reading.pause();a.playState();require(!a.reading.playing,"Pause WAV");a.seek(1000);a.startPlaying();});
            waitFor("Reprise après avance",()->a.reading.playing&&a.reading.time()>1400,6000);
            main(a::stop);
            return name+", texte et vitesse 1,25× communs à Pages, "+frames.length()+" observations ; pause, avance, reprise, animation sous muet";
        }finally{input.delete();main(()->{a.db.audio(a.project).delete();a.finish();});}
    }
    private String tts(Context ctx)throws Exception{
        MainActivity a=open(ctx);
        try{
            waitFor("Initialisation TextToSpeech",()->a.talk.ready||a.talk.failure,10000);
            AtomicReference<String> voice=new AtomicReference<>();
            main(()->{var v=a.talk.choose("fr","");if(v!=null&&!v.isNetworkConnectionRequired())voice.set(v.getName());});
            if(voice.get()==null){
                require(!"true".equals(args.getString("espeak")),"Moteur eSpeak NG installé mais aucune voix française locale");
                return "hors test de lecture : aucune voix française locale exploitable sur cette image";
            }
            var test=fixtures().getJSONObject("lips");String text=test.getString("text");float speed=(float)test.getDouble("speed");
            main(()->{a.dismiss();Project p=new Project(a.db.settings);p.speed=speed;p.text=text;a.open(p);
                a.selectVoice("webspeech",voice.get());a.launch(false);});
            JSONArray frames=sampleReading(a,ctx.getExternalFilesDir("verification"),"tts",20000);
            boolean command=false;
            for(int i=0,start=text.indexOf("$ "),end=text.indexOf('\n',start);i<frames.length();i++){
                var frame=frames.getJSONArray(i);int chars=frame.getInt(1);
                if(chars>=start&&chars<=end){command=true;require(frame.getInt(2)==0,"Visème pendant la commande");}
            }
            require(command,"La commande silencieuse n'a pas été affichée");
            return "voix française locale "+voice.get()+", même texte et vitesse 1,25×, "+frames.length()+" observations jusqu'à la fin (commande muette)";
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
                a.open(new Project(a.db.settings));a.project.title=title;
                a.scene.edit.setText("Bonjour, ceci est une leçon. Deuxième phrase. Dernière phrase.");a.importAudio(Uri.fromFile(wave),"tonalité.wav");
            });
            waitFor("Import pour enregistrement",()->a.project.fileAudio,10000);
            main(()->{a.muted=true;a.launch(false);});
            waitFor("Lecture initiale",()->a.reading!=null&&a.reading.pcm!=null&&a.reading.time()>300,10000);
            click(a,"Menu");click(a,"Vertical 9:16 (TikTok)");click(a,"Paysage 16:9 (YouTube)");
            main(()->require(a.db.settings.optString("formatVideo").equals("16:9"),"Format 16:9 indisponible"));
            click(a,"Paysage 16:9 (YouTube)");click(a,"Vertical 9:16 (TikTok)");
            click(a,"Enregistrer la vidéo");
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
                    for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)audio[i]));require(peak>5000,"Le muet d’écoute a supprimé le son de l’export");
                }
                Files.copy(movie.file.toPath(),new File(dir,"lectura-scene-portrait.mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);
                click(a,"Menu");click(a,"Mes vidéos");click(a,"Lire");
                waitFor("Lecture depuis Mes vidéos",()->{
                    android.widget.VideoView video=video(a.modal);return video!=null&&video.isPlaying();
                },10000);
                main(a::dismiss);
            }finally{lib.delete(movie);}
            return "Menu : formats 16:9 / 9:16, enregistrement et arrêt, MP4 portrait avec son, téléchargement et lecture dans Mes vidéos";
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
            var kw=new Script.Keywords(a.refs,"fr",new JSONObject());List<Script.Segment> p=Script.timing(a.project.text,2000,1);
            a.reading=new Reading(a.project.text,p,kw,true,null,a.talk,null,a.project,1,()->{},code->{});
            a.mood=new Mood(a.refs,"fr",kw,true);a.muted=true;a.reading.volume(0,true);a.reading.terminal.shown=a.project.text.length();
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
    private static int downloadWithRetry(Hd h,String id,Hd.Progress progress)throws Exception {
        for(int retries=0;;retries++){
            try{h.download(id,progress);return retries;}
            catch(java.net.SocketTimeoutException e){if(retries==2)throw e;Thread.sleep(400L*(retries+1));}
            catch(java.net.UnknownHostException e){if(retries==2)throw e;Thread.sleep(5000L*(retries+1));}
        }
    }
    private String mls(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            JSONObject one=h.voice("mls_f1"),two=h.voice("mls_m1");
            require(one!=null&&two!=null&&one.optString("modele").equals(two.optString("modele")),"Catalogue MLS partagé");
            require(one.getInt("speakerId")==0&&two.getInt("speakerId")==3,"Identifiants MLS d’origine");
            h.remove("mls_f1");int retries=downloadWithRetry(h,"mls_f1",(n,total)->{});
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
            return "Modèle MLS d’origine commun aux locuteurs 0 et 3, deux synthèses PCM audibles et distinctes (reprises après délai réseau : "+retries+")";
        }
    }
    private static int peak(short[] samples,int n){int p=0;for(int i=0;i<n;i++)p=Math.max(p,Math.abs((int)samples[i]));return p;}
    private static int pcmPeak(Pcm pcm,long fromMs,long toMs)throws Exception {
        long pos=Math.max(0,Math.round(fromMs*pcm.rate/1000.));
        long end=Math.min(pcm.frames,Math.round(toMs*pcm.rate/1000.));
        require(pos<end,"Plage PCM vide : "+fromMs+"–"+toMs+" ms");
        short[] samples=new short[4096*pcm.channels];int max=0;
        while(pos<end){
            int n=pcm.read(pos,samples,(int)Math.min(4096,end-pos));require(n>0,"Fin de PCM prématurée");
            max=Math.max(max,peak(samples,n*pcm.channels));pos+=n;
        }
        return max;
    }
    private String offlineHd(Context ctx)throws Exception{
        airplane(ctx);
        MainActivity a=open(ctx);File dir=ctx.getExternalFilesDir("verification");
        try {
            main(()->{
                require(a.hd.installed(a.hd.voice("gilles")),"Modèle téléchargé absent après relance");
                Project p=new Project(a.db.settings);p.text="Ce matin, la lumière traverse la fenêtre. Nous lisons ensemble.";a.open(p);
            });
            click(a,a.t("scene.voix.choisir"));click(a,"Lectura HD · "+a.hd.voice("gilles").optString("nom"));
            click(a,a.t("scene.lancer"));
            int frames=sampleReading(a,dir,"piper-avion",20000).length();
            AtomicReference<Integer> signal=new AtomicReference<>(0);
            main(()->{
                require(noNetwork(ctx)&&a.project.engine.equals("piper")&&a.project.voice.equals("gilles")
                    &&a.reading.pcm!=null&&a.reading.ended,"La lecture n’a pas utilisé le modèle local");
                signal.set(pcmPeak(a.reading.pcm,0,Math.round(a.reading.duration)));
            });
            require(signal.get()>1000,"Piper muet en mode avion");
            return "Nouvelle scène après arrêt du processus, Gilles sélectionné dans l’interface ; réseau absent, pic PCM "+signal.get()+", "+frames+" observations";
        }finally{main(a::finish);}
    }
    private String hd(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            require(Hd.supported(),"AAR ONNX absent");
            require(h.voices.size()==10,"Catalogue des voix HD");
            File partial=new File(refs.context.getFilesDir(),"models/gilles.onnx.part");
            h.remove("gilles");
            try{downloadWithRetry(h,"gilles",(a,b)->{if(a<b)throw new java.util.concurrent.CancellationException();});throw new AssertionError("Téléchargement Piper non interrompu");}
            catch(java.util.concurrent.CancellationException expected){require(partial.length()>0,"Reprise Piper sans segment partiel");}
            int retries=downloadWithRetry(h,"gilles",(a,b)->{});
            require(!partial.exists()&&h.installed(h.voice("gilles")),"Reprise du téléchargement Piper");
            String text="Bonjour Lectura.\n$ echo\nTrès bien !";
            File synthesis;
            int head,first,last,command;
            Hd.Synthesis reading=h.synth(text,"gilles",1,28,(a,b)->{});
            try(Pcm f=reading.pcm){
                require(f.frames>f.rate,"Synthèse ONNX vide");synthesis=f.file;
                List<Script.Segment> parts=reading.segments;
                require(parts.size()==3&&parts.get(0).type==Script.SPOKEN&&parts.get(1).type==Script.COMMAND
                    &&parts.get(2).type==Script.SPOKEN,"Découpage attendu : phrase, commande, phrase");
                Script.Segment a=parts.get(0),b=parts.get(1),c=parts.get(2);
                // Piper can vary its timing. Use each entire spoken interval, not just the first second.
                head=pcmPeak(f,0,1000);first=pcmPeak(f,a.from,a.to);last=pcmPeak(f,c.from,c.to);
                require(first>1000&&last>1000,"Phrase Gilles muette : pics "+first+"/"+last+" (première seconde "+head+")");
                command=pcmPeak(f,b.from+1,b.to-1); // Skip boundaries rounded to milliseconds.
                require(command==0,"Commande Gilles non muette : pic "+command);
            }
            try(Pcm cached=h.synth(text,"gilles",1,28,(a,b)->require(b==1,"Cache non réutilisé")).pcm){require(synthesis.equals(cached.file),"Cache Piper");}
            return "Gilles : téléchargement interrompu/repris, pics PCM des phrases "+first+"/"+last
                +" (première seconde "+head+", commande "+command+", reprises après délai réseau : "+retries+"), cache ; modèle conservé pour le redémarrage en mode avion";
        }
    }
}
