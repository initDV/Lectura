package io.github.initdv.lectura;

import android.content.res.ColorStateList;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.concurrent.Future;

/** Voice card in Settings. One download at a time, with resumable model writes. */
final class HdPanel {
    final MainActivity a;final Ui u;final LinearLayout root;
    JSONObject choice;
    boolean pending;
    HdPanel(MainActivity a,LinearLayout root){this.a=a;u=a.ui;this.root=root;choice=a.hd.voice(a.hdChoice);
        if(choice==null&&!a.hd.voices.isEmpty())choice=a.hd.voices.get(0);render();}
    private String t(String key,Object... args){return a.t(key,args);}
    private void render(){
        root.removeAllViews();
        if(choice==null||!Hd.supported()){
            u.add(root,u.small(a.db.locale().equals("en")?"The Lectura HD runtime is not included in this APK.":"Le moteur Lectura HD n’est pas inclus dans cet APK."),8);return;
        }
        JSONObject v=choice;String id=v.optString("id"),name=v.optString("nom");long bytes=a.hd.size(v);boolean installed=a.hd.installed(v);
        u.add(root,u.small(t("voix.hd.choisir")),8);
        TextView select=u.button(name+(installed?" ✓":""),"chevron",()->{
            LinearLayout sheet=a.sheet(t("voix.hd.choisir"));
            for(String gender:new String[]{"F","M"}){
                u.group(sheet,t(gender.equals("F")?"voix.hd.feminin":"voix.hd.masculin"),gender.equals("F"));
                for(JSONObject x:a.hd.voices)if(x.optString("nom").contains(" · "+gender+" · "))a.choice(sheet,x.optString("nom")+(a.hd.installed(x)?" ✓":""),null,x==choice,()->{
                    a.dismiss();a.stopHdExample();choice=x;a.hdChoice=x.optString("id");render();});
            }
        });u.add(root,select,6);u.enable(select,!pending,.5f);
        String size=bytes>0?Refs.size(bytes):"—";
        TextView status=u.small(installed?t("voix.hd.installee"):t("voix.hd.nonInstallee","taille",size));u.add(root,status,10);
        LinearLayout actions=u.col();u.add(root,actions,10);
        if(installed){
            u.add(actions,u.button(t("voix.hd.ecouter"),"play",()->a.hdExample(id,"Bonjour, je suis "+name.split(" ·")[0]+".",1)),0);
            String remove=t("voix.hd.supprimer.confirmer","taille",Refs.size(bytes));
            if(v.optString("modele").equals("mls"))remove+=a.db.locale().equals("en")?
                " This also removes the other MLS voices, which use the same model.":" Cette action retire aussi les autres voix MLS, qui partagent le même modèle.";
            String confirmRemoval=remove;
            u.add(actions,u.button(t("voix.hd.supprimer"),"trash",()->a.confirm(confirmRemoval,()->{
                a.stopHdExample();a.queue.submit(()->{a.hd.remove(id);a.handler.post(()->{a.note(t("voix.hd.supprimee"),"info");if(a.screens!=null&&a.route.equals("reglages"))a.screens.refresh();});});
            })),6);
        }else{
            u.add(actions,u.button(t("voix.hd.telecharger","taille",size),"download",true,false,()->a.confirm(t("voix.hd.confirmer","taille",size),()->{
                if(a.hdDownload!=null&&!a.hdDownload.isDone())return;
                pending=true;select.setEnabled(false);actions.removeAllViews();status.setText(t("voix.hd.chargement"));
                ProgressBar bar=new ProgressBar(a,null,android.R.attr.progressBarStyleHorizontal);bar.setMax(1000);bar.setProgressTintList(ColorStateList.valueOf(u.accent));actions.addView(bar,u.lp(Ui.MATCH,10));
                u.add(actions,u.button(t("commun.annuler"),null,()->{Future<?> f=a.hdDownload;if(f!=null)f.cancel(true);pending=false;render();a.note(t("voix.hd.annule"),"info");}),6);
                a.hdDownload=a.queue.submit(()->{try{
                    a.hd.download(id,(n,total)->a.handler.post(()->{bar.setProgress((int)(1000*n/Math.max(1,total)));status.setText(t("voix.hd.progressionTexte","fait",Refs.size(n),"total",Refs.size(total),"pct",Math.round(100.*n/Math.max(1,total))));}));
                    a.handler.post(()->{pending=false;a.note(t("voix.hd.prete"),"ok");if(a.screens!=null&&a.route.equals("reglages"))a.screens.refresh();});
                }catch(Exception e){if(!Thread.currentThread().isInterrupted())a.handler.post(()->{pending=false;render();a.report("voix-hd",e);});}});
            })),0);
        }
        String label=v.optString("id").equals("siwis")?t("voix.hd.licence"):(a.db.locale().equals("en")?"Model source":"Source du modèle");
        u.add(root,u.small(label+" : "+a.hd.attribution(v)),10);
    }
}
