package io.github.initdv.lectura;

import android.content.Context;
import android.net.ConnectivityManager;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.view.View;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static io.github.initdv.lectura.DeviceChecks.named;
import static io.github.initdv.lectura.DeviceChecks.require;

final class VoiceStorageChecks implements DeviceChecks.FeatureCheck {
    @Override public String run(DeviceChecks d,Context ctx)throws Exception{
        require(DeviceChecks.noNetwork(ctx),"Le stockage des voix doit s’ouvrir en mode avion");
        MainActivity a=d.open(ctx);
        Project initial=a.project;
        String engine=a.db.settings.optString("moteurVoix"),voice=a.db.settings.optString("voixId");
        File models=new File(ctx.getFilesDir(),"models");
        File mls=new File(models,"mls.onnx"),mlsCfg=new File(models,"mls.onnx.json");
        File tom=new File(models,"tom.onnx.part"),tomCfg=new File(models,"tom.onnx.json");
        File estelle=new VoicePacks(models).partial(VoicePacks.ESTELLE);
        File gilles=new File(models,"gilles.onnx"),gillesPart=new File(models,"gilles.onnx.part"),gillesCfg=new File(models,"gilles.onnx.json");
        List<File> seeds=List.of(mls,mlsCfg,tom,tomCfg,estelle,gilles,gillesPart,gillesCfg);
        File index=new File(models,"index.json");boolean hadIndex=index.exists(),reconnected=false,owns=false;
        try{
            for(File f:seeds)require(!f.exists(),"La recette ne doit pas remplacer un modèle existant : "+f.getName());
            owns=true;
            try(RandomAccessFile f=new RandomAccessFile(mls,"rw")){f.setLength(2L*1024*1024);}
            Files.write(mlsCfg.toPath(),new byte[]{'{','}'});
            byte[] keep=new byte[45*1024];Arrays.fill(keep,(byte)42);Files.write(estelle.toPath(),keep);
            Files.write(tom.toPath(),new byte[33*1024]);Files.write(tomCfg.toPath(),new byte[]{'{','}'});
            List<Hd.VoiceStorage> local=a.hd.voiceStorage();
            Hd.VoiceStorage shared=local.stream().filter(s->s.ids.contains("mls_f1")).findFirst().orElseThrow(AssertionError::new);
            require(local.size()==3&&shared.ids.size()==6&&shared.installedBytes==mls.length()+mlsCfg.length(),"Le stockage MLS doit compter un seul modèle pour six voix");
            long expected=mls.length()+mlsCfg.length()+tom.length()+tomCfg.length()+estelle.length();
            require(local.stream().mapToLong(s->s.installedBytes+s.partialBytes).sum()==expected,"Total dédupliqué des modèles et partiels");
            d.main(()->{a.hdChoice="tom";a.go("reglages");
                require(a.hdDownloading.isEmpty()&&named(a.content,a.t("voix.hd.stockageTotal","taille",Refs.size(expected)))!=null
                    &&named(a.content,String.join(" / ",shared.names))!=null,"Inventaire local ou reprise automatique inattendue");});
            d.click(a,a.t("voix.hd.effacerPartiel"));d.click(a,a.t("commun.annuler"));
            require(tom.exists()&&tomCfg.exists(),"L’annulation efface un fichier");
            d.click(a,a.t("voix.hd.effacerPartiel"));d.click(a,a.t("commun.oui"));
            d.waitFor("Le seul téléchargement choisi est effacé",()->!tom.exists()&&!tomCfg.exists()
                &&named(a.content,a.t("voix.hd.effacerPartiel"))==null,8000);
            require(DeviceChecks.noNetwork(ctx)&&Arrays.equals(Files.readAllBytes(estelle.toPath()),keep)
                &&a.hd.installed(a.hd.voice("mls_m1")),"Un autre partiel ou un modèle prêt a été perdu");

            // Reconnect only for the explicit transfer. Put all radios back off before reading.
            reconnected=true;radios(d,true);
            d.waitFor("Réseau disponible pour préparer un téléchargement partiel",()->online(ctx),30000);
            startPartial(a.hd);
            long saved=gillesPart.length();require(saved>0&&!gilles.exists(),"Interruption réelle du modèle Gilles");
            d.main(()->{a.hdChoice="gilles";a.refreshVoicePanel();});
            Thread.sleep(500);
            d.main(()->require(a.hdDownloading.isEmpty()&&gillesPart.length()==saved&&!gilles.exists(),"Retour en ligne : la reprise ne doit pas se lancer seule"));
            d.click(a,a.t("voix.hd.reprendrePartiel"));
            d.main(()->require(a.hdDownloading.isEmpty(),"La reprise doit attendre une confirmation"));
            d.click(a,a.t("commun.oui"));
            d.waitFor("Gilles installé après reprise confirmée",()->a.hdDownloading.isEmpty()&&a.hd.installed(a.hd.voice("gilles")),90000);
            require(gilles.length()>saved&&!gillesPart.exists()&&Arrays.equals(Files.readAllBytes(estelle.toPath()),keep)
                &&a.hd.installed(a.hd.voice("mls_f1")),"La reprise a perdu un autre modèle ou partiel");
            radios(d,false);d.waitFor("Mode avion rétabli après téléchargement",()->DeviceChecks.noNetwork(ctx),30000);reconnected=false;

            String text="Le soleil se lève sur le jardin. Voici notre lecture hors ligne.";
            d.main(()->{
                Project p=new Project(a.db.settings);p.text=text;p.engine="piper";p.voice="gilles";
                a.open(p);a.muted=true;a.launch(false);
            });
            d.waitFor("Lecture complète d’un texte neuf avec le modèle repris, hors ligne",()->a.reading!=null&&a.reading.ended,65000);
            AtomicReference<Reading> played=new AtomicReference<>();
            d.main(()->{
                require(a.reading.text.equals(text)&&a.reading.pcm!=null&&a.synthesisVoice.equals("gilles")
                    &&DeviceChecks.noNetwork(ctx),"Lecture hors ligne sans le modèle Gilles repris");
                played.set(a.reading);
            });
            Reading reading=played.get();List<Script.Segment> spans=reading.timeline.parts;
            require(spans.size()==2,"Deux phrases attendues après la reprise du modèle");
            // Le début peut être faible selon le tirage Piper : mesurer toute la parole de chaque phrase.
            for(Script.Segment span:spans){
                int peak=DeviceChecks.pcmPeak(reading.pcm,span.from,span.speechEnd);
                require(span.type==Script.SPOKEN&&peak>1000,"Phrase muette après reprise : "+span.text+" ; pic "+peak);
            }
            return "Inventaire en avion : six locuteurs MLS, un modèle et un comptage ; annulation puis effacement du seul partiel ; retour en ligne sans reprise automatique ; Gilles repris sur confirmation ("+saved+" octets conservés), deux phrases vérifiées en PCM jusqu’au bout en avion";
        }finally{
            try{if(reconnected){radios(d,false);d.waitFor("Restaurer le mode avion",()->DeviceChecks.noNetwork(ctx),30000);}}
            finally{
                d.main(()->{a.cancelVoiceDownload();a.open(initial);a.db.set("moteurVoix",engine);a.db.set("voixId",voice);a.draft();});
                a.queue.submit(()->{}).get(25,TimeUnit.SECONDS);
                d.main(a::finish);
                if(owns){
                    for(File f:seeds)Files.deleteIfExists(f.toPath());
                    if(!hadIndex)Files.deleteIfExists(index.toPath());
                }
            }
        }
    }

    private static boolean online(Context ctx){
        return Settings.Global.getInt(ctx.getContentResolver(),Settings.Global.AIRPLANE_MODE_ON,1)==0
            &&ctx.getSystemService(ConnectivityManager.class).getActiveNetwork()!=null;
    }
    private static void radios(DeviceChecks d,boolean yes)throws IOException{
        for(String cmd:new String[]{"cmd connectivity airplane-mode "+(yes?"disable":"enable"),"svc wifi "+(yes?"enable":"disable"),"svc data "+(yes?"enable":"disable")}){
            try(ParcelFileDescriptor.AutoCloseInputStream in=new ParcelFileDescriptor.AutoCloseInputStream(d.getUiAutomation().executeShellCommand(cmd))){
                String output=new String(Refs.read(in,4096),java.nio.charset.StandardCharsets.UTF_8);
                require(!output.contains("Exception"),cmd+" : "+output);
            }
        }
    }
    private static void startPartial(Hd hd)throws Exception{
        for(int retry=0;;retry++){
            try{hd.download("gilles",(n,total)->{if(n>0&&n<total)throw new CancellationException();});}
            catch(CancellationException expected){return;}
            catch(java.net.SocketTimeoutException|java.net.UnknownHostException e){if(retry==2)throw e;Thread.sleep(1500L*(retry+1));continue;}
            throw new AssertionError("Le téléchargement devait être interrompu");
        }
    }
}
