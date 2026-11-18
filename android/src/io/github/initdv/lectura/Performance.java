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
    private final List<Track> tracks=new ArrayList<>();
    private final List<Cue> gestures=new ArrayList<>();

    static final class Cue {
        final long at;final int length,side;final double strength;final String motion;
        Cue(long at,String motion,double strength,int side){this.at=at;this.motion=motion;this.strength=strength;this.side=side;length=DURATIONS.getOrDefault(motion,0);}
    }
    private static final class Face {
        final long at;final String id;final double force;
        Face(long at,String id,double force){this.at=at;this.id=id;this.force=force;}
    }
    private static final class Track {
        final Script.Segment segment;final Mood.Analysis analysis;final List<Face> faces=new ArrayList<>();
        Track(Script.Segment p,Mood.Analysis a){segment=p;analysis=a;}
    }
    Performance(List<Script.Segment> parts,Mood mood) {
        int step=0;
        for(Script.Segment p:parts) {
            Mood.Analysis a=mood.summary(p);Track track=new Track(p,a);tracks.add(track);
            if(!mood.auto()||a.manual||p.type!=Script.SPOKEN)continue;
            long end=p.speechEnd>=0?p.speechEnd:p.to;
            long duration=end-p.from;if(duration<=0)continue;
            for(Mood.Moment x:a.moments) {
                long at=offsetTime(p,end,x.pos);int seed=step++;
                if(!x.emotion.isEmpty())track.faces.add(new Face(at,x.emotion,x.force));
                String move=x.gesture.isEmpty()?mood.motion(x.emotion,seed):x.gesture;
                addCue(at,move,x.emotion.isEmpty()?.68:Math.min(1.15,x.force),seed);
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
                if(!emotion.isEmpty())track.faces.add(new Face(at,emotion,force));
                addCue(at,gesture,force,step++);
            }else if(a.moments.isEmpty()&&duration>2500) {
                addCue(p.from+duration/2,a.expr.equals("concentre")?"observe":"ouvre",.38,step++);
            }
            track.faces.sort(Comparator.comparingLong(x->x.at));
        }
    }
    private void addCue(long at,String motion,double strength,int seed) {
        if(motion.isEmpty()||!DURATIONS.containsKey(motion))return;
        if(!gestures.isEmpty()) {
            // Leave time to read a gesture. A stronger beat can replace a weaker punctuation accent.
            Cue last=gestures.get(gestures.size()-1);
            if(at-last.at<Math.min(380,last.length/2)) {
                if(strength<=last.strength+.24)return;
                gestures.remove(gestures.size()-1);
            }
        }
        gestures.add(new Cue(at,motion,strength,seed%2==0?1:-1));
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
    private Track track(double time) {
        int lo=-1,hi=tracks.size()-1;
        while(lo<hi){int m=(lo+hi+1)>>>1;if(tracks.get(m).segment.from<=time)lo=m;else hi=m-1;}
        return lo<0?null:tracks.get(lo);
    }
    Mood.Pose face(double time) {
        Track t=track(time);if(t==null||time>=t.segment.to)return NEUTRAL;
        Mood.Analysis a=t.analysis;
        if(t.faces.isEmpty())return new Mood.Pose(a.expr,a.force,a.second,a.weight,0,"");
        Face last=null,previous=null;for(Face event:t.faces) {
            if(event.at>time)break;previous=last;last=event;
        }
        if(last==null)return new Mood.Pose(a.expr,a.sentiment?Math.min(.46,a.force):a.force,"",0,0,"");
        String mix=previous==null?a.second:previous.id;
        double elapsed=time-last.at;
        double transition=Math.max(0,1-elapsed/220);
        double weight=previous==null?Math.min(a.weight,.26):.48*transition*transition;
        double breath=Math.max(0,time-(t.segment.speechEnd>=0?t.segment.speechEnd:t.segment.to));
        double force=last.force*(1-.24*Math.min(1,breath/530.));
        return new Mood.Pose(last.id,force,mix.equals(last.id)?"":mix,weight,0,"");
    }
    Cue gesture(double time) {
        Track t=track(time);
        if(t==null||t.analysis.manual||t.segment.type!=Script.SPOKEN||time>=t.segment.to)return null;
        int lo=-1,hi=gestures.size()-1;
        while(lo<hi){int m=(lo+hi+1)>>>1;if(gestures.get(m).at<=time)lo=m;else hi=m-1;}
        if(lo<0)return null;Cue pose=gestures.get(lo);return time<pose.at+pose.length?pose:null;
    }
}
