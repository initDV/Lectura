package io.github.initdv.lectura;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** sentiment.js + humeur.js. Longest match, original UTF-16 offsets, then negation and intensity. */
final class Mood {
    private static final Set<String> POS=Set.of("content","enthousiaste","rire","fier","tendre","emerveille","soulage","determine","malicieu","reconnaissant","amuse","rassurant","compatissant","excite","apaise","contemplatif");
    private static final Set<String> NEG=Set.of("triste","colere","peur","fatigue","gene","inquiet","ennuye","degoute","jaloux","intimide","impatient","confus","resigne","honteux");
    private static final Set<String> AFTER=Set.of("pas","plus","jamais","guere","rien");
    private static final Pattern WORD=Pattern.compile("[\\p{L}\\p{N}]+"),PUNCT=Pattern.compile("[,;:.!?()]");
    private static final Pattern CONTENT=Pattern.compile("(?i)(?<![\\p{L}\\p{N}_])(réussi|réussie|réussite|bravo|félicitations|parfait|gagné|succès|well done|congratulations|success)(?![\\p{L}\\p{N}_])");
    private static final Pattern CODE=Pattern.compile("(^\\s*[$#>] )|`[^`]+`|\\s--?[a-z][\\w-]*|[{};]\\s*$|\\w+\\(.*\\)");
    private final Map<String,Hit> exact=new LinkedHashMap<>(),prefix=new LinkedHashMap<>();
    private final List<String> prefixes;
    private final Set<String> negations=new HashSet<>();
    private final Map<String,Double> intensifiers=new LinkedHashMap<>();
    private final JSONObject expressions,emoji,gesturesByPose,questions;
    private final Pattern emojiPattern;
    private final Map<Script.Segment,Analysis> cache=new IdentityHashMap<>();
    private final Script.Keywords keywords;
    private final boolean automatic;
    private int maxWords=1;
    Mood(Refs refs,String lang,Script.Keywords words,boolean automatic){
        this.expressions=refs.expressions;this.keywords=words;this.automatic=automatic;
        JSONObject nativeConfig=refs.json("direction.json"),configured=object(nativeConfig,lang);
        gesturesByPose=object(nativeConfig,"poses");questions=object(configured,"questions");
        JSONObject contexts=object(configured,"contexts");
        contexts.keys().forEachRemaining(id->readWords(id,array(contexts,id),1.55));
        JSONObject s=refs.json("data/sentiments_"+lang+".json"),em=object(s,"emotions");
        em.keys().forEachRemaining(k->{JSONObject d=object(em,k);readWords(k,array(d,"mots"),1);readWords(k,array(d,"forts"),1.6);});
        JSONObject gestures=object(s,"gestes");gestures.keys().forEachRemaining(k->{String n=key(k);if(n.isEmpty())return;
            Hit h=exact.computeIfAbsent(n,a->new Hit("",0,""));if(h.gesture.isEmpty())h.gesture=gestures.optString(k);maxWords=Math.max(maxWords,n.split(" ").length);});
        JSONObject additions=object(configured,"gestures");
        additions.keys().forEachRemaining(gesture->{JSONArray phrases=array(additions,gesture);for(int i=0;i<phrases.length();i++){
            String n=key(phrases.optString(i));if(n.isEmpty())continue;
            exact.computeIfAbsent(n,name->new Hit("",0,"")).gesture=gesture;
            maxWords=Math.max(maxWords,n.split(" ").length);
        }});
        JSONArray a=array(s,"negations");for(int i=0;i<a.length();i++)negations.add(key(a.optString(i)));
        JSONObject ints=object(s,"intensifs");ints.keys().forEachRemaining(k->intensifiers.put(key(k),ints.optDouble(k,1)));
        emoji=object(s,"emojis");List<String> e=new ArrayList<>();emoji.keys().forEachRemaining(x->e.add(Pattern.quote(x)));
        emojiPattern=e.isEmpty()?null:Pattern.compile(String.join("|",e));
        prefixes=new ArrayList<>(prefix.keySet());prefixes.sort((x,y)->y.length()-x.length());
    }
    private static String normalize(String s){StringBuilder n=new StringBuilder(s.length());for(int i=0;i<s.length();i++){
        char a=Character.toLowerCase(s.charAt(i));String d=Normalizer.normalize(String.valueOf(a),Normalizer.Form.NFD);
        n.append(d.length()>1&&d.charAt(1)>=0x300&&d.charAt(1)<=0x36f?d.charAt(0):a);
    }return n.toString();}
    private static String key(String s){Matcher m=WORD.matcher(normalize(s));List<String> a=new ArrayList<>();while(m.find())a.add(m.group());return String.join(" ",a);}
    private void readWords(String e,JSONArray a,double w){for(int i=0;i<a.length();i++){
        String raw=a.optString(i),k=key(raw);if(k.isEmpty())continue;
        if(raw.trim().endsWith("*")&&!k.contains(" "))prefix.putIfAbsent(k,new Hit(e,w,""));
        else {exact.putIfAbsent(k,new Hit(e,w,""));maxWords=Math.max(maxWords,k.split(" ").length);}
    }}
    private String playable(String id){return expressions.has(id)?id:"neutre";}
    private static final class Word {final String s;final int start,end;boolean used;Word(String s,int a,int b){this.s=s;start=a;end=b;}}
    static class Hit {String emotion,gesture;final double weight;Hit(String e,double w,String g){emotion=e;weight=w;gesture=g;}}
    static final class Moment extends Hit {final int pos;double force;Moment(int p,String e,double w,String g){super(e,w,g);pos=p;}}
    static final class Analysis {
        String expr="neutre",second="";double force=1,weight;boolean sentiment,manual;
        final List<Moment> moments=new ArrayList<>();
    }
    static final class Pose {
        final String expr,mix,gesture; final double strength,weight; final int rank;
        Pose(String e,double a,String m,double w,int r,String g){expr=e;strength=a;mix=m;weight=w;rank=r;gesture=g;}
    }
    private static double force(double score,double boost){return Math.max(.35,Math.min(1.25,(.55+.35*score)*(score<.5?.8:boost)));}
    private boolean denied(List<Word> a,int k,int n,String text){
        for(int i=k-1;i>=Math.max(0,k-3);i--){Word w=a.get(i);if(w.used||PUNCT.matcher(text.substring(w.end,a.get(i+1).start)).find())return false;
            if(negations.contains(w.s)||((w.s.equals("n")||w.s.equals("ne"))&&k+n<a.size()&&AFTER.contains(a.get(k+n).s)))return true;}
        return false;
    }
    private void analyse(String text,Analysis a){
        String normal=normalize(text);List<Word> words=new ArrayList<>();Matcher m=WORD.matcher(normal);while(m.find())words.add(new Word(m.group(),m.start(),m.end()));
        for(int i=0;i<words.size();i++){
            Word first=words.get(i);Hit hit=null;int count=0;
            for(int n=Math.min(maxWords,words.size()-i);n>0;n--){StringBuilder k=new StringBuilder(first.s);boolean sameClause=true;
                for(int j=1;j<n;j++){
                    Word aWord=words.get(i+j-1),bWord=words.get(i+j);
                    if(PUNCT.matcher(normal.substring(aWord.end,bWord.start)).find()){sameClause=false;break;}
                    k.append(' ').append(bWord.s);
                }
                if(!sameClause)continue;hit=exact.get(k.toString());if(hit!=null){count=n;break;}}
            if(hit==null)for(String p:prefixes)if(first.s.startsWith(p)){hit=prefix.get(p);count=1;break;}
            if(hit==null)continue;
            String emotion=hit.emotion,raw=text.substring(first.start,words.get(i+count-1).end);double w=hit.weight;
            for(int j=Math.max(0,i-2);j<i;j++)w*=intensifiers.getOrDefault(words.get(j).s,1d);
            if(raw.length()>3&&raw.equals(raw.toUpperCase(Locale.ROOT))&&!raw.equals(raw.toLowerCase(Locale.ROOT)))w*=1.3;
            boolean skip=false;
            if(!emotion.isEmpty()&&denied(words,i,count,normal)){
                if(POS.contains(emotion)){emotion="triste";w*=.7;}else if(NEG.contains(emotion)){emotion="content";w*=.45;}else skip=true;
            }
            if(!skip)a.moments.add(new Moment(first.start,emotion,w,hit.gesture));for(int j=0;j<count;j++)words.get(i+j).used=true;i+=count-1;
        }
        if(emojiPattern!=null){m=emojiPattern.matcher(text);while(m.find())a.moments.add(new Moment(m.start(),emoji.optString(m.group()),1.2,""));}
        a.moments.sort(Comparator.comparingInt(x->x.pos)); int ex=0;for(int i=0;i<text.length();i++)if(text.charAt(i)=='!')ex++;
        double boost=1+.15*Math.min(3,ex); Map<String,Double> scores=new LinkedHashMap<>();
        for(Moment x:a.moments)if(!x.emotion.isEmpty()){x.force=force(x.weight,boost);scores.merge(x.emotion,x.weight,Double::sum);}
        if(scores.isEmpty())return;
        List<String> order=new ArrayList<>(scores.keySet());order.sort((x,y)->Double.compare(scores.get(y),scores.get(x)));
        String first=order.get(0);double n=scores.get(first);a.sentiment=true;a.expr=playable(first);a.force=force(n,boost);
        if(order.size()>1){String second=order.get(1);double w=scores.get(second);if(w>=n*.5&&!a.expr.equals(playable(second))){a.second=playable(second);a.weight=Math.min(.45,w/(w+n));}}
        for(Moment x:a.moments) if(!x.emotion.isEmpty()) {
            x.emotion=playable(x.emotion);
        }
    }
    Analysis summary(Script.Segment seg){return cache.computeIfAbsent(seg,s->{Analysis a=new Analysis();int type=s.type;
        if(!s.expression.equals("auto")&&expressions.has(s.expression)){a.expr=playable(s.expression);a.manual=true;return a;}
        if(type!=Script.SPOKEN){if(type!=Script.PAUSE)a.expr="concentre";a.force=type==Script.COMMAND?.75:.58;return a;}
        if(automatic)analyse(s.text,a);
        if(automatic&&!a.sentiment){List<Script.Token> t=keywords.find(s.text);
            if(t.stream().anyMatch(x->x.cat.equals("alerte")))a.expr="surpris";else if(CONTENT.matcher(s.text).find())a.expr="content";
            else if(CODE.matcher(s.text).find()||t.stream().anyMatch(x->x.cat.equals("commande"))){a.expr="concentre";a.force=.8;}}
        return a;});}
    boolean auto(){return automatic;}
    String question(String raw){
        String words=" "+key(raw)+" ";
        for(String id:List.of("inquiet","sceptique","curieux")) {
            JSONArray list=array(questions,id);for(int i=0;i<list.length();i++){
                String phrase=" "+key(list.optString(i))+" ";
                if(words.startsWith(phrase)||!id.equals("curieux")&&words.contains(phrase))return id;
            }
        }
        return "pensif";
    }
    String motion(String pose,int seed){JSONArray choices=array(gesturesByPose,pose);
        if(choices.length()==0)return object(expressions,pose).optString("geste");return choices.optString(Math.floorMod(seed,choices.length()));}
    Pose pose(Script.Segment s,int n){
        Analysis a=summary(s);int r=0;String gesture="",before="";Moment last=null;
        for(Moment x:a.moments){if(x.pos>n)break;r++;gesture=x.gesture;if(!x.emotion.isEmpty()){if(last!=null&&!last.emotion.equals(x.emotion))before=last.emotion;last=x;}}
        if(last==null)return new Pose(a.expr,a.force*(a.sentiment&&!a.moments.isEmpty()?.35:1),"",0,r,gesture);
        return new Pose(last.emotion,last.force,before,before.isEmpty()?0:.3,r,gesture);
    }
}
