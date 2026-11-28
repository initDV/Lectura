package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.LruCache;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.AtlasPlan.ease;

/** Canvas projection shared verbatim by the stage, video and PNG. No independent animation clock. */
final class AtlasProjection {
    static final int BACKGROUND=0xff0d151f, TEXT=0xffdceaf4, RULE=0x5977bdd7;
    private static final float WIDTH=420,HEIGHT=332;
    private final Refs refs;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
    private final Path work=new Path(),beam=Svg.parsePath("M35 40 383 40 270 302 150 302Z"),
        axis=Svg.parsePath("M94 302h-14m246 0h14m-130 17v6m0-43v-6");
    private final Shader beamLight=new LinearGradient(0,40,0,302,new int[]{0x006eebff,0x1067d4fa,0x2867e3fa},new float[]{0,.8f,1},Shader.TileMode.CLAMP);
    private final Shader halo=new RadialGradient(0,0,117,new int[]{0x775df7dd,0x44477cc3,0x00477cc3},new float[]{0,.48f,1},Shader.TileMode.CLAMP);
    private final Shader backdrop=backdrop();
    private final float[] dots=dots();
    private final LruCache<String,Svg> drawings=new LruCache<>(6);
    private final LruCache<AtlasPlan.Step,Trace> traces=new LruCache<>(12);
    private final Set<String> unavailable=new HashSet<>();
    private AtlasPlan.Window window;
    private Svg current;
    private Network network;
    private Glass glass;
    private double ms;
    private boolean reduced,isNetwork,isGlass;
    private final Typeface heading=Typeface.create(Typeface.SANS_SERIF,650,false);

    AtlasProjection(Refs refs){
        this.refs=refs;paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
    }
    AtlasPlan.Card card(){return window!=null&&(current!=null||isNetwork||isGlass)?window.card:null;}
    void update(AtlasPlan plan,double time,boolean reduce){
        ms=time;reduced=reduce;
        AtlasPlan.Window w=plan==null?null:plan.at(ms);
        if(w==window)return;
        window=w;current=null;isNetwork=isGlass=false;
        if(w==null)return;
        String id=w.card.id;
        AtlasPlan.Catalogue catalogue=refs.atlas(); // Already parsed on the preparation worker.
        try{
            if(id.equals(catalogue.networkId)){
                if(network==null)network=new Network(catalogue.networkArt);
                isNetwork=true;
            }else if(id.equals(catalogue.condensationId)){
                if(glass==null)glass=new Glass(catalogue.condensationArt);
                isGlass=true;
            }else if(!unavailable.contains(id)){
                current=drawings.get(id);
                if(current==null)try(InputStream in=refs.open("atlas/"+id+".svg")){
                    current=new Svg(in,true);drawings.put(id,current);
                }
            }
        }catch(IOException|RuntimeException e){
            if(unavailable.add(id))android.util.Log.e("Lectura", "Atlas : "+id,e);
        }
    }
    private static Shader backdrop(){
        RadialGradient g=new RadialGradient(0,0,1,new int[]{0xff21374a,0xff0e1825,BACKGROUND},new float[]{0,.66f,1},Shader.TileMode.CLAMP);
        Matrix m=new Matrix();m.setScale(720*.7213f,480*1.4142f);m.postTranslate(720*.51f,480);g.setLocalMatrix(m);return g;
    }
    private static float[] dots(){
        float[] out=new float[30*20*2];
        int i=0;for(int y=1;y<480;y+=24)for(int x=1;x<720;x+=24){out[i++]=x;out[i++]=y;}return out;
    }
    void background(Canvas c,float w,float h){
        c.drawColor(BACKGROUND);
        float k=Math.max(w/720,h/480);c.save();c.translate((w-720*k)/2,h-480*k);c.scale(k,k);
        ink(BACKGROUND);paint.setShader(backdrop);c.drawRect(0,0,720,480,paint);paint.setShader(null);
        line(2,0x3d6d8da6);c.drawPoints(dots,paint);
        c.restore();
    }
    boolean draw(Canvas c,float x,float y,float w,float h){
        AtlasPlan.Card card=card();if(card==null||w<=0||h<=0)return false;
        float k=Math.min(w*.96f/WIDTH,h*.95f/HEIGHT);
        c.save();c.clipRect(x,y,x+w,y+h);c.translate(x+(w-WIDTH*k)/2,y+(h-HEIGHT*k)/2);c.scale(k,k);
        projector(c);
        c.save();c.translate(9,11);c.scale(402f/420,402f/420);
        float alpha=window.opacity(ms,reduced);
        if(alpha<.999f)c.saveLayerAlpha(0,0,420,248,Math.round(alpha*255));
        if(isNetwork)network.draw(c,window.network,ms,reduced);
        else if(isGlass)glass.draw(c,window,ms,reduced);
        else highlight(c);
        if(alpha<.999f)c.restore();
        c.restore();
        label(c,card.name,210,273,27,393,0xffe6fcff);
        c.restore();return true;
    }
    private void projector(Canvas c){
        ink(0xff000000);paint.setShader(beamLight);paint.setAlpha(158);c.drawPath(beam,paint);
        c.save();c.translate(210,302);c.scale(1,.217f);paint.setShader(halo);c.drawRect(-117,-117,117,117,paint);c.restore();paint.setShader(null);
        line(1.25f,0x3a77bcdf);c.drawOval(103,281,317,323,paint);
        line(1.25f,0x4c9ddcf2);c.drawOval(128,287,292,317,paint);
        line(1.25f,0x749efae4);c.drawOval(162,294,258,310,paint);
        stroke(c,axis,1.25f,0x63a1f7e9);
    }
    private void highlight(Canvas c){
        AtlasPlan.Mark action=window.active(ms,reduced);
        double p=action==null?0:action.progress(ms,reduced);
        float strength=action==null?0:(float)(reduced?.82:ease(p/.24)*ease((1-p)/.24));
        if(strength<=0){current.draw(c,0,0,1);return;}
        c.saveLayerAlpha(0,0,420,248,Math.round(255*(1-.44f*strength)));current.draw(c,0,0,1);c.restore();
        float[] b=action.step.box;
        float x=b[0],y=b[1],w=b[2],h=b[3];
        c.save();c.clipRect(x,y,x+w,y+h);current.draw(c,0,0,1);c.restore();
        c.saveLayerAlpha(0,0,420,248,Math.round(255*strength));
        float d=Math.min(49,Math.min(w,h))*.24f;work.rewind();
        for(int j=0;j<2;j++)for(int i=0;i<2;i++){
            float xx=x+i*w,yy=y+j*h;
            work.moveTo(xx,yy+d*(1-2*j));work.lineTo(xx,yy);work.lineTo(xx+d*(1-2*i),yy);
        }
        stroke(c,work,1.9f,0xffa3f4e1);
        if(!action.overview&&action.step.trace.length>=4){
            Trace trace=traces.get(action.step);if(trace==null){trace=new Trace(action.step.trace);traces.put(action.step,trace);}
            float u=(float)(reduced?1:ease((p-.05)/.86));
            if(u>0){
                if(!reduced)trace.part(c,0,u,7,0x4aa0ffe6);
                trace.part(c,0,u,2.5f,0xffc0ffe9);
                if(!reduced)trace.light(c,u,4,0xffeafff6);
            }
        }
        c.restore();
    }
    private void ink(int color){paint.setShader(null);paint.setStyle(Paint.Style.FILL);paint.setColor(color);}
    private void line(float w,int color){ink(color);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(w);}
    private void fill(Canvas c,Path p,int color){ink(color);c.drawPath(p,paint);}
    private void stroke(Canvas c,Path p,float w,int color){line(w,color);c.drawPath(p,paint);}
    private void dot(Canvas c,float x,float y,float r,int color){ink(color);c.drawCircle(x,y,r,paint);}
    private void oval(Canvas c,float x,float y,float rx,float ry,int color){ink(color);c.drawOval(x-rx,y-ry,x+rx,y+ry,paint);}
    private void label(Canvas c,String label,float x,float y,float size,float maxWidth,int color){
        ink(color);paint.setTypeface(heading);paint.setTextSize(size);paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextScaleX(Math.min(1,maxWidth/Math.max(1,paint.measureText(label))));c.drawText(label,x,y,paint);paint.setTextScaleX(1);
    }
    private final class Trace {
        final Path path=new Path(),part=new Path();
        final PathMeasure meter;final float distance;final float[] point=new float[2];
        Trace(float[] xy){
            path.moveTo(xy[0],xy[1]);for(int i=2;i<xy.length;i+=2)path.lineTo(xy[i],xy[i+1]);
            meter=new PathMeasure(path,false);distance=meter.getLength();
        }
        void part(Canvas c,float from,float to,float width,int color){
            if(from==0&&to>=1){stroke(c,path,width,color);return;}
            part.rewind();if(meter.getSegment(from*distance,to*distance,part,true))stroke(c,part,width,color);
        }
        void light(Canvas c,float fraction,float r,int color){if(meter.getPosTan(fraction*distance,point,null))dot(c,point[0],point[1],r,color);}
    }
    private Trace trace(JSONArray points){
        float[] xy=new float[points.length()*2];
        for(int i=0;i<points.length();i++){JSONArray p=points.optJSONArray(i);xy[2*i]=(float)p.optDouble(0);xy[2*i+1]=(float)p.optDouble(1);}
        return new Trace(xy);
    }
    private static Path shape(JSONObject o,String name){return Svg.parsePath(o.optString(name));}
    private final class Network {
        final Trace[] cables;final Trace packet;
        final Path[] devices,details;final float[][] lights;
        final Path top,left,right,vents,waves;
        final Path arrow=Svg.parsePath("M299 64 306 69 299 74");
        final DashPathEffect broken=new DashPathEffect(new float[]{3,7},0);
        final RadialGradient glow=new RadialGradient(210,127,108,new int[]{0x424bd5e1,0x004bd5e1},null,Shader.TileMode.CLAMP);
        final LinearGradient surface=new LinearGradient(40,37,210,226,new int[]{0xff24536b,0xff1b3653,0xff101d36},new float[]{0,.53f,1},Shader.TileMode.CLAMP);
        Network(JSONObject o){
            JSONArray links=o.optJSONArray("cables"),apart=o.optJSONArray("appareils");
            cables=new Trace[links.length()];for(int i=0;i<cables.length;i++)cables[i]=trace(links.optJSONArray(i));
            packet=trace(o.optJSONArray("parcours"));devices=new Path[apart.length()];details=new Path[apart.length()];lights=new float[apart.length()][2];
            for(int i=0;i<devices.length;i++){
                JSONArray a=apart.optJSONArray(i);devices[i]=Svg.parsePath(a.optString(0));details[i]=Svg.parsePath(a.optString(1));
                lights[i][0]=(float)a.optDouble(2);lights[i][1]=(float)a.optDouble(3);
            }
            top=shape(o,"dessus");left=shape(o,"gauche");right=shape(o,"droite");vents=shape(o,"fentes");waves=shape(o,"ondes");
        }
        void draw(Canvas c,AtlasPlan.Network plan,double ms,boolean reduce){
            float router=reduce?1:(float)ease(plan.router.progress(ms,false)),links=reduce?1:(float)ease(plan.links.progress(ms,false));
            AtlasPlan.Span exchange=plan.signal(ms);float signal=exchange==null||reduce?-1:(float)exchange.progress(ms,false);
            oval(c,210,126,182,88,0x5e142f47);
            if(router>0){ink(0xff000000);paint.setShader(glow);paint.setAlpha(Math.round(158*router));c.drawRect(102,19,318,235,paint);paint.setShader(null);}
            for(int i=0;i<cables.length;i++){
                paint.setPathEffect(broken);cables[i].part(c,0,1,2.6f,0xb348738b);paint.setPathEffect(null);
                cables[i].part(c,0,light(links,i),3.2f,0xff86dfeb);
            }
            if(exchange!=null){
                packet.part(c,0,1,4,0xffa2f7ca);
                if(reduce)stroke(c,arrow,4,0xffa2f7ca);
                else{
                    float tail=Math.max(0,signal-.15f);
                    packet.part(c,tail,signal,10,0x4d7affb3);packet.part(c,tail,signal,4,0xffe7ffbf);
                    packet.light(c,signal,9,0x486affca);packet.light(c,signal,4.8f,0xfff1ffe0);
                }
            }
            for(int i=0;i<devices.length;i++){
                float level=light(links,i);
                c.saveLayerAlpha(0,0,420,248,Math.round(255*(.43f+.57f*level)));
                surface(c,devices[i]);stroke(c,devices[i],2.8f,0xffa1e9f1);stroke(c,details[i],2.4f,0xff83b8cb);
                if(level>.82)dot(c,lights[i][0],lights[i][1],2.8f,0xff99f7cb);
                c.restore();
            }
            c.saveLayerAlpha(0,0,420,248,Math.round(255*(.54f+.46f*router)));
            fill(c,left,0xff3c3461);stroke(c,left,2.6f,0xffa991ec);fill(c,right,0xff25264e);stroke(c,right,2.6f,0xffa991ec);
            surface(c,top);stroke(c,top,2.6f,0xffaee9ff);stroke(c,vents,2.6f,0xff9ba7df);
            boolean relay=signal>=.33f&&signal<=.68f;
            stroke(c,waves,3.1f,relay?0xffd5ffd3:0xff9cf8ee);
            for(int i=0;i<3;i++)dot(c,163+i*13,143+i*5,relay?3.7f:3.1f,router>.5?0xff9effcb:0xff6499a6);
            c.restore();
        }
        private float light(float links,int i){return (float)ease((links-i*.09)/(1-i*.09));}
        private void surface(Canvas c,Path path){ink(0xff000000);paint.setShader(surface);c.drawPath(path,paint);paint.setShader(null);}
    }
    private final class Glass {
        final Path vessel,water,reflections,wall,arrow,cold;
        final Path drop=Svg.parsePath("M0 -1.28C.27 -.77 .87 -.17 .87 .31C.87 1.4 -.87 1.4 -.87 .31C-.87 -.17 -.27 -.77 0 -1.28Z");
        final float[][] drops;
        final LinearGradient tint=new LinearGradient(174,90,314,169,new int[]{0xff22485b,0xff152f45,0xff30617d},new float[]{0,.43f,1},Shader.TileMode.CLAMP);
        final RadialGradient sheen=new RadialGradient(244,127,131,new int[]{0x52499ec2,0x00499ec2},new float[]{.19f,1},Shader.TileMode.CLAMP);
        Glass(JSONObject o){
            JSONObject p=o.optJSONObject("formes");vessel=shape(p,"verre");water=shape(p,"eau");reflections=shape(p,"reflets");
            wall=shape(p,"paroi");arrow=shape(p,"fleche");cold=shape(p,"traitFroid");
            JSONArray all=o.optJSONArray("gouttesFixes");drops=new float[all.length()][];for(int i=0;i<drops.length;i++)drops[i]=AtlasPlan.floats(all.optJSONArray(i));
        }
        void draw(Canvas c,AtlasPlan.Window w,double ms,boolean reduce){
            boolean still=reduce&&!w.marks.isEmpty()&&w.marks.get(0).overview;
            float slide=still?0:(float)w.phase(3,ms,reduce),join=slide>0?1:still?0:(float)w.phase(2,ms,reduce);
            float wet=join>0||still?1:(float)w.phase(1,ms,reduce),chill=wet>0||still?1:(float)w.phase(0,ms,reduce);
            ink(0xff000000);paint.setShader(sheen);c.drawRect(109,2,371,248,paint);
            oval(c,243,209,86,10,0x3089b7cb);ink(0xff000000);paint.setShader(tint);c.drawPath(vessel,paint);
            fill(c,water,0x4f328ed0);line(2.2f,0x7287e4fb);c.drawOval(179,114,301,136,paint);
            stroke(c,vessel,2.8f,0xff90c6d9);oval(c,240,57,69,12,0xff173847);line(2.8f,0xffa8dce8);c.drawOval(171,45,309,69,paint);
            stroke(c,reflections,2.4f,0x70b2e8fa);
            c.saveLayerAlpha(0,0,420,248,Math.round(255*(.2f+.8f*chill)));
            stroke(c,wall,8,0x3872d4ef);stroke(c,wall,3.6f,0xffa8f0ff);stroke(c,cold,1.6f,0xff97d6eb);c.restore();
            label(c,"Air humide",81,99,22,147,0xffd7edf7);label(c,"Vapeur invisible",81,122,17,147,0xffa3bdcf);
            stroke(c,arrow,2.7f,chill>.65?0xffa2eddc:0xff629faf);label(c,"Paroi froide",358,75,19,103,chill>.65?0xffbbedff:0xff90b2c4);
            for(float[] d:drops)drop(c,edge(d[0])+d[1],d[0],d[2]*(float)ease((wet-d[3])/(1-d[3])),1);
            float small=104+32*join,big=137+63*slide;
            if(slide>0){line(2.7f,0x6186dcf8);c.drawLine(edge(137)+7,137,edge(big)+8,big,paint);}
            drop(c,edge(small)+8,small,6.1f*(float)ease((wet-.17)/.83)*(1-join*.63f),1-join);
            drop(c,edge(big)+8,big,7.2f*(float)ease((wet-.29)/.71)+join*2.9f,1);
        }
        private float edge(float y){return 309-(y-59)*15/132;}
        private void drop(Canvas c,float x,float y,float r,float alpha){
            if(r<.1f||alpha<=0)return;
            c.save();c.translate(x,y);c.scale(r,r);
            int a=Math.round(255*alpha)<<24;
            fill(c,drop,a|0x7ad5f1);stroke(c,drop,.16f,a|0xc4f5ff);oval(c,-.29f,.09f,.16f,.30f,a|0xeefcff);c.restore();
        }
    }
}
