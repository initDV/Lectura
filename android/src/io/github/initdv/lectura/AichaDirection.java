package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Loads the shared intentions.js rules from the APK. Only ranges in the source text are stored. */
final class AichaDirection {
    private static final int CASE=Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE;
    private static final String SPACE="\\x09-\\x0d\\p{Z}\\uFEFF";
    private final Pattern mentions,deniedBefore,deniedAfter,neBefore,ambiguous,surprise,question,open;
    private final List<Rule> gestures,faces;

    AichaDirection(JSONObject rules){
        try {
            mentions=pattern(rules.getString("mentions"),CASE);
            deniedBefore=pattern(rules.getString("nieAvant"),CASE);deniedAfter=pattern(rules.getString("nieApres"),CASE);
            neBefore=pattern(rules.getString("neAvant"),CASE);ambiguous=pattern(rules.getString("ambigus"),CASE);
            surprise=pattern(rules.getString("surprise"),0);
            question=pattern(rules.getString("question"),0);open=pattern(rules.getString("ouverts"),CASE);
            gestures=rules(rules.getJSONArray("gestes"),false);faces=rules(rules.getJSONArray("visages"),true);
        }catch(JSONException e){throw new IllegalStateException("Règles des lectrices invalides.",e);}
    }
    private static Pattern pattern(String source,int flags){
        return Pattern.compile(source.replace("[\\s","["+SPACE).replace("\\s","["+SPACE+"]"),flags);
    }
    private static final class Rule {
        final String kind;final double force;final Pattern pattern;
        Rule(String kind,double force,Pattern pattern){this.kind=kind;this.force=force;this.pattern=pattern;}
    }
    private static List<Rule> rules(JSONArray rows,boolean expression)throws JSONException{
        var list=new ArrayList<Rule>(rows.length());
        for(int i=0;i<rows.length();i++){
            JSONArray row=rows.getJSONArray(i);
            list.add(new Rule(row.getString(0),expression?row.getDouble(1):0,pattern(row.getString(expression?2:1),CASE)));
        }
        return list;
    }
    static final class Hit {
        final int pos,end;final String kind;final double force;
        Hit(int pos,int end,String kind,double force){this.pos=pos;this.end=end;this.kind=kind;this.force=force;}
    }
    static final class Notes {
        static final Notes EMPTY=new Notes(List.of(),List.of());
        final List<Hit> gestures,faces;
        Notes(List<Hit> gestures,List<Hit> faces){this.gestures=gestures;this.faces=faces;}
    }
    private static boolean covers(List<Hit> ranges,int from,int to){
        for(Hit r:ranges)if(from<r.end&&to>r.pos)return true;
        return false;
    }
    private static List<Hit> scan(List<Rule> rules,String text,List<Hit> ignores){
        var out=new ArrayList<Hit>();
        for(Rule r:rules){var m=r.pattern.matcher(text);while(m.find())if(!covers(ignores,m.start(),m.end()))
            out.add(new Hit(m.start(),m.end(),r.kind,r.force));}
        return out;
    }
    private boolean denied(String text,Hit hit){
        String before=text.substring(Math.max(0,hit.pos-90),hit.pos);
        return deniedBefore.matcher(before).find()||neBefore.matcher(before).find()
            &&deniedAfter.matcher(text.substring(hit.end,Math.min(text.length(),hit.end+16))).find();
    }
    Notes read(String text,Mood.Analysis mood){
        var ignores=new ArrayList<Hit>();var m=mentions.matcher(text);
        while(m.find())ignores.add(new Hit(m.start(),m.end(),"",0));
        List<Hit> hands=scan(gestures,text,ignores);hands.removeIf(h->denied(text,h));hands.sort(Comparator.comparingInt(n->n.pos));
        if(mood.manual)return new Notes(hands,List.of());
        List<Hit> contexts=scan(faces,text,ignores),indices=new ArrayList<>();
        for(Hit note:contexts)indices.add(denied(text,note)?new Hit(note.pos,note.end,"neutre",note.force):note);
        for(Mood.Moment mark:mood.moments){
            if(mark.emotion.isEmpty()||mark.emotion.equals("neutre")||covers(ignores,mark.pos,mark.end)||covers(contexts,mark.pos,mark.end)
                ||ambiguous.matcher(text.substring(mark.pos,mark.end)).matches())continue;
            boolean denied=mark.denied;
            indices.add(new Hit(mark.pos,mark.end,denied&&!mark.emotion.equals("triste")?"neutre":mark.emotion,denied?Math.min(mark.force,.62):mark.force));
        }
        var exclamation=surprise.matcher(text);
        if(indices.isEmpty()&&exclamation.find()&&!covers(ignores,exclamation.start(),exclamation.start()+2))indices.add(new Hit(exclamation.start(),exclamation.end(),"surpris",.83));
        if(indices.isEmpty()&&question.matcher(text).find())indices.add(new Hit(0,0,open.matcher(text).find()?"curieux":"pensif",.73));
        indices.sort(Comparator.comparingInt(n->n.pos));return new Notes(hands,indices);
    }
}
