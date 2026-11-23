package io.github.initdv.lectura;

import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.text.Collator;
import java.text.Normalizer;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.IntConsumer;
import static io.github.initdv.lectura.Refs.*;

/** All non-scene routes share the original shell, typography and source translation keys. */
final class Screens {
    private static final List<String> THEME_IDS=List.of("actuel","eminence-clair","eminence-sombre","pastel","papier","minimaliste","ocean","foret","retro","safran");
    private static final List<String> THEME_LABELS=List.of("1 · Actuel (violet)","2 · Eminence clair","3 · Eminence sombre","4 · Pastel","5 · Papier journal","6 · Minimaliste","7 · Océan","8 · Forêt","9 · Rétro","10 · Safran");
    final MainActivity a;final Ui u;final JSONObject settings;final Project p;
    final LinearLayout body;
    final ScrollView scroll;
    Screens(MainActivity a,String route){
        this.a=a;u=a.ui;settings=a.db.settings;p=a.project;
        LinearLayout root=u.col();a.content.addView(root,u.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));
        top(root,route);
        scroll=u.scroll();root.addView(scroll,new LinearLayout.LayoutParams(Ui.MATCH,0,1));body=u.col();u.pad(body,14,18,14,48);
        scroll.addView(u.centered(body,960),new ScrollView.LayoutParams(-1,-2));
        uiHeading("nav."+route);
        switch(route){case "projets":projects();break;case "personnages":characters();break;case "reglages":settings();break;case "apropos":about();break;default:break;}
        if(!route.equals("apropos"))addButton(body,t("nav.retour"),route.equals("reglages")?null:"back",!route.equals("projets"),()->a.go("scene"),14);
    }
    private String t(String key,Object... v){return a.t(key,v);}
    private void top(LinearLayout root,String active){
        LinearLayout bar=u.row();bar.setBackgroundColor(u.surface);u.pad(bar,14,8);root.addView(bar,u.lp(Ui.MATCH,60));
        LinearLayout brand=u.row();bar.addView(brand,u.lp(Ui.WRAP,44));u.click(brand,()->a.go("scene"));
        try(InputStream in=a.refs.open("favicon.svg")){brand.addView(u.art(new Svg(in),1),u.lp(24,24));}catch(IOException ignored){}
        u.gap(brand,8);brand.addView(u.text("Lectura",15,u.white,700));u.gap(bar,12);
        HorizontalScrollView nav=new HorizontalScrollView(a);nav.setHorizontalScrollBarEnabled(false);nav.setFillViewport(true);bar.addView(nav,new LinearLayout.LayoutParams(0,Ui.MATCH,1));
        LinearLayout items=u.row();items.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);nav.addView(items,new HorizontalScrollView.LayoutParams(-2,-1));
        String[] rs={"scene","projets","personnages","reglages","apropos"},ic={"back","folder","smile","settings","info"};
        boolean large=a.getResources().getDisplayMetrics().widthPixels/u.density>=640;
        for(int i=0;i<rs.length;i++){String id=rs[i];
            if(i>0)u.gap(items,2);String label=t(i==0?"nav.retour":"nav."+id);boolean current=id.equals(active);
            View b;
            if(large){TextView tb=u.button(label,ic[i],()->a.go(id));u.style(tb,13.6f,current?u.accentText:u.mutedText,400);u.pad(tb,10,0);b=tb;}
            else b=u.iconButton(ic[i],label,current?u.accentText:u.mutedText,20,()->a.go(id));
            b.setSelected(current);b.setBackground(u.touch(current?u.surface2:0,12,0,0));items.addView(b,u.lp(large?Ui.WRAP:44,44));
        }
        View divider=new View(a);divider.setBackgroundColor(u.border);root.addView(divider,u.lp(Ui.MATCH,1));
    }
    private void uiHeading(String key){TextView h=u.heading(t(key),1);u.add(body,h,0);u.gap(body,11);}
    private LinearLayout card(String title,float top){
        LinearLayout c=u.card();u.add(body,c,top);if(title!=null){u.add(c,u.heading(title,2),0);u.gap(c,8);} return c;
    }
    private void small(LinearLayout box,String line,int top){u.add(box,u.small(line),top);}
    private void para(LinearLayout box,String line,int top){u.add(box,u.p(line),top);}
    private void addButton(LinearLayout parent,String title,String icon,boolean primary,Runnable action,int top){LinearLayout.LayoutParams lp=u.lp(Ui.WRAP,Ui.WRAP);lp.topMargin=u.d(top);
        parent.addView(u.button(title,icon,primary,false,action),lp);}
    private void field(LinearLayout box,String label,View control,String hint){
        TextView l=u.text(label,15,u.text,550);u.line(l,22.5f);u.add(box,l,0);u.add(box,control,6);if(hint!=null)small(box,hint,6);u.gap(box,14);
        if(control.getContentDescription()==null)control.setContentDescription(label);
    }
    private void select(LinearLayout box,String label,List<String> names,int selected,boolean enabled,IntConsumer update){
        TextView b=selector(label,names,selected,enabled,update);field(box,label,b,null);}
    private TextView selector(String label,List<String> names,int selected,boolean enabled,IntConsumer update){
        TextView b=u.button(selected>=0&&selected<names.size()?names.get(selected):"",null,false,true,()->{});
        u.style(b,15,u.text,400);b.setGravity(Gravity.CENTER_VERTICAL);u.one(b);u.pad(b,12,0);
        b.setBackground(u.touch(u.bg,12,u.border,1));b.setCompoundDrawablesRelativeWithIntrinsicBounds(null,null,u.iconDrawable("chevron",14,u.mutedText),null);
        int[] chosen={selected};u.click(b,()->a.choose(label,names,chosen[0],i->{chosen[0]=i;b.setText(names.get(i));update.accept(i);}));
        u.enable(b,enabled&&!names.isEmpty(),.5f);return b;
    }
    private CheckBox check(LinearLayout box,String name,boolean checked,Consumer<Boolean> change){
        CheckBox c=new CheckBox(a);u.style(c,15,u.text,500);c.setButtonTintList(ColorStateList.valueOf(u.accent));c.setMinimumHeight(u.d(44));
        c.setText(name);c.setChecked(checked);c.setOnCheckedChangeListener((b,v)->change.accept(v));u.add(box,c,0);return c;
    }
    private void slider(LinearLayout box,String name,int min,int max,int value,boolean enabled,java.util.function.IntFunction<String> format,IntConsumer update,String hint){
        TextView text=u.text(name+" : "+format.apply(value),15,u.text,550);u.add(box,text,0);
        SeekBar b=u.range(max-min,value-min,u.accent,n->{text.setText(name+" : "+format.apply(n+min));update.accept(n+min);});b.setContentDescription(name);
        u.enable(b,enabled,.5f);box.addView(b,u.lp(Ui.MATCH,44));if(hint!=null)small(box,hint,0);u.gap(box,14);
    }
    private void colorField(LinearLayout parent,String name,String value,Consumer<String> change){
        View button=new View(a);Consumer<String> swatch=c->button.setBackground(u.touch(color(c),10,u.border,2));swatch.accept(value);String[] current={value};
        u.click(button,()->{
            LinearLayout r=a.sheet(name);EditText e=u.field(current[0],"#000000",false,7,s->{});u.add(r,e,0);int rgb=color(current[0]);
            int[] v={android.graphics.Color.red(rgb),android.graphics.Color.green(rgb),android.graphics.Color.blue(rgb)};
            String[] letters={"R","G","B"};for(int i=0;i<3;i++){int k=i;slider(r,letters[i],0,255,v[i],true,String::valueOf,n->{v[k]=n;e.setText(String.format(Locale.ROOT,"#%02x%02x%02x",v[0],v[1],v[2]));},null);}
            addButton(r,t("commun.oui"),null,true,()->{String s=e.getText().toString().trim();if(!s.matches("#[0-9a-fA-F]{6}")){e.setError("#RRGGBB");return;}
                current[0]=s;swatch.accept(s);change.accept(s);a.dismiss();},0);
        });button.setContentDescription(name);LinearLayout h=u.col();h.addView(button,u.lp(44,44));field(parent,name,h,null);
    }
    private void projects(){
        u.add(body,u.button(t("accueil.nouveau"),"plus",true,false,()->a.open(new Project(settings))),3);
        u.add(body,u.button(t("accueil.ouvrir"),"folder",()->a.pick("*/*",uri->{try{
            Project p=Project.fromJson(parse(a.fileText(uri,2_500_000)));a.open(p);if(p.fileAudio)a.note(t("accueil.audioARechoisir","nom",p.fileName.isEmpty()?"?":p.fileName),"warn",9000);
        }catch(Exception e){a.report("import",e);}})),10);
        u.add(body,u.button(t("accueil.exemple"),"play",a::example),10);
        new ProjectBrowser(card(t("accueil.bibliotheque"),14)).load();
    }
    private final class ProjectBrowser {
        private static final int PAGE=30;
        private final LinearLayout rows=u.col();
        private final Locale locale=Locale.forLanguageTag(a.db.locale());
        private final DateTimeFormatter date=DateTimeFormatter.ofPattern("dd MMM yyyy",locale).withZone(ZoneId.systemDefault());
        private final Collator collator=Collator.getInstance(locale);
        private List<Project> saved=List.of();
        private String query="";
        private int order,limit=PAGE;
        private boolean copying;
        ProjectBrowser(LinearLayout card){
            collator.setStrength(Collator.PRIMARY);
            String label=t("accueil.rechercher");
            field(card,label,u.field("",label,false,200,s->{query=fold(s.trim());limit=PAGE;draw();}),null);
            select(card,t("accueil.trier"),List.of(t("accueil.tri.recents"),t("accueil.tri.anciens"),t("accueil.tri.titre")),0,true,
                i->{order=i;limit=PAGE;draw();});
            u.add(card,rows,0);
        }
        private String fold(String s){return Normalizer.normalize(s,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT);}
        private String title(Project p){return p.title.isEmpty()?t("editeur.sansTitre"):p.title;}
        void load(){try{saved=a.db.projects();draw();}catch(Exception e){a.report("projets",e);}}
        private void draw(){
            List<Project> matches=new ArrayList<>();
            for(Project p:saved)if(query.isEmpty()||fold(title(p)).contains(query))matches.add(p);
            if(order==1)matches.sort((x,y)->x.modified.compareTo(y.modified));
            if(order==2)matches.sort((x,y)->collator.compare(title(x),title(y)));
            rows.removeAllViews();
            if(matches.isEmpty())small(rows,t(saved.isEmpty()?"accueil.aucunProjet":"accueil.aucunResultat"),0);
            for(Project p:matches.subList(0,Math.min(limit,matches.size())))row(p);
            if(matches.size()>limit)addButton(rows,t("accueil.plusProjets"),null,false,()->{limit+=PAGE;draw();},8);
        }
        private void row(Project p){
            String title=title(p);
            LinearLayout r=u.row();r.setBackground(u.shape(u.surface2,12,u.border,1));u.pad(r,12,6,6,6);u.add(rows,r,8);
            LinearLayout open=u.col();open.setMinimumHeight(u.d(44));open.setGravity(Gravity.CENTER_VERTICAL);u.grow(r,open);
            TextView label=u.p(title);u.one(label);u.add(open,label,0);String stamp;
            try{stamp=date.format(Instant.parse(p.modified));}catch(Exception ignored){stamp=p.modified;}
            small(open,stamp+" · "+p.text.length()+" "+t("commun.caracteres"),0);open.setContentDescription(title);u.click(open,()->a.open(p));u.gap(r,6);
            View copy=u.iconButton("copy",t("accueil.dupliquer","titre",title),u.text,20,()->duplicate(p,title));
            View del=u.iconButton("trash",t("accueil.supprimer","titre",title),u.text,20,()->a.confirm(t("accueil.confirmerSuppression","titre",title),()->{a.db.delete(p);load();}));
            for(View b:new View[]{copy,del}){b.setBackground(u.touch(0,12,u.border,1));u.enable(b,!copying,.5f);r.addView(b,u.lp(44,44));}
        }
        private void duplicate(Project p,String title){
            if(copying)return;
            String copyTitle=t("accueil.titreCopie","titre",title.substring(0,Math.min(180,title.length())));
            copying=true;draw();
            a.queue.submit(()->{
                try{
                    Project copy=a.db.duplicate(p,copyTitle);
                    a.handler.post(()->{
                        copying=false;if(a.isDestroyed())return;
                        if(a.screens==Screens.this)load();
                        else if(a.route.equals("projets")&&a.screens!=null&&a.modal==null)a.screens.refresh();
                        a.note(t("accueil.projetDuplique","titre",copy.title),"ok");
                    });
                }catch(Exception e){a.handler.post(()->{
                    copying=false;if(a.isDestroyed())return;
                    if(a.screens==Screens.this)draw();
                    if(e instanceof Library.ProjectAudioMissing)a.note(t("accueil.duplicationAudioManquant"),"warn");
                    else a.report("duplication-projet",e);
                });}
            });
        }
    }
    private void movements(LinearLayout c){List<String> ids=List.of("calme","normal","vif");select(c,t("reglages.mouvements"),List.of(t("reglages.mouvements.calme"),t("reglages.mouvements.normal"),t("reglages.mouvements.vif")),ids.indexOf(p.motion),true,i->p.motion=ids.get(i));}
    static List<String> expressions(Refs refs){List<String> out=new ArrayList<>();out.add("auto");
        refs.expressions.keys().forEachRemaining(out::add);return out;}
    private void characters(){
        LinearLayout c=card(t("editeur.personnage"),0);small(c,t("persos.aide"),0);
        Map<String,View> cards=new LinkedHashMap<>();
        int width=(int)Math.min(960,a.getResources().getDisplayMetrics().widthPixels/u.density)-62,cols=Math.max(1,(width+10)/102);
        LinearLayout row=null;int n=0;for(JSONObject d:a.refs.characters){
            if(n%cols==0){row=u.row();row.setGravity(Gravity.TOP);u.add(c,row,10);}else u.gap(row,10);
            String id=d.optString("id"),name=d.optString("nom");
            FrameLayout box=new FrameLayout(a);box.setMinimumHeight(u.d(120));LinearLayout v=u.col();u.pad(v,4,8);v.setGravity(Gravity.CENTER_HORIZONTAL);
            box.addView(v,u.fp(Ui.MATCH,Ui.WRAP,Gravity.TOP));
            try{v.addView(u.art(a.svg(d.optString("svg")),1),u.lp(52,104));}catch(Exception e){a.log("personnages",e);}
            TextView label=u.text(name,12.8f,u.text,400);label.setGravity(Gravity.CENTER);u.add(v,label,4);
            box.setContentDescription(name);cards.put(id,box);markCharacter(box,id.equals(p.character));
            u.click(box,()->{p.character=id;a.db.set("personnageId",id);cards.forEach((k,w)->markCharacter(w,k.equals(id)));});
            row.addView(box,new LinearLayout.LayoutParams(0,Ui.WRAP,1));n++;
        }
        if(row!=null&&n%cols!=0)for(int i=n%cols;i<cols;i++){u.gap(row,10);row.addView(new View(a),new LinearLayout.LayoutParams(0,1,1));}
        LinearLayout ec=card(t("persos.emotions"),14),list=u.col();
        check(ec,t("persos.emotions.auto"),p.emotions,b->{p.emotions=b;if(list.getVisibility()==View.VISIBLE)segments(list);});
        small(ec,t("persos.emotions.aide"),0);u.gap(ec,12);movements(ec);
        if(p.text.trim().isEmpty()){small(ec,t("persos.sansTexte"),0);return;}
        List<Script.Segment> parts=p.recalc();TextView expand=u.text(t("editeur.expressions")+" ("+parts.size()+")",15,u.text,600);expand.setMinimumHeight(u.d(44));u.setIcon(expand,"chevron",14,u.text,6);
        list.setVisibility(View.GONE);u.click(expand,()->{boolean visible=list.getVisibility()!=View.VISIBLE;list.setVisibility(visible?View.VISIBLE:View.GONE);if(visible)segments(list);});
        u.add(ec,expand,0);u.add(ec,list,0);
    }
    private void markCharacter(View box,boolean selected){box.setSelected(selected);box.setBackground(u.touch(selected?u.surface2:u.bg,12,selected?u.accent:u.border,1));}
    private void segments(LinearLayout box){
        box.removeAllViews();small(box,t("editeur.expressions.aide"),0);List<Script.Segment> parts=p.recalc();
        Script.Keywords words=new Script.Keywords(a.refs,a.db.locale(),object(settings,"motsPerso"));Mood m=new Mood(a.refs,a.db.locale(),words,p.emotions);
        List<String> ids=expressions(a.refs);ScrollView s=u.scroll();LinearLayout inner=u.col();s.addView(inner,new ScrollView.LayoutParams(-1,-2));box.addView(s,u.lp(Ui.MATCH,Math.min(320,parts.size()*82+30)));
        for(int i=0;i<Math.min(200,parts.size());i++){
            int index=i;Script.Segment seg=parts.get(i);String set=seg.expression;seg.expression="auto";Mood.Analysis auto=m.summary(seg);seg.expression=set;
            List<String> names=new ArrayList<>();names.add(t("expr.auto")+" → "+t("expr."+auto.expr)+(auto.second.isEmpty()?"":" + "+t("expr."+auto.second)));
            for(String id:ids.subList(1,ids.size()))names.add(t("expr."+id));
            LinearLayout row=u.col();u.pad(row,8,6);row.setBackground(u.shape(u.bg,10,u.border,1));u.add(inner,row,6);
            TextView text=u.text(seg.text,14.4f,u.text,400);u.one(text);u.add(row,text,0);
            String label=t("editeur.expressionDe","n",i+1);
            TextView b=selector(label,names,Math.max(0,ids.indexOf(set)),true,k->{});b.setContentDescription(label);
            u.click(b,()->{LinearLayout sheet=a.sheet(label);for(int k=0;k<names.size();k++){
                String id=ids.get(k),name=names.get(k);View v=u.choice(name,null,id.equals(seg.expression),()->{
                    seg.expression=id;put(p.segments.optJSONObject(index),"expression",id);b.setText(name);a.dismiss();});
                u.add(sheet,v,4);
            }});u.add(row,b,8);
        }
        if(parts.size()>200)small(inner,t("editeur.expressions.tronque","n",parts.size()-200),6);
    }
    private int setting(String key,int def){return settings.optInt(key,def);}
    void refresh(){int y=scroll.getScrollY();a.render(a.route);if(a.screens!=null)a.screens.scroll.post(()->a.screens.scroll.scrollTo(0,y));}
    private void settings(){
        small(body,t("reglages.projetOuvert","titre",p.title.isEmpty()?t("editeur.sansTitre"):p.title),0);
        LinearLayout c=card(t("reglages.langue"),14);
        select(c,t("reglages.langue.choix"),List.of("Français","English"),a.db.locale().equals("en")?1:0,true,i->{a.db.set("langue",i==0?"fr":"en");refresh();});
        c=card(t("reglages.voix"),14);voicePanel(c);
        c=card(t("voix.hd.titre"),14);small(c,t("voix.hd.aide"),0);a.hdPanel(c);
        c=card(t("reglages.terminal"),14);
        field(c,t("reglages.titreTerminal"),u.field(settings.optString("titreTerminal"),"",false,60,s->a.db.set("titreTerminal",s)),null);
        LinearLayout appearance=u.card();u.add(c,appearance,0);u.add(appearance,u.heading(t("reglages.themeApp"),2),0);small(appearance,t("reglages.themeApp.aide"),8);
        u.add(appearance,selector(t("reglages.themeApp"),THEME_LABELS,THEME_IDS.indexOf(settings.optString("themeApp")),true,i->{a.db.set("themeApp",THEME_IDS.get(i));refresh();}),10);
        u.gap(c,10);
        List<String> ids=List.of("sombre","matrix","ambre","ocean"),names=List.of("Sombre","Matrix","Ambre","Océan");
        List<String> fonts=List.of("JetBrains Mono","Système"),fontLabels=List.of("JetBrains Mono",t("android.terminal.fontSystem"));
        select(c,t("reglages.theme"),names,ids.indexOf(p.terminalTheme),true,i->{p.terminalTheme=ids.get(i);a.db.set("themeTerminal",p.terminalTheme);});
        select(c,t("reglages.police"),fontLabels,fonts.indexOf(p.font),true,i->{p.font=fonts.get(i);a.db.set("policeTerminal",p.font);});
        slider(c,t("reglages.taille"),12,40,setting("tailleTexte",18),true,n->n+" px",n->{p.fontSize=n;a.db.set("tailleTexte",n);},null);
        slider(c,t("reglages.vitesse"),5,120,p.cps,true,n->n+" "+t("reglages.cps"),n->{p.cps=n;a.db.set("vitesseDefilement",n);},t("reglages.vitesse.aide"));
        colorField(c,t("reglages.fond"),p.background,s->p.background=s);movements(c);
        c=card(t("reglages.animations"),14);check(c,t("reglages.reduire"),settings.optBoolean("reduireAnimations"),b->a.db.set("reduireAnimations",b));
        check(c,t("reglages.presentation"),settings.optBoolean("modePresentation"),b->a.db.set("modePresentation",b));
        c=card(t("reglages.decor"),14);JSONObject decor=object(settings,"decor"),defaults=object(a.refs.defaults,"decor");
        for(String key:new String[]{"mur","sol","horizon","neon"})colorField(c,t("reglages.decor."+key),decor.optString(key,defaults.optString(key)),s->a.db.set("decor",put(decor,key,s)));
        small(c,t("reglages.decor.aide"),0);addButton(c,t("reglages.decor.reset"),null,false,()->{a.db.set("decor",merge(new JSONObject(),defaults));refresh();},12);
        c=card(t("reglages.mots"),14);custom(c);
        c=card(t("reglages.stockage"),14);storage(c);
        c=card(t("reglages.version"),14);para(c,"Lectura "+version()+" ("+build()+")",0);addButton(c,t("nav.apropos"),null,false,()->a.go("apropos"),12);
    }
    private void voicePanel(LinearLayout c){
        String id=a.hdId();boolean hd=Hd.hdEngine(p.engine)||!id.isEmpty();
        TextView voice=u.button(a.voiceName(),"chevron",a::chooseVoice);voice.setContentDescription(t("scene.voix.choisir"));u.add(c,voice,5);
        if(p.engine.equals("auto"))small(c,t("android.voice.autoHelp"),5);
        slider(c,t("voix.vitesse"),10,40,Math.round(p.speed*20),true,n->number(n/20.),n->{p.speed=n/20f;a.db.set("vitesseVoix",p.speed);},null);
        if(hd)small(c,t("voix.hauteurIndispo"),0);
        slider(c,t("voix.hauteur"),0,40,Math.round(p.pitch*20),!hd,n->number(n/20.),n->{p.pitch=n/20f;a.db.set("hauteurVoix",p.pitch);},null);
        slider(c,t("voix.volume"),0,20,Math.round(a.volume()*20),true,n->(n*5)+" %",n->a.db.set("volume",n/20f),null);
        TextView b=u.button(t("voix.ecouter"),"volume",()->{
            if(hd){if(a.hd.installed(a.hd.voice(id)))a.hdExample(id,t("voix.exemple"),p.speed);else a.note(t("voix.hd.err.manquant"),"warn");return;}
            android.speech.tts.Voice v=a.talk.choose(a.db.locale(),p.voice);
            if(v!=null)a.talk.speak(t("voix.exemple"),v,p.speed,p.pitch,a.volume(),new Talk.Listener(){@Override public void error(String code){a.note(t("voix.err.lecture","code",code),"error");}});
            else a.note(t("voix.err.aucune"),"warn");
        });c.addView(b,u.lp(Ui.WRAP,Ui.WRAP));
    }
    private String number(double v){NumberFormat f=NumberFormat.getNumberInstance(Locale.ROOT);f.setMaximumFractionDigits(2);return f.format(v);}
    private void custom(LinearLayout c){
        small(c,t("reglages.mots.aide"),0);JSONObject cats=object(settings,"motsPerso");
        for(Iterator<String> it=cats.keys();it.hasNext();){String name=it.next();JSONObject def=object(cats,name);LinearLayout row=u.row();u.add(c,row,10);u.grow(row,u.text(name,15,u.text,700));
            View remove=u.iconButton("trash",t("reglages.mots.supprimer","nom",name),u.text,20,()->{cats.remove(name);a.db.set("motsPerso",cats);refresh();});row.addView(remove,u.lp(44,44));
            colorField(c,t("reglages.mots.couleur","nom",name),def.optString("couleur","#ff7fb0"),s->{a.db.set("motsPerso",put(cats,name,put(def,"couleur",s)));});
            JSONArray list=array(def,"mots");List<String> all=new ArrayList<>();for(int i=0;i<list.length();i++)all.add(list.optString(i));
            EditText e=u.field(String.join(", ",all),"",true,0,s->{JSONArray words=new JSONArray();for(String w:s.split("[,\\n]")){if(!w.trim().isEmpty())words.put(w.trim());if(words.length()==500)break;}
                a.db.set("motsPerso",put(cats,name,put(def,"mots",words)));});e.setMinHeight(u.d(60));e.setContentDescription(t("reglages.mots.liste","nom",name));u.add(c,e,0);
        }
        LinearLayout row=u.row();u.add(c,row,10);EditText name=u.field("",t("reglages.mots.nom"),false,24,s->{});u.grow(row,name);u.gap(row,10);
        TextView add=u.button(t("reglages.mots.ajouter"),"plus",()->{String id=Project.ascii(name.getText().toString());if(id.isEmpty()){a.note(t("reglages.mots.nomInvalide"),"warn");return;}
            if(cats.has(id)){a.note(t("reglages.mots.existe"),"warn");return;}JSONObject def=new JSONObject();put(def,"couleur","#ff7fb0");put(def,"mots",new JSONArray());a.db.set("motsPerso",put(cats,id,def));refresh();});
        row.addView(add);
    }
    private static long fileSize(java.io.File f){if(f.isFile())return f.length();long n=0;java.io.File[] list=f.listFiles();if(list!=null)for(java.io.File d:list)n+=fileSize(d);return n;}
    private void storage(LinearLayout c){
        long usage=fileSize(a.getFilesDir())+fileSize(a.getCacheDir());long quota=usage+a.getFilesDir().getUsableSpace();
        int pct=(int)Math.round(100.*usage/Math.max(1,quota));ProgressBar b=new ProgressBar(a,null,android.R.attr.progressBarStyleHorizontal);b.setProgressTintList(ColorStateList.valueOf(u.accent));b.setProgress(pct);c.addView(b,u.lp(Ui.MATCH,10));
        para(c,t("reglages.stockage.utilise")+" : "+Refs.size(usage)+" / "+Refs.size(quota)+" ("+pct+" %)",8);
        para(c,t("reglages.stockage.persistant")+" : "+t("commun.oui"),6);
        addButton(c,t("reglages.stockage.proteger"),null,false,()->a.note(t("reglages.stockage.protegeOk"),"info"),10);
        addButton(c,t("reglages.stockage.liberer"),null,false,()->a.confirm(t("reglages.stockage.confirmer"),()->a.clearHd()),10);
    }
    private String version(){return a.refs.json("version.json").optString("version");}
    private String build(){return a.refs.json("version.json").optString("native","android");}
    private void about(){
        LinearLayout c=card("Lectura "+version(),0);para(c,t("apropos.description"),0);small(c,t("reglages.version")+" : "+version()+" ("+build()+")",12);
        addButton(c,t("apropos.revoirTuto"),null,false,()->{a.db.set("tutorielVu",false);a.tutorial(1);},12);
        c=card(t("apropos.confidentialite"),14);para(c,t("apropos.confidentialite.texte"),0);
        c=card(t("apropos.raccourcis"),14);String[] names={t("touche.espace"),"← →","P","S","R","M","F","E"},keys={"scene.lecture","aide.pm5","scene.presentation","scene.capture","scene.enregistrer","scene.muet","scene.pleinEcran","aide.expression"};
        for(int i=0;i<names.length;i++){LinearLayout r=u.row();u.add(c,r,6);TextView k=u.text(names[i],13.6f,u.mutedText,400);k.setBackground(u.shape(u.surface2,6,0,0));u.pad(k,6,2);r.addView(k);u.gap(r,14);u.grow(r,u.p(t(keys[i])));}
        c=card(t("apropos.licences"),14);para(c,t("apropos.licences.texte"),0);for(String k:List.of("code","polices","voix"))para(c,"• "+t("apropos.lic."+k),4);
        if(Hd.supported())para(c,"• ONNX Runtime Android (Microsoft) · MIT",4);
        para(c,"• LAME / lamejs · LGPL",4);
        addButton(c,a.db.locale().equals("en")?"Android component notices":"Licences des composants Android",null,false,()->{
            LinearLayout sheet=a.sheet(t("apropos.licences"));small(sheet,a.refs.text("COMPOSANTS-ANDROID.md"),0);
        },8);
        c=card(t("apropos.journal"),14);small(c,t("apropos.journal.aide"),0);
        TextView journal=u.text(journal(),12.8f,u.text,400);journal.setTextIsSelectable(true);u.pad(journal,10,10);journal.setBackground(u.shape(u.bg,10,u.border,1));
        ScrollView sc=u.scroll();sc.addView(journal);c.addView(sc,u.lp(Ui.MATCH,Math.min(260,34+Math.max(0,a.journal.size()-1)*24)));
        addButton(c,t("apropos.journal.copier"),"copy",false,()->a.copy(t("apropos.journal"),"Lectura "+version()+" ("+build()+")\nAndroid "+android.os.Build.VERSION.RELEASE+"\n"+journal()),10);
        addButton(c,t("apropos.journal.vider"),"trash",false,()->{a.journal.clear();journal.setText(journal());},10);
    }
    private String journal(){if(a.journal.isEmpty())return t("apropos.journal.vide");List<String> j=new ArrayList<>(a.journal);java.util.Collections.reverse(j);return String.join("\n",j);}
}
