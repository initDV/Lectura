package io.github.initdv.lectura;

import org.json.JSONArray;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** Projection, support inverse kinematics and continuous sleeve/trouser skinning from aicha/rig.js. */
final class AichaGeometry {
    static final class Vec {
        final double x,y,z;
        Vec(double x,double y){this(x,y,0);}
        Vec(double x,double y,double z){this.x=x;this.y=y;this.z=z;}
        Vec add(Vec v){return new Vec(x+v.x,y+v.y,z+v.z);}
        Vec sub(Vec v){return new Vec(x-v.x,y-v.y,z-v.z);}
        Vec scale(double v){return new Vec(x*v,y*v,z*v);}
        Vec blend(Vec v,double u){return add(v.sub(this).scale(u));}
        Vec mirror(){return new Vec(-x,y,z);}
        double dot(Vec v){return x*v.x+y*v.y+z*v.z;}
        double length(){return sqrt(x*x+y*y+z*z);}
        Vec unit(){double l=length();return scale(l==0?1:1/l);}
        Vec project(){double k=focal(z);return new Vec(x*k,HORIZON+(y-HORIZON)*k);}
        Vec rot(double angle){return rot(angle,ZERO);}
        Vec rot(double angle,Vec about){
            if(angle==0)return this;
            double r=toRadians(angle),c=cos(r),s=sin(r),dx=x-about.x,dy=y-about.y;
            return new Vec(about.x+dx*c-dy*s,about.y+dx*s+dy*c,z);
        }
    }
    private static final Vec ZERO=new Vec(0,0);
    static final Vec HIP_PIVOT=new Vec(0,77), CHEST_PIVOT=new Vec(0,72), SKULL_BASE=new Vec(0,16.9);
    private static final Vec NECK_BASE=new Vec(0,28), HIP=new Vec(-11.7,85), KNEE=new Vec(-13.1,159,12.6), ANKLE=new Vec(-10.25,216);
    private static final Vec SHOULDER=new Vec(-22.5,35), ELBOW=new Vec(-29.2,70.5), WRIST=new Vec(-33.1,101.7);
    private static final Vec HEEL=new Vec(0,15,-8), TOE=new Vec(0,15,12), EDGE=new Vec(-6.75,15,12);
    private static final double PINCH=-135;

    interface Warp {void map(double x,double y,double[] xy);}
    private static final class Bone {
        final double x,y,ax,ay,xx,xy,yx,yy;
        Bone(Vec a,Vec b,Vec A,Vec B,double width){
            Vec v=new Vec(b.x-a.x,b.y-a.y),d=v.unit(),e=B.sub(A),u=e.unit();
            x=a.x;y=a.y;ax=A.x;ay=A.y;double l=v.length();
            xx=e.x*d.x/l+u.y*d.y*width;xy=e.x*d.y/l-u.y*d.x*width;
            yx=e.y*d.x/l-u.x*d.y*width;yy=e.y*d.y/l+u.x*d.x*width;
        }
        double x(double p,double q){return ax+(p-x)*xx+(q-y)*xy;}
        double y(double p,double q){return ay+(p-x)*yx+(q-y)*yy;}
    }
    private static Warp bend(Vec a,Vec b,Vec c,Vec A,Vec B,Vec C,double radius,double width){
        Bone upper=new Bone(a,b,A,B,width),lower=new Bone(b,c,B,C,width);Vec axis=c.sub(a).unit();
        return (x,y,dst)->{
            double d=(x-b.x)*axis.x+(y-b.y)*axis.y;
            if(d<=-radius){dst[0]=upper.x(x,y);dst[1]=upper.y(x,y);}
            else if(d>=radius){dst[0]=lower.x(x,y);dst[1]=lower.y(x,y);}
            else {double u=smooth(-radius,radius,d);dst[0]=mix(upper.x(x,y),lower.x(x,y),u);dst[1]=mix(upper.y(x,y),lower.y(x,y),u);}
        };
    }
    private static Vec joint(Vec a,Vec c,Vec ref,double l,double s){
        Vec delta=c.sub(a),d=delta.unit(),normal=ref.sub(d.scale(ref.dot(d))).unit();
        double reach=bound(delta.length(),abs(l-s)+.001,l+s-.001),u=(reach*reach+l*l-s*s)/(2*reach);
        return a.add(d.scale(u)).add(normal.scale(sqrt(max(0,l*l-u*u))));
    }
    private static Vec pitch(Vec v,double a,double roll){
        double c=cos(toRadians(a)),s=sin(toRadians(a));return new Vec(v.x,v.y*c+v.z*s,v.z*c-v.y*s).rot(roll);
    }
    private static final class Pelvis {
        final Pose p;final double cosHip,sinHip,cosYaw,sinYaw;
        Pelvis(Pose p){this.p=p;double angle=toRadians(p.hip),yaw=toRadians(p.lacet);
            cosHip=cos(angle);sinHip=sin(angle);cosYaw=cos(yaw);sinYaw=sin(yaw);}
        double x(double x,double y){return x*cosHip-(y-HIP_PIVOT.y)*sinHip;}
        double y(double x,double y){return p.settle+HIP_PIVOT.y+x*sinHip+(y-HIP_PIVOT.y)*cosHip;}
        Vec world(Vec v){double x=x(v.x,v.y);return new Vec(p.weight+x*cosYaw,y(v.x,v.y),x*sinYaw);}
    }
    static final class Leg {
        final Vec hip,knee,ankle,rest,heel,toe,contact;
        final Foot ground;
        final boolean reachable;
        final Warp warp;
        Leg(boolean left,Foot f,Pelvis pelvis){
            Vec a=left?HIP:HIP.mirror(),b=left?KNEE:KNEE.mirror(),c=left?ANKLE:ANKLE.mirror();
            ground=f;hip=pelvis.world(a);rest=c;
            Vec pivot=f.roll!=0?EDGE:f.pitch>0?TOE:HEEL;
            contact=new Vec(c.x+f.x+pivot.x,SOL-f.lift,f.z+pivot.z);ankle=contact.sub(pitch(pivot,f.pitch,f.roll));
            Vec base=c.sub(a).unit(),ref=b.sub(a),ahead=ref.sub(base.scale(ref.dot(base)));
            double l=ref.length(),s=c.sub(b).length(),distance=ankle.sub(hip).length();
            knee=joint(hip,ankle,ahead,l,s);reachable=distance<=l+s&&distance>=abs(l-s);
            heel=ankle.add(pitch(HEEL,f.pitch,f.roll));toe=ankle.add(pitch(TOE,f.pitch,f.roll));
            Warp leg=bend(a,b,c,hip.project(),knee.project(),ankle.project(),11,1+.55*(focal(ankle.z)-1));
            warp=(x,y,dst)->{
                leg.map(x,y,dst);double blend=smooth(88,132,y);
                if(blend<1){double v=pelvis.x(x,y),k=focal(v*pelvis.sinYaw);
                    dst[0]=mix((pelvis.p.weight+v*pelvis.cosYaw)*k,dst[0],blend);
                    dst[1]=mix(HORIZON+(pelvis.y(x,y)-HORIZON)*k,dst[1],blend);}
            };
        }
    }
    static Leg[] legs(Pose p){Pelvis body=new Pelvis(p);return new Leg[]{new Leg(true,p.stepL,body),new Leg(false,p.stepR,body)};}

    static Vec neck(Pose p,double x,double y){return new Vec(x,y).rot(p.neck,NECK_BASE).add(new Vec(.015*p.yaw,-.31*p.breath));}
    static final class Head {
        final double angle,up,sx,sy,rx,ry;
        final Vec origin,face;
        Head(Pose p){
            double yaw=toRadians(p.yaw),h=abs(p.pitch);angle=p.tilt+.38*p.neck;
            origin=neck(p,SKULL_BASE.x,SKULL_BASE.y).sub(SKULL_BASE);up=.132*p.pitch;
            sx=cos(yaw);sy=1-.0041*h;face=new Vec(2.36*sin(yaw)/.33,.12*p.pitch);
            rx=1-.059*abs(p.yaw)/20;ry=1-.006*h;
        }
        Vec glasses(Pose p){double x=(face.x-10.5*rx)*sx,y=(face.y+(-6.12+p.ajuste)*ry)*sy+up;
            return origin.add(new Vec(x,y).rot(angle,SKULL_BASE));}
    }
    private static Vec foreProject(Vec v,double k,double l){return new Vec(v.x*k,v.y*k,sqrt(max(0,l*l-(v.x*v.x+v.y*v.y)*k*k)));}
    static final class Cage {
        final double c,s,slope;
        Cage(Pose p){double a=toRadians(p.torse);c=cos(a);s=sin(a);slope=.38*s;}
    }
    private static Vec armView(Vec q,double relief,double c,double s){
        double z=q.z*relief;return new Vec(c*q.x+s*z,q.y,-s*q.x+c*z).project();
    }
    static final class HipAnchor {
        static final HipAnchor DEFAULT=new HipAnchor(19.3,79,false);
        final double x,y;final boolean jacket;
        HipAnchor(double x,double y,boolean jacket){this.x=x;this.y=y;this.jacket=jacket;}
        static HipAnchor read(JSONArray a){return a==null?DEFAULT:new HipAnchor(a.optDouble(0,19.3),a.optDouble(1,79),a.optBoolean(2));}
    }
    private static Vec hipGrip(Pose p,double side,double angle,Cage cage,HipAnchor anchor){
        Vec v=new Vec(-anchor.x*side,anchor.y),local;
        if(anchor.jacket){
            double x=v.x*(1+.0086*p.breath);
            local=new Vec(cage.c*x,72+(v.y-72)*(1+.0105*p.breath)+cage.slope*x);
        }else{
            Vec fabric=new Pelvis(p).world(v).project();
            Vec pelvic=fabric.sub(new Vec(p.weight,p.settle)).rot(-p.hip,HIP_PIVOT);
            local=pelvic.sub(new Vec(p.buste,.8*p.settle)).rot(-p.chest,CHEST_PIVOT);
        }
        return new Vec(side*local.x,local.y).sub(new Vec(0,5.7).rot(angle));
    }
    private static final double[][] FINGERS={{-2.9,7.1,5.9,-.30},{-1,7.8,7.7,-.105},{1,7.8,8.1,.09},{2.7,7,6.8,.27},{2.8,3.25,6.1,1.12}};
    private static final double[] BONES={.46,.31,.23};
    static final class Arm {
        final Vec shoulder,elbow,wrist,hand;
        final double turn,forearm,width,face,open,index,grip,appui;
        final Warp warp;
        Arm(Pose p,boolean left,Head head,Cage cage,HipAnchor anchor){
            double touch=left?p.lunettes:0,angle=left?p.armL:p.armR,palm=left?p.openL:p.openR,flex=toRadians(left?p.flexL+2.1*p.reposHanche:p.flexR);
            double side=left?1:-1,hip=smooth(0,.74,left?p.hancheL:p.hancheR),hem=left?p.ourlet:0,offset=left?p.wristL:p.wristR;
            open=bound(palm+touch);index=bound((left?p.indexL:p.indexR)+smooth(.54,1,touch));
            grip=max(max(smooth(.54,1,hip),.48*hem),left?.26*p.reposHanche:0);double facing=smooth(.18,.77,open);
            width=.68+.32*max(facing,max(.78*hip,.48*hem));face=facing*(1-hip);
            double plane=PI*(left?p.foldL:p.foldR),swing=left?p.balancier:-p.balancier;
            shoulder=SHOULDER.add(new Vec(-.74*smooth(5,43,angle),-1.75*smooth(4,39,angle)-.38*p.breath+(left?.65:2)*p.reposHanche,.1*swing));
            Vec upper=ELBOW.sub(SHOULDER).rot(angle),lower=WRIST.sub(ELBOW).rot(angle);
            double l=upper.length(),s=lower.length();Vec e=shoulder.add(pitch(foreProject(upper,1-.034*palm,l),-swing,0));
            Vec v=lower.scale(cos(flex)).add(lower.rot(90).scale(sin(flex)*cos(plane)*(1-p.marche)));
            double k=1-.12*palm-.17*smooth(16,34,-v.x);Vec w=e.add(pitch(foreProject(v,k,s),-swing,0));
            if(touch!=0){
                Vec tip=finger(3)[3];
                Vec aim=head.glasses(p).sub(new Vec(tip.x*width,tip.y).rot(PINCH+offset)),target=new Vec(aim.x,aim.y,29);
                Vec a=w.sub(e),bend=joint(shoulder,target,new Vec(-.85,.22,1),l,s),b=target.sub(bend);
                e=shoulder.add(e.blend(bend,touch).sub(shoulder).unit().scale(l));
                double fold=mix(atan2(a.z,a.y),PI-atan2(b.z,-b.y),touch),x=mix(a.x,b.x,touch)+10*sin(PI*touch);
                double h=sqrt(max(0,s*s-x*x));w=e.add(new Vec(x,h*cos(fold),h*sin(fold)));
            }
            double held=appui=smooth(0,.82,hip),contact=max(held,hem);
            double relief=p.marche+(1-p.marche)*(1-p.lunettes)*(.21*palm+.17*contact),sin=cage.s*side,cos=cage.c;
            double hipAngle=-34-side*p.chest-(left?0:2*p.reposHanche);
            if(contact!=0){
                Vec target=new Vec(-27.3,87.5,9.6);
                if(held!=0){
                    Vec aim=hipGrip(p,side,hipAngle,cage,anchor);double z=7.2*relief;
                    double x=(aim.x*(1-cos*z/FOCALE)-sin*z)/(cos-aim.x*sin/FOCALE);
                    target=new Vec(x,HORIZON+(aim.y-HORIZON)/focal(-sin*x+cos*z),7.2);
                }
                Vec guide=held!=0?new Vec(-1,.4,.05+(left?0:.31*p.reposHanche)):new Vec(-.63,.44,-.55);
                w=w.blend(target,contact);e=joint(shoulder,w,e.sub(shoulder).blend(guide.scale(l),contact),l,s);
            }
            elbow=e;wrist=w;Vec screenElbow=armView(e,relief,cos,sin);hand=armView(w,relief,cos,sin);
            forearm=toDegrees(atan2(screenElbow.x-hand.x,hand.y-screenElbow.y));
            turn=mix(mix(forearm,PINCH,smooth(.64,1,touch)),hipAngle-offset,held);
            warp=bend(SHOULDER,ELBOW,WRIST,armView(shoulder,relief,cos,sin),screenElbow,hand,5.9,.82);
        }
        Vec[] finger(int i){
            double[] k=FINGERS[i];boolean thumb=i==4;
            double flex=.08+(.23+.052*(3-i))*(1-open)+grip*(.72-.16*i),curl=thumb?.25+.24*(1-open)+.49*grip:mix(flex,i==3?.02:1.16,index);
            double axis=thumb?k[3]*(.64+.36*open)+.37*grip:k[3]*(.45+.67*open),step=curl*(thumb?-.57:.26-.64*grip);
            Vec[] points=new Vec[4];points[0]=new Vec(k[0],k[1]);
            for(int j=0;j<3;j++){
                double a=axis+j*step,b=curl*(.2+.66*j),r=k[2]*BONES[j],q=r*cos(b);
                points[j+1]=points[j].add(new Vec(q*sin(a),q*cos(a),r*sin(b)));
            }
            return points;
        }
    }
}
