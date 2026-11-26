package io.github.initdv.lectura;

import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Device preferences with a live preview: only the bottom of the scene is covered. */
final class FramingPanel {
    private static final String LABEL="android.cadrage.";
    private final MainActivity a;
    private final Stage stage;
    private final Ui u;
    private final List<Row> rows=new ArrayList<>();

    FramingPanel(MainActivity a){
        this.a=a;stage=a.stage;u=a.ui;
        FrameLayout overlay=a.showModal(0x2006060a,true);
        LinearLayout card=u.card();u.pad(card,16,6,16,10);
        card.setFocusableInTouchMode(true);card.setClickable(true);
        a.sheetHeader(card,a.t(LABEL+"titre"));
        ScrollView scroll=u.scroll();scroll.setVerticalScrollBarEnabled(true);
        card.addView(scroll,new LinearLayout.LayoutParams(Ui.MATCH,0,1));
        LinearLayout body=u.col();scroll.addView(body,new ScrollView.LayoutParams(Ui.MATCH,Ui.WRAP));
        for(SceneLayout.Control control:SceneLayout.Control.values()){
            if(control==SceneLayout.Control.SIZE)u.gap(body,6);
            rows.add(new Row(body,control));
        }
        u.add(body,u.button(a.t(LABEL+"reset"),null,()->{
            a.db.set(SceneLayout.PREFERENCE,new JSONObject());
            stage.updateFraming();sync();scroll.smoothScrollTo(0,0);
        }),8);
        u.add(body,u.small(a.t(LABEL+"exports")),8);

        overlay.addView(card,u.fp(460,Ui.WRAP,Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL));
        size(overlay,card,a.content.getWidth(),a.content.getHeight());
        overlay.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->size(v,card,r-l,b-t));
        View.OnLayoutChangeListener changed=(v,l,t,r,b,ol,ot,or,ob)->sync();
        stage.addOnLayoutChangeListener(changed);
        a.modalCleanup=()->stage.removeOnLayoutChangeListener(changed);
        card.requestFocus();sync();
    }

    private void size(View overlay,View card,int width,int height){
        if(width<=0||height<=0)return;
        int w=Math.max(1,Math.min(u.d(460),width-overlay.getPaddingLeft()-overlay.getPaddingRight()));
        int available=height-overlay.getPaddingTop()-overlay.getPaddingBottom();
        int desired=Math.max(u.d(140),Math.min(u.d(414),Math.round(height*.45f)));
        int h=Math.max(1,Math.min(available,desired));
        FrameLayout.LayoutParams layout=(FrameLayout.LayoutParams)card.getLayoutParams();
        if(layout.width!=w||layout.height!=h){layout.width=w;layout.height=h;card.setLayoutParams(layout);}
    }

    private int value(SceneLayout.Control control){
        return control.value(a.db.settings.optJSONObject(SceneLayout.PREFERENCE),stage.screenLayout().closePortrait);
    }
    private void sync(){for(Row row:rows)row.show(value(row.control));}

    private final class Row {
        final SceneLayout.Control control;
        final TextView value;
        final SeekBar slider;
        Row(LinearLayout panel,SceneLayout.Control control){
            this.control=control;
            LinearLayout line=u.row(),caption=u.col();String label=a.t(LABEL+control.key);
            panel.addView(line,u.lp(Ui.MATCH,Ui.WRAP));
            line.addView(caption,new LinearLayout.LayoutParams(0,Ui.WRAP,1));
            TextView name=u.text(label,13.6f,u.text,550);u.add(caption,name,0);
            value=u.text("",12.8f,u.accentText,700);u.add(caption,value,2);u.gap(line,8);
            slider=u.range(control.min,control.max,FramingPanel.this.value(control),u.accent,this::adjust);
            slider.setContentDescription(label);slider.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
            line.addView(slider,new LinearLayout.LayoutParams(0,u.d(50),1.1f));
            caption.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
        private void adjust(int n){
            JSONObject settings=Refs.object(a.db.settings,SceneLayout.PREFERENCE);
            a.db.set(SceneLayout.PREFERENCE,Refs.put(settings,control.key,n));
            stage.updateFraming();show(n);
        }
        void show(int n){
            slider.setProgress(n);
            String text=(control.min<0&&n>0?"+":"")+n+" %";
            value.setText(text);slider.setStateDescription(text);
        }
    }
}
