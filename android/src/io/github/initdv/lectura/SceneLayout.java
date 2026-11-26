package io.github.initdv.lectura;

/** Bounds in dp for the live scene. Image and video exports use their own composition. */
final class SceneLayout {
    static final float SIDE_PADDING=12, GAP=8;
    private static final float CHARACTER_SHARE=.38f;

    final boolean stacked;
    final float artWidth,artHeight,termX,termY,termWidth,termHeight;

    static boolean stacked(float viewportWidth,boolean portrait){
        return portrait&&viewportWidth<=480;
    }

    private static float mobileTerminal(float viewportWidth){
        return Math.min(184,Math.max(144,viewportWidth*.4f));
    }

    static float height(float viewportWidth,float viewportHeight,boolean presenting,boolean stacked){
        if(presenting)return Math.max(80,viewportHeight-20);
        // Match scene.css: a nearly square stage makes even the tallest sprite fit on a phone.
        float regular=Math.max(280,Math.min(.7f*viewportHeight,viewportHeight-306));
        if(!stacked)return regular;
        float minimum=Math.max(0,viewportWidth-2*SIDE_PADDING)*.95f+GAP+mobileTerminal(viewportWidth);
        return Math.max(regular,minimum);
    }

    SceneLayout(float width,float height,boolean stacked){
        this.stacked=stacked;
        if(stacked){
            termX=0;termWidth=artWidth=width;
            termHeight=Math.min(height/2,mobileTerminal(width+2*SIDE_PADDING));
            termY=height-termHeight;
            artHeight=Math.max(0,termY-GAP);
        }else{
            termX=artWidth=width*CHARACTER_SHARE;
            termWidth=width-termX;
            termY=0;termHeight=artHeight=height;
        }
    }

    boolean terminalBodyAt(float x,float y){
        return x>=termX&&x<termX+termWidth&&y>termY+54&&y<termY+termHeight;
    }
}
