package io.github.initdv.lectura;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.MatchResult;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Port de horaire.js ; conserve les indices UTF-16 du texte d'origine. */
final class ClockWords {
    static final Pattern NUMERIC=Pattern.compile("(?<![\\p{L}\\p{M}\\p{N}.,:/+−-])([01]?[0-9]|2[0-3])(?:[ \\t\u00a0\u202f]*[hH][ \\t\u00a0\u202f]*|:)([0-5][0-9])(?![\\p{L}\\p{M}\\p{N}]|[.:,/-][0-9])");
    private static final Map<String,Integer> NUMBERS=new HashMap<>();
    private static final Pattern WORDS;
    static {
        for(int n=0;n<60;n++)NUMBERS.put(G2p.digits(Integer.toString(n)),n);
        WORDS=Pattern.compile("(?iu)(?<![\\p{L}\\p{M}\\p{N}-])(une|"+words(24)+")[ \\t\u00a0\u202f]+heures?[ \\t\u00a0\u202f]+(et demie|et quart|"+words(60)+")(?![\\p{L}\\p{M}\\p{N}-])");
    }
    private static String words(int n){return NUMBERS.keySet().stream().filter(k->NUMBERS.get(k)<n)
        .sorted((a,b)->Integer.compare(b.length(),a.length())).collect(Collectors.joining("|"));}
    static String spoken(MatchResult m){
        int h=Integer.parseInt(m.group(1)),min=Integer.parseInt(m.group(2));
        return (h==1?"une heure":G2p.digits(Integer.toString(h))+" heure"+(h==0?"":"s"))
            +(min==0?"":" "+G2p.digits(Integer.toString(min)));
    }
    static String normalize(String text){
        Matcher m=NUMERIC.matcher(text);StringBuffer out=new StringBuffer();
        while(m.find())m.appendReplacement(out,spoken(m));
        return m.appendTail(out).toString();
    }
    static final class Time {
        final int index,length;final String label;
        Time(int index,int length,int h,int m){this.index=index;this.length=length;label=String.format(Locale.ROOT,"%02d:%02d",h,m);}
    }
    static Time first(String text){
        Matcher a=NUMERIC.matcher(text),b=WORDS.matcher(text);boolean digits=a.find(),mots=b.find();
        if(digits&&(!mots||a.start()<b.start()))return new Time(a.start(),a.end()-a.start(),Integer.parseInt(a.group(1)),Integer.parseInt(a.group(2)));
        if(!mots)return null;
        String h=b.group(1).toLowerCase(Locale.ROOT),m=b.group(2).toLowerCase(Locale.ROOT);
        return new Time(b.start(),b.end()-b.start(),h.equals("une")?1:NUMBERS.get(h),m.equals("et demie")?30:m.equals("et quart")?15:NUMBERS.get(m));
    }
}
