package io.github.initdv.lectura;

import org.json.JSONObject;

/** Independent terminal and actor bounds in dp. Only the outer stage clips the actor. */
final class SceneLayout {
    static final float SIDE_PADDING=12, TERMINAL_HEADER=54;
    static final String PREFERENCE="cadrageScene";
    private static final float LEGACY_SHARE=.38f;

    enum Control {
        WIDTH("largeur",30,78,48,62), HEIGHT("hauteur",28,100,78,100),
        SIZE("taille",55,150,100,100), X("horizontal",-35,35,0,0), Y("vertical",-35,35,0,0);

        final String key;
        final int min,max,phoneDefault,wideDefault;
        Control(String key,int min,int max,int phoneDefault,int wideDefault){
            this.key=key;this.min=min;this.max=max;this.phoneDefault=phoneDefault;this.wideDefault=wideDefault;
        }
        int value(JSONObject preferences,boolean phone){
            int fallback=phone?phoneDefault:wideDefault;
            int v=preferences==null?fallback:preferences.optInt(key,fallback);
            return Math.max(min,Math.min(max,v));
        }
    }

    final boolean closePortrait,atlas;
    final float width,height,termX,termWidth,termHeight;
    final float backdropWidth,baseX,baseY,baseScale;
    final float actorX,actorY,actorScale;

    static boolean closePortrait(float viewportWidth,float windowHeight,boolean portrait){
        // Small display scaling can report 600 dp or more on a tall phone.
        return portrait&&(viewportWidth<=480||(viewportWidth<=720&&viewportWidth*5<=windowHeight*3));
    }

    static float height(float viewportWidth,float viewportHeight,boolean presenting,boolean closePortrait){
        if(presenting)return Math.max(80,viewportHeight-20);
        float regular=Math.max(280,Math.min(.7f*viewportHeight,viewportHeight-306));
        return closePortrait?Math.max(regular,(viewportWidth-2*SIDE_PADDING)*1.08f):regular;
    }

    SceneLayout(float width,float height,boolean closePortrait,JSONObject options,float[] box,boolean centered){
        this(width,height,closePortrait,options,box,centered,false);
    }

    SceneLayout(float width,float height,boolean closePortrait,JSONObject options,float[] box,boolean centered,boolean atlas){
        this.width=width;this.height=height;this.closePortrait=closePortrait;this.atlas=atlas;
        termWidth=atlas?width*.66f:Math.min(width,Math.max(132,width*(Control.WIDTH.value(options,closePortrait)/100f)));
        termHeight=atlas?height:Math.min(height,Math.max(112,height*(Control.HEIGHT.value(options,closePortrait)/100f)));
        termX=width-termWidth;
        // Reserve a large sprite area on phones, independently of the width of the terminal.
        float fitWidth=width*(atlas?.34f:closePortrait?.80f:LEGACY_SHARE);
        backdropWidth=closePortrait?width:fitWidth;
        baseScale=Math.max(0,Math.min((atlas?fitWidth*.96f:fitWidth-4)/box[2],height*(atlas||closePortrait?.94f:1)/box[3]));
        actorScale=atlas?baseScale:baseScale*Control.SIZE.value(options,closePortrait)/100;
        float centerX=fitWidth/2,centerY=atlas||centered||closePortrait?height/2:height-box[3]*baseScale/2;
        baseX=centerX-box[2]*baseScale/2;
        baseY=centerY-box[3]*baseScale/2;
        if(!atlas){
            centerX=position(centerX,width,Control.X.value(options,closePortrait));
            centerY=position(centerY,height,Control.Y.value(options,closePortrait));
        }
        actorX=centerX-box[2]*actorScale/2;
        actorY=centerY-box[3]*actorScale/2;
    }

    private static float position(float center,float extent,int offset){
        if(offset==0)return center;
        return Math.max(.08f*extent,Math.min(.92f*extent,center+extent*offset/100));
    }

    float bodyTop(){return atlas?Math.min(34,height*.075f):TERMINAL_HEADER;}
    float bodyBottom(){return atlas?height-Math.min(54,height*.13f):termHeight;}
    float bodyRight(){return atlas?width-Math.min(30,width*.038f):width;}
    boolean terminalBodyAt(float x,float y){
        return x>=termX&&x<bodyRight()&&y>bodyTop()&&y<bodyBottom();
    }
}
