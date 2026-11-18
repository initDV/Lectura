package io.github.initdv.lectura;

import android.content.res.ColorStateList;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONObject;

/** Native model installation: no account, explicit consent, resumable archives and clear active state. */
final class HdPanel {
    final MainActivity a;final Ui u;final LinearLayout root;
    final JSONObject choice;
    HdPanel(MainActivity a,LinearLayout root){
        this.a=a;u=a.ui;this.root=root;
        JSONObject selected=a.hd.voice(a.hdDownloading.isEmpty()?a.hdChoice:a.hdDownloading);
        choice=selected==null?a.hd.voice("estelle"):selected;render();
    }
    private String t(String key,Object... args){return a.t(key,args);}
    private void pick(LinearLayout sheet,JSONObject v){
        String id=v.optString("id");
        a.choice(sheet,v.optString("nom")+(a.hd.installed(v)?" ✓":""),null,v==choice,()->{
            a.dismiss();a.stopHdExample();a.hdChoice=id;a.refreshVoicePanel();
        });
    }
    private void render(){
        if(choice==null||!Hd.supported()){u.add(root,u.small(t("android.voice.notSupported")),8);return;}
        JSONObject v=choice;String id=v.optString("id"),name=v.optString("nom");long size=a.hd.size(v),disk=a.hd.diskSize(v);
        boolean installed=a.hd.installed(v),pending=!a.hdDownloading.isEmpty();
        String label=t("voix.hd.choisir"),bytes=size>0?Refs.size(size):"—";
        u.add(root,u.small(label),8);
        TextView select=u.button(name+(installed?" ✓":""),"chevron",()->{
            LinearLayout sheet=a.sheet(label);u.group(sheet,t("android.voice.main"),true);pick(sheet,a.hd.voice("estelle"));
            u.group(sheet,"Kokoro",false);pick(sheet,a.hd.voice("kokoro-siwis"));
            u.group(sheet,t("android.voice.backup"),false);pick(sheet,a.hd.voice("siwis"));pick(sheet,a.hd.voice("tom"));
            u.group(sheet,"Piper",false);
            for(JSONObject x:a.hd.voices)if(Hd.engine(x).equals("piper")&&!x.optString("id").matches("siwis|tom"))pick(sheet,x);
        });u.add(root,select,6);u.enable(select,!pending,.5f);
        TextView status=u.small(installed?t("voix.hd.installee"):t("voix.hd.nonInstallee","taille",bytes));u.add(root,status,10);
        if(disk>size)u.add(root,u.small(t("android.voice.installedSize","taille",Refs.size(disk))),4);
        if(pending){
            ProgressBar bar=new ProgressBar(a,null,android.R.attr.progressBarStyleHorizontal);bar.setMax(1000);
            bar.setProgressTintList(ColorStateList.valueOf(u.accent));u.add(root,bar,8);
            a.downloadProgress=()->{
                long n=a.hdDownloaded,total=Math.max(1,a.hdDownloadTotal);bar.setProgress((int)(1000*n/total));
                status.setText(n>=total?t("android.voice.extract"):t("voix.hd.progressionTexte","fait",Refs.size(n),"total",Refs.size(total),"pct",Math.round(100.*n/total)));
            };a.downloadProgress.run();
            u.add(root,u.button(t("commun.annuler"),null,()->{a.cancelVoiceDownload();a.refreshVoicePanel();a.note(t("voix.hd.annule"),"info");}),6);
        }else if(installed){
            u.add(root,u.button(t("android.voice.use"),"voice",true,false,()->a.selectVoice(Hd.engine(v),id)),8);
            u.add(root,u.button(t("voix.hd.ecouter"),"play",()->a.hdExample(id,"Bonjour, tu veux découvrir cette voix ?",1)),6);
            String remove=t("voix.hd.supprimer.confirmer","taille",Refs.size(disk));
            if(v.optString("modele").equals("mls"))remove+=a.db.locale().equals("en")?
                " This also removes the other MLS voices, which use the same model.":" Cette action retire aussi les autres voix MLS, qui partagent le même modèle.";
            String confirm=remove;
            u.add(root,u.button(t("voix.hd.supprimer"),"trash",()->a.confirm(confirm,()->{
                a.stopHdExample();a.queue.submit(()->{a.hd.remove(id);a.handler.post(()->{a.note(t("voix.hd.supprimee"),"info");a.refreshVoicePanel();});});
            })),6);
        }else if(a.hd.available(v)){
            String prompt=t("voix.hd.confirmer","taille",bytes)+(disk>size?"\n"+t("android.voice.installedSize","taille",Refs.size(disk)):"");
            u.add(root,u.button(t("voix.hd.telecharger","taille",bytes),"download",true,false,()->a.confirm(prompt,()->a.downloadVoice(id))),8);
        }else u.add(root,u.small(t("android.voice.notSupported")),6);
        u.add(root,u.small(a.hd.attribution(v)),10);
    }
}
