package io.github.initdv.lectura;

import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;
import static java.lang.Math.*;

/** Numeric pose in the rig's own coordinates, independent of rendering and frame rate. */
final class RigPose {
    static final int GLIDE_MS=320;
    private final JSONObject expressions;
    private final String[] keys;
    private final double[] neutral;
    private final boolean[] limbs;
    private final Map<String,Integer> indices=new HashMap<>();

    RigPose(JSONObject neutral,JSONObject expressions){
        this.expressions=expressions;
        keys=new String[neutral.length()];this.neutral=new double[keys.length];limbs=new boolean[keys.length];
        int i=0;
        for(var it=neutral.keys();it.hasNext();i++){
            String k=it.next();keys[i]=k;indices.put(k,i);this.neutral[i]=neutral.optDouble(k);
            limbs[i]=k.startsWith("arm")||k.startsWith("fore");
        }
    }
    double[] rest(){return neutral.clone();}
    double value(double[] pose,String name){Integer i=indices.get(name);return i==null?0:pose[i];}
    double[] resolve(Mood.Pose p){return resolve(p.expr,p.strength,p.mix,p.weight);}
    double[] resolve(String id,double force,String mix,double weight){
        JSONObject a=expressions.optJSONObject(id),b=expressions.optJSONObject(mix);
        double f=clamp(force,0,1.25),w=b==null||b.length()==0?0:clamp(weight,0,.5),pal=ease((f-.56)/.08);
        double[] result=new double[keys.length];
        for(int i=0;i<keys.length;i++){
            String k=keys[i];double n=neutral[i],va=a==null?n:a.optDouble(k,n),vb=b==null?n:b.optDouble(k,n);
            // Strength controls how fully a pose is taken. Both poses participate, including the limbs.
            double value=n+(va+(vb-va)*w-n)*(limbs[i]?pal:f);
            if(k.equals("r"))value=clamp(value,6,15);
            if(k.equals("lid"))value=clamp(value,.15,1);
            if(k.equals("w"))value=clamp(value,20,64);
            result[i]=value;
        }
        return result;
    }
    static double ease(double t){t=clamp(t,0,1);return t*t*(3-2*t);}
    private static double clamp(double t,double lo,double hi){return max(lo,min(hi,t));}
    static void mix(double[] from,double[] to,double amount,double[] out){
        if(amount<=0)System.arraycopy(from,0,out,0,out.length);
        else if(amount>=1)System.arraycopy(to,0,out,0,out.length);
        else for(int i=0;i<out.length;i++)out[i]=from[i]+(to[i]-from[i])*amount;
    }
    void idle(double[] pose,double[] target,double dt){
        double face=1-exp(-dt/110),arm=1-exp(-dt/190);
        for(int i=0;i<pose.length;i++)pose[i]+=(target[i]-pose[i])*(limbs[i]?arm:face);
    }
}
