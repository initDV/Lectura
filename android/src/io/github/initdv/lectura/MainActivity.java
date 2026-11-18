package io.github.initdv.lectura;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Insets;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.speech.tts.Voice;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import static io.github.initdv.lectura.Refs.*;

public final class MainActivity extends Activity {
    Refs refs;Ui ui;Library db;Project project;
    FrameLayout root,content,modal;
    LinearLayout toasts;
    ScenePage scene;Stage stage;Screens screens;Reading reading;Mood mood;Talk talk;Hd hd;ExportUi exports;
    String route="scene",forced="",sig="",lastDraft="";
    boolean pro,muted,preparing,stopped=true,isForeground,fullscreen;
    final Handler handler=new Handler(Looper.getMainLooper());
    final ExecutorService queue=Executors.newSingleThreadExecutor();
    final ArrayDeque<String> journal=new ArrayDeque<>();
    final Runnable draftTimer=new Runnable(){@Override public void run(){draft();handler.postDelayed(this,5000);}};
    Future<?> preparation,prewarm,hdDownload,hdListening;
    Runnable prewarmTimer;
    android.media.MediaPlayer hdPlayer;
    String hdChoice="";int generation,hdDemoGen;
    Consumer<Uri> result;
    Runnable backModal,modalCleanup;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);refs=new Refs(this);db=new Library(refs);hd=new Hd(refs);refreshLicense();project=db.draft();ui=new Ui(this,refs);exports=new ExportUi(this);
        getWindow().setDecorFitsSystemWindows(false);getWindow().setStatusBarColor(0);getWindow().setNavigationBarColor(0);
        getWindow().setNavigationBarContrastEnforced(false);getWindow().setStatusBarContrastEnforced(false);
        getWindow().getInsetsController().setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        root=new FrameLayout(this);root.setOnApplyWindowInsetsListener((v,i)->{
            Insets bars=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());Insets keyboard=i.getInsets(WindowInsets.Type.ime());
            root.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));return WindowInsets.CONSUMED;
        });
        content=new FrameLayout(this);content.setFocusableInTouchMode(true);root.addView(content,new FrameLayout.LayoutParams(-1,-1));
        toasts=ui.col();FrameLayout.LayoutParams tp=ui.fp(Ui.MATCH,Ui.WRAP,Gravity.TOP|Gravity.CENTER_HORIZONTAL);tp.topMargin=ui.d(10);tp.leftMargin=tp.rightMargin=ui.d(12);root.addView(toasts,tp);
        toasts.setElevation(ui.f(16));setContentView(root);talk=new Talk(this,()->{if(scene!=null)scene.voice();else if(screens!=null&&route.equals("reglages"))screens.refresh();});
        render("scene");if(!db.settings.optBoolean("tutorielVu"))tutorial(1);handler.postDelayed(draftTimer,5000);
    }
    @Override protected void onResume(){super.onResume();isForeground=true;if(stage!=null)stage.refresh();exports.foreground();}
    @Override protected void onPause(){isForeground=false;exports.background();stopHdExample();if(reading!=null&&reading.playing){reading.pause();playState();}draft();super.onPause();}
    @Override protected void onDestroy(){dismiss();disposeScene();exports.close();handler.removeCallbacksAndMessages(null);if(hdDownload!=null)hdDownload.cancel(true);queue.submit(hd::close);queue.shutdown();if(talk!=null)talk.close();super.onDestroy();}
    @Override public void onBackPressed(){
        if(modal!=null){Runnable r=backModal;dismiss();if(r!=null)r.run();}
        else if(stage!=null&&stage.presenting)presentation(false);else if(fullscreen)fullscreen();else if(!route.equals("scene"))go("scene");else super.onBackPressed();
    }
    void refreshLicense(){String key=db.settings.optString("licence");pro=!key.isEmpty()&&Library.verify(key,db.settings.optString("idInstallation"),refs.json("license-key.json")).isEmpty();}
    boolean reduced(){return !android.animation.ValueAnimator.areAnimatorsEnabled();}
    boolean online(){ConnectivityManager cm=getSystemService(ConnectivityManager.class);return cm.getActiveNetwork()!=null;}
    float volume(){return (float)db.settings.optDouble("volume",1);}
    float viewportHeight(){return content.getHeight()>0?content.getHeight()/ui.density:getResources().getDisplayMetrics().heightPixels/ui.density;}
    String t(String key,Object... data){return refs.label(db.locale(),key,data);}
    void go(String name){draft();render(name);}
    void render(String name){
        dismiss();hideKeyboard();if(fullscreen&&!name.equals("scene"))fullscreen();disposeScene();ui.theme(db.settings.optString("themeApp","actuel"));
        root.setBackgroundColor(ui.bg);content.removeAllViews();route=name;
        int light=android.graphics.Color.luminance(ui.bg)>.5?WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS:0;
        getWindow().getInsetsController().setSystemBarsAppearance(light,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        if(name.equals("scene")){
            JSONObject d=refs.character(project.character);
            if(d==null||!pro&&d.optBoolean("pro")){note(t(d==null?"scene.persoIntrouvable":"scene.persoPro","id",project.character,"nom",d==null?"":d.optString("nom")),"warn");d=refs.character("robot_lectura");}
            stage=new Stage(this,d);scene=new ScenePage(this,stage);content.addView(scene.scroll,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));
            if(db.settings.optBoolean("modePresentation"))presentation(true);
        }else renderRoute(name);
        content.requestFocus();
    }
    private void disposeScene(){exports.abandon();clearOverlay();cancelPrewarm();stopHdExample();generation++;if(preparation!=null)preparation.cancel(true);preparation=null;preparing=false;
        if(reading!=null)reading.close();reading=null;sig="";forced="";stopped=true;muted=false;scene=null;stage=null;screens=null;
        if(talk!=null)talk.cancel();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
    void draft(){if(project==null)return;String key=project.json().toString();if(key.equals(lastDraft))return;
        try{db.draft(project);lastDraft=key;}catch(IOException ex){log("brouillon",ex);}}
    private void cancelPrewarm(){if(prewarmTimer!=null)handler.removeCallbacks(prewarmTimer);if(prewarm!=null)prewarm.cancel(true);}
    void changedText(){
        cancelPrewarm();String text=project.text,id=project.voice;float rate=project.speed;
        if(!project.fileAudio&&project.engine.equals("piper")&&text.length()>=30&&text.length()<=12000&&hd.installed(hd.voice(id))){
            prewarmTimer=()->prewarm=queue.submit(()->{try{hd.prewarm(text,id,rate);}catch(Exception ignored){}});handler.postDelayed(prewarmTimer,2000);
        }
    }
    void presentation(boolean yes){if(scene==null)return;hideKeyboard();scene.present(yes);if(yes)note(t("scene.presentationAide"),"info",3500);}
    void fullscreen(){fullscreen=!fullscreen;WindowInsetsController i=getWindow().getInsetsController();if(fullscreen)i.hide(WindowInsets.Type.systemBars());else i.show(WindowInsets.Type.systemBars());}
    void open(Project p){project=p;render("scene");}
    void example(){Project p=new Project(db.settings);p.title=t("accueil.exempleTitre");p.text=refs.text("data/samples/exemple_"+db.locale()+".txt").trim();open(p);}
    void tutorial(int n){
        LinearLayout r=sheet(null,22,false);r.setGravity(Gravity.CENTER_HORIZONTAL);r.addView(ui.art(svg("robot_lectura.svg"),1),ui.lp(72,180));ui.gap(r,4);
        TextView title=ui.heading(t("tuto."+n+".titre"),2);title.setGravity(Gravity.CENTER);ui.add(r,title,0);
        TextView text=ui.p(t("tuto."+n+".texte"));text.setGravity(Gravity.CENTER);ui.add(r,text,8);
        LinearLayout dots=ui.row();dots.setGravity(Gravity.CENTER);ui.add(r,dots,12);
        for(int j=1;j<=3;j++){if(j>1)ui.gap(dots,8);View v=new View(this);v.setBackground(ui.shape(j==n?ui.accent:ui.border,99,0,0));dots.addView(v,ui.lp(8,8));}
        LinearLayout row=ui.row();row.setGravity(Gravity.RIGHT);ui.add(r,row,12);row.addView(ui.button(t("tuto.passer"),null,false,true,()->{dismiss();db.set("tutorielVu",true);}));ui.gap(row,10);
        row.addView(ui.button(t(n<3?"tuto.suivant":"tuto.commencer"),null,true,false,()->{if(n<3)tutorial(n+1);else {dismiss();db.set("tutorielVu",true);example();}}));
        backModal=()->db.set("tutorielVu",true);
    }
    Svg svg(String path){try(InputStream in=refs.open("characters/"+path)){return new Svg(in);}catch(IOException e){throw new IllegalArgumentException(e);}}
    LinearLayout sheet(String title){return sheet(title,16,true);}
    LinearLayout sheet(String title,int padding,boolean dismissOutside){
        dismiss();hideKeyboard();modal=new FrameLayout(this);modal.setBackgroundColor(0xd106060a);ui.pad(modal,16,16);modal.setElevation(ui.f(12));
        modal.setOnClickListener(v->{if(dismissOutside)dismiss();});content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        LinearLayout r=ui.col();ui.pad(r,padding,padding);r.setFocusableInTouchMode(true);r.setClickable(true);
        ScrollView s=ui.scroll();s.setBackground(ui.shape(ui.surface,title==null?18:ui.radiusLg,ui.border,1));s.setClipToOutline(true);s.addView(r,new ScrollView.LayoutParams(-1,-2));
        if(title!=null){LinearLayout h=ui.row();ui.grow(h,ui.heading(title,2));ui.gap(h,8);h.addView(ui.iconButton("x",t("commun.fermer"),ui.mutedText,20,this::dismiss),ui.lp(44,44));ui.add(r,h,0);r.setAccessibilityPaneTitle(title);}
        FrameLayout.LayoutParams lp=ui.fp(Math.min(460,Math.max(180,root.getWidth()>0?(root.getWidth()-root.getPaddingLeft()-root.getPaddingRight())/ui.density-32:getResources().getDisplayMetrics().widthPixels/ui.density-32)),Ui.WRAP,Gravity.CENTER);
        modal.addView(s,lp);root.addView(modal,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));r.requestFocus();return r;
    }
    void dismiss(){backModal=null;if(modalCleanup!=null){Runnable clean=modalCleanup;modalCleanup=null;clean.run();}if(modal!=null){root.removeView(modal);modal=null;content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}}
    void choice(LinearLayout r,String title,String icon,boolean selected,boolean pro,Runnable fn){ui.add(r,ui.choice(title,icon,selected,pro,fn),4);}
    void choose(String title,List<String> names,int selected,Consumer<Integer> fn){LinearLayout r=sheet(title);for(int i=0;i<names.size();i++){int p=i;choice(r,names.get(i),null,i==selected,false,()->{dismiss();fn.accept(p);});}}
    void confirm(String title,Runnable fn){LinearLayout r=sheet(t("commun.oui"));ui.add(r,ui.p(title),4);LinearLayout row=ui.row();row.setGravity(Gravity.RIGHT);ui.add(r,row,12);
        row.addView(ui.button(t("commun.annuler"),null,this::dismiss));ui.gap(row,10);row.addView(ui.button(t("commun.oui"),null,true,false,()->{dismiss();fn.run();}));}
    void note(String m,String type){note(m,type,4500);}
    void note(String m,String type,long duration){
        if(root==null)return;LinearLayout r=ui.row();r.setBackground(ui.shape(ui.surface2,12,ui.border,1));ui.pad(r,0,0,6,0);
        View bar=new View(this);bar.setBackgroundColor(type.equals("warn")?ui.warn:type.equals("error")?ui.danger:type.equals("ok")?ui.ok:ui.accent);r.addView(bar,ui.lp(4,44));ui.gap(r,12);
        TextView p=ui.p(m);ui.pad(p,0,10);ui.grow(r,p);View x=ui.iconButton("x",t("commun.fermer"),ui.mutedText,16,()->toasts.removeView(r));r.addView(x,ui.lp(32,44));
        if(toasts.getChildCount()>=3)toasts.removeViewAt(0);ui.add(toasts,r,0);p.announceForAccessibility(m);handler.postDelayed(()->toasts.removeView(r),duration);
    }
    void log(String where,Throwable e){String m=e.getMessage()!=null?e.getMessage():e.toString();journal.addLast(Instant.now()+" ["+where+"] "+m);
        if(journal.size()>50)journal.removeFirst();android.util.Log.e("Lectura",where,e);}
    void report(String where,Throwable e){log(where,e);note(e.getMessage()==null?e.toString():e.getMessage(),"error",6500);}
    void copy(String desc,String text){getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText(desc,text));note(t("commun.copie"),"ok");}
    void hideKeyboard(){if(getCurrentFocus()!=null)getSystemService(InputMethodManager.class).hideSoftInputFromWindow(getCurrentFocus().getWindowToken(),0);}

    private String signature(boolean silent){return Script.clean(project.text)+"\u0001"+silent+"|"+project.fileAudio+"|"+project.fileName+"|"+project.engine+"|"+project.voice+"|"+(project.engine.equals("piper")?project.speed:0)+"|"+project.cps;}
    void launch(boolean silent){
        if(scene==null||preparing)return;if(reading!=null&&reading.playing&&!silent){reading.pause();playState();return;}
        String text=Script.clean(project.text);if(text.trim().isEmpty()){note(t("scene.err.texteVide"),"warn");scene.edit.requestFocus();return;}
        String signature=signature(silent);
        if(reading!=null&&(sig.equals(signature)||!silent&&reading.silent&&!stopped&&!reading.ended)){
            if(stopped||reading.ended)reading.seek(0);startPlaying();return;}
        if(!silent&&!project.fileAudio&&!project.engine.equals("piper")&&!talk.ready&&!talk.failure){note(t("scene.prep.ressources"),"info");return;}
        cancelPrewarm();hideKeyboard();content.requestFocus();if(reading!=null){reading.close();reading=null;}stopped=true;preparing=true;playState();
        int ticket=++generation;Project cfg=Project.fromJson(project.json());String lang=db.locale();boolean hasPro=pro;
        JSONObject personal=object(db.settings,"motsPerso");Voice v=!silent&&!cfg.fileAudio&&!cfg.engine.equals("piper")?talk.choose(lang,cfg.voice):null;
        boolean localReady=talk.ready;File audio=db.audio(project),cache=getCacheDir();
        LinearLayout loading=sceneOverlay(t("scene.prep.titre"));TextView loadingText=ui.small(t("scene.prep.ressources"));ui.add(loading,loadingText,5);
        android.widget.ProgressBar bar=new android.widget.ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);bar.setMax(1000);ui.add(loading,bar,12);
        preparation=queue.submit(()->{
            Pcm decoded=null;boolean delivered=false;try{
                Script.Keywords words=new Script.Keywords(refs,lang,hasPro,personal);List<Script.Segment> segments;float base=1;
                if(silent)segments=Script.timing(text,text.length()*1000./cfg.cps,1);
                else if(cfg.fileAudio){if(!audio.isFile())throw new IOException(t("scene.err.sansAudio"));
                    decoded=Pcm.decode(audio,cache);segments=cfg.subtitles?Script.locate(text,cfg.segments,true):null;
                    if(segments==null)segments=Script.timing(text,decoded.duration(),0);
                }else if(cfg.engine.equals("piper")){
                    if(text.length()>12000)throw new IOException(t("voix.hd.err.tropLong","max",12000,"n",text.length()));
                    if(!hd.installed(hd.voice(cfg.voice)))throw new IOException(t("voix.hd.err.manquant"));
                    Hd.Synthesis syn=hd.synth(text,cfg.voice,cfg.speed,cfg.cps,(n,total)->handler.post(()->{
                        loadingText.setText(t("voix.hd.synthesePhrase","i",Math.min(n+1,total),"n",total));bar.setProgress((int)(1000*n/Math.max(1,total)));}));
                    decoded=syn.pcm;segments=syn.segments;base=cfg.speed;
                }
                else {if(v==null)throw new IOException(t(localReady?"voix.err.aucune":"voix.err.absente"));base=cfg.speed;segments=Script.timing(text,Script.estimate(text,cfg.speed,cfg.cps),14./cfg.cps);}
                Script.reportExpressions(segments,cfg.segments);if(segments.isEmpty())throw new IOException(t("scene.err.texteVide"));
                Mood m=new Mood(refs,lang,words,hasPro,cfg.emotions);Pcm pcm=decoded;final float baseRate=base;final List<Script.Segment> parts=segments;
                handler.post(()->{if(generation!=ticket||scene==null){if(pcm!=null)pcm.close();return;}try{
                    reading=new Reading(text,parts,words,silent,pcm,talk,v,cfg,baseRate,this::readingFinished,code->readingError(code));
                    mood=m;preparing=false;sig=signature;clearOverlay();reading.volume(volume(),muted);reading.speed(project.speed);
                    if(silent)note(t("scene.apercuActif"),"info");startPlaying();
                }catch(Exception e){if(pcm!=null&&reading==null)pcm.close();sceneError(e);}});delivered=true;
            }catch(Exception e){handler.post(()->{if(ticket==generation)sceneError(e);});}finally{if(!delivered&&decoded!=null)decoded.close();}
        });
    }
    FrameLayout sceneOverlay;
    LinearLayout sceneOverlay(String title){
        clearOverlay();sceneOverlay=new FrameLayout(this);sceneOverlay.setBackground(ui.shape(0xe00d0d12,ui.radiusLg,0,0));sceneOverlay.setClickable(true);sceneOverlay.setElevation(ui.f(9));ui.pad(sceneOverlay,12,12);
        LinearLayout c=ui.card();c.setGravity(Gravity.CENTER_HORIZONTAL);TextView h=ui.heading(title,2);h.setGravity(Gravity.CENTER);ui.add(c,h,0);
        ScrollView s=ui.scroll();s.addView(c,new ScrollView.LayoutParams(-1,-2));
        sceneOverlay.addView(s,ui.fp(Math.max(120,Math.min(440,stage.getWidth()/ui.density-24)),Ui.WRAP,Gravity.CENTER));stage.addView(sceneOverlay,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));return c;
    }
    void clearOverlay(){if(sceneOverlay!=null){if(sceneOverlay.getParent() instanceof FrameLayout)((FrameLayout)sceneOverlay.getParent()).removeView(sceneOverlay);sceneOverlay=null;}}
    void sceneError(Throwable error){if(stage==null)return;exports.abandon();log("scene",error);if(reading!=null){reading.close();reading=null;}sig="";preparing=false;stopped=true;playState();
        LinearLayout card=sceneOverlay(t("scene.err.titre"));TextView p=ui.p(error.getMessage()==null?error.toString():error.getMessage());p.setGravity(Gravity.CENTER);ui.add(card,p,8);
        ui.add(card,ui.button(t("commun.fermer"),null,this::clearOverlay),8);ui.add(card,ui.button(t("nav.reglages"),null,()->go("reglages")),6);
        ui.add(card,ui.button(t("scene.apercuSansSon"),null,()->launch(true)),6);ui.add(card,ui.button(t("commun.reessayer"),null,true,false,()->launch(false)),6);
    }
    private void readingError(String code){sceneError(new IOException(code.equals("bloquee")?t("voix.err.bloquee"):code.equals("non-demarree")?t("voix.err.nonDemarree"):t("voix.err.lecture","code",code)));}
    void startPlaying(){try{stopped=false;reading.play();playState();}catch(Exception e){sceneError(e);}}
    void adjustRate(){try{if(reading!=null){reading.speed(project.speed);exports.mark(true);}}catch(RuntimeException e){sceneError(e);}}
    void adjustVolume(){if(reading!=null)reading.volume(volume(),muted);if(scene!=null)scene.update();}
    void stop(){exports.stop();if(preparing){if(preparation!=null)preparation.cancel(true);generation++;clearOverlay();preparing=false;}
        if(reading!=null)reading.pause();stopped=true;playState();}
    void readingFinished(){stopped=true;playState();exports.naturalEnd();}
    void playState(){exports.mark(false);if(scene!=null)scene.update();if(reading!=null&&reading.playing)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
    void seek(int ms){if(reading==null)return;double now=reading.time();if(reading.ended)stopped=false;reading.seek(now+ms);playState();exports.mark(true);}
    void nextExpression(){List<String> ids=new ArrayList<>();ids.add("");refs.expressions.keys().forEachRemaining(id->{if(!id.equals("neutre")&&(pro||!object(refs.expressions,id).optBoolean("pro")))ids.add(id);});
        forced=ids.get((ids.indexOf(forced)+1)%ids.size());note(t("scene.expression")+" : "+t("expr."+(forced.isEmpty()?"auto":forced)),"info",1800);}
    @Override public boolean dispatchKeyEvent(KeyEvent e){
        if(e.getAction()==KeyEvent.ACTION_DOWN&&e.getRepeatCount()==0&&!e.isCtrlPressed()&&!e.isMetaPressed()&&!e.isAltPressed()&&modal==null&&stage!=null&&!(getCurrentFocus() instanceof EditText)){
            switch(e.getKeyCode()){
                case KeyEvent.KEYCODE_SPACE:if(getCurrentFocus()!=null&&getCurrentFocus().isClickable())break;launch(false);return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:seek(-5000);return true;case KeyEvent.KEYCODE_DPAD_RIGHT:seek(5000);return true;
                case KeyEvent.KEYCODE_P:presentation(!stage.presenting);return true;case KeyEvent.KEYCODE_M:muted=!muted;adjustVolume();return true;
                case KeyEvent.KEYCODE_F:fullscreen();return true;case KeyEvent.KEYCODE_E:nextExpression();return true;
                case KeyEvent.KEYCODE_ESCAPE:presentation(false);return true;
                case KeyEvent.KEYCODE_S:capturePng();return true;case KeyEvent.KEYCODE_R:record();return true;
                default:break;}
        }return super.dispatchKeyEvent(e);
    }
    String voiceName(){
        if(project.fileAudio)return project.fileName.isEmpty()?t("scene.voix.fichierAbsent"):project.fileName+" · "+Refs.time(project.duration);
        if(project.engine.equals("piper")){JSONObject v=hd.voice(project.voice);return hd.installed(v)?"Lectura HD · "+v.optString("nom"):t("scene.voix.hdAbsente");}
        Voice v=talk.choose(db.locale(),project.voice);if(v!=null){project.voice=v.getName();return v.getName();}return t("scene.voix.aucune");
    }
    void chooseVoice(){LinearLayout r=sheet(t("scene.voix.choisir"));ui.group(r,t("scene.voix.systeme"),true);List<Voice> voices=talk.voices(db.locale());
        if(voices.isEmpty())ui.add(r,ui.small(t("voix.err.aucune")),0);
        for(Voice voice:voices)choice(r,voice.getName()+(voice.isNetworkConnectionRequired()?" · "+t("voix.enLigne"):""),"voice",!project.fileAudio&&project.voice.equals(voice.getName()),false,()->{dismiss();selectVoice("webspeech",voice.getName());});
        ui.group(r,t("voix.hd.titre"),false);List<JSONObject> installed=installedHd();
        if(installed.isEmpty())choice(r,t("voix.hd.gerer"),"download",false,false,()->go("reglages"));
        for(JSONObject v:installed){String id=v.optString("id");choice(r,"Lectura HD · "+v.optString("nom"),"sparkle",!project.fileAudio&&project.engine.equals("piper")&&project.voice.equals(id),false,()->{dismiss();selectVoice("piper",id);});}
        ui.group(r,t("scene.voix.fichierTitre"),false);choice(r,project.fileAudio?voiceName():t("scene.voix.fichier"),"upload",project.fileAudio,false,()->{dismiss();pickAudio();});}
    void selectVoice(String engine,String id){project.fileAudio=false;project.engine=engine;project.voice=id;db.set("moteurVoix",engine);db.set("voixId",id);if(scene!=null)scene.voice();cancelPrewarm();if(engine.equals("piper"))prewarm=queue.submit(()->{try{hd.prewarm("a",id,1);}catch(Exception ignored){}});}
    void pick(String mime,Consumer<Uri> onResult){Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime);request(intent,onResult);}
    void createFile(String mime,String name,Consumer<Uri> writer){request(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name),writer);}
    private void request(Intent intent,Consumer<Uri> callback){if(result!=null)return;result=callback;try{startActivityForResult(intent,73);}catch(Exception e){result=null;report("fichier",e);}}
    @Override protected void onActivityResult(int code,int outcome,Intent data){super.onActivityResult(code,outcome,data);if(code==73){Consumer<Uri> cb=result;result=null;if(outcome==RESULT_OK&&data!=null&&data.getData()!=null&&cb!=null)cb.accept(data.getData());}}
    String fileName(Uri uri){try(android.database.Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}return "audio";}
    String fileText(Uri uri,int max)throws IOException {try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Fichier illisible.");return new String(Refs.read(in,max),StandardCharsets.UTF_8).replaceFirst("^\ufeff","");}}
    void writeDoc(String mime,String file,String text){createFile(mime,file,uri->{try(java.io.OutputStream o=getContentResolver().openOutputStream(uri,"wt")){if(o==null)throw new IOException("Fichier indisponible.");o.write(text.getBytes(StandardCharsets.UTF_8));}catch(Exception e){report("fichier",e);}});}
    void pickAudio(){pick("audio/*",uri->{
        Project target=project;File dest=db.audio(target);String name=fileName(uri);queue.submit(()->{
            File temp=null;try{temp=File.createTempFile("import-",".audio",dest.getParentFile());
                try(InputStream in=getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(temp)){
                    if(in==null)throw new IOException("Fichier illisible.");byte[] bytes=new byte[65536];long total=0;for(int n;(n=in.read(bytes))>=0;){Pcm.interrupted();if((total+=n)>Pcm.MAX_BYTES)throw new IOException("Fichier audio trop volumineux.");out.write(bytes,0,n);}}
                String duration;try(android.media.MediaMetadataRetriever media=new android.media.MediaMetadataRetriever()){
                    media.setDataSource(temp.getPath());duration=media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
                    if(duration==null||!"yes".equals(media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)))throw new IOException("Format audio non reconnu (MP3, WAV, Ogg, M4A, AAC, WebM).");}
                java.nio.file.Files.move(temp.toPath(),dest.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);long ms=Long.parseLong(duration);
                handler.post(()->{target.fileAudio=true;target.fileName=name;target.duration=ms;sig="";if(scene!=null)scene.voice();});
            }catch(Exception e){handler.post(()->report("audio",e));}finally{if(temp!=null)temp.delete();}
        });
    });}
    void capturePng(){if(reading==null){note(t("scene.err.rienACapturer"),"info");return;}
        boolean portrait=viewportHeight()>content.getWidth()/ui.density;int w=portrait?1080:1280,h=portrait?1920:720;
        android.graphics.Bitmap b=android.graphics.Bitmap.createBitmap(w,h,android.graphics.Bitmap.Config.ARGB_8888);stage.exportDraw(new android.graphics.Canvas(b),w,h,true,0);
        String name=project.base()+"-"+Instant.now().toString().substring(0,19).replaceAll("[:T]","-")+".png";
        createFile("image/png",name,uri->{try(java.io.OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output==null||!b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output))throw new IOException("Capture impossible.");note(t("scene.captureOk"),"ok");}catch(Exception e){report("capture",e);}finally{b.recycle();}});}
    void record(){exports.toggle();}
    void recordFrame(double now){exports.frame(now);}
    void renderRoute(String name){screens=new Screens(this,name);}
    List<JSONObject> installedHd(){return hd.installed();}
    void hdPanel(LinearLayout c){LinearLayout rows=ui.col();ui.add(c,rows,0);new HdPanel(this,rows);}
    void stopHdExample(){hdDemoGen++;if(hdListening!=null)hdListening.cancel(true);hdListening=null;if(hdPlayer!=null){hdPlayer.release();hdPlayer=null;}}
    void hdExample(String id,String text,float rate){
        boolean loading=hdListening!=null&&!hdListening.isDone();stopHdExample();if(loading)return;
        talk.cancel();int ticket=hdDemoGen;note(t("voix.hd.ecoute.chargement"),"info",8000);
        hdListening=queue.submit(()->{try(HdResult r=new HdResult(hd.synth(text,id,rate,28,(now,total)->{}))){
            File wav=r.synthesis.pcm.file;handler.post(()->{if(ticket!=hdDemoGen||!isForeground)return;
                try{hdPlayer=new android.media.MediaPlayer();hdPlayer.setDataSource(wav.getPath());hdPlayer.setVolume(volume(),volume());
                    hdPlayer.setOnCompletionListener(player->{player.release();if(hdPlayer==player)hdPlayer=null;});hdPlayer.setOnPreparedListener(android.media.MediaPlayer::start);hdPlayer.prepareAsync();
                }catch(Exception e){stopHdExample();report("voix-hd",e);}
            });
        }catch(Exception e){handler.post(()->{if(ticket==hdDemoGen)report("voix-hd",e);});}});
    }
    private static final class HdResult implements AutoCloseable {
        final Hd.Synthesis synthesis;HdResult(Hd.Synthesis s){synthesis=s;}
        @Override public void close(){synthesis.pcm.close();}
    }
    void clearHd(){stopHdExample();if(hdDownload!=null)hdDownload.cancel(true);queue.submit(()->{hd.removeAll();handler.post(()->{
        note(t("reglages.stockage.libere"),"ok");if(screens!=null&&route.equals("reglages"))screens.refresh();});});}
    void menu(){
        LinearLayout r=sheet(t("scene.menu"));ui.group(r,t("menu.projet"),true);
        EditText title=ui.field(project.title,t("editeur.sansTitre"),false,200,s->project.title=s);title.setContentDescription(t("editeur.titreProjet"));ui.add(r,title,0);ui.gap(r,14);
        choice(r,t("editeur.enregistrer"),"save",false,false,()->{dismiss();try{project.recalc();db.save(project);lastDraft=project.json().toString();note(t("editeur.enregistre"),"ok");}catch(IOException e){report("projet",e);}});
        choice(r,t("nav.projets"),"folder",false,false,()->go("projets"));
        choice(r,t("editeur.importerTexte"),"upload",false,false,()->{dismiss();pick("text/*",uri->{try{project.text=fileText(uri,500000).replaceAll("\\r\\n?","\n");project.subtitles=false;scene.edit.setText(project.text);}catch(Exception e){report("import",e);}});});
        choice(r,t("editeur.exporter"),"download",false,false,()->{dismiss();project.recalc();writeDoc("application/json",project.base()+".lectura",project.json().toString());});
        choice(r,t("editeur.importerSrt"),"upload",false,!pro,()->{dismiss();if(!pro){note(t("pro.requis.sousTitres"),"info");return;}pick("*/*",uri->{try{Script.importSubtitles(fileText(uri,500000),project);scene.edit.setText(project.text);note(t("editeur.sousTitresImportes"),"ok");}catch(Exception e){report("sous-titres",e);}});});
        for(String format:new String[]{"srt","vtt"})choice(r,t(format.equals("srt")?"menu.exporterSrt":"menu.exporterVtt"),"download",false,!pro,()->{
            dismiss();if(!pro){note(t("pro.requis.sousTitres"),"info");return;}writeDoc(format.equals("srt")?"application/x-subrip":"text/vtt",project.base()+"."+format,Script.subtitles(project.recalc(),format.equals("vtt")));});
        ui.group(r,t("menu.scene"),false);choice(r,t("scene.apercuSansSon"),"eye",false,false,()->{dismiss();launch(true);});
        choice(r,t("scene.capture"),"camera",false,false,()->{dismiss();capturePng();});choice(r,t(exports.active()?"scene.arreterEnregistrement":"scene.enregistrer"),exports.active()?"stop":"record",false,!pro,()->{dismiss();record();});
        choice(r,t("scene.pleinEcran"),"fullscreen",false,false,()->{dismiss();fullscreen();});ui.add(r,ui.p(t("scene.format")),8);
        List<String> formats=List.of("Paysage 16:9 (YouTube)","Vertical 9:16 (TikTok)");
        TextView f=ui.button(formats.get(db.settings.optString("formatVideo").equals("16:9")?0:1),"chevron",()->choose(t("scene.format"),formats,db.settings.optString("formatVideo").equals("16:9")?0:1,i->{db.set("formatVideo",i==0?"16:9":"9:16");menu();}));ui.add(r,f,6);
        ui.group(r,t("menu.avance"),false);choice(r,t("menu.mesVideos"),"video",false,false,()->{dismiss();movies();});
        String[] ids={"personnages","reglages","pro","apropos"},icons={"smile","settings","star","info"};for(int i=0;i<ids.length;i++){String id=ids[i];choice(r,t("nav."+id),icons[i],false,false,()->go(id));}
        ui.add(r,ui.small("● "+t(online()?"net.enLigne":"net.horsLigne")),14);
    }
    void movies(){exports.library();}
}
