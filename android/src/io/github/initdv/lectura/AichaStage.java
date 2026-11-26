package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import org.json.JSONObject;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** The five shared rigs use the same pose and perspective plane on screen, PNG and video. */
final class AichaStage {
    private static final int[] RAYS={-146,-94,-59,-30,30,59,94,146}, BRUME={0x880b1025,0x00171b32,0xaa0a071a};
    private static final float[] STOPS={0,.48f,1};
    private final AichaRig rig;
    private final Decor colors;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private LinearGradient fog;
    private float fogTop,fogBottom;
    private Plan last;
    private double lastMs,lastWait,lastLevel,idleStart=Double.NaN,advance;
    private String lastExpression;
    private boolean lastReduced;
    boolean reduced;
    final double gain;

    AichaStage(Svg svg,Decor colors,double gain,boolean reduced){rig=new AichaRig(svg);this.colors=colors;this.gain=gain;this.reduced=reduced;}
    void update(AichaTrack track,double ms,double level,double wall,boolean finished,String expression){
        Plan plan=track==null?REST:track.plan;
        double wait=0;
        if(track==null||finished){
            if(Double.isNaN(idleStart))idleStart=wall;
            if(!reduced)wait=floor(max(0,wall-idleStart)/33)*33;
            level=0;ms=track==null?0:plan.duration*1000;
        }else idleStart=Double.NaN;
        if(last==plan&&lastMs==ms&&lastWait==wait&&lastLevel==level&&lastReduced==reduced&&expression.equals(lastExpression))return;
        double[] mouth=track==null||finished?REST_MOUTH:track.lips.atTime(ms,level);
        Pose pose=pose(plan,ms,gain,reduced,expression,mouth,wait,rig.glasses);
        rig.draw(pose,reduced?0:(ms+wait)/1000);advance=pose.avance;
        last=plan;lastMs=ms;lastWait=wait;lastLevel=level;lastReduced=reduced;lastExpression=expression;
    }
    void paint(Canvas c,float w,float h,boolean export){
        float[] b=rig.svg.box;
        float scale=min((export?w*.92f:w-4)/b[2],h*(export?.94f:1)/b[3]);if(!(scale>0))return;
        float x=(w-b[2]*scale)/2,y=(h-b[3]*scale)/2;
        c.save();c.clipRect(0,0,w,h);
        decor(c,w,h,x-b[0]*scale,y-b[1]*scale,scale);
        rig.svg.draw(c,x,y,scale);c.restore();
    }
    private void fill(Canvas c,float x,float y,float r,float b,int color){paint.setColor(color);c.drawRect(x,y,r,b,paint);}
    private void line(Canvas c,double x,double y,double r,double b,int color,double width,double opacity){
        paint.setColor(Decor.alpha(color,opacity));paint.setStrokeWidth((float)width);c.drawLine((float)x,(float)y,(float)r,(float)b,paint);
    }
    private void decor(Canvas c,float w,float h,float x,float y,float scale){
        c.save();c.translate(x,y);c.scale(scale,scale);
        float left=-x/scale,right=(w-x)/scale,top=-y/scale,bottom=(h-y)/scale;
        fill(c,left,top,right,bottom,colors.wall);fill(c,left,(float)HORIZON,right,bottom,colors.floor);
        if(fog==null||fogTop!=top||fogBottom!=bottom){fogTop=top;fogBottom=bottom;fog=new LinearGradient(0,top,0,bottom,BRUME,STOPS,Shader.TileMode.CLAMP);}
        paint.setShader(fog);fill(c,left,top,right,bottom,0xffffffff);paint.setShader(null);
        double edge=(bottom-HORIZON)/(SOL-HORIZON);line(c,left,HORIZON,right,HORIZON,colors.horizon,2.8,.16);
        for(int r:RAYS)line(c,0,HORIZON,r*edge,bottom,colors.horizon,.8,abs(r)==59?.38:.22);
        double near=max(1.68,(bottom-HORIZON+3)/(SOL-HORIZON));int first=(int)floor((advance+FOCALE*(1-1/near))/38);
        for(int n=first-16;n<=first;n++){
            double f=focal(n*38-advance),v=HORIZON+(SOL-HORIZON)*f,a=smooth(.32,.93,f);
            line(c,-208*f,v,208*f,v,colors.horizon,.94*f,.46*a);
            for(int side=-1;side<=1;side+=2){
                double edgeX=side*59*f;line(c,edgeX-3.9*f,v,edgeX+3.9*f,v,colors.horizon,2.3*f,.82*a);
                if(n%3!=0)continue;
                double xx=side*83*f,y1=HORIZON-162*f,y2=HORIZON+56*f,o=.57*a*(1-smooth(1.19,1.65,f));
                line(c,xx,y1,xx,y2,colors.horizon,6*f,o*.47);
                line(c,xx,y1+24*f,xx,y1+88*f,side<0?colors.horizon:colors.neon,3.4*f,o);
                line(c,xx,y1,side*126*f,y1,colors.neon,1.7*f,o);
            }
        }
        c.restore();
    }
}
