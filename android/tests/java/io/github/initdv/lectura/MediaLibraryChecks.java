package io.github.initdv.lectura;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.ResultReceiver;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.widget.EditText;
import android.widget.VideoView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static io.github.initdv.lectura.DeviceChecks.named;
import static io.github.initdv.lectura.DeviceChecks.require;

final class MediaLibraryChecks implements DeviceChecks.FeatureCheck {
    @Override public String run(DeviceChecks d,Context ctx)throws Exception{
        require(DeviceChecks.noNetwork(ctx),"La médiathèque doit s’ouvrir sans réseau");
        File proof=ctx.getExternalFilesDir("verification");
        // Real encoded exports from the MP4 and MP3 checks earlier in this instrumentation.
        File mp3=new File(proof,"lectura-test.mp3"),mp4=new File(proof,"lectura-test.mp4");
        byte[] audio=Files.readAllBytes(mp3.toPath()),video=Files.readAllBytes(mp4.toPath());
        require(audio.length>0&&video.length>0,"Exports pour la recette absents");
        String suffix=Long.toString(System.nanoTime()),audioName="qa-audio-"+suffix,videoName="qa-video-"+suffix;
        String renamed="Épisode finalisé "+suffix,filename="episode-finalise-"+suffix+".mp3";
        Movies lib=new Movies(ctx);Uri externalVideo=null;
        try{
            lib.save(mp3,audioName+".mp3");lib.save(mp4,videoName+".mp4");
            externalVideo=SharedMedia.publish(ctx,mp4,videoName+".mp4");
            Movies.Entry original=entry(lib,audioName);
            MainActivity first=d.open(ctx);
            try{
                openLibrary(d,first);
                d.main(()->require(named(first.modal,audioName)!=null&&named(first.modal,videoName)!=null,"La vue Tous doit mélanger les formats"));
                d.click(first,first.t("mv.audio"));
                d.main(()->require(named(first.modal,audioName)!=null&&named(first.modal,videoName)==null,"Le filtre Audio ne doit afficher que le MP3"));
                d.click(first,first.t("mv.renommer"));
                d.main(()->{
                    EditText field=(EditText)named(first.modal,first.t("mv.nom"));require(field!=null,"Champ du nom d’export introuvable");
                    field.setText(renamed);
                });
                d.click(first,first.t("editeur.enregistrer"));
                d.main(()->require(named(first.modal,renamed)!=null&&named(first.modal,videoName)==null,"Renommage visible, filtre conservé"));
            }finally{d.main(first::finish);}
            d.waitFor("Fermeture avant vérification de la persistance",first::isDestroyed,5000);
            Movies.Entry kept=entry(new Movies(ctx),renamed);
            require(kept.file.equals(original.file)&&kept.date.equals(original.date)&&kept.name().equals(filename)
                &&Arrays.equals(Files.readAllBytes(kept.file.toPath()),audio),"Le renommage a modifié l’export ou sa date");

            MainActivity a=d.open(ctx);
            try{
                openLibrary(d,a);d.click(a,a.t("mv.video"));
                d.main(()->require(named(a.modal,renamed)==null&&named(a.modal,videoName)!=null,"Filtre vidéo ou nom persistant"));
                play(d,a,videoName);
                d.click(a,a.t("mv.audio"));
                d.main(()->require(named(a.modal,renamed)!=null&&named(a.modal,audioName)==null,"Nom non conservé après réouverture"));
                capture(d,proof);
                play(d,a,renamed);
                d.click(a,a.t("mv.enregistrer"));
                d.waitFor("Enregistrement effectif dans MediaStore",()->named(a.toasts,a.t("mv.enregistre"))!=null,10000);
                Uri externalAudio=publicAudio(ctx,filename);require(externalAudio!=null,"Copie MP3 absente de MediaStore");
                require(Arrays.equals(read(ctx,externalAudio),audio),"Réenregistrement : le fichier a changé");
                Uri shared=share(d,a,filename,audio);

                d.click(a,a.t("mv.supprimer"));d.click(a,a.t("commun.annuler"));
                require(entry(lib,renamed).file.isFile(),"Annuler ne doit pas supprimer le fichier privé");
                d.click(a,a.t("mv.supprimer"));d.click(a,a.t("commun.oui"));
                require(!kept.file.exists()&&namedOnMain(d,a,a.t("mv.filtreVide")),"Suppression privée du MP3 ou état vide");
                require(Arrays.equals(read(ctx,externalAudio),audio)&&Arrays.equals(read(ctx,shared),audio),"Copie externe ou partagée supprimée");
                d.click(a,a.t("mv.video"));d.click(a,a.t("mv.supprimer"));d.click(a,a.t("commun.oui"));
                require(lib.list().stream().noneMatch(e->e.title.equals(videoName)||e.title.equals(renamed))
                    &&Arrays.equals(read(ctx,externalVideo),video)&&DeviceChecks.noNetwork(ctx),"Suppression isolée de la vidéo sans réseau");
            }finally{d.main(a::finish);}
            return "Mode avion : filtre MP3/MP4, lecture des deux, renommage persistant, copie et partage interapplications octet pour octet ; supprimer dans l’app conserve MediaStore et le partage";
        }finally{
            if(externalVideo!=null)ctx.getContentResolver().delete(externalVideo,null,null);
            Uri externalAudio=publicAudio(ctx,filename);if(externalAudio!=null)ctx.getContentResolver().delete(externalAudio,null,null);
            for(Movies.Entry e:lib.list())if(e.title.equals(audioName)||e.title.equals(videoName)||e.title.equals(renamed))lib.delete(e);
        }
    }
    private static boolean namedOnMain(DeviceChecks d,MainActivity a,String label)throws Exception{
        boolean[] found={false};d.main(()->found[0]=named(a.modal,label)!=null);return found[0];
    }
    private static Movies.Entry entry(Movies lib,String title)throws Exception{
        return lib.list().stream().filter(e->e.title.equals(title)).findFirst().orElseThrow(()->new AssertionError(title+" introuvable"));
    }
    private static void openLibrary(DeviceChecks d,MainActivity a)throws Exception{
        d.waitFor("Fenêtre de médiathèque au premier plan",()->a.isForeground&&a.hasWindowFocus(),12000);
        d.main(a::menu);d.click(a,a.t("menu.mesVideos"));
    }
    private static void play(DeviceChecks d,MainActivity a,String title)throws Exception{
        d.click(a,a.t("mv.lire"));
        d.waitFor("Lecture du média local : "+title,()->playing(a.modal,title),10000);
        d.click(a,a.t("mv.retour"));
    }
    private static boolean playing(android.view.View view,String title){
        if(view instanceof VideoView){VideoView player=(VideoView)view;return title.contentEquals(player.getContentDescription())&&player.isPlaying()&&player.getCurrentPosition()>50;}
        if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;
            for(int i=0;i<group.getChildCount();i++)if(playing(group.getChildAt(i),title))return true;}
        return false;
    }
    private static void capture(DeviceChecks d,File dir)throws Exception{
        Bitmap surface=d.getUiAutomation().takeScreenshot();require(surface!=null,"Capture de la médiathèque indisponible");
        try(FileOutputStream out=new FileOutputStream(new File(dir,"android-mediatheque.png"))){
            require(surface.compress(Bitmap.CompressFormat.PNG,100,out),"Capture de la médiathèque illisible");
        }finally{surface.recycle();}
    }
    private static Uri publicAudio(Context ctx,String name){
        Uri collection=MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        try(var c=ctx.getContentResolver().query(collection,new String[]{MediaStore.MediaColumns._ID},MediaStore.MediaColumns.DISPLAY_NAME+" = ?",new String[]{name},null)){
            return c!=null&&c.moveToFirst()?ContentUris.withAppendedId(collection,c.getLong(0)):null;
        }
    }
    private static Uri share(DeviceChecks d,MainActivity a,String filename,byte[] audio)throws Exception{
        AtomicReference<Intent> chosen=new AtomicReference<>();
        Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(){
            @Override public Instrumentation.ActivityResult onStartActivity(Intent i){
                if(!Intent.ACTION_CHOOSER.equals(i.getAction()))return null;
                chosen.set(i.getParcelableExtra(Intent.EXTRA_INTENT));
                return new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null);
            }
        };
        d.addMonitor(monitor);
        try{
            d.click(a,a.t("mv.partager"));d.waitFor("Intention de partage du MP3 renommé",()->chosen.get()!=null,10000);
        }finally{d.removeMonitor(monitor);}
        Intent send=chosen.get();Uri data=send.getParcelableExtra(Intent.EXTRA_STREAM);
        require(Intent.ACTION_SEND.equals(send.getAction())&&"audio/mpeg".equals(send.getType())&&data!=null
            &&(send.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0&&Arrays.equals(read(a,data),audio),"Le partage a modifié le MP3 ou ses droits");
        try(var cursor=a.getContentResolver().query(data,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
            require(cursor!=null&&cursor.moveToFirst()&&filename.equals(cursor.getString(0)),"Nom partagé incorrect");
        }
        CountDownLatch done=new CountDownLatch(1);AtomicReference<Bundle> received=new AtomicReference<>();
        d.main(()->{
            send.setComponent(new ComponentName(d.getContext().getPackageName(),ShareReceiver.class.getName()));
            send.putExtra("lectura.test.result",new ResultReceiver(a.handler){
                @Override protected void onReceiveResult(int code,Bundle result){result.putInt("status",code);received.set(result);done.countDown();}
            });
            a.startActivity(send);
        });
        require(done.await(8,TimeUnit.SECONDS)&&received.get().getInt("status")==Activity.RESULT_OK
            &&received.get().getInt("uid")!=android.os.Process.myUid(),"Partage renommé non lisible par une autre application");
        d.waitFor("Retour depuis le récepteur du MP3",()->a.isForeground&&a.hasWindowFocus(),8000);
        return data;
    }
    private static byte[] read(Context ctx,Uri uri)throws Exception{
        try(InputStream in=ctx.getContentResolver().openInputStream(uri)){require(in!=null,"Fichier externe absent : "+uri);return Refs.read(in,20_000_000);}
    }
}
