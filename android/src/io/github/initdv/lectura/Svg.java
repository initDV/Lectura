package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.Xml;
import org.xmlpull.v1.XmlPullParser;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Canvas interpreter for the trusted, bundled vector artwork. No DOM, script or network references. */
final class Svg {
    private static final String NUMBER = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
    private static final Pattern NUM = Pattern.compile(NUMBER);
    private static final Pattern TOKEN = Pattern.compile(NUMBER+"|[A-Za-z]");
    private static final Pattern TRANSFORM = Pattern.compile("([A-Za-z]+)\\(([^)]*)\\)");
    private static final Set<String> SHAPES = Set.of("svg","g","rect","line","circle","ellipse","path","polyline","polygon","defs","clipPath","use");
    private static final Set<String> ATLAS_SHAPES = Set.of("text","tspan","linearGradient","radialGradient","stop");
    private static final Pattern LOCAL_CLIP = Pattern.compile("url\\(#([\\w-]+)\\)");
    private static final Pattern INLINE_HIDDEN = Pattern.compile("display\\s*:\\s*none");
    final Node root;
    private final boolean diagram;
    final float[] box;
    final HashMap<String,Node> ids = new HashMap<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    Svg(InputStream in) { this(in,false); }
    Svg(InputStream in,boolean diagram) {
        this.diagram=diagram;
        try {
            XmlPullParser xml = Xml.newPullParser();
            xml.setInput(in,"UTF-8"); xml.nextTag();
            root = read(xml);
            connect(root);
            float[] vb = numbers(root.attr("viewBox"));
            box = vb.length == 4 ? vb : new float[]{0,0,240,600};
        } catch (Exception e) { throw new IllegalArgumentException("Dessin SVG invalide",e); }
    }
    private Node read(XmlPullParser x) throws Exception {
        String kind = x.getName();
        if (!SHAPES.contains(kind)&&!(diagram&&ATLAS_SHAPES.contains(kind))) {
            int depth=x.getDepth(); while (!(x.next()==XmlPullParser.END_TAG && x.getDepth()==depth)) if (x.getEventType()==XmlPullParser.END_DOCUMENT) break;
            return null;
        }
        Node n = new Node(kind);
        for (int i=0;i<x.getAttributeCount();i++) n.a.put(x.getAttributeName(i),x.getAttributeValue(i));
        if (!n.attr("id").isEmpty()) ids.put(n.attr("id"), n);
        int evt;
        while ((evt=x.next())!=XmlPullParser.END_TAG && evt!=XmlPullParser.END_DOCUMENT) {
            if (evt==XmlPullParser.START_TAG) { Node child=read(x); if (child!=null) n.add(child); }
            else if(evt==XmlPullParser.TEXT&&(kind.equals("text")||kind.equals("tspan"))){
                Node run=new Node("literal");run.label=x.getText();n.add(run);
            }
        }
        n.staticTransform=matrix(n.attr("transform"));
        n.opacity=n.f("opacity",1);
        String inline=n.attr("style");n.inlineHidden=!inline.isEmpty()&&INLINE_HIDDEN.matcher(inline).find();
        n.original=n.geometry();
        return n;
    }
    private void connect(Node n) {
        // The bundled rigs use local shape references only; no URI is ever opened.
        if (n.kind.equals("use")) {
            String href=n.attr("href");
            Node ref=href.startsWith("#")?get(href.substring(1)):null;
            if(ref==null||ref.parent==null||!ref.parent.kind.equals("defs")||!ref.kind.equals("g"))
                throw new IllegalArgumentException("Référence SVG invalide : "+href);
            n.reference=ref;
        }
        if(!n.attr("clip-path").isEmpty()) {
            Matcher url=LOCAL_CLIP.matcher(n.attr("clip-path"));Node ref=url.matches()?get(url.group(1)):null;
            if(ref==null||!ref.kind.equals("clipPath")||ref.children.size()!=1||ref.children.get(0).original==null)
                throw new IllegalArgumentException("Masque SVG invalide : "+n.attr("clip-path"));
            n.mask=ref.children.get(0);
        }
        if(n.kind.equals("text"))n.original=lettering(n);
        for(Node child:n.children)connect(child);
    }
    Node get(String id) { return ids.get(id); }
    void fit(Canvas c,float left,float top,float width,float height,boolean bottom) {
        float scale=Math.min(width/box[2],height/box[3]);
        draw(c,left+(width-box[2]*scale)/2,top+(height-box[3]*scale)*(bottom?1:.5f),scale);
    }
    void draw(Canvas c,float x,float y,float scale) {
        c.save(); c.translate(x,y); c.scale(scale,scale); c.translate(-box[0],-box[1]);
        drawNode(c,root,Style.DEFAULT,false); c.restore();
    }
    private void drawNode(Canvas c, Node n, Style parent, boolean reference) {
        if(n.kind.equals("defs")||n.kind.equals("clipPath")||n.hidden||n.inlineHidden||n.attr("display").equals("none"))return;
        float alpha=n.alpha<0?n.opacity:n.alpha;
        if(alpha<=0)return;
        Style style = n.style;
        if (style==null || n.inherited!=parent) { n.inherited=parent; n.style=style=new Style(parent,n); }
        Path p=n.outline();
        float width=n.strokeWidth<0?style.width:n.strokeWidth;
        Shader fillShader=diagram&&p!=null?gradient(style.fillRef,n,p):null;
        boolean fill=p!=null&&(style.fill!=0||fillShader!=null),stroke=p!=null&&style.stroke!=0&&width>0;
        // A single paint can carry the opacity directly. A group (or a fill
        // overlapping a stroke) still needs isolated compositing.
        boolean layer=alpha<.999f&&(fill&&stroke||n.reference!=null||!n.children.isEmpty());
        int opacity=layer||alpha>=.999f?255:Math.round(255*alpha);
        Matrix m=n.transform==null?n.staticTransform:n.transform;
        boolean scoped=m!=null||n.mask!=null;
        if(scoped)c.save();
        if(m!=null)c.concat(m);
        if(n.mask!=null)c.clipPath(n.mask.outline());
        if(layer)c.saveLayerAlpha(null,Math.round(255*alpha));
        if(fill){
            paint.setStyle(Paint.Style.FILL);paint.setColor(fillShader==null?style.fill:Color.WHITE);paint.setShader(fillShader);
            paint.setAlpha(Math.round(style.fillOpacity*opacity));c.drawPath(p,paint);paint.setShader(null);
        }
        if(stroke){
            paint.setStyle(Paint.Style.STROKE);paint.setColor(style.stroke);paint.setAlpha(Math.round(style.strokeOpacity*opacity));
            paint.setStrokeWidth(width);paint.setStrokeMiter(4);paint.setStrokeCap(style.cap);paint.setStrokeJoin(style.join);
            if(diagram)paint.setPathEffect(style.dash);
            c.drawPath(p,paint);
            if(diagram)paint.setPathEffect(null);
        }
        // The hand definition is a leaf reference (do not recurse through another <use>).
        if(n.reference!=null&&!reference)drawNode(c,n.reference,style,true);
        for(Node child:n.children)drawNode(c,child,style,reference);
        if(layer)c.restore();
        if(scoped)c.restore();
    }
    // Atlas artwork uses unit-box gradients with numeric or percentage stops.
    private Shader gradient(String ref,Node node,Path path){
        if(ref==null)return null;
        if(ref.equals(node.gradientRef))return node.gradient;
        node.gradientRef=ref;node.gradient=null;
        Node n=get(ref);
        if(n==null||(!n.kind.equals("linearGradient")&&!n.kind.equals("radialGradient"))||n.children.size()<2)return null;
        RectF b=new RectF();path.computeBounds(b,true);if(b.isEmpty())return null;
        int count=n.children.size();int[] colors=new int[count];float[] offsets=new float[count];
        for(int i=0;i<count;i++){
            Node stop=n.children.get(i);
            int alpha=Math.round(255*Refs.clamp(stop.f("stop-opacity",1),0,1));
            colors[i]=(alpha<<24)|(Refs.color(stop.attr("stop-color"))&0xffffff);
            offsets[i]=Math.max(i==0?0:offsets[i-1],Refs.clamp(ratio(stop,"offset",0),0,1));
        }
        Shader g=n.kind.equals("radialGradient")
            ?new RadialGradient(ratio(n,"cx",.5f),ratio(n,"cy",.5f),Math.max(.001f,ratio(n,"r",.5f)),colors,offsets,Shader.TileMode.CLAMP)
            :new LinearGradient(ratio(n,"x1",0),ratio(n,"y1",0),ratio(n,"x2",1),ratio(n,"y2",0),colors,offsets,Shader.TileMode.CLAMP);
        Matrix m=new Matrix();m.setScale(b.width(),b.height());m.postTranslate(b.left,b.top);g.setLocalMatrix(m);
        return node.gradient=g;
    }
    private static float ratio(Node n,String key,float fallback){
        String s=n.attr(key);if(!s.endsWith("%"))return n.f(key,fallback);
        try{return Float.parseFloat(s.substring(0,s.length()-1))/100;}catch(NumberFormatException e){return fallback;}
    }
    private static final class TextLine {
        final float x,y;final StringBuilder text=new StringBuilder();
        TextLine(float x,float y){this.x=x;this.y=y;}
    }
    private static TextLine letteringRuns(Node n,List<TextLine> lines,TextLine line){
        for(Node child:n.children){
            if(child.kind.equals("literal")){line.text.append(child.label);continue;}
            if(!child.kind.equals("tspan"))continue;
            if(!child.attr("x").isEmpty()||!child.attr("y").isEmpty()||!child.attr("dy").isEmpty()){
                line=new TextLine(child.f("x",line.x),child.f("y",line.y)+child.f("dy"));lines.add(line);
            }
            line=letteringRuns(child,lines,line);
        }
        return line;
    }
    private static Path lettering(Node n){
        List<TextLine> lines=new ArrayList<>();TextLine first=new TextLine(n.f("x"),n.f("y"));lines.add(first);letteringRuns(n,lines,first);
        Paint p=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        int weight=Math.round(n.f("font-weight",n.attr("font-weight").equals("bold")?700:400));
        p.setTypeface(Typeface.create(n.attr("font-family").contains("monospace")?Typeface.MONOSPACE:Typeface.SANS_SERIF,Math.max(1,Math.min(1000,weight)),false));
        p.setTextSize(n.f("font-size",16));
        String anchor=n.attr("text-anchor");Path path=new Path(),run=new Path();
        for(TextLine line:lines){
            String label=line.text.toString().trim().replaceAll("\\s+"," ");if(label.isEmpty())continue;
            float width=p.measureText(label);run.rewind();
            p.getTextPath(label,0,label.length(),line.x-width*(anchor.equals("middle")?.5f:anchor.equals("end")?1:0),line.y,run);
            path.addPath(run);
        }
        return path;
    }
    private static final class Style {
        static final Style DEFAULT = new Style();
        int fill=0xff000000,stroke=0;
        String fillRef;DashPathEffect dash;
        float fillOpacity=1,strokeOpacity=1,width=1;
        Paint.Cap cap=Paint.Cap.BUTT;
        Paint.Join join=Paint.Join.MITER;
        Style() {}
        Style(Style p,Node n) {
            String ink=n.attr("fill");fill=ink(ink,p.fill);stroke=ink(n.attr("stroke"),p.stroke);
            Matcher url=LOCAL_CLIP.matcher(ink);fillRef=ink.isEmpty()?p.fillRef:url.matches()?url.group(1):null;
            String pattern=n.attr("stroke-dasharray");
            dash=p.dash;
            if(!pattern.isEmpty()){
                dash=null;float[] a=numbers(pattern);
                if(a.length>=2&&a.length%2==0){boolean valid=true;for(float f:a)valid&=f>0;if(valid)dash=new DashPathEffect(a,0);}
            }
            fillOpacity=n.f("fill-opacity",p.fillOpacity); strokeOpacity=n.f("stroke-opacity",p.strokeOpacity); width=n.f("stroke-width",p.width);
            String s=n.attr("stroke-linecap"); cap=s.isEmpty()?p.cap:s.equals("round")?Paint.Cap.ROUND:s.equals("square")?Paint.Cap.SQUARE:Paint.Cap.BUTT;
            s=n.attr("stroke-linejoin"); join=s.isEmpty()?p.join:s.equals("round")?Paint.Join.ROUND:s.equals("bevel")?Paint.Join.BEVEL:Paint.Join.MITER;
        }
        static int ink(String v,int fallback) { return v.isEmpty()?fallback:(v.equals("none")||v.startsWith("url("))?0:Refs.color(v); }
    }
    static final class Node {
        final String kind;
        final HashMap<String,String> a=new HashMap<>();
        final ArrayList<Node> children=new ArrayList<>();
        Node parent,reference,mask;
        Matrix staticTransform,transform;
        Path original,current;
        String label,gradientRef;
        Shader gradient;
        Style style,inherited;
        boolean hidden,inlineHidden;
        float alpha=-1,opacity=1,strokeWidth=-1;
        Node(String kind) { this.kind=kind; }
        void add(Node child) { if (child.parent!=null) child.parent.children.remove(child); child.parent=this; children.add(child); }
        void before(Node child,Node sibling) {
            if(child.parent!=null)child.parent.children.remove(child);
            child.parent=this;children.add(children.indexOf(sibling),child);
        }
        Path outline(){return current==null?original:current;}
        String attr(String name) { return a.getOrDefault(name,""); }
        float f(String name,float fallback) {
            String value=a.get(name);if(value==null||value.isEmpty())return fallback;
            try{return Float.parseFloat(value);}catch(NumberFormatException e){return fallback;}
        }
        float f(String name) { return f(name,0); }
        Node find(String kind) { for(Node n:children) { if(n.kind.equals(kind)) return n; Node k=n.find(kind); if(k!=null)return k; } return null; }
        Matrix reset() { if (transform==null) transform=new Matrix(); else transform.reset(); return transform; }
        Path path() { if(current==null)current=new Path(); else current.reset(); return current; }
        float top() {
            switch (kind) {
                case "rect": return f("y"); case "circle": return f("cy")-f("r"); case "ellipse": return f("cy")-f("ry");
                case "line": return Math.min(f("y1"),f("y2"));
                case "path": case "polygon": case "polyline":
                    float[] xy=numbers(kind.equals("path")?attr("d"):attr("points")); return xy.length>=2?xy[1]:Float.POSITIVE_INFINITY;
                case "g": return children.isEmpty()?Float.POSITIVE_INFINITY:children.get(0).top();
                default: return Float.POSITIVE_INFINITY;
            }
        }
        Path geometry() {
            Path p=new Path();
            switch (kind) {
                case "path": return parsePath(attr("d"));
                case "rect":
                    float x=f("x"),y=f("y"),w=f("width"),h=f("height"),rx=f("rx",f("ry")),ry=f("ry",rx);
                    p.addRoundRect(x,y,x+w,y+h,Math.min(w/2,rx),Math.min(h/2,ry),Path.Direction.CW); return p;
                case "circle": p.addCircle(f("cx"),f("cy"),f("r"),Path.Direction.CW); return p;
                case "ellipse":
                    float cx=f("cx"),cy=f("cy"),xr=f("rx"),yr=f("ry"); p.addOval(cx-xr,cy-yr,cx+xr,cy+yr,Path.Direction.CW); return p;
                case "line": p.moveTo(f("x1"),f("y1")); p.lineTo(f("x2"),f("y2")); return p;
                case "polyline": case "polygon":
                    float[] a=numbers(attr("points")); if(a.length>=2)p.moveTo(a[0],a[1]); for(int i=2;i+1<a.length;i+=2)p.lineTo(a[i],a[i+1]);
                    if(kind.equals("polygon"))p.close(); return p;
                default: return null;
            }
        }
    }
    static float[] numbers(String s) {
        Matcher m=NUM.matcher(s); ArrayList<Float> a=new ArrayList<>(); while (m.find()) a.add(Float.parseFloat(m.group()));
        float[] f=new float[a.size()]; for(int i=0;i<f.length;i++)f[i]=a.get(i); return f;
    }
    static Matrix matrix(String text) {
        Matcher m=TRANSFORM.matcher(text); if(!m.find())return null;
        Matrix out=new Matrix();
        do {
            float[] p=numbers(m.group(2)); if(p.length==0) continue;
            switch (m.group(1)) {
                case "translate": out.preTranslate(p[0],p.length>1?p[1]:0); break;
                case "scale": out.preScale(p[0],p.length>1?p[1]:p[0]); break;
                case "rotate": if(p.length>2)out.preRotate(p[0],p[1],p[2]); else out.preRotate(p[0]); break;
                case "skewX": out.preSkew((float)Math.tan(Math.toRadians(p[0])),0); break;
                case "skewY": out.preSkew(0,(float)Math.tan(Math.toRadians(p[0]))); break;
                case "matrix": if(p.length==6){Matrix a=new Matrix();a.setValues(new float[]{p[0],p[2],p[4],p[1],p[3],p[5],0,0,1});out.preConcat(a);} break;
                default: break;
            }
        } while(m.find());
        return out;
    }
    static Path parsePath(String s) {
        ArrayList<String> tok=new ArrayList<>(); Matcher scan=TOKEN.matcher(s); while(scan.find())tok.add(scan.group());
        Path p=new Path(); int i=0; char command='M',last=' '; float x=0,y=0,bx=0,by=0,kx=0,ky=0;
        while(i<tok.size()) {
            String part=tok.get(i);
            if(Character.isLetter(part.charAt(0))) { command=part.charAt(0); i++; }
            char kind=Character.toUpperCase(command); boolean rel=command!=kind;
            if(kind=='Z') {p.close();x=bx;y=by;last=kind;command='M';continue;}
            int n=kind=='H'||kind=='V'?1:kind=='A'?7:kind=='C'?6:kind=='S'||kind=='Q'?4:2;
            if(i+n>tok.size())throw new IllegalArgumentException("Tracé SVG incomplet : "+s);
            float[] a=new float[n]; for(int k=0;k<n;k++)a[k]=Float.parseFloat(tok.get(i++));
            float dx=rel?x:0,dy=rel?y:0;
            float nx=dx+a[n-2<0?0:n-2],ny=dy+a[n-1];
            switch (kind) {
                case 'M': p.moveTo(nx,ny); bx=nx;by=ny;command=rel?'l':'L';break;
                case 'L': p.lineTo(nx,ny);break;
                case 'H': ny=y;p.lineTo(nx,ny);break;
                case 'V': nx=x;p.lineTo(nx,ny);break;
                case 'C': kx=dx+a[2];ky=dy+a[3];p.cubicTo(dx+a[0],dy+a[1],kx,ky,nx,ny);break;
                case 'S': float fx=last=='C'||last=='S'?2*x-kx:x,fy=last=='C'||last=='S'?2*y-ky:y;
                    kx=dx+a[0];ky=dy+a[1];p.cubicTo(fx,fy,kx,ky,nx,ny);break;
                case 'Q': kx=dx+a[0];ky=dy+a[1];p.quadTo(kx,ky,nx,ny);break;
                case 'T': kx=last=='Q'||last=='T'?2*x-kx:x;ky=last=='Q'||last=='T'?2*y-ky:y;p.quadTo(kx,ky,nx,ny);break;
                case 'A': arc(p,x,y,nx,ny,a[0],a[1],a[2],a[3]!=0,a[4]!=0);break;
                default: throw new IllegalArgumentException("Commande SVG inconnue : "+kind);
            }
            x=nx;y=ny;last=kind;
        }
        return p;
    }
    private static void arc(Path p,double x,double y,double x1,double y1,double rx,double ry,double degrees,boolean large,boolean sweep) {
        if(x==x1&&y==y1)return; rx=Math.abs(rx);ry=Math.abs(ry);
        if(rx==0||ry==0){p.lineTo((float)x1,(float)y1);return;}
        double phi=Math.toRadians(degrees),cs=Math.cos(phi),sn=Math.sin(phi),dx=(x-x1)/2,dy=(y-y1)/2;
        double xp=(cs*dx+sn*dy)/rx,yp=(-sn*dx+cs*dy)/ry, lambda=xp*xp+yp*yp;
        if(lambda>1){ double k=Math.sqrt(lambda);rx*=k;ry*=k;xp/=k;yp/=k;lambda=1; }
        double g=(large==sweep?-1:1)*Math.sqrt(Math.max(0,1/lambda-1)),u=g*yp,v=-g*xp;
        double cx=cs*u*rx-sn*v*ry+(x+x1)/2,cy=sn*u*rx+cs*v*ry+(y+y1)/2;
        double a=Math.atan2(yp-v,xp-u),end=Math.atan2(-yp-v,-xp-u),da=end-a;
        if(sweep&&da<0)da+=2*Math.PI; if(!sweep&&da>0)da-=2*Math.PI;
        int n=Math.max(1,(int)Math.ceil(Math.abs(da)/(Math.PI/2))); double step=da/n,s=4d/3*Math.tan(step/4);
        Matrix m=new Matrix();m.setValues(new float[]{(float)(cs*rx),(float)(-sn*ry),(float)cx,(float)(sn*rx),(float)(cs*ry),(float)cy,0,0,1});
        for(int i=0;i<n;i++,a+=step){double b=a+step,sa=Math.sin(a),ca=Math.cos(a),sb=Math.sin(b),cb=Math.cos(b);
            float[] q={(float)(ca-s*sa),(float)(sa+s*ca),(float)(cb+s*sb),(float)(sb-s*cb),(float)cb,(float)sb};
            m.mapPoints(q);p.cubicTo(q[0],q[1],q[2],q[3],i+1==n?(float)x1:q[4],i+1==n?(float)y1:q[5]);}
    }
    static void icon(Canvas c,Paint p,Path path,float x,float y,float width,int color) {
        if(path==null)return; c.save(); c.translate(x,y);c.scale(width/24,width/24);
        p.setShader(null);p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);p.setStrokeWidth(2);
        c.drawPath(path,p);p.setStyle(Paint.Style.FILL);c.restore();
    }
}
