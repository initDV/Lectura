package io.github.initdv.lectura;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.AichaGeometry.*;
import static io.github.initdv.lectura.AichaMotion.*;
import static io.github.initdv.lectura.DeviceChecks.require;

/** Compares the port to Web frames and exercises the actual scene on the offline test device. */
final class AichaChecks {
    private static void near(double a,double b,String msg){require(Double.isFinite(a)&&Math.abs(a-b)<.000001,msg+": "+a+" / "+b);}
    private static void intervals(List<? extends Interval> a,JSONArray b)throws Exception{
        require(a.size()==b.length(),"Nombre de repères "+a.size()+" / "+b.length());
        for(int i=0;i<a.size();i++){
            Interval one=a.get(i);JSONObject ref=b.getJSONObject(i);near(one.start,ref.getDouble("start"),"Début");near(one.end,ref.getDouble("end"),"Fin");
            if(one instanceof Cue){Cue c=(Cue)one;require(c.kind.equals(ref.getString("kind"))&&c.side==ref.getInt("side")&&c.face.equals(ref.getString("face")),"Geste ou expression");near(c.force,ref.getDouble("force"),"Force");}
            if(one instanceof Walk){Walk w=(Walk)one;near(w.distance,ref.getDouble("distance"),"Avance");require(w.count==ref.getInt("count")&&w.foot==ref.getInt("pied"),"Pas");}
        }
    }
    private static void vectors(JSONArray refs,Vec... vecs)throws Exception{
        for(int i=0;i<vecs.length;i++){Vec p=vecs[i];JSONArray v=refs.getJSONArray(i);near(p.x,v.getDouble(0),"x");near(p.y,v.getDouble(1),"y");near(p.z,v.getDouble(2),"z");}
    }
    private static void foot(Foot f,JSONObject ref)throws Exception{
        near(f.x,ref.getDouble("x"),"Pas x");near(f.z,ref.getDouble("z"),"Pas z");near(f.lift,ref.getDouble("lift"),"Levée");
        near(f.pitch,ref.getDouble("pitch"),"Pas tangage");near(f.roll,ref.optDouble("roll",0),"Pas roulis");
        require(f.grounded==ref.getBoolean("grounded"),"Appui du pied");
    }
    static int parity(JSONObject g2pTable,JSONArray groups)throws Exception{
        int n=0;G2p g2p=new G2p(g2pTable);
        for(int i=0;i<groups.length();i++){
            JSONObject group=groups.getJSONObject(i);List<Part> parts=new ArrayList<>();AichaMouth lips=new AichaMouth();
            JSONArray segments=group.getJSONArray("segs"),frames=group.getJSONArray("frames");
            for(int s=0;s<segments.length();s++){
                JSONObject j=segments.getJSONObject(s);String text=j.getString("texte"),expr=j.getString("expression");
                double start=j.getDouble("debutMs"),end=j.getDouble("finMs"),speechEnd=j.getDouble("speechEndMs");
                boolean spoken=j.getBoolean("spoken");parts.add(new Part(text,start,end,speechEnd,spoken,expr.equals("auto")?"neutre":expr,1));
                if(spoken){String ph=group.getString("langue").equals("en")?AichaMouth.english(text):g2p.phrase(text,group.getBoolean("siwis"));lips.add(ph,start,speechEnd);}
            }
            Plan p=plan(parts,group.getDouble("duration"),group.getBoolean("emotions"));
            intervals(p.cues,group.getJSONArray("cues"));intervals(p.walks,group.getJSONArray("walks"));
            intervals(p.speech,group.getJSONArray("speech"));intervals(p.returns,group.getJSONArray("returns"));
            for(int j=0;j<frames.length();j++,n++){
                JSONObject f=frames.getJSONObject(j),ref=f.getJSONObject("p");double t=f.getDouble("t");
                Pose v=pose(p,t,f.getDouble("gain"),f.getBoolean("reduced"),f.getString("expression"),lips.atTime(t,f.getDouble("level")),f.getDouble("wait"),f.getBoolean("glasses"));
                String at=group.getString("id")+" @ "+t+" ";
                for(Field k:Pose.class.getDeclaredFields())if(k.getType()==double.class)near(k.getDouble(v),ref.getDouble(k.getName()),at+k.getName());
                for(int k=0;k<v.mouth.length;k++)near(v.mouth[k],ref.getJSONArray("mouth").getDouble(k),at+"visème "+k);
                foot(v.stepL,ref.getJSONObject("stepL"));foot(v.stepR,ref.getJSONObject("stepR"));
                Leg[] legs=legs(v);Head h=new Head(v);
                for(int k=0;k<2;k++){
                    Leg l=legs[k];JSONObject lj=f.getJSONArray("legs").getJSONObject(k);
                    vectors(lj.getJSONArray("positions"),l.hip,l.knee,l.ankle,l.rest,l.heel,l.toe,l.contact);
                    require(l.reachable==lj.getBoolean("reachable"),at+"portée des jambes");
                    Arm a=new Arm(v,k==0,h);JSONObject aj=f.getJSONArray("arms").getJSONObject(k);
                    vectors(aj.getJSONArray("positions"),a.shoulder,a.elbow,a.wrist,a.hand);near(a.turn,aj.getDouble("rot"),at+"poignet");
                }
            }
        }
        return n;
    }
    static Svg svg(Refs r,JSONObject def)throws Exception{try(InputStream in=r.open("characters/"+def.getString("svg"))){return new Svg(in);}}
    static void thumbnail(Refs r,JSONObject def)throws Exception{
        Svg art=svg(r,def);Bitmap b=Bitmap.createBitmap(202,288,Bitmap.Config.ARGB_8888);
        try{
            art.fit(new Canvas(b),0,0,202,288,false);int opaque=0;
            for(int y=0;y<b.getHeight();y+=3)for(int x=0;x<b.getWidth();x+=3)if((b.getPixel(x,y)>>>24)>200)opaque++;
            require(opaque>200,"Vignette vide pour "+def.getString("id"));
            if(AichaTrack.matches(def)){
                require(art.get("profil-l").reference==art.get("handL")&&art.get("masque-iris-l").mask==art.get("limite-l")
                    &&art.get("interieur").mask==art.get("bord-bouche")&&art.get("aicha-sol").attr("display").equals("none"),"Références locales de la vignette");
            }
        }finally{b.recycle();}
    }
    private static void drawActor(Stage stage,Bitmap b,double wall){
        stage.updatePose(wall);b.eraseColor(0);
        stage.artwork.fit(new Canvas(b),0,0,b.getWidth(),b.getHeight(),false);
    }
    static void stage(DeviceChecks device,Context ctx)throws Exception{
        MainActivity a=device.open(ctx);Project[] previous=new Project[1];
        Bitmap first=Bitmap.createBitmap(240,420,Bitmap.Config.ARGB_8888),other=Bitmap.createBitmap(240,420,Bitmap.Config.ARGB_8888);
        try{
            device.main(()->previous[0]=a.project);
            for(String id:List.of("aicha","charlotte","doriane","monique","prisca")){
                device.main(()->{
                    Project p=new Project(a.db.settings);p.character=id;p.speed=1;p.cps=28;p.text="Bonjour, on se retrouve au marché ! Tu viens avec nous ?";
                    a.open(p);require(a.stage.aicha!=null&&a.stage.sprite==null,"Rig natif attendu");a.stage.aicha.reduced=false;
                    a.launch(true);
                });
                device.waitFor("Aperçu hors ligne de "+id,()->a.reading!=null&&a.reading.aicha!=null&&a.reading.playing,10000);
                device.main(()->{
                    Reading r=a.reading;require(r.silent&&r.pcm==null&&r.aicha.plan.duration>1,"Piste d’aperçu "+id);
                    a.launch(false);require(!r.playing&&!a.stopped,"Pause "+id);
                    r.seek(530);drawActor(a.stage,first,1000);
                    drawActor(a.stage,other,20000);require(first.sameAs(other),"Image bougée en pause "+id);
                    r.seek(1340);drawActor(a.stage,other,20810);require(!first.sameAs(other),"Image immobile en aperçu "+id);
                    r.seek(530);drawActor(a.stage,other,20880);require(first.sameAs(other),"Pose non retrouvée "+id);
                    require(a.stage.artwork.get("bouche").alpha>=0&&a.stage.artwork.get("limite-l").current!=null,"Bouche ou masque immobile");
                    a.stop();
                });
            }
        }finally{
            first.recycle();other.recycle();device.main(()->{if(previous[0]!=null){a.open(previous[0]);a.draft();}a.finish();});
        }
    }
}
