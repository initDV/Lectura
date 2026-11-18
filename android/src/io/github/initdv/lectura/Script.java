package io.github.initdv.lectura;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static io.github.initdv.lectura.Refs.*;

/** UTF-16 offsets match the .lectura model and the browser's timing. */
final class Script {
    static final int VOICE_CPS=14;
    static final int SPOKEN=0, COMMAND=1, COMMENT=2, PAUSE=3;
    static final Pattern STRONG=Pattern.compile("(?<=[.!?…])[\\x09-\\x0d\\p{Z}\ufeff]+");
    static final Pattern LONG_SPLIT=Pattern.compile("[.!?…][\"'»)\\]]*\\s+|\\s+");
    static final Pattern TIME=Pattern.compile("(?:(\\d+):)?(\\d{1,2}):(\\d{2})[.,](\\d{1,3})\\s*-->\\s*(?:(\\d+):)?(\\d{1,2}):(\\d{2})[.,](\\d{1,3})");
    static int type(String s){return s.startsWith("$ ")?COMMAND:s.startsWith("# ")?COMMENT:SPOKEN;}
    static boolean space(char c){return (c>=0x09&&c<=0x0d)||Character.isSpaceChar(c)||c=='\ufeff';}
    static String clean(String s){
        return s.replaceAll("(?m)^#{2,6}\\s+","")
            .replaceAll("\\*\\*([^*\\n]+)\\*\\*","$1").replaceAll("__([^_\\n]+)__","$1")
            .replaceAll("(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)","$1").replaceAll("(?<!_)_([^_\\n]+)_(?!_)","$1")
            .replaceAll("(?i)```[a-z]*\\n?","").replaceAll("`([^`\\n]+)`","$1")
            .replaceAll("!\\[[^\\]]*\\]\\([^)]+\\)","").replaceAll("\\[([^\\]]+)\\]\\([^)]+\\)","$1")
            .replaceAll("(?m)^>\\s?","").replaceAll("(?m)^\\s*[-*_]{3,}\\s*$","").replaceAll("[ \\t]+"," ");
    }
    static final class Segment {
        final String text;
        final int start,end,type;
        long from,to,speechEnd=-1;
        int[] cursor;
        String expression="auto";
        Segment(String text,int start,int end,int type){this.text=text;this.start=start;this.end=end;this.type=type;}
        JSONObject json(int id){JSONObject o=new JSONObject();put(o,"id",id);put(o,"texte",text);put(o,"debutMs",from);put(o,"finMs",to);put(o,"expression",expression);return o;}
    }
    static List<Segment> split(String text){
        List<Segment> result=new ArrayList<>(); int pos=0;
        for(String line:text.split("\n",-1)){
            int k=type(line), first=0;
            if(k==SPOKEN){Matcher m=STRONG.matcher(line);while(m.find()){add(result,text,pos+first,pos+m.start(),k);first=m.end();}}
            add(result,text,pos+first,pos+line.length(),k);pos+=line.length()+1;
        }
        return result;
    }
    private static void add(List<Segment> a,String s,int b,int e,int type){
        while(b<e&&space(s.charAt(b)))b++;while(e>b&&space(s.charAt(e-1)))e--;
        if(e>b)a.add(new Segment(s.substring(b,e),b,e,type));
    }
    static List<Segment> chunks(String text){
        List<Segment> out=new ArrayList<>();
        for(Segment p:split(text)){
            if(p.type!=SPOKEN){out.add(p);continue;}
            int a=p.start;
            while(p.end-a>200){
                String w=text.substring(a,a+200);
                int i=Math.max(w.lastIndexOf(", "),Math.max(w.lastIndexOf("; "),w.lastIndexOf(": ")));
                if(i<80)i=w.lastIndexOf(' ');int end=a+(i<=0?200:i+1);
                out.add(new Segment(text.substring(a,end),a,end,SPOKEN));a=end;while(a<p.end&&space(text.charAt(a)))a++;
            }
            if(p.end>a)out.add(new Segment(text.substring(a,p.end),a,p.end,SPOKEN));
        }
        return out;
    }
    static long estimate(String s,double rate,double cps){
        int spoken=0,silent=0;for(Segment p:split(s))if(p.type==SPOKEN)spoken+=p.text.length();else silent+=p.text.length();
        if(spoken==0&&silent==0)spoken=s.length();return Math.round((spoken/(double)VOICE_CPS+silent/cps)*1000/rate);
    }
    static List<Segment> timing(String text,double duration,double silent){
        List<Segment> parts=split(text); boolean spoken=false;for(Segment p:parts)if(p.type==SPOKEN)spoken=true;
        double total=0,cumulative=0; double[] weights=new double[parts.size()];
        for(int i=0;i<parts.size();i++){
            Segment p=parts.get(i);String v=p.text;double a=v.length();
            if(spoken&&p.type!=SPOKEN)a*=silent;
            else {if(v.matches("(?s).*[.!?…][\"'»)\\]]*$"))a+=12;for(int j=0;j<v.length();j++)if(",;:".indexOf(v.charAt(j))>=0)a+=6;}
            total+=(weights[i]=a);
        }
        if(total==0)total=1;
        for(int i=0;i<parts.size();i++){Segment p=parts.get(i);p.from=Math.round(duration*cumulative/total);cumulative+=weights[i];p.to=Math.round(i+1==parts.size()?duration:duration*cumulative/total);}
        return parts;
    }
    static void reportExpressions(List<Segment> parts,JSONArray previous){for(int i=0;i<parts.size();i++){JSONObject o=previous.optJSONObject(i);if(o!=null)parts.get(i).expression=o.optString("expression","auto");}}
    static void reportExpressions(String text,List<Segment> parts,JSONArray previous){
        List<Segment> saved=locate(text,previous,false);if(saved==null)return;
        int i=0;for(Segment p:parts){
            while(i<saved.size()&&saved.get(i).end<=p.start)i++;
            if(i<saved.size()&&saved.get(i).start<p.end)p.expression=saved.get(i).expression;
        }
    }
    static List<Segment> locate(String text,JSONArray data,boolean checkTime){
        if(data.length()==0)return null;List<Segment> parts=new ArrayList<>();int pos=0;long last=-1;
        for(int i=0;i<data.length();i++){
            JSONObject o=data.optJSONObject(i);if(o==null)return null;String s=o.optString("texte");int off=text.indexOf(s,pos);
            long from=o.optLong("debutMs",-1),to=o.optLong("finMs",-1);if(off<0||s.isEmpty()||checkTime&&(from<last||to<=from))return null;
            Segment p=new Segment(s,off,off+s.length(),type(s));p.from=from;p.to=to;p.expression=o.optString("expression","auto");
            parts.add(p);pos=p.end;last=to;
        }
        return parts;
    }
    static JSONArray encode(List<Segment> parts){JSONArray a=new JSONArray();int i=1;for(Segment p:parts)a.put(p.json(i++));return a;}
    static final class Timeline {
        final List<Segment> parts;final int total;final long duration;
        Timeline(String text,List<Segment> parts){this.parts=parts;total=text.length();duration=parts.isEmpty()?0:parts.get(parts.size()-1).to;}
        private int index(double v,boolean chars){int a=-1,b=parts.size()-1;while(a<b){int m=(a+b+1)>>>1;Segment p=parts.get(m);if((chars?p.start:p.from)<=v)a=m;else b=m-1;}return a;}
        Segment segment(int pos){return parts.isEmpty()?null:parts.get(Math.max(0,index(pos,true)));}
        Segment at(double ms){int k=index(ms,false);return k<0?null:parts.get(k);}
        int charAt(double time){
            if(parts.isEmpty())return 0;if(time>=duration)return total;int k=index(time,false);if(k<0)return parts.get(0).start;
            Segment p=parts.get(k);long end=p.speechEnd<0?p.to:p.speechEnd;
            if(time>=end)return p.end;
            double ratio=(time-p.from)/Math.max(1,end-p.from);
            if(p.cursor!=null&&p.cursor.length>0){int i=Math.min(p.cursor.length-1,(int)(ratio*p.cursor.length));int offset=p.cursor[i],local=offset-p.start;return local>0&&local<p.text.length()&&Character.isLowSurrogate(p.text.charAt(local))?offset-1:offset;}
            int i=(int)Math.floor(p.start+(p.end-p.start)*ratio);return i>p.start&&Character.isLowSurrogate(p.text.charAt(i-p.start))?i-1:i;
        }
    }
    static void importSubtitles(String s,Project target){
        List<Segment> result=new ArrayList<>();
        for(String block:s.replaceFirst("^\ufeff", "").replace("\r","").split("\n{2,}")){
            String[] lines=block.split("\n");
            for(int i=0;i<lines.length;i++){
                Matcher m=TIME.matcher(lines[i]);if(!m.find())continue;
                String text=String.join(" ",java.util.Arrays.copyOfRange(lines,i+1,lines.length)).replaceAll("<[^>]+>","").replaceAll("\\s+"," ").trim();
                if(!text.isEmpty()){Segment p=new Segment(text,0,0,type(text));p.from=stamp(m,1);p.to=Math.max(p.from+1,stamp(m,5));result.add(p);}break;
            }
        }
        if(result.isEmpty())throw new IllegalArgumentException("Aucun sous-titre lisible dans ce fichier (formats acceptés : .srt, .vtt).");
        result.sort(Comparator.comparingLong(p->p.from));StringBuilder out=new StringBuilder();for(Segment p:result){if(out.length()>0)out.append('\n');out.append(p.text);}
        target.text=out.toString();target.segments=encode(result);target.subtitles=true;
    }
    static String subtitles(List<Segment> parts,boolean vtt){
        StringBuilder out=new StringBuilder(vtt?"WEBVTT\n\n":"");int i=1;
        for(Segment p:parts)if(p.type==SPOKEN){if(!vtt)out.append(i++).append('\n');out.append(stamp(p.from,vtt)).append(" --> ").append(stamp(p.to,vtt)).append('\n').append(p.text).append("\n\n");}
        if(out.length()>(vtt?8:0))out.setLength(out.length()-1);return out.toString();
    }
    private static long stamp(Matcher m,int k){String h=m.group(k),f=m.group(k+3);return ((h==null?0:Long.parseLong(h))*3600+Long.parseLong(m.group(k+1))*60+Long.parseLong(m.group(k+2)))*1000+Integer.parseInt((f+"00").substring(0,3));}
    private static String stamp(long t,boolean vtt){return String.format(Locale.ROOT,"%02d:%02d:%02d%c%03d",t/3600000,t/60000%60,t/1000%60,vtt?'.':',',t%1000);}

    static final class Keywords {
        final Map<String,Integer> colors=new LinkedHashMap<>();
        final Map<String,String> exact=new LinkedHashMap<>(),lower=new LinkedHashMap<>();
        final Pattern regex;
        Keywords(Refs refs,String lang,JSONObject custom){
            JSONObject base=refs.json("data/keywords_"+lang+".json");JSONObject cats=object(base,"categories"),rules=object(base,"regles");
            Dictionary d=new Dictionary();d.add(cats);d.add(object(refs.json("data/keywords_fr_extended.json"),"categories"));d.add(custom);
            boolean whole=rules.optBoolean("motsEntiers",true),ignore=!rules.optBoolean("sensibleCasse"),multi=rules.optBoolean("expressionsMultiMots",true);
            for(String cat:d.words.keySet()){
                colors.put(cat,d.inks.getOrDefault(cat,0xffe6edf3));
                for(String w:d.words.get(cat)){
                    String n=norm(w);if(n.isEmpty()||!multi&&n.contains(" "))continue;
                    exact.putIfAbsent(n,cat);lower.putIfAbsent(n.toLowerCase(Locale.ROOT),cat);
                }
            }
            List<String> words=new ArrayList<>(exact.keySet());words.sort((a,b)->b.length()-a.length());
            StringBuilder r=new StringBuilder();if(whole)r.append("(?<![\\p{L}\\p{N}_])");r.append("(?:");
            boolean first=true;
            for(String w:words){if(!first)r.append('|');first=false;String[] pieces=w.split(" ");for(int i=0;i<pieces.length;i++){if(i>0)r.append("[ \\t\\u00a0]+");r.append(Pattern.quote(pieces[i]));}}
            r.append(')');if(whole)r.append("(?![\\p{L}\\p{N}_])");regex=words.isEmpty()?null:Pattern.compile(r.toString(),ignore?Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE:0);
        }
        List<Token> find(String s){
            List<Token> out=new ArrayList<>();if(regex==null)return out;Matcher m=regex.matcher(s);while(m.find()){
                String n=norm(m.group()),cat=exact.getOrDefault(n,lower.get(n.toLowerCase(Locale.ROOT)));
                if(cat!=null)out.add(new Token(m.start(),m.end(),cat));
            }return out;
        }
        private static String norm(String s){return s.replaceAll("\\s+"," ").trim();}
    }
    private static final class Dictionary {
        final Map<String,List<String>> words=new LinkedHashMap<>();final Map<String,Integer> inks=new LinkedHashMap<>();
        void add(JSONObject categories){categories.keys().forEachRemaining(k->{JSONObject spec=object(categories,k);if(spec.has("couleur"))inks.put(k,color(spec,"couleur"));
            List<String> list=words.computeIfAbsent(k,j->new ArrayList<>());JSONArray a=array(spec,"mots");for(int i=0;i<a.length();i++)list.add(a.optString(i));});}
    }
    static final class Token {final int start,end;final String cat;Token(int a,int b,String c){start=a;end=b;cat=c;}}
    static final class Line {
        final int start,end;
        final String text;
        final List<Token> tokens;
        Line(int start,String s,int type,Keywords k){this.start=start;this.end=start+s.length();this.text=s;
            tokens=type==COMMAND?List.of(new Token(0,2,"__prompt"),new Token(2,s.length(),"__cmd")):
                type==COMMENT?List.of(new Token(0,s.length(),"__com")):k.find(s);}
    }
    static final class Terminal {
        final List<Line> lines=new ArrayList<>();final Keywords keywords;
        int shown;
        Terminal(String s,Keywords k){
            keywords=k;Matcher breaks=Pattern.compile("\\r\\n|[\\r\\n]").matcher(s);int from=0;
            while(breaks.find()){String line=s.substring(from,breaks.start());lines.add(new Line(from,line,type(line),k));from=breaks.end();}
            String line=s.substring(from);lines.add(new Line(from,line,type(line),k));
        }
        int lineAt(int shown){int a=0,b=lines.size()-1;while(a<b){int m=(a+b+1)>>>1;if(lines.get(m).start<=shown)a=m;else b=m-1;}return a;}
    }
}
