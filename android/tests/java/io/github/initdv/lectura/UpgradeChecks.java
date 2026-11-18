package io.github.initdv.lectura;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import java.io.InputStream;
import java.nio.file.Files;

/** This fixture uses API shared by v21 and the new APK; it never runs in the distributed app. */
public final class UpgradeChecks extends Instrumentation {
    private boolean seed;
    private static final String TITLE="Épreuve de mise à jour";
    private static final String TEXT="Bonjour après la mise à jour.";
    @Override public void onCreate(Bundle args){seed="seed".equals(args.getString("mode"));start();}
    @Override public void onStart(){
        Context ctx=getTargetContext();Bundle out=new Bundle();int code=Activity.RESULT_OK;
        try{
            if(seed){
                Library db=new Library(new Refs(ctx));
                db.set("tutorielVu",true);db.set("volume",.65);db.set("langue","en");
                db.set("licence","ancienne-cle-de-test");db.set("idInstallation","installation-de-test");
                Project p=new Project(db.settings);p.title=TITLE;p.character="hacker";p.terminalTheme="matrix";p.cps=90;
                Script.importSubtitles("WEBVTT\n\n00:00:01.500 --> 00:00:03.000\n"+TEXT+"\n",p);
                Refs.put(p.segments.optJSONObject(0),"expression","colere");
                p.fileAudio=true;p.fileName="audio.wav";p.duration=6000;
                try(InputStream in=getContext().getAssets().open("lips-reference.wav")){Files.copy(in,db.audio(p).toPath());}
                db.save(p);
                Project draft=new Project(db.settings);draft.text="Brouillon conservé";db.draft(draft);
                check(ctx.getSharedPreferences("lectura",Context.MODE_PRIVATE).edit().putString("settings",db.settings.toString()).commit(),"Écriture des réglages du prédécesseur");
            }else{
                MainActivity a=(MainActivity)startActivitySync(new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                runOnMainSync(()->{
                    check(a.project.text.equals("Brouillon conservé")&&a.modal==null,"Brouillon ou tutoriel perdu");
                    check(a.db.locale().equals("en")&&Math.abs(a.volume()-.65)<.001,"Préférences perdues");
                    check(!a.db.settings.has("licence")&&!a.db.settings.has("idInstallation"),"Champs obsolètes conservés");
                    try{
                        Project p=a.db.projects().get(0);a.open(p);
                        Script.Segment cue=p.recalc().get(0);
                        check(p.title.equals(TITLE)&&p.text.equals(TEXT)&&p.subtitles&&cue.from==1500&&cue.to==3000
                            &&cue.expression.equals("colere"),"Projet, pose ou sous-titres perdus");
                        check(a.stage.sprite.svg.root.attr("aria-label").equals("Hacker")&&a.stage.term.optString("nom").equals("Matrix")
                            &&p.cps==90,"Personnage ou terminal changé");
                        check(p.fileAudio&&p.fileName.equals("audio.wav")&&a.db.audio(p).length()==576044,"Audio privé perdu");
                    }catch(Exception e){throw new AssertionError(e);}
                    a.finish();
                });
            }
            out.putString("stream","\nLECTURA_OK mise-a-jour : "+(seed?"données écrites sous l’ancienne version":"brouillon, projet, audio, pose, terminal et réglages conservés ; anciens champs retirés")+"\nLECTURA_COMPLETE\n");
        }catch(Throwable e){code=Activity.RESULT_CANCELED;out.putString("stream","\nLECTURA_ERROR mise-a-jour : "+android.util.Log.getStackTraceString(e)+"\n");}
        finish(code,out);
    }
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
