package io.github.initdv.lectura;

import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.HashMap;
import java.util.function.Consumer;
import java.util.function.IntConsumer;
import org.json.JSONObject;
import static io.github.initdv.lectura.Refs.*;

/** Native view primitives with Lectura's CSS tokens; units are density-independent. */
final class Ui {
    static final int MATCH=ViewGroup.LayoutParams.MATCH_PARENT, WRAP=ViewGroup.LayoutParams.WRAP_CONTENT;
    final MainActivity a;
    final Refs refs;
    final float density;
    final HashMap<String,Path> paths=new HashMap<>();
    final HashMap<Integer,Typeface> weights=new HashMap<>();
    JSONObject tokens;
    int bg,surface,surface2,border,text,white,muted,mutedText,accent,accentText,violet,fill,danger,ok,warn,focus;
    float radius,radiusLg;
    String uiFamily;
    Ui(MainActivity a,Refs refs){this.a=a;this.refs=refs;density=a.getResources().getDisplayMetrics().density;}
    void theme(String id){
        JSONObject all=object(refs.themes,"app");tokens=merge(object(all,"actuel"),object(all,id));
        bg=c("bg");surface=c("surface");surface2=c("surface-2");border=c("border");text=c("text");white=c("text-strong");muted=c("muted");mutedText=c("muted-text");
        accent=c("accent");accentText=c("accent-text");violet=c("violet");fill=c("violet-fill");danger=c("danger");ok=c("ok");warn=c("warn");focus=c("focus");
        radius=num("radius");radiusLg=num("radius-lg");String font=tokens.optString("font-ui");uiFamily=font.startsWith("'JetBrains")?"jetbrains":font.startsWith("Georgia")?"serif":font.startsWith("ui-monospace")?"monospace":"sans-serif";
    }
    int c(String key){return color(tokens,key);}float num(String key){return Float.parseFloat(tokens.optString(key,"0").replace("px",""));}
    int d(float x){return Math.round(x*density);} float f(float x){return x*density;}
    private int dim(float x){return x==MATCH?MATCH:x==WRAP?WRAP:d(x);}
    LinearLayout.LayoutParams lp(float w,float h){return new LinearLayout.LayoutParams(dim(w),dim(h));}
    FrameLayout.LayoutParams fp(float w,float h,int gravity){return new FrameLayout.LayoutParams(dim(w),dim(h),gravity);}
    LinearLayout row(){LinearLayout v=new LinearLayout(a);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    LinearLayout col(){LinearLayout v=new LinearLayout(a);v.setOrientation(LinearLayout.VERTICAL);return v;}
    void pad(View v,float x,float y){pad(v,x,y,x,y);}void pad(View v,float l,float t,float r,float b){v.setPadding(d(l),d(t),d(r),d(b));}
    void gap(LinearLayout p,float size){View v=new View(a);p.addView(v,p.getOrientation()==LinearLayout.VERTICAL?lp(1,size):lp(size,1));}
    void add(LinearLayout p,View child,float top){LinearLayout.LayoutParams lp=lp(MATCH,WRAP);lp.topMargin=d(top);p.addView(child,lp);}
    void grow(LinearLayout p,View child){p.addView(child,new LinearLayout.LayoutParams(0,WRAP,1));}
    ScrollView scroll(){ScrollView s=new ScrollView(a);s.setVerticalScrollBarEnabled(false);s.setOverScrollMode(View.OVER_SCROLL_NEVER);return s;}
    GradientDrawable shape(int color,float r,int stroke,float width){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(f(r));if(width>0)g.setStroke(d(width),stroke);return g;}
    Drawable touch(int color,float r,int stroke,float width){return new RippleDrawable(ColorStateList.valueOf(Decor.alpha(accent,.15)),shape(color,r,stroke,width),shape(0xffffffff,r,0,0));}
    Typeface mono(int weight){return weights.computeIfAbsent(weight,w->Typeface.create(refs.mono,w,false));}
    Typeface font(int weight){return uiFamily.equals("jetbrains")?mono(weight):Typeface.create(Typeface.create(uiFamily,Typeface.NORMAL),weight,false);}
    void style(TextView t,float s,int ink,int w){
        t.setTextSize(TypedValue.COMPLEX_UNIT_PX,f(s));t.setTextColor(ink);t.setTypeface(font(w));t.setIncludeFontPadding(false);
        t.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE);t.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);
        t.setGravity(Gravity.CENTER_VERTICAL|Gravity.START);
    }
    TextView text(String s,float size,int color,int weight){TextView t=new TextView(a);style(t,size,color,weight);t.setText(s);return t;}
    TextView p(String s){TextView t=text(s,15,text,400);line(t,22.5f);return t;}
    TextView small(String s){TextView t=text(s,13.6f,mutedText,400);line(t,20.4f);return t;}
    void line(TextView v,float h){v.setLineHeight(d(h));}
    TextView heading(String name,int level){return text(name,level==1?21.6f:level==2?16.8f:16,white,700);}
    void one(TextView t){t.setMaxLines(1);t.setEllipsize(TextUtils.TruncateAt.END);}
    Path path(String id){return paths.computeIfAbsent(id,key->Svg.parsePath(refs.icons.optString(id,refs.icons.optString("info"))));}
    Drawable iconDrawable(String id,float size,int color){return new Drawable(){
        final Path path=path(id);final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
        @Override public void draw(Canvas c){Svg.icon(c,p,path,getBounds().left,getBounds().top,Math.min(getBounds().width(),getBounds().height()),color);}
        @Override public int getIntrinsicWidth(){return d(size);}@Override public int getIntrinsicHeight(){return d(size);}
        @Override public void setAlpha(int a){}@Override public void setColorFilter(android.graphics.ColorFilter cf){}@Override public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    };}
    View icon(String id,float size,int color){android.widget.ImageView v=new android.widget.ImageView(a);v.setImageDrawable(iconDrawable(id,size,color));v.setScaleType(android.widget.ImageView.ScaleType.CENTER);v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
    TextView button(String name,String icon,Runnable action){return button(name,icon,false,false,action);}
    TextView button(String name,String icon,boolean primary,boolean ghost,Runnable action){
        TextView b=new TextView(a){@Override public CharSequence getAccessibilityClassName(){return "android.widget.Button";}};
        style(b,15,primary?0xffffffff:text,primary?700:550);b.setText(name);b.setGravity(Gravity.CENTER);b.setMinHeight(d(44));
        b.setBackground(touch(primary?fill:ghost?0:surface2,12,primary?fill:border,1));pad(b,16,0);
        if(icon!=null)setIcon(b,icon,20,primary?0xffffffff:text,8);
        click(b,action);return b;
    }
    void setIcon(TextView v,String id,float size,int color,float gap){v.setCompoundDrawablesRelativeWithIntrinsicBounds(id==null?null:iconDrawable(id,size,color),null,null,null);v.setCompoundDrawablePadding(d(gap));}
    View iconButton(String id,String desc,int ink,float size,Runnable action){
        android.widget.ImageView v=new android.widget.ImageView(a){@Override public CharSequence getAccessibilityClassName(){return "android.widget.Button";}};
        v.setScaleType(android.widget.ImageView.ScaleType.CENTER);v.setImageDrawable(iconDrawable(id,size,ink));v.setContentDescription(desc);v.setBackground(touch(0,999,0,0));click(v,action);return v;
    }
    void click(View v,Runnable action){v.setFocusable(true);v.setOnClickListener(b->action.run());}
    void enable(View v,boolean b,float disabled){v.setEnabled(b);v.setAlpha(b?1:disabled);}
    EditText field(String value,String hint,boolean multi,int max,Consumer<String> update){
        EditText e=new EditText(a);e.setInputType(InputType.TYPE_CLASS_TEXT|(multi?InputType.TYPE_TEXT_FLAG_MULTI_LINE:InputType.TYPE_TEXT_FLAG_CAP_SENTENCES));
        e.setSingleLine(!multi);e.setHorizontallyScrolling(!multi);style(e,15,text,400);e.setHintTextColor(mutedText);
        e.setGravity(multi?Gravity.TOP|Gravity.START:Gravity.CENTER_VERTICAL|Gravity.START);
        e.setBackground(shape(bg,12,border,1));pad(e,12,10);e.setMinHeight(d(44));if(multi)e.setMinLines(2);
        if(max>0)e.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)});
        e.setText(value);e.setHint(hint);line(e,22.5f);
        e.addTextChangedListener(new TextWatcher(){@Override public void beforeTextChanged(CharSequence s,int start,int c,int after){}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count){update.accept(s.toString());}@Override public void afterTextChanged(Editable s){}});
        return e;
    }
    SeekBar range(int max,int progress,int color,IntConsumer change){
        SeekBar bar=new SeekBar(a);pad(bar,7,0);bar.setMax(max);bar.setProgress(progress);
        bar.setProgressTintList(ColorStateList.valueOf(color));bar.setThumbTintList(ColorStateList.valueOf(color));
        bar.setProgressBackgroundTintList(ColorStateList.valueOf(muted));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){@Override public void onProgressChanged(SeekBar b,int p,boolean user){if(user)change.accept(p);}
            @Override public void onStartTrackingTouch(SeekBar b){}@Override public void onStopTrackingTouch(SeekBar b){}});return bar;
    }
    FrameLayout centered(LinearLayout inner,int maxWidth){
        FrameLayout v=new FrameLayout(a){@Override protected void onMeasure(int w,int h){
            FrameLayout.LayoutParams p=(FrameLayout.LayoutParams)inner.getLayoutParams();p.width=Math.min(MeasureSpec.getSize(w),d(maxWidth));super.onMeasure(w,h);
        }};v.addView(inner,new FrameLayout.LayoutParams(MATCH,WRAP,Gravity.TOP|Gravity.CENTER_HORIZONTAL));return v;
    }
    LinearLayout card(){LinearLayout c=col();c.setBackground(shape(surface,radius,border,1));pad(c,16,16);return c;}
    void group(LinearLayout p,String section,boolean first){TextView h=text(section.toUpperCase(java.util.Locale.ROOT),12.8f,mutedText,700);h.setLetterSpacing(.06f);add(p,h,first?6:14);gap(p,6);}
    View choice(String name,String id,boolean selected,boolean pro,Runnable action){
        LinearLayout r=row();r.setMinimumHeight(d(44));r.setBackground(touch(0,12,selected?violet:0,selected?1:0));pad(r,11,4);
        r.setClipChildren(false);if(id!=null){r.addView(icon(id,20,selected?white:text),lp(20,20));gap(r,10);}
        TextView t=text(name,15,selected?white:text,400);line(t,22.5f);grow(r,t);
        if(pro){gap(r,10);r.addView(badge("PRO",c("accent-2"),0xff1a0b33));}r.setSelected(selected);r.setContentDescription(name);click(r,action);return r;
    }
    TextView badge(String name,int color,int ink){TextView t=text(name,11.2f,ink,700);t.setLetterSpacing(.035f);t.setBackground(shape(color,99,color,1));pad(t,8,2);return t;}
    View art(Svg svg,float alpha){View v=new View(a){@Override protected void onDraw(Canvas c){svg.fit(c,0,0,getWidth(),getHeight(),false);}};v.setAlpha(alpha);v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);return v;}
}
