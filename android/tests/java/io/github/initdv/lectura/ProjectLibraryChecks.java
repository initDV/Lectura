package io.github.initdv.lectura;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import static io.github.initdv.lectura.DeviceChecks.named;
import static io.github.initdv.lectura.DeviceChecks.require;

/** Exercices de la bibliothèque dans le véritable APK, en mode avion. */
final class ProjectLibraryChecks implements DeviceChecks.FeatureCheck {
    private static final String SOURCE="Épreuve bibliothèque QA";
    private static final String MISSING="Audio introuvable bibliothèque QA";

    @Override public String run(DeviceChecks d,Context ctx)throws Exception{
        require(DeviceChecks.noNetwork(ctx),"La bibliothèque doit être testée hors ligne");
        MainActivity first=d.open(ctx);Library db=first.db;Project initial=first.project;
        String copyTitle=first.t("accueil.titreCopie","titre",SOURCE);
        List<Project> seeds=new ArrayList<>();
        Project old=new Project(db.settings);old.title=SOURCE;
        Script.importSubtitles("WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nBonjour Lectura !\n",old);
        Refs.put(old.segments.getJSONObject(0),"expression","surpris");
        old.fileAudio=true;old.fileName="reference.wav";old.duration=6000;old.speed=1;
        byte[] wav;
        try(InputStream in=d.getContext().getAssets().open("lips-reference.wav")){wav=Refs.read(in,2_000_000);}
        Project draft=new Project(db.settings);draft.text="Brouillon bibliothèque QA à conserver";
        try{
            seeds.add(old);Files.write(db.audio(old).toPath(),wav);db.save(old);
            for(int i=0;i<34;i++){
                Project p=new Project(db.settings);p.title=String.format(Locale.ROOT,"Bibliothèque QA %02d",i);
                seeds.add(p);db.save(p);
            }
            Project missing=new Project(db.settings);missing.title=MISSING;missing.fileAudio=true;missing.fileName="absent.wav";
            seeds.add(missing);db.save(missing);
            d.main(()->{first.open(draft);first.go("projets");require(named(first.content,SOURCE)==null,"Le premier écran doit rester paginé");});
            d.click(first,first.t("accueil.plusProjets"));
            d.main(()->require(named(first.content,SOURCE)!=null,"La page suivante ne montre pas le projet ancien"));
            setQuery(d,first,"introuvable seulement");
            d.main(()->require(named(first.content,first.t("accueil.aucunResultat"))!=null,"État sans résultat absent"));
            setQuery(d,first,"");
            sort(d,first,"accueil.tri.anciens");
            d.main(()->require(named(first.content,SOURCE)!=null,"Le tri ancien ne remet pas le projet en tête"));
            sort(d,first,"accueil.tri.titre");
            d.main(()->{
                View zero=named(first.content,"Bibliothèque QA 00"),one=named(first.content,"Bibliothèque QA 01");
                require(zero!=null&&one!=null,"Le tri alphabétique n’a pas rendu les deux titres");
                View a=(View)zero.getParent(),b=(View)one.getParent();
                require(a.getParent()==b.getParent()&&((ViewGroup)a.getParent()).indexOfChild(a)<((ViewGroup)b.getParent()).indexOfChild(b),"Ordre des titres");
            });
            setQuery(d,first,"EPREUVE BIBLIOTHEQUE");
            d.main(()->require(named(first.content,SOURCE)!=null&&named(first.content,MISSING)==null,"Recherche sans accents ou filtre incorrect"));
            d.click(first,first.t("accueil.dupliquer","titre",SOURCE));
            d.waitFor("La copie doit apparaître dans la bibliothèque",()->named(first.content,copyTitle)!=null,8000);
            Project copy=db.projects().stream().filter(p->p.title.equals(copyTitle)).findFirst().orElseThrow(AssertionError::new);
            require(!copy.id.equals(old.id)&&copy.fileName.equals(old.fileName)&&copy.subtitles&&copy.segments.toString().equals(old.segments.toString()),"Copie des repères et de l’audio");
            require(Arrays.equals(Files.readAllBytes(db.audio(copy).toPath()),wav),"Fichier audio différent");
            require(db.draft().id.equals(draft.id),"La duplication a effacé le brouillon");
            int count=db.projects().size();
            setQuery(d,first,"introuvable");
            d.click(first,first.t("accueil.dupliquer","titre",MISSING));
            d.waitFor("Avertissement audio manquant",()->named(first.toasts,first.t("accueil.duplicationAudioManquant"))!=null,8000);
            require(db.projects().size()==count,"Une copie incomplète a été enregistrée");

            d.main(first::finish);
            d.waitFor("Fermeture de l’activité avant réouverture",first::isDestroyed,5000);
            MainActivity reopened=d.open(ctx);
            try{
                d.main(()->{require(reopened.project.id.equals(draft.id),"Brouillon perdu à la réouverture");reopened.go("projets");});
                setQuery(d,reopened,"epreuve");
                d.click(reopened,copyTitle);
                d.main(()->{
                    require(reopened.project.id.equals(copy.id)&&reopened.project.subtitles,"La copie enregistrée ne s’ouvre pas");
                    reopened.muted=true;reopened.launch(false);
                });
                d.waitFor("Lecture hors ligne de la copie",()->reopened.reading!=null&&reopened.reading.playing&&reopened.reading.time()>300,10000);
                d.main(()->{
                    require(reopened.reading.timeline.parts.get(0).from==500,"Horodatage de la copie perdu en lecture");
                    reopened.stop();reopened.scene.edit.setText("Copie modifiée.");reopened.menu();
                });
                d.click(reopened,reopened.t("editeur.enregistrer"));
                d.main(()->reopened.go("projets"));setQuery(d,reopened,"epreuve");
                d.click(reopened,reopened.t("accueil.supprimer","titre",copyTitle));
                d.click(reopened,reopened.t("commun.oui"));
                d.click(reopened,SOURCE);
                d.main(()->require(reopened.project.id.equals(old.id)&&reopened.project.text.equals(old.text)
                    &&reopened.project.segments.toString().equals(old.segments.toString()),"Le projet source a changé"));
                require(!db.audio(copy).exists()&&Arrays.equals(Files.readAllBytes(db.audio(old).toPath()),wav),"Supprimer la copie a perdu l’audio source");
                require(DeviceChecks.noNetwork(ctx),"Le réseau ne doit pas être rétabli pendant ces contrôles");
            }finally{d.main(()->{reopened.open(initial);reopened.draft();reopened.finish();});}
            return "Mode avion : recherche au-delà de 30 projets, trois tris, copie avec repères/WAV et lecture après réouverture, source et brouillon intacts, audio manquant refusé";
        }finally{
            if(!first.isDestroyed())d.main(()->{first.open(initial);first.draft();first.finish();});
            for(Project p:db.projects())if(p.title.equals(copyTitle))db.delete(p);
            for(Project p:seeds)db.delete(p);
        }
    }

    private static void sort(DeviceChecks d,MainActivity a,String option)throws Exception{
        d.click(a,a.t("accueil.trier"));d.click(a,a.t(option));
    }
    private static void setQuery(DeviceChecks d,MainActivity a,String text)throws Exception{
        d.main(()->{
            EditText field=search(a.content,a.t("accueil.rechercher"));
            require(field!=null,"Champ de recherche absent");field.setText(text);
        });
    }
    private static EditText search(View v,String label){
        if(v instanceof EditText&&label.equals(v.getContentDescription()))return (EditText)v;
        if(v instanceof ViewGroup){
            ViewGroup group=(ViewGroup)v;
            for(int i=0;i<group.getChildCount();i++){EditText found=search(group.getChildAt(i),label);if(found!=null)return found;}
        }
        return null;
    }
}
