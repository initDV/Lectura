package io.github.initdv.lectura;

import java.util.List;
import java.util.regex.Pattern;
import static java.lang.Math.*;

/** Port de robot-motion.js. Échantillonne une pose sur l'horloge source, sans état entre deux images. */
final class RobotChoreo {
    static final double[] X={86,152};
    static final int HIP=354,KNEE=424,ANKLE=528;
    static final int BOW_MS=1430;
    private static final Pattern QUESTION=Pattern.compile("\\?[!?…]*[\\s\\p{Z}»”'’\"\\])}*_`]*$");
    private static final Pattern SPOKEN=Pattern.compile("[\\p{L}\\p{N}]");
    final double[] step,hour,question,salute;
    final String label;
    final double end;
    private RobotChoreo(double[] step,double[] hour,double[] question,double[] salute,String label,double end){
        this.step=step;this.hour=hour;this.question=question;this.salute=salute;this.label=label;this.end=end;
    }
    private static double clamp(double v,double a,double b){return min(b,max(a,v));}
    private static double from(Script.Segment s,double duration){return clamp(s.from,0,duration);}
    private static double to(Script.Segment s,double duration){return clamp(s.to,from(s,duration),duration);}
    private static double voiceEnd(Script.Segment s,double duration){return s.speechEnd<0?to(s,duration):clamp(s.speechEnd,from(s,duration),to(s,duration));}
    private static boolean can(Script.Segment s,double duration){return s.type==Script.SPOKEN&&Script.type(s.text)==Script.SPOKEN&&voiceEnd(s,duration)>from(s,duration)
        &&(s.expression.isEmpty()||s.expression.equals("auto"))&&SPOKEN.matcher(s.text).find();}
    static RobotChoreo plan(List<Script.Segment> parts,double duration){
        Script.Segment first=null,question=null,clock=null;
        ClockWords.Time time=null;
        for(Script.Segment s:parts){
            if(!can(s,duration))continue;
            if(first==null)first=s;
            if(question==null&&QUESTION.matcher(s.text).find())question=s;
            if(clock==null){time=ClockWords.first(s.text);if(time!=null)clock=s;}
        }
        if(first==null)return null;
        double[] q=null,h=null;
        String label="";
        if(question!=null){double hit=voiceEnd(question,duration);q=new double[]{hit-min(640,(hit-from(question,duration))*.57),to(question,duration)};}
        if(clock!=null){
            double start=from(clock,duration),len=voiceEnd(clock,duration)-start;
            double begin=max(start,start+len*time.index/clock.text.length()-340);
            double end=min(to(clock,duration),min(start+len*(time.index+time.length)/clock.text.length()+230,begin+1150));
            if(q!=null&&clock==question)q[0]=min(q[1]-(q[1]-start)*.28,max(q[0],end));
            double until=q!=null&&clock==question?min(q[0],end):end;
            if(until<=begin){begin=start;until=q!=null&&clock==question?q[0]:end;}
            if(until>begin){h=new double[]{begin,until};label=time.label;}
        }
        double start=from(first,duration),cap=min(to(first,duration),min(first==clock&&h!=null?h[0]:Double.POSITIVE_INFINITY,
            first==question?q[0]:Double.POSITIVE_INFINITY));
        double[] step=cap-start>=180?new double[]{start+min(80,(cap-start)*.065),min(cap,start+1300)}:null;
        Script.Segment last=parts.get(parts.size()-1);
        double out=last.speechEnd>=0?max(voiceEnd(last,duration),max(q==null?0:q[1],h==null?0:h[1])):duration;
        double[] salute=can(last,duration)?new double[]{out,out+BOW_MS}:null;
        return new RobotChoreo(step,h,q,salute,label,salute==null?duration:max(duration,salute[1]));
    }
    static final class Leg {
        double hx,hy,kx,ky,fx,fy,lift,thigh,shin;
    }
    static final class Pose {
        final Leg[] legs={new Leg(),new Leg()};
        double x,y,tilt,blend,head,nod,drop,armL,foreL,armR,foreR,gazeX,gazeY,brow,antenna,clock;
        double mix(double normal,double gesture){return normal+(gesture-normal)*blend;}
    }
    private static double phase(double t,double[] cue){return cue==null?0:clamp((t-cue[0])/(cue[1]-cue[0]),0,1);}
    private static double rise(double t,double a,double b){double x=clamp((t-a)/(b-a),0,1);return x*x*x*(10+x*(-15+6*x));}
    private static double pulse(double t,double a,double b,double c,double d){return rise(t,a,b)*(1-rise(t,c,d));}
    void sample(double ms,boolean accents,Pose p){
        double t=max(0,ms)/1000,u=phase(ms,step),h=accents?phase(ms,hour):0,q=accents?phase(ms,question):0,s=accents?phase(ms,salute):0;
        double present=pulse(h,.07,.37,.55,1),back=pulse(h,0,.09,.13,.24),look=pulse(h,0,.23,.64,.97);
        double ask=pulse(q,0,.40,.59,1),bow=pulse(s,.12,.49,.60,.95),saluteHand=pulse(s,0,.41,.57,1);
        double transfer=pulse(u,.03,.30,.72,.99),breath=.5-.5*cos(2*PI*t/3.6);
        p.x=-7*rise(u,0,.18)+25*rise(u,.19,.49)+20*rise(u,.49,.93);
        double y=1.3*breath+4.4*transfer+2.5*ask+3.8*bow;
        p.tilt=.9*sin(t*1.22)-1.8*transfer+3*present-6.2*ask+3.2*bow;
        double rad=toRadians(p.tilt),up=KNEE-HIP,low=ANKLE-KNEE;
        for(int i=0;i<2;i++){
            Leg l=p.legs[i];double a=i==0?.59:.18,b=i==0?.93:.51,f=clamp((u-a)/(b-a),0,1);
            double flight=sin(PI*f);l.lift=f>0&&f<1?(i==0?15:19)*flight*flight:0;
            l.fx=X[i]+38*rise(f,0,1);l.fy=ANKLE-l.lift;
            l.hx=120+p.x+(X[i]-120)*cos(rad);l.hy=HIP+(X[i]-120)*sin(rad);
            double dx=l.fx-l.hx;y=max(y,l.fy-l.hy-sqrt((up+low)*(up+low)-dx*dx));
        }
        p.y=y+.05*transfer;
        for(int i=0;i<2;i++){
            Leg l=p.legs[i];l.hy+=p.y;
            double dx=l.fx-l.hx,dy=l.fy-l.hy,d=hypot(dx,dy),along=(up*up-low*low+d*d)/(2*d),perp=(i==0?-1:1)*sqrt(max(0,up*up-along*along));
            l.kx=l.hx+(along*dx+perp*dy)/d;l.ky=l.hy+(along*dy-perp*dx)/d;
            l.thigh=toDegrees(atan2(l.hx-l.kx,l.ky-l.hy));l.shin=toDegrees(atan2(l.kx-l.fx,l.fy-l.ky));
        }
        double swing=(p.legs[0].lift-p.legs[1].lift)/19;
        p.blend=accents?max(max(pulse(u,0,.18,.86,1),present),max(max(back,look),max(ask,max(saluteHand,bow)))):0;
        p.head=1.15*sin(t*1.70)+4.5*look-5.1*ask-3.6*bow;p.nod=1-.058*ask-.110*bow;p.drop=-.9*breath+2.4*ask+3.3*bow;
        p.armL=2+7*swing+9*ask+4*present;p.foreL=2-7*swing+10*ask+3*present;
        p.armR=-2-54*present+9*back+36*saluteHand-6*swing;p.foreR=-2-52*present+75*saluteHand+8*swing;
        p.gazeX=4.5*look-2.9*ask;p.gazeY=1.4*look+1.7*bow;p.brow=-5.3*ask-1.5*look;
        p.antenna=.9*sin(t*2.1)-2.2*present+3.9*bow;p.clock=pulse(h,0,.18,.80,1);
    }
}
