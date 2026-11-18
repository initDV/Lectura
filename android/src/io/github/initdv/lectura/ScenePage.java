package io.github.initdv.lectura;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.Locale;

/** scene-controls.js, with real edit, button, switch and seek controls. */
final class ScenePage {
    final MainActivity a;final Ui u;final Stage stage;final ScrollView scroll;final LinearLayout panel;final EditText edit;
    final TextView minus,plus,speed,voice,launch,stop;
    final android.widget.ImageView mute;
    final View capture;
    final LinearLayout actions;
    ScenePage(MainActivity a,Stage stage){
        this.a=a;u=a.ui;this.stage=stage;scroll=u.scroll();scroll.setFillViewport(true);
        LinearLayout box=u.col();box.setFocusableInTouchMode(true);box.setDescendantFocusability(LinearLayout.FOCUS_BEFORE_DESCENDANTS);u.pad(box,12,10,12,16);
        scroll.addView(u.centered(box,1100),new ScrollView.LayoutParams(Ui.MATCH,Ui.WRAP));
        box.addView(stage,u.lp(Ui.MATCH,280));panel=u.col();u.add(box,panel,8);
        LinearLayout line=u.row();panel.addView(line,u.lp(Ui.MATCH,44));
        line.addView(u.icon("camera",20,u.mutedText),u.lp(20,20));u.gap(line,12);u.grow(line,u.p(a.t("scene.capturer")));
        capture=new View(a){
            final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
            @Override public CharSequence getAccessibilityClassName(){return "android.widget.Switch";}
            @Override public void onInitializeAccessibilityNodeInfo(android.view.accessibility.AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(info);info.setCheckable(true);info.setChecked(stage.presenting);}
            @Override protected void onDraw(Canvas c){float y=(getHeight()-u.f(30))/2;p.setColor(stage.presenting?u.fill:u.muted);
                c.drawRoundRect(0,y,u.f(54),y+u.f(30),u.f(15),u.f(15),p);p.setColor(0xffe6e6ec);c.drawCircle(u.f(stage.presenting?39:15),getHeight()/2f,u.f(12),p);}
        };capture.setContentDescription(a.t("scene.capturer"));u.click(capture,()->a.presentation(!stage.presenting));line.addView(capture,u.lp(54,44));
        u.gap(panel,6);line=u.row();panel.addView(line,u.lp(Ui.MATCH,44));u.grow(line,u.p(a.t("scene.vitesseCourt")));
        minus=round("minus",a.t("scene.vitesse.moins"),-.25f);line.addView(minus,u.lp(44,44));u.gap(line,12);
        speed=u.text("",15,u.white,700);speed.setGravity(Gravity.CENTER);line.addView(speed,u.lp(49.5f,44));u.gap(line,12);
        plus=round("plus",a.t("scene.vitesse.plus"),.25f);line.addView(plus,u.lp(44,44));
        u.gap(panel,6);line=u.row();panel.addView(line,u.lp(Ui.MATCH,44));
        LinearLayout pick=u.row();line.addView(pick,new LinearLayout.LayoutParams(0,Ui.MATCH,1));
        pick.addView(u.icon("voice",20,u.mutedText),u.lp(20,20));u.gap(pick,10);voice=u.p("• …");u.one(voice);u.grow(pick,voice);u.gap(pick,10);pick.addView(u.icon("chevron",20,u.text),u.lp(20,20));
        pick.setContentDescription(a.t("scene.voix.choisir"));u.click(pick,a::chooseVoice);u.gap(line,12);
        line.addView(u.iconButton("upload",a.t("scene.voix.fichier"),u.mutedText,20,a::pickAudio),u.lp(44,44));
        u.gap(panel,6);edit=u.field(a.project.text,a.t("scene.texte.placeholder"),true,0,s->{a.project.text=s.replaceAll("\\r\\n?","\n");a.changedText();});
        edit.setContentDescription(a.t("scene.texte.label"));edit.setBackground(u.shape(0,u.radius,0xff5a5a68,1));u.pad(edit,15,10);u.line(edit,21.75f);
        panel.addView(edit,u.lp(Ui.MATCH,64));
        u.gap(panel,6);actions=u.row();panel.addView(actions,u.lp(Ui.MATCH,48));
        launch=u.button("","play",true,false,()->a.launch(false));stop=u.button(a.t("scene.arreter"),"stop",a::stop);
        launch.setBackground(u.touch(u.fill,99,0,0));stop.setBackground(u.touch(0xff24242e,99,0,0));
        actions.addView(launch,u.lp(Ui.WRAP,48));u.gap(actions,6);actions.addView(stop,u.lp(Ui.WRAP,48));u.gap(actions,6);
        mute=(android.widget.ImageView)u.iconButton("volume",a.t("scene.muet"),u.mutedText,20,()->{a.muted=!a.muted;a.adjustVolume();});actions.addView(mute,u.lp(44,44));u.gap(actions,6);
        SeekBar volume=u.range(100,(int)Math.round(a.volume()*100),u.fill,n->{a.db.set("volume",n/100.);a.adjustVolume();});
        volume.setContentDescription(a.t("scene.volume"));actions.addView(volume,new LinearLayout.LayoutParams(0,u.d(44),1));
        scroll.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->layout());update();voice();
    }
    private TextView round(String id,String label,float delta){
        TextView r=u.button("",id,()->{a.project.speed=Math.max(.5f,Math.min(2,a.project.speed+delta));a.db.set("vitesseVoix",a.project.speed);a.adjustRate();update();});
        r.setContentDescription(label);u.pad(r,12,0);u.setIcon(r,id,20,u.accentText,0);r.setBackground(u.touch(0,99,u.violet,2));return r;
    }
    void layout(){
        float height=a.viewportHeight(),width=scroll.getWidth()/u.density;int h=u.d(stage.presenting?Math.max(80,height-20):Math.max(280,Math.min(.7f*height,height-306)));
        if(stage.getLayoutParams().height!=h){stage.getLayoutParams().height=h;stage.requestLayout();}
        boolean small=width<=420;float pad=small?14:20;
        float nameW=(launch.getPaint().measureText(launch.getText().toString())+stop.getPaint().measureText(stop.getText().toString()))/u.density;
        pad=Math.min(pad,Math.max(4,(width-24-40-16-44-50-(small?18:30)-nameW)/4));
        for(TextView b:new TextView[]{launch,stop}){u.style(b,small?16:16.8f,b==launch?0xffffffff:u.text,700);b.setGravity(Gravity.CENTER);u.pad(b,pad,0);}
        for(int i:new int[]{1,3,5}){View v=actions.getChildAt(i);v.getLayoutParams().width=u.d(small?6:10);v.requestLayout();}
    }
    void present(boolean b){stage.present(b);panel.setVisibility(b?View.GONE:View.VISIBLE);capture.invalidate();layout();if(b)scroll.scrollTo(0,0);}
    void voice(){String name=a.voiceName();voice.setText("• "+name);}
    void update(){
        float s=a.project.speed;speed.setText(String.format(Locale.ROOT,"%.2fx",s));u.enable(minus,s>.5,.4f);u.enable(plus,s<2,.4f);
        boolean playing=a.reading!=null&&a.reading.playing,paused=a.reading!=null&&!playing&&!a.stopped&&!a.reading.ended;
        launch.setText(a.t(playing?"scene.pause":paused?"scene.reprendre":"scene.lancer"));u.setIcon(launch,playing?"pause":"play",20,0xffffffff,8);
        u.enable(launch,!a.preparing,.5f);u.enable(stop,playing||paused||a.preparing,.5f);mute.setImageDrawable(u.iconDrawable(a.muted?"mute":"volume",20,u.mutedText));
        mute.setSelected(a.muted);mute.setContentDescription(a.t(a.muted?"scene.sonActif":"scene.muet"));
        if(scroll.getWidth()>0)layout();
    }
}
