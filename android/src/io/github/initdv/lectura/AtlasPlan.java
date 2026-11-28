package io.github.initdv.lectura;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CancellationException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable after compilation. Every pose is a function of the reading's source time. */
final class AtlasPlan {
    private static final Pattern WORD=Pattern.compile("[\\p{L}\\p{N}_][\\p{L}\\p{N}\\p{M}_]*");
    private static final Pattern MARKS=Pattern.compile("\\p{M}+");
    final List<Window> windows;
    AtlasPlan(List<Window> windows){this.windows=windows;}
    Window at(double ms){
        int a=-1,b=windows.size()-1;
        while(a<b){int m=(a+b+1)>>>1;if(windows.get(m).from<=ms)a=m;else b=m-1;}
        if(a<0)return null;
        Window w=windows.get(a);return ms<w.to?w:null;
    }
    static double unit(double u){return Math.max(0,Math.min(1,u));}
    static double ease(double u){double r=unit(u);return r*r*(3-2*r);}
    static final class Card {
        final String id,name,description;
        final List<String> reminders=new ArrayList<>();
        final List<Step> steps=new ArrayList<>();
        Card(JSONObject o){
            id=o.optString("id");name=o.optString("nom");description=o.optString("description");
            for(String[] r:phrases(o.optJSONArray("rappels")))reminders.add(" "+String.join(" ",r)+" ");
            JSONArray gs=o.optJSONArray("gestes");
            for(int i=0;gs!=null&&i<gs.length();i++)steps.add(new Step(i,gs.optJSONObject(i)));
        }
    }
    static final class Step {
        final int index;
        final List<String[]> words,continuations;
        final float[] box,trace;
        Step(int index,JSONObject o){
            this.index=index;words=phrases(o.optJSONArray("mots"));continuations=phrases(o.optJSONArray("suite"));
            words.addAll(continuations);box=floats(o.optJSONArray("zone"));trace=floats(o.optJSONArray("trajet"));
        }
    }
    static class Span {
        final double from; double to;
        Span(double from,double to){this.from=from;this.to=to;}
        double progress(double ms,boolean reduced){return ms<from?0:reduced||from==to?1:unit((ms-from)/(to-from));}
    }
    static final class Mark extends Span {
        final Step step;
        final int length;
        final boolean overview;
        Mark(double from,double to,Step step,int length,boolean overview){super(from,to);this.step=step;this.length=length;this.overview=overview;}
    }
    static final class Network {
        double routerWord=Double.NaN,linksWord=Double.NaN;
        final List<Span> signals=new ArrayList<>();
        Span router,links;
        void sample(Match hit){
            if(Double.isNaN(routerWord))routerWord=hit.router;
            if(Double.isNaN(linksWord))linksWord=hit.links;
            if(hit.signal!=null)signals.add(hit.signal);
        }
        void finish(Window w){
            double exchange=signals.isEmpty()?w.to:signals.get(0).from,duration=w.to-w.from;
            double r=Math.min(Math.min(Double.isNaN(routerWord)?w.from:routerWord,Double.isNaN(linksWord)?w.to:linksWord),exchange);
            double l=Math.min(Double.isNaN(linksWord)?r+Math.min(340,duration*.24):linksWord,exchange);
            router=new Span(r,r+Math.min(360,l-r));links=new Span(l,l+Math.min(Math.min(680,duration*.4),exchange-l));
        }
        Span signal(double ms){for(Span s:signals)if(s.from<=ms&&ms<s.to)return s;return null;}
    }
    static final class Window extends Span {
        final Card card;
        final List<Mark> marks=new ArrayList<>();
        final Network network;
        Window(Card card,double from,double to,boolean network){super(from,to);this.card=card;this.network=network?new Network():null;}
        void finish(boolean condensation){
            if(network!=null){network.finish(this);return;}
            if(marks.isEmpty()){
                int n=condensation?Math.min(2,card.steps.size()):card.steps.size();
                double start=from+Math.min(180,(to-from)*.09),step=Math.min(900,(to-from)*.79/Math.max(1,n));
                for(int i=0;i<n;i++)marks.add(new Mark(start+i*step,start+(i+1)*step,card.steps.get(i),0,true));
                return;
            }
            marks.sort(Comparator.comparingDouble((Mark m)->m.from).thenComparingInt(m->-m.length));
            int n=0;
            for(int i=0;i<marks.size();i++){
                Mark m=marks.get(i);
                if(n>0&&marks.get(n-1).from==m.from)continue;
                if(n>0){Mark prev=marks.get(n-1);prev.to=Math.min(prev.to,m.from);}
                marks.set(n++,m);
            }
            marks.subList(n,marks.size()).clear();
        }
        Mark active(double ms,boolean reduced){
            int a=-1,b=marks.size()-1;
            while(a<b){int m=(a+b+1)>>>1;if(marks.get(m).from<=ms)a=m;else b=m-1;}
            if(a<0)return null;
            Mark m=marks.get(a);return ms<m.to&&!(m.overview&&reduced)?m:null;
        }
        double phase(int index,double ms,boolean reduced){
            for(Mark m:marks)if(m.step.index==index)return ease(m.progress(ms,reduced));
            return 0;
        }
        float opacity(double ms,boolean reduced){
            if(ms<from||ms>=to)return 0;
            if(reduced)return 1;
            return (float)((.25+.75*ease((ms-from)/Math.min(560,(to-from)*.22)))*ease((to-ms)/Math.min(320,(to-from)*.16)));
        }
    }
    private static final class Motif {
        final Card card;
        final String[] words;
        final List<String[]> before,after;
        Motif(Card card,String[] words,List<String[]> before,List<String[]> after){this.card=card;this.words=words;this.before=before;this.after=after;}
    }
    private static final class Candidate {
        final Card card;final int start,end;
        Candidate(Card card,int start,int end){this.card=card;this.start=start;this.end=end;}
    }
    private static final class Word {
        final String key;final int start,end;
        Word(Matcher m){key=MARKS.matcher(Normalizer.normalize(m.group(),Normalizer.Form.NFD)).replaceAll("").toLowerCase(Locale.ROOT);start=m.start();end=m.end();}
    }
    private static final class Match {
        final Card card;
        final List<Mark> marks=new ArrayList<>();
        double router=Double.NaN,links=Double.NaN;Span signal;
        Match(Card card){this.card=card;}
    }
    static final class Catalogue {
        final List<Card> cards=new ArrayList<>();
        final String networkId,condensationId;
        final JSONObject networkArt,condensationArt;
        private final HashMap<String,List<Motif>> motifs=new HashMap<>();
        private final List<String[]> routers,devices,links,exchanges,flows;
        private final Pattern doubt,reference,exclude,quote,join,change;
        Catalogue(JSONObject index){
            JSONObject rules=index.optJSONObject("regles"),net=index.optJSONObject("reseau"),glass=index.optJSONObject("condensation");
            doubt=pattern(rules,"doute",0);reference=pattern(rules,"renvoi",0);exclude=pattern(rules,"exclus",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
            quote=pattern(rules,"citations",0);join=pattern(rules,"liaison",0);change=pattern(rules,"rupture",0);
            networkId=net.optString("id");condensationId=glass.optString("id");networkArt=net.optJSONObject("dessin");condensationArt=glass.optJSONObject("dessin");
            JSONObject terms=net.optJSONObject("mots");
            routers=phrases(terms.optJSONArray("routeur"));devices=phrases(terms.optJSONArray("appareil"));links=phrases(terms.optJSONArray("lien"));
            exchanges=phrases(terms.optJSONArray("echange"));flows=phrases(terms.optJSONArray("flux"));
            JSONArray list=index.optJSONArray("fiches");
            for(int i=0;i<list.length();i++){
                JSONObject o=list.optJSONObject(i);Card c=new Card(o);cards.add(c);
                for(String[] word:phrases(o.optJSONArray("expressions")))add(new Motif(c,word,List.of(),List.of()));
                JSONArray contextual=o.optJSONArray("contextuelles");
                for(int j=0;contextual!=null&&j<contextual.length();j++){
                    JSONObject v=contextual.optJSONObject(j);
                    add(new Motif(c,words(v.optJSONArray("mots")),phrases(v.optJSONArray("avant")),phrases(v.optJSONArray("apres"))));
                }
            }
        }
        private void add(Motif motif){if(motif.words.length>0)motifs.computeIfAbsent(motif.words[0],k->new ArrayList<>()).add(motif);}
        private static Pattern pattern(JSONObject o,String key,int flags){
            // JavaScript whitespace includes non-breaking spaces and the BOM. Its word boundaries are ASCII.
            String ws="\\x09-\\x0d \\p{Zs}\\u2028\\u2029\\ufeff";
            String source=o.optString(key).replace("\\s",key.equals("liaison")?ws:"["+ws+"]");
            return Pattern.compile(source.replace("\\b","(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"),flags);
        }
        AtlasPlan compile(List<Script.Segment> parts){
            ArrayList<Window> result=new ArrayList<>();Window previous=null;
            for(Script.Segment s:parts){
                if(Thread.currentThread().isInterrupted())throw new CancellationException();
                if(s.type!=Script.SPOKEN||s.to<=s.from){previous=null;continue;}
                int start=0;while(start<s.text.length()&&Script.space(s.text.charAt(start)))start++;
                if(start==s.text.length()||Script.type(s.text.substring(start))!=Script.SPOKEN){previous=null;continue;}
                boolean continuous=previous!=null&&previous.to==s.from;
                Match hit=match(s,continuous?previous.card:null);
                if(hit==null){previous=null;continue;}
                if(continuous&&previous.card==hit.card)previous.to=s.to;
                else{previous=new Window(hit.card,s.from,s.to,hit.card.id.equals(networkId));result.add(previous);}
                previous.marks.addAll(hit.marks);
                if(previous.network!=null)previous.network.sample(hit);
            }
            for(Window w:result)w.finish(w.card.id.equals(condensationId));
            return new AtlasPlan(result);
        }
        private Match match(Script.Segment s,Card previous){
            if(exclude.matcher(s.text).find())return null;
            Tokens t=new Tokens(s.text);String line=t.line(0,t.size());
            if(doubt.matcher(line).find())return null;
            List<Candidate> candidates=new ArrayList<>();
            for(int i=0;i<t.size();i++){
                List<Motif> available=motifs.get(t.words.get(i).key);if(available==null)continue;
                for(Motif m:available){
                    if(!t.matches(m.words,i))continue;
                    int end=i+m.words.length;
                    if(!m.before.isEmpty()||!m.after.isEmpty()){
                        int a=m.before.isEmpty()?i:t.index(m.before,Math.max(0,i-16),i);
                        int b=m.after.isEmpty()?end-1:t.index(m.after,end,Math.min(t.size(),end+16));
                        if(a<0||b<0||s.text.substring(t.words.get(a).start,t.words.get(b).end).contains(";")||change.matcher(t.line(a,b)).find())continue;
                    }
                    candidates.add(new Candidate(m.card,i,end));
                }
            }
            candidates.sort(Comparator.comparingInt((Candidate c)->c.start).thenComparingInt(c->-c.end));
            Card chosen=null;int a=-1,b=-1;
            for(Candidate c:candidates){
                if(c.end<b||c.end==b&&c.start>a)continue;
                if(chosen!=null&&chosen!=c.card)return null;
                chosen=c.card;a=c.start;b=c.end;
            }
            Card card=chosen==null?previous:chosen;
            if(card==null)return null;
            boolean continuation=false,reminder=chosen==null&&t.quotes.isEmpty()&&reference.matcher(line).find();
            if(reminder){String padded=" "+line+" ";reminder=card.reminders.stream().anyMatch(padded::contains);}
            Match hit=new Match(card);
            double spoken=Math.max(0,Math.min(s.to,s.speechEnd<0?s.to:s.speechEnd)-s.from);
            if(card.id.equals(networkId)){
                int[] router=t.find(routers),link=t.find(links),exchange=t.find(exchanges);
                if(router!=null)hit.router=date(s,spoken,router[0]);
                if(link!=null)hit.links=date(s,spoken,link[0]);
                if(exchange!=null&&spoken>0){
                    double start=date(s,spoken,exchange[0]),end=Math.min(s.to,Math.min(start+1460,Math.max(start+900,date(s,spoken,exchange[1])+230)));
                    if(end>start)hit.signal=new Span(start,end);
                }
                continuation=(link!=null||hit.signal!=null)&&(router!=null||t.find(devices)!=null||t.find(flows)!=null);
            }else if(spoken>0){
                for(Step step:card.steps){
                    int[] cue=t.find(step.words);if(cue==null)continue;
                    continuation|=t.find(step.continuations)!=null;
                    double start=date(s,spoken,cue[0]),end=Math.min(s.to,Math.min(start+1520,Math.max(start+960,date(s,spoken,cue[1])+230)));
                    if(end>start)hit.marks.add(new Mark(start,end,step,cue[1]-cue[0],false));
                }
            }
            return chosen!=null||continuation||reminder?hit:null;
        }
        private final class Tokens {
            final String text;final List<Word> words=new ArrayList<>();final List<int[]> quotes=new ArrayList<>();
            Tokens(String text){
                this.text=text;Matcher m=WORD.matcher(text);while(m.find())words.add(new Word(m));
                m=quote.matcher(text);while(m.find())quotes.add(new int[]{m.start(),m.end()});
            }
            int size(){return words.size();}
            String line(int a,int b){StringBuilder s=new StringBuilder();for(int i=a;i<b;i++){if(i>a)s.append(' ');s.append(words.get(i).key);}return s.toString();}
            boolean matches(String[] motif,int i){
                if(i+motif.length>size())return false;
                for(int j=0;j<motif.length;j++)if(!motif[j].equals(words.get(i+j).key))return false;
                int a=words.get(i).start,b=words.get(i+motif.length-1).end;
                for(int[] q:quotes)if(a<q[1]&&b>q[0])return false;
                return join.matcher(text).region(a,b).matches();
            }
            int index(List<String[]> all,int a,int b){
                if(all.isEmpty())return -1;
                for(int i=a;i<b;i++)for(String[] m:all)if(i+m.length<=b&&matches(m,i))return i;
                return -1;
            }
            int[] find(List<String[]> all){
                int i=index(all,0,size());if(i<0)return null;
                int n=0;for(String[] m:all)if(m.length>n&&matches(m,i))n=m.length;
                return new int[]{words.get(i).start,words.get(i+n-1).end};
            }
        }
    }
    private static double date(Script.Segment s,double duration,int utf16){return s.from+duration*utf16/s.text.length();}
    static float[] floats(JSONArray a){float[] out=new float[a==null?0:a.length()];for(int i=0;i<out.length;i++)out[i]=(float)a.optDouble(i);return out;}
    private static List<String[]> phrases(JSONArray a){
        ArrayList<String[]> out=new ArrayList<>();for(int i=0;a!=null&&i<a.length();i++){String[] p=words(a.optJSONArray(i));if(p.length>0)out.add(p);}return out;
    }
    private static String[] words(JSONArray a){String[] out=new String[a==null?0:a.length()];for(int i=0;i<out.length;i++)out[i]=a.optString(i);return out;}
}
