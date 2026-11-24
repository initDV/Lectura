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
import java.util.ArrayList;
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
                check("packs-estelle-kokoro",()->newPacks(refs));
                check("siwis-piper-installation",()->{
                    try(Hd h=new Hd(refs)){downloadWithRetry(h,"siwis",(n,total)->{});require(h.installed(h.voice("siwis")),"Siwis Piper absent");}
                    return "Modèle et configuration Siwis Piper installés, sans changer la voix par défaut";
                });
                break;
            case "offline-hd":
                check("piper-en-avion",()->offlineHd(ctx));
                check("siwis-piper-en-avion",()->offlineSiwis(ctx));
                break;
            case "offline-estelle":
                check("estelle-auto-en-avion",()->offlineNewVoice(ctx,"estelle"));
                break;
            case "offline-kokoro":
                check("kokoro-en-avion",()->offlineNewVoice(ctx,"kokoro-siwis"));
                break;
            default:
                check("avion",()->airplane(ctx));
                check("surfaces",()->surfaces(ctx));
                check("fixtures",()->refsAndModels(refs));
                check("prosodie-pcm",()->prosody(refs));
                check("jeu-du-personnage",()->performance(refs));
                check("quatre-gestes",()->robotChoreo(ctx,refs));
                check("catalogue-et-reglages",()->fullAccess(ctx));
                check("lips-reference",()->lipsReference(ctx,refs));
                check("audio-importe",()->imported(ctx));
                check("preparation-et-reprise",()->preparationLifecycle(ctx));
                check("tts-local",()->tts(ctx));
                check("minutage-sous-titres",DeviceChecks::preparedSubtitles);
                check("sous-titres-et-capture",()->subtitlesAndPng(ctx));
                check("video-interface",()->recordFromScene(ctx));
                for(String format:new String[]{"mp4","webm"})check(format,()->media(ctx,format));
                check("bibliotheque-projets",()->new ProjectLibraryChecks().run(this,ctx));
                // Extension réservée à chaque suite du lot 3 : un nouveau fichier de test, pas
                // d'autre changement du runner ni de l'enregistrement de l'instrumentation.
                feature("stockage-voix", "VoiceStorageChecks",ctx);
                feature("mediatheque", "MediaLibraryChecks",ctx);
        }
        Bundle out=new Bundle();out.putString("stream","\nLECTURA_COMPLETE\n");
        finish(failed?Activity.RESULT_CANCELED:Activity.RESULT_OK,out);
    }
    interface FeatureCheck { String run(DeviceChecks device,Context ctx) throws Exception; }
    private void feature(String name,String className,Context ctx){
        Class<?> type;
        try{type=Class.forName(DeviceChecks.class.getPackageName()+"."+className,false,DeviceChecks.class.getClassLoader());}
        catch(ClassNotFoundException notInThisLot){return;}
        check(name,()->type.asSubclass(FeatureCheck.class).getDeclaredConstructor().newInstance().run(this,ctx));
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
    interface MainAction { void run() throws Exception; }
    void main(MainAction fn)throws Exception{
        AtomicReference<Throwable> error=new AtomicReference<>();
        runOnMainSync(()->{try{fn.run();}catch(Throwable e){error.set(e);}});
        Throwable e=error.get();if(e instanceof Exception)throw (Exception)e;if(e instanceof Error)throw (Error)e;
    }
    static View named(View view,String label){
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
    void click(MainActivity a,String label)throws Exception{
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
    void waitFor(String message,java.util.function.BooleanSupplier condition,long millis)throws Exception {
        long deadline=android.os.SystemClock.uptimeMillis()+millis;AtomicReference<Boolean> ready=new AtomicReference<>();
        while(android.os.SystemClock.uptimeMillis()<deadline){main(()->ready.set(condition.getAsBoolean()));if(ready.get())return;Thread.sleep(80);}
        throw new AssertionError(message);
    }
    static void require(boolean b,String msg) {if(!b)throw new AssertionError(msg);}
    private String refsAndModels(Refs refs)throws Exception {
        require(refs.characters.size()==43,"Catalogue personnages");
        require(Sprite.fixed2(1.005)==1f&&Sprite.fixed2(1.125)==1.13f&&Sprite.fixed2(2.675)==2.67f
            &&Sprite.fixed2(-2.675)==-2.67f&&Sprite.fixed2(-.005)==-.01f,"Arrondi SVG coté à mi-centième sur Android 12");
        Bitmap frame=Bitmap.createBitmap(200,330,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(frame);
        for(JSONObject def:refs.characters){Sprite s=new Sprite(refs,def);s.expression("enthousiaste",1,"triste",.3);
            for(int i=0;i<8;i++){s.viseme=i%4;s.letter="aeiou".substring(i%5,i%5+1);s.tick(i*16);}
            s.svg.fit(c,0,0,200,330,true);
        }
        frame.recycle();JSONObject fixture=fixtures();
        G2p g=new G2p(refs.json("g2p.json"));JSONArray tests=fixture.getJSONArray("phrases");
        for(int i=0;i<tests.length();i++){JSONArray row=tests.getJSONArray(i);String actual=g.phrase(row.getString(0));require(actual.equals(row.getString(1)),"G2P : "+row.getString(0)+" | "+actual+" != "+row.getString(1));}
        JSONObject voice=fixture.getJSONObject("voice");
        for(String key:List.of("words","groups")){
            JSONArray cases=voice.getJSONArray(key);
            for(int i=0;i<cases.length();i++){
                JSONArray row=cases.getJSONArray(i);String text=row.getString(0),ipa=g.phrase(text).replaceAll("[ˈ-]","");
                require(key.equals("words")?ipa.equals(row.getString(1)):ipa.contains(row.getString(1)),text+" : "+ipa+" != "+row.getString(1));
            }
        }
        JSONArray siwis=voice.getJSONArray("siwis");
        for(int i=0;i<siwis.length();i++){
            JSONArray row=siwis.getJSONArray(i);String text=row.getString(0);
            require(g.phrase(text,true).equals(row.getString(1))&&g.phrase(text).equals(row.getString(2)),"Portée de la correction Siwis : "+text);
        }
        String clock="🚆 Demain à 08\u202fh\u00a030, est-ce possible ?";
        var f=SpeechPlan.plan(clock,"fr",Refs.object(refs.json("prononciation.json"),"fr")).get(0);
        ClockWords.Time clockTag=ClockWords.first(clock);
        require(clockTag!=null&&clockTag.label.equals("08:30")&&clockTag.index==clock.indexOf("08")
            &&f.spoken.contains("huit heures trente")&&f.original.text.equals(clock.substring(0,f.original.end)),"Normalisation des heures sans modifier la source");
        require(ClockWords.first("x8h30 et 25:59, -8:30 ou 08:30:40")==null,"Faux horaires");
        require(ClockWords.first("Dix‑huit heures trente").label.equals("18:30")&&ClockWords.first("huit heures trente‑deux").label.equals("08:32")
            &&ClockWords.first("huit heures trente et une").label.equals("08:31")&&ClockWords.normalize("À 21:00").equals("À vingt et une heures"),"Heures longues et variantes de tiret");
        require(VoiceRender.siwisPause(140)==105&&VoiceRender.siwisPause(360)==360&&VoiceRender.siwisPause(400)==320,"Pauses Siwis");
        require(Arrays.equals(G2p.ids("ɥ",new JSONObject("{\"^\":[1],\"$\":[2],\"_\":[0],\"y\":[37]}")),new long[]{1,0,37,0,2}),"Repli /ɥ/ Piper");
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
        return "43 rigs, 38 poses, mélange d’émotions, mots étendus/personnalisés, G2P partagé + cas vérifiés, 8 chronologies, SRT/VTT et projet v1";
    }
    private String prosody(Refs refs)throws Exception {
        JSONObject lex=Refs.object(refs.json("prononciation.json"),"fr");
        String source="  ## Essai, voici : un test ; ça va. Tu viens ? Super ! On continue… Encore !\r\n$ echo x=2\r\n"
            +"# commentaire\r\nM. Dupont lance `script.py` à 10:30 sur https://github.com : −3,14 € = 2% @dev & SQL + API.  ";
        List<SpeechPlan.Fragment> plan=SpeechPlan.plan(source,"fr",lex);
        int[] expected={140,200,240,320,360,400,480,560,560,560,200,320};
        require(plan.size()==expected.length,"Nombre de fragments "+plan.size());
        for(int i=0;i<plan.size();i++){
            var f=plan.get(i);var p=f.original;
            require(source.substring(p.start,p.end).equals(p.text)&&f.pauseMs==expected[i],"Pause ou offsets : "+p.text+" "+f.pauseMs);
            if(p.cursor!=null){int last=p.start;for(int n:p.cursor){require(n>=last&&n<p.end,"Offset vocal hors du texte");last=n;}}
        }
        require(plan.get(4).question&&plan.get(8).spoken.isEmpty()&&plan.get(9).spoken.isEmpty(),"Question et commandes silencieuses");
        require(plan.get(10).spoken.contains("script point py")&&plan.get(10).spoken.contains("dix heures trente")
            &&plan.get(11).spoken.contains("moins trois virgule quatorze euros égale deux pour cent arobase dev et esse ku elle plus a pé i"),"Dictionnaire vocal et symboles : "+plan.get(11).spoken);
        require(SpeechPlan.plan("Oui ?!… \n", "fr",lex).get(0).pauseMs==560,"Pause maximale et non cumulée");
        Project orig=new Project(refs.defaults);orig.text=source;require(Project.fromJson(orig.json()).text.equals(source),"Source sauvegardée intacte");
        int rate=24000;float[] audio=new float[rate];int onset=rate/10,end=rate*3/4;
        for(int i=onset;i<end;i++)audio[i]=(float)(.3*Math.sin(2*Math.PI*150*(i-onset)/rate));
        try(Pcm wave=VoiceRender.render(refs.context.getCacheDir(),null,null,plan,rate,28,ignored->audio,(n,total)->{}).pcm){
            require(wave.rate==rate,"Fréquence du WAV");
            for(int i=0;i<expected.length;i++){
                Script.Segment p=plan.get(i).original;
                require(p.to-p.speechEnd==expected[i],"Silence WAV différent : "+p.text+" "+(p.to-p.speechEnd));
                require(pcmPeak(wave,p.speechEnd+1,p.to-1)==0,"Le PCM doit être nul dans le silence");
            }
            require((plan.get(3).original.to-plan.get(3).original.speechEnd)/1.25==256,"Pause à 1,25×");
        }
        JSONArray questions=fixtures().getJSONObject("voice").getJSONArray("questions");
        for(int i=0;i<questions.length();i++){
            JSONArray row=questions.getJSONArray(i);String text=row.getString(0);boolean closed=row.getBoolean(1);
            require(QuestionPitch.closed(text)==closed,"Type de question : "+text);
            require(SpeechPlan.plan(text,"fr",lex).stream().anyMatch(p->p.closedQuestion)==closed,"Contexte perdu au découpage : "+text);
        }
        int first=onset+50,last=end-1,extra=rate*70/1000;
        float[] raised=QuestionPitch.adjust(audio,first,last,rate,70);
        int a=end-rate*13/100,b=end-rate*4/100;
        require(raised.length==audio.length+extra&&crossings(raised,a+extra,b+extra)>crossings(audio,a,b)
            &&Arrays.equals(raised,0,rate/2,audio,0,rate/2)&&Arrays.equals(raised,end+extra,raised.length,audio,end,audio.length),
            "+70 ms de voyelle et montée locale, attaque et silence inchangés");
        float[] rising=audio.clone();double phase=0;
        for(int i=onset;i<end;i++){phase+=2*Math.PI*(106+110.*(i-onset)/(end-onset))/rate;rising[i]=(float)(.3*Math.sin(phase));}
        require(QuestionPitch.adjust(rising,first,last,rate,70)==rising,"Ne pas doubler une montée naturelle");
        var qPlan=SpeechPlan.plan("Tu viens ce soir ?", "fr",lex);
        try(Pcm wave=VoiceRender.render(refs.context.getCacheDir(),null,null,qPlan,rate,28,VoiceRender.Profile.SIWIS,ignored->audio,(n,total)->{}).pcm){
            var q=qPlan.get(0).original;
            require(q.to-q.speechEnd==360&&Pcm.mono16Frames(wave.file,rate)==wave.frames&&pcmPeak(wave,q.speechEnd+1,q.to-1)==0,
                "Pause Siwis et en-tête WAV après allongement");
        }
        float[] hot=audio.clone();for(int i=0;i<hot.length;i++)hot[i]*=4; // A signal that would otherwise hit the PCM16 rails.
        try(Pcm wave=VoiceRender.render(refs.context.getCacheDir(),null,null,SpeechPlan.plan("Tu viens ?","fr",lex),rate,28,VoiceRender.Profile.ESTELLE,
                ignored->hot,(n,total)->{}).pcm){
            require(wave.frames>=end-onset,"L’atténuation ne doit pas enlever d’échantillons");
            int peak=estelleWave(wave);require(peak>21500,"Atténuation excessive : "+peak);
        }
        return "8 durées exactes, 320 → 256 ms à 1,25×, montée faible corrigée et +70 ms sans silence en plus ; montée naturelle et source intactes ; WAV Estelle mono 24 kHz reconnu par Android, signal de test > 0 dBFS écrit avec 3 dB de marge";
    }
    private static int crossings(float[] w,int a,int b){int n=0;for(int i=a+1;i<b;i++)if(w[i-1]<0&&w[i]>=0)n++;return n;}
    private String performance(Refs refs)throws Exception {
        var words=new Script.Keywords(refs,"fr",new JSONObject());Mood mood=new Mood(refs,"fr",words,true);
        var contexts=refs.json("direction.json").getJSONObject("fr").getJSONObject("contexts");
        java.util.Set<String> gestures=new java.util.HashSet<>();int poses=0;
        for(var ids=contexts.keys();ids.hasNext();){
            String id=ids.next(),sample=contexts.getJSONArray(id).getString(0);
            Script.Segment p=new Script.Segment(sample,0,sample.length(),Script.SPOKEN);p.to=p.speechEnd=1500;
            Performance track=new Performance(List.of(p),mood,refs.rig);
            require(track.face(730).expr.equals(id),"Pose contextuelle "+id+" pour "+sample);
            gestures.add(mood.motion(id,0));gestures.add(mood.motion(id,1));poses++;
        }
        require(poses==37&&gestures.size()>=25&&gestures.stream().allMatch(Performance.DURATIONS::containsKey),"Couverture du jeu Android");
        String text="Tu viens ce soir ? Bravo ! Regarde ici : c’est tout.\n$ echo jamais";
        var plan=SpeechPlan.plan(text,"fr",new JSONObject());var parts=new ArrayList<Script.Segment>();long at=0;
        for(var f:plan){var p=f.original;p.from=at;p.speechEnd=at+1000;at+=1000+f.pauseMs;p.to=at;parts.add(p);}
        Performance directions=new Performance(parts,mood,refs.rig);
        require(directions.face(200).expr.equals("neutre")&&directions.face(910).expr.equals("pensif")
            &&directions.face(2310).expr.equals("enthousiaste"),"Question finale ou bravo hors de leur repère audio");
        require(directions.gesture(2775)!=null&&directions.gesture(2775).motion.equals("indique"),"Geste vers le terminal");
        var question=directions.gesture(1070);directions.gesture(3500);
        require(question!=null&&question==directions.gesture(1070),"La reprise/recherche doit retrouver exactement le même geste");
        // Question starts at 835 ms. Check the full rig, not merely the selected expression name.
        glide(refs.rig,directions,835,"neutre → pensif");
        glide(refs.rig,directions,parts.get(1).from,"changement de phrase");
        for(String rig:List.of("robot_lectura","wend")){
            var sprite=new Sprite(refs,refs.character(rig));
            Bitmap before=performanceFrame(sprite,directions,835,835);
            Bitmap first=performanceFrame(sprite,directions,995,995);
            Bitmap after=performanceFrame(sprite,directions,1155,1155);
            Bitmap later=performanceFrame(sprite,directions,995,37880); // paused in the middle of the glide
            Bitmap other=performanceFrame(sprite,directions,2320,37923); // forward seek
            Bitmap seek=performanceFrame(sprite,directions,995,37955); // backward seek
            try{require(first.sameAs(later)&&first.sameAs(seek)&&!first.sameAs(other)
                &&!first.sameAs(before)&&!first.sameAs(after),"Images intermédiaires et déterminisme : "+rig);}
            finally{before.recycle();first.recycle();after.recycle();later.recycle();other.recycle();seek.recycle();}
        }
        interruptedGlide(refs.rig,mood);
        require(directions.gesture(parts.get(parts.size()-1).from+200)==null,"Geste vocal dans la commande silencieuse");
        parts.get(0).expression="fier";Performance manual=new Performance(parts,new Mood(refs,"fr",words,true),refs.rig);
        require(manual.face(910).expr.equals("fier")&&manual.gesture(910)==null,"Priorité d'une pose manuelle");
        parts.get(0).expression="auto";parts.get(1).expression="fier";
        manual=new Performance(parts,new Mood(refs,"fr",words,true),refs.rig);
        long border=parts.get(1).from;
        Performance.Cue release=manual.gesture(border-1);
        require(release!=null&&release.envelope(border-1)<.001&&manual.gesture(border)==null,"Relâchement avant une pose manuelle");
        glide(refs.rig,manual,border,"transition vers une pose manuelle");
        parts.get(1).expression="auto";
        Performance disabled=new Performance(parts,new Mood(refs,"fr",words,false),refs.rig);
        require(disabled.gesture(2775)==null&&disabled.face(2310).expr.equals("neutre"),"Désactivation de la mise en scène auto");
        return poses+" poses détectées + neutre, "+gestures.size()+" mouvements ; fondu 320 ms pour tous les axes, continuité aux coupures, priorité manuelle, images intermédiaires identiques à repère audio égal après pause/saut (robot, Wend)";
    }
    private static void glide(RigPose rig,Performance p,long at,String name){
        double[] start=rig.rest(),end=rig.rest(),sample=rig.rest(),before=rig.rest();
        p.sample(at,start);p.sample(at+RigPose.GLIDE_MS,end);p.sample(at-.001,before);
        require(Math.abs(rig.value(start,"headR")-rig.value(end,"headR"))>.1
            &&Math.abs(rig.value(start,"foreR")-rig.value(end,"foreR"))>1,"Tête et avant-bras doivent changer : "+name);
        for(double u:new double[]{.25,.5,.75}){
            p.sample(at+u*RigPose.GLIDE_MS,sample);
            for(int i=0;i<sample.length;i++){
                double expected=start[i]+(end[i]-start[i])*u*u*(3-2*u);
                require(Math.abs(start[i]-before[i])<.002&&Math.abs(sample[i]-expected)<1e-9,"Glissement de tout le rig : "+name+" / "+i+" / "+u);
            }
        }
    }
    private static void interruptedGlide(RigPose rig,Mood mood){
        List<Script.Segment> parts=new ArrayList<>();
        String[] ids={"neutre","pensif","surpris"};long[] times={0,500,600,1450};
        for(int i=0;i<ids.length;i++){
            Script.Segment p=new Script.Segment("Texte",0,5,Script.SPOKEN);
            p.from=times[i];p.to=times[i+1];p.expression=ids[i];parts.add(p);
        }
        Performance p=new Performance(parts,mood,rig);
        double[] at=rig.rest(),expected=rig.rest(),before=rig.rest(),after=rig.rest();
        RigPose.mix(rig.rest(),rig.resolve("pensif",1,"",0),RigPose.ease(100d/RigPose.GLIDE_MS),expected);
        p.sample(600,at);p.sample(599.999,before);p.sample(600.001,after);
        require(Arrays.equals(at,expected),"Une pose interrompue doit repartir de la position atteinte");
        for(int i=0;i<at.length;i++)require(Math.abs(before[i]-after[i])<.001,"Saut à la coupure d’une pose");
    }
    private static void near(double a,double b,String name){require(Math.abs(a-b)<.000001,name+" : "+a+" / "+b);}
    private String robotChoreo(Context ctx,Refs refs)throws Exception{
        JSONObject fixture=fixtures().getJSONObject("robot");JSONArray rows=fixture.getJSONArray("segments");
        List<Script.Segment> parts=new ArrayList<>();int start=0;
        for(int i=0;i<rows.length();i++){
            JSONObject span=rows.getJSONObject(i);String line=span.getString("texte");
            Script.Segment p=new Script.Segment(line,start,start+line.length(),Script.type(line));start=p.end+1;
            p.from=span.getLong("debutMs");p.speechEnd=span.getLong("speechEndMs");p.to=span.getLong("finMs");parts.add(p);
        }
        RobotChoreo direction=RobotChoreo.plan(parts,fixture.getDouble("duration"));
        JSONObject expected=fixture.getJSONObject("direction");require(direction.label.equals(expected.getString("label")),"Horloge réellement prononcée");
        double[][] actual={direction.step,direction.hour,direction.question,direction.salute};String[] cues={"pas","h","q","salut"};
        for(int i=0;i<cues.length;i++)for(int j=0;j<2;j++)near(actual[i][j],expected.getJSONArray(cues[i]).getDouble(j),cues[i]);
        near(direction.end,expected.getDouble("end"),"Fin avec salut");
        JSONArray poses=fixture.getJSONArray("poses");RobotChoreo.Pose out=new RobotChoreo.Pose();
        for(int i=poses.length()-1;i>=0;i--){
            JSONArray row=poses.getJSONArray(i);direction.sample(row.getDouble(0),true,out);JSONObject p=row.getJSONObject(1);
            String[] names={"x","y","tilt","blend","head","nod","drop","armL","foreL","armR","foreR","gazeX","gazeY","brow","antenna","clock"};
            double[] values={out.x,out.y,out.tilt,out.blend,out.head,out.nod,out.drop,out.armL,out.foreL,out.armR,out.foreR,out.gazeX,out.gazeY,out.brow,out.antenna,out.clock};
            for(int k=0;k<names.length;k++)near(values[k],p.getDouble(names[k]),names[k]);
            require(out.legs[0].lift==0||out.legs[1].lift==0,"Pas sans appui");
            for(int leg=0;leg<2;leg++){
                RobotChoreo.Leg l=out.legs[leg];JSONObject m=p.getJSONArray("legs").getJSONObject(leg);
                // At full extension hypot/atan2 can differ by a few millionths of a degree between VMs.
                require(Math.abs(l.thigh-m.getDouble("thigh"))<.00002&&Math.abs(l.shin-m.getDouble("shin"))<.00002,"Articulation Java/JS");
                near(Math.hypot(l.hx-l.kx,l.hy-l.ky),70,"cuisse de longueur constante");near(Math.hypot(l.kx-l.fx,l.ky-l.fy),104,"tibia de longueur constante");
            }
        }
        MainActivity a=open(ctx);File input=tone(ctx,5),dir=ctx.getExternalFilesDir("verification");
        String text="Demain, on part à 8 h 30. Tu seras là ? Parfait !", name="robot-salut-"+System.currentTimeMillis();
        String format=a.db.settings.optString("formatVideo","9:16");
        try{
            main(()->{
                Project p=new Project(a.db.settings);p.text=text;p.title=name;p.character="robot_lectura";p.speed=1;p.emotions=true;
                a.open(p);a.stage.sprite.reduced=false; // CI has animator_duration_scale=0; exercise the non-reduced path explicitly.
                a.importAudio(Uri.fromFile(input),"horloge.wav");
            });
            waitFor("Import de la piste du robot",()->a.project.fileAudio,10000);
            main(()->a.launch(false));
            waitFor("Lecture avec mise en scène",()->a.reading!=null&&a.reading.playing,12000);
            main(()->{
                Reading r=a.reading;RobotChoreo c=r.choreography;
                require(c!=null&&c.label.equals("08:30")&&c.end>r.mediaDuration,"Plan lié à la lecture native");
                r.pause();r.seek((c.hour[0]+c.hour[1])*.5);a.stage.updatePose(100);
                Svg.Node clock=a.stage.sprite.svg.get("robot-clock");require(!clock.hidden&&clock.alpha>.97,"Horloge visible au pointage");
                require(a.stage.sprite.svg.get("robot-clock-digits").children.size()==24,"Chiffres de 08:30");
                Bitmap image=Bitmap.createBitmap(720,1280,Bitmap.Config.ARGB_8888);
                a.stage.exportDraw(new Canvas(image),720,1280,true,100);
                int green=0;for(int y=950;y<1230;y++)for(int x=0;x<274;x++)if(image.getPixel(x,y)==0xff83edbd)green++;
                require(green>=30,"Chiffres absents du rendu d’export : "+green);
                try(var file=Files.newOutputStream(new File(dir,"android-robot-heure.png").toPath())){image.compress(Bitmap.CompressFormat.PNG,100,file);}finally{image.recycle();}
                double pose=a.stage.sprite.robotStage.pose.foreR;
                a.stage.updatePose(1000);near(a.stage.sprite.robotStage.pose.foreR,pose,"Image figée pendant la pause");
                a.stage.sprite.reduced=true;a.stage.updatePose(1100);require(clock.hidden,"Horloge en mouvement réduit");
                a.stage.sprite.reduced=false;r.seek(r.mediaDuration+730);r.speed(.5f);a.stage.updatePose(1200);
                require(a.stage.sprite.robotStage.pose.nod<.92&&a.stage.sprite.viseme==0&&r.chars(r.time())==text.length(),"Salut après l’audio");
                a.startPlaying();
            });
            waitFor("Fin naturelle après le salut au ralenti",()->a.reading.ended,5000);
            main(()->{a.db.set("formatVideo","9:16");a.reading.speed(1);a.record();});
            waitFor("Export du robot jusqu’au salut",()->a.exports.capturing(),12000);
            waitFor("Fin automatique de la vidéo",()->a.modal!=null&&action(a.modal,a.t("dl.bouton.telecharger"))!=null,28000);
            click(a,a.t("dl.bouton.telecharger"));
            Movies library=new Movies(ctx);Movies.Entry kept=null;
            for(int i=0;i<100&&kept==null;i++){
                for(Movies.Entry e:library.list())if(e.title.equals(name)){kept=e;break;}
                if(kept==null)Thread.sleep(80);
            }
            require(kept!=null&&kept.format.equals("mp4"),"Export MP4 du salut absent de Mes vidéos");
            try{
                try(Pcm mixed=Pcm.decode(kept.file,dir)){
                    require(mixed.duration()>=6360&&pcmPeak(mixed,500,4400)>5000&&pcmPeak(mixed,5500,6300)<180,
                        "La vidéo doit garder la piste originale et la fin muette du salut : "+mixed.duration()+" ms");
                }
                try(android.media.MediaMetadataRetriever frames=new android.media.MediaMetadataRetriever()){
                    frames.setDataSource(kept.file.getPath());
                    var bitmapParams=new android.media.MediaMetadataRetriever.BitmapParams();
                    bitmapParams.setPreferredConfig(Bitmap.Config.ARGB_8888);
                    Bitmap begin=frames.getFrameAtTime(5310000,android.media.MediaMetadataRetriever.OPTION_CLOSEST,bitmapParams);
                    Bitmap bow=frames.getFrameAtTime(5750000,android.media.MediaMetadataRetriever.OPTION_CLOSEST,bitmapParams);
                    require(begin!=null&&bow!=null&&begin.getHeight()==1280&&begin.getWidth()==720,"Images MP4 du salut portrait");
                    try{
                        int changes=0;for(int y=880;y<1270;y+=2)for(int x=0;x<269;x+=2){
                            int first=begin.getPixel(x,y),next=bow.getPixel(x,y);
                            if(Math.abs((first>>16&255)-(next>>16&255))+Math.abs((first>>8&255)-(next>>8&255))>45)changes++;
                        }
                        require(changes>100,"Image du robot figée avant le salut : "+changes+" pixels modifiés");
                    }finally{begin.recycle();bow.recycle();}
                }
                Files.copy(kept.file.toPath(),new File(dir,"android-robot-salut.mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);
            }finally{library.delete(kept);}
            return "17 poses Java/JS, appuis et longueurs ; pause, saut dans le salut, ralenti, mouvement réduit, chiffres PNG et salut MP4 avec fin muette";
        }finally{
            input.delete();main(()->{a.db.set("formatVideo",format);a.db.audio(a.project).delete();a.finish();});
            var catalog=android.provider.MediaStore.Video.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY);
            ctx.getContentResolver().delete(catalog,android.provider.MediaStore.MediaColumns.DISPLAY_NAME+" = ?",new String[]{name+".mp4"});
        }
    }
    private static Bitmap performanceFrame(Sprite sprite,Performance directions,long audio,long wall) {
        sprite.direct(directions,audio,"");sprite.quietMouth=true;sprite.tick(wall);
        Bitmap bitmap=Bitmap.createBitmap(240,380,Bitmap.Config.ARGB_8888);sprite.svg.fit(new Canvas(bitmap),0,0,240,380,true);return bitmap;
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
    static boolean noNetwork(Context ctx){
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
    private static String preparedSubtitles(){
        String[] text={"Ça va, Lectura 🙂","$ echo ok","# repère"," ","Deuxième ligne.","Fin."};
        int[] types={Script.SPOKEN,Script.COMMAND,Script.COMMENT,Script.PAUSE,Script.SPOKEN,Script.SPOKEN};
        long[][] times={{501,1501,1001},{1501,1510,-1},{1510,1520,-1},{1520,2101,-1},{2101,3301,2101},{4001,4002,-1}};
        List<Script.Segment> parts=new ArrayList<>();int offset=0;
        for(int i=0;i<text.length;i++){
            Script.Segment p=new Script.Segment(text[i],offset,offset+text[i].length(),types[i]);
            p.from=times[i][0];p.to=times[i][1];p.speechEnd=times[i][2];p.expression="joie";
            parts.add(p);offset=p.end+1;
        }
        // Golden timestamps captured before the extraction (SRT uses commas, VTT uses dots).
        double[] rates={.5,1,1.25,2};
        String[][] stamps={
            {"01,002","02,002","04,202","06,602","08,002","08,004"},
            {"00,501","01,001","02,101","03,301","04,001","04,002"},
            {"00,401","00,801","01,681","02,641","03,201","03,202"},
            {"00,251","00,501","01,051","01,651","02,001","02,002"}
        };
        List<Script.Segment> spoken=List.of(parts.get(0),parts.get(4),parts.get(5));
        for(int i=0;i<rates.length;i++){
            List<Script.Segment> cues=Script.spokenSubtitleTimings(parts,rates[i]);
            require(cues.size()==spoken.size(),"Seules les phrases prononcées doivent être exportées");
            StringBuilder srt=new StringBuilder(),vtt=new StringBuilder("WEBVTT\n\n");
            for(int j=0;j<cues.size();j++){
                Script.Segment p=spoken.get(j),cue=cues.get(j);
                require(cue!=p&&cue.start==p.start&&cue.end==p.end&&cue.expression.equals(p.expression),"Repère source modifié ou perdu");
                String time="00:00:"+stamps[i][2*j]+" --> 00:00:"+stamps[i][2*j+1];
                String body="\n"+p.text+(j+1==cues.size()?"\n":"\n\n");
                srt.append(j+1).append('\n').append(time).append(body);
                vtt.append(time.replace(',','.')).append(body);
            }
            require(Arrays.equals(Script.subtitles(cues,false).getBytes(StandardCharsets.UTF_8),srt.toString().getBytes(StandardCharsets.UTF_8)),"SRT à "+rates[i]+"×");
            require(Arrays.equals(Script.subtitles(cues,true).getBytes(StandardCharsets.UTF_8),vtt.toString().getBytes(StandardCharsets.UTF_8)),"VTT à "+rates[i]+"×");
        }
        for(int i=0;i<parts.size();i++){
            Script.Segment p=parts.get(i);
            require(p.from==times[i][0]&&p.to==times[i][1]&&p.speechEnd==times[i][2],"Timeline de lecture modifiée");
        }
        return "SRT/VTT exacts à 0,5×, 1×, 1,25× et 2× ; timeline préservée";
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
    MainActivity open(Context ctx){return (MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
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
    private String preparationLifecycle(Context ctx)throws Exception{
        MainActivity a=open(ctx);
        Project previous=a.project,p=new Project(a.db.settings);
        p.text="Bonjour, Lectura. Ceci est une lecture de référence.";p.fileAudio=true;
        p.fileName="preparation.wav";p.duration=6000;p.speed=1;
        File media=a.db.audio(p),wave=null;
        try{
            wave=tone(ctx,6);
            Files.copy(wave.toPath(),media.toPath());
            waitFor("La scène doit être au premier plan",()->a.isForeground,6000);
            main(()->{a.open(p);a.muted=true;});
            cancelAndRelaunch(a);
            leaveBeforeDelivery(a,p);
            preparePausedAndResume(a);
            return "Annuler/relancer, résultat obsolète et PCM libéré, préparation en pause, reprise sans re-préparation";
        }finally{
            try{main(()->{a.open(previous);a.draft();a.finish();});}
            finally{Files.deleteIfExists(media.toPath());if(wave!=null)Files.deleteIfExists(wave.toPath());}
        }
    }
    private static Future<?> launchPreparation(MainActivity a){
        require(a.scene.launch.isEnabled()&&a.scene.launch.performClick(),"Lancer doit être disponible");
        require(a.preparing&&a.reading==null&&a.sceneOverlay!=null&&a.preparation!=null,"Préparation non lancée");
        return a.preparation;
    }
    private static boolean keepsScreenOn(MainActivity a){
        return (a.getWindow().getAttributes().flags&android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)!=0;
    }
    // Cross both queues: negative assertions must run after any stale UI result, not before it.
    private static void awaitPreparationCallbacks(MainActivity a)throws Exception {
        a.queue.submit(()->{}).get(8,TimeUnit.SECONDS);
        CountDownLatch dispatched=new CountDownLatch(1);
        require(a.handler.post(dispatched::countDown)&&dispatched.await(8,TimeUnit.SECONDS),"Résultat de préparation non traité");
    }
    private void cancelAndRelaunch(MainActivity a)throws Exception{
        CountDownLatch release=new CountDownLatch(1);
        Future<?> barrier=a.queue.submit(()->{
            require(release.await(8,TimeUnit.SECONDS),"Barrière d’annulation non libérée");return null;
        });
        try{
            main(()->{
                Future<?> cancelled=launchPreparation(a);
                View cancel=action(a.sceneOverlay,a.t("commun.annuler"));
                require(cancel!=null&&cancel.isEnabled()&&cancel.performClick(),"Action Annuler indisponible");
                require(cancelled.isCancelled()&&!a.preparing&&a.reading==null&&a.sceneOverlay==null&&a.stopped&&!keepsScreenOn(a),
                    "Annuler doit retirer la préparation et rendre la scène inactive");
                require(launchPreparation(a)!=cancelled,"La relance doit demander une nouvelle préparation");
            });
        }finally{release.countDown();}
        barrier.get(8,TimeUnit.SECONDS);
        awaitPreparationCallbacks(a);
        main(()->require(a.reading!=null&&a.reading.pcm!=null&&a.reading.playing&&a.reading.text.equals(a.project.text)
            &&!a.preparing&&a.sceneOverlay==null&&keepsScreenOn(a),"Le WAV doit jouer après la relance"));
    }
    private static List<File> preparedWavs(MainActivity a){
        File[] files=a.getCacheDir().listFiles((dir,name)->name.endsWith(".wav"));
        require(files!=null,"Cache audio illisible");return new ArrayList<>(Arrays.asList(files));
    }
    private void leaveBeforeDelivery(MainActivity a,Project p)throws Exception{
        AtomicReference<File> stale=new AtomicReference<>();
        main(()->{
            a.open(p);List<File> previous=preparedWavs(a);
            // Raw WAV work does not wait for the UI; keep the callback queued during navigation.
            launchPreparation(a).get(5,TimeUnit.SECONDS);
            List<File> created=preparedWavs(a);created.removeAll(previous);
            require(created.size()==1&&created.get(0).length()>44&&a.reading==null,"Un WAV décodé doit attendre son adoption par la scène");
            stale.set(created.get(0));
            a.go("projets");
            require(a.scene==null&&a.reading==null&&!a.preparing&&a.sceneOverlay==null,"Quitter la scène doit invalider la préparation");
            a.open(p); // The old callback will find a scene again, but must still be rejected.
        });
        awaitPreparationCallbacks(a);
        main(()->require(a.scene!=null&&a.reading==null&&!a.preparing&&a.sceneOverlay==null&&!keepsScreenOn(a)&&!stale.get().exists(),
            "Le résultat ancien doit être ignoré sur la nouvelle scène et son WAV temporaire supprimé"));
    }
    private void preparePausedAndResume(MainActivity a)throws Exception{
        boolean[] paused={false};
        try{
            main(()->{
                a.muted=true;launchPreparation(a);
                // Drive the application's lifecycle callbacks without opening another task.
                paused[0]=true;callActivityOnPause(a);
                require(!a.isForeground&&a.preparing&&!keepsScreenOn(a),"Préparation au passage en arrière-plan");
            });
            awaitPreparationCallbacks(a);
            main(()->{
                Reading ready=a.reading;Future<?> completed=a.preparation;
                require(!a.isForeground&&ready!=null&&ready.pcm!=null&&!ready.playing&&!ready.ended&&!a.preparing
                    &&a.sceneOverlay==null&&!keepsScreenOn(a),"Le résultat livré en arrière-plan doit être prêt, sans jouer");
                callActivityOnResume(a);paused[0]=false;
                require(a.isForeground&&a.reading==ready&&!ready.playing&&!keepsScreenOn(a),"Le retour au premier plan ne doit pas lancer la lecture");
                require(a.scene.launch.performClick()&&a.reading==ready&&a.preparation==completed&&ready.playing&&!a.preparing,
                    "Lancer doit réutiliser le résultat déjà prêt");
            });
            waitFor("La lecture du WAV doit progresser",()->a.reading!=null&&a.reading.playing&&a.reading.time()>300,5000);
            main(()->{
                Reading ready=a.reading;Future<?> completed=a.preparation;
                require(a.scene.launch.performClick()&&!ready.playing&&!a.stopped&&!ready.ended&&!keepsScreenOn(a),"Pause de la lecture prête");
                double position=ready.time();
                require(a.scene.launch.performClick()&&a.reading==ready&&a.preparation==completed&&ready.playing&&!a.preparing
                    &&ready.time()>=position-100&&keepsScreenOn(a),"Reprendre doit conserver la lecture et sa position");
            });
        }finally{main(()->{if(paused[0])callActivityOnResume(a);});}
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
            long begin=android.os.SystemClock.elapsedRealtime();
            waitFor("Audio du moteur Android local",()->a.reading!=null&&a.reading.pcm!=null&&a.reading.playing,30000);
            long startup=android.os.SystemClock.elapsedRealtime()-begin;
            JSONArray frames=sampleReading(a,ctx.getExternalFilesDir("verification"),"tts",20000);
            boolean command=false;
            for(int i=0,start=text.indexOf("$ "),end=text.indexOf('\n',start);i<frames.length();i++){
                var frame=frames.getJSONArray(i);int chars=frame.getInt(1);
                if(chars>=start&&chars<=end){command=true;require(frame.getInt(2)==0,"Visème pendant la commande");}
            }
            require(command,"La commande silencieuse n'a pas été affichée");
            return "voix française locale "+voice.get()+", même texte et vitesse 1,25×, "+frames.length()+" observations PCM jusqu’à la fin (commande muette), démarrage ≈ "+startup+" ms";
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
            a.reading.performance=new Performance(p,new Mood(a.refs,"fr",kw,true),a.refs.rig);a.muted=true;a.reading.volume(0,true);a.reading.terminal.shown=a.project.text.length();
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
                try(Pcm a=h.synth(sentence,"mls_f1",28,(n,total)->{}).pcm;
                    Pcm b=h.synth(sentence,"mls_m1",28,(n,total)->{}).pcm){
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
            waitFor("Fenêtre de lecture hors ligne",()->a.isForeground&&a.hasWindowFocus(),15000);
            main(()->{
                require(a.hd.installed(a.hd.voice("gilles")),"Modèle téléchargé absent après relance");
                Project p=new Project(a.db.settings);p.text="Ce matin, la lumière traverse la fenêtre. Nous lisons ensemble.";a.open(p);
            });
            click(a,a.t("scene.voix.choisir"));click(a,"Lectura HD · "+a.hd.voice("gilles").optString("nom"));
            long start=android.os.SystemClock.uptimeMillis();
            click(a,a.t("scene.lancer"));
            // A cold ONNX session and two uncached phrases can take longer than the
            // WAV/system-voice startup bound on a shared CI runner. Do not reuse cached PCM.
            try{
                waitFor("Démarrage de la lecture HD depuis le modèle local",()->a.reading!=null&&a.reading.playing,45000);
            }catch(AssertionError e){
                AtomicReference<String> detail=new AtomicReference<>();
                main(()->detail.set("focus="+a.hasWindowFocus()+", premierPlan="+a.isForeground+", préparation="+a.preparing
                    +", lecture="+(a.reading==null?"absente":a.reading.playing+"/"+a.reading.ended)+", journal="+a.journal.peekLast()));
                throw new AssertionError(e.getMessage()+" ; "+detail.get(),e);
            }
            long startup=android.os.SystemClock.uptimeMillis()-start;
            int frames=sampleReading(a,dir,"piper-avion",20000).length();
            AtomicReference<Integer> signal=new AtomicReference<>(0);
            main(()->{
                require(noNetwork(ctx)&&a.project.engine.equals("piper")&&a.project.voice.equals("gilles")
                    &&a.reading.pcm!=null&&a.reading.ended,"La lecture n’a pas utilisé le modèle local");
                signal.set(pcmPeak(a.reading.pcm,0,Math.round(a.reading.duration)));
            });
            require(signal.get()>1000,"Piper muet en mode avion");
            return "Nouvelle scène après arrêt du processus, Gilles sélectionné dans l’interface ; réseau absent, démarrage après "
                +startup+" ms, pic PCM "+signal.get()+", "+frames+" observations";
        }finally{main(a::finish);}
    }
    private String newPacks(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)) {
            File models=new File(refs.context.getFilesDir(),"models");VoicePacks store=new VoicePacks(models);
            require(h.autoVoice("fr").isEmpty(),"Une voix ne doit pas être téléchargée au démarrage");
            VoicePacks.Spec estelle=VoicePacks.ESTELLE,kokoro=VoicePacks.KOKORO;
            require(estelle.supported()&&kokoro.supported(),"Runtimes Estelle/Sherpa absents de l’APK");
            File partial=store.partial(estelle);
            try{downloadWithRetry(h,estelle.id,(n,total)->{if(n>0&&n<total)throw new java.util.concurrent.CancellationException();});
                throw new AssertionError("Arrêt du téléchargement Estelle non testé");
            }catch(java.util.concurrent.CancellationException expected){require(partial.length()>0&&!store.installed(estelle),"Pack partiel visible en lecture");}
            long resumed=partial.length();java.util.concurrent.atomic.AtomicLong requested=new java.util.concurrent.atomic.AtomicLong(-1);
            downloadWithRetry(h,estelle.id,(n,total)->requested.compareAndSet(-1,n));
            require(requested.get()==resumed,"Le serveur n’a pas honoré la reprise Estelle : "+requested.get());
            require(!partial.exists()&&store.installed(estelle)&&h.autoVoice("fr").equals(estelle.id),"Reprise et Estelle prioritaire");
            downloadWithRetry(h,kokoro.id,(n,total)->{});
            require(store.installed(kokoro)&&h.autoVoice("fr").equals(estelle.id)&&h.autoVoice("en").isEmpty(),"Installation Kokoro sans changer la priorité FR");
            require(!new File(store.path(estelle),"models/mimi_encoder.onnx").exists()&&!new File(store.path(kokoro),"espeak-ng-data").exists(),"Données inutiles du pack installées");
            return "Estelle reprise à partir de "+resumed+" octets présents, archives publiques vérifiées, deux installations intactes, Estelle prioritaire";
        }
    }
    private String offlineNewVoice(Context ctx,String id)throws Exception {
        require(noNetwork(ctx),"Réseau actif avant synthèse "+id);
        MainActivity a=open(ctx);File dir=ctx.getExternalFilesDir("verification");
        try {
            waitFor("Fenêtre voix native au premier plan",()->a.isForeground&&a.hasWindowFocus(),15000);
            boolean automatic=id.equals("estelle");String text=automatic?"Tu veux venir ce soir ?\nBravo !":"Tu as aimé cette lecture ?\nMerci !";
            int cps=28;String label="Lectura HD · "+a.hd.voice(id).getString("nom");
            if(automatic)seedPreviousEstelleCache(ctx,a.refs,text,cps);
            main(()->{
                require(a.hd.installed(a.hd.voice(id)),"Pack absent après relance : "+id);
                a.dismiss();Project p=new Project(a.db.settings);p.text=text;p.speed=automatic?1:1.25f;p.cps=cps;p.engine="auto";p.voice="";
                a.open(p);
                if(!automatic)a.chooseVoice();
            });
            if(!automatic)click(a,label);
            main(()->{require(a.voiceName().equals(label),"Voix du sélecteur "+a.voiceName());a.launch(false);});
            long started=android.os.SystemClock.elapsedRealtime();
            try{waitFor("Démarrage "+id,()->a.reading!=null&&a.reading.playing||!a.preparing&&a.reading==null,150000);}
            catch(AssertionError e){throw new AssertionError("Préparation "+id+" trop lente",e);}
            main(()->require(a.reading!=null&&a.synthesisVoice.equals(id),"Voix effective "+a.synthesisVoice+" ; "+a.journal.peekLast()));
            long startup=android.os.SystemClock.elapsedRealtime()-started;
            if(automatic){
                waitFor("Lecture Estelle à vitesse normale",()->a.reading.rate==1&&a.reading.time()>=250,10000);
                main(()->{a.project.speed=1.25f;a.adjustRate();});
            }
            JSONArray observed=sampleReading(a,dir,id,20000);
            int[] peak={0};
            main(()->{
                Reading r=a.reading;require(r.pcm!=null&&r.pcm.rate==24000&&r.rate==1.25&&r.ended&&r.text.equals(text)&&noNetwork(ctx),"Lecture native incomplète");
                peak[0]=automatic?estelleWave(r.pcm):pcmPeak(r.pcm,0,(long)r.duration);
                require(peak[0]>900,"Voix muette : "+id);
                if(automatic)Files.copy(r.pcm.file.toPath(),new File(dir,"estelle-pcm24k.wav").toPath(),StandardCopyOption.REPLACE_EXISTING);
                List<Script.Segment> parts=r.timeline.parts;
                require(parts.size()==2&&parts.get(0).to-parts.get(0).speechEnd==560&&parts.get(1).to-parts.get(1).speechEnd==400,"Pauses du vrai PCM");
            });
            String cached=checkNewVoiceCache(ctx,id,text,cps);
            return id+" à froid en avion, "+(automatic?"1× puis ":"")+"1,25× (PCM 24 kHz), démarrage "+startup+" ms, "+observed.length()+" observations, pic "+peak[0]
                +(automatic?"/32768, aucun écrêtage et anciens caches ignorés":"")+" ; "+cached;
        }finally{main(a::finish);}
    }
    private static int estelleWave(Pcm wav)throws Exception {
        require(wav.channels==1&&wav.rate==Pocket.RATE&&Pcm.mono16Frames(wav.file,Pocket.RATE)==wav.frames,"En-tête WAV d’Estelle");
        MediaExtractor decoder=new MediaExtractor();
        try {
            decoder.setDataSource(wav.file.getPath());MediaFormat format=decoder.getTrackFormat(0);
            require(decoder.getTrackCount()==1&&"audio/raw".equals(format.getString(MediaFormat.KEY_MIME))
                &&format.getInteger(MediaFormat.KEY_SAMPLE_RATE)==Pocket.RATE&&format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)==1
                &&Math.abs(format.getLong(MediaFormat.KEY_DURATION)-1000*wav.duration())<1000,"Android ne lit pas le format/durée attendus : "+format);
        }finally{decoder.release();}
        int peak=pcmPeak(wav,0,(long)Math.ceil(wav.duration()));
        require(peak<=Math.round(32768*VoiceRender.ESTELLE_PEAK),"PCM Estelle hors marge : "+peak);
        return peak;
    }
    private static String oldKey(String algorithm,String input)throws Exception {
        byte[] digest=java.security.MessageDigest.getInstance(algorithm).digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder(digest.length*2);
        for(byte b:digest)out.append(Character.forDigit((b&255)>>>4,16)).append(Character.forDigit(b&15,16));
        return out.toString();
    }
    private static void seedPreviousEstelleCache(Context ctx,Refs refs,String text,int cps)throws Exception {
        File phrases=Library.dir(ctx.getCacheDir(),"phrases"),whole=Library.dir(ctx.getCacheDir(),"synthese");
        // Valid legacy cache keys and headers, but deliberately silent: neither layer may be reused.
        for(var f:SpeechPlan.plan(text,"fr",Refs.object(refs.json("prononciation.json"),"fr"))){
            String key=oldKey("SHA-1","phrase-3|estelle|"+f.spoken);
            Files.write(new File(phrases,key+".f32").toPath(),new byte[Mimi.SAMPLES_PER_LATENT*Float.BYTES]);
        }
        String key=oldKey("SHA-256","rendu-3|estelle|"+cps+"|"+text);
        try(RandomAccessFile file=new RandomAccessFile(new File(whole,key+".wav"),"rw")){
            int size=Pocket.RATE*2*2;Pcm.header(file,1,Pocket.RATE,size);file.setLength(44L+size);
        }
        Library.writeJson(new File(whole,key+".json"),new JSONObject("{\"spans\":[[0,640,1200],[1200,1600,2000]]}"));
    }
    private String checkNewVoiceCache(Context ctx,String id,String text,int cps)throws Exception {
        File phraseDir=new File(ctx.getCacheDir(),"phrases");
        String[] before=phraseDir.list((d,n)->n.endsWith(".f32"));require(before!=null&&before.length>=2,"Cache de phrases absent");
        try(Hd cached=new Hd(new Refs(ctx))) {
            long start=android.os.SystemClock.elapsedRealtime();
            Hd.Synthesis whole=cached.synth(text,id,cps,(n,total)->require(n==1&&total==1,"WAV complet pas repris"));
            long full=android.os.SystemClock.elapsedRealtime()-start;
            // Only the final paragraph break changes. The WAV must change but neither spoken phrase should be resynthesized.
            Hd.Synthesis phr=cached.synth(text+"\n",id,cps,(n,total)->require(total==2,"Le texte édité ne doit pas réutiliser le WAV complet"));
            long end=android.os.SystemClock.elapsedRealtime()-start;
            try(Pcm a=whole.pcm;Pcm b=phr.pcm){
                require(!a.file.equals(b.file)&&b.frames-a.frames==3840,"Le WAV édité doit ajouter 160 ms au silence final");
                short[] rawA=new short[(int)a.frames],rawB=new short[(int)a.frames];
                a.read(0,rawA,(int)a.frames);b.read(0,rawB,(int)a.frames);
                require(Arrays.equals(rawA,rawB),"PCM des phrases différent après édition des seules pauses");
            }
            String[] after=phraseDir.list((d,n)->n.endsWith(".f32"));require(after!=null,"Cache de phrases absent");
            Arrays.sort(before);Arrays.sort(after);require(Arrays.equals(before,after),"Phrases recalculées malgré le cache");
            return "cache WAV "+full+" ms, édition avec cache de phrases "+(end-full)+" ms";
        }
    }
    private String offlineSiwis(Context ctx)throws Exception {
        require(noNetwork(ctx),"Siwis testé avec réseau actif");
        MainActivity a=open(ctx);
        String text="Tu viens ce soir ?\nVraiment ?\n$ echo silence\nLes yeux de monsieur.";
        try{
            waitFor("Fenêtre Siwis au premier plan",()->a.isForeground&&a.hasWindowFocus(),15000);
            long start=android.os.SystemClock.elapsedRealtime();
            main(()->{
                Project p=new Project(a.db.settings);p.text=text;p.engine="piper";p.voice="siwis";p.cps=28;p.speed=1;
                a.open(p);a.launch(false);
            });
            waitFor("Lecture Siwis Piper à froid",()->a.reading!=null&&a.reading.playing,40000);
            long cold=android.os.SystemClock.elapsedRealtime()-start;
            waitFor("Premier son Siwis Piper",()->a.reading.time()>100,8000);
            main(()->{
                Reading r=a.reading;r.pause();
                require(a.synthesisVoice.equals("siwis")&&r.pcm.rate==22050&&r.text.equals(text)&&r.timeline.parts.size()==4,"Voix, format ou chronologie Siwis Piper");
                var spans=r.timeline.parts;
                for(int i=0;i<spans.size();i++){
                    var p=spans.get(i);int peak=pcmPeak(r.pcm,p.from+1,p.to-1);
                    require(i==2?peak==0:peak>900,"Signal inattendu dans le segment Siwis : "+p.text);
                }
                r.seek(spans.get(3).from);require(!r.playing&&r.chars(r.time())==spans.get(3).start,"Saut/curseur Siwis Piper");
                a.startPlaying();
            });
            waitFor("Fin sans coupure de Siwis Piper",()->a.reading.ended,13000);
            String dialogue="Demain, on part à 8 h 30. Tu seras là ? Oui ! D’où est-ce qu’on part ? De la gare. Parfait !";
            Hd.Synthesis dialogueAudio=a.hd.synth(dialogue,"siwis",28,(n,total)->{});
            try(Pcm wav=dialogueAudio.pcm){
                var spans=dialogueAudio.segments;
                require(spans.size()==7&&spans.get(1).text.equals("on part à 8 h 30.")&&spans.get(4).text.startsWith("D’où est-ce"),"Segments originaux du dialogue Siwis");
                int[] pauses={105,300,360,320,360,300,320};
                for(int i=0;i<spans.size();i++){
                    var p=spans.get(i);
                    require(Math.abs(p.to-p.speechEnd-pauses[i])<=1&&pcmPeak(wav,p.from+1,p.speechEnd-1)>900
                        &&pcmPeak(wav,p.speechEnd+1,p.to-1)==0,"Durée et signal Siwis : "+p.text);
                }
                Files.copy(wav.file.toPath(),new File(ctx.getExternalFilesDir("verification"),"android-siwis-dialogue-1.1.wav").toPath(),StandardCopyOption.REPLACE_EXISTING);
            }
            return "Piper Siwis réel en avion ; démarrage à froid "+cold+" ms ; WAV 22 050 Hz, pause, saut, curseur et silence ; dialogue corrigé rendu en PCM";
        }finally{main(a::finish);}
    }
    private String hd(Refs refs)throws Exception {
        try(Hd h=new Hd(refs)){
            require(Hd.supported(),"AAR ONNX absent");
            require(h.voices.size()==12&&h.voice("tom")!=null&&h.voice("siwis")!=null,"Catalogue des voix et deux secours Piper");
            File partial=new File(refs.context.getFilesDir(),"models/gilles.onnx.part");
            h.remove("gilles");
            try{downloadWithRetry(h,"gilles",(a,b)->{if(a<b)throw new java.util.concurrent.CancellationException();});throw new AssertionError("Téléchargement Piper non interrompu");}
            catch(java.util.concurrent.CancellationException expected){require(partial.length()>0,"Reprise Piper sans segment partiel");}
            int retries=downloadWithRetry(h,"gilles",(a,b)->{});
            require(!partial.exists()&&h.installed(h.voice("gilles")),"Reprise du téléchargement Piper");
            String text="Bonjour Lectura.\n$ echo\nTrès bien !";
            File synthesis;
            int head,first,last,command;
            Hd.Synthesis reading=h.synth(text,"gilles",28,(a,b)->{});
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
            try(Pcm cached=h.synth(text,"gilles",28,(a,b)->require(b==1,"Cache non réutilisé")).pcm){require(synthesis.equals(cached.file),"Cache Piper");}
            return "Gilles : téléchargement interrompu/repris, pics PCM des phrases "+first+"/"+last
                +" (première seconde "+head+", commande "+command+", reprises après délai réseau : "+retries+"), cache ; modèle conservé pour le redémarrage en mode avion";
        }
    }
}
