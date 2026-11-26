package io.github.initdv.lectura;

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
    private static Vec armView(Vec q,double walk){return new Vec(q.x,q.y,q.z*walk).project();}
    static final class Arm {
        final Vec shoulder,elbow,wrist,hand;
        final double turn;
        final Warp warp;
        Arm(Pose p,boolean left,Head head){
            double touch=left?p.lunettes:0,angle=left?p.armL:p.armR,palm=left?p.openL:p.openR,flex=toRadians(left?p.flexL:p.flexR);
            double plane=PI*(left?p.foldL:p.foldR),swing=left?p.balancier:-p.balancier;
            shoulder=SHOULDER.add(new Vec(-.74*smooth(5,43,angle),-1.75*smooth(4,39,angle)-.38*p.breath,.1*swing));
            Vec upper=ELBOW.sub(SHOULDER).rot(angle),lower=WRIST.sub(ELBOW).rot(angle);
            double l=upper.length(),s=lower.length();Vec e=shoulder.add(pitch(foreProject(upper,1-.034*palm,l),-swing,0));
            Vec v=lower.scale(cos(flex)).add(lower.rot(90).scale(sin(flex)*cos(plane)*(1-p.marche)));
            double k=1-.12*palm-.17*smooth(16,34,-v.x);Vec w=e.add(pitch(foreProject(v,k,s),-swing,0));
            if(touch!=0){
                Vec aim=head.glasses(p).sub(new Vec(3.569,13.489).rot(PINCH+p.wristL)),target=new Vec(aim.x,aim.y,29);
                Vec a=w.sub(e),bend=joint(shoulder,target,new Vec(-.85,.22,1),l,s),b=target.sub(bend);
                e=shoulder.add(e.blend(bend,touch).sub(shoulder).unit().scale(l));
                double fold=mix(atan2(a.z,a.y),PI-atan2(b.z,-b.y),touch),x=mix(a.x,b.x,touch)+10*sin(PI*touch);
                double h=sqrt(max(0,s*s-x*x));w=e.add(new Vec(x,h*cos(fold),h*sin(fold)));
            }
            elbow=e;wrist=w;Vec screenElbow=armView(e,p.marche);hand=armView(w,p.marche);
            double a=toDegrees(atan2(screenElbow.x-hand.x,hand.y-screenElbow.y));turn=mix(a,PINCH,smooth(.64,1,touch));
            warp=bend(SHOULDER,ELBOW,WRIST,armView(shoulder,p.marche),screenElbow,hand,5.9,1);
        }
    }
}
