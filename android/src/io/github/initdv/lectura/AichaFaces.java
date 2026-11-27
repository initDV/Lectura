package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** humeurs.js: sample the facial direction in source time, without changing the audio segmentation. */
final class AichaFaces {
    private static final int CASE=Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE;
    private static final String SPACE="[\\x09-\\x0d\\p{Z}\\uFEFF]", ELLIPSIS="(?:…|\\.{3})[”»\"’')\\]]*";
    private static final String CONTRAST="(?:mais|pourtant|but|yet)";
    private static final Pattern SUSPENDED=Pattern.compile(ELLIPSIS+SPACE+"*\\z");
    private static final Pattern BREAK=Pattern.compile("[\r\n\u2028\u2029]");
    private static final Pattern CONTINUE=Pattern.compile("^"+CONTRAST+"\\b",CASE);
    private static final Pattern PAUSE=Pattern.compile(ELLIPSIS+SPACE+"*(?:"+CONTRAST+SPACE+"+)?\\z",CASE);
    private static final Pattern HARD=Pattern.compile("[.!?][”»\"’')\\]]*"+SPACE+"*\\z");
    private static boolean continues(Script.Segment a,Script.Segment b,String source){
        if(a==null||a.type!=Script.SPOKEN||a.end>b.start||b.text.isEmpty())return false;
        String gap=source.substring(a.end,b.start);
        if(BREAK.matcher(gap).find()||!gap.chars().allMatch(c->Script.space((char)c)))return false;
        return SUSPENDED.matcher(a.text).find()?Character.isLowerCase(b.text.codePointAt(0))||CONTINUE.matcher(b.text).find():!HARD.matcher(a.text).find();
    }
    static Part part(Script.Segment s,Script.Segment before,String source,Mood.Analysis mood,boolean emotions,AichaDirection direction){
        boolean spoken=s.type==Script.SPOKEN;
        return new Part(s.text,s.from,s.to,s.speechEnd,spoken,mood.manual?mood.expr:"neutre",mood.manual,continues(before,s,source),
            emotions&&spoken?direction.read(s.text,mood):AichaDirection.Notes.EMPTY,s.start,s.cursor);
    }

    private static final class Note {
        final String face;final double at,force,pause;
        Note(String face,double force,double at,double pause){this.at=at;this.pause=pause;this.face=face;this.force=force;}
    }
    static final class Phrase extends Interval {
        final Part part;final double speechEnd;final boolean linked;
        Phrase(Part part,double start,double end,double speechEnd,boolean linked){super(start,end);this.part=part;this.speechEnd=speechEnd;this.linked=linked;}
        double time(int local){
            int[] map=part.cursor;double ratio;
            if(map!=null&&map.length>0){
                int lo=0,hi=map.length,offset=part.offset+local;
                while(lo<hi){int mid=(lo+hi)>>>1;if(map[mid]<offset)lo=mid+1;else hi=mid;}
                ratio=lo/(double)map.length;
            }else ratio=bound(local/(double)part.text.length());
            return start+(speechEnd-start)*ratio;
        }
    }
    private static final class Glide extends Interval {
        final Note from,to;final double finish;
        Glide(double start,double end,double finish,Note from,Note to){super(start,end);this.finish=finish;this.from=from;this.to=to;}
    }
    static final class Window extends Interval {
        final String face;final double force;final boolean manual;final List<Glide> glides;
        Window(double start,double end,String face,double force,boolean manual,List<Glide> glides){
            super(start,end);this.face=face;this.force=force;this.manual=manual;this.glides=glides;
        }
        double envelope(double t){double span=end-start;return smooth(start,start+min(.23,.30*span),t)*(1-smooth(end-min(.35,.38*span),end,t));}
    }
    private static void phrase(List<Window> track,List<Phrase> parts){
        if(parts.isEmpty())return;
        Phrase first=parts.get(0);double start=first.start,end=parts.get(parts.size()-1).end;
        if(first.part.manual){track.add(new Window(start,end,first.part.face,1,true,List.of()));return;}
        var notes=new ArrayList<Note>();Phrase before=null;
        for(Phrase p:parts){
            for(var n:p.part.notes.faces){
                double t=min(p.time(n.pos),p.speechEnd-.04);Note last=notes.isEmpty()?null:notes.get(notes.size()-1);
                if(n.kind.equals(last==null?"neutre":last.face)||(last!=null&&t-last.at<.25))continue;
                var inside=PAUSE.matcher(p.part.text.substring(0,n.pos));double pause=Double.NaN;
                if(inside.find())pause=p.time(inside.start());
                else if(before!=null&&t-p.start<=.56&&SUSPENDED.matcher(before.part.text).find())
                    pause=before.speechEnd<p.start-.03?before.speechEnd:p.start-min(.22,.15*(before.speechEnd-before.start));
                notes.add(new Note(n.kind,n.force,t,pause));
            }
            before=p;
        }
        if(notes.isEmpty())return;
        if(notes.get(0).at>start+.07)notes.add(0,new Note("neutre",1,start,Double.NaN));
        var glides=new ArrayList<Glide>();
        for(int i=1;i<notes.size();i++){
            Note from=notes.get(i-1),to=notes.get(i);double pivot=to.at,look=pivot-min(.15,.4*(pivot-from.at));
            Glide prev=glides.isEmpty()?null:glides.get(glides.size()-1);
            double begin=max(prev==null?from.at:prev.finish,Double.isNaN(to.pause)?look:min(look,max(to.pause,pivot-.86)));
            double finish=pivot+min(.21,.4*((i+1<notes.size()?notes.get(i+1).at:end)-pivot));
            if(prev!=null)glides.set(glides.size()-1,new Glide(prev.start,begin,prev.finish,prev.from,prev.to));
            glides.add(new Glide(begin,end,finish,from,to));
        }
        Note n=notes.get(0);track.add(new Window(start,end,n.face,n.force,false,glides));
    }
    static void plan(List<Window> track,List<Phrase> phrases){
        var parts=new ArrayList<Phrase>();Phrase prev=null;
        for(Phrase p:phrases){
            if(prev!=null&&(!p.linked||p.start-prev.speechEnd>.85||p.part.manual||prev.part.manual)){phrase(track,parts);parts.clear();}
            parts.add(p);prev=p;
        }
        phrase(track,parts);
    }

    static final class Frame {
        final double[] face;final double force,lift;
        Frame(double[] face,double force,double lift){this.face=face;this.force=force;this.lift=lift;}
    }
    static Frame sample(Window w,double t,String expression,Cue cue,Visages table){
        if(!expression.isEmpty())return new Frame(table.get(expression),1,0);
        if(w==null){String id=cue==null?"neutre":cue.face;return new Frame(table.get(id),cue==null?0:cue.force,0);}
        Glide g=at(w.glides,t);
        if(g==null)return new Frame(table.get(w.face),w.force,0);
        double[] to=table.get(g.to.face);
        if(t>=g.finish)return new Frame(to,g.to.force,0);
        double eyes=smooth(g.start,g.to.at,t),mouth=smooth(g.to.at,g.finish,t);
        double[] from=table.get(g.from.face),face=new double[to.length];
        for(int i=0;i<face.length;i++)face[i]=mix(from[i],to[i],i==0||i==8?mouth:eyes);
        return new Frame(face,mix(g.from.force,g.to.force,eyes),Double.isNaN(g.to.pause)?0:eyes*(1-mouth));
    }
}
