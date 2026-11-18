package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import org.json.JSONObject;

/** Perspective layer from scene-decor.js, including object-bounding-box gradients. */
final class Decor {
    final int wall,floor,horizon,neon;
    private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Shader wallFill,floorFill,halo,horizonFill,neonFill;
    Decor(JSONObject palette){
        wall=Refs.color(palette.optString("mur","#28324d"));floor=Refs.color(palette.optString("sol","#211a33"));
        horizon=Refs.color(palette.optString("horizon","#5ba5c9"));neon=Refs.color(palette.optString("neon","#c67fa6"));
        wallFill=grad(0,360,new int[]{tint(wall,.12),wall,tint(wall,-.30)},new float[]{0,.45f,1});
        floorFill=grad(360,600,new int[]{tint(floor,.05),floor,tint(floor,-.45)},new float[]{0,.35f,1});
        RadialGradient r=new RadialGradient(.5f,0,.75f,new int[]{alpha(neon,.28),alpha(neon,.12),alpha(neon,0)},new float[]{0,.45f,1},Shader.TileMode.CLAMP);
        android.graphics.Matrix m=new android.graphics.Matrix();m.setScale(240,200);m.postTranslate(0,40);r.setLocalMatrix(m);halo=r;
        horizonFill=grad(355,365,new int[]{alpha(horizon,0),alpha(horizon,.55),alpha(horizon,0)},new float[]{0,.5f,1});
        neonFill=new LinearGradient(50,0,190,0,new int[]{alpha(neon,0),alpha(neon,.9),tint(neon,.3),alpha(neon,.9),alpha(neon,0)},new float[]{0,.2f,.5f,.8f,1},Shader.TileMode.CLAMP);
    }
    private static int tint(int color,double f){return Color.rgb(channel(Color.red(color),f),channel(Color.green(color),f),channel(Color.blue(color),f));}
    private static int channel(int n,double f){return (int)Math.round(f<0?n*(1+f):n+(255-n)*f);}
    static int alpha(int color,double a){return (color&0xffffff)|((int)Math.round(255*a)<<24);}
    private static LinearGradient grad(float y,float end,int[] c,float[] stops){return new LinearGradient(0,y,0,end,c,stops,Shader.TileMode.CLAMP);}
    void screen(Canvas c,float w,float h){float s=Math.max(w/240,h/600);c.save();c.clipRect(0,0,w,h);c.translate((w-240*s)/2,h-600*s);c.scale(s,s);draw(c);c.restore();}
    void export(Canvas c,float w,float h){c.save();c.scale(w/380,h/740);c.translate(70,70);draw(c);c.restore();}
    private void fill(Canvas c,float x,float y,float r,float b,Shader shader){p.setColor(Color.WHITE);p.setShader(shader);c.drawRect(x,y,r,b,p);p.setShader(null);}
    private void line(Canvas c,float x,float y,float r,float b,float width,int color,double opacity){p.setStrokeWidth(width);p.setColor(alpha(color,opacity));c.drawLine(x,y,r,b,p);}
    private void panel(Canvas c,float x,int color){
        p.setShader(grad(170,232,new int[]{alpha(color,.55*.85),alpha(color,.15*.85)},null));p.setColor(Color.WHITE);
        c.drawRoundRect(x,170,x+48,232,3,3,p);p.setShader(null);
        p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(.8f);p.setColor(alpha(color,.85));c.drawRoundRect(x,170,x+48,232,3,3,p);p.setStyle(Paint.Style.FILL);
    }
    private void draw(Canvas c){
        c.save();c.clipRect(0,0,240,600);
        fill(c,0,0,240,360,wallFill);fill(c,0,360,240,600,floorFill);fill(c,0,40,240,240,halo);fill(c,0,355,240,365,horizonFill);
        line(c,0,360,240,360,.8f,horizon,.7);
        for(int x:new int[]{-80,320,120})line(c,120,360,x,0,x==120?.5f:.7f,0xff5c7fb8,x==120?.18:.30);
        for(int x:new int[]{-80,0,40,80,120,160,200,240,320})line(c,120,360,x,600,.7f,0xff7a6aa0,.30);
        int i=0;for(int y:new int[]{380,410,445,485,535,595}){float half=120+250*(y-360)/240f;line(c,120-half,y,120+half,y,.7f,0xff7a6aa0,Math.max(.12,.38-i++*.04));}
        panel(c,10,horizon);for(int y:new int[]{185,199,213})line(c,18,y,50,y,.6f,horizon,.65);
        int orange=0xffd99164;panel(c,182,orange);p.setColor(alpha(orange,.75));p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(.9f);c.drawCircle(206,196,11,p);
        p.setStyle(Paint.Style.FILL);p.setColor(alpha(orange,.85));c.drawCircle(206,196,4,p);line(c,192,220,220,220,.6f,orange,.6);
        p.setColor(alpha(neon,.1));c.drawRect(50,78,190,94,p);
        c.saveLayerAlpha(50,82,190,85,242);fill(c,50,82,190,85,neonFill);c.restore();c.restore();
    }
}
