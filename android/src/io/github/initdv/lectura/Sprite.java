package io.github.initdv.lectura;

import android.graphics.Matrix;
import android.graphics.Path;
import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import static java.lang.Math.*;
import static io.github.initdv.lectura.Refs.object;

/** Native port of rig.js, character.js and the active lip model in mouth.js. */
final class Sprite {
    private static final int[] VIS={5,9,14,19};
    private static final Set<String> LIMBS=Set.of("armL","armR","foreL","foreR");
    private static final Map<String,double[]> STYLES=Map.of("fluide",new double[]{1,1,0,0,0},"saccade",new double[]{1,1,5,0,0},
        "sec",new double[]{1.5,.8,0,0,0},"frappe",new double[]{2.4,.5,0,0,0},"flottant",new double[]{.5,.8,0,5,0},
        "ondulant",new double[]{.6,1,0,0,3},"calme",new double[]{.7,1.2,0,0,0},"expressif",new double[]{1.2,1.5,0,0,0});
    private static final double[][] SCRATCH={{0,0,0,0,0},{.28,-120,-80,-6,-4},{.38,-125,-90,-6,-4},{.46,-120,-80,-6,-4},
        {.54,-125,-90,-6,-4},{.62,-120,-80,-6,-4},{.85,-120,-80,-6,-4},{1,0,0,0,0}};
    private static final double[][] GLASSES={{0,0,0,0,0},{.3,-140,-110,-2,1},{.45,-145,-120,-2,1},{.55,-140,-110,-2,1},{.7,-142,-115,-2,1},{1,0,0,0,0}};
    final Svg svg;
    private final Refs refs;
    private final Svg.Node head,body,legs,left,right,foreL,foreR,eyeL,eyeR,browL,browR,mouth;
    private final Svg.Node[] lips;
    private final ArrayList<Svg.Node> reflections=new ArrayList<>();
    private final float[] shoulderL,shoulderR,elbowL,elbowR,neck,hip,browPivotL,browPivotR;
    private final double eyeY,rBase,wBase,hBase,xBase,yBase,cx,cy,halfWidth,maxOpening;
    private final boolean human;
    boolean reduced,quietMouth;
    double gain=1,talk,phase,talkSmooth;
    int viseme; float shape=48;
    String letter="";
    private final double speed,amp,step,floatAmplitude,wave;
    private final Map<String,Double> pose=new HashMap<>(), target=new HashMap<>();
    private double last=-1,blinkUntil,nextBlink=2000,nextLook=1500,lookEnd,lookToX,lookToY,lookX,lookY;
    private String micro="",script="";
    private double microAt,microDuration,microAmplitude,scriptAt,nextMicro=4000+random()*3000;
    private Performance.Cue beat;
    private double sceneTime=-1;
    private boolean onClock;

    Sprite(Refs refs,JSONObject def) {
        this.refs=refs;
        try (InputStream in=refs.open("characters/"+def.optString("svg"))) {svg=new Svg(in);}
        catch(IOException e){throw new IllegalArgumentException(e);}
        body=need("body"); left=need("arm-l");right=need("arm-r");legs=svg.get("legs");
        head=svg.get("head")!=null?svg.get("head"):group(body,true,205,"head");
        foreL=forearm(left,"forearm-l");foreR=forearm(right,"forearm-r");
        Svg.Node parent=body.parent; left.parent.children.remove(left);right.parent.children.remove(right);
        int before=parent.children.indexOf(body); parent.children.add(before+1,left);parent.children.add(before+2,right);left.parent=parent;right.parent=parent;
        eyeL=need("eye-l");eyeR=need("eye-r");browL=need("brow-l");browR=need("brow-r");mouth=need("mouth");
        Set<Svg.Node> seen=new java.util.HashSet<>();
        for(Svg.Node eye:new Svg.Node[]{eyeL,eyeR}) for(int i=eye.parent.children.indexOf(eye)+1;i<eye.parent.children.size();i++) {
            Svg.Node n=eye.parent.children.get(i);
            if(n.kind.equals("circle")&&n.attr("id").isEmpty()&&n.f("r")<=4&&seen.add(n))reflections.add(n);
        }
        JSONObject piv=object(def,"pivots"), style=object(def,"mouvements"), lip=object(def,"bouche");
        shoulderL=pivot(piv,"epaule_g",34,224);shoulderR=pivot(piv,"epaule_d",208,224);
        elbowL=pivot(piv,"coude_g",shoulderL[0],266);elbowR=pivot(piv,"coude_d",shoulderR[0],266);
        neck=pivot(piv,"cou",120,202);hip=pivot(piv,"bassin",120,354);
        browPivotL=pivot(piv,"sourcil_g",92,104);browPivotR=pivot(piv,"sourcil_d",148,104);
        Svg.Node point=eyeL.find("ellipse");if(point==null)point=eyeL.find("circle");
        eyeY=eyeL.f("cy",point==null?129:point.f("cy",129));
        rBase=max(1,eyeL.f("r",11)); wBase=max(1,mouth.f("width",48)); hBase=max(1,mouth.f("height",5));
        xBase=mouth.f("x",96);yBase=mouth.f("y",163);
        human=mouth.kind.equals("g")&&lip.optString("type").equals("levres");
        cx=piv.optDouble("centre",100);cy=piv.optDouble("bouche",84);
        halfWidth=lip.optDouble("demiLargeur",9.5);maxOpening=lip.optDouble("ouvertureMax",8);
        lips=human?new Svg.Node[]{svg.get("levre-creux"),svg.get("levre-haut"),svg.get("levre-bas"),svg.get("bouche-dents"),svg.get("bouche-langue")}:null;
        double[] m=STYLES.getOrDefault(style.optString("style"),STYLES.get("fluide"));
        speed=style.optDouble("vitesseIdle",1)*m[0];amp=style.optDouble("amplitudeBras",1)*m[1];step=m[2];floatAmplitude=m[3];wave=m[4];
        expression("neutre",1,"",0);
    }
    private Svg.Node need(String id) {Svg.Node n=svg.get(id);if(n==null)throw new IllegalArgumentException("Pièce SVG manquante : "+id);return n;}
    private static float[] pivot(JSONObject o,String k,float x,float y){JSONArray a=o.optJSONArray(k);return a==null?new float[]{x,y}:new float[]{(float)a.optDouble(0,x),(float)a.optDouble(1,y)};}
    private static Svg.Node group(Svg.Node parent,boolean upper,float limit,String id){
        Svg.Node g=new Svg.Node("g");g.a.put("id",id);
        for(Svg.Node n:new ArrayList<>(parent.children)) if(upper?n.top()<limit:n.top()>=limit)g.add(n);
        parent.add(g);return g;
    }
    private static Svg.Node forearm(Svg.Node arm,String id){for(Svg.Node n:arm.children)if(n.attr("id").startsWith("forearm"))return n;return group(arm,false,262,id);}
    private static double clamp(double v,double lo,double hi){return max(lo,min(v,hi));}
    private static float f(double n){return (float)(Math.round(n*100)/100d);}
    static float fixed2(double n){
        // SVG rect attributes use Number.toFixed, not mouth.js's Math.round. At a half cent
        // check the unrounded product, since multiplying a binary double can round to a tie.
        double abs=abs(n),scaled=abs*100,cent=floor(scaled),frac=scaled-cent;
        // Math.fma(double, double, double) is not available on API 31. BigDecimal(double)
        // recovers the exact binary input only on the tie path, unlike valueOf(double).
        if(frac>.5||frac==.5&&new BigDecimal(abs).movePointRight(2).compareTo(BigDecimal.valueOf(scaled))>=0)cent++;
        return (float)copySign(cent/100,n);
    }
    private static float q(double n){return Math.round(n*4)/4f;}
    private double v(String name){return pose.get(name);}
    void expression(String id,double force,String mix,double weight){
        JSONObject a=object(refs.expressions,id),b=object(refs.expressions,mix);
        double f=clamp(force,0,1.25),p=b.length()==0?0:clamp(weight,0,.5),pal=clamp((f-.56)/.08,0,1); pal*=pal*(3-2*pal);
        for(Iterator<String> it=refs.neutral.keys();it.hasNext();) {
            String k=it.next();double n=refs.neutral.optDouble(k),va=a.optDouble(k,n),vb=b.optDouble(k,n);
            double value=n+(LIMBS.contains(k)?(va-n)*pal:(va+(vb-va)*p-n)*f);
            if(human&&LIMBS.contains(k)){double lim=k.startsWith("arm")?50:70;value=clamp(value*.6,-lim,lim);}
            if(k.equals("r"))value=clamp(value,6,15);if(k.equals("lid"))value=clamp(value,.15,1);if(k.equals("w"))value=clamp(value,20,64);
            target.put(k,value);
        }
    }
    void direct(Performance.Cue cue,double sourceTime) {
        if(reduced)cue=null;
        if(cue!=null&&beat!=cue){micro="";script="";}
        beat=cue;sceneTime=sourceTime;
    }
    private double step(double a){return step==0?a:round(a/step)*step;}
    void tick(double t){
        double dt=last<0?0:clamp(t-last,0,100);
        boolean clock=sceneTime>=0;
        if(clock||last<0||onClock)pose.putAll(target);
        else for(String n:target.keySet()){double a=1-exp(-dt/(LIMBS.contains(n)?190:110));pose.put(n,v(n)+(target.get(n)-v(n))*a);}
        onClock=clock;last=t;
        double k=(reduced?.25:1)*gain,sk=human?.55:1;
        double rb=0,rd=0,rgx=0,rgy=0,rhr=0,rhy=0,tilt=0,lidDrop=0;
        double s,gazeX,gazeY;boolean blink;
        if(clock){
            // Sample breathing, gaze and blinking at the requested audio time as well as the cue.
            // Dropped frames, waiting in Pause and backward seeks cannot shift the performance.
            t=sceneTime;s=t/1000*speed;talkSmooth=talk;
            long slot=(long)(t/4300);double since=t-slot*4300;
            double at=1800+variation(slot)*1450,glance=(since-at+1150)/850;
            double e=reduced||glance<0||glance>1?0:sin(glance*PI);
            gazeX=(variation(slot+19)-.5)*6*e;gazeY=(variation(slot+43)-.5)*3*e;
            blink=!reduced&&since>=at&&since<at+112;
        }else {
            phase+=dt/1000*speed*v("tempo");s=phase;talkSmooth+=(talk-talkSmooth)*(1-exp(-dt/250));
            if(t>nextBlink){blinkUntil=t+120;nextBlink=t+120+(random()<.12?170:2500+random()*3000);}
            if(t>nextLook&&!reduced){lookToX=talk>.5?4.5:(random()-.5)*6;lookToY=talk>.5?1:(random()-.5)*3;lookEnd=t+450+random()*700;nextLook=lookEnd+2200+random()*3500;}
            double ar=1-exp(-dt/70);lookX+=((t<lookEnd?lookToX:0)-lookX)*ar;lookY+=((t<lookEnd?lookToY:0)-lookY)*ar;
            gazeX=lookX;gazeY=lookY;blink=t<blinkUntil;
        }
        double gx=0,gy=0,jump=0,waveHand=0,shakeHand=0,armL=0,armR=0,elbowLeft=0,elbowRight=0;
        double u=beat==null?1:(sceneTime-beat.at)/beat.length;
        if(beat!=null&&u>=0&&u<1){
            double e=Math.sin(u*PI)*k*sk*beat.strength,tail=(1-u)*k*sk*beat.strength,side=beat.side;
            switch(beat.motion){
                case "hoche": gy=sin(u*3*PI)*5*tail;break;
                case "hoche_lent": rhr=sin(u*2*PI)*9*tail;gy=sin(u*2*PI)*6*tail;break;
                case "secoue": gx=sin(u*6*PI)*5*tail;break;
                case "dodeline": rhr=sin(u*3*PI)*9*tail;gy=sin(u*2*PI)*2*tail;break;
                case "tremble": gx=sin(u*14*PI)*3*tail;break;
                case "coucou": waveHand=min(1,sin(u*PI)*1.65)*min(1,beat.strength+.2);shakeHand=sin(u*9*PI)*21*sk;break;
                case "sursaut_fort": jump=-sin(u*PI)*15*k*sk;break;
                case "sursaut_double": jump=-abs(sin(u*2*PI))*10*k*sk;break;
                case "sursaut": jump=-9*e;rb=-7*e;break;
                case "indique": rgx=5*e;rhr=4*e;armR=-55*e;elbowRight=-39*e;tilt=5*e;break;
                case "observe": rgx=4.7*e;rgy=2*e;rhr=4*e;rhy=2*e; break;
                case "reflechit": rgx=-side*3*e;rgy=-2.5*e;rhr=-side*8*e;armR=-68*e;elbowRight=-67*e;break;
                case "questionne": rhr=side*9*e;rb=-9*e;rhy=-3*e;armL=19*e;elbowLeft=30*e;break;
                case "recule": tilt=-11*e;rhr=-13*e;rhy=-4*e;armR=-25*e;armL=24*e;rb=-10*e;break;
                case "celebre": jump=-14*abs(sin(u*2*PI))*e;armL=62*e;armR=-68*e;elbowLeft=49*e;elbowRight=-48*e;rb=-8*e;break;
                case "applaudit": double claps=(.52+.48*abs(sin(u*4*PI)))*e;
                    armL=-16*claps;armR=16*claps;elbowLeft=61*e;elbowRight=-61*e;rhy=-3*claps;break;
                case "rigole": rd=-4*abs(sin(u*5*PI))*e;rhr=5*e;lidDrop=.48*e;armL=13*e;armR=-14*e;break;
                case "ouvre": armL=34*e;armR=-38*e;elbowLeft=24*e;elbowRight=-27*e;rb=-3*e;break;
                case "redresse": rhy=-6*e;rd=-3*e;tilt=-5*e;armL=17*e;armR=-19*e;break;
                case "incline": tilt=7*e;rhy=5*e;rhr=9*e;rgy=2*e;break;
                case "hausse": rd=-4*e;rhy=3*e;rhr=5*side*e;rb=-8*e;armL=25*e;armR=-25*e;elbowLeft=20*e;elbowRight=-20*e;break;
                case "detourne": rhr=-side*8*e;rgx=-side*5*e;rgy=2.5*e;lidDrop=.3*e;tilt=-4*side*e;break;
                case "soupire": rd=4*e;rhy=5*e;rhr=4*e;rgy=3*e;lidDrop=.34*e;break;
                case "paupiere": lidDrop=.56*e;rhy=4*e;rgy=3*e;break;
                case "insiste": tilt=8*e;gy=4*e;gx=2*e;armR=-24*e;elbowRight=-27*e;rb=4*e;break;
                case "suspens": rhr=side*5*e;rgx=-side*4*e;rgy=-3*e;armL=12*e;elbowLeft=15*e;break;
                case "ciel": rgy=-6*e;rb=-6*e;rhy=-4.5*e;rhr=-6*e;elbowRight=-20*e;break;
                case "relache": rd=4*e;rhy=2*e;armL=14*e;armR=-14*e;lidDrop=.2*e;break;
                case "apaise": rd=3*e;armL=29*e;armR=-29*e;elbowLeft=17*e;elbowRight=-17*e;lidDrop=.19*e;break;
                case "clin": rhr=7*side*e;rgx=4*side*e;rb=-4*e;lidDrop=.31*e;break;
                case "tapote": double tap=abs(sin(u*3*PI))*e;armR=-24*e;elbowRight=-30*tap;gy=2.5*tap;break;
                default: break;
            }
        }
        double breath=sin(s*1.6)*4*k*sk,tr=v("tremble")*k,sway=sin(s*.55)*1.8*k*sk;
        double dx=sin(s*1.1)*wave*k+sin(t*.055)*tr;
        double dy=-(sin(s*.9)+1)*floatAmplitude*k-abs(sin(s*3.2))*v("bounce")*k+jump+cos(t*.047)*tr*.4+rd;
        if(abs(dx)+abs(dy)<=.004){dx=0;dy=0;}
        double lean=(abs(v("lean"))>.02?v("lean")*sk:0)+tilt;
        body.reset().preTranslate(f(dx),f(dy));body.transform.preTranslate(f(sway),f(v("bodyY")-breath*1.3));rotate(body.transform,lean,hip);
        if(legs!=null){legs.reset().preTranslate(f(dx),f(dy));legs.transform.preRotate(f(sway*.8),120,354);}
        double hr=v("headR")+rhr+sin(s*1.1)*max(v("sway"),2.5*sk)*k+sin(s*2.1)*1.3*talk*k*sk;
        double hy=v("headY")+gy+breath*.55+sin(s*4.2)*.9*talk*k+rhy,hx=v("headX")+gx;
        moveRotate(head,hx,hy,hr,neck);
        double scriptedArm=0,scriptedFore=0,scriptedLook=0;
        if(!clock&&!script.isEmpty()){
            double p=(t-scriptAt)/(script.equals("scratch")?2000:1500);
            if(p>=0&&p<1){double[][] a=script.equals("scratch")?SCRATCH:GLASSES;int i=1;while(p>a[i][0])i++;
                double[] a0=a[i-1],a1=a[i];double z=(p-a0[0])/(a1[0]-a0[0]);z*=z*(3-2*z);
                scriptedArm=a0[1]+(a1[1]-a0[1])*z;scriptedFore=a0[2]+(a1[2]-a0[2])*z;scriptedLook=a0[4]+(a1[4]-a0[4])*z;
            }else script="";
        }
        if(!clock&&!reduced&&u>=1&&script.isEmpty()&&t>nextMicro&&talkSmooth<.4){
            if(random()<.35){script=random()<.5?"scratch":"glasses";scriptAt=t;nextMicro=t+9000+random()*6000;}
            else {String[] types={"arms","shoulderL","shoulderR","elbowL","elbowR"};micro=types[(int)(random()*types.length)];
                microAt=t;microDuration=400+random()*500;microAmplitude=((micro.startsWith("elbow")?5:3)+random()*5)*sk;
                nextMicro=t+(talk>.3?12000+random()*6000:5500+random()*3500);}
        }
        double ml=0,mr=0,mfl=0,mfr=0;
        if(!clock&&!micro.isEmpty()) {double m=(t-microAt)/microDuration,a=microAmplitude*sin(m*PI)*k;
            if(m>=0&&m<1)switch(micro){case "arms":ml=a;mr=-a;break;case "shoulderL":ml=a;break;case "shoulderR":mr=-a;break;case "elbowL":mfl=a;break;case "elbowR":mfr=-a;break;default:break;}}
        double amount=(human?12:7)*talkSmooth*k*amp*v("swing"),el=v("armL"),fl=v("foreL");
        double al=el+(24-el)*waveHand+step(sin(s*(human?.85:1.3))*amount)+ml+armL;
        double aa=-v("armR")+step(-sin(s*(human?.7:1.1)+1)*amount)+mr+scriptedArm+armR;
        double aFl=fl+(shakeHand-204-fl)*waveHand+step(sin(s*1.4+2)*amount*.8)+mfl+elbowLeft;
        double aFr=-v("foreR")+step(-sin(s*1.2)*amount*.8)+mfr+scriptedFore+elbowRight;
        for(Svg.Node n:new Svg.Node[]{left,right}){n.reset().preTranslate(f(dx),f(dy));n.transform.preTranslate(0,f(v("bodyY")));rotate(n.transform,lean,hip);}
        rotate(left.transform,al,shoulderL);rotate(right.transform,aa,shoulderR);rotate(foreL.reset(),aFl,elbowL);rotate(foreR.reset(),aFr,elbowR);
        double h=quietMouth?0:max(VIS[max(0,min(3,viseme))],v("h")),w=v("w")*(shape/48);
        if(human)drawLips(cx+v("gx")*.2,cy+v("my"),halfWidth*(w/48),h*(maxOpening/19));
        else if(mouth.kind.equals("rect")){
            // character.js rounds each SVG attribute, after computing the centre and corner radius.
            double height=max(1,h*hBase/5),width=max(1,w*wBase/48);
            float xm=fixed2(xBase+wBase/2-width/2),ym=fixed2(yBase+hBase/2+v("my")-height/2),r=fixed2(min(6,min(width,height)/2));
            mouth.path().addRoundRect(xm,ym,xm+fixed2(width),ym+fixed2(height),r,r,Path.Direction.CW);
        }
        double sy=blink?.15:clamp(v("lid")-lidDrop,.15,1),eyex=v("gx")+gazeX+sin(s*.55)*1.3*k+sin(s*1.5)*.6*k+rgx+scriptedLook;
        double eyey=v("gy")+gazeY+cos(s*.45)*.8*k+rgy;
        for(Svg.Node eye:new Svg.Node[]{eyeL,eyeR}){
            eye.reset().preTranslate(f(eyex),f(eyey)); if(sy<=.995)eye.transform.preScale(1,f(sy),0,(float)eyeY);
            if(eye.kind.equals("circle"))eye.path().addCircle(eye.f("cx"),eye.f("cy"),f(v("r")*rBase/11),Path.Direction.CW);
        }
        for(Svg.Node n:reflections){n.reset().preTranslate(f(eyex),f(eyey));n.alpha=sy>.6?1:0;}
        moveRotate(browL,0,v("browL")+rb,-v("rot")*sk,browPivotL);moveRotate(browR,0,v("browR")+rb,v("rot")*sk,browPivotR);
    }
    private static double variation(long index){long n=(index+1)*0x9e3779b97f4a7c15L;n^=n>>>30;n*=0xbf58476d1ce4e5b9L;return (n>>>48)/65536.;}
    private static void rotate(Matrix m,double a,float[] p){m.preRotate(f(a),p[0],p[1]);}
    private static void moveRotate(Svg.Node n,double x,double y,double a,float[] p){n.reset().preTranslate(f(x),f(y));rotate(n.transform,a,p);}
    private static void path(Svg.Node n,boolean show,double x,double y,double... data){
        if(n==null)return;n.alpha=show?1:0;if(!show)return;
        Path p=n.path();p.moveTo(f(x),f(y));for(int i=0;i+3<data.length;i+=4)p.quadTo(f(data[i]),f(data[i+1]),f(data[i+2]),f(data[i+3]));p.close();
    }
    private void drawLips(double x,double y,double hw,double gap){
        double round=0,stretch=0;
        if(!letter.isEmpty()){
            char c=Character.toLowerCase(letter.charAt(0));
            // scene.js passes one UTF-16 character. Match visemeDe()'s single-letter table and 'a' fallback.
            if(c=='o')round=.85;
            else if(c=='u')round=.95;
            else if("eéèê".indexOf(c)>=0)stretch=.55;
            else if(c=='i'||c=='y')stretch=.85;
            else if(c=='f'||c=='v')stretch=.35;
            else if("rjg".indexOf(c)>=0){round=.35;stretch=.15;}
            else if("mbp".indexOf(c)<0){round=.1;stretch=.1;}
        }
        round=clamp(max(round,pose.getOrDefault("rond",0d)),0,1);
        double g=max(0,q(gap)),w=q(hw)*(1-round*.28+stretch*.12),hi=g*.35,lo=g*.65,xl=q(x)-w,xr=q(x)+w;
        double yc=q(y),corner=yc+q(clamp(pose.getOrDefault("sourire",0d),-1,1)*min(5,w*.28)),bow=2.6*(1-stretch*.5);
        path(lips[0],g>=.4,xl,corner,x,y+hi*1.1,xr,corner,x,(yc+lo)*1.02+lo*.28,xl,corner);
        path(lips[1],true,xl,corner,x-w*.42,yc-bow,x,yc-bow+bow*.22,x+w*.42,yc-bow,xr,corner,x,y+hi*1.1,xl,corner);
        path(lips[2],true,xl,corner,x,y+lo*1.5+2,xr,corner,x,y+lo*1.1,xl,corner);
        path(lips[3],g>=1.6,x-w*.62,y+hi*.30,x,y+hi*.95,x+w*.62,y+hi*.30,x,y+hi*.52,x-w*.62,y+hi*.30);
        path(lips[4],g>=2.6,x-w*.40,y+lo*.72,x,y+lo*1.30,x+w*.40,y+lo*.72,x,y+lo*1.02,x-w*.40,y+lo*.72);
    }
}
