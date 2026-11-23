package io.github.initdv.lectura;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Voiced-tail PSOLA. Keep in sync with question-pitch.js (shared contour tests). */
final class QuestionPitch {
    private static final Pattern MARKS=Pattern.compile("\\p{M}+");
    private static final Pattern QUOTES=Pattern.compile("^[\\s«“\"(]+|[\\s»”\"')\\]}]+$",Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern QUESTION=Pattern.compile("[^!?]\\?$");
    private static final Pattern EST_CE=Pattern.compile("^est-ce (?:que\\b|qu')");
    private static final Pattern OPEN=Pattern.compile("\\b(qui|que|quoi|quand|ou|pourquoi|comment|combien|quel(?:le)?s?)\\b|\\bou bien\\b");
    private static final Pattern CLOSED=Pattern.compile("^(?:vraiment|ah bon|d'accord|c'est vrai)$|^est-ce (?:que\\s|qu')|"
        +"^(?:tu|vous|il|elle|on|ils|elles|je|nous)\\s+\\p{L}|^\\p{L}+-(?:t-)?(?:je|tu|il|elle|on|nous|vous|ils|elles)\\b");
    private QuestionPitch(){}

    static boolean closed(String text){
        String s=QUOTES.matcher(MARKS.matcher(Normalizer.normalize(text,Normalizer.Form.NFD)).replaceAll("")
            .toLowerCase(Locale.ROOT).replace('’','\'')).replaceAll("");
        if(!QUESTION.matcher(s).find())return false;
        String words=s.substring(0,s.length()-1).trim();
        return !OPEN.matcher(EST_CE.matcher(words).replaceFirst("")).find()&&CLOSED.matcher(words).find();
    }

    private static final class Pulse {
        final int at,lag;
        Pulse(int at,int lag){this.at=at;this.lag=lag;}
    }
    private static int frames(double ms,int rate){return (int)Math.round(ms*rate/1000);}
    private static double smooth(double x){double u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);}
    private static double median(List<Pulse> a,int from,int to){
        int[] p=new int[to-from];for(int i=from;i<to;i++)p[i-from]=a.get(i).lag;
        Arrays.sort(p);return p[p.length/2];
    }

    /** Does not mutate the phrase cache. Leaves unvoiced, uncertain or naturally rising tails untouched. */
    static float[] adjust(float[] x,int from,int to,int rate,int extraMs){
        if(rate<8000||rate>48000||from<0||to>x.length||to-from<frames(105,rate))return x;
        int step=frames(8,rate),half=frames(11,rate),lo=2*(rate/960),hi=2*((rate+143)/144);
        double[] corr=new double[hi+1];List<Pulse> tail=new ArrayList<>();
        int start=Math.max(from+half+hi,to-frames(460,rate));
        for(int at=to-half;at>=start;at-=step){
            int p=period(x,at,half,lo,hi,corr);double hz=p==0?0:rate/(double)p;
            if(hz<84||hz>420){if(!tail.isEmpty()||to-at>frames(150,rate))break;continue;}
            if(!tail.isEmpty()&&Math.abs(Math.log(p/(double)tail.get(tail.size()-1).lag))>.19)break;
            tail.add(new Pulse(at,p));if(tail.size()*step>=frames(220,rate))break;
        }
        int n=tail.size();if(n<11)return x;java.util.Collections.reverse(tail);
        double early=rate/median(tail,0,5),late=rate/median(tail,n-4,n),mid=rate/median(tail,n-9,n-4);
        if(late>early*1.06||late>mid*1.08)return x; // Do not double the speaker's own rise.
        double target=early*1.19,maxRatio=extraMs==0?Math.pow(2,3/12.):1.65;
        if(target>420||target/late>maxRatio*1.06)return x;

        int begin=tail.get(0).at,end=tail.get(n-1).at+frames(4,rate),span=end-begin;
        int extra=frames(extraMs,rate),length=span+extra;
        List<Integer> marks=new ArrayList<>();marks.add(begin);
        for(int at=begin;;){
            int p=(int)Math.round(lagAt(tail,at,begin,step)),next=aligned(x,at,at+p,p,from,to);
            if(next>=end)break;
            marks.add(next);at=next;
        }
        if(marks.size()<7)return x;
        float[] y=new float[length],weights=new float[length];int i=0,ramp=frames(32,rate);
        for(double pos=0;pos<length;){
            double source=begin+pos*span/length;
            while(i+1<marks.size()&&Math.abs(marks.get(i+1)-source)<Math.abs(marks.get(i)-source))i++;
            int mark=marks.get(i),p=(int)Math.round(lagAt(tail,mark,begin,step)),dst=(int)Math.round(pos);
            for(int j=Math.max(-p,Math.max(-dst,from-mark));j<=Math.min(p,Math.min(length-1-dst,to-1-mark));j++){
                double w=.5+.5*Math.cos(Math.PI*j/p);
                y[dst+j]+=w*x[mark+j];weights[dst+j]+=w;
            }
            double lag=lagAt(tail,source,begin,step),natural=rate/lag;
            double wanted=early*(1+.19*smooth((source-begin)/span/.88));
            double increase=Math.max(0,Math.min(maxRatio-1,wanted/natural-1));
            pos+=lag/(1+increase*smooth(pos/ramp));
        }
        int fade=frames(16,rate);
        for(int k=fade;k<length-fade;k++)if(weights[k]<.15f)return x;
        float[] out=Arrays.copyOf(x,x.length+extra);
        System.arraycopy(x,end,out,end+extra,x.length-end);
        for(int k=0;k<length;k++){
            double value=y[k]/(double)weights[k];
            if(k<fade||k>=length-fade){
                double mix=smooth(Math.min(k,length-1-k)/(double)fade);
                float original=x[begin+k-(k<fade?0:extra)];
                value=weights[k]<.15f?original:value*mix+original*(1-mix);
            }
            out[begin+k]=(float)value;
        }
        return out;
    }

    private static double lagAt(List<Pulse> tail,double pos,int begin,int step){
        double idx=Math.max(0,Math.min(tail.size()-1,(pos-begin)/step));
        int k=(int)idx,a=tail.get(k).lag,b=tail.get(Math.min(k+1,tail.size()-1)).lag;
        return a+(b-a)*(idx-k);
    }
    private static int aligned(float[] x,int previous,int predicted,int p,int from,int to){
        int search=Math.max(2,(int)Math.round(p*.22)),half=Math.max(2,(int)Math.round(p*.5));
        if(previous-half<from||predicted-half-search<from||predicted+half+search>=to)return predicted;
        int best=predicted;double score=-2;
        for(int k=predicted-search;k<=predicted+search;k++){
            double xy=0,xx=0,yy=0;
            for(int j=-half;j<=half;j+=2){double a=x[previous+j],b=x[k+j];xy+=a*b;xx+=a*a;yy+=b*b;}
            double r=xy/Math.sqrt(Math.max(1e-12,xx*yy))-.07*Math.abs(k-predicted)/search;
            if(r>score){best=k;score=r;}
        }
        return best;
    }
    private static int period(float[] x,int at,int half,int lo,int hi,double[] corr){
        int from=at-half,to=at+half;double sum=0,sq=0;
        for(int i=from;i<to;i+=2){double a=x[i];sum+=a;sq+=a*a;}
        double xx=sq-sum*sum/half;if(xx<half*.00005)return 0;
        double best=.73;
        for(int lag=lo;lag<=hi;lag+=2){
            double sy=0,yy=0,xy=0;
            for(int i=from;i<to;i+=2){double a=x[i],b=x[i-lag];sy+=b;yy+=b*b;xy+=a*b;}
            double r=(xy-sum*sy/half)/Math.sqrt(Math.max(1e-12,xx*(yy-sy*sy/half)));
            corr[lag]=r;best=Math.max(best,r);
        }
        for(int lag=lo+2;lag<hi;lag+=2)
            if(corr[lag]>=Math.max(.74,best*.91)&&corr[lag]>corr[lag-2]&&corr[lag]>=corr[lag+2])return lag;
        return 0;
    }
}
