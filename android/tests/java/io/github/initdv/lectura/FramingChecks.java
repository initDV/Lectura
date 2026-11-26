package io.github.initdv.lectura;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.SeekBar;
import java.io.File;
import org.json.JSONObject;
import static io.github.initdv.lectura.DeviceChecks.require;
import static io.github.initdv.lectura.SceneLayout.Control;

final class FramingChecks {
    private static final String LABEL="android.cadrage.";

    static void defaults(MainActivity a){
        SceneLayout frame=a.stage.screenLayout();
        require(frame.closePortrait&&near(frame.termWidth,frame.width*.48f)&&near(frame.termHeight,frame.height*.78f),"Cadre portrait : terminal à droite");
        require(frame.terminalBodyAt(frame.termX+8,80)&&!frame.terminalBodyAt(frame.termX-8,80)
            &&!frame.terminalBodyAt(frame.termX+8,frame.termHeight+1),"Défilement limité à la fenêtre du terminal");
        View eye=DeviceChecks.named(a.stage,a.t("scene.oeil.masquer")),button=DeviceChecks.named(a.stage,a.t(LABEL+"titre"));
        require(eye!=null&&eye.getX()>=a.ui.f(frame.termX)&&eye.getBottom()<a.ui.f(SceneLayout.TERMINAL_HEADER),"Œil dans la barre du terminal");
        require(button!=null&&button.getRight()<=a.ui.f(frame.termX),"Bouton de cadrage hors du terminal");
        require(SceneLayout.closePortrait(480,720,true)&&SceneLayout.closePortrait(600,1000,true)&&SceneLayout.closePortrait(720,1200,true),"Portrait étroit ou allongé");
        require(!SceneLayout.closePortrait(600,1243,false)&&!SceneLayout.closePortrait(600,999,true)&&!SceneLayout.closePortrait(721,1500,true),"Paysage, tablette et limites du cadrage");
        JSONObject invalid=Library.PrefsJson("{\"largeur\":-1000,\"hauteur\":1000,\"taille\":-1000,\"horizontal\":9999,\"vertical\":\"invalide\"}");
        require(Control.WIDTH.value(invalid,true)==Control.WIDTH.min&&Control.HEIGHT.value(invalid,true)==Control.HEIGHT.max
            &&Control.SIZE.value(invalid,true)==Control.SIZE.min&&Control.X.value(invalid,true)==Control.X.max&&Control.Y.value(invalid,true)==0,"Bornage des préférences");
        require(a.refs.characters.size()==7,"Sept dessins à vérifier");
        for(JSONObject def:a.refs.characters){
            float[] box=a.svg(def.optString("svgScene",def.optString("svg"))).box;
            boolean centered=AichaTrack.matches(def);
            for(int[] viewport:new int[][]{{320,568},{390,780},{430,932},{600,1243},{720,1200}}){
                float w=viewport[0]-2*SceneLayout.SIDE_PADDING;
                float before=SceneLayout.height(viewport[0],viewport[1],false,false);
                SceneLayout portrait=new SceneLayout(w,SceneLayout.height(viewport[0],viewport[1],false,true),true,null,box,centered);
                float oldScale=Math.min((w*.38f-4)/box[2],before/box[3]);
                require(portrait.actorScale>oldScale,def.optString("id")+" trop loin à "+viewport[0]+" dp");
                require(portrait.actorX>=0&&portrait.actorY>=0&&portrait.actorX+box[2]*portrait.actorScale<=portrait.width+.01f
                    &&portrait.actorY+box[3]*portrait.actorScale<=portrait.height+.01f,"Personnage hors cadre par défaut");
            }
            SceneLayout landscape=new SceneLayout(820,330,false,null,box,centered);
            float legacy=Math.min((820*.38f-4)/box[2],330/box[3]);
            require(near(landscape.termX,820*.38f)&&near(landscape.termHeight,330)&&near(landscape.actorScale,legacy),"Cadrage par défaut en paysage");
        }
    }

    static boolean onScreen(View v){Rect bounds=new Rect();return v!=null&&v.getGlobalVisibleRect(bounds)&&bounds.height()==v.getHeight();}
    static void presentation(MainActivity a){
        a.scene.capture.performClick();
        require(a.stage.presenting&&a.scene.panel.getVisibility()==View.GONE,"Commandes masquées en présentation");
        View face=DeviceChecks.named(a.stage,a.t("scene.terminal"));
        require(face!=null,"Zone tactile de la scène");
        face.performClick();face.performClick();
        require(!a.stage.presenting&&a.scene.panel.getVisibility()==View.VISIBLE&&DeviceChecks.named(a.stage,a.t(LABEL+"titre"))!=null,
            "Double appui : commandes et cadrage rétablis");
    }

    static String shortPortrait(DeviceChecks d,Context ctx)throws Exception{
        MainActivity a=d.open(ctx);
        try{
            d.waitFor("Fenêtre du petit portrait",()->a.hasWindowFocus()&&a.stage.screenLayout().width>0,10000);
            d.main(()->require(Math.abs(a.scene.scroll.getWidth()/a.ui.density-320)<2,"Portrait court de 320 dp"));
            d.click(a,"Cadrage de la scène");
            d.waitFor("Fermeture du panneau accessible sur petit écran",()->onScreen(DeviceChecks.named(a.modal,a.t("commun.fermer"))),5000);
            d.click(a,"Fermer");
            d.main(()->a.scene.scroll.fullScroll(View.FOCUS_DOWN));
            d.waitFor("Commandes accessibles en défilant",()->onScreen(a.scene.launch)&&onScreen(a.scene.mute),5000);
            d.main(()->presentation(a));
            d.main(()->a.scene.scroll.fullScroll(View.FOCUS_DOWN));
            d.waitFor("Commandes à nouveau accessibles après présentation",()->onScreen(a.scene.launch),5000);
            return "320×568 : panneau et fermeture accessibles, commandes de lecture atteintes en défilant, sortie de présentation en deux appuis";
        }finally{d.main(a::finish);}
    }

    static void duringPlayback(DeviceChecks d,MainActivity a)throws Exception{
        Reading reading=a.reading;Stage stage=a.stage;
        double[] before=new double[1];
        d.main(()->before[0]=reading.time());
        d.click(a,"Cadrage de la scène");
        d.main(()->set(a,Control.WIDTH,61));
        d.waitFor("Lecture et terminal actifs pendant le cadrage",()->a.reading==reading&&a.stage==stage&&reading.playing
            &&reading.time()>before[0]+200&&near(stage.screenLayout().termWidth,stage.screenLayout().width*.61f),5000);
        d.click(a,"Réinitialiser le cadrage");d.click(a,"Fermer");
        d.main(()->require(a.reading==reading&&reading.playing&&a.stage==stage,"Cadrage sans recréer la lecture"));
    }

    static String run(DeviceChecks d,Context ctx)throws Exception{
        MainActivity a=d.open(ctx);
        try{
            d.waitFor("Fenêtre du portrait allongé",()->a.isForeground&&a.hasWindowFocus(),10000);
            d.main(()->{
                Project p=new Project(a.db.settings);p.character="aicha";p.emotions=true;
                p.text="Je te présente le nouveau cadrage de Lectura. Le personnage apparaît devant le terminal.\n".repeat(36);
                a.open(p);a.stage.aicha.reduced=false;a.launch(true);
            });
            d.waitFor("Montage de la scène",()->a.stage.screenLayout().width>0&&a.reading!=null&&a.reading.playing,10000);
            File dir=ctx.getExternalFilesDir("verification");require(dir!=null,"Stockage de test");
            d.main(()->{
                a.launch(false);
                float width=a.scene.scroll.getWidth()/a.ui.density;
                require(Math.abs(width-600)<2&&a.stage.aicha!=null,"Portrait de 600 dp et Aïcha attendus : "+width+" dp");
                defaults(a);
                require(onScreen(a.scene.launch),"Commande Lancer/Reprendre visible");
                a.seek((int)(a.reading.duration-3000-a.reading.time()));
            });
            d.screen(a,dir,"portrait-terminal-droite",1080,2400,false);
            d.main(()->scrollTerminal(a));
            d.click(a,"Masquer le texte du terminal");d.main(()->require(a.stage.masked,"Œil du terminal en portrait allongé"));
            d.click(a,"Afficher le texte du terminal");
            change(d,a);
            d.screen(a,dir,"portrait-curseurs",1080,2400,false);
            d.click(a,"Fermer");
            d.screen(a,dir,"portrait-main-premier-plan",1080,2400,false);
            int[] palmPixels=new int[1];d.main(()->palmPixels[0]=front(a.stage));
            d.main(()->a.go("reglages"));d.click(a,"Ajuster sur la scène");
            d.waitFor("Retour à la scène avec les curseurs",()->a.modal!=null&&a.stage!=null&&a.stage.screenLayout().width>0,6000);
            d.main(()->require(near(a.stage.screenLayout().termWidth,a.stage.screenLayout().width*.63f),"Cadrage retrouvé après navigation"));
            d.click(a,"Réinitialiser le cadrage");d.click(a,"Fermer");
            d.main(()->{
                defaults(a);
                a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            });
            d.waitFor("Rotation en paysage",()->a.root.getWidth()>a.root.getHeight()&&!a.stage.screenLayout().closePortrait,10000);
            d.main(()->{
                SceneLayout frame=a.stage.screenLayout();
                require(near(frame.termWidth,.62f*frame.width)&&near(frame.termHeight,frame.height),"Terminal à droite, mode paysage inchangé");
                a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            });
            d.waitFor("Retour en portrait",()->a.root.getWidth()<a.root.getHeight()&&a.stage.screenLayout().closePortrait,10000);
            return "1080×2400 à 288 dpi : terminal à droite, œil et défilement, cinq curseurs, "+palmPixels[0]
                +" pixels de la main animée devant le terminal, persistance, réinitialisation, paysage et exports stables";
        }finally{d.main(a::finish);}
    }

    private static boolean near(float a,float b){return Math.abs(a-b)<.025f;}
    private static void set(MainActivity a,Control control,int value){
        SeekBar slider=DeviceChecks.named(a.modal,a.t(LABEL+control.key),SeekBar.class);
        require(slider!=null,"Curseur absent : "+control.key);
        Bundle args=new Bundle();args.putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,value);
        require(slider.performAccessibilityAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId(),args),"Curseur inactif : "+control.key);
        require(slider.getProgress()==value&&slider.getStateDescription().toString().endsWith(value+" %"),"Valeur non affichée : "+control.key);
    }

    private static void change(DeviceChecks d,MainActivity a)throws Exception{
        d.click(a,"Cadrage de la scène");
        d.main(()->{
            Stage stage=a.stage;Reading r=a.reading;SceneLayout old=stage.screenLayout();
            // Freeze an actual right-arm presentation gesture, not a separate hand prop.
            AichaMotion.Cue cue=r.aicha.plan.cues.stream().filter(c->c.kind.equals("presente")&&c.side==1).findFirst().orElseThrow();
            r.seek(1000*(cue.start+.50*(cue.end-cue.start)));stage.updatePose(0);
            Bitmap portrait=export(stage,360,640),landscape=export(stage,640,360);
            try{
                set(a,Control.WIDTH,63);
                SceneLayout wide=stage.screenLayout();
                require(near(wide.termWidth,old.width*.63f)&&near(wide.termHeight,old.termHeight)&&sameActor(wide,old),"Largeur indépendante du terminal");
                set(a,Control.HEIGHT,88);
                SceneLayout tall=stage.screenLayout();
                require(near(tall.termWidth,wide.termWidth)&&near(tall.termHeight,old.height*.88f)&&sameActor(tall,old),"Hauteur indépendante du terminal");
                set(a,Control.SIZE,118);set(a,Control.X,12);set(a,Control.Y,-7);
                SceneLayout f=stage.screenLayout();
                require(near(f.actorScale,1.18f*old.actorScale)&&near(f.termHeight,tall.termHeight)&&near(f.termWidth,tall.termWidth),"Taille indépendante du personnage");
                float[] box=stage.artwork.box;
                require(near(f.actorX+(box[2]*f.actorScale-old.width*.24f)/2,old.actorX+box[2]*old.actorScale/2)
                    &&near(f.actorY+(box[3]*f.actorScale+old.height*.14f)/2,old.actorY+box[3]*old.actorScale/2),"Déplacements horizontal et vertical");
                sameExport(stage,portrait);sameExport(stage,landscape);
                JSONObject saved=new Library(a.refs).settings.optJSONObject(SceneLayout.PREFERENCE);
                require(saved!=null&&saved.optInt(Control.WIDTH.key)==63&&saved.optInt(Control.HEIGHT.key)==88&&saved.optInt(Control.SIZE.key)==118
                    &&saved.optInt(Control.X.key)==12&&saved.optInt(Control.Y.key)==-7,"Cadrage conservé dans le stockage local");
            }finally{portrait.recycle();landscape.recycle();}
        });
    }

    private static boolean sameActor(SceneLayout a,SceneLayout b){
        return near(a.actorScale,b.actorScale)&&near(a.actorX,b.actorX)&&near(a.actorY,b.actorY);
    }
    private static Bitmap export(Stage stage,int width,int height){
        Bitmap b=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
        stage.exportDraw(new Canvas(b),width,height,true,0);return b;
    }
    private static void sameExport(Stage stage,Bitmap before){
        Bitmap after=export(stage,before.getWidth(),before.getHeight());
        try{require(before.sameAs(after),"Le cadrage de l’écran ne doit pas changer le rendu de l’export");}
        finally{after.recycle();}
    }

    private static void scrollTerminal(MainActivity a){
        Stage stage=a.stage;SceneLayout f=stage.screenLayout();
        float y=f.termHeight*.38f;
        Bitmap original=screen(stage),outside=null,scrolled=null;
        try{
            require(!swipe(stage,a.ui.f(f.termX-10),a.ui.f(y),a.ui.f(y+70)),"Un geste hors terminal ne doit pas être intercepté");
            outside=screen(stage);
            require(outside.sameAs(original),"Un geste hors terminal ne doit pas le faire défiler");
            require(swipe(stage,a.ui.f(f.width-30),a.ui.f(y),a.ui.f(y+70)),"Glisser dans un terminal avec du texte hors cadre");
            scrolled=screen(stage);
            require(!scrolled.sameAs(original),"Le texte doit défiler dans la fenêtre du terminal");
        }finally{original.recycle();if(outside!=null)outside.recycle();if(scrolled!=null)scrolled.recycle();}
    }
    private static Bitmap screen(Stage stage){
        SceneLayout f=stage.screenLayout();
        Bitmap b=Bitmap.createBitmap((int)Math.ceil(f.width),(int)Math.ceil(f.height),Bitmap.Config.ARGB_8888);
        stage.drawScreen(new Canvas(b),0);return b;
    }
    private static boolean swipe(Stage v,float x,float from,float to){
        long t=SystemClock.uptimeMillis();boolean down=false;
        for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_MOVE,MotionEvent.ACTION_UP}){
            MotionEvent e=MotionEvent.obtain(t,t,action,x,action==MotionEvent.ACTION_DOWN?from:to,0);
            try{boolean handled=v.dispatchTouchEvent(e);if(action==MotionEvent.ACTION_DOWN)down=handled;}finally{e.recycle();}
        }
        return down;
    }

    private static int front(Stage stage){
        SceneLayout f=stage.screenLayout();Svg svg=stage.artwork;
        float[] point={0,5}; // Interior of the right palm, before the animated wrist and arm transforms.
        Svg.Node hand=svg.get("main-r");require(hand!=null,"Main droite d’Aïcha absente");
        for(Svg.Node n=hand;n!=null;n=n.parent){Matrix m=n.transform==null?n.staticTransform:n.transform;if(m!=null)m.mapPoints(point);}
        int x=Math.round(f.actorX+(point[0]-svg.box[0])*f.actorScale);
        int y=Math.round(f.actorY+(point[1]-svg.box[1])*f.actorScale);
        require(f.terminalBodyAt(x-4,y-4)&&f.terminalBodyAt(x+4,y+4),"La main doit traverser le terminal pour ce contrôle : "+x+", "+y);
        Bitmap composite=screen(stage),reference=null;
        try{
            // Use the same opaque background for both images: translucent paths in the palm
            // must blend with the terminal, not with the transparent black of an isolated sprite.
            svg.root.hidden=true;
            try{reference=screen(stage);}finally{svg.root.hidden=false;}
            require(reference.getPixel(reference.getWidth()-9,80)==Refs.color(stage.term,"bg"),"Le fond du terminal doit être dessiné");
            int[] before=new int[49];reference.getPixels(before,0,7,x-3,y-3,7,7);
            svg.draw(new Canvas(reference),f.actorX,f.actorY,f.actorScale);
            int pixels=0;
            for(int dy=0;dy<7;dy++)for(int dx=0;dx<7;dx++){
                int expected=reference.getPixel(x-3+dx,y-3+dy),actual=composite.getPixel(x-3+dx,y-3+dy),bg=before[dy*7+dx];
                if(colorDistance(expected,bg)<24)continue;
                require(colorDistance(actual,expected)<=2,"Main différente du rendu au premier plan : "
                    +Integer.toHexString(actual)+" / "+Integer.toHexString(expected)+" (fond "+Integer.toHexString(bg)+")");
                pixels++;
            }
            require(pixels>=12,"Échantillon de la main insuffisant : "+pixels);return pixels;
        }finally{if(reference!=null)reference.recycle();composite.recycle();}
    }
    private static int colorDistance(int a,int b){
        return Math.max(Math.abs(Color.red(a)-Color.red(b)),Math.max(Math.abs(Color.green(a)-Color.green(b)),Math.abs(Color.blue(a)-Color.blue(b))));
    }
}
