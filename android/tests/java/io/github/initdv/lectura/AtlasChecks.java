package io.github.initdv.lectura;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Picture;
import android.provider.Settings;
import android.view.View;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import static io.github.initdv.lectura.DeviceChecks.require;

final class AtlasChecks {
    static String run(DeviceChecks d,Context ctx,Refs refs,JSONObject fixture)throws Exception{
        require(Settings.Global.getInt(ctx.getContentResolver(),Settings.Global.AIRPLANE_MODE_ON,0)==1,"Atlas testé en mode avion");
        AtlasPlan.Catalogue catalogue=refs.atlas();
        parity(catalogue,fixture);
        drawings(refs,catalogue,fixture.getJSONArray("recognition"));
        stage(d,ctx);
        return catalogue.cards.size()+" planches embarquées rendues hors ligne ; calage Web vérifié, menu, SRT/WAV, pause, sauts, cadre unique et parité PNG/vidéo";
    }
    static void parity(AtlasPlan.Catalogue catalogue,JSONObject fixture)throws Exception{
        JSONArray recognition=fixture.getJSONArray("recognition");
        require(catalogue.cards.size()==recognition.length()&&recognition.length()>=100,"Catalogue Atlas incomplet");
        Set<String> ids=new HashSet<>();
        for(int i=0;i<recognition.length();i++){
            JSONArray x=recognition.getJSONArray(i);String text=x.getString(0),id=x.getString(1);
            require(ids.add(id),"Doublon Atlas : "+id);
            AtlasPlan plan=compile(catalogue,text);
            require(plan.windows.size()==1&&plan.at(900).card.id.equals(id),"Reconnaissance de "+id+" : "+text);
            require(plan.at(-1)==null&&plan.at(7000)==null,"Bornes de "+id);
        }
        JSONArray cases=fixture.getJSONArray("cases");
        for(int i=0;i<cases.length();i++){
            JSONObject c=cases.getJSONObject(i);JSONArray raw=c.getJSONArray("segments"),expected=c.getJSONArray("windows");
            List<Script.Segment> segments=new ArrayList<>();
            for(int j=0;j<raw.length();j++){
                JSONObject seg=raw.getJSONObject(j);String text=seg.getString("texte");
                Script.Segment s=new Script.Segment(text,0,text.length(),Script.type(text));
                s.from=seg.getLong("debutMs");s.to=seg.getLong("finMs");s.speechEnd=seg.optLong("speechEndMs",-1);segments.add(s);
            }
            List<AtlasPlan.Window> actual=catalogue.compile(segments).windows;
            require(expected.length()==actual.size(),"Parité du calage : "+raw);
            for(int j=0;j<actual.size();j++){
                JSONObject want=expected.getJSONObject(j);AtlasPlan.Window got=actual.get(j);
                require(want.getString("id").equals(got.card.id)&&got.from==want.getDouble("debut")&&got.to==want.getDouble("fin"),"Fenêtre Atlas : "+raw);
                JSONObject network=want.optJSONObject("reseau");
                if(network!=null){
                    span(got.network.router,network.getJSONArray("routeur"));span(got.network.links,network.getJSONArray("liens"));
                    JSONArray signals=network.getJSONArray("signaux");require(signals.length()==got.network.signals.size(),"Échange réseau");
                    for(int k=0;k<signals.length();k++){JSONObject s=signals.getJSONObject(k);AtlasPlan.Span g=got.network.signals.get(k);
                        near(s.getDouble("debut"),g.from);near(s.getDouble("fin"),g.to);}
                }else{
                    JSONArray marks=want.optJSONArray("gestes");require(marks==null?got.marks.isEmpty():got.marks.size()==marks.length(),"Nombre de gestes dans "+raw);
                    for(int k=0;marks!=null&&k<marks.length();k++){
                        JSONArray m=marks.getJSONArray(k);AtlasPlan.Mark g=got.marks.get(k);
                        require(m.getInt(0)==g.step.index&&m.getBoolean(3)==g.overview,"Geste dans "+raw);
                        near(m.getDouble(1),g.from);near(m.getDouble(2),g.to);
                        if(g.overview)require(got.active((g.from+g.to)/2,true)==null,"Survol en mouvements réduits");
                    }
                }
            }
        }
    }
    private static void span(AtlasPlan.Span actual,JSONArray expected)throws Exception{near(expected.getDouble(0),actual.from);near(expected.getDouble(1),actual.to);}
    private static void near(double expected,double actual){require(Math.abs(expected-actual)<.00001,"Temps Atlas : "+actual+" au lieu de "+expected);}
    private static AtlasPlan compile(AtlasPlan.Catalogue catalogue,String text){
        Script.Segment s=new Script.Segment(text,0,text.length(),Script.SPOKEN);s.to=7000;
        return catalogue.compile(List.of(s));
    }
    private static void drawings(Refs refs,AtlasPlan.Catalogue catalogue,JSONArray list)throws Exception{
        AtlasProjection projection=new AtlasProjection(refs);Bitmap b=Bitmap.createBitmap(295,272,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);
        Set<Long> distinct=new HashSet<>();int[] pixels=new int[b.getWidth()*b.getHeight()];
        try{
            for(int i=0;i<list.length();i++){
                JSONArray row=list.getJSONArray(i);String id=row.getString(1);
                try(InputStream in=refs.open("atlas/"+id+".svg")){
                    Svg drawing=new Svg(in,true);require(drawing.box[2]==420&&drawing.box[3]==248,"Format de "+id);
                    b.eraseColor(AtlasProjection.BACKGROUND);long blank=checksum(b,pixels,0,b.getHeight());
                    drawing.fit(c,0,0,b.getWidth(),b.getHeight(),false);
                    require(checksum(b,pixels,0,b.getHeight())!=blank,"Dessin vide pour "+id);
                }
                AtlasPlan plan=compile(catalogue,row.getString(0));AtlasPlan.Window w=plan.windows.get(0);
                double start=w.marks.isEmpty()?150:(w.marks.get(0).from+w.marks.get(0).to)/2;
                long a=frame(projection,plan,b,c,pixels,start,false),z=frame(projection,plan,b,c,pixels,6500,false);
                require(a!=z&&a==frame(projection,plan,b,c,pixels,start,false),"Pose non déterministe ou statique : "+id);
                require(distinct.add(frame(projection,plan,b,c,pixels,2800,true)),"Dessin en double : "+id);
                projection.update(plan,7000,true);require(!projection.draw(c,0,0,b.getWidth(),b.getHeight()),"Cadre encore projeté : "+id);
            }
        }finally{b.recycle();}
    }
    private static long frame(AtlasProjection projection,AtlasPlan plan,Bitmap b,Canvas c,int[] pixels,double ms,boolean reduced){
        b.eraseColor(AtlasProjection.BACKGROUND);projection.update(plan,ms,reduced);
        require(projection.draw(c,0,0,b.getWidth(),b.getHeight()),"Projection absente à "+ms);
        return checksum(b,pixels,17,197); // Excludes the name below the artwork.
    }
    private static long checksum(Bitmap b,int[] pixels,int top,int rows){
        b.getPixels(pixels,0,b.getWidth(),0,top,b.getWidth(),rows);
        long hash=0xcbf29ce484222325L;for(int i=0;i<b.getWidth()*rows;i++)hash=(hash^pixels[i])*0x100000001b3L;
        return hash;
    }
    private static void stage(DeviceChecks d,Context ctx)throws Exception{
        MainActivity a=d.open(ctx);Stage[] original={null};File[] source={null};
        try{
            d.main(()->{
                a.dismiss();a.db.set("modeAtlas",false);
                Project p=new Project(a.db.settings);p.character="aicha";p.fileAudio=true;p.fileName="atlas.wav";p.duration=10800;p.speed=1;
                Script.importSubtitles("1\n00:00:01,000 --> 00:00:03,200\nDans un prisme optique, le rayon de lumière blanche arrive.\n\n"
                    +"2\n00:00:03,200 --> 00:00:05,600\nLes couleurs se séparent du rouge au violet.\n\n"
                    +"3\n00:00:06,200 --> 00:00:10,700\nLa lecture reprend et le texte continue dans le même cadre.\n",p);
                source[0]=a.db.audio(p);wave(source[0]);a.open(p);original[0]=a.stage;
            });
            d.click(a,a.t("scene.menu"));d.click(a,a.t("scene.atlas"));
            d.main(()->{require(a.stage==original[0]&&a.db.settings.optBoolean("modeAtlas"),"Atlas a changé de scène");a.launch(false);});
            d.waitFor("Lecture locale Atlas non préparée",()->a.reading!=null&&a.reading.playing&&a.reading.atlas!=null,9000);
            SceneLayout[] bounds={null};
            d.main(()->{
                Reading r=a.reading;r.pause();a.playState();r.seek(2300);a.stage.updatePose(100);
                bounds[0]=a.stage.screenLayout();require(bounds[0].width>0&&bounds[0].atlas,"Cadre Atlas absent");
                require(bounds[0].termWidth/bounds[0].width>.65&&a.stage.atlasCard()!=null&&a.stage.atlasCard().id.equals("physique-prisme-optique"),"Prisme dans le cadre de droite");
                require(a.stage.atlasCard().name.contains("Prisme"),"Texte de description Atlas");
                compareOutputs(a.stage);
            });
            d.click(a,a.t("android.atlas.avance"));
            d.waitFor("Le texte doit reprendre après le saut",()->a.stage.atlasCard()==null&&a.reading.terminal.shown>a.project.text.indexOf("La lecture reprend"),3000);
            d.main(()->{
                SceneLayout frame=a.stage.screenLayout();near(bounds[0].termX,frame.termX);near(bounds[0].bodyTop(),frame.bodyTop());
                near(bounds[0].bodyRight(),frame.bodyRight());near(bounds[0].bodyBottom(),frame.bodyBottom());
                View text=DeviceChecks.named(a.stage,a.t("scene.texte.label"));
                require(text!=null&&text.createAccessibilityNodeInfo().getText().toString().contains("La lecture"),"Texte accessible à la position courante");
            });
            d.click(a,a.t("android.atlas.recul"));
            d.waitFor("Le saut arrière ne retrouve pas la planche",()->a.stage.atlasCard()!=null,3000);
            d.click(a,a.t("scene.menu"));d.click(a,a.t("scene.atlas"));
            d.main(()->require(a.stage==original[0]&&!a.stage.atlasMode&&!a.reading.playing&&a.reading.time()<3000,"La bascule ne doit pas relancer la lecture"));
        }finally{d.main(()->{a.db.set("modeAtlas",false);a.finish();if(source[0]!=null)source[0].delete();});}
    }
    private static void compareOutputs(Stage stage){
        int w=420,h=748;Bitmap png=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888),video=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);
        try{
            stage.drawPng(new Canvas(png),w,h);Picture frames=new Picture();stage.recordVideoFrame(frames,w,h,8000);new Canvas(video).drawPicture(frames);
            int visible=0,different=0;
            for(int y=0;y<h;y+=2)for(int x=w/3;x<w;x+=2){
                int a=png.getPixel(x,y),b=video.getPixel(x,y);
                if((a>>8&255)>128)visible++;
                if(Math.abs((a&255)-(b&255))>8||Math.abs((a>>8&255)-(b>>8&255))>8||Math.abs((a>>16&255)-(b>>16&255))>8)different++;
            }
            require(visible>90&&different<150,"Prisme absent ou différent dans le PNG et le cadre vidéo : "+visible+"/"+different);
        }finally{png.recycle();video.recycle();}
    }
    private static void wave(File f)throws Exception{
        int rate=16000,length=172800;
        ByteBuffer samples=ByteBuffer.allocate(length*2).order(ByteOrder.LITTLE_ENDIAN);
        for(int i=0;i<length;i++)samples.putShort((short)(1400*Math.sin(i*2*Math.PI*200/rate)));
        try(RandomAccessFile out=new RandomAccessFile(f,"rw")){Pcm.header(out,1,rate,length*2L);out.write(samples.array());}
    }
}
