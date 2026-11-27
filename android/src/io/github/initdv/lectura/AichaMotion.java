package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static java.lang.Math.*;

/** Source-clock port of src/modules/aicha/{math,motion}.js. Also usable without Android. */
final class AichaMotion {
    static final double FOCALE=186, HORIZON=134, SOL=231;
    static final double[] REST_MOUTH={1,0,0,0,0,0};
    private static final double MIN_WALK=2.05;
    private static final double[] GLASSES={2.62,3.52,3.94,4.88}, FATIGUE={5.64,6.74,7.18,7.99}, TERMINAL={9.62,10.24,10.73,11.46}, HIP_REST={12.08,13.15,15.54,16.86};
    private static final double[] BLINKS={1.19,4.02,7.15,10.76};
    private static final List<String> TURNS=List.of("presente","confie","marque","ouvre","hoche","presente","nuance","confie"), FIGURES=List.of("illustre","explique","enumere","compare","rejouit");
    private static final int CASE=Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE;
    private static final Pattern HELLO=Pattern.compile("(?:^|[^\\p{L}])(?:bonjour|bonsoir|salut|coucou|hello|hi|hey)(?!\\p{L})",CASE);
    private static final Pattern WALK=Pattern.compile("(?:m['’]avance|\\bmarchons\\b|avance (?:vers|avec)|marche vers|walk forward|come closer|pas de côté|step aside|sidestep)",CASE);
    private static final Pattern CONTRAST=Pattern.compile("(?:^|[^\\p{L}])(?:non|pourtant|mais|but)(?!\\p{L})",CASE);
    private static final Pattern YES=Pattern.compile("^\\P{L}*(?:oui|exactement|yes|exactly)(?!\\p{L})",CASE);
    private static final Pattern CHEERS=Pattern.compile("^\\P{L}*(?:bravo|youpi|hourra|ta[- ]?da|hooray|hurray|et voilà)(?!\\p{L})",CASE);
    // Android's Pattern rejects UNICODE_CHARACTER_CLASS. Match the Web's \s explicitly
    // (including NBSP and BOM, but not NEL) for cue boundaries and final punctuation.
    private static final String SPACE="\\x09-\\x0d\\p{Z}\\uFEFF";
    private static final Pattern END=Pattern.compile("([?!])["+SPACE+"»”\"')\\]]*\\z");
    private static final Pattern BREAK=Pattern.compile("([,;:…—–])?["+SPACE+"]+(?=[^"+SPACE+"])");

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
        final boolean spoken,manual,linked;
        final double speechEnd;
        final int offset;
        final int[] cursor;
        final AichaDirection.Notes notes;
        Part(String text,double start,double end,double speechEnd,boolean spoken,String face,
             boolean manual,boolean linked,AichaDirection.Notes notes,int offset,int[] cursor){
            super(start,end);this.text=text;this.speechEnd=speechEnd<0?end:speechEnd;
            this.spoken=spoken;this.face=face;this.manual=manual;this.linked=linked;
            this.notes=notes;this.offset=offset;this.cursor=cursor;
        }
    }

    static final class Cue extends Interval {
        final String kind,face;final int side;final double force;
        int hand; // 0: eyes/head only; -1/+1: leading hand
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
        final List<AichaFaces.Window> moods=new ArrayList<>();
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
    private static Walk gap(Plan p,double start,double end,double voiced,Walk quiet,boolean emotions){
        if(end-start<.44)return quiet;
        p.cues.add(new Cue(start,min(start+2.4,end),"ecoute",1,emotions?"concentre":"neutre",.55));
        return quiet==null&&voiced>0&&start>=1.35&&end-start>=MIN_WALK?new Walk(start,end,35,0,1):quiet;
    }
    private static Walk spokenWalk(Plan p,List<Cue> figures,double after,double stride,double depart,int foot){
        double end=p.duration-.48;
        for(Cue c:p.cues)if(c.start>=after&&c.start+MIN_WALK<=end&&TURNS.contains(c.kind)&&at(figures,min(end,c.start+3.08),c.start)==null)
            return new Walk(c.start,end,stride,depart,foot);
        return null;
    }
    private static void cue(Plan p,Part seg,String kind,double a,double b,int side){
        if(b-a>=.14)p.cues.add(new Cue(a,b,kind,side,seg.face,1));
    }
    private static final class Beat extends Interval {
        final String kind;
        Beat(double a,double b,String kind){super(a,b);this.kind=kind;}
    }
    private static List<Beat> semantic(AichaFaces.Phrase p,double from,double end){
        var beats=new ArrayList<Beat>();var marks=p.part.notes.gestures;double previous=-1;
        for(int i=0;i<marks.size();i++){
            var hit=marks.get(i);double at=p.time(hit.pos);
            if(at<from-.57)continue;
            double begin=max(from,min(at-.36,end-.72)),a=max(begin,previous+.14);
            if(a>begin+.25)continue;
            double life=hit.kind.equals("compare")?1.68:hit.kind.equals("illustre")?1.54:hit.kind.equals("enumere")?1.05:1.36;
            double b=min(end,min(a+life,i+1<marks.size()?max(a+.79,p.time(marks.get(i+1).pos)-.50):end));
            if(b-a>=.60){beats.add(new Beat(a,b,hit.kind));previous=b;}
        }
        return beats;
    }
    private static int generic(Plan p,Part seg,double start,double span,double from,double end,
                               int tour,boolean first,boolean hasBeats,boolean emotions){
        if(end-from<(hasBeats?.44:.14))return tour;
        String text=seg.text;double[] cuts=groups(text,start,span,from,end);
        for(int i=1;i<cuts.length;i++,tour++){
            double a=cuts[i-1],b=cuts[i];int lo=i==1&&first?0:(int)round(text.length()*(a-start)/span);
            int hi=min(text.length(),(int)ceil(text.length()*(b-start)/span));
            String group=text.substring(min(lo,hi),hi);
            String k=emotions&&CONTRAST.matcher(group).find()?"nuance":emotions&&YES.matcher(group).find()?"hoche":TURNS.get(tour%TURNS.size());
            cue(p,seg,k,a,b,tour%2==0?1:-1);
        }
        return tour;
    }
    static Plan plan(List<Part> segments,double duration,boolean emotions){
        Plan p=new Plan(duration);double past=0,voiced=0,salutEnd=0;int spoken=0,tour=0;
        boolean waved=false,previousVoice=false;Walk explicit=null,quiet=null;
        var faces=new ArrayList<AichaFaces.Phrase>();
        for(Part s:segments){
            boolean linked=previousVoice&&s.linked;previousVoice=false;
            double start=bound(s.start/1000,past,p.duration),end=bound(s.end/1000,start,p.duration);
            if(end<=start)continue;
            quiet=gap(p,past,start,voiced,quiet,emotions);past=end;
            if(!s.spoken){quiet=gap(p,start,end,voiced,quiet,emotions);continue;}
            double speechEnd=bound(s.speechEnd/1000,start,end),span=speechEnd-start,last=min(end,speechEnd+.12);
            if(span>0)p.speech.add(new Interval(start,last));
            if(span<.1){quiet=gap(p,start,end,voiced,quiet,emotions);continue;}
            var phrase=new AichaFaces.Phrase(s,start,last,speechEnd,linked);faces.add(phrase);previousVoice=true;
            double from=start+min(.09,.08*span);String text=s.text;Matcher m=END.matcher(text);
            String punctuation=emotions&&m.find()?m.group(1):"";
            boolean wave=emotions&&!waved&&spoken<3&&span>=.68&&HELLO.matcher(text.substring(0,min(44,text.length()))).find();
            if(wave){
                double pivot=s.notes.gestures.isEmpty()?last:max(from+.77,phrase.time(s.notes.gestures.get(0).pos)-.18);
                salutEnd=min(last,min(from+1.86,pivot));cue(p,s,"salut",from,salutEnd,-1);from=salutEnd;waved=true;
            }
            var beats=semantic(phrase,from+(wave?.14:0),last);boolean hasBeats=!beats.isEmpty();
            for(Beat beat:beats){
                tour=generic(p,s,start,span,from,beat.start,tour,!wave&&from-start<=.1,true,emotions);
                cue(p,s,beat.kind,beat.start,beat.end,tour++%2==0?1:-1);from=beat.end;
            }
            String accent=last-from<(hasBeats?.66:.26)?"":punctuation.equals("?")?"question":emotions&&CHEERS.matcher(text).find()?"rejouit":punctuation.isEmpty()?"":"accent";
            double fin=accent.isEmpty()?last:max(from,last-(accent.equals("rejouit")?1.64:1.16));
            if(!accent.isEmpty()&&fin-from<.61)fin=from;
            tour=generic(p,s,start,span,from,fin,tour,!wave&&!hasBeats,hasBeats,emotions);
            if(!accent.isEmpty()){cue(p,s,accent,fin,last,tour%2==0?1:-1);tour++;}
            if(explicit==null&&emotions&&!wave&&span>=MIN_WALK&&WALK.matcher(text).find())explicit=new Walk(start,speechEnd,35,0,1);
            voiced+=span;quiet=gap(p,last,end,voiced,quiet,emotions);spoken++;
        }
        quiet=gap(p,past,p.duration,voiced,quiet,emotions);
        List<Cue> figures=new ArrayList<>();for(Cue c:p.cues)if(FIGURES.contains(c.kind))figures.add(c);
        if(emotions&&voiced>0){
            Walk first=explicit!=null?explicit:quiet;
            if(first==null&&voiced>=6.2&&p.duration>=7.3)first=spokenWalk(p,figures,max(3.3,salutEnd),33,0,1);
            if(first!=null){p.walks.add(first);Walk next=spokenWalk(p,figures,max(salutEnd,first.end+5.5),first.stride,first.distance,0);if(next!=null)p.walks.add(next);}
        }
        double end=0;
        for(Interval w:p.speech){if(w.start-end>=1.2&&at(p.walks,w.start,w.start-.9)==null)p.returns.add(new Interval(w.start-.82,w.start));end=w.end;}
        // Leave room for semantic figures, but do not let them compete with a walk.
        double rest=0;int side=1,next=0;
        for(Cue c:p.cues){
            while(next<figures.size()&&figures.get(next).start<c.end)next++;
            boolean figure=FIGURES.contains(c.kind),walking=false;
            double free=figure||c.kind.equals("salut")?c.end+.14:max(c.end+.28,c.start+1.65);
            boolean reserved=!figure&&next<figures.size()&&figures.get(next).start<free;
            if(figure)for(Walk w:p.walks)if(w.start<c.end&&c.start<w.end){walking=true;break;}
            c.hand=c.kind.equals("salut")?-1:!reserved&&!walking&&!c.kind.equals("ecoute")&&!c.kind.equals("hoche")
                &&c.end-c.start>=(c.kind.equals("rejouit")?.46:.56)&&c.start>=rest-1e-7?side:0;
            if(c.hand!=0){rest=free;side=-c.hand;}
        }
        AichaFaces.plan(p.moods,faces);
        return p;
    }

    static final class Visages {
        private static final double[] NEUTRE=new double[10];
        private final Map<String,double[]> profils=new java.util.HashMap<>();
        Visages(JSONObject table){table.keys().forEachRemaining(n->{
            var row=table.optJSONArray(n);if(row==null||row.length()!=10)return;
            double[] v=new double[10];for(int i=0;i<v.length;i++)v[i]=row.optDouble(i,0);
            profils.put(n,v);
        });}
        double[] get(String nom){return profils.getOrDefault(nom,NEUTRE);}
    }
    private static final Map<String,double[][]> GESTURES=Map.ofEntries(
        Map.entry("salut",new double[][]{{16,78,.94,6,0,0,0},{7.2,3.1,-2.1,.17}}),
        Map.entry("presente",new double[][]{{7,43,.90,8,0,0,0},{11.3,4.1,3.2,.55}}),
        Map.entry("confie",new double[][]{{0,41,.66,-3,.77,0,0},{3.3,5.1,5.5,.11}}),
        Map.entry("marque",new double[][]{{5,34,.82,3,0,0,.9},{6.5,2.7,3.6,.18}}),
        Map.entry("ouvre",new double[][]{{6,44,.90,8,0,.75,0},{5.5,-3.9,-5.3,-.37}}),
        Map.entry("hoche",new double[][]{{},{3.2,2.2,11.8,.26}}),
        Map.entry("nuance",new double[][]{{0,34,.67,-3,.66,.12,0},{12,4.2,-2.7,-.32}}),
        Map.entry("question",new double[][]{{4,28,.68,3,0,.15,0},{9.9,7.1,-6.7,-.36}}),
        Map.entry("accent",new double[][]{{5,36,.80,3,0,.22,0},{7.2,-3.9,7.1,.18}}),
        Map.entry("illustre",new double[][]{{8,52,.98,17,.10,0,0},{13,3.6,3,.53},{27,-4.4}}),
        Map.entry("explique",new double[][]{{9,54,.98,14,.08,.55,0},{9,3.1,3.8,.37},{15,-3.1}}),
        Map.entry("enumere",new double[][]{{7,50,.76,9,.18,0,.98},{6,3.2,6.1,.18},{11,-2.1}}),
        Map.entry("compare",new double[][]{{8,60,.96,17,.09,.98,0},{15,4.2,4.4,.46},{23,5.0}}),
        Map.entry("rejouit",new double[][]{{17,77,.98,11,.05,1,0},{9,-6.4,-8.3,-.48},{19,3.5}}),
        Map.entry("ecoute",new double[][]{{},{15.2,5.8,6.6,.78}}));
    private static final class Acting {
        Cue cue;double face,gazeX,gazeY,neck,tilt,yaw,pitch,weight,hip,chest,torse,appui,ressort;
        double phase(){return tilt+neck*1.65+yaw*.21+pitch*.25;}
    }
    private static Acting acting(Plan p,double t,double gain){
        Acting a=new Acting();Cue c=a.cue=at(p.cues,t);double span=c==null?1:c.end-c.start,u=c==null?-1:(t-c.start)/span;
        String kind=c==null?"":c.kind;boolean compare=kind.equals("compare");
        double[][] g=GESTURES.getOrDefault(kind,GESTURES.get("ecoute"));double[] head=g[1],body=g.length>2?g[2]:null;
        int side=c==null?1:body!=null&&c.hand!=0?c.hand:c.side;
        double intensity=gain*(.22+.78*smooth(.14,.91,span)),look=intensity*pulse(u,0,.155,.66,.95);
        double neck=intensity*pulse(u,min(.18,.068/span),.32,.61,.96),skull=intensity*pulse(u,min(.25,.105/span),.39,.65,1);
        double support=a.appui=intensity*pulse(u,.015,.305,.65,.98);
        double turn=compare?1-2*smooth(.49,.76,u):kind.equals("nuance")?2*smooth(.24,.63,u)-1:1;
        double eyes=compare?1-2*smooth(.38,.63,u):turn;
        double nod=kind.equals("hoche")?skull*(1-.69*pulse(u,.40,.58,.60,.77))-intensity*1.9/11.8*pulse(u,.13,.26,.29,.39):skull;
        boolean listen=kind.equals("ecoute");a.face=pulse(u,.04,.255,.68,1);
        a.gazeX=bound(side*look*(listen?1.8:1.35)*eyes,-1.8,1.8);a.gazeY=look*head[3];
        a.neck=side*neck*(listen?1.94:1.41)*turn;a.tilt=side*skull*head[1]*turn;a.yaw=bound(side*skull*head[0]*turn,-19,19);a.pitch=nod*head[2];
        a.weight=side*support*(compare?turn:1)*(body==null?2.66:body[1]);a.hip=-.35*a.weight;
        a.chest=body!=null?.42*a.weight:(g[0].length>4&&g[0][4]>.4?-1.33:1.25)*side*support;
        a.torse=(body==null?10:body[0])*side*support*turn;
        a.ressort=kind.equals("rejouit")?intensity*(2.7*pulse(u,.025,.21,.31,.53)+3.15*pulse(u,.02,.24,.69,.99)):0;
        return a;
    }
    private static double[][] hands(Cue c,double t,double gain){
        double[][] hands=new double[2][7];
        if(c==null||c.hand==0||gain==0)return hands;
        double[] v=GESTURES.get(c.kind)[0];double span=c.end-c.start,u=(t-c.start)/span;
        boolean play=c.kind.equals("rejouit"),compare=c.kind.equals("compare");
        double force=min(gain,1.12)*smooth(.34,play?.80:.91,span),open=bound(force),h=open*pulse(u,.16,.46,.65,1);
        double late=force*v[5]*pulse(u,play?.13:.29,play?.49:.64,.72,1);int side=c.hand<0?0:1;
        double[] m=hands[side],o=hands[1-side];
        m[0]=v[0]*force*pulse(u,.025,.33,.55,1);m[1]=v[1]*force*pulse(u,.07,.42+.05*v[4],compare?.51:.63,1)*(compare?1-.30*smooth(.49,.73,u):1);
        m[2]=v[2]*h*(compare?1-.30*smooth(.48,.72,u):1);
        m[3]=v[3]*h*(c.kind.equals("salut")?sin((u-.4)*PI*6):1);m[4]=v[4]*smooth(0,.6,force)*pulse(u,0,.26,.72,1);
        m[5]=v[6]*open*pulse(u,.32,.48,.58,.78);o[0]=(play?8:compare?5:3)*late;o[1]=(play?40:compare?33+20*smooth(.52,.76,u):27)*late;
        o[2]=(play||compare?.88:.67)*late;o[3]=(play?10:compare?17:-3)*late;o[4]=(play?.12:compare?.16:0)*late;
        if(c.kind.equals("illustre"))o[6]=bound(force*1.25)*pulse(u,.015,.33,.69,.96);
        return hands;
    }
    static final class Foot {
        final double x,z,lift,pitch,roll;final boolean grounded;
        Foot(double x,double z,double lift,double pitch,double roll,boolean grounded){this.x=x;this.z=z;this.lift=lift;this.pitch=pitch;this.roll=roll;this.grounded=grounded;}
    }
    private static final Foot CONTACT=new Foot(0,0,0,0,0,true);
    private static Foot anchor(Foot f,double offset){return offset==0?f:new Foot(f.x+2.2*offset,f.z+5.2*offset,f.lift,f.pitch,f.roll,f.grounded);}
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
        double avance,breath,weight,settle,hip,chest,buste,torse,neck,tilt,yaw,pitch,gazeX,gazeY,hairL,hairR,lag,marche,balancier,lacet;
        double armL,armR,flexL,flexR,wristL,wristR,openL,openR,foldL,foldR,indexL,indexR,hancheL,hancheR,reposHanche,ourlet,lunettes,ajuste,blinkL,blinkR,smile,inner,outer,asym,focus,lids,levres;
        Foot stepL,stepR;double[] mouth;
    }
    static Pose pose(Plan p,double ms,double gain,boolean reduced,String expression,double[] mouth,double wait,boolean glasses,Visages visages){
        double t=bound(ms/1000,0,p.duration),k=reduced?0:bound(gain,0,1.3);
        Acting a=acting(p,t,k);Support s=supports(p,t,k);
        double vie=t+(reduced?0:wait/1000),activity=k*smooth(0,.32,vie),foyer=sin(vie*.91-.32)+.27*sin(vie*1.63);
        Interval enter=at(p.returns,t);double redresse=enter==null?0:k*pulse(t-enter.end,-.82,-.42,-.25,0);
        double libres=(1-.83*s.mix)*(1-.76*redresse),main=1-.94*s.mix,balancier=11.9*(.97*s.turn+.055*s.weight);
        double inertia=bound((acting(p,t-.158,k).phase()-a.phase())*.94,-5.1,5.1);boolean forced=!expression.isEmpty();
        AichaFaces.Window mood=at(p.moods,t);
        AichaFaces.Frame played=AichaFaces.sample(mood,t,expression,a.cue,visages);double[] face=played.face;
        double env=forced?1:bound(played.force*(mood!=null?mood.envelope(t):a.face),0,1.1);
        double jeu=reduced?0:env;
        Interval phrase=at(p.speech,t);double silence=1;
        if(phrase!=null){double span=phrase.end-phrase.start;
            silence-=pulse(t,phrase.start,phrase.start+min(.045,.30*span),phrase.end-min(.065,.38*span),phrase.end);
        }
        double[][] hands=hands(a.cue,t,k);double[] l=hands[0],r=hands[1];
        double q=vie%17.4,cycle=vie-q,coup=activity*square(1-s.mix)*(1-bound(redresse))*pulse(q,.74,1,1.58,2.07),tete=square(coup);
        double attire=free(p,k,q,cycle,GLASSES),lunettes=glasses?attire:0,ourlet=glasses?0:bound(.88*k)*attire;
        double hanche=bound(1.34*k)*free(p,k,q,cycle,HIP_REST),appui=free(p,k,q,cycle,FATIGUE),fatigue=k*appui,talon=k*smooth(.28,1,appui);
        double relache=q>FATIGUE[2]?bound(fatigue-talon):0,regard=k*free(p,k,q,cycle,TERMINAL),tourne=regard*smooth(9.85,10.42,q),bassin=s.hip+1.95*fatigue;
        double repos=activity*(.64+.36*cos(.51*vie-.23))*(1-.84*bound(a.appui)),dehanche=2.35*repos*(1-appui)+4.4*hanche;
        double torse=bound((a.torse+13*repos-27*hanche)*(1-s.mix)*(1-lunettes)*(1-.64*bound(redresse)),-33,33);
        double lids=max(.58*talon,.62*relache);Pose v=new Pose();
        v.avance=s.avance;v.breath=activity*libres*(.52*sin(1.83*vie-.29)+.16*sin(2.43*vie+.30))+5.2*talon-8*relache+4.6*redresse;
        v.weight=s.weight+(a.weight+activity*.88*foyer+dehanche)*libres-.5*lunettes-4.6*fatigue;
        v.settle=s.settle+.26*activity*(1-cos(vie*1.19))+1.9*fatigue+(1.1*activity+1.2*hanche+a.ressort)*(1-s.mix);
        v.hip=(a.hip-activity*.46*foyer-.45*dehanche)*libres+bassin;v.chest=(a.chest+activity*.62*foyer+.56*dehanche)*libres-.83*bassin;
        v.buste=-.30*s.weight;v.torse=torse;
        v.neck=a.neck*libres+.64*tete+1.35*tourne;v.tilt=a.tilt*libres+activity*libres*.56*sin(vie*1.51)+1.15*tete-.75*lunettes+2.15*hanche;
        v.yaw=bound(a.yaw*libres+1.25*s.turn+2.4*tete+14.6*tourne-6.4*hanche,-19,19);
        v.pitch=bound(a.pitch*libres+.29*s.settle-.96*s.mix+1.4*lunettes+3.4*fatigue-6.6*redresse+jeu*(face[9]-1.7*played.lift)*(1-bound(redresse)),-13,13);
        v.gazeX=bound(a.gazeX*libres+coup+1.72*regard+jeu*face[6],-1.8,1.8);
        v.gazeY=a.gazeY*libres+jeu*(face[7]-.52*played.lift)+.75*talon+1.3*relache+.45*regard-.55*redresse;
        v.hairL=inertia*libres+activity*.24*sin(vie*2.3)+1.4*s.turn;v.hairR=.79*inertia*libres+activity*.29*sin(vie*2.11+.5)+1.2*s.turn;
        v.lag=-.73*s.turn-.12*a.weight*libres;v.marche=s.mix;v.balancier=balancier;v.lacet=5.2*s.turn-.42*torse;
        v.hancheL=l[6]*main;v.hancheR=max(r[6]*main,hanche);v.reposHanche=hanche;v.ourlet=ourlet;
        v.armL=.55+l[0]*main-1.4*s.mix-.16*s.weight;v.armR=.25+r[0]*main-s.mix+.16*s.weight;
        v.flexL=bound(2.4+l[1]*main+7.1*s.mix+2.7*s.turn,0,112);v.flexR=bound(2.5+r[1]*main+6.7*s.mix-2.7*s.turn,0,99);
        v.wristL=bound(-.9+l[3]*main-1.2*s.mix+.43*s.weight+5*ourlet,-19,19);v.wristR=bound(.3+r[3]*main-1.5*s.mix-.41*s.weight,-19,19);
        v.openL=l[2]*main;v.openR=r[2]*main;v.foldL=l[4]*main;v.foldR=r[4]*main;v.indexL=l[5]*main;v.indexR=r[5]*main;
        v.lunettes=lunettes;v.ajuste=-.9*lunettes*pulse(q,GLASSES[1],3.78,GLASSES[2],4.23);
        v.blinkL=reduced?0:max(lids,blink(vie));v.blinkR=reduced?0:max(lids,blink(vie-.009));
        double spread=min(k,1.1);
        v.stepL=anchor(s.left,-spread);v.stepR=anchor(talon!=0?new Foot(0,0,0,22*talon,-10*talon,true):s.right,spread);
        v.smile=bound(env*face[0],-1,1);v.inner=bound(env*face[1],-1.12,1.16);v.outer=bound(env*face[2],-1.02,1.22);
        v.asym=bound(env*face[5],-.98,.98);v.focus=bound(env*face[4]);
        v.lids=bound(env*face[3],-1,1);v.levres=silence*env*face[8];v.mouth=mouth;return v;
    }
}
