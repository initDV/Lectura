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
import android.os.SystemClock;
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
    ScenePage scene;Stage stage;Screens screens;Reading reading;Talk talk;Hd hd;ExportUi exports;
    String route="scene",forced="",sig="",lastDraft="";
    boolean muted,preparing,stopped=true,isForeground,fullscreen;
    final Handler handler=new Handler(Looper.getMainLooper());
    private final PcmDelivery pcmDelivery=new PcmDelivery(handler::post);
    final ExecutorService queue=Executors.newSingleThreadExecutor();
    final ArrayDeque<String> journal=new ArrayDeque<>();
    final Runnable draftTimer=new Runnable(){@Override public void run(){draft();handler.postDelayed(this,5000);}};
    Future<?> preparation,prewarm,hdDownload,hdListening;
    Runnable prewarmTimer;
    android.media.MediaPlayer hdPlayer;
    String hdChoice="",synthesisVoice="",hdDownloading="";
    int generation,hdDemoGen,downloadGen;
    long hdDownloaded,hdDownloadTotal;
    Runnable downloadProgress;
    Consumer<Uri> result;
    Runnable backModal,modalCleanup;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);refs=new Refs(this);db=new Library(refs);hd=new Hd(refs);project=db.draft();ui=new Ui(this,refs);exports=new ExportUi(this);
        getWindow().setDecorFitsSystemWindows(false);getWindow().setStatusBarColor(0);getWindow().setNavigationBarColor(0);
        getWindow().setNavigationBarContrastEnforced(false);getWindow().setStatusBarContrastEnforced(false);
        root=new FrameLayout(this);root.setOnApplyWindowInsetsListener((v,i)->{
            Insets bars=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());Insets keyboard=i.getInsets(WindowInsets.Type.ime());
            root.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));return WindowInsets.CONSUMED;
        });
        content=new FrameLayout(this);content.setFocusableInTouchMode(true);root.addView(content,new FrameLayout.LayoutParams(-1,-1));
        toasts=ui.col();FrameLayout.LayoutParams tp=ui.fp(Ui.MATCH,Ui.WRAP,Gravity.TOP|Gravity.CENTER_HORIZONTAL);tp.topMargin=ui.d(10);tp.leftMargin=tp.rightMargin=ui.d(12);root.addView(toasts,tp);
        toasts.setElevation(ui.f(16));setContentView(root);
        // On API 31, the DecorView does not exist until the activity's content is installed.
        WindowInsetsController bars=getWindow().getInsetsController();
        if(bars!=null)bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        talk=new Talk(this,()->{if(scene!=null)scene.voice();else if(screens!=null&&route.equals("reglages"))screens.refresh();});
        render("scene");if(!db.settings.optBoolean("tutorielVu"))tutorial(1);handler.postDelayed(draftTimer,5000);
    }
    @Override protected void onResume(){super.onResume();isForeground=true;if(stage!=null)stage.refresh();exports.foreground();}
    @Override protected void onPause(){isForeground=false;exports.background();stopHdExample();if(reading!=null&&reading.playing){reading.pause();playState();}draft();super.onPause();}
    @Override protected void onDestroy(){dismiss();disposeScene();exports.close();pcmDelivery.close();handler.removeCallbacksAndMessages(null);
        if(hdDownload!=null)hdDownload.cancel(true);queue.submit(hd::close);queue.shutdown();if(talk!=null)talk.close();super.onDestroy();}
    @Override public void onBackPressed(){
        if(modal!=null){Runnable r=backModal;dismiss();if(r!=null)r.run();}
        else if(stage!=null&&stage.presenting)presentation(false);else if(fullscreen)fullscreen();else if(!route.equals("scene"))go("scene");else super.onBackPressed();
    }
    boolean reduced(){return !android.animation.ValueAnimator.areAnimatorsEnabled();}
    boolean online(){ConnectivityManager cm=getSystemService(ConnectivityManager.class);return cm.getActiveNetwork()!=null;}
    float volume(){float v=(float)db.settings.optDouble("volume",1);return Float.isFinite(v)?Refs.clamp(v,0,1):1;}
    float viewportHeight(){return content.getHeight()>0?content.getHeight()/ui.density:getResources().getDisplayMetrics().heightPixels/ui.density;}
    String t(String key,Object... data){return refs.label(db.locale(),key,data);}
    void go(String name){draft();render(name);}
    void render(String name){
        dismiss();hideKeyboard();if(fullscreen&&!name.equals("scene"))fullscreen();disposeScene();ui.theme(db.settings.optString("themeApp","actuel"));
        root.setBackgroundColor(ui.bg);content.removeAllViews();route=name;
        int light=android.graphics.Color.luminance(ui.bg)>.5?WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS:0;
        WindowInsetsController bars=getWindow().getInsetsController();
        if(bars!=null)bars.setSystemBarsAppearance(light,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        if(name.equals("scene")){
            JSONObject d=refs.character(project.character);
            if(d==null){
                note(t("scene.persoIntrouvable","id",project.character),"warn");
                d=refs.character("robot_lectura");
            }
            stage=new Stage(this,d);scene=new ScenePage(this,stage);content.addView(scene.scroll,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));
            if(db.settings.optBoolean("modePresentation"))presentation(true);
            preloadVoice();
        }else renderRoute(name);
        content.requestFocus();
    }
    private void disposeScene(){exports.abandon();clearOverlay();cancelPrewarm();stopHdExample();generation++;if(preparation!=null)preparation.cancel(true);preparation=null;preparing=false;
        if(reading!=null)reading.close();reading=null;sig="";forced="";stopped=true;muted=false;scene=null;stage=null;screens=null;
        downloadProgress=null;if(talk!=null)talk.cancel();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
    void draft(){if(project==null)return;String key=project.json().toString();if(key.equals(lastDraft))return;
        try{db.draft(project);lastDraft=key;}catch(IOException ex){log("brouillon",ex);}}
    private void cancelPrewarm(){if(prewarmTimer!=null)handler.removeCallbacks(prewarmTimer);if(prewarm!=null)prewarm.cancel(true);}
    void changedText(){
        cancelPrewarm();String text=project.text,id=hdId();
        if(!project.fileAudio&&text.length()>=30&&text.length()<=SpeechPlan.MAX_TEXT&&hd.installed(hd.voice(id))){
            prewarmTimer=()->prewarm=queue.submit(()->{try{hd.prewarm(text,id);}catch(Exception ignored){}});handler.postDelayed(prewarmTimer,2000);
        }
    }
    private void preloadVoice(){
        cancelPrewarm();String id=hdId();
        if(!project.fileAudio&&hd.installed(hd.voice(id))) {
            prewarmTimer=()->prewarm=queue.submit(()->{try{hd.preload(id);}catch(Exception ignored){}});
            handler.postDelayed(prewarmTimer,650);
        }
    }
    void presentation(boolean yes){if(scene==null)return;hideKeyboard();scene.present(yes);if(yes)note(t("scene.presentationAide"),"info",3500);}
    void fullscreen(){WindowInsetsController i=getWindow().getInsetsController();if(i==null)return;fullscreen=!fullscreen;
        if(fullscreen)i.hide(WindowInsets.Type.systemBars());else i.show(WindowInsets.Type.systemBars());}
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
        LinearLayout r=ui.col();ui.pad(r,padding+1,padding+1);r.setFocusableInTouchMode(true);r.setClickable(true);
        ScrollView s=ui.scroll();s.setBackground(ui.shape(ui.surface,title==null?18:ui.radiusLg,ui.border,1));s.setClipToOutline(true);s.addView(r,new ScrollView.LayoutParams(-1,-2));
        if(title!=null){LinearLayout h=ui.row();ui.grow(h,ui.heading(title,2));ui.gap(h,8);h.addView(ui.iconButton("x",t("commun.fermer"),ui.mutedText,20,this::dismiss),ui.lp(44,44));ui.add(r,h,0);r.setAccessibilityPaneTitle(title);}
        FrameLayout.LayoutParams lp=ui.fp(Math.min(460,Math.max(180,root.getWidth()>0?(root.getWidth()-root.getPaddingLeft()-root.getPaddingRight())/ui.density-32:getResources().getDisplayMetrics().widthPixels/ui.density-32)),Ui.WRAP,Gravity.CENTER);
        modal.addView(s,lp);root.addView(modal,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));r.requestFocus();return r;
    }
    void dismiss(){backModal=null;if(modalCleanup!=null){Runnable clean=modalCleanup;modalCleanup=null;clean.run();}if(modal!=null){root.removeView(modal);modal=null;content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}
        if(isForeground&&exports!=null)handler.post(exports::foreground);
    }
    void choice(LinearLayout r,String title,String icon,boolean selected,Runnable fn){ui.add(r,ui.choice(title,icon,selected,fn),4);}
    void choose(String title,List<String> names,int selected,Consumer<Integer> fn){LinearLayout r=sheet(title);for(int i=0;i<names.size();i++){int p=i;choice(r,names.get(i),null,i==selected,()->{dismiss();fn.accept(p);});}}
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

    private String signature(boolean silent){return project.text+"\u0001"+silent+"|"+project.fileAudio+"|"+project.fileName+"|"+project.engine+"|"+project.voice+"|"+hdId()+"|"+project.pitch+"|"+project.cps;}
    void launch(boolean silent){
        if(scene==null||preparing)return;if(reading!=null&&reading.playing&&!silent){reading.pause();playState();return;}
        String text=project.text;if(text.trim().isEmpty()){note(t("scene.err.texteVide"),"warn");scene.edit.requestFocus();return;}
        String signature=signature(silent);
        if(exports.capturing()&&!silent){startPlaying();return;}
        if(exports.busy())return;
        if(reading!=null&&(sig.equals(signature)||!silent&&reading.silent&&!stopped&&!reading.ended)){
            if(stopped||reading.ended)reading.seek(0);startPlaying();return;}
        if(!silent&&!project.fileAudio&&!Hd.hdEngine(project.engine)&&hdId().isEmpty()&&!talk.ready&&!talk.failure){note(t("scene.prep.ressources"),"info");return;}
        cancelPrewarm();hideKeyboard();content.requestFocus();if(reading!=null){reading.close();reading=null;}stopped=true;preparing=true;playState();
        int ticket=++generation;Project cfg=Project.fromJson(project.json());String lang=db.locale();
        boolean automatic=cfg.engine.equals("auto");List<String> choices=automatic?hd.automatic(lang):Hd.hdEngine(cfg.engine)?List.of(cfg.voice):List.of();
        JSONObject personal=object(db.settings,"motsPerso");Voice v=!silent&&!cfg.fileAudio&&!Hd.hdEngine(cfg.engine)?talk.choose(lang,automatic?"":cfg.voice):null;
        boolean localReady=talk.ready;File audio=db.audio(project),cache=getCacheDir();
        LinearLayout loading=sceneOverlay(t("scene.prep.titre"));TextView loadingText=ui.small(t("scene.prep.ressources"));ui.add(loading,loadingText,5);
        android.widget.ProgressBar bar=new android.widget.ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);bar.setMax(1000);ui.add(loading,bar,12);
        ui.add(loading,ui.button(t("commun.annuler"),null,this::stop),8);
        AudioPreparation.Request request=new AudioPreparation.Request(cfg,text,lang,silent,automatic,choices,personal,v,localReady,audio,cache);
        Hd.Progress progress=(n,total)->handler.post(()->{
            if(ticket!=generation)return;
            loadingText.setText(t("voix.hd.synthesePhrase","i",Math.min(n+1,total),"n",total));bar.setProgress((int)(1000*n/Math.max(1,total)));
        });
        preparation=queue.submit(()->new AudioPreparation(refs,hd,talk).run(request,this::t,progress,
            prepared->pcmDelivery.post(()->{if(generation!=ticket||scene==null){prepared.close();return;}try{
                reading=new Reading(text,prepared.segments,prepared.words,silent,prepared.pcm,talk,v,cfg,1,this::readingFinished,this::readingError);
                String voiceUsed=prepared.voiceUsed;synthesisVoice=voiceUsed;
                if(!silent&&!cfg.fileAudio&&!choices.isEmpty()&&!choices.get(0).equals(voiceUsed)){
                    JSONObject fallback=hd.voice(voiceUsed);note(t("android.voice.fallback","nom",fallback==null?voiceUsed:fallback.optString("nom")),"warn",5000);
                }
                reading.performance=prepared.performance;preparing=false;sig=signature;clearOverlay();reading.volume(volume(),muted);reading.speed(project.speed);
                if(silent)note(t("scene.apercuActif"),"info");if(isForeground)startPlaying();else playState();
            }catch(Exception e){if(reading==null)prepared.close();sceneError(e);}},prepared::close),
            e->handler.post(()->{if(ticket==generation)sceneError(e);})));
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
        ui.add(card,ui.button(t("scene.voix.choisir"),"voice",this::chooseVoice),6);
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
    void nextExpression(){List<String> ids=new ArrayList<>();ids.add("");refs.expressions.keys().forEachRemaining(id->{if(!id.equals("neutre"))ids.add(id);});
        forced=ids.get((ids.indexOf(forced)+1)%ids.size());note(t("scene.expression")+" : "+t("expr."+(forced.isEmpty()?"auto":forced)),"info",1800);}
    @Override public boolean dispatchKeyEvent(KeyEvent e){
        if(e.getAction()==KeyEvent.ACTION_DOWN&&e.getKeyCode()==KeyEvent.KEYCODE_ESCAPE&&modal!=null){onBackPressed();return true;}
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
    String hdId(){return project.engine.equals("auto")?hd.autoVoice(db.locale()):Hd.hdEngine(project.engine)?project.voice:"";}
    String voiceName(){
        if(project.fileAudio)return project.fileName.isEmpty()?t("scene.voix.fichierAbsent"):project.fileName+" · "+Refs.time(project.duration);
        String id=hdId();
        if(!id.isEmpty()||Hd.hdEngine(project.engine)){
            JSONObject v=hd.voice(id);return hd.installed(v)?"Lectura HD · "+v.optString("nom"):t("scene.voix.hdAbsente");
        }
        Voice v=talk.choose(db.locale(),project.engine.equals("auto")?"":project.voice);
        if(v!=null)return v.getName();return t("scene.voix.aucune");
    }
    void chooseVoice(){
        LinearLayout r=sheet(t("scene.voix.choisir"));ui.group(r,t("android.voice.sources"),true);
        choice(r,t("android.voice.auto"),"sparkle",!project.fileAudio&&project.engine.equals("auto"),()->{dismiss();selectVoice("auto","");});
        ui.add(r,ui.small(t("android.voice.autoHelp")),3);
        for(JSONObject v:installedHd()){
            String id=v.optString("id"),engine=Hd.engine(v);
            choice(r,"Lectura HD · "+v.optString("nom"),"sparkle",!project.fileAudio&&project.engine.equals(engine)&&project.voice.equals(id),()->{dismiss();selectVoice(engine,id);});
        }
        choice(r,t("voix.hd.gerer"),"download",false,()->go("reglages"));
        ui.group(r,t("scene.voix.systeme"),false);List<Voice> voices=talk.voices(db.locale());
        if(voices.isEmpty())ui.add(r,ui.small(t("voix.err.aucune")),0);
        for(Voice voice:voices)choice(r,voice.getName(),"voice",!project.fileAudio&&project.engine.equals("webspeech")&&project.voice.equals(voice.getName()),()->{dismiss();selectVoice("webspeech",voice.getName());});
        ui.group(r,t("scene.voix.fichierTitre"),false);choice(r,project.fileAudio?voiceName():t("scene.voix.fichier"),"upload",project.fileAudio,()->{dismiss();pickAudio();});
    }
    void selectVoice(String engine,String id){
        if(preparing||reading!=null&&reading.playing)stop();clearOverlay();
        project.fileAudio=false;project.engine=engine;project.voice=id;db.set("moteurVoix",engine);db.set("voixId",id);
        if(scene!=null){scene.voice();preloadVoice();}else if(screens!=null&&route.equals("reglages"))screens.refresh();
    }
    void pick(String mime,Consumer<Uri> onResult){Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime);request(intent,onResult);}
    void createFile(String mime,String name,Consumer<Uri> writer){request(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name),writer);}
    private void request(Intent intent,Consumer<Uri> callback){if(result!=null)return;result=callback;try{startActivityForResult(intent,73);}catch(Exception e){result=null;report("fichier",e);}}
    @Override protected void onActivityResult(int code,int outcome,Intent data){super.onActivityResult(code,outcome,data);if(code==73){Consumer<Uri> cb=result;result=null;if(outcome==RESULT_OK&&data!=null&&data.getData()!=null&&cb!=null)cb.accept(data.getData());}}
    String fileName(Uri uri){try(android.database.Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}return "audio";}
    String fileText(Uri uri,int max)throws IOException {try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Fichier illisible.");return new String(Refs.read(in,max),StandardCharsets.UTF_8).replaceFirst("^\ufeff","");}}
    void writeDoc(String mime,String file,String text){createFile(mime,file,uri->{try(java.io.OutputStream o=getContentResolver().openOutputStream(uri,"wt")){if(o==null)throw new IOException("Fichier indisponible.");o.write(text.getBytes(StandardCharsets.UTF_8));}catch(Exception e){report("fichier",e);}});}
    void pickAudio(){
        request(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/*","video/webm","application/ogg"}),uri->importAudio(uri,fileName(uri)));
    }
    void importAudio(Uri uri,String name){
        Project target=project;File dest=db.audio(target);queue.submit(()->{
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
    }
    void capturePng(){if(reading==null){note(t("scene.err.rienACapturer"),"info");return;}
        boolean portrait=viewportHeight()>content.getWidth()/ui.density;int w=portrait?1080:1280,h=portrait?1920:720;
        android.graphics.Bitmap b=android.graphics.Bitmap.createBitmap(w,h,android.graphics.Bitmap.Config.ARGB_8888);
        stage.updatePose(SystemClock.uptimeMillis()-stage.initial);stage.exportDraw(new android.graphics.Canvas(b),w,h,true,0);
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
        hdListening=queue.submit(()->{try(HdResult r=new HdResult(hd.synth(text,id,28,(now,total)->{}))){
            File wav=r.synthesis.pcm.file;handler.post(()->{if(ticket!=hdDemoGen||!isForeground)return;
                try{hdPlayer=new android.media.MediaPlayer();hdPlayer.setDataSource(wav.getPath());hdPlayer.setVolume(volume(),volume());
                    hdPlayer.setOnCompletionListener(player->{player.release();if(hdPlayer==player)hdPlayer=null;});hdPlayer.setOnPreparedListener(player->{player.start();player.setPlaybackParams(new android.media.PlaybackParams().allowDefaults().setSpeed(rate).setPitch(1));});hdPlayer.prepareAsync();
                }catch(Exception e){stopHdExample();report("voix-hd",e);}
            });
        }catch(Exception e){handler.post(()->{if(ticket==hdDemoGen)report("voix-hd",e);});}});
    }
    private static final class HdResult implements AutoCloseable {
        final Hd.Synthesis synthesis;HdResult(Hd.Synthesis s){synthesis=s;}
        @Override public void close(){synthesis.pcm.close();}
    }
    void downloadVoice(String id){
        if(!hdDownloading.isEmpty())return;
        int ticket=++downloadGen;hdDownloading=id;hdDownloaded=0;hdDownloadTotal=hd.size(hd.voice(id));
        cancelPrewarm();stopHdExample();refreshVoicePanel();
        hdDownload=queue.submit(()->{
            try{
                hd.download(id,(n,total)->handler.post(()->{if(ticket==downloadGen){hdDownloaded=n;hdDownloadTotal=total;if(downloadProgress!=null)downloadProgress.run();}}));
                handler.post(()->{if(ticket==downloadGen){hdDownloading="";note(t("voix.hd.prete"),"ok");refreshVoicePanel();if(scene!=null)scene.voice();}});
            }catch(Exception e){handler.post(()->{if(ticket==downloadGen){hdDownloading="";refreshVoicePanel();report("voix-hd",e);}});}
        });
    }
    void cancelVoiceDownload(){
        downloadGen++;if(hdDownload!=null)hdDownload.cancel(true);hdDownload=null;hdDownloading="";
    }
    void refreshVoicePanel(){if(screens!=null&&route.equals("reglages"))screens.refresh();}
    void clearHd(){stopHdExample();cancelVoiceDownload();queue.submit(()->{hd.removeAll();handler.post(()->{
        note(t("reglages.stockage.libere"),"ok");if(screens!=null&&route.equals("reglages"))screens.refresh();});});}
    private List<Script.Segment> subtitleTimings(){
        if(project.fileAudio||reading==null||reading.silent||!reading.text.equals(project.text)||!sig.equals(signature(false)))return project.recalc();
        return Script.spokenSubtitleTimings(reading.timeline.parts,reading.rate);
    }
    void menu(){
        LinearLayout r=sheet(t("scene.menu"));ui.menuGroup(r,t("menu.projet"),6);
        EditText title=ui.field(project.title,t("editeur.sansTitre"),false,200,s->project.title=s);title.setContentDescription(t("editeur.titreProjet"));
        ui.pad(title,13,0);title.setMinHeight(ui.d(44.5f));ui.add(r,title,0);ui.gap(r,10);
        choice(r,t("editeur.enregistrer"),"save",false,()->{dismiss();try{project.recalc();db.save(project);lastDraft=project.json().toString();note(t("editeur.enregistre"),"ok");}catch(IOException e){report("projet",e);}});
        choice(r,t("nav.projets"),"folder",false,()->go("projets"));
        choice(r,t("editeur.importerTexte"),"upload",false,()->{dismiss();pick("text/*",uri->{try{project.text=fileText(uri,2_000_000);if(project.title.isEmpty())project.title=fileName(uri).replaceFirst("\\.[^.]+$", "");
            project.recalc();scene.edit.setText(project.text);}catch(Exception e){report("import",e);}});});
        choice(r,t("editeur.exporter"),"download",false,()->{dismiss();project.recalc();writeDoc("application/json",project.base()+".lectura",project.json().toString());});
        choice(r,t("editeur.importerSrt"),"upload",false,()->{
            dismiss();pick("*/*",uri->{try{
                Script.importSubtitles(fileText(uri,500000),project);
                open(project); // Reprepare even if the new cues contain the same text with different times.
                note(t("editeur.sousTitresImportes","n",project.segments.length()),"ok");
            }catch(Exception e){report("sous-titres",e);}});
        });
        for(String format:new String[]{"srt","vtt"})choice(r,t(format.equals("srt")?"menu.exporterSrt":"menu.exporterVtt"),"download",false,()->{
            dismiss();if(project.text.trim().isEmpty()){note(t("scene.err.texteVide"),"warn");return;}
            writeDoc(format.equals("srt")?"application/x-subrip":"text/vtt",project.base()+"."+format,Script.subtitles(subtitleTimings(),format.equals("vtt")));
        });
        ui.menuGroup(r,t("menu.scene"),2);choice(r,t("scene.apercuSansSon"),"eye",false,()->{dismiss();launch(true);});
        choice(r,t("scene.capture"),"camera",false,()->{dismiss();capturePng();});
        choice(r,t(exports.active()?"scene.arreterEnregistrement":"scene.enregistrer"),exports.active()?"stop":"record",false,()->{dismiss();record();});
        choice(r,t("scene.pleinEcran"),"fullscreen",false,()->{dismiss();fullscreen();});
        ui.add(r,ui.p(t("scene.format")),8);
        List<String> formats=db.locale().equals("en")?List.of("Landscape 16:9 (YouTube)","Portrait 9:16 (TikTok)"):
            List.of("Paysage 16:9 (YouTube)","Vertical 9:16 (TikTok)");
        int format=db.settings.optString("formatVideo").equals("16:9")?0:1;
        ui.add(r,ui.button(formats.get(format),"chevron",()->choose(t("scene.format"),formats,format,i->{db.set("formatVideo",i==0?"16:9":"9:16");menu();})),6);
        ui.menuGroup(r,t("menu.avance"),2);
        choice(r,t("menu.mesVideos"),"video",false,()->{dismiss();movies();});
        String[] ids={"personnages","reglages","apropos"},icons={"smile","settings","info"};
        for(int i=0;i<ids.length;i++){String id=ids[i];choice(r,t("nav."+id),icons[i],false,()->go(id));}
        ui.add(r,ui.small("● "+t(online()?"net.enLigne":"net.horsLigne")),14);
    }
    void movies(){exports.library();}
}
