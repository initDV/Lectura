package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Picture;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.text.Layout;
import android.text.Spannable;
import android.text.SpannableStringBuilder;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.text.style.ReplacementSpan;
import android.text.style.TypefaceSpan;
import android.util.LruCache;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** Scene composition and clock-coupled sprite/terminal, shared with the capture renderer. */
final class Stage extends FrameLayout {
    final MainActivity a; final Ui ui; final Project project; final Sprite sprite;final Decor decor;
    final Svg artwork;
    final AichaStage aicha;
    final JSONObject term;
    private final int termBg,termBar,termBorder,termFg,termComment,termPrompt,termCommand;
    final String title;
    final boolean reduced;
    final int background;
    boolean masked, presenting, recording;
    final long initial=SystemClock.uptimeMillis();
    long clickAt;
    final Runnable singleClick=()->{clickAt=0;onSingle();};
    private final View menu,settings,eye;
    private final Face face;
    final Typeface termFont;
    private final Typeface terminalBold,terminalMedium;
    final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
    final Path clip=new Path();
    final ScreenText screenText;
    private final TextPaint titlePaint=new TextPaint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
    private float titleWindowWidth=-1;
    private CharSequence titleLabel;
    private final int radius;
    private Reading lastReading;
    private SceneLayout screen;
    private boolean closePortrait;
    boolean atlasMode;
    private AtlasProjection projection;
    private Reading atlasRequested;
    private Future<?> atlasTask;
    private final boolean atlasReduced;

    Stage(MainActivity a,JSONObject def){
        super(a);this.a=a;ui=a.ui;project=a.project;reduced=a.reduced();
        decor=new Decor(object(a.db.settings,"decor"));background=color(project.background);
        JSONObject ts=object(a.refs.themes,"terminal");JSONObject t=ts.optJSONObject(project.terminalTheme);term=t==null?object(ts,"sombre"):t;
        termBg=color(term,"bg");termBar=color(term,"bar");termBorder=color(term,"bord");termFg=color(term,"fg");
        termComment=color(term,"com");termPrompt=color(term,"prompt");termCommand=color(term,"cmd");
        termFont=project.font.equals("Système")?Typeface.MONOSPACE:ui.mono(400);
        terminalBold=Typeface.create(termFont,700,false);terminalMedium=Typeface.create(termFont,500,false);
        title=a.db.settings.optString("titreTerminal");radius=Math.round(ui.radiusLg);
        titlePaint.setTypeface(ui.mono(500));titlePaint.setColor(termComment);
        boolean reduce=reduced||a.db.settings.optBoolean("reduireAnimations");atlasReduced=reduce;
        double gain=project.motion.equals("calme")?.6:project.motion.equals("vif")?1.3:1;
        if(AichaTrack.matches(def)){
            sprite=null;artwork=a.svg(def.optString("svg"));
            aicha=new AichaStage(artwork,decor,gain,reduce,a.refs.visages,AichaGeometry.HipAnchor.read(def.optJSONArray("appuiHanche")));
        }else{
            aicha=null;sprite=new Sprite(a.refs,def,true);artwork=sprite.svg;sprite.reduced=reduce;sprite.gain=gain;
        }
        face=new Face();screenText=new ScreenText();addView(face,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));
        menu=ui.iconButton("menu",a.t("scene.menu"),ui.mutedText,20,a::menu);addView(menu,ui.fp(44,44,Gravity.TOP|Gravity.LEFT));
        settings=ui.iconButton("settings",a.t("android.cadrage.titre"),ui.bg,22,a::framing);settings.setBackground(ui.touch(ui.accent,99,0,0));settings.setElevation(ui.f(4));
        FrameLayout.LayoutParams fab=ui.fp(48,48,Gravity.LEFT|Gravity.BOTTOM);fab.leftMargin=fab.bottomMargin=ui.d(12);addView(settings,fab);
        eye=ui.iconButton("eye",a.t("scene.oeil.masquer"),ui.violet,20,()->mask(!masked));FrameLayout.LayoutParams ep=ui.fp(44,44,Gravity.RIGHT|Gravity.TOP);ep.topMargin=ui.d(5);ep.rightMargin=ui.d(7);addView(eye,ep);
        if(a.db.settings.optBoolean("modeAtlas"))setAtlas(true);
        else updateFraming();
    }
    void closePortrait(boolean yes){
        if(closePortrait==yes)return;
        closePortrait=yes;updateFraming();
    }
    void updateFraming(){
        screen=new SceneLayout(getWidth()/ui.density,getHeight()/ui.density,closePortrait,
            a.db.settings.optJSONObject(SceneLayout.PREFERENCE),artwork.box,aicha!=null,atlasMode);
        face.invalidate();
    }
    SceneLayout screenLayout(){return screen;}
    @Override protected void onLayout(boolean changed,int left,int top,int right,int bottom){
        super.onLayout(changed,left,top,right,bottom);
        updateFraming();
    }
    void mask(boolean yes){masked=yes;eye.setSelected(yes);eye.setContentDescription(a.t(yes?"scene.oeil.afficher":"scene.oeil.masquer"));
        ((android.widget.ImageView)eye).setImageDrawable(ui.iconDrawable(yes?"eye-off":"eye",20,ui.violet));face.invalidate();}
    void setAtlas(boolean yes){
        if(yes==atlasMode)return;
        atlasMode=yes;
        if(yes&&projection==null)projection=new AtlasProjection(a.refs);
        if(!yes){cancelAtlasPlan();projection.update(null,0,atlasReduced);}
        updateChrome();screenText.reset();updateFraming();
        face.setContentDescription(a.t(yes?"scene.texte.label":"scene.terminal"));
    }
    private void updateChrome(){
        menu.setVisibility(presenting?GONE:VISIBLE);settings.setVisibility(presenting||atlasMode?GONE:VISIBLE);
        eye.setVisibility(atlasMode?GONE:VISIBLE);
    }
    void present(boolean yes){presenting=yes;removeCallbacks(singleClick);clickAt=0;updateChrome();refresh();}
    private void onSingle(){if(presenting)a.launch(false);}
    @Override protected void onDetachedFromWindow(){super.onDetachedFromWindow();removeCallbacks(singleClick);cancelAtlasPlan();}
    private void cancelAtlasPlan(){
        if(atlasTask!=null)atlasTask.cancel(true);
        atlasTask=null;atlasRequested=null;
    }
    private void atlasPose(Reading r,double ms){
        if(!atlasMode)return;
        if(atlasRequested!=null&&atlasRequested!=r)cancelAtlasPlan();
        if(r!=null&&r.atlas==null&&atlasRequested==null){
            atlasRequested=r;
            // Enabled in the middle of a reading: keep the text visible while the worker compiles its plan.
            atlasTask=a.queue.submit(()->{
                AtlasPlan plan=a.prepareAtlas(r.timeline.parts);
                a.handler.post(()->{
                    if(a.stage!=this||a.reading!=r||!atlasMode)return;
                    if(r.atlas==null)r.atlas=plan;
                    refresh();
                });
            });
        }
        projection.update(r==null?null:r.atlas,ms,atlasReduced);
    }
    AtlasPlan.Card atlasCard(){return atlasMode?projection.card():null;}
    void updatePose(double now){
        Reading r=a.reading;
        if(r!=lastReading){lastReading=r;screenText.reset();}
        if(r!=null&&!a.preparing){
            double ms=r.time(),cursor=r.chars(ms);r.terminal.shown=(int)cursor;
            atlasPose(a.stopped||r.ended?null:r,ms);
            if(aicha!=null){
                boolean idle=a.stopped&&!r.ended;
                aicha.update(idle?null:r.aicha,ms,idle?0:r.aichaMouthLevel(ms,cursor),now,r.ended,a.forced);
                return;
            }
            Script.Segment seg=r.timeline.at(ms);
            long end=seg==null?0:seg.speechEnd<0?seg.to:seg.speechEnd;
            boolean voicing=r.playing&&seg!=null&&seg.type==Script.SPOKEN&&ms<end;
            sprite.choreography=a.stopped&&!r.ended?null:r.choreography;
            sprite.direct(a.stopped?null:r.performance,ms,a.forced);
            sprite.viseme=voicing?r.viseme(ms,ms,cursor):0;sprite.shape=voicing?r.shape():48;
            sprite.letter=voicing?Reading.letterAt(r.text,cursor):"";sprite.quietMouth=!voicing;
            sprite.talk=voicing?(sprite.viseme>0?1:.15)*RigPose.ease((ms-seg.from)/65)*RigPose.ease((end-ms)/85):0;
        }else{
            atlasPose(null,0);
            if(aicha!=null){aicha.update(null,0,0,now,false,a.forced);return;}
            sprite.choreography=null;sprite.direct(null,-1,a.forced);sprite.quietMouth=false;sprite.viseme=0;sprite.shape=48;sprite.letter="";sprite.talk=0;
        }
        sprite.tick(now);
    }
    private final class Face extends View {
        private final Runnable redraw=this::invalidate;
        private float startY,origin;private boolean dragged,terminalTouch;
        Face(){super(a);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);setContentDescription(a.t("scene.terminal"));}
        @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(info);
            AtlasPlan.Card card=atlasCard();
            if(card!=null){info.setClassName("android.widget.ImageView");info.setContentDescription(card.name+". "+card.description);return;}
            Reading r=a.reading;if(r!=null&&(atlasMode||!masked))info.setText(r.text.substring(Math.max(0,r.terminal.shown-700),r.terminal.shown));}
        @Override protected void onWindowVisibilityChanged(int visibility){
            super.onWindowVisibilityChanged(visibility);
            if(visibility==VISIBLE)invalidate();else removeCallbacks(redraw);
        }
        @Override protected void onDetachedFromWindow(){removeCallbacks(redraw);super.onDetachedFromWindow();}
        @Override protected void onDraw(Canvas c){
            removeCallbacks(redraw);
            long start=SystemClock.uptimeMillis(),now=start-initial;Stage.this.updatePose(now);
            c.save();c.scale(ui.density,ui.density);
            drawScreen(c,now);
            if(recording){round(c,50,10,111,36,99,0xcc0d0d12);paint.setColor(ui.danger);c.drawCircle(65,23,5,paint);
                style(ui.font(700),12.8f,0xffff8a8a);c.drawText("REC",76,baseline(paint,23),paint);}
            c.restore();
            if(getWindowVisibility()!=VISIBLE||!a.isForeground)return;
            a.recordFrame(now);
            Reading r=a.reading;boolean playing=r!=null&&r.playing;
            boolean animated=aicha!=null?!aicha.reduced:!sprite.reduced;
            boolean idle=animated&&!a.preparing&&(r==null||aicha!=null&&(a.stopped||r.ended));
            boolean settling=sprite!=null&&sprite.gliding(now);
            // Leave room for vsync rounding on 60–120 Hz screens. The pose
            // always comes from the playback clock, never from a frame counter.
            long delay=recording||playing?26:idle||settling?60:0;
            if(delay>0&&a.dimmedScene&&!recording)delay=Math.max(delay,125);
            if(delay==0&&r!=null&&(atlasMode?!atlasReduced&&atlasCard()==null:!masked&&!reduced))delay=500-now%500;
            if(delay>0)postOnAnimationDelayed(redraw,Math.max(0,start+delay-SystemClock.uptimeMillis()));
        }
        @Override public boolean performClick(){super.performClick();if(presenting){long now=SystemClock.uptimeMillis();boolean twice=clickAt>0&&now-clickAt<280;removeCallbacks(singleClick);
            if(twice){clickAt=0;a.presentation(false);}else{clickAt=now;postDelayed(singleClick,280);}}return true;}
        @Override public boolean onTouchEvent(MotionEvent e){
            switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN: startY=e.getY();origin=screenText.scroll;dragged=false;
                    terminalTouch=(atlasMode?atlasCard()==null:!masked)&&screenText.maxScroll>0&&screen.terminalBodyAt(e.getX()/ui.density,startY/ui.density);
                    if(terminalTouch)getParent().requestDisallowInterceptTouchEvent(true);return terminalTouch||presenting;
                case MotionEvent.ACTION_MOVE: if(Math.abs(e.getY()-startY)>ui.f(5))dragged=true;
                    if(terminalTouch){screenText.scroll=Refs.clamp(origin+(startY-e.getY())/ui.density,0,screenText.maxScroll);invalidate();}return true;
                case MotionEvent.ACTION_UP: if(!dragged&&presenting)performClick();return true;
                case MotionEvent.ACTION_CANCEL:return true;
                default:return super.onTouchEvent(e);
            }
        }
    }
    void refresh(){face.invalidate();}
    void drawScreen(Canvas c,double now){
        SceneLayout frame=screen;
        if(frame.width<=0||frame.height<=0)return;
        c.save();clip.rewind();clip.addRoundRect(0,0,frame.width,frame.height,radius,radius,Path.Direction.CW);
        c.clipPath(clip);
        if(frame.atlas){
            projection.background(c,frame.width,frame.height);
            drawAtlasWindow(c,frame,now);
        }else{
            c.drawColor(background);
            if(aicha!=null)aicha.paintBackdrop(c,frame.width,frame.height,frame.baseX,frame.baseY,frame.baseScale);
            else decor.screen(c,frame.backdropWidth,frame.height,frame.closePortrait);
            drawWindow(c,frame.termX,0,frame.termWidth,frame.termHeight,now);
        }
        // Compose the entire animated figure last, without a clip at the terminal's left edge.
        if(frame.actorScale>0)artwork.draw(c,frame.actorX,frame.actorY,frame.actorScale);
        c.restore();
    }
    private void drawAtlasWindow(Canvas c,SceneLayout frame,double now){
        float l=frame.termX,t=frame.bodyTop(),r=frame.bodyRight(),b=frame.bodyBottom();
        c.save();c.clipRect(l,t,r,b);
        rect(c,l,t,l+1,b,AtlasProjection.RULE);
        // Exactly one content rectangle: no texture or overlay remains on top of the text.
        if(!projection.draw(c,l+1,t,r-l-1,b-t)&&a.reading!=null){
            float pad=clamp((r-l)*.035f,10,22);
            screenText.draw(c,a.reading.terminal,l+pad,t,r-pad,b,clamp((r-l)*.075f,11,project.fontSize),now);
        }
        c.restore();
    }
    private void drawWindow(Canvas c,float x,float y,float w,float h,double now){
        float l=x+1,t=y+1,r=x+w-1,b=y+h-1,bodyTop=y+SceneLayout.TERMINAL_HEADER;
        boolean compact=w<180;
        float titleX=l+(compact?50:74);
        round(c,x,y,x+w,y+h,radius,termBorder);
        clip.rewind();clip.addRoundRect(l,t,r,b,radius-1,radius-1,Path.Direction.CW);c.save();c.clipPath(clip);
        rect(c,l,t,r,b,termBg);rect(c,l,t,r,bodyTop-1,termBar);rect(c,l,bodyTop-1,r,bodyTop,termBorder);
        dots(c,l+(compact?12:19.5f),t+26.5f,compact?12:18,compact?4:5.5f);
        if(w!=titleWindowWidth){
            titleWindowWidth=w;titlePaint.setTextSize(clamp((w-2)*.034f,10.56f,12.8f));
            titleLabel=TextUtils.ellipsize(title,titlePaint,Math.max(0,r-titleX-57),TextUtils.TruncateAt.END);
        }
        c.drawText(titleLabel,0,titleLabel.length(),titleX,baseline(titlePaint,t+26.5f),titlePaint);
        Reading aReading=a.reading;
        if(aReading!=null&&!masked)screenText.draw(c,aReading.terminal,l+14,bodyTop,r-14,b,clamp((w-2)*.052f,11,project.fontSize),now);
        c.restore();
    }
    void recordVideoFrame(Picture picture,int w,int h,double now){
        Canvas commands=picture.beginRecording(w,h);
        try{drawVideoFrame(commands,w,h,now);}finally{picture.endRecording();}
    }
    void drawVideoFrame(Canvas c,int w,int h,double now){
        // Fit the live scene, not the surrounding Android controls. One uniform scale
        // preserves the crop, terminal layout and proportions even in a different ratio.
        c.drawColor(atlasMode?AtlasProjection.BACKGROUND:background|0xff000000);
        SceneLayout frame=screen;
        if(frame.width<=0||frame.height<=0)return;
        float scale=Math.min(w/frame.width,h/frame.height);
        c.save();c.translate((w-frame.width*scale)/2,(h-frame.height*scale)/2);c.scale(scale,scale);
        drawScreen(c,now);c.restore();
    }
    void drawPng(Canvas c,int w,int h){
        if(atlasMode){drawVideoFrame(c,w,h,SystemClock.uptimeMillis()-initial);return;}
        // Still images keep their independent 38/62 composition.
        float s=Math.min(w,h)/720f,left=w*.38f;
        float[] box=artwork.box;
        float factor=Math.min(left*.92f/box[2],h*.94f/box[3]);
        float x=(left-box[2]*factor)/2,y=h-box[3]*factor;
        c.drawColor(background);
        if(aicha!=null){
            y/=2;
            c.save();c.clipRect(0,0,left,h);aicha.paintBackdrop(c,left,h,x,y,factor);c.restore();
        }else{
            x+=6*s;y-=10*s;
            decor.export(c,w,h);
        }
        Reading r=a.reading;
        if(r!=null)pngTerminal(c,r.terminal,left,0,w-left,h,s);
        artwork.draw(c,x,y,factor);
    }
    private void pngTerminal(Canvas c,Script.Terminal text,float bx,float by,float bw,float bh,float s){
        float pad=14*s,r=20*s,bar=38*s,x=bx+pad*.4f,y=by+pad,w=bw-pad*1.4f,h=bh-2*pad;
        round(c,x,y,x+w,y+h,r,termBg);clip.rewind();clip.addRoundRect(x,y,x+w,y+h,r,r,Path.Direction.CW);c.save();c.clipPath(clip);
        rect(c,x,y,x+w,y+bar,termBar);rect(c,x,y+bar,x+w,y+bar+Math.max(1,s),termBorder);dots(c,x+20*s,y+bar/2,20*s,6*s);
        style(terminalMedium,Math.round(Math.min(13*s,w*.036f)),termComment);
        String label=title.isEmpty()?"lectura":title;float width=paint.measureText(label);c.save();c.translate(x+82*s,y+bar/2);c.scale(Math.min(1,(w-100*s)/Math.max(1,width)),1);c.drawText(label,0,baseline(paint,0),paint);c.restore();
        float fpx=Math.round(Math.min(project.fontSize*s*1.15f,w*.052f)),ipad=16*s,lh=fpx*1.55f;
        style(termFont,fpx,termFg);float cw=paint.measureText("M");
        int cols=Math.max(8,(int)((w-2*ipad)/cw)),maxRows=Math.max(1,(int)((h-bar-2*ipad)/lh));
        final List<int[]> rows=new ArrayList<>();
        for(int i=masked?-1:text.lineAt(text.shown);i>=0&&rows.size()<maxRows;i--){
            Script.Line line=text.lines.get(i);int vis=Math.min(line.end,text.shown)-line.start;
            ArrayList<int[]> parts=new ArrayList<>();int a=0;
            while(line.text.length()-a>cols){int b=line.text.lastIndexOf(' ',a+cols);b=b<=a?a+cols:b+1;parts.add(new int[]{i,a,Math.min(b,vis)});a=b;if(a>=vis)break;}
            if(a==0||a<vis)parts.add(new int[]{i,a,vis});
            for(int j=parts.size()-1;j>=0&&rows.size()<maxRows;j--)rows.add(parts.get(j));
        }
        float yy=y+bar+ipad+lh/2,cx=x+ipad,cy=yy;
        for(int j=rows.size()-1;j>=0;j--){int[] part=rows.get(j);Script.Line line=text.lines.get(part[0]);int pos=part[1];
            for(Script.Token token:line.tokens){int a=Math.max(pos,token.start),b=Math.min(part[2],token.end);if(b<=a)continue;
                drawRun(c,line,pos,a,x+ipad+(pos-part[1])*cw,yy,fpx,null,text);drawRun(c,line,a,b,x+ipad+(a-part[1])*cw,yy,fpx,token.cat,text);pos=b;}
            drawRun(c,line,pos,part[2],x+ipad+(pos-part[1])*cw,yy,fpx,null,text);cx=x+ipad+(part[2]-part[1])*cw;cy=yy;yy+=lh;
        }
        if(!masked)rect(c,cx+1,cy-fpx*.55f,cx+1+cw*.6f,cy+fpx*.55f,termFg);
        c.restore();paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(Math.max(1,s));paint.setColor(termBorder);c.drawRoundRect(x,y,x+w,y+h,r,r,paint);paint.setStyle(Paint.Style.FILL);
    }
    private void drawRun(Canvas c,Script.Line line,int a,int b,float x,float y,float size,String cat,Script.Terminal terminal){
        if(b<=a)return;style(cat!=null&&!cat.startsWith("__")?terminalBold:termFont,size,ink(cat,terminal));c.drawText(line.text,a,b,x,baseline(paint,y),paint);
    }
    private int ink(String cat,Script.Terminal data){
        if(cat==null)return atlasMode?AtlasProjection.TEXT:termFg;
        switch(cat){
            case "__com":return termComment;case "__prompt":return termPrompt;case "__cmd":return termCommand;
            default:return cat.startsWith("__")?color(term,cat.substring(2)):data.keywords.colors.getOrDefault(cat,termFg);
        }
    }
    private void style(Typeface font,float size,int ink){paint.setTypeface(font);paint.setTextSize(size);paint.setColor(ink);paint.setStyle(Paint.Style.FILL);}
    private void rect(Canvas c,float l,float t,float r,float b,int ink){paint.setColor(ink);c.drawRect(l,t,r,b,paint);}
    private void round(Canvas c,float l,float t,float r,float b,float radius,int ink){paint.setColor(ink);c.drawRoundRect(l,t,r,b,radius,radius,paint);}
    private void dots(Canvas c,float x,float y,float spacing,float radius){int i=0;for(int color:new int[]{0xffff5f57,0xfffebc2e,0xff28c840}){paint.setColor(color);c.drawCircle(x+spacing*i++,y,radius,paint);}}
    private static float baseline(Paint p,float center){return center-(p.ascent()+p.descent())/2;}
    private final class ScreenText {
        final TextPaint p=new TextPaint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        final ArrayList<StaticLayout> rows=new ArrayList<>(40);int shown=-1,cacheWidth=-1;float cacheSize,scroll,maxScroll,total;
        // Only the active line changes as characters appear. Bound the completed
        // layouts so advancing through a long project doesn't retain every line.
        private final LruCache<Integer,StaticLayout> completed=new LruCache<>(48);
        boolean cursor;
        void reset(){shown=-1;completed.evictAll();rows.clear();scroll=maxScroll=total=0;}
        private StaticLayout layout(Script.Terminal data,Script.Line line,int count,int width,float size,boolean active){
            SpannableStringBuilder s=new SpannableStringBuilder(line.text,0,count);
            for(Script.Token tok:line.tokens){
                if(tok.start>=count)break;
                int b=Math.min(tok.end,count);if(b<=tok.start)continue;
                s.setSpan(new ForegroundColorSpan(ink(tok.cat,data)),tok.start,b,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
                if(tok.cat.equals("__prompt")||!tok.cat.startsWith("__"))s.setSpan(new TypefaceSpan(terminalBold),tok.start,b,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
            if(active){int end=s.length();s.append('\ufffc');s.setSpan(new ReplacementSpan(){
                @Override public int getSize(Paint p,CharSequence t,int a,int b,Paint.FontMetricsInt fm){return Math.round(size*.6f+1);}
                @Override public void draw(Canvas c,CharSequence t,int a,int b,float x,int top,int y,int bot,Paint paint){if(cursor)c.drawRect(x+1,y-size*.99f,x+1+size*.6f,y+size*.11f,paint);}
            },end,end+1,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);}
            return StaticLayout.Builder.obtain(s,0,s.length(),p,width).setIncludePad(false).setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
                .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE).setLineSpacing(size*1.55f-(p.descent()-p.ascent()),1).build();
        }
        void draw(Canvas c,Script.Terminal data,float x,float top,float right,float bottom,float size,double now){
            int width=(int)(right-x);if(width<=0)return;
            p.setTypeface(termFont);p.setTextSize(size);p.setColor(atlasMode?AtlasProjection.TEXT:termFg);float lh=size*1.55f;
            boolean geometryChanged=width!=cacheWidth||cacheSize!=size;
            boolean reflow=data.shown!=shown||geometryChanged;
            if(reflow){
                if(geometryChanged)completed.evictAll();shown=data.shown;cacheWidth=width;cacheSize=size;
                rows.clear();total=0;int last=data.lineAt(shown);
                for(int i=Math.max(0,last-39);i<=last;i++){
                    Script.Line line=data.lines.get(i);StaticLayout l;
                    if(i==last){int count=Math.max(0,Math.min(line.text.length(),shown-line.start));l=layout(data,line,count,width,size,true);}
                    else {l=completed.get(i);if(l==null){l=layout(data,line,line.text.length(),width,size,false);completed.put(i,l);}}
                    rows.add(l);total+=l.getLineCount()*lh;
                }
            }
            float limit=Math.max(0,total+24-(bottom-top));
            if(reflow||limit!=maxScroll){maxScroll=limit;scroll=limit;}
            cursor=(atlasMode?atlasReduced:reduced)||((long)(now/500))%2==0;float yy=top+12-scroll;
            c.save();c.clipRect(x-14,top,right+14,bottom);
            for(StaticLayout l:rows){float h=l.getLineCount()*lh;if(yy+h>top&&yy<bottom){c.save();c.translate(x,yy+(lh-(p.descent()-p.ascent()))*.5f);l.draw(c);c.restore();}yy+=h;}
            if(maxScroll>0){float h=bottom-top,thumb=h*h/(total+24),offset=(h-thumb)*(scroll/maxScroll);round(c,right+10,top+offset,right+13,top+offset+thumb,1.5f,0x66757580);}
            c.restore();
        }
    }
}
