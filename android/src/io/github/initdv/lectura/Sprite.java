package io.github.initdv.lectura;

import android.graphics.Matrix;
import android.graphics.Path;
import org.json.JSONArray;
import org.json.JSONObject;
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
    private static final Map<String,Integer> GESTURES=Map.of("hoche",650,"secoue",750,"sursaut",380,"coucou",1400,
        "sursaut_fort",500,"sursaut_double",700,"hoche_lent",1100,"dodeline",800,"tremble",500);
    private static final Map<String,Integer> PUNCTUATION=Map.of("?",550,"!",260,"…",700,",",220);
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
    boolean reduced,rich;
    double gain=1,talk,phase,talkSmooth;
    int viseme; float shape=48;
    String letter="";
    private final double speed,amp,step,floatAmplitude,wave;
    private final Map<String,Double> pose=new HashMap<>(), target=new HashMap<>();
    private double last=-1,blinkUntil,nextBlink=2000,nextLook=1500,lookEnd,lookToX,lookToY,lookX,lookY;
    private String gesture="",reaction="",micro="",script="";
    private double gestureAt,armEnd,reactionAt,microAt,microDuration,microAmplitude,scriptAt,nextMicro=4000+random()*3000;
    private int gestureArm=1;

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
    private static float fixed2(double n){
        // SVG rect attributes use Number.toFixed, not mouth.js's Math.round. At a half cent
        // check the unrounded product, since multiplying a binary double can round to a tie.
        double abs=abs(n),scaled=abs*100,cent=floor(scaled),frac=scaled-cent;
        if(frac>.5||frac==.5&&Math.fma(abs,100,-scaled)>=0)cent++;
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
    void punct(String text,double t){if(PUNCTUATION.containsKey(text)){reaction=text;reactionAt=t;}}
    void gesture(String name,double t){
        if(!gesture.isEmpty()&&t-gestureAt<GESTURES.get(gesture)*.8||armEnd!=0&&t<armEnd-140)return;
        micro="";script="";
        if(GESTURES.containsKey(name)){gesture=name;gestureAt=t;}
        else {armEnd=t+700;gestureArm=-gestureArm;}
    }
    private double step(double a){return step==0?a:round(a/step)*step;}
    void tick(double t){
        double dt=last<0?0:clamp(t-last,0,100);
        if(last<0)pose.putAll(target);
        else for(String n:target.keySet()){double a=1-exp(-dt/(LIMBS.contains(n)?190:110));pose.put(n,v(n)+(target.get(n)-v(n))*a);}
        last=t;
        double k=(reduced?.25:1)*gain,sk=human?.55:1, rb=0,rd=0,rgx=0,rgy=0,rhr=0,rhy=0;
        if(!reaction.isEmpty()){
            double u=(t-reactionAt)/PUNCTUATION.get(reaction),e=sin(u*PI)*k;
            if(u>=0&&u<1)switch(reaction){case "?": rb=-16*e;rhy=-3*e;break;case "!":rd=-4*e;break;case "…":rgx=-2.5*e;rgy=-2*e;break;case ",":rhr=2.5*e;break;default:break;}
        }
        phase+=dt/1000*speed*v("tempo");double s=phase;
        talkSmooth+=(talk-talkSmooth)*(1-exp(-dt/250));
        if(t>nextBlink){blinkUntil=t+120;nextBlink=t+120+(random()<.12?170:2500+random()*3000);}
        if(t>nextLook&&!reduced){lookToX=talk>.5?4.5:(random()-.5)*6;lookToY=talk>.5?1:(random()-.5)*3;lookEnd=t+450+random()*700;nextLook=lookEnd+2200+random()*3500;}
        double ar=1-exp(-dt/70);lookX+=((t<lookEnd?lookToX:0)-lookX)*ar;lookY+=((t<lookEnd?lookToY:0)-lookY)*ar;
        double gx=0,gy=0,jump=0,waveHand=0,shakeHand=0,u=gesture.isEmpty()?1:(t-gestureAt)/GESTURES.get(gesture),env=(1-u)*k*sk;
        if(u>=0&&u<1)switch(gesture){
            case "hoche":gy=sin(u*4*PI)*5*env;break;
            case "hoche_lent":gy=sin(u*2*PI)*7*env;break;
            case "secoue":gx=sin(u*6*PI)*5*env;break;
            case "dodeline":gx=sin(u*3*PI)*7*env;gy=sin(u*2*PI)*2*env;break;
            case "tremble":gx=sin(u*15*PI)*3*env;break;
            case "coucou":waveHand=min(1,sin(u*PI)*1.8);shakeHand=sin(u*10*PI)*22*sk;break;
            case "sursaut_fort":jump=-sin(u*PI)*18*k*sk;break;
            case "sursaut_double":jump=-abs(sin(u*2*PI))*12*k*sk;break;
            default:jump=-sin(u*PI)*9*k*sk;
        }
        double breath=sin(s*1.6)*4*k*sk,tr=v("tremble")*k,sway=sin(s*.55)*1.8*k*sk;
        double dx=sin(s*1.1)*wave*k+sin(t*.055)*tr;
        double dy=-(sin(s*.9)+1)*floatAmplitude*k-abs(sin(s*3.2))*v("bounce")*k+jump+cos(t*.047)*tr*.4+rd;
        if(abs(dx)+abs(dy)<=.004){dx=0;dy=0;}
        double lean=abs(v("lean"))>.02?v("lean")*sk:0;
        body.reset().preTranslate(f(dx),f(dy));body.transform.preTranslate(f(sway),f(v("bodyY")-breath*1.3));rotate(body.transform,lean,hip);
        if(legs!=null){legs.reset().preTranslate(f(dx),f(dy));legs.transform.preRotate(f(sway*.8),120,354);}
        double hr=v("headR")+rhr+sin(s*1.1)*max(v("sway"),2.5*sk)*k+sin(s*2.1)*1.3*talk*k*sk;
        double hy=v("headY")+gy+breath*.55+sin(s*4.2)*.9*talk*k+rhy,hx=v("headX")+gx;
        moveRotate(head,hx,hy,hr,neck);
        double scriptedArm=0,scriptedFore=0,scriptedLook=0;
        if(!script.isEmpty()){
            double p=(t-scriptAt)/(script.equals("scratch")?2000:1500);
            if(p>=0&&p<1){double[][] a=script.equals("scratch")?SCRATCH:GLASSES;int i=1;while(p>a[i][0])i++;
                double[] a0=a[i-1],a1=a[i];double z=(p-a0[0])/(a1[0]-a0[0]);z*=z*(3-2*z);
                scriptedArm=a0[1]+(a1[1]-a0[1])*z;scriptedFore=a0[2]+(a1[2]-a0[2])*z;scriptedLook=a0[4]+(a1[4]-a0[4])*z;
            }else script="";
        }
        if(!reduced&&u>=1&&t>=armEnd&&script.isEmpty()&&t>nextMicro&&talkSmooth<.4){
            if(random()<.35){script=random()<.5?"scratch":"glasses";scriptAt=t;nextMicro=t+9000+random()*6000;}
            else {String[] types={"arms","shoulderL","shoulderR","elbowL","elbowR"};micro=types[(int)(random()*types.length)];
                microAt=t;microDuration=400+random()*500;microAmplitude=((micro.startsWith("elbow")?5:3)+random()*5)*sk;
                nextMicro=t+(talk>.3?12000+random()*6000:5500+random()*3500);}
        }
        double ml=0,mr=0,mfl=0,mfr=0;
        if(!micro.isEmpty()) {double m=(t-microAt)/microDuration,a=microAmplitude*sin(m*PI)*k;
            if(m>=0&&m<1)switch(micro){case "arms":ml=a;mr=-a;break;case "shoulderL":ml=a;break;case "shoulderR":mr=-a;break;case "elbowL":mfl=a;break;case "elbowR":mfr=-a;break;default:break;}}
        double g=t<armEnd?sin(PI*(1-(armEnd-t)/700))*(rich?42:24)*k:0;
        double amount=(human?12:7)*talkSmooth*k*amp*v("swing"),el=v("armL"),fl=v("foreL");
        double al=el+(24-el)*waveHand+step(sin(s*(human?.85:1.3))*amount+(gestureArm<0?g:0))+ml;
        double aa=-v("armR")+step(-sin(s*(human?.7:1.1)+1)*amount-(gestureArm>0?g:0))+mr+scriptedArm;
        double aFl=fl+(shakeHand-204-fl)*waveHand+step(sin(s*1.4+2)*amount*.8+(gestureArm<0?g*.9:0))+mfl;
        double aFr=-v("foreR")+step(-sin(s*1.2)*amount*.8-(gestureArm>0?g*.9:0))+mfr+scriptedFore;
        for(Svg.Node n:new Svg.Node[]{left,right}){n.reset().preTranslate(f(dx),f(dy));n.transform.preTranslate(0,f(v("bodyY")));rotate(n.transform,lean,hip);}
        rotate(left.transform,al,shoulderL);rotate(right.transform,aa,shoulderR);rotate(foreL.reset(),aFl,elbowL);rotate(foreR.reset(),aFr,elbowR);
        double h=max(VIS[max(0,min(3,viseme))],v("h")),w=v("w")*(rich?shape/48:1);
        if(human)drawLips(cx+v("gx")*.2,cy+v("my"),halfWidth*(w/48),h*(maxOpening/19));
        else if(mouth.kind.equals("rect")){
            // character.js rounds each SVG attribute, after computing the centre and corner radius.
            double height=max(1,h*hBase/5),width=max(1,w*wBase/48);
            float xm=fixed2(xBase+wBase/2-width/2),ym=fixed2(yBase+hBase/2+v("my")-height/2),r=fixed2(min(6,min(width,height)/2));
            mouth.path().addRoundRect(xm,ym,xm+fixed2(width),ym+fixed2(height),r,r,Path.Direction.CW);
        }
        double sy=t<blinkUntil?.15:v("lid"),eyex=v("gx")+lookX+sin(s*.55)*1.3*k+sin(s*1.5)*.6*k+rgx+scriptedLook;
        double eyey=v("gy")+lookY+cos(s*.45)*.8*k+rgy;
        for(Svg.Node eye:new Svg.Node[]{eyeL,eyeR}){
            eye.reset().preTranslate(f(eyex),f(eyey)); if(sy<=.995)eye.transform.preScale(1,f(sy),0,(float)eyeY);
            if(eye.kind.equals("circle"))eye.path().addCircle(eye.f("cx"),eye.f("cy"),f(v("r")*rBase/11),Path.Direction.CW);
        }
        for(Svg.Node n:reflections){n.reset().preTranslate(f(eyex),f(eyey));n.alpha=sy>.6?1:0;}
        moveRotate(browL,0,v("browL")+rb,-v("rot")*sk,browPivotL);moveRotate(browR,0,v("browR")+rb,v("rot")*sk,browPivotR);
    }
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
