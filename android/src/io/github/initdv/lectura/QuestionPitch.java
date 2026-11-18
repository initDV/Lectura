package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.List;

/** Gentle duration-preserving pitch lift, only on a confidently voiced question tail. */
final class QuestionPitch {
    private QuestionPitch(){}
    static boolean lift(float[] pcm,int from,int to,int rate) {
        int step=rate/100,window=rate/64,lo=Math.max(2,rate/390),hi=rate/70;
        int start=Math.max(from+window+hi,to-520*rate/1000),last=-1,first=-1,missed=0;
        int[] periods=new int[1+Math.max(0,to-start)/step];
        for(int p=to-window;p>=start;p-=step) {
            int k=(p-start)/step,period=period(pcm,p,window,lo,hi);
            periods[k]=period;
            if(period>0) {if(last<0)last=p;first=p;missed=0;}
            else if(last>=0&&++missed>=3)break;
        }
        if(first<0||last-first<rate*85/1000)return false;
        int end=Math.min(to,last+window/2),begin=Math.max(first,last-310*rate/1000);
        int span=end-begin;if(span<step*8)return false;
        List<Integer> marks=new ArrayList<>();List<Integer> sizes=new ArrayList<>();
        int cursor=begin;
        while(cursor<end) {
            int p=periods[Math.min(periods.length-1,Math.max(0,(cursor-start)/step))];
            if(p==0)p=sizes.isEmpty()?rate/180:sizes.get(sizes.size()-1);
            if(!marks.isEmpty()) {
                int prev=marks.get(marks.size()-1);cursor=aligned(pcm,prev,prev+p,Math.max(2,p/5));
                if(cursor>=end)break;
            }
            marks.add(cursor);sizes.add(p);cursor+=p;
        }
        if(marks.size()<5)return false;
        float[] samples=new float[span],weights=new float[span];int j=0;
        for(double p=begin;p<end;) {
            int pos=(int)Math.round(p),period=sizes.get(j);
            while(j+1<marks.size()&&Math.abs(marks.get(j+1)-pos)<Math.abs(marks.get(j)-pos))j++;
            period=sizes.get(j);int source=marks.get(j);
            for(int i=Math.max(-period,begin-pos);i<=Math.min(period,end-pos-1);i++) {
                int at=source+i;if(at<from||at>=to)continue;
                float w=(float)(.5+.5*Math.cos(Math.PI*i/period));samples[pos+i-begin]+=w*pcm[at];weights[pos+i-begin]+=w;
            }
            double u=(p-begin)/span,curve=u*u*(3-2*u);
            p+=period/Math.pow(2,3*curve/12.); // a smooth rise to at most three semitones
        }
        int fade=Math.max(1,18*rate/1000);
        for(int i=0;i<span;i++)if(weights[i]>.12f) {
            double mix=Math.min(1,Math.min(i,span-1-i)/(double)fade);mix=mix*mix*(3-2*mix);
            pcm[begin+i]=(float)(pcm[begin+i]*(1-mix)+samples[i]/weights[i]*mix);
        }
        return true;
    }
    private static int aligned(float[] x,int previous,int predicted,int search) {
        if(predicted+2*search>=x.length||previous<search)return predicted;
        int best=predicted;double score=-2;
        for(int p=predicted-search;p<=predicted+search;p+=2) {
            double xy=0,xx=0,yy=0;
            for(int j=-search;j<=search;j+=2){float a=x[previous+j],b=x[p+j];xy+=a*b;xx+=a*a;yy+=b*b;}
            double r=xy/Math.sqrt(Math.max(1e-10,xx*yy))-.05*Math.abs(p-predicted)/search;
            if(r>score){score=r;best=p;}
        }
        return best;
    }
    private static int period(float[] x,int at,int win,int lo,int hi) {
        int from=at-win/2,to=at+win/2,skip=2;
        double mean=0;for(int i=from;i<to;i+=skip)mean+=x[i];mean/=((to-from+1)/skip);
        double xx=0;for(int i=from;i<to;i+=skip){double a=x[i]-mean;xx+=a*a;}
        if(xx<win*.000026)return 0;
        double[] corr=new double[hi+1];double best=.63;
        for(int lag=lo;lag<=hi;lag+=skip) {
            double xy=0,yy=0;
            for(int i=from;i<to;i+=skip) {double a=x[i]-mean,b=x[i-lag]-mean;xy+=a*b;yy+=b*b;}
            double r=xy/Math.sqrt(Math.max(1e-12,xx*yy));corr[lag]=r;
            if(r>best)best=r;
        }
        for(int lag=lo+skip;lag<=hi-skip;lag+=skip)if(corr[lag]>=Math.max(.64,best*.91)&&corr[lag]>corr[lag-skip]&&corr[lag]>=corr[lag+skip])return lag;
        return 0;
    }
}
