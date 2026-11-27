package io.github.initdv.lectura;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.ViewTreeObserver;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import static io.github.initdv.lectura.DeviceChecks.require;

/** Check redraws and transport independently of speech synthesis and codecs. */
final class ScenePacingChecks {
    private static final long WINDOW_MS=1200;

    static String run(DeviceChecks d,Context ctx)throws Exception{
        opacity();
        long opened=SystemClock.uptimeMillis();MainActivity a=d.open(ctx);Project previous=a.project;
        try{
            d.waitFor("Première scène visible",()->a.isForeground&&a.stage!=null&&a.stage.getWidth()>0,6000);
            long opening=SystemClock.uptimeMillis()-opened;
            String text=("Bonjour, voici le réseau local et le serveur. Je t’explique la suite.\n"
                +"$ ping lecteur\n# Vérification du terminal et des mots-clés\n").repeat(80);
            d.main(()->{
                Project p=new Project(a.db.settings);p.character="aicha";p.text=text;p.cps=40;p.speed=1;a.open(p);
                a.stage.aicha.reduced=true;a.stage.refresh();
            });
            d.waitFor("Scène d’Aïcha mise en page",()->a.stage.getWidth()>0,6000);
            int quiet=countDraws(d,a,WINDOW_MS);
            require(quiet<=6,"La scène immobile ne doit pas redessiner en boucle : "+quiet+" dessins");
            d.main(()->{a.stage.aicha.reduced=false;a.stage.refresh();});
            int idle=countDraws(d,a,WINDOW_MS);
            require(idle>3,"Animation au repos non réveillée : "+idle+" dessins");

            long launched=SystemClock.uptimeMillis();
            d.main(()->{a.stage.aicha.reduced=true;a.launch(true);});
            d.waitFor("Aperçu sans voix prêt",()->a.reading!=null&&a.reading.playing,12000);
            long preparation=SystemClock.uptimeMillis()-launched;
            d.main(()->a.seek((int)(a.reading.duration*.65)));
            d.waitFor("Lecture au-delà des 40 lignes",()->a.reading.terminal.lineAt(a.reading.terminal.shown)>40,6000);
            int[] at={0};d.main(()->at[0]=a.reading.terminal.shown);
            int playing=countDraws(d,a,WINDOW_MS);
            d.main(()->{
                require(a.reading.terminal.shown>at[0]&&playing>3,"Texte long figé pendant la lecture");
                a.launch(false);require(!a.reading.playing,"Pause non appliquée");
                at[0]=a.reading.terminal.shown;a.seek(-2500);
            });
            d.waitFor("Le texte recule même pendant la pause",()->a.reading.terminal.shown<at[0],4000);
            d.main(()->{at[0]=a.reading.terminal.shown;a.startPlaying();});
            d.waitFor("Redessin après reprise",()->a.reading.terminal.shown>at[0],4000);
            d.main(()->a.seek((int)(a.reading.duration-a.reading.time()-240)));
            d.waitFor("Dernière image en mouvement réduit",()->a.reading.ended&&a.reading.terminal.shown==text.length(),5000);
            return String.format(Locale.ROOT,"ouverture %d ms, préparation de %,d caractères sans voix %d ms ; dessins fenêtre en %.1f s : repos réduit %d, animé %d, lecture %d ; pause, retour, reprise et fin",
                opening,text.length(),preparation,WINDOW_MS/1000.,quiet,idle,playing);
        }finally{d.main(()->{a.stop();a.project=previous;a.finish();});}
    }

    private static void opacity(){
        String xml="<svg viewBox='0 0 48 16'><rect width='8' height='10' fill='#ff0000' opacity='.5' fill-opacity='.5'/>"
            +"<g fill='#ff0000' opacity='.5'><rect x='12' width='10' height='10'/><rect x='16' width='8' height='10'/></g>"
            +"<rect x='28' y='3' width='8' height='8' fill='#ff0000' stroke='#ff0000' stroke-width='4' opacity='.5'/>"
            +"<rect id='reveal' x='39' width='4' height='10' fill='#00ff00' display='none'/>"
            +"<rect x='44' width='4' height='10' fill='#0000ff' style='display: none'/></svg>";
        Svg svg=new Svg(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        Bitmap image=Bitmap.createBitmap(48,16,Bitmap.Config.ARGB_8888);
        try{
            Canvas canvas=new Canvas(image);canvas.drawColor(Color.WHITE);svg.draw(canvas,0,0,1);
            require(Math.abs(Color.green(image.getPixel(2,5))-191)<=2,"Opacité d’une peinture SVG");
            require(Math.abs(Color.green(image.getPixel(18,5))-127)<=2,"Opacité isolée du groupe SVG");
            require(Math.abs(Color.green(image.getPixel(29,6))-127)<=2,"Opacité sur remplissage et contour SVG");
            require(image.getPixel(41,5)==Color.WHITE&&image.getPixel(46,5)==Color.WHITE,"Masques display SVG");
            svg.get("reveal").a.remove("display");canvas.drawColor(Color.WHITE);svg.draw(canvas,0,0,1);
            require(image.getPixel(41,5)==Color.GREEN,"Attribut display SVG dynamique");
        }finally{image.recycle();}
    }

    static int countDraws(DeviceChecks d,MainActivity a,long ms)throws Exception{
        int[] count={0};ViewTreeObserver.OnDrawListener listener=()->count[0]++;
        d.main(()->a.root.getViewTreeObserver().addOnDrawListener(listener));
        try{Thread.sleep(ms);}finally{d.main(()->a.root.getViewTreeObserver().removeOnDrawListener(listener));}
        return count[0];
    }
}
