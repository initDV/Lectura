package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
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
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** Scene composition and clock-coupled sprite/terminal, shared with the capture renderer. */
final class Stage extends FrameLayout {
    final MainActivity a; final Ui ui; final Project project; final Sprite sprite;final Decor decor;
    final JSONObject term;
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
    final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
    final Path clip=new Path();
    final ScreenText screenText;
    private final int radius;
    private Script.Segment current,punctuation;
    private int rank,prev=-1;
    private String expressionKey="";
    private Reading lastReading;

    Stage(MainActivity a,JSONObject def){
        super(a);this.a=a;ui=a.ui;project=a.project;reduced=a.reduced();
        decor=new Decor(object(a.db.settings,"decor"));background=color(project.background);
        JSONObject ts=object(a.refs.themes,"terminal");JSONObject t=ts.optJSONObject(project.terminalTheme);term=t==null?object(ts,"sombre"):t;
        termFont=project.font.equals("Système")?Typeface.MONOSPACE:ui.mono(400);
        title=a.db.settings.optString("titreTerminal");radius=Math.round(ui.radiusLg);
        sprite=new Sprite(a.refs,def);sprite.reduced=reduced||a.db.settings.optBoolean("reduireAnimations");
        sprite.gain=project.motion.equals("calme")?.6:project.motion.equals("vif")?1.3:1;
        face=new Face();screenText=new ScreenText();addView(face,ui.fp(Ui.MATCH,Ui.MATCH,Gravity.TOP));
        menu=ui.iconButton("menu",a.t("scene.menu"),ui.mutedText,20,a::menu);addView(menu,ui.fp(44,44,Gravity.TOP|Gravity.LEFT));
        settings=ui.iconButton("settings",a.t("reglages.themeApp"),ui.bg,22,()->a.go("reglages"));settings.setBackground(ui.touch(ui.accent,99,0,0));settings.setElevation(ui.f(4));
        FrameLayout.LayoutParams fab=ui.fp(48,48,Gravity.RIGHT|Gravity.BOTTOM);fab.rightMargin=fab.bottomMargin=ui.d(12);addView(settings,fab);
        eye=ui.iconButton("eye",a.t("scene.oeil.masquer"),ui.violet,20,()->mask(!masked));FrameLayout.LayoutParams ep=ui.fp(44,44,Gravity.RIGHT|Gravity.TOP);ep.topMargin=ui.d(5);ep.rightMargin=ui.d(7);addView(eye,ep);
    }
    void mask(boolean yes){masked=yes;eye.setSelected(yes);eye.setContentDescription(a.t(yes?"scene.oeil.afficher":"scene.oeil.masquer"));
        ((android.widget.ImageView)eye).setImageDrawable(ui.iconDrawable(yes?"eye-off":"eye",20,ui.violet));face.invalidate();}
    void present(boolean yes){presenting=yes;removeCallbacks(singleClick);clickAt=0;menu.setVisibility(yes?GONE:VISIBLE);settings.setVisibility(yes?GONE:VISIBLE);}
    private void onSingle(){if(presenting)a.launch(false);}
    @Override protected void onDetachedFromWindow(){super.onDetachedFromWindow();removeCallbacks(singleClick);}
    private void animate(double now){
        Reading r=a.reading;
        if(r!=lastReading){current=punctuation=null;rank=0;prev=-1;lastReading=r;expressionKey="";screenText.reset();}
        if(r!=null&&!a.preparing){
            double ms=r.time(),cursor=r.chars(ms);int chars=(int)cursor;
            r.terminal.shown=chars;Script.Segment seg=r.timeline.segment(chars);
            boolean speak=r.playing&&seg!=null&&Script.type(seg.text)==Script.SPOKEN;
            if(speak){if(seg!=punctuation){punctuation=seg;prev=-1;}int pos=Math.min(seg.text.length()-1,chars-seg.start);
                for(int i=prev+1;i<=pos;i++)sprite.punct(seg.text.substring(i,i+1),now);prev=pos;}
            Mood.Pose p=a.stopped||seg==null?new Mood.Pose("neutre",1,"",0,0,""):
                a.forced.isEmpty()?a.mood.pose(seg,chars-seg.start):new Mood.Pose(a.forced,1,"",0,0,"");
            String key=p.expr+"|"+Math.round(p.strength*100)+"|"+p.mix;
            if(!expressionKey.equals(key)){sprite.expression(p.expr,p.strength,p.mix,p.weight);expressionKey=key;}
            if(seg!=current){current=seg;rank=0;if(speak&&!r.terminal.keywords.find(seg.text).isEmpty())sprite.gesture("",now);}
            if(r.playing&&rank!=p.rank){if(p.rank>rank&&!p.gesture.isEmpty())sprite.gesture(p.gesture,now);rank=p.rank;}
            sprite.viseme=speak?r.viseme(ms,now,cursor):0;sprite.shape=speak?r.shape():48;sprite.letter=Reading.letterAt(r.text,cursor);
            sprite.talk=speak?(sprite.viseme>0?1:.15):0;
        }else{sprite.viseme=0;sprite.letter="";sprite.talk=0;sprite.expression("neutre",1,"",0);}
        sprite.tick(now);
    }
    private final class Face extends View {
        private float startY,downX,origin;private boolean dragged,terminalTouch;
        Face(){super(a);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);setContentDescription(a.t("scene.terminal"));}
        @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(info);
            Reading r=a.reading;if(r!=null&&!masked)info.setText(r.text.substring(Math.max(0,r.terminal.shown-700),r.terminal.shown));}
        @Override protected void onDraw(Canvas c){
            double now=SystemClock.uptimeMillis()-initial;Stage.this.animate(now);
            float w=getWidth()/ui.density,h=getHeight()/ui.density,left=w*.38f;
            c.save();c.scale(ui.density,ui.density);round(c,0,0,w,h,radius,background);
            decor.screen(c,left,h);c.save();c.clipRect(0,0,left,h);sprite.svg.fit(c,2,0,left-4,h,true);c.restore();
            drawWindow(c,left,0,w-left,h,now);
            if(recording){round(c,50,10,111,36,99,0xcc0d0d12);paint.setColor(ui.danger);c.drawCircle(65,23,5,paint);
                style(ui.font(700),12.8f,0xffff8a8a);c.drawText("REC",76,baseline(paint,23),paint);}
            c.restore();
            if(getWindowVisibility()==VISIBLE&&a.isForeground){
                if(!reduced&&!presenting){float f=(float)((1-Math.cos(now*2*Math.PI/3500))*.5);settings.setScaleX(1+.05f*f);settings.setScaleY(1+.05f*f);}
                postInvalidateOnAnimation();
            }
            a.recordFrame(now);
        }
        @Override public boolean performClick(){super.performClick();if(presenting){long now=SystemClock.uptimeMillis();boolean twice=clickAt>0&&now-clickAt<280;removeCallbacks(singleClick);
            if(twice){clickAt=0;a.presentation(false);}else{clickAt=now;postDelayed(singleClick,280);}}return true;}
        @Override public boolean onTouchEvent(MotionEvent e){
            switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN: startY=e.getY();downX=e.getX();origin=screenText.scroll;dragged=false;
                    terminalTouch=downX>=getWidth()*.38f&&startY>ui.f(54)&&screenText.maxScroll>0;
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
    private void drawWindow(Canvas c,float x,float y,float w,float h,double now){
        float l=x+1,t=y+1,r=x+w-1,b=y+h-1;
        round(c,x,y,x+w,y+h,radius,color(term,"bord"));
        clip.rewind();clip.addRoundRect(l,t,r,b,radius-1,radius-1,Path.Direction.CW);c.save();c.clipPath(clip);
        rect(c,l,t,r,b,color(term,"bg"));rect(c,l,t,r,t+52,color(term,"bar"));rect(c,l,t+52,r,t+53,color(term,"bord"));
        dots(c,l+19.5f,t+26.5f,18,5.5f);
        TextPaint tp=new TextPaint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);tp.setTypeface(ui.mono(500));tp.setTextSize(clamp((w-2)*.034f,10.56f,12.8f));tp.setColor(color(term,"com"));
        float titleWidth=Math.max(0,(w-2)-74-57);CharSequence s=TextUtils.ellipsize(title,tp,titleWidth,TextUtils.TruncateAt.END);
        c.drawText(s,0,s.length(),l+74,baseline(tp,t+26.5f),tp);
        Reading aReading=a.reading;
        if(aReading!=null&&!masked)screenText.draw(c,aReading.terminal,l+14,t+53,r-14,b,Math.min(project.fontSize,(w-2)*.052f),now);
        c.restore();
    }
    void exportDraw(Canvas c,int w,int h,boolean frozen,double now){
        float s=Math.min(w,h)/720f,left=w*.38f;
        c.drawColor(background);decor.export(c,w,h);
        float factor=Math.min(left*.92f/sprite.svg.box[2],h*.94f/sprite.svg.box[3]);
        sprite.svg.draw(c,(left-sprite.svg.box[2]*factor)/2+6*s,h-sprite.svg.box[3]*factor-10*s,factor);
        Reading r=a.reading;
        if(r!=null)exportTerminal(c,r.terminal,left,0,w-left,h,s,frozen,now);
    }
    private void exportTerminal(Canvas c,Script.Terminal text,float bx,float by,float bw,float bh,float s,boolean frozen,double now){
        float pad=14*s,r=20*s,bar=38*s,x=bx+pad*.4f,y=by+pad,w=bw-pad*1.4f,h=bh-2*pad;
        round(c,x,y,x+w,y+h,r,color(term,"bg"));clip.rewind();clip.addRoundRect(x,y,x+w,y+h,r,r,Path.Direction.CW);c.save();c.clipPath(clip);
        rect(c,x,y,x+w,y+bar,color(term,"bar"));rect(c,x,y+bar,x+w,y+bar+Math.max(1,s),color(term,"bord"));dots(c,x+20*s,y+bar/2,20*s,6*s);
        style(Typeface.create(termFont,500,false),Math.round(Math.min(13*s,w*.036f)),color(term,"com"));
        String label=title.isEmpty()?"lectura":title;float width=paint.measureText(label);c.save();c.translate(x+82*s,y+bar/2);c.scale(Math.min(1,(w-100*s)/Math.max(1,width)),1);c.drawText(label,0,baseline(paint,0),paint);c.restore();
        float fpx=Math.round(Math.min(project.fontSize*s*1.15f,w*.052f)),ipad=16*s,lh=fpx*1.55f;
        style(termFont,fpx,color(term,"fg"));float cw=paint.measureText("M");
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
        if(!masked&&(frozen||((long)(now/500))%2==0))rect(c,cx+1,cy-fpx*.55f,cx+1+cw*.6f,cy+fpx*.55f,color(term,"fg"));
        c.restore();paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(Math.max(1,s));paint.setColor(color(term,"bord"));c.drawRoundRect(x,y,x+w,y+h,r,r,paint);paint.setStyle(Paint.Style.FILL);
    }
    private void drawRun(Canvas c,Script.Line line,int a,int b,float x,float y,float size,String cat,Script.Terminal terminal){
        if(b<=a)return;style(cat!=null&&!cat.startsWith("__")?Typeface.create(termFont,700,false):termFont,size,ink(cat,terminal));c.drawText(line.text,a,b,x,baseline(paint,y),paint);
    }
    private int ink(String cat,Script.Terminal data){
        if(cat==null)return color(term,"fg");if(cat.startsWith("__"))return color(term,cat.substring(2));return data.keywords.colors.getOrDefault(cat,color(term,"fg"));
    }
    private void style(Typeface font,float size,int ink){paint.setTypeface(font);paint.setTextSize(size);paint.setColor(ink);paint.setStyle(Paint.Style.FILL);}
    private void rect(Canvas c,float l,float t,float r,float b,int ink){paint.setColor(ink);c.drawRect(l,t,r,b,paint);}
    private void round(Canvas c,float l,float t,float r,float b,float radius,int ink){paint.setColor(ink);c.drawRoundRect(l,t,r,b,radius,radius,paint);}
    private void dots(Canvas c,float x,float y,float spacing,float radius){int i=0;for(int color:new int[]{0xffff5f57,0xfffebc2e,0xff28c840}){paint.setColor(color);c.drawCircle(x+spacing*i++,y,radius,paint);}}
    private static float baseline(Paint p,float center){return center-(p.ascent()+p.descent())/2;}
    private final class ScreenText {
        final TextPaint p=new TextPaint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        final ArrayList<StaticLayout> rows=new ArrayList<>();int shown=-1,cacheWidth=-1;float cacheSize,scroll,maxScroll,total;
        boolean cursor;
        void reset(){shown=-1;rows.clear();}
        void draw(Canvas c,Script.Terminal data,float x,float top,float right,float bottom,float size,double now){
            int width=(int)(right-x);if(width<=0)return;
            p.setTypeface(termFont);p.setTextSize(size);p.setColor(color(term,"fg"));float lh=size*1.55f;
            if(data.shown!=shown||width!=cacheWidth||cacheSize!=size){shown=data.shown;cacheWidth=width;cacheSize=size;
                rows.clear();total=0;int last=data.lineAt(shown);
                for(int i=Math.max(0,last-39);i<=last;i++){
                    Script.Line line=data.lines.get(i);int count=Math.max(0,Math.min(line.text.length(),shown-line.start));
                    SpannableStringBuilder s=new SpannableStringBuilder(line.text.substring(0,count));
                    for(Script.Token tok:line.tokens){int b=Math.min(tok.end,count);if(b<=tok.start)continue;
                        s.setSpan(new ForegroundColorSpan(ink(tok.cat,data)),tok.start,b,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
                        if(tok.cat.equals("__prompt")||!tok.cat.startsWith("__"))s.setSpan(new TypefaceSpan(Typeface.create(termFont,700,false)),tok.start,b,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
                    }
                    if(i==last){int end=s.length();s.append('\ufffc');s.setSpan(new ReplacementSpan(){
                        @Override public int getSize(Paint p,CharSequence t,int a,int b,Paint.FontMetricsInt fm){return Math.round(size*.6f+1);}
                        @Override public void draw(Canvas c,CharSequence t,int a,int b,float x,int top,int y,int bot,Paint paint){if(cursor)c.drawRect(x+1,y-size*.99f,x+1+size*.6f,y+size*.11f,paint);}
                    },end,end+1,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);}
                    StaticLayout l=StaticLayout.Builder.obtain(s,0,s.length(),p,width).setIncludePad(false).setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
                        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE).setLineSpacing(lh-(p.descent()-p.ascent()),1).build();
                    rows.add(l);total+=l.getLineCount()*lh;
                }
                maxScroll=Math.max(0,total+24-(bottom-top));scroll=maxScroll;
            }
            cursor=reduced||((long)(now/500))%2==0;float yy=top+12-scroll;
            c.save();c.clipRect(x-14,top,right+14,bottom);
            for(StaticLayout l:rows){float h=l.getLineCount()*lh;if(yy+h>top&&yy<bottom){c.save();c.translate(x,yy+(lh-(p.descent()-p.ascent()))*.5f);l.draw(c);c.restore();}yy+=h;}
            if(maxScroll>0){float h=bottom-top,thumb=h*h/(total+24),offset=(h-thumb)*(scroll/maxScroll);round(c,right+10,top+offset,right+13,top+offset+thumb,1.5f,0x66757580);}
            c.restore();
        }
    }
}
