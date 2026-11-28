package io.github.initdv.lectura;

import android.content.res.ColorStateList;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.util.List;
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
        List<Hd.VoiceStorage> local=a.hd.voiceStorage();
        Hd.VoiceStorage selected=local.stream().filter(s->s.ids.contains(id)).findFirst().orElse(null);
        long partial=selected==null?0:selected.partialBytes;
        String label=t("voix.hd.choisir"),bytes=size>0?Refs.size(size):"—";
        u.add(root,u.small(label),8);
        TextView select=u.button(name+(installed?" ✓":""),"chevron",()->{
            LinearLayout sheet=a.sheet(label);u.group(sheet,t("android.voice.main"),true);pick(sheet,a.hd.voice("estelle"));
            u.group(sheet,"Kokoro",false);pick(sheet,a.hd.voice("kokoro-siwis"));
            u.group(sheet,t("android.voice.backup"),false);pick(sheet,a.hd.voice("siwis"));pick(sheet,a.hd.voice("tom"));
            u.group(sheet,"Piper",false);
            for(JSONObject x:a.hd.voices)if(Hd.engine(x).equals("piper")&&!x.optString("id").matches("siwis|tom"))pick(sheet,x);
        });u.add(root,select,6);u.enable(select,!pending,.5f);
        TextView status=u.small(installed?t("voix.hd.installee"):partial>0?t("voix.hd.partiel","taille",Refs.size(partial)):
            t("voix.hd.nonInstallee","taille",bytes));u.add(root,status,10);
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
            if(selected!=null&&selected.names.size()>1)remove+=" "+t("voix.hd.modelePartage","nom",String.join(" / ",selected.names));
            String confirm=remove;
            u.add(root,u.button(t("voix.hd.supprimer"),"trash",()->a.confirm(confirm,()->{
                a.stopHdExample();a.queue.submit(()->{a.hd.remove(id);a.handler.post(()->{a.note(t("voix.hd.supprimee"),"info");a.refreshVoicePanel();});});
            })),6);
        }else if(a.hd.available(v)){
            String prompt=t("voix.hd.confirmer","taille",bytes)+(disk>size?"\n"+t("android.voice.installedSize","taille",Refs.size(disk)):"");
            u.add(root,u.button(partial>0?t("voix.hd.reprendrePartiel"):t("voix.hd.telecharger","taille",bytes),"download",true,false,()->a.confirm(prompt,()->a.downloadVoice(id))),8);
        }else u.add(root,u.small(t("android.voice.notSupported")),6);
        if(!pending&&partial>0){
            if(installed)u.add(root,u.small(t("voix.hd.partiel","taille",Refs.size(partial))),8);
            String confirm=t("voix.hd.effacerPartielConfirmer","nom",String.join(" / ",selected.names));
            u.add(root,u.button(t("voix.hd.effacerPartiel"),"trash",()->a.confirm(confirm,()->a.queue.submit(()->{
                try{
                    a.hd.discardPartial(id);
                    a.handler.post(()->{a.note(t("voix.hd.partielEfface"),"info");a.refreshVoicePanel();});
                }catch(Exception e){a.handler.post(()->{a.report("voix-hd",e);a.refreshVoicePanel();});}
            }))),6);
        }
        u.add(root,u.small(a.hd.attribution(v)),10);
        storage(local);
    }
    private void storage(List<Hd.VoiceStorage> local){
        long total=0;for(Hd.VoiceStorage s:local)total+=s.installedBytes+s.partialBytes;
        u.group(root,t("voix.hd.stockage"),false);
        u.add(root,u.small(t("voix.hd.stockageTotal","taille",total==0?"0 Ko":Refs.size(total))),4);
        for(Hd.VoiceStorage s:local){
            u.add(root,u.p(String.join(" / ",s.names)),8);
            if(s.installedBytes>0)u.add(root,u.small(t("voix.hd.stockageInstallee","taille",Refs.size(s.installedBytes))),2);
            if(s.partialBytes>0)u.add(root,u.small(t("voix.hd.partiel","taille",Refs.size(s.partialBytes))),2);
        }
    }
}
