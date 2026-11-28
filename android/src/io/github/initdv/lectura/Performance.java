package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Deterministic, native stage directions sampled on the audio clock, never triggered by frame-to-frame guesses. */
final class Performance {
    private static final Pattern TAIL=Pattern.compile("([,;:.!?…]+)[\\s\\p{Z}»”'’\"\\])}*_`]*$");
    static final Map<String,Integer> DURATIONS=Map.ofEntries(
        Map.entry("hoche",650),Map.entry("secoue",670),Map.entry("hoche_lent",1000),Map.entry("coucou",1280),
        Map.entry("sursaut",430),Map.entry("dodeline",780),Map.entry("tremble",480),Map.entry("ouvre",940),
        Map.entry("observe",950),Map.entry("indique",920),Map.entry("recule",590),Map.entry("celebre",930),
        Map.entry("applaudit",1050),Map.entry("rigole",850),Map.entry("redresse",900),Map.entry("incline",1020),
        Map.entry("questionne",910),Map.entry("hausse",940),Map.entry("detourne",880),Map.entry("soupire",1180),
        Map.entry("paupiere",1100),Map.entry("insiste",770),Map.entry("suspens",1120),Map.entry("reflechit",1120),
        Map.entry("ciel",1120),Map.entry("relache",1040),Map.entry("apaise",1110),Map.entry("clin",680),
        Map.entry("tapote",720),Map.entry("sursaut_fort",490),Map.entry("sursaut_double",650));
    private static final Mood.Pose NEUTRAL=new Mood.Pose("neutre",1,"",0,0,"");
    private final RigPose rig;
    private final double[] rest;
    private final List<Face> faces=new ArrayList<>();
    private final List<Cue> gestures=new ArrayList<>();

    static final class Cue {
        final long at;final int length,side;final double strength;final String motion;
        private long until;
        Cue(long at,String motion,double strength,int side,long until){
            this.at=at;this.motion=motion;this.strength=strength;this.side=side;
            length=DURATIONS.get(motion);this.until=Math.min(at+length,until);
        }
        double envelope(double time){
            return RigPose.ease((time-at)/90)*RigPose.ease((until-time)/150);
        }
    }
    private static final class Event {
        final long at;final Mood.Pose target;
        Event(long at,Mood.Pose target){this.at=at;this.target=target;}
    }
    private static final class Face {
        final Event event;final double[] from,to;
        Face(Event event,double[] from,double[] to){this.event=event;this.from=from;this.to=to;}
        void sample(double time,double[] out){RigPose.mix(from,to,RigPose.ease((time-event.at)/RigPose.GLIDE_MS),out);}
    }
    Performance(List<Script.Segment> parts,Mood mood,RigPose rig) {
        this.rig=rig;rest=rig.rest();
        int step=0;long prevEnd=0;
        List<Cue> candidates=new ArrayList<>();
        long[] allowed=gestureEnds(parts,mood);
        for(int index=0;index<parts.size();index++) {
            Script.Segment p=parts.get(index);
            if(p.from>=p.to)continue;
            if(p.from>prevEnd)addFace(new Event(prevEnd,NEUTRAL));
            prevEnd=p.to;
            Mood.Analysis a=mood.summary(p);
            long end=p.speechEnd>=0?p.speechEnd:p.to;
            long duration=end-p.from;
            boolean automated=allowed[index]>p.from&&duration>0;
            addFace(new Event(p.from,new Mood.Pose(a.expr,automated&&a.sentiment?Math.min(.46,a.force):a.force,
                a.second,a.weight,0,"")));
            if(!automated)continue;
            List<Event> events=new ArrayList<>();long until=allowed[index];
            for(Mood.Moment x:a.moments) {
                long at=offsetTime(p,end,x.pos);int seed=step++;
                if(!x.emotion.isEmpty())events.add(new Event(at,pose(a,x.emotion,x.force)));
                String move=x.gesture.isEmpty()?mood.motion(x.emotion,seed):x.gesture;
                cue(candidates,at,move,x.emotion.isEmpty()?.68:Math.min(1.15,x.force),seed,until);
            }
            // These beats are attached to the end of the realized voice, not to a nominal reading rate.
            Matcher tail=TAIL.matcher(p.text);
            if(tail.find()) {
                String punctuation=tail.group(1),emotion="",gesture="";double force=.82;
                if(punctuation.indexOf('?')>=0) {
                    emotion=mood.question(p.text);gesture=mood.motion(emotion,step);
                    if(!a.sentiment&&punctuation.indexOf('!')>=0&&emotion.equals("pensif")){emotion="surpris";gesture="recule";force=.95;}
                }else if(punctuation.indexOf('!')>=0) {
                    emotion=a.sentiment?a.expr:a.expr.equals("concentre")?"determine":"surpris";
                    gesture=!a.sentiment&&emotion.equals("surpris")&&punctuation.contains("!!")?"sursaut_double":mood.motion(emotion,step);
                    force=Math.min(1.2,a.sentiment?a.force+.07:1);
                }else if(punctuation.contains("...")||punctuation.contains("…")) {
                    emotion=a.sentiment?a.expr:"pensif";gesture="suspens";force=.66;
                }else if(punctuation.contains(":")) {gesture="indique";force=.57;}
                else if(punctuation.contains(";")&&duration>=680){gesture="hoche_lent";force=.46;}
                else if(punctuation.contains(",")&&duration>=1050){gesture="hoche";force=.38;}
                long at=Math.max(p.from,end-Math.min(165,duration/3));
                if(!emotion.isEmpty())events.add(new Event(at,pose(a,emotion,force)));
                cue(candidates,at,gesture,force,step++,until);
            }else if(a.moments.isEmpty()&&duration>2500) {
                cue(candidates,p.from+duration/2,a.expr.equals("concentre")?"observe":"ouvre",.38,step++,until);
            }
            events.sort(Comparator.comparingLong(x->x.at));
            for(Event event:events)addFace(event);
        }
        addFace(new Event(prevEnd,NEUTRAL));
        candidates.sort(Comparator.comparingLong(x->x.at));
        for(Cue cue:candidates)addCue(cue);
        for(int i=1;i<gestures.size();i++) {
            Cue last=gestures.get(i-1);last.until=Math.min(last.until,gestures.get(i).at);
        }
    }
    private static Mood.Pose pose(Mood.Analysis a,String id,double force){
        String mix=a.second.equals(id)?a.expr:a.second;
        return new Mood.Pose(id,force,mix.equals(id)?"":mix,Math.min(a.weight,.26),0,"");
    }
    private void addFace(Event event){
        double[] goal=rig.resolve(event.target);
        Face last=faces.isEmpty()?null:faces.get(faces.size()-1);
        double[] start=rest;
        if(last!=null){
            // A key can interrupt a glide. Start from the value that would be drawn at this exact audio time.
            if(event.at==last.event.at){start=last.from;faces.remove(faces.size()-1);}
            else if(java.util.Arrays.equals(last.to,goal))return;
            else {start=new double[rest.length];last.sample(event.at,start);}
        }
        faces.add(new Face(event,start,goal));
    }
    private static long[] gestureEnds(List<Script.Segment> parts,Mood mood){
        long[] allowed=new long[parts.size()];
        // Gestures may carry over into the next spoken phrase, but not across a gap, command or manual pose.
        for(int i=parts.size()-1;i>=0;i--){
            Script.Segment p=parts.get(i);
            if(!mood.auto()||p.type!=Script.SPOKEN||mood.summary(p).manual){allowed[i]=p.from;continue;}
            long next=i+1<parts.size()?parts.get(i+1).from:Long.MAX_VALUE;
            allowed[i]=i+1<parts.size()&&next<=p.to&&allowed[i+1]>next?allowed[i+1]:p.to;
        }
        return allowed;
    }
    private static void cue(List<Cue> out,long at,String motion,double strength,int seed,long until){
        if(at<until&&DURATIONS.containsKey(motion))out.add(new Cue(at,motion,strength,seed%2==0?1:-1,until));
    }
    private void addCue(Cue cue) {
        if(!gestures.isEmpty()) {
            // Leave time to read a gesture. A stronger beat can replace a weaker punctuation accent.
            Cue last=gestures.get(gestures.size()-1);
            if(cue.at<last.until&&cue.at-last.at<Math.min(380,last.length/2)) {
                if(cue.strength<=last.strength+.24)return;
                gestures.remove(gestures.size()-1);
            }
        }
        gestures.add(cue);
    }
    private static long offsetTime(Script.Segment p,long to,int local) {
        double ratio;
        if(p.cursor!=null&&p.cursor.length>0) {
            int at=p.start+local,low=0,high=p.cursor.length;
            while(low<high){int m=(low+high)>>>1;if(p.cursor[m]<at)low=m+1;else high=m;}
            ratio=low/(double)p.cursor.length;
        }else ratio=local/(double)Math.max(1,p.end-p.start);
        // Offset is a grapheme-based estimate (the local engines don't emit word timestamps).
        return p.from+Math.min(Math.max(0,to-p.from-110),Math.round((to-p.from)*ratio));
    }
    private Face key(double time){
        int lo=-1,hi=faces.size()-1;
        while(lo<hi){int m=(lo+hi+1)>>>1;if(faces.get(m).event.at<=time)lo=m;else hi=m-1;}
        return lo<0?null:faces.get(lo);
    }
    Mood.Pose face(double time){Face key=key(time);return key==null?NEUTRAL:key.event.target;}
    void sample(double time,double[] out){
        Face key=key(time);
        if(key==null)System.arraycopy(rest,0,out,0,out.length);
        else key.sample(time,out);
    }
    Cue gesture(double time) {
        int lo=-1,hi=gestures.size()-1;
        while(lo<hi){int m=(lo+hi+1)>>>1;if(gestures.get(m).at<=time)lo=m;else hi=m-1;}
        if(lo<0)return null;Cue pose=gestures.get(lo);return time<pose.until?pose:null;
    }
}
