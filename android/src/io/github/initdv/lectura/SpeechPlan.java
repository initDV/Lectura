package io.github.initdv.lectura;

import org.json.JSONObject;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Android speech only. All ranges and cursor maps refer to the unmodified UTF-16 source. */
final class SpeechPlan {
    static final int MAX_TEXT=12000;
    private static final int CHUNK=165;
    private static final Pattern ABBR=Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(?:(?:m|mme|mlle|dr|pr|st|ste|av|env|réf|cf|vol|n°|mr|mrs|ms|prof|vs)\\.(?=[ \\t]+[\\p{L}\\p{N}])|p\\.[ \\t]*ex\\.|(?:[a-z]\\.){2,}|(?:etc)\\.(?=[,;:!?]))");
    private static final Pattern URL=Pattern.compile("(?i)(?:https?://|ftp://|mailto:|www\\.)[^\\s<>«»\\[\\]()\"']+");
    private static final Pattern LINK=Pattern.compile("(!?)\\[([^]\\n]*)\\]\\(([^)\\n]*)\\)");
    private static final Pattern WORD=Pattern.compile("[\\p{L}\\p{M}]+(?:['’\\-][\\p{L}\\p{M}]+)*");
    private static final Pattern NUMBER=Pattern.compile("(?:[−-][ \\t]*)?([$€])?[0-9]+(?:[.,:][0-9]+)*(?:[ \\t]*[€$])?");
    private static final Pattern END_WORD=Pattern.compile("[\\p{L}\\p{N}]");

    static final class Fragment {
        final Script.Segment original;
        final String spoken;
        final boolean question;
        int pauseMs;
        Fragment(Script.Segment source,String text,int[] map,int silence,boolean question) {
            original=source;spoken=text;pauseMs=silence;this.question=question;
            original.cursor=map;
        }
        long pauseFrames(int rate) {return Math.round(pauseMs*rate/1000.);}
    }

    static List<Fragment> plan(String source,String lang,JSONObject lexicon) {
        List<Fragment> result=new ArrayList<>();
        for(int start=0;start<source.length();) {
            int end=start;while(end<source.length()&&source.charAt(end)!='\n'&&source.charAt(end)!='\r')end++;
            int next=end;
            if(next<source.length()&&source.charAt(next)=='\r')next++;
            if(next<source.length()&&source.charAt(next)=='\n')next++;
            String line=source.substring(start,end);int before=result.size();
            int type=Script.type(line);
            if(type!=Script.SPOKEN) {
                result.add(new Fragment(new Script.Segment(line,start,end,type),"",null,0,false));
            } else if(!line.isEmpty()) {
                boolean[] ignore=new boolean[line.length()], literal=new boolean[line.length()];
                mark(line,ignore,literal);
                int from=0,lastWord=0;
                for(int i=0;i<line.length();) {
                    char c=line.charAt(i);
                    if(Script.space(c)&&!ignore[i]&&!literal[i])lastWord=i+1;
                    if(i-from>=CHUNK&&!ignore[i]&&!literal[i]) {
                        int mid=lastWord>from+CHUNK/2?lastWord:i;
                        if(mid>from&&mid<line.length()&&Character.isLowSurrogate(line.charAt(mid)))mid--;
                        if(mid>from){emit(result,line,start,from,mid,ignore,literal,lang,lexicon,0,false);from=mid;}
                    }
                    int gap=boundary(line,i,ignore,literal);
                    if(gap==0){i++;continue;}
                    boolean question=c=='?';int last=i+1;
                    while(last<line.length()) {
                        int m=boundary(line,last,ignore,literal);char tail=line.charAt(last);
                        if(m>0) {gap=Math.max(gap,m);question|=tail=='?';last++;}
                        else if(Script.space(tail)||"\"'’”»)]}*_`".indexOf(tail)>=0)last++;
                        else break;
                    }
                    emit(result,line,start,from,last,ignore,literal,lang,lexicon,gap,question);
                    from=i=last;
                }
                emit(result,line,start,from,line.length(),ignore,literal,lang,lexicon,0,false);
            }
            if(next>end) {
                if(result.size()>before||!result.isEmpty()) {
                    Fragment f=result.get(result.size()-1);f.pauseMs=Math.max(f.pauseMs,560);
                } else result.add(new Fragment(new Script.Segment(source.substring(start,next),start,next,Script.PAUSE),"",null,560,false));
            }
            start=next;
        }
        return result;
    }

    private static void mark(String line,boolean[] ignore,boolean[] literal) {
        if(line.stripLeading().matches("```[\\p{L}0-9_+-]*[ \\t]*")) {Arrays.fill(ignore,true);return;}
        Matcher m=LINK.matcher(line);
        while(m.find()) {
            if(!m.group(1).isEmpty())Arrays.fill(ignore,m.start(),m.end(),true);
            else {Arrays.fill(ignore,m.start(),m.start(2),true);Arrays.fill(ignore,m.end(2),m.end(),true);}
        }
        m=ABBR.matcher(line);while(m.find())Arrays.fill(literal,m.start(),m.end(),true);
        m=URL.matcher(line);while(m.find()) {
            int end=m.end();while(end>m.start()&&".,;:!?…".indexOf(line.charAt(end-1))>=0)end--;
            Arrays.fill(literal,m.start(),end,true);
        }
        for(int i=1;i+1<line.length();i++) {
            char a=line.charAt(i-1),c=line.charAt(i),b=line.charAt(i+1);
            boolean digits=asciiDigit(a)&&asciiDigit(b);
            if(c=='.'&&(digits||Character.isLetter(a)&&Character.isLetter(b))
                ||(c==','||c==':')&&digits||c==':'&&line.startsWith("://",i))literal[i]=true;
        }
    }
    private static boolean asciiDigit(char c){return c>='0'&&c<='9';}
    private static int boundary(String line,int i,boolean[] ignore,boolean[] literal) {
        if(ignore[i]||literal[i])return 0;
        switch(line.charAt(i)) {
            case ',': return 140;
            case ':': return 200;
            case ';': return 240;
            case '.': return line.startsWith("...",i)||i>0&&line.charAt(i-1)=='.'&&line.startsWith("..",i)?480:320;
            case '?': return 360;
            case '!': return 400;
            case '…': return 480;
            default: return 0;
        }
    }
    private static void emit(List<Fragment> out,String line,int start,int from,int to,boolean[] ignore,boolean[] literal,
                             String lang,JSONObject lex,int gap,boolean question) {
        while(from<to&&Script.space(line.charAt(from)))from++;
        while(to>from&&Script.space(line.charAt(to-1)))to--;
        if(from==to)return;
        String raw=line.substring(from,to);boolean fr=!lang.equals("en");Builder b=new Builder();
        Matcher words=WORD.matcher(line),numbers=NUMBER.matcher(line);
        for(int i=from;i<to;) {
            int pos=start+i,cp=line.codePointAt(i),n=Character.charCount(cp);
            if(ignore[i]) {b.space(pos);i+=n;continue;}
            if(fr&&(cp=='$'||cp=='€'||cp=='-'||cp=='−'||cp>='0'&&cp<='9')&&numbers.region(i,to).lookingAt()) {
                String rawNumber=numbers.group();String spoken=number(rawNumber);
                b.word(spoken,pos);i=numbers.end();if(i<to&&(Character.isLetterOrDigit(line.codePointAt(i))))b.space(start+i);continue;
            }
            if(Character.isLetter(cp)&&words.region(i,to).lookingAt()) {
                String word=words.group(),replacement=lex.optString(Normalizer.normalize(word,Normalizer.Form.NFC).toLowerCase(Locale.ROOT),"");
                if(!replacement.isEmpty())b.word(replacement,pos);
                else for(int j=i;j<words.end();j++)b.append(String.valueOf(line.charAt(j)),start+j);
                i=words.end();continue;
            }
            switch(cp) {
                case '%': b.word(fr?"pour cent":"percent",pos);break;
                case '@': b.word(fr?"arobase":"at",pos);break;
                case '&': b.word(fr?"et":"and",pos);break;
                case '+': b.word(fr?"plus":"plus",pos);break;
                case '=': b.word(fr?"égale":"equals",pos);break;
                case '.':
                    if(literal[i]&&i>0&&i+1<line.length()&&Character.isLetter(line.charAt(i-1))&&Character.isLetter(line.charAt(i+1)))b.word(fr?"point":"dot",pos);
                    else b.append(".",pos);
                    break;
                case ':': if(literal[i]&&line.startsWith("://",i))b.space(pos);else b.append(":",pos);break;
                case ',': case ';': case '?': case '!': case '…': b.append(new String(Character.toChars(cp)),pos);break;
                default: if(Character.isLetterOrDigit(cp)||Character.getType(cp)==Character.NON_SPACING_MARK)b.append(new String(Character.toChars(cp)),pos);else b.space(pos);
            }
            i+=n;
        }
        String spoken=b.text.toString().stripTrailing();
        if(!END_WORD.matcher(spoken).find())spoken="";
        // A second run of decorative punctuation adjacent to the first must not add another silence.
        if(spoken.isEmpty()&&gap>0&&!out.isEmpty()&&out.get(out.size()-1).original.start>=start) {
            Fragment previous=out.get(out.size()-1);previous.pauseMs=Math.max(gap,previous.pauseMs);return;
        }
        if(spoken.isEmpty()&&gap==0)return;
        int kind=spoken.isEmpty()?Script.PAUSE:Script.SPOKEN;
        out.add(new Fragment(new Script.Segment(raw,start+from,start+to,kind),spoken,
            spoken.isEmpty()?null:Arrays.copyOf(b.map,spoken.length()),gap,question));
    }
    private static String number(String raw) {
        String s=raw.replaceAll("[ \\t]","");boolean minus=s.startsWith("-")||s.startsWith("−");
        if(minus)s=s.substring(1);boolean dollars=s.indexOf('$')>=0,euros=s.indexOf('€')>=0;
        s=s.replace("$","").replace("€","");String[] pieces=s.split("[.,:]");
        String spoken=G2p.digits(pieces[0]);int pos=pieces[0].length();
        for(int i=1;i<pieces.length;i++) {char c=s.charAt(pos);String p=pieces[i];
            if(c==':'&&i==1&&pieces.length==2&&p.length()==2&&pieces[0].length()<=2) {
                spoken+=pieces[0].equals("1")?" heure":" heures";
                if(!p.equals("00"))spoken+=" "+G2p.digits(p.startsWith("0")?p.substring(1):p);
            }else spoken+=(c==','?" virgule ":" point ")+G2p.digits(p);
            pos+=p.length()+1;
        }
        return (minus?"moins ":"")+spoken+(euros?" euro"+(s.equals("1")?"":"s"):dollars?" dollar"+(s.equals("1")?"":"s"):"");
    }
    private static final class Builder {
        final StringBuilder text=new StringBuilder();int[] map=new int[64];
        void space(int position){if(text.length()>0&&text.charAt(text.length()-1)!=' ')append(" ",position);}
        void word(String s,int position){space(position);append(s,position);space(position);}
        void append(String s,int position){
            if(text.length()+s.length()>map.length)map=Arrays.copyOf(map,Math.max(map.length*2,text.length()+s.length()));
            Arrays.fill(map,text.length(),text.length()+s.length(),position);text.append(s);
        }
    }
}
