package io.github.initdv.lectura;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import static io.github.initdv.lectura.DeviceChecks.require;

/** Both UHD ratios use the real UI, including explicit refusal on codec-limited devices. */
final class VideoQualityChecks {
    private static final String HD="HD · 720 × 1280",PORTRAIT="4K UHD · 2160 × 3840",LANDSCAPE="4K UHD · 3840 × 2160";
    private static final String VERTICAL="Vertical 9:16 (TikTok)",HORIZONTAL="Paysage 16:9 (YouTube)";
    private static final String KEY=MediaExport.Quality.KEY;

    static String run(DeviceChecks d,Context ctx)throws Exception{
        MainActivity setup=d.open(ctx);
        try{
            d.main(()->require(setup.db.settings.optString(KEY).equals("720p"),"720p doit rester la qualité par défaut"));
            d.click(setup,"Menu");d.click(setup,HD);d.click(setup,PORTRAIT);
        }finally{d.main(setup::finish);}
        MainActivity a=d.open(ctx);File wav=d.tone(ctx,5),dir=wav.getParentFile();
        try{
            d.main(()->{
                require(a.db.settings.optString(KEY).equals("4k")&&a.db.settings.optString("formatVideo").equals("9:16"),"Choix 4K non conservé après réouverture");
                Project p=new Project(a.db.settings);p.character="aicha";p.emotions=true;a.open(p);a.stage.aicha.reduced=false;
                a.scene.edit.setText("Les mains accompagnent le récit, puis elles se reposent. Je t’explique la suite.");
                a.importAudio(Uri.fromFile(wav),"tonalité.wav");
            });
            d.waitFor("Audio UHD importé",()->a.project.fileAudio,10000);
            d.main(()->{a.muted=true;a.launch(false);});
            d.waitFor("Lecture UHD prête",()->a.reading!=null&&a.reading.pcm!=null&&a.reading.playing,12000);
            d.main(()->{a.reading.pause();a.reading.seek(1050);a.playState();});
            String portrait=check(d,a,dir,true);
            d.click(a,"Menu");d.click(a,VERTICAL);d.click(a,HORIZONTAL);
            // If portrait was refused we explicitly selected HD, so re-select UHD in landscape.
            if(a.db.settings.optString(KEY).equals("720p")){d.click(a,"HD · 1280 × 720");d.click(a,LANDSCAPE);}
            d.main(()->{
                require(DeviceChecks.named(a.modal,LANDSCAPE)!=null&&a.db.settings.optString(KEY).equals("4k"),"Résolution et ratio doivent être indépendants");
                a.dismiss();a.reading.seek(1050);
            });
            return "4K persistante, rendu UHD natif et test de codec dans les deux ratios : "+portrait+" ; "+check(d,a,dir,false);
        }finally{
            wav.delete();d.main(()->{
                a.db.set(KEY,"720p");a.db.set("formatVideo","9:16");a.db.audio(a.project).delete();a.finish();
            });
        }
    }

    private static String check(DeviceChecks d,MainActivity a,File dir,boolean portrait)throws Exception{
        int w=portrait?2160:3840,h=portrait?3840:2160;String size=MediaExport.dimensions(w,h);
        String tag=portrait?"portrait":"paysage",title="test-uhd-"+tag;
        render(d,a,dir,tag,w,h);
        int available=MediaExport.available(w,h,true,a.reading.pcm.channels,a.reading.pcm.rate).size();
        d.main(()->a.project.title=title);
        d.click(a,"Menu");d.click(a,a.t("scene.enregistrer"));
        d.waitFor("Enregistrement UHD ou refus en "+tag,()->a.exports.capturing()||a.modal!=null,25000);
        if(!a.exports.capturing()){
            d.main(()->{
                String warning=a.t("android.video.uhdUnsupported","detail",size);
                require(DeviceChecks.named(a.modal,warning)!=null,"Pas de refus explicite de l’encodeur UHD : "+size);
                require(!a.exports.busy()&&!a.stage.recording&&!a.reading.playing&&Math.abs(a.reading.time()-1050)<1,"Un refus ne doit pas rembobiner la scène");
                require(a.db.settings.optString(KEY).equals("4k"),"Pas de repli silencieux en HD");
            });
            if(portrait)d.screen(a,dir,"video-4k-indisponible",390,780,false);
            d.click(a,a.t("android.video.useHd"));
            d.main(()->require(a.db.settings.optString(KEY).equals("720p")&&a.db.settings.optString("formatVideo").equals(portrait?"9:16":"16:9"),"Retour explicite en HD sans changer le ratio"));
            return tag+" "+size+" : refus expliqué ("+available+" encodeur(s) annoncé(s))";
        }
        d.main(()->require(a.exports.recording.w==w&&a.exports.recording.h==h,"Pas de mise à l’échelle depuis la HD"));
        Thread.sleep(1450);d.click(a,"Menu");d.click(a,a.t("scene.arreterEnregistrement"));
        d.waitFor("Téléchargement UHD",()->!a.exports.busy()&&DeviceChecks.named(a.modal,a.t("dl.bouton.telecharger"))!=null,35000);
        d.click(a,a.t("dl.bouton.telecharger"));
        Movies movies=new Movies(a);Movies.Entry movie=null;
        try{
            for(int i=0;i<120&&movie==null;i++){
                for(Movies.Entry e:movies.list())if(e.title.equals(title)){movie=e;break;}
                if(movie==null)Thread.sleep(100);
            }
            require(movie!=null,"Vidéo UHD absente de Mes vidéos");
            String mime=null;
            MediaExtractor extractor=new MediaExtractor();
            try{
                extractor.setDataSource(movie.file.getPath());
                for(int i=0;i<extractor.getTrackCount();i++){
                    MediaFormat track=extractor.getTrackFormat(i);String type=track.getString(MediaFormat.KEY_MIME);
                    if(type!=null&&type.startsWith("video/"))mime=type;
                }
            }finally{extractor.release();}
            require(mime!=null,"Piste vidéo manquante");
            MediaExport.verify(movie.file,new MediaExport.Format(mime,movie.format.equals("webm")),w,h,true);
            try(Pcm decoded=Pcm.decode(movie.file,dir)){
                short[] audio=new short[4096];int n=decoded.read(decoded.rate/2,audio,audio.length),peak=0;
                for(int i=0;i<n;i++)peak=Math.max(peak,Math.abs((int)audio[i]));
                require(peak>5000,"Audio UHD muet");
            }
            Files.copy(movie.file.toPath(),new File(dir,"lectura-4k-"+tag+"."+movie.format).toPath(),StandardCopyOption.REPLACE_EXISTING);
            return tag+" "+size+" : "+mime+" vérifié avec son, téléchargé et présent dans Mes vidéos";
        }finally{
            if(movie!=null)movies.delete(movie);
            a.getContentResolver().delete(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                MediaStore.MediaColumns.DISPLAY_NAME+" IN (?,?)",new String[]{title+".mp4",title+".webm"});
        }
    }

    private static void render(DeviceChecks d,MainActivity a,File dir,String tag,int w,int h)throws Exception{
        Bitmap b=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);File file=new File(dir,"lectura-rendu-uhd-"+tag+".png");
        try{
            d.main(()->{a.stage.updatePose(1100);a.stage.exportDraw(new Canvas(b),w,h,false,1100);});
            // Pixel coordinates are UHD; compare the terminal with the scene at the other edge.
            require(b.getPixel(w-100,h/2)!=b.getPixel(20,h/2),"Rendu UHD vide");
            try(FileOutputStream out=new FileOutputStream(file)){require(b.compress(Bitmap.CompressFormat.PNG,100,out),"Capture du rendu UHD");}
        }finally{b.recycle();}
    }
}
