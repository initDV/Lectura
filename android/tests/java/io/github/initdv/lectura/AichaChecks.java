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
            if(one instanceof Cue){Cue c=(Cue)one;require(c.kind.equals(ref.getString("kind"))&&c.side==ref.getInt("side")&&c.hand==ref.getInt("hand")
                &&c.face.equals(ref.getString("face")),"Geste ou expression");near(c.force,ref.getDouble("force"),"Force");}
            if(one instanceof AichaFaces.Window){AichaFaces.Window m=(AichaFaces.Window)one;require(m.face.equals(ref.getString("face")),"Humeur");near(m.force,ref.getDouble("force"),"Intensité de l’humeur");}
            if(one instanceof Walk){Walk w=(Walk)one;near(w.distance,ref.getDouble("distance"),"Avance");require(w.count==ref.getInt("count")&&w.foot==ref.getInt("pied"),"Pas");}
        }
    }
    private static void vector(JSONArray v,Vec p)throws Exception{near(p.x,v.getDouble(0),"x");near(p.y,v.getDouble(1),"y");near(p.z,v.getDouble(2),"z");}
    private static void vectors(JSONArray refs,Vec... vecs)throws Exception{
        for(int i=0;i<vecs.length;i++)vector(refs.getJSONArray(i),vecs[i]);
    }
    private static void foot(Foot f,JSONObject ref)throws Exception{
        near(f.x,ref.getDouble("x"),"Pas x");near(f.z,ref.getDouble("z"),"Pas z");near(f.lift,ref.getDouble("lift"),"Levée");
        near(f.pitch,ref.getDouble("pitch"),"Pas tangage");near(f.roll,ref.optDouble("roll",0),"Pas roulis");
        require(f.grounded==ref.getBoolean("grounded"),"Appui du pied");
    }
    static int parity(Refs refs,JSONArray groups)throws Exception{
        int n=0;G2p g2p=new G2p(refs.json("g2p.json"));Visages visages=refs.visages;
        for(int i=0;i<groups.length();i++){
            JSONObject group=groups.getJSONObject(i);List<Part> parts=new ArrayList<>();AichaMouth lips=new AichaMouth();
            JSONArray segments=group.getJSONArray("segs"),frames=group.getJSONArray("frames");
            String lang=group.getString("langue"),source=group.getString("texte");boolean emotions=group.getBoolean("emotions");
            Mood mood=group.getBoolean("analyse")?new Mood(refs,lang,new Script.Keywords(refs,lang,new JSONObject()),emotions):null;
            Script.Segment before=null;
            for(int s=0;s<segments.length();s++){
                JSONObject j=segments.getJSONObject(s);String text=j.getString("texte"),expr=j.getString("expression");
                double start=j.getDouble("debutMs"),end=j.getDouble("finMs"),speechEnd=j.getDouble("speechEndMs");
                boolean spoken=j.getBoolean("spoken");Script.Segment seg=new Script.Segment(text,j.getInt("start"),j.getInt("end"),Script.type(text));
                seg.from=(long)start;seg.to=(long)end;seg.speechEnd=(long)speechEnd;seg.expression=expr;
                Mood.Analysis summary=mood!=null?mood.summary(seg):new Mood.Analysis();
                if(mood==null&&!expr.equals("auto")){summary.expr=expr;summary.manual=true;}
                parts.add(AichaFaces.part(seg,before,source,summary,emotions));before=seg;
                if(spoken){String ph=lang.equals("en")?AichaMouth.english(text):g2p.phrase(text,group.getBoolean("siwis"));lips.add(ph,start,speechEnd);}
            }
            Plan p=plan(parts,group.getDouble("duration"),emotions);
            HipAnchor anchor=HipAnchor.read(group.optJSONArray("ancre"));
            intervals(p.moods,group.getJSONArray("moods"));
            intervals(p.cues,group.getJSONArray("cues"));intervals(p.walks,group.getJSONArray("walks"));
            intervals(p.speech,group.getJSONArray("speech"));intervals(p.returns,group.getJSONArray("returns"));
            for(int j=0;j<frames.length();j++,n++){
                JSONObject f=frames.getJSONObject(j),ref=f.getJSONObject("p");double t=f.getDouble("t");
                Pose v=pose(p,t,f.getDouble("gain"),f.getBoolean("reduced"),f.getString("expression"),lips.atTime(t,f.getDouble("level")),f.getDouble("wait"),f.getBoolean("glasses"),visages);
                String at=group.getString("id")+" @ "+t+" ";
                for(Field k:Pose.class.getDeclaredFields())if(k.getType()==double.class)near(k.getDouble(v),ref.getDouble(k.getName()),at+k.getName());
                for(int k=0;k<v.mouth.length;k++)near(v.mouth[k],ref.getJSONArray("mouth").getDouble(k),at+"visème "+k);
                foot(v.stepL,ref.getJSONObject("stepL"));foot(v.stepR,ref.getJSONObject("stepR"));
                Leg[] legs=legs(v);Head h=new Head(v);Cage cage=new Cage(v);
                vector(f.getJSONArray("cage"),new Vec(cage.c,cage.s,cage.slope));
                for(int k=0;k<2;k++){
                    Leg l=legs[k];JSONObject lj=f.getJSONArray("legs").getJSONObject(k);
                    vectors(lj.getJSONArray("positions"),l.hip,l.knee,l.ankle,l.rest,l.heel,l.toe,l.contact);
                    require(l.reachable==lj.getBoolean("reachable"),at+"portée des jambes");
                    Arm a=new Arm(v,k==0,h,cage,anchor);JSONObject aj=f.getJSONArray("arms").getJSONObject(k);
                    double[] xy=new double[2];a.warp.map(-34,71,xy);
                    vectors(aj.getJSONArray("positions"),a.shoulder,a.elbow,a.wrist,a.hand,new Vec(xy[0],xy[1]));near(a.turn,aj.getDouble("rot"),at+"poignet");
                    double[] wrist={a.forearm,a.width,a.face,a.open,a.index,a.grip,a.appui};JSONArray w=aj.getJSONArray("poignet"),fingers=aj.getJSONArray("doigts");
                    for(int b=0;b<wrist.length;b++)near(wrist[b],w.getDouble(b),at+"poignet "+b);
                    for(int b=0;b<5;b++)vectors(fingers.getJSONArray(b),a.finger(b));
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
                    Project p=new Project(a.db.settings);p.character=id;p.speed=1;p.cps=28;p.text="Voici le détail qui change tout.";
                    a.open(p);require(a.stage.aicha!=null&&a.stage.sprite==null,"Rig natif attendu");a.stage.aicha.reduced=false;
                    a.launch(true);
                });
                device.waitFor("Aperçu hors ligne de "+id,()->a.reading!=null&&a.reading.aicha!=null&&a.reading.playing,10000);
                device.main(()->{
                    Reading r=a.reading;require(r.silent&&r.pcm==null&&r.aicha.plan.duration>1,"Piste d’aperçu "+id);
                    a.launch(false);require(!r.playing&&!a.stopped,"Pause "+id);
                    Cue figure=r.aicha.plan.cues.stream().filter(c->c.kind.equals("illustre")&&c.hand!=0).findFirst().orElseThrow();
                    double peak=500*(figure.start+figure.end);String side=figure.hand>0?"l":"r";
                    r.seek(peak);drawActor(a.stage,first,1000);
                    Svg.Node wrist=a.stage.artwork.get("poignet-"+side);
                    require(wrist.parent==a.stage.artwork.get("buste"),"Main au premier plan "+id);
                    require(a.stage.artwork.get("profil-"+side).hidden&&a.stage.artwork.get("paume-"+side).alpha==1,"Main animée sur la hanche "+id);
                    Svg.Node shadow=a.stage.artwork.get("paume-"+side).children.get(0);
                    require(shadow.kind.equals("ellipse")&&shadow.alpha>.16f,"Ombre au contact "+id);
                    for(int i=0;i<4;i++)require(!a.stage.artwork.get("doigt-"+side+"-"+i).current.isEmpty(),"Phalanges visibles "+id);
                    drawActor(a.stage,other,20000);require(first.sameAs(other),"Image bougée en pause "+id);
                    r.seek(0);drawActor(a.stage,other,20810);require(!first.sameAs(other),"Image immobile en aperçu "+id);
                    require(wrist.parent==a.stage.artwork.get("bras-"+side)&&shadow.alpha==0,"Main et manche au repos sans ombre "+id);
                    r.seek(peak);drawActor(a.stage,other,20880);require(first.sameAs(other),"Pose non retrouvée "+id);
                    require(a.stage.artwork.get("bouche").alpha>=0&&a.stage.artwork.get("limite-l").current!=null,"Bouche ou masque immobile");
                    for(String expression:List.of("content","colere","triste")){
                        a.forced=expression;drawActor(a.stage,other,24000);
                        require(!first.sameAs(other),"Expression forcée sur Canvas "+expression+" / "+id);
                    }
                    a.forced="";a.stop();
                });
            }
            for(String id:List.of("aicha","monique")){
                device.main(()->{
                    Project p=new Project(a.db.settings);p.character=id;p.speed=1;p.cps=16;p.emotions=true;
                    p.text="J’ai cru que tu ne viendrais pas… mais te voilà !";
                    a.open(p);a.stage.aicha.reduced=false;a.launch(true);
                });
                device.waitFor("Réplique en avion de "+id,()->a.reading!=null&&a.reading.aicha!=null&&a.reading.playing,10000);
                device.main(()->{
                    a.launch(false);Reading r=a.reading;Plan direction=r.aicha.plan;
                    require(!r.playing&&direction.moods.size()==1,"Deux tronçons, une réplique "+id);
                    AichaFaces.Window w=direction.moods.get(0);
                    require(w.face.equals("inquiet")&&w.glides.size()==1,"Inquiétude puis joie "+id);
                    double fin=1000*(w.start+.85*(w.end-w.start));
                    Pose avant=pose(direction,500,0,false,"",r.aicha.lips.atTime(500,1),0,true,a.refs.visages);
                    Pose apres=pose(direction,fin,0,false,"",r.aicha.lips.atTime(fin,1),0,true,a.refs.visages);
                    require(avant.smile<-.4&&apres.smile>.7,"Virage du sourire "+id);
                    r.seek(fin);drawActor(a.stage,first,1000);
                    r.seek(500);drawActor(a.stage,other,2000);require(!first.sameAs(other),"Le Canvas joue l’humeur "+id);
                    r.seek(fin);drawActor(a.stage,other,9500);require(first.sameAs(other),"La recherche retrouve le sourire "+id);
                    a.stop();
                });
            }
        }finally{
            first.recycle();other.recycle();device.main(()->{if(previous[0]!=null){a.open(previous[0]);a.draft();}a.finish();});
        }
    }
}
