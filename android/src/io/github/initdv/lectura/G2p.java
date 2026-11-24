package io.github.initdv.lectura;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** Port de g2p_fr.js et nombres.js : Lexique Lectura, jamais eSpeak ni une autre voix. */
final class G2p {
    private static final String VOY="aeiouyàâäéèêëîïôöùûüœæ", PHON_VOY="aɑeɛəioɔuyøœ";
    private static final Set<String> ENT=new HashSet<>(List.of(("souvent différent récent content présent client agent argent accident talent urgent patient évident excellent vent dent lent " +
        "accent absent innocent fréquent prudent permanent équivalent violent parent apparent transparent incident président résident continent " +
        "ingrédient orient coefficient récipient inconvénient intelligent compétent cohérent précédent serpent torrent adolescent comment " +
        "moment document élément argument instrument segment supplément complément vêtement bâtiment événement mouvement paiement traitement " +
        "gouvernement environnement abonnement équipement logement jugement engagement changement chargement développement fonctionnement " +
        "comportement département appartement règlement sentiment testament monument tourment ciment aliment").split(" ")));
    private static final Set<String> SIGLE_NON=Set.of("non","oui","eau","ami","bon","mal","cas","vie","fin","nom","mot","peu","pas","sur","par","air","feu","mur","fil","clé","vol","jeu","loi","roi");
    private static final Map<String,String> ELIDE=Map.ofEntries(Map.entry("l","l"),Map.entry("d","d"),Map.entry("j","ʒ"),Map.entry("n","n"),Map.entry("s","s"),Map.entry("m","m"),Map.entry("t","t"),Map.entry("c","s"),Map.entry("qu","k"),Map.entry("jusqu","ʒysk"),Map.entry("lorsqu","lɔʁsk"),Map.entry("puisqu","pɥisk"),Map.entry("quelqu","kɛlk"));
    private static final Map<String,Pattern> PATTERNS=new ConcurrentHashMap<>();
    private static final String[] UNIT={"zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize"};
    private static final String[] TENS={"","dix","vingt","trente","quarante","cinquante","soixante","soixante","quatre-vingt","quatre-vingt"};
    final JSONObject lex,letters,symbols,liaisons;final Set<String> clitics,tiret;
    G2p(JSONObject o){lex=object(o,"LEXIQUE");letters=object(o,"LETTRES");symbols=object(o,"SYMBOLES");liaisons=object(o,"LIAISONS");clitics=set(array(o,"CLITIQUES"));tiret=set(array(o,"TIRET"));}
    private static Set<String> set(JSONArray a){Set<String> s=new HashSet<>();for(int i=0;i<a.length();i++)s.add(a.optString(i));return s;}
    private static Pattern pat(String p){return PATTERNS.computeIfAbsent(p,Pattern::compile);}
    private static boolean re(String p,String s){return pat(p).matcher(s).find();}
    private static char at(String s,int i){return i>=0&&i<s.length()?s.charAt(i):'\u0000';}
    private static boolean has(String s,char c){return s.indexOf(c)>=0;}
    private static boolean v(char c){return has(VOY,c);}
    private static boolean c(char c){return (c>='a'&&c<='z'||c=='ç')&&!v(c);}
    private static boolean nasal(String w,int i){char a=at(w,i),b=at(w,i+1);return (a=='n'||a=='m')&&!v(b)&&!has("nmh",b);}
    private static String cut(String s,int n){return s.substring(0,s.length()-n);}
    private String rules(String mot){
        String w=mot;boolean muet=false,td=false;
        if(w.length()>3&&re("[^aeiouy]s$",w)&&!re("(us|is|as|os)$",w)||w.length()>2&&re("[aeéiou]s$",w))w=cut(w,1);
        if(!w.equals(mot)&&lex.has(w))return lex.optString(w);
        if(re("(eu|au|ou|oi|ai|ri)x$",w))w=cut(w,1);
        if(w.length()>4&&w.endsWith("ent")&&!ENT.contains(w)&&!ENT.contains(mot)){
            if(w.endsWith("ment")&&!re("(mm|rm|im|um)ent$",w))w=cut(w,1);
            else {w=cut(w,3)+"e";muet=true;}
        }else if(w.length()>2&&w.endsWith("e"))muet=true;
        else if(ENT.contains(w)||ENT.contains(mot))w=cut(w,1);
        else if(w.length()>2&&re("[^e][td]$",w)&&!re("(ct|pt|st)$",w)){w=cut(w,1);td=true;}
        else if(w.length()>3&&re("[^i]ng$",w))w=cut(w,1);
        StringBuilder out=new StringBuilder();int n=w.length();
        for(int i=0;i<n;){char a=w.charAt(i),b=at(w,i+1),e=at(w,i+2),p=at(w,i-1);String r=w.substring(i),ph;int k=1,rem=n-i;
            if(a==b&&c(a)&&!has("lsc",a)){i++;continue;}
            if(r.startsWith("eau")){ph="o";k=3;}
            else if(r.startsWith("œu")||r.startsWith("oeu")){ph="œ";k=a=='œ'?2:3;}
            else if(a=='œ')ph="œ";
            else if(re("^(ou|où|oû)ill",r)){ph="uj";k=5;}
            else if(re("^(ou|où|oû)",r)){ph=v(e)&&!(e=='e'&&rem<=3&&muet)?"w":"u";k=2;}
            else if(r.startsWith("oin")&&nasal(w,i+2)){ph="wɛ̃";k=3;}
            else if(r.startsWith("oy")&&v(e)){ph="waj";k=2;}
            else if(re("^o[iî]",r)){ph="wa";k=2;}
            else if(re("^(ueil|euil)l?",r)){ph="œj";k=at(r,4)=='l'?5:4;}
            else if(re("^[ae]ill",r)){ph=a=='a'?"aj":"ɛj";k=4;}
            else if(re("^[ae]il$",r)){ph=a=='a'?"aj":"ɛj";k=3;}
            else if(re("^(ain|aim|ein)",r)&&nasal(w,i+2)){ph="ɛ̃";k=3;}
            else if(r.startsWith("ay")&&v(e)){ph="ɛj";k=2;}
            else if(re("^(ai|aî|ei)",r)){ph="ɛ";k=2;}
            else if(r.startsWith("au")){ph="o";k=2;}
            else if(re("^e[uû]",r)){ph=re("^e[uû](r|[lfvnbp](e?$))",r)?"œ":"ø";k=2;}
            else if(r.startsWith("ien")&&nasal(w,i+2)){ph=has("ct",at(w,i+3))&&rem>3?"jɑ̃":"jɛ̃";k=3;}
            else if(r.equals("éen")){ph="eɛ̃";k=3;}
            else if(re("^(an|am|en|em)",r)&&nasal(w,i+1)){ph="ɑ̃";k=2;}
            else if(r.startsWith("emm")){ph="ɑ̃m";k=3;}
            else if(r.equals("um")){ph="ɔm";k=2;}
            else if(re("^(un|um)",r)&&nasal(w,i+1)){ph="œ̃";k=2;}
            else if(re("^(in|im|yn|ym|în)",r)&&nasal(w,i+1)){ph="ɛ̃";k=2;}
            else if(re("^(on|om)",r)&&nasal(w,i+1)){ph="ɔ̃";k=2;}
            else if(r.startsWith("chr")){ph="kʁ";k=3;}
            else if(r.startsWith("ch")){ph="ʃ";k=2;}
            else if(r.startsWith("ph")){ph="f";k=2;}
            else if(r.startsWith("th")){ph="t";k=2;}
            else if(r.startsWith("gn")){ph="nj";k=2;}
            else if(r.startsWith("qu")){ph="k";k=2;}
            else if(a=='q')ph="k";
            else if(r.startsWith("gu")&&has("eiyéèê",e)){ph="ɡ";k=2;}
            else if(r.startsWith("ge")&&has("aoô",e)){ph="ʒ";k=2;}
            else if(r.startsWith("sc")&&has("eiyéèê",e)){ph="s";k=2;}
            else if(r.startsWith("ss")){ph="s";k=2;}
            else if(r.startsWith("cc")){ph=has("eiyéè",e)?"ks":"k";k=2;}
            else if(r.startsWith("ill")&&c(p)){ph="ij";k=3;}
            else if(r.startsWith("ill")&&v(p)){ph="j";k=3;}
            else if(r.startsWith("ll")){ph="l";k=2;}
            else if(r.equals("ing")){ph="iŋ";k=3;}
            else if(re("^ti(on|el|al|eu|en)",r)&&p!='s'&&i>0){ph="sj";k=2;}
            else if(r.startsWith("ex")&&i==0&&(v(e)||e=='h')){ph="ɛɡz";k=2;}
            else if(a=='c'||a=='ç')ph=a=='ç'||has("eiyéèêë",b)?"s":"k";
            else if(a=='g')ph=has("eiyéèê",b)?"ʒ":"ɡ";
            else if(a=='s')ph=v(p)&&v(b)?"z":"s";
            else if(a=='x')ph=rem<=1&&re("[aeo]u$|i$",w.substring(0,i))?"":"ks";
            else if(a=='h')ph="";
            else if(a=='j')ph="ʒ";
            else if(a=='r')ph="ʁ";
            else if(a=='y')ph=v(p)||v(b)?"j":"i";
            else if(has("iîï",a))ph=v(b)&&!(b=='e'&&rem<=2&&muet)&&c(p)&&!(c(at(w,i-2))&&has("rl",p))?"j":"i";
            else if(has("uûùü",a))ph="y";
            else if(has("aàâä",a))ph="a";
            else if(has("oôö",a))ph=a!='ô'&&(b=='r'||(c(b)&&c(e)&&rem>2&&!(has("rl",e)&&has("bcdfgkptv",b))))?"ɔ":"o";
            else if(a=='é')ph="e";
            else if(has("èêë",a))ph="ɛ";
            else if(a=='e'){
                if(rem<=1)ph=muet&&n>2?"":"ə";
                else if(rem<=2&&(b=='r'&&n>3&&!td||b=='z'||b=='d')){ph="e";k=2;}
                else if(rem<=2&&b=='t'){ph="ɛ";k=2;}
                else if((rem<=2&&c(b))||b=='x')ph="ɛ";
                else if(c(b)&&b==e)ph=i==0&&has("fs",b)?"e":b=='s'&&w.startsWith("ress")?"ə":"ɛ";
                else if(c(b)&&c(e)&&!(has("rl",e)&&has("bcdfgkptv",b))&&!re("^.(ch|ph|th|gn|qu)",r))ph="ɛ";
                else ph=v(b)?"":"ə";
            }else ph=a>='a'&&a<='z'?String.valueOf(a):"";
            out.append(ph);i+=k;
        }
        return out.toString().replace('g','ɡ');
    }
    private static String caduc(String p){char[] s=p.toCharArray();for(int i=3;i<s.length-1;i++)if(s[i]=='ə'){
        char a=s[i-2]=='̃'?s[i-3]:s[i-2];if(!has(PHON_VOY,s[i-1])&&s[i-1]!='̃'&&has(PHON_VOY,a)&&!has(PHON_VOY,s[i+1]))s[i]=0;
    }return new String(s).replace("\u0000","");}
    private static String accent(String p){int k=-1;for(int i=p.length()-1;i>=0;i--)if(has(PHON_VOY,p.charAt(i))&&(p.charAt(i)!='ə'||k<0)){k=i;if(p.charAt(i)!='ə')break;}
        return k<0?p:p.substring(0,k)+"ˈ"+p.substring(k);}
    String word(String raw){String m=raw.toLowerCase(Locale.ROOT);boolean clitic=clitics.contains(m);
        String known=lex.optString(m,lex.optString(m.replace("oe","œ")));
        if(!known.isEmpty())return clitic?known:accent(known);
        boolean acronym=raw.length()>1&&raw.equals(raw.toUpperCase(Locale.ROOT))&&re("[A-Z]",raw)&&(!re("[aeiouy]",m)?raw.length()<=6:raw.length()<=3&&!SIGLE_NON.contains(m)&&!clitic);
        if(acronym||m.length()==1&&!"aày".contains(m)||m.length()>1&&!re("[aeiouyàâäéèêëîïôöùûüœ]",m)){
            List<String> s=new ArrayList<>();for(int i=0;i<m.length();i++){String l=letters.optString(m.substring(i,i+1));if(!l.isEmpty())s.add(accent(l));}return String.join(" ",s);
        }
        String p=caduc(rules(m));return clitic?p:accent(p);
    }
    // Mêmes cas sûrs que le G2P Piper Web ; laisser le cas ambigu au lexique courant.
    private static String context(String word,String earlier,String before,String after,String next){
        if(word.equals("fils")&&(re("^(électriques?|métalliques?)$",after)||
            after.equals("de")&&re("^(cuivre|coton|soie|laine|fer|nylon)$",next)||after.equals("du")&&re("^c[âa]ble$",next)))return "fil";
        if(word.equals("couvent")&&!re("^(ils|elles)$",earlier)&&re("^(le|un|du|au|ce|son|mon|ton|notre|votre|leur)$",before))return "kuvɑ̃";
        if(word.equals("président")&&re("^(ils|elles)$",before))return "pʁezid";
        return null;
    }
    private static boolean liaison(String next){
        return next.equals("yeux")||re("^hommes?$",next)||
            re("^[aeiouyhàâéèêîôûœ]",next)&&!re("^(h[aiou]|onze|oui|y[aeo]|héros$)",next);
    }
    private static String token(List<String> sequence,int i){return i<0||i>=sequence.size()?"":sequence.get(i).toLowerCase(Locale.ROOT);}
    String phrase(String source){return phrase(source,false);}
    String phrase(String source,boolean siwis){
        String s=Normalizer.normalize(source,Normalizer.Form.NFC).replace('’','\'').replace('`','\'')
            .replaceAll("[«»“”\"()\\[\\]{}]"," ").replaceAll("\\.{3}|…",".").replaceAll("(?i)aujourd'hui","aujourdhui");
        s=numbers(ClockWords.normalize(s).replaceAll("([0-9])\\s*%","$1 pour cent"));
        s=replace(s,"[@%&+=/\\\\#$€*_|<>~°]",m->" "+symbols.optString(m.group())+" ")
            .replaceAll("(^|\\s)-+(?=\\S)","$1");
        Matcher m=pat("(?iu)(?<![\\p{L}\\p{M}\\p{N}'-])(?:(?:qu|n)')?est[-‐‑]ce(?![\\p{L}\\p{M}\\p{N}])|[A-Za-zÀ-ÿœŒ]+'?|[.,;:!?]").matcher(s);
        List<String> tokens=new ArrayList<>();List<Integer> offsets=new ArrayList<>();
        while(m.find()){tokens.add(m.group());offsets.add(m.start());}
        List<String> out=new ArrayList<>();for(int i=0;i<tokens.size();i++){
            String word=tokens.get(i),lower=word.toLowerCase(Locale.ROOT),bare=word.replaceFirst("'$","");
            if(word.length()==1&&has(".,;:!?",word.charAt(0))){if(!out.isEmpty()){int k=out.size()-1;out.set(k,out.get(k).replaceFirst(" $","")+word+" ");}continue;}
            if(re("est[-‐‑]ce$",lower)){out.add(lower.startsWith("qu'")?"kɛs ":lower.startsWith("n'")?"nˈɛs ":"ɛs ");continue;}
            if(lower.endsWith("'")&&ELIDE.containsKey(cut(lower,1))){out.add(ELIDE.get(cut(lower,1)));continue;}
            String variant=context(lower,token(tokens,i-2),token(tokens,i-1),token(tokens,i+1),token(tokens,i+2));
            String ph=variant==null?word(bare):accent(variant);
            if(siwis&&lower.equals("huit")&&re("(?iu)^huit[ \\t\u00a0\u202f]+heures[ \\t\u00a0\u202f]+trente(?![\\p{L}\\p{M}\\p{N}‐‑-]|[ \\t\u00a0\u202f]+et[ \\t\u00a0\u202f]+un\\b)",s.substring(offsets.get(i))))ph="yˈit";
            if(siwis&&lower.equals("nuit"))ph="nyˈi";
            if(tiret.contains(lower))ph+="-";
            if(liaisons.has(lower)&&liaison(token(tokens,i+1)))ph+=liaisons.optString(lower);
            out.add(ph+" ");
        }
        return String.join("",out).trim().replaceAll("\\s+"," ").replace('g','ɡ').replace("ɲ","nj");
    }
    static long[] ids(String p,JSONObject table){
        List<Long> out=new ArrayList<>();JSONArray pad=array(table,"_");append(out,array(table,"^"));append(out,pad);
        Normalizer.normalize(p,Normalizer.Form.NFD).codePoints().forEach(c->{JSONArray a=table.optJSONArray(new String(Character.toChars(c)));if(a==null&&c=='ɥ')a=table.optJSONArray("y");if(a!=null){append(out,a);append(out,pad);}});
        append(out,array(table,"$"));long[] result=new long[out.size()];for(int i=0;i<result.length;i++)result[i]=out.get(i);return result;
    }
    private static void append(List<Long> a,JSONArray v){for(int i=0;i<v.length();i++)a.add(v.optLong(i));}
    private static String replace(String text,String pattern,Function<Matcher,String> fn){Matcher m=pat(pattern).matcher(text);StringBuffer b=new StringBuffer();while(m.find())m.appendReplacement(b,Matcher.quoteReplacement(fn.apply(m)));return m.appendTail(b).toString();}
    private static String under100(int n){if(n<17)return UNIT[n];if(n<20)return "dix-"+UNIT[n-10];int d=n/10,u=n%10;
        if(d==7||d==9)return TENS[d]+(d==7&&u==1?" et ":"-")+under100(10+u);
        if(u==0)return d==8?"quatre-vingts":TENS[d];return TENS[d]+(u==1&&d!=8?" et un":"-"+UNIT[u]);}
    private static String under1000(int n){int c=n/100,r=n%100;if(c==0)return under100(r);return (c>1?UNIT[c]+" ":"")+"cent"+(c>1&&r==0?"s":"")+(r>0?" "+under100(r):"");}
    static String digits(String s){if(s.length()>12||s.length()>1&&s.charAt(0)=='0'){List<String> a=new ArrayList<>();for(int i=0;i<s.length();i++)a.add(UNIT[s.charAt(i)-'0']);return String.join(" ",a);}
        long n=Long.parseLong(s);if(n<1000)return under1000((int)n);List<String> a=new ArrayList<>();int i=0;
        for(int f:new int[]{1000000000,1000000,1000}){int q=(int)(n/f);n%=f;if(q>0){String label=i==0?"milliard":i==1?"million":"mille";a.add(i==2&&q==1?label:under1000(q)+" "+label+(i<2&&q>1?"s":""));}i++;}
        if(n>0)a.add(under1000((int)n));return String.join(" ",a);
    }
    static String numbers(String s){s=replace(s,"([0-9]+),([0-9]+)",m->digits(m.group(1))+" virgule "+digits(m.group(2)));
        s=replace(s,"([0-9]+)((?:\\.[0-9]+)+)",m->digits(m.group(1))+replace(m.group(2),"\\.([0-9]+)",x->" point "+digits(x.group(1))));
        return replace(s.replaceAll("([0-9])\\s(?=[0-9]{3}\\b)","$1"),"[0-9]+",m->" "+digits(m.group())+" ");}
}
