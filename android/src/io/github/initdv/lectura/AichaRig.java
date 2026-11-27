package io.github.initdv.lectura;

import android.graphics.Matrix;
import android.graphics.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import static java.lang.Math.*;
import static io.github.initdv.lectura.AichaGeometry.*;
import static io.github.initdv.lectura.AichaMotion.*;

/** Mutates only the Canvas drawing for the current frame. The bundled SVG remains the thumbnail. */
final class AichaRig {
    private static final Pattern TOKENS=Pattern.compile("[A-Za-z]|[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)");
    private static final Vec LIGHT=new Vec(-25,40), EYE=new Vec(-6.5,-.8);
    private static final Vec[] STRANDS={new Vec(-10,-12),new Vec(-12,-8),new Vec(-13.5,-3)};
    final boolean glasses;
    final Svg svg;
    private final Svg.Node torso,head,pelvis,shirt;
    private final Side left,right;
    private final HipAnchor anchor;
    private final List<Skin> trousers;
    private final Svg.Node cheeks,nose;
    private final Svg.Node[] cheekLights;
    private final double[] xy=new double[2],other=new double[2];

    AichaRig(Svg svg,HipAnchor anchor){
        this.svg=svg;this.anchor=anchor;torso=node("buste");head=node("tete");pelvis=node("bassin");shirt=node("sweat");
        left=new Side("l");right=new Side("r");trousers=Skin.of(node("pantalon"));
        cheeks=node("joues");nose=node("nez");cheekLights=cheeks.children.stream().filter(n->n.kind.equals("ellipse")).toArray(Svg.Node[]::new);
        node("aicha-sol").a.remove("display");
        for(String s:List.of("l","r")){node("profil-"+s).hidden=true;alpha("paume-"+s,1);}
        // Sleeves stay behind the bodice; the hand moves in front when it makes contact.
        glasses=!node("lunettes").children.isEmpty();
    }
    private Svg.Node node(String id){Svg.Node n=svg.get(id);if(n==null)throw new IllegalArgumentException("Pièce SVG manquante : "+id);return n;}
    private static float f(double v){return (float)(round(v*1000)/1000.);}
    private Path path(String id){return node(id).path();}
    private void alpha(String id,double opacity){node(id).alpha=f(opacity);}
    private static Path move(Path p,double x,double y){p.moveTo(f(x),f(y));return p;}
    private static void line(Path p,double x,double y){p.lineTo(f(x),f(y));}
    private static void quad(Path p,double x,double y,double a,double b){p.quadTo(f(x),f(y),f(a),f(b));}
    private static void quad(Path p,Vec a,Vec b){quad(p,a.x,a.y,b.x,b.y);}
    private static void curve(Path p,double x,double y,double a,double b,double u,double v){p.cubicTo(f(x),f(y),f(a),f(b),f(u),f(v));}
    private static void translate(Matrix m,Vec a){m.preTranslate(f(a.x),f(a.y));}
    private static void rotate(Matrix m,double angle,Vec o){m.preRotate(f(angle),f(o.x),f(o.y));}

    private final class Side {
        final String id;
        final Svg.Node sleeve,wrist,light,shoe,shadow;
        final List<Skin> skins;
        final Svg.Node[] strands=new Svg.Node[3];
        Side(String id){this.id=id;sleeve=node("bras-"+id);wrist=node("poignet-"+id);shoe=node("chaussure-"+id);
            light=sleeve.find("ellipse");if(light==null)throw new IllegalArgumentException("Manche SVG sans reflet");
            skins=Skin.of(sleeve);for(int i=0;i<strands.length;i++)strands[i]=node("tresse-"+id+"-"+i);
            shadow=new Svg.Node("ellipse");shadow.a.put("fill","#130d18");shadow.alpha=0;
            shadow.path().addOval(-3.97f,5.9f,4.53f,13.4f,Path.Direction.CW);
            Svg.Node palm=node("paume-"+id);palm.before(shadow,palm.children.get(0));
        }
    }
    private static final class Contour {
        final List<Vec> points=new ArrayList<>();boolean closed;
        Contour(Vec p){points.add(p);}
    }
    private static final class Skin {
        final Svg.Node node;final boolean mirror;
        final List<Contour> contours=new ArrayList<>();
        Skin(Svg.Node n,boolean mirror){
            node=n;this.mirror=mirror;
            var tokens=new ArrayList<String>();var m=TOKENS.matcher(n.attr("d"));while(m.find())tokens.add(m.group());
            Vec p=null;Contour c=null;int i=0;
            while(i<tokens.size()){
                String op=tokens.get(i++);
                if(op.equals("M")){p=pair(tokens,i);i+=2;contours.add(c=new Contour(p));continue;}
                if(c==null)throw new IllegalArgumentException("Tracé sans début : "+n.attr("d"));
                if(op.equals("Z")){c.closed=true;continue;}
                if(!op.equals("L")&&!op.equals("Q"))throw new IllegalArgumentException("Tracé de membre non reconnu : "+op);
                Vec q=pair(tokens,i);i+=2;boolean quadratic=op.equals("Q");Vec r=quadratic?pair(tokens,i):q;if(quadratic)i+=2;
                int count=max(1,(int)ceil((q.sub(p).length()+(quadratic?r.sub(q).length():0))/2.5));
                for(int j=1;j<=count;j++){double u=(double)j/count;c.points.add(quadratic?p.blend(q,u).blend(q.blend(r,u),u):p.blend(r,u));}
                p=r;
            }
        }
        private static Vec pair(List<String> tokens,int i){return new Vec(Double.parseDouble(tokens.get(i)),Double.parseDouble(tokens.get(i+1)));}
        static List<Skin> of(Svg.Node parent){var out=new ArrayList<Skin>();
            for(Svg.Node n:parent.children){
                if(n.kind.equals("path"))out.add(new Skin(n,false));
                else if(n.attr("id").equals("liseres-r"))for(Svg.Node c:n.children)if(c.kind.equals("path"))out.add(new Skin(c,true));
            }
            return out;
        }
        void draw(Warp warp,double[] xy){Path p=node.path();double sign=mirror?-1:1;
            for(Contour c:contours){boolean first=true;
                for(Vec v:c.points){warp.map(v.x*sign,v.y,xy);double x=xy[0]*sign;if(first){move(p,x,xy[1]);first=false;}else line(p,x,xy[1]);}
                if(c.closed)p.close();
            }
        }
    }

    void draw(Pose p,double t){
        Leg[] l=legs(p);Warp legs=(x,y,dst)->{
            double u=smooth(-2.75,2.75,x);
            (u==1?l[1]:l[0]).warp.map(x,y,dst);
            if(u>0&&u<1){l[1].warp.map(x,y,other);dst[0]=mix(dst[0],other[0],u);dst[1]=mix(dst[1],other[1],u);}
        };
        for(Skin skin:trousers)skin.draw(legs,xy);
        foot(left,l[0]);foot(right,l[1]);Svg.Node fore=l[0].toe.z>l[1].toe.z?left.shoe:right.shoe;
        if(svg.root.children.get(svg.root.children.indexOf(pelvis)-1)!=fore)svg.root.before(fore,pelvis);
        ellipse("ombre-appui",p.weight*.6,232,35,3.1);
        Matrix pelvic=pelvis.reset();pelvic.preTranslate(f(p.weight),f(p.settle));rotate(pelvic,p.hip,HIP_PIVOT);
        Matrix trunk=torso.reset();trunk.preTranslate(f(p.buste),f(.8*p.settle));rotate(trunk,p.chest,CHEST_PIVOT);
        Head h=new Head(p);Cage cage=new Cage(p);
        Matrix fabric=shirt.reset();fabric.setValues(new float[]{f(cage.c),0,0,f(cage.slope),1,0,0,0,1});
        fabric.preScale(f(1+.0086*p.breath),f(1+.0105*p.breath),0,72);
        if(!node("cordons").attr("display").equals("none"))cords(p,t);
        sleeve(left,new Arm(p,true,h,cage,anchor),p,true);sleeve(right,new Arm(p,false,h,cage,anchor),p,false);
        drawNeck(p);
        Matrix base=head.reset();translate(base,h.origin);rotate(base,h.angle,SKULL_BASE);base.preTranslate(0,f(h.up));base.preScale(f(h.sx),f(h.sy));
        Matrix face=node("plan-visage").reset();translate(face,h.face);face.preScale(f(h.rx),f(h.ry));
        node("lunettes").reset().preTranslate(0,f(p.ajuste));
        double joy=max(0,p.smile),ruffle=p.focus*abs(p.asym);
        cheeks.reset().preTranslate(f(.19*p.asym),f(-1.12*joy+.15*p.focus));
        for(Svg.Node light:cheekLights)light.alpha=f(.16+.12*joy+.07*abs(p.asym));
        Matrix nostrils=nose.reset();nostrils.preTranslate(f(.25*p.asym*ruffle),f(-.68*ruffle));nostrils.preScale(f(1+.12*ruffle),1);
        alpha("front",.33*smooth(.3,1.41,p.inner+.85*p.outer));node("front").reset().preTranslate(0,f(-.22*p.inner));
        alpha("pli-concentration",.46*p.focus);
        eye(left,p,t,true);eye(right,p,t,false);
        mouth(p);
    }
    private void ellipse(String id,double x,double y,double rx,double ry){path(id).addOval(f(x-rx),f(y-ry),f(x+rx),f(y+ry),Path.Direction.CW);}
    private void foot(Side side,Leg l){
        Vec a=l.ankle.project(),b=l.toe.project().sub(a).scale(1./15);
        double k=focal(l.toe.z);Vec axis=new Vec(k,0).rot(l.ground.roll),shade=new Vec(l.ankle.x,SOL+.6,.45*l.toe.z+.55*l.heel.z).project();
        Matrix m=side.shoe.reset();m.setValues(new float[]{f(axis.x),f(b.x),f(a.x),f(axis.y),f(b.y),f(a.y),0,0,1});m.preTranslate(f(-l.rest.x),f(-l.rest.y));
        String id="ombre-chaussure-"+side.id;ellipse(id,shade.x,shade.y,10.8*k,1.35);alpha(id,.6*exp(-.095*l.ground.lift));
    }
    private void cords(Pose p,double t){
        double d=f(p.lag*.7+sin(t*2.83)*.16),y=f(49+abs(d)*.044);Path v=move(path("cordons"),-2.6,33);
        quad(v,-2.68,41,-3+d,y);move(v,2.6,33);quad(v,2.8,41,3+d*.82,y+.08);
        ellipse("embout-l",-3+d,y+.5,.9,.9);ellipse("embout-r",3+d*.82,y+.55,.9,.9);
    }
    private void sleeve(Side side,Arm a,Pose p,boolean left){
        for(Skin skin:side.skins)skin.draw(a.warp,xy);
        a.warp.map(LIGHT.x,LIGHT.y,xy);Matrix m=side.light.reset();m.preTranslate(f(xy[0]-LIGHT.x),f(xy[1]-LIGHT.y));rotate(m,20+(left?p.armL:p.armR),LIGHT);
        String s=side.id;
        boolean front=left?p.lunettes!=0||p.hancheL!=0||p.ourlet!=0:p.hancheR!=0;
        Svg.Node layer=front?torso:side.sleeve;if(side.wrist.parent!=layer)layer.add(side.wrist);
        double angle=a.turn+(left?p.wristL:p.wristR);
        m=side.wrist.reset();if(front&&!left)m.preScale(-1,1);translate(m,a.hand);m.preRotate(f(angle));
        node("paume-"+s).reset().preScale(f(a.width),1);
        Matrix cuff=node("manche-"+s).reset();cuff.preScale(f(1/a.width),1);cuff.preRotate(f(a.forearm-angle));
        alpha("lignes-"+s,.75*a.face);side.shadow.alpha=f(.24*smooth(.94,1,a.appui));
        for(int i=0;i<5;i++){
            Vec[] q=a.finger(i);Path d=move(path(i==4?"pouce-"+s:"doigt-"+s+"-"+i),q[0].x,q[0].y);
            quad(d,q[1],q[1].blend(q[2],.5));quad(d,q[2],q[3]);
        }
    }
    private void drawNeck(Pose p){
        Vec a=neck(p,-5.6,9),b=neck(p,5.6,9);Path n=move(path("cou"),a.x,a.y);line(n,b.x,b.y);
        quad(n,neck(p,5.4,17),neck(p,6.4,22));quad(n,8,26,12,29);line(n,-12,29);
        quad(n,new Vec(-8,26),neck(p,-6.4,22));quad(n,neck(p,-5.4,17),a);n.close();
        a=neck(p,-5.5,10);b=neck(p,5.5,10);n=move(path("cou-ombre"),a.x,a.y);line(n,b.x,b.y);
        quad(n,neck(p,5.3,16),neck(p,6,20.65));quad(n,neck(p,1.1,19.1+.13*p.pitch),neck(p,-6.2,24));quad(n,neck(p,-5.6,18),a);n.close();
    }
    private static void eyelid(Path v,double a,double b,double c){move(v,-10.6,-1.6);quad(v,-8.6,a,-5.8,b);quad(v,-3.38,c,-2.4,-.4);}
    private void eye(Side side,Pose p,double t,boolean left){
        double s=left?1:-1,hair=left?p.hairL:p.hairR;String id="-"+side.id;
        for(int i=0;i<STRANDS.length;i++)rotate(side.strands[i].reset(),hair*s*(1-.061*i)+.21*sin(t*4.2+i*.95)*abs(p.hairL+p.hairR)*.16,STRANDS[i]);
        Matrix eye=node("oeil"+id).reset();eye.preScale(left?1:-1,1);
        rotate(eye,bound(5.6*(p.outer-p.inner)*(p.focus+.65*max(0,-p.smile)),-7,8),EYE);
        double b=left?p.blinkL:p.blinkR,raise=2*p.lids+.43*p.inner+.23*p.outer-.54*p.focus+.38*p.asym*s,lower=max(0,p.smile)*1.05+.41*p.focus-.58*p.lids;
        double a=mix(-5.2-raise,-1.14,b),m=mix(-5-raise,-.4,b),z=mix(-4.8-raise,.03,b),lo=mix(2.2-lower,.06,b),lo2=mix(1.6-lower,-.61,b);
        Path white=path("blanc"+id);eyelid(white,a,m,z);quad(white,-4.6,lo,-7,lo);quad(white,-9.6,lo2,-10.6,-1.6);white.close();path("limite"+id).set(white);
        alpha("blanc"+id,1-smooth(.83,.99,b));alpha("iris"+id,1-smooth(.79,.98,b));node("iris"+id).reset().preTranslate(f(bound(p.gazeX*s,-1.8,1.8)),f(bound(p.gazeY,-1.04,1.12)));
        Path shade=path("ombre-paupiere"+id);eyelid(shade,a,m,z);
        quad(shade,-5,mix(-3.4-raise*.6,-.18,b),-6.4,mix(-3.6-raise*.66,-.33,b));quad(shade,-9,mix(-3.6-raise*.6,-.98,b),-10.6,-1.6);shade.close();alpha("ombre-paupiere"+id,.14*(1-b));
        Svg.Node lid=node("paupiere-haute"+id);Path top=move(lid.path(),-10.9,-1.8);
        quad(top,-8.6,a-.52,-5.8,m-.45);quad(top,-3.2,z-.31,-2.2,-.4);lid.strokeWidth=f(mix(1.36,1,b));
        line(move(path("cil"+id),-10.9,-1.8),-11.9,-2.5+.37*b);
        quad(move(path("paupiere-basse"+id),-9.8,-.4),-7,lo+.37,-3.4,.6-.32*lower);alpha("paupiere-basse"+id,1-smooth(.46,.93,b));
        double out=p.outer+.86*p.asym*s,in=p.inner+.57*p.asym*s,pull=.68*p.focus;
        quad(move(path("sourcil"+id),-12+.2*pull,-9-1.53*out+.2*p.focus),-7.22,-11.9-1.32*out-1.33*in+1.15*p.focus,-2.2+pull,-9.4-1.95*in+1.19*p.focus);
    }
    private static void upper(Path p,double b,double b0,double b1,double u,double r){curve(p,-b*b0,u,-b*b1,u,0,u);curve(p,b*b1,u,b*b0,u,b,r);}
    private static void lower(Path p,double b,double b0,double b1,double d,double l){curve(p,b*b0,d,b*b1,d+.08,0,d);curve(p,-b*b1,d+.08,-b*b0,d,-b,l);}
    private void mouth(Pose p){
        double w=p.mouth[0],speech=p.mouth[1],rond=p.mouth[2],jaw=p.mouth[3],bite=p.mouth[4],tongue=p.mouth[5];
        double quiet=1-smooth(.012,.14,max(max(speech,jaw),max(bite,max(rond,3.4*abs(1-w)))));
        double open=quiet*abs(p.levres),circle=quiet*smooth(0,3.4,p.levres),o=speech+open,round=bound(rond+.8*circle),j=jaw+.29*open;
        double joy=max(0,p.smile),down=max(0,-p.smile),press=1-.46*quiet*p.focus,b=4.78*w+(1.06*joy-.69*down+.38*p.focus)*(1-round)-2.32*circle;
        double core=10.99+j*.41+.23*round,coin=core-1.87*joy+1.85*down*press,l=coin+.51*p.asym,r=coin-.57*p.asym;
        double u=core-.43*o,d=core+.62*o,b0=mix(.55,.82,round),b1=mix(.22,.36,round);
        Path outline=move(path("bord-bouche"),-b,l);upper(outline,b,b0,b1,u,r);lower(outline,b,b0,b1,d,l);outline.close();
        path("cavite").set(outline);alpha("cavite",.6+.4*smooth(.01,.32,o));
        Path top=move(path("levre-haute"),b,r);
        quad(top,b*.61,u-1.02*press,b*.29,u-.8*press);quad(top,0,u-(1.57+.28*round)*press,-b*.29,u-.8*press);quad(top,-b*.64,u-.97*press,-b,l);upper(top,b,b0,b1,u,r);top.close();
        Path bot=move(path("levre-basse"),b,r);lower(bot,b,b0,b1,d,l);
        quad(bot,-b*.72,d+1.3*press,0,d+1.71*press-.23*bite);quad(bot,b*.72,d+1.3*press,b,r);bot.close();
        Path tooth=move(path("dents"),-b*.88,u-1.16);line(tooth,b*.88,u-1.16);
        quad(tooth,b*.78,u+.83+.37*bite,b*.5,u+.91+.55*bite);quad(tooth,0,u+1.02+.57*bite,-b*.57,u+.88+.51*bite);
        quad(tooth,-b*.75,u+.77+.44*bite,-b*.88,u-1.16);tooth.close();alpha("dents",bound(smooth(.18,1.17,o)*(.72-.28*round)+.68*bite));
        Path ling=move(path("langue"),-b*.83,d+.1);quad(ling,-b*.32,d-.68-.4*tongue,.19,d-.42-.79*tongue);
        quad(ling,b*.49,d-.58-.3*tongue,b*.83,d+.1);line(ling,b*.83,d+2);line(ling,-b*.83,d+2);ling.close();alpha("langue",bound(smooth(.98,2.83,o)*.62+.52*tongue));
        quad(move(path("reflet-levre"),-b*.24,d+.92*press),0,d+1.26*press,b*.24,d+.91*press);
        double active=smooth(.035,.28,max(max(abs(p.smile)*.78,abs(p.asym)*.52),max(.56*p.focus,max(o,max(.41*bite,abs(1-w)*1.6)))));alpha("bouche",active);alpha("levres-repos",1-active);
        double chin=17.2+j,corner=16+.81*j,cheek=13.5+.43*j;
        Path skin=move(path("visage-peau"),-12.5,-4);quad(skin,-12.7,3,-10.5,8.5);quad(skin,-8.3,cheek,-4.2,corner);
        quad(skin,-2,chin,0,chin);quad(skin,2,chin,4.2,corner);quad(skin,8.3,cheek,10.5,8.5);quad(skin,12.7,3,12.5,-4);
        quad(skin,12.3,-16.5,0,-17);quad(skin,-12.3,-16.5,-12.5,-4);skin.close();
        Path shade=move(path("visage-ombre"),3,-16.5);quad(shade,12.3,-16,12.5,-4);quad(shade,12.7,3,10.5,8.5);
        quad(shade,8.3,cheek,4.2,corner);quad(shade,2,chin,0,chin);quad(shade,6,8+.28*j,4,-2);shade.close();
    }
}
