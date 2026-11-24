package io.github.initdv.lectura;

import android.graphics.Matrix;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** Same articulated drawing as the PWA, mapped to the native SVG matrices for screen and export. */
final class RobotStage {
    private final Svg svg;
    private final Svg.Node trunk,shadow,antenna,clock,digits;
    private final Svg.Node[][] pieces=new Svg.Node[2][];
    private final float[] rest,plain,wide;
    private final JSONArray numbers,positions;
    private final float digitY;
    private final JSONObject strokes;
    private RobotChoreo track;
    private String label="";
    private boolean painted;
    final RobotChoreo.Pose pose=new RobotChoreo.Pose();

    RobotStage(Svg svg,JSONObject data){
        this.svg=svg;trunk=node("trunk");shadow=node("shadow");antenna=node("antenna");clock=node("clock");digits=node("clock-digits");
        for(int i=0;i<2;i++){String side=i==0?"-l":"-r";pieces[i]=new Svg.Node[]{node("thigh"+side),node("knee"+side),node("shin"+side),node("foot"+side)};}
        rest=svg.box.clone();JSONObject rig=object(data,"rig");plain=box(array(rig,"box"));wide=box(array(rig,"clockBox"));
        numbers=array(data,"digits");strokes=object(data,"segments");positions=array(data,"digitX");digitY=(float)data.optDouble("digitY");
        clock.a.remove("display");clock.hidden=true;
    }
    private static float[] box(JSONArray a){float[] out=new float[4];for(int i=0;i<4;i++)out[i]=(float)a.optDouble(i);return out;}
    private Svg.Node node(String name){return svg.get("robot-"+name);}
    RobotChoreo.Pose sample(RobotChoreo plan,double ms,boolean accents){
        if(plan!=track){
            track=plan;System.arraycopy(plan==null?rest:plan.label.isEmpty()?plain:wide,0,svg.box,0,4);
            if(plan!=null&&!plan.label.isEmpty()&&!label.equals(plan.label)){
                label=plan.label;digits.children.clear();
                String values=label.replace(":","");
                for(int i=0;i<values.length();i++){
                    String segments=numbers.optString(values.charAt(i)-'0');
                    for(int j=0;j<segments.length();j++){
                        Svg.Node path=new Svg.Node("path");path.original=Svg.parsePath(strokes.optString(segments.substring(j,j+1)));
                        path.reset().preTranslate((float)positions.optDouble(i),digitY);digits.add(path);
                    }
                }
            }
        }
        if(plan==null){
            if(painted){
                for(Svg.Node n:new Svg.Node[]{trunk,shadow,antenna})n.reset();
                for(Svg.Node[] leg:pieces)for(Svg.Node n:leg)n.reset();
                clock.hidden=true;painted=false;
            }
            return null;
        }
        plan.sample(ms,accents,pose);painted=true;
        translate(trunk,pose.x,pose.y).preRotate(f(pose.tilt),120,RobotChoreo.HIP);
        translate(shadow,pose.x,0);antenna.reset().preRotate(f(pose.antenna),120,58);
        for(int i=0;i<2;i++){
            float x=(float)RobotChoreo.X[i];RobotChoreo.Leg l=pose.legs[i];Svg.Node[] leg=pieces[i];
            translate(leg[0],l.hx-x,l.hy-RobotChoreo.HIP).preRotate(f(l.thigh),x,RobotChoreo.HIP);
            translate(leg[1],l.kx-x,l.ky-RobotChoreo.KNEE);
            translate(leg[2],l.kx-x,l.ky-RobotChoreo.KNEE).preRotate(f(l.shin),x,RobotChoreo.KNEE);
            translate(leg[3],l.fx-x,-l.lift);
        }
        clock.hidden=pose.clock<=.01;clock.alpha=f(pose.clock);
        return pose;
    }
    private static float f(double n){return (float)(Math.round(n*100)/100.);}
    private static Matrix translate(Svg.Node n,double x,double y){Matrix m=n.reset();m.preTranslate(f(x),f(y));return m;}
}
