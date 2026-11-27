package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.Comparator;
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
    private static final Pattern WORRY=Pattern.compile("(?<![\\p{L}\\p{N}])(?:j['’]ai cru|je pensais) que (?:tu|vous) (?:ne |n['’])(?:viendr|reviendr|arriver)(?:ais|iez) pas(?![\\p{L}\\p{N}])".replace(" ",SPACE+"+"),CASE);
    private static final Pattern JOY=Pattern.compile("(?<![\\p{L}\\p{N}])(?:te|vous)"+SPACE+"+voil[àa](?![\\p{L}\\p{N}])",CASE);

    static final class Index {
        final int pos,fin;final String face;final double force;
        Index(int pos,int fin,String face,double force){this.pos=pos;this.fin=fin;this.face=face;this.force=force;}
    }
    private static void context(List<Index> notes,Pattern text,String raw,String face,double force){
        var m=text.matcher(raw);while(m.find())notes.add(new Index(m.start(),m.end(),face,force));
    }
    private static List<Index> indices(String text,List<Mood.Moment> moments){
        var notes=new ArrayList<Index>();context(notes,WORRY,text,"inquiet",.93);context(notes,JOY,text,"content",.96);
        int contexts=notes.size();
        for(var m:moments){
            if(m.emotion.isEmpty()||m.emotion.equals("neutre"))continue;
            boolean covered=false;
            for(int i=0;i<contexts;i++){Index n=notes.get(i);if(m.pos>=n.pos&&m.pos<n.fin){covered=true;break;}}
            if(!covered)notes.add(new Index(m.pos,m.pos,m.emotion,m.force));
        }
        notes.sort(Comparator.comparingInt(n->n.pos));return notes;
    }
    private static boolean continues(Script.Segment a,Script.Segment b,String source){
        if(a==null||a.type!=Script.SPOKEN||a.end>b.start||b.text.isEmpty()||!SUSPENDED.matcher(a.text).find())return false;
        String gap=source.substring(a.end,b.start);
        return !BREAK.matcher(gap).find()&&gap.chars().allMatch(c->Script.space((char)c))
            && (Character.isLowerCase(b.text.codePointAt(0))||CONTINUE.matcher(b.text).find());
    }
    static Part part(Script.Segment s,Script.Segment before,String source,Mood.Analysis mood,boolean emotions){
        boolean spoken=s.type==Script.SPOKEN;
        return new Part(s.text,s.from,s.to,s.speechEnd,spoken,mood.expr,mood.force,mood.manual,continues(before,s,source),
            emotions&&!mood.manual&&spoken?indices(s.text,mood.moments):List.of(),s.start,s.cursor);
    }

    private static final class Note {
        final String face;final double at,force,pause;
        Note(Index n,double at,double pause){this.at=at;this.pause=pause;face=n.face;force=n.force;}
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
        var notes=new ArrayList<Note>();Phrase before=null;
        for(Phrase p:parts){
            for(Index n:p.part.indices){
                double t=p.time(n.pos);Note last=notes.isEmpty()?null:notes.get(notes.size()-1);
                if(last!=null&&(n.face.equals(last.face)||t-last.at<.08))continue;
                var inside=PAUSE.matcher(p.part.text.substring(0,n.pos));double pause=Double.NaN;
                if(inside.find())pause=p.time(inside.start());
                else if(before!=null&&t-p.start<=.56)pause=before.speechEnd<p.start-.03?before.speechEnd:p.start-min(.22,.15*(before.speechEnd-before.start));
                notes.add(new Note(n,t,pause));
            }
            before=p;
        }
        if(notes.size()<2){
            for(Phrase p:parts){
                Part s=p.part;boolean contextual=s.face.equals("neutre")&&!s.manual&&!s.indices.isEmpty();
                String face=contextual?s.indices.get(0).face:s.face;
                if(s.manual||!face.equals("neutre"))track.add(new Window(p.start,p.end,face,contextual?s.indices.get(0).force:s.force,s.manual,List.of()));
            }
            return;
        }
        double end=parts.get(parts.size()-1).end;var glides=new ArrayList<Glide>();
        for(int i=1;i<notes.size();i++){
            Note from=notes.get(i-1),to=notes.get(i);double pivot=to.at,look=pivot-min(.15,.4*(pivot-from.at));
            Glide prev=glides.isEmpty()?null:glides.get(glides.size()-1);
            double start=max(prev==null?from.at:prev.finish,Double.isNaN(to.pause)?look:min(look,max(to.pause,pivot-.86)));
            double finish=pivot+min(.21,.4*((i+1<notes.size()?notes.get(i+1).at:end)-pivot));
            if(prev!=null)glides.set(glides.size()-1,new Glide(prev.start,start,prev.finish,prev.from,prev.to));
            glides.add(new Glide(start,end,finish,from,to));
        }
        Note first=notes.get(0);track.add(new Window(parts.get(0).start,end,first.face,first.force,false,glides));
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
        final String name;final double[] face;final double force,lift;
        Frame(String name,double[] face,double force,double lift){this.name=name;this.face=face;this.force=force;this.lift=lift;}
    }
    static Frame sample(Window w,double t,String expression,Cue cue,Visages table){
        if(!expression.isEmpty())return new Frame(expression,table.get(expression),1,0);
        if(w==null){String id=cue==null?"neutre":cue.face;return new Frame(id,table.get(id),cue==null?0:cue.force,0);}
        Glide g=at(w.glides,t);
        if(g==null)return new Frame(w.face,table.get(w.face),w.force,0);
        String name=g.to.face;double[] to=table.get(name);
        if(t>=g.finish)return new Frame(name,to,g.to.force,0);
        double eyes=smooth(g.start,g.to.at,t),mouth=smooth(g.to.at,g.finish,t);
        double[] from=table.get(g.from.face),face=new double[to.length];
        for(int i=0;i<face.length;i++)face[i]=mix(from[i],to[i],i==0||i==8?mouth:eyes);
        return new Frame(name,face,mix(g.from.force,g.to.force,eyes),Double.isNaN(g.to.pause)?0:eyes*(1-mouth));
    }
}
