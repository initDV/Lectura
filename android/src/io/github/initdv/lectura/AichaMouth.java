package io.github.initdv.lectura;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** Phonetic envelopes from aicha/mouth.js. Windows are in source milliseconds. */
final class AichaMouth {
    private static final String[] PHONES={"aɑæɐ","ɛeəɜɚɪ","ij","oɔœøɒ","uüyʊwɥ","mbp","fv","lnɲ","szʃʒ",".!?…",",;:"};
    private static final double[] WEIGHTS={1.8,1.65,1.65,1.8,1.7,.94,1.04,.99,1.04,.99,1.55,.9};
    private static final double[][] SHAPES={
        {1.02,3.42,.10,1.64,0,.12},{1.08,2.06,.01,.96,0,0},{1.17,1.04,0,.39,0,0},
        {.69,2.72,.79,1.28,0,0},{.52,1.58,1,.54,0,0},{.96,0,0,.04,0,0},
        {.91,.78,0,.28,1,0},{1,1.75,.05,.68,0,1},{1.03,.83,.21,.26,0,0},
        REST_MOUTH,REST_MOUTH,{.94,.92,.16,.32,0,0}
    };
    private static final class Phone extends Interval {
        final double[] form;
        Phone(double a,double b,double[] form){super(a,b);this.form=form;}
    }
    private static final class Phrase extends Interval {
        final List<Phone> phones;
        Phrase(double a,double b,List<Phone> phones){super(a,b);this.phones=phones;}
    }
    private final List<Phrase> track=new ArrayList<>();
    static String english(String s){return s.toLowerCase(Locale.ROOT).replaceAll("oo|ou","u").replaceAll("ee|ea","i").replace("ph","f").replaceAll("sh|ch","ʃ");}
    void add(String phonemes,double start,double end){
        if(end<=start)return;
        var counts=new ArrayList<Phone>();double total=0;
        for(int i=0;i<phonemes.length();){
            int c=phonemes.codePointAt(i);i+=Character.charCount(c);
            if(!Character.isLetter(c)&&".!?…,;:".indexOf(c)<0)continue;
            int type=0;while(type<PHONES.length&&PHONES[type].indexOf(c)<0)type++;
            double next=total+WEIGHTS[type];counts.add(new Phone(total,next,SHAPES[type]));total=next;
        }
        if(counts.isEmpty())return;
        var phones=new ArrayList<Phone>(counts.size());
        for(Phone p:counts)phones.add(new Phone(start+(end-start)*(p.start/total),start+(end-start)*(p.end/total),p.form));
        track.add(new Phrase(start,end,phones));
    }
    private static double[] blend(double[] a,double[] b,double u){double[] v=new double[a.length];for(int i=0;i<v.length;i++)v[i]=mix(a[i],b[i],u);return v;}
    double[] atTime(double ms,double gain){
        if(gain<=0)return REST_MOUTH;
        Phrase phrase=at(track,ms);Phone p=phrase==null?null:at(phrase.phones,ms);if(p==null)return REST_MOUTH;
        double span=p.end-p.start;Phone before=at(phrase.phones,p.start-.0001),after=at(phrase.phones,p.end);
        double in=min(22,min(span*.27,(before==null?span:before.end-before.start)*.34));
        double out=min(22,min(span*.27,(after==null?span:after.end-after.start)*.34));
        double[] form=ms-p.start<in?blend(before==null?REST_MOUTH:before.form,p.form,smooth(p.start-in,p.start+in,ms)):
            p.end-ms<out?blend(p.form,after==null?REST_MOUTH:after.form,smooth(p.end-out,p.end+out,ms)):p.form;
        double edge=min(37,(phrase.end-phrase.start)*.22),k=bound(gain)*smooth(phrase.start,phrase.start+edge,ms)*(1-smooth(phrase.end-edge,phrase.end,ms));
        return blend(REST_MOUTH,form,k);
    }
}
