package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static java.lang.Math.*;

/** Source-clock port of src/modules/aicha/{math,motion}.js. Also usable without Android. */
final class AichaMotion {
    static final double FOCALE=186, HORIZON=134, SOL=231;
    static final double[] REST_MOUTH={1,0,0,0,0,0};
    private static final double MIN_WALK=2.05;
    private static final double[] GLASSES={2.62,3.52,3.94,4.88}, FATIGUE={5.64,6.74,7.18,7.99}, TERMINAL={9.62,10.24,10.73,11.46};
    private static final double[] BLINKS={1.19,4.02,7.15,10.76};
    private static final List<String> TURNS=List.of("presente","confie","marque","ouvre","hoche","presente","nuance","confie");
    private static final int CASE=Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE;
    private static final Pattern HELLO=Pattern.compile("(?:^|[^\\p{L}])(?:bonjour|bonsoir|salut|coucou|hello|hi|hey)(?!\\p{L})",CASE);
    private static final Pattern WALK=Pattern.compile("(?:\\b(?:avance|marchons)\\b|marche vers|walk forward|come closer|pas de côté|step aside|sidestep)",CASE);
    private static final Pattern CONTRAST=Pattern.compile("(?:^|[^\\p{L}])(?:non|pourtant|mais|but)(?!\\p{L})",CASE);
    private static final Pattern YES=Pattern.compile("^\\P{L}*(?:oui|exactement|yes|exactly)(?!\\p{L})",CASE);
    private static final Pattern END=Pattern.compile("([?!])[\\s»”\"')\\]]*$",Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern BREAK=Pattern.compile("([,;:…—–])?\\s+(?=\\S)",Pattern.UNICODE_CHARACTER_CLASS);

    static double bound(double v){return bound(v,0,1);}
    static double bound(double v,double lo,double hi){return min(hi,max(lo,v));}
    static double mix(double a,double b,double u){return a+(b-a)*u;}
    static double focal(double z){return FOCALE/(FOCALE-z);}
    static double square(double x){return x*x;}
    static double smooth(double a,double b,double t){double u=bound((t-a)/(b-a));return u*u*(3-2*u);}
    private static double pulse(double t,double a,double b,double c,double d){return smooth(a,b,t)*(1-smooth(c,d,t));}

    static class Interval {
        final double start,end;
        Interval(double a,double b){start=a;end=b;}
    }
    static <T extends Interval> T at(List<T> windows,double t){return at(windows,t,t);}
    static <T extends Interval> T at(List<T> windows,double t,double debut){
        int lo=-1,hi=windows.size()-1;
        while(lo<hi){int mid=(lo+hi+1)>>>1;if(windows.get(mid).start<=t)lo=mid;else hi=mid-1;}
        return lo>=0&&debut<windows.get(lo).end?windows.get(lo):null;
    }
    static final class Part extends Interval {
        final String text, face;
        final boolean spoken;
        final double speechEnd,force;
        Part(String text,double start,double end,double speechEnd,boolean spoken,String face,double force){
            super(start,end); this.text=text;this.speechEnd=speechEnd<0?end:speechEnd;
            this.spoken=spoken;this.face=face;this.force=force;
        }
    }
    static final class Cue extends Interval {
        final String kind,face;final int side;final double force;
        Cue(double a,double b,String k,int side,String face,double force){super(a,b);kind=k;this.side=side;this.face=face;this.force=force;}
    }
    static final class Walk extends Interval {
        final double stride,distance,depart;final int count,foot;
        Walk(double start,double end,double stride,double depart,int foot){
            super(start,start+min(3.08,end-start));this.stride=stride;this.depart=depart;this.foot=foot;
            count=min(3.08,end-start)>=2.60?4:3;distance=stride*(count-1.18);
        }
    }
    static final class Plan {
        final double duration;
        final List<Cue> cues=new ArrayList<>();final List<Walk> walks=new ArrayList<>();
        final List<Interval> speech=new ArrayList<>(),returns=new ArrayList<>();
        Plan(double ms){duration=max(0,ms/1000);}
    }
    static final Plan REST=new Plan(0);

    private static double[] groups(String text,double start,double span,double a,double b){
        int n=min(240,max(1,(int)ceil((b-a)/2.22)));
        double[] ends=new double[n+1];ends[0]=a;ends[n]=b;if(n==1)return ends;
        var cuts=new ArrayList<double[]>();Matcher m=BREAK.matcher(text);
        while(m.find())cuts.add(new double[]{start+span*m.end()/text.length(),m.group(1)==null?2.1:1});
        double dt=(b-a)/n,margin=min(.36,dt*.21);int j=0;
        for(int i=1;i<n;i++){
            double ideal=a+dt*i,t=ideal,score=margin;
            while(j<cuts.size()&&cuts.get(j)[0]<ideal-margin)j++;
            for(int k=j;k<cuts.size()&&cuts.get(k)[0]<=ideal+margin;k++){
                double[] c=cuts.get(k);double d=abs(c[0]-ideal)*c[1];if(d<score){score=d;t=c[0];}
            }
            ends[i]=t;
        }
        return ends;
    }
    private static Walk gap(Plan p,double start,double end,double voiced,Walk quiet){
        if(end-start<.44)return quiet;
        p.cues.add(new Cue(start,min(start+2.4,end),"ecoute",1,"concentre",.55));
        return quiet==null&&voiced>0&&start>=1.35&&end-start>=MIN_WALK?new Walk(start,end,35,0,1):quiet;
    }
    private static Walk spokenWalk(Plan p,double after,double stride,double depart,int foot){
        double end=p.duration-.48;
        for(Cue c:p.cues)if(c.start>=after&&c.start+MIN_WALK<=end&&TURNS.contains(c.kind))return new Walk(c.start,end,stride,depart,foot);
        return null;
    }
    private static void cue(Plan p,Part seg,String kind,double a,double b,int side){
        if(b-a>=.14)p.cues.add(new Cue(a,b,kind,side,seg.face,seg.force));
    }
    static Plan plan(List<Part> segments,double duration,boolean emotions){
        Plan p=new Plan(duration);double past=0,voiced=0,salutEnd=0;int spoken=0,tour=0;
        boolean waved=false;Walk explicit=null,quiet=null;
        for(Part s:segments){
            double start=bound(s.start/1000,past,p.duration),end=bound(s.end/1000,start,p.duration);
            if(end<=start)continue;
            quiet=gap(p,past,start,voiced,quiet);past=end;
            if(!s.spoken){quiet=gap(p,start,end,voiced,quiet);continue;}
            double speechEnd=bound(s.speechEnd/1000,start,end),span=speechEnd-start,last=min(end,speechEnd+.12);
            if(span>0)p.speech.add(new Interval(start,last));
            if(span<.1){quiet=gap(p,start,end,voiced,quiet);continue;}
            double from=start+min(.09,.08*span);String text=s.text;Matcher m=END.matcher(text);
            String punctuation=emotions&&m.find()?m.group(1):"";
            boolean wave=emotions&&!waved&&spoken<3&&span>=.68&&HELLO.matcher(text.substring(0,min(44,text.length()))).find();
            if(wave){salutEnd=min(last,from+1.86);cue(p,s,"salut",from,salutEnd,-1);from=salutEnd;waved=true;}
            String accent=punctuation.isEmpty()||last-from<.26?"":punctuation.equals("?")?"question":"accent";
            double fin=accent.isEmpty()?last:max(from,last-1.16);
            if(!accent.isEmpty()&&fin-from<.61)fin=from;
            if(fin-from>=.14){
                double[] cuts=groups(text,start,span,from,fin);
                for(int i=1;i<cuts.length;i++,tour++){
                    double a=cuts[i-1],b=cuts[i];int lo=i==1&&!wave?0:(int)round(text.length()*(a-start)/span);
                    int hi=min(text.length(),(int)ceil(text.length()*(b-start)/span));
                    String group=text.substring(min(lo,hi),hi);
                    String k=emotions&&CONTRAST.matcher(group).find()?"nuance":emotions&&YES.matcher(group).find()?"hoche":TURNS.get(tour%TURNS.size());
                    cue(p,s,k,a,b,tour%2==0?1:-1);
                }
            }
            if(!accent.isEmpty()){cue(p,s,accent,fin,last,tour%2==0?1:-1);tour++;}
            if(explicit==null&&emotions&&!wave&&span>=MIN_WALK&&WALK.matcher(text).find())explicit=new Walk(start,speechEnd,35,0,1);
            voiced+=span;quiet=gap(p,last,end,voiced,quiet);spoken++;
        }
        quiet=gap(p,past,p.duration,voiced,quiet);
        if(emotions&&voiced>0){
            Walk first=explicit!=null?explicit:quiet;
            if(first==null&&voiced>=6.2&&p.duration>=7.3)first=spokenWalk(p,max(3.3,salutEnd),33,0,1);
            if(first!=null){p.walks.add(first);Walk next=spokenWalk(p,max(salutEnd,first.end+5.5),first.stride,first.distance,0);if(next!=null)p.walks.add(next);}
        }
        double end=0;
        for(Interval w:p.speech){if(w.start-end>=1.2&&at(p.walks,w.start,w.start-.9)==null)p.returns.add(new Interval(w.start-.82,w.start));end=w.end;}
        return p;
    }

    private static final String[] FAMILIES={
        "content|enthousiaste|rire|fier|soulage|malicieu|reconnaissant|amuse|rassurant|excite|apaise|tendre",
        "surpris|emerveille|curieux", "sceptique|confus|provocateur|degoute|jaloux", "concentre|determine|colere|impatient",
        "triste|fatigue|gene|inquiet|peur|ennuye|nostalgique|intimide|compatissant|pensif|resigne|honteux|contemplatif"
    };
    private static final double[][] EXPRESSIONS={{.61,.21,.24,.15,0,-.21},{.18,.72,.69,.13,0,-.19},{.05,.23,.53,.72,.34,.11},
        {0,.02,.10,-.12,.7,.26},{.03,.43,.08,.19,.25,.54},{0,0,0,0,0,0}};
    private static final Map<String,double[]> FACES=faces();
    private static Map<String,double[]> faces(){Map<String,double[]> f=new java.util.HashMap<>();
        for(int i=0;i<FAMILIES.length;i++)for(String n:FAMILIES[i].split("\\|"))f.put(n,EXPRESSIONS[i]);return f;}
    private static final Map<String,double[][]> GESTURES=Map.of(
        "salut",new double[][]{{28,106,.96,9,0,0,0},{7.2,3.1,-2.1,.17},{.69,.29,.45,0,.10}},
        "presente",new double[][]{{10,64,.93,6,0,.17,0},{11.3,4.1,3.2,.55},{.33,.28,.31,.03,.22}},
        "confie",new double[][]{{-6,93,.81,-5,.88,.12,0},{3.3,5.1,5.5,.11},{.29,.48,.17,.12,-.23}},
        "marque",new double[][]{{9,54,.86,4,0,.1,.94},{6.5,2.7,3.6,.18},{.19,.39,.48,.12,.30}},
        "ouvre",new double[][]{{9,68,.92,4,0,.83,0},{5.5,-3.9,-5.3,-.37},{.53,.41,.52,0,.12}},
        "hoche",new double[][]{{3,29,.53,2,0,.24,0},{3.2,2.2,11.8,.26},{.32,.22,.17,.03,.10}},
        "nuance",new double[][]{{-2,61,.72,-6,.80,.23,0},{12,4.2,-2.7,-.32},{.07,.21,.62,.30,.53}},
        "question",new double[][]{{8,46,.74,5,0,.45,0},{9.9,7.1,-6.7,-.36},{.21,.76,.64,.08,.36}},
        "accent",new double[][]{{11,58,.88,5,0,.42,0},{7.2,-3.9,7.1,.18},{.49,.51,.54,0,.21}},
        "ecoute",new double[][]{{},{15.2,5.8,6.6,.78},{.06,.32,.24,.45,.18}});
    private static final class Acting {
        Cue cue;double face,gazeX,gazeY,neck,tilt,yaw,pitch,weight,hip,chest,smile,inner,outer,focus,asym;
        double phase(){return tilt+neck*1.65+yaw*.21+pitch*.25;}
    }
    private static Acting acting(Plan p,double t,double gain){
        Acting a=new Acting();Cue c=a.cue=at(p.cues,t);double span=c==null?1:c.end-c.start,u=c==null?-1:(t-c.start)/span;
        int side=c==null?1:c.side;String kind=c==null?"":c.kind;
        double[][] g=GESTURES.getOrDefault(kind,GESTURES.get("ecoute"));double[] head=g[1],face=g[2];
        double intensity=gain*(.22+.78*smooth(.14,.91,span)),look=intensity*pulse(u,0,.155,.66,.95);
        double neck=intensity*pulse(u,min(.18,.068/span),.32,.61,.96),skull=intensity*pulse(u,min(.25,.105/span),.39,.65,1);
        double support=intensity*pulse(u,.015,.305,.65,.98),turn=kind.equals("nuance")?2*smooth(.24,.63,u)-1:1;
        double nod=kind.equals("hoche")?skull*(1-.69*pulse(u,.40,.58,.60,.77))-intensity*1.9/11.8*pulse(u,.13,.26,.29,.39):skull;
        boolean listen=kind.equals("ecoute");a.face=pulse(u,.04,.255,.68,1);
        a.gazeX=bound(side*look*(listen?1.8:1.35)*turn,-1.8,1.8);a.gazeY=look*head[3];
        a.neck=side*neck*(listen?1.94:1.41)*turn;a.tilt=side*skull*head[1];a.yaw=bound(side*skull*head[0]*turn,-19,19);a.pitch=nod*head[2];
        a.weight=side*2.66*support;a.hip=-.93*side*support;a.chest=(g[0].length>4&&g[0][4]>.4?-1.33:1.25)*side*support;
        a.smile=a.face*face[0];a.inner=a.face*face[1];a.outer=a.face*face[2];a.focus=a.face*face[3];a.asym=side*a.face*face[4];return a;
    }
    private static void hand(Cue c,Cue next,double t,double gain,double[][] hands){
        double[] v=GESTURES.get(c.kind)[0];if(v.length==0)return;
        double span=c.end-c.start,u=(t-c.start)/span;
        double end=1+(next!=null&&next.start==c.end&&GESTURES.get(next.kind)[0].length>0?min(.36/span,min(.28,(next.end-c.end)/span)):0);
        if(u>=end)return;
        double force=gain*smooth(.24,.88,span),open=bound(force),h=open*pulse(u,.16,.45,.66,end);
        double late=force*v[5]*pulse(u,.27,.58,.71,end);int side=c.side<0?0:1;
        double[] m=hands[side],o=hands[1-side];
        m[0]+=v[0]*force*pulse(u,.02,.30,.54,end);m[1]+=v[1]*force*pulse(u,.07,.40+.05*v[4],.63,end);m[2]+=v[2]*h;
        m[3]+=v[3]*h*(c.kind.equals("salut")?sin((u-.4)*PI*6):1);m[4]+=v[4]*smooth(0,.6,force)*pulse(u,0,.26,.72,end);
        m[5]+=v[6]*open*pulse(u,.32,.48,.58,.78);o[0]+=7*late;o[1]+=38*late;o[2]+=.67*late;o[3]-=3*late;
    }
    private static double[][] hands(Plan p,Cue c,double t,double gain){
        double[][] v=new double[2][6];
        if(c!=null&&gain!=0&&GESTURES.get(c.kind)[0].length>0){hand(c,at(p.cues,c.end),t,gain,v);
            Cue last=at(p.cues,c.start-.0001);if(last!=null&&last.end==c.start)hand(last,c,t,gain,v);}
        return v;
    }
    static final class Foot {
        final double x,z,lift,pitch,roll;final boolean grounded;
        Foot(double x,double z,double lift,double pitch,double roll,boolean grounded){this.x=x;this.z=z;this.lift=lift;this.pitch=pitch;this.roll=roll;this.grounded=grounded;}
    }
    private static final Foot CONTACT=new Foot(0,0,0,0,0,true);
    private static final class Support {
        Foot left=CONTACT,right=CONTACT;double avance,mix,weight,hip,settle,turn;
    }
    private static double progression(double u){
        double s=bound((u-.055)/.90),x=min(s,1-s),r=.23,q=min(1,x/r);
        double d=(r*q*q*q*(1-q/2)+max(0,x-r))/(1-r);return s>.5?1-d:d;
    }
    private static Support supports(Plan p,double t,double gain){
        Support s=new Support();if(p.walks.isEmpty())return s;
        Walk m=p.walks.size()>1&&t>=p.walks.get(1).start?p.walks.get(1):p.walks.get(0);
        double u=bound((t-m.start)/(m.end-m.start)),amp=min(gain,1.1),base=m.depart*amp;
        if(amp==0||u==0||u==1){s.avance=base+(u==1?m.distance*amp:0);return s;}
        double stride=m.stride*amp,distance=m.distance*amp,d=distance*progression(u),dt=.8/m.count;
        double mix=pulse(u,.02,.18,.83,1),a=PI*((u-.12)/dt-.76),cycle=amp*pulse(u,.02,.18,.72,.97)*(m.foot==1?1:-1);
        double inside=3.3*smooth(20,29,stride);Foot[] feet={new Foot(0,-d,0,0,0,true),new Foot(0,-d,0,0,0,true)};
        for(int i=0;i<m.count;i++){
            int side=(m.foot+i)%2;boolean close=i==m.count-1;double off=.12+i*dt,on=off+.76*dt,push=amp*(close?12:18),hit=amp*(close?6:11);
            if(u<off){Foot f=feet[side];feet[side]=new Foot(f.x,f.z,f.lift,f.pitch+push*smooth(off-.41*dt,off,u),f.roll,f.grounded);continue;}
            double k=bound((u-off)/(on-off)),from=max(0,i-1.18)*stride,to=min((i+.82)*stride,distance);
            double line=inside*((i>1?1-smooth(0,.22,k):0)+(i<m.count-2?smooth(.75,1,k):0));
            double lift=amp*(close?.72:1)*(4.65*pulse(k,0,.25,.36,.67)+2.05*pulse(k,.14,.40,.76,1));
            double pitch=k<1?push*(1-smooth(.11,.51,k))-hit*smooth(.53,.95,k):-hit*(1-smooth(on,on+.31*dt,u));
            feet[side]=new Foot(side==1?-line:line,mix(from,to,smooth(0,1,k))-d,lift,pitch,0,k==0||k==1);
        }
        s.left=feet[0];s.right=feet[1];s.avance=base+d;s.mix=mix;s.weight=4.32*cycle*sin(a);s.hip=-4.55*cycle*sin(a-.23);
        s.settle=amp*mix*(.61+1.42*square(cos(a-.14)));s.turn=cycle*cos(a);return s;
    }
    private static double blink(double t){double q=t%13.55,v=0;for(double b:BLINKS)v=max(v,pulse(q,b-.061,b,b+.019,b+.132));return v;}
    private static double free(Plan p,double k,double q,double cycle,double[] fen){
        if(k==0)return 0;double u=pulse(q,fen[0],fen[1],fen[2],fen[3]),a=cycle+fen[0]-.08,b=cycle+fen[3]+.08;
        return u!=0&&at(p.speech,b,a)==null&&at(p.walks,b,a)==null&&at(p.returns,b,a)==null?u:0;
    }
    static final class Pose {
        double avance,breath,weight,settle,hip,chest,buste,neck,tilt,yaw,pitch,gazeX,gazeY,hairL,hairR,lag,marche,balancier,lacet;
        double armL,armR,flexL,flexR,wristL,wristR,openL,openR,foldL,foldR,indexL,indexR,lunettes,ajuste,blinkL,blinkR,smile,inner,outer,asym,focus;
        Foot stepL,stepR;double[] mouth;
    }
    static Pose pose(Plan p,double ms,double gain,boolean reduced,String expression,double[] mouth,double wait,boolean glasses){
        double t=bound(ms/1000,0,p.duration),k=reduced?0:bound(gain,0,1.3);
        Acting a=acting(p,t,k);Support s=supports(p,t,k);
        double vie=t+(reduced?0:wait/1000),activity=k*smooth(0,.32,vie),foyer=sin(vie*.91-.32)+.27*sin(vie*1.63);
        Interval enter=at(p.returns,t);double redresse=enter==null?0:k*pulse(t-enter.end,-.82,-.42,-.25,0);
        double libres=(1-.83*s.mix)*(1-.76*redresse),main=1-.94*s.mix,balancier=11.9*(.97*s.turn+.055*s.weight);
        double inertia=bound((acting(p,t-.158,k).phase()-a.phase())*.94,-5.1,5.1);boolean forced=!expression.isEmpty();
        double[] face=FACES.getOrDefault(forced?expression:a.cue==null?"neutre":a.cue.face,EXPRESSIONS[5]);
        double env=forced?1:a.face*(a.cue==null?0:a.cue.force),accent=forced||reduced?0:1;
        double[][] hands=hands(p,a.cue,t,k);double[] l=hands[0],r=hands[1];
        double q=vie%17.4,cycle=vie-q,coup=activity*square(1-s.mix)*(1-bound(redresse))*pulse(q,.74,1,1.58,2.07),tete=square(coup);
        double lunettes=glasses?free(p,k,q,cycle,GLASSES):0,appui=free(p,k,q,cycle,FATIGUE),fatigue=k*appui,talon=k*smooth(.28,1,appui);
        double relache=q>FATIGUE[2]?bound(fatigue-talon):0,regard=k*free(p,k,q,cycle,TERMINAL),tourne=regard*smooth(9.85,10.42,q),bassin=s.hip+1.95*fatigue;
        double lids=max(.58*talon,.62*relache);Pose v=new Pose();
        v.avance=s.avance;v.breath=activity*libres*(.52*sin(1.83*vie-.29)+.16*sin(2.43*vie+.30))+5.2*talon-8*relache+4.6*redresse;
        v.weight=s.weight+(a.weight+activity*1.26*foyer)*libres-.5*lunettes-4.6*fatigue;v.settle=s.settle+.26*activity*(1-cos(vie*1.19))+1.9*fatigue;
        v.hip=(a.hip-activity*.58*foyer)*libres+bassin;v.chest=(a.chest+activity*.74*foyer)*libres-.83*bassin;v.buste=-.30*s.weight;
        v.neck=a.neck*libres+.64*tete+1.35*tourne;v.tilt=a.tilt*libres+activity*libres*.56*sin(vie*1.51)+1.15*tete-.75*lunettes;
        v.yaw=bound(a.yaw*libres+1.25*s.turn+2.4*tete+14.6*tourne,-19,19);
        v.pitch=bound(a.pitch*libres+.29*s.settle-.96*s.mix+1.4*lunettes+3.4*fatigue-6.6*redresse,-13,13);
        v.gazeX=bound(a.gazeX*libres+coup+1.72*regard,-1.8,1.8);
        v.gazeY=a.gazeY*libres+env*face[5]*(reduced?0:.66)+.75*talon+1.3*relache+.45*regard-.55*redresse;
        v.hairL=inertia*libres+activity*.24*sin(vie*2.3)+1.4*s.turn;v.hairR=.79*inertia*libres+activity*.29*sin(vie*2.11+.5)+1.2*s.turn;
        v.lag=-.73*s.turn-.12*a.weight*libres;v.marche=s.mix;v.balancier=balancier;v.lacet=5.2*s.turn;
        v.armL=.55+l[0]*main-1.4*s.mix-.16*s.weight;v.armR=.25+r[0]*main-s.mix+.16*s.weight;
        v.flexL=bound(2.4+l[1]*main+7.1*s.mix+2.7*s.turn,0,112);v.flexR=bound(2.5+r[1]*main+6.7*s.mix-2.7*s.turn,0,99);
        v.wristL=bound(-.9+l[3]*main-1.2*s.mix+.43*s.weight,-14,14);v.wristR=bound(.3+r[3]*main-1.5*s.mix-.41*s.weight,-14,14);
        v.openL=l[2]*main;v.openR=r[2]*main;v.foldL=l[4]*main;v.foldR=r[4]*main;v.indexL=l[5]*main;v.indexR=r[5]*main;
        v.lunettes=lunettes;v.ajuste=-.9*lunettes*pulse(q,GLASSES[1],3.78,GLASSES[2],4.23);
        v.blinkL=reduced?0:max(lids,blink(vie));v.blinkR=reduced?0:max(lids,blink(vie-.009));
        v.stepL=s.left;v.stepR=talon!=0?new Foot(0,0,0,22*talon,-10*talon,true):s.right;
        v.smile=bound(env*face[0]+accent*a.smile,0,.94);v.inner=bound(env*face[1]+accent*a.inner,0,1.06);v.outer=bound(env*face[2]+accent*a.outer,0,1.05);
        v.asym=bound(env*face[3]+accent*a.asym,-.84,.84);v.focus=bound(env*face[4]+accent*a.focus);v.mouth=mouth;return v;
    }
}
