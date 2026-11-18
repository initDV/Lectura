package io.github.initdv.lectura;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Canvas;
import android.graphics.Color;
import android.view.View;
import java.io.IOException;
import java.io.InputStream;

public final class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Refs refs = new Refs(this);
        final Svg robot;
        try (InputStream in = refs.open("characters/robot_lectura.svg")) { robot = new Svg(in); }
        catch (IOException e) { throw new IllegalStateException(e); }
        setContentView(new View(this) {
            @Override protected void onDraw(Canvas canvas) {
                canvas.drawColor(Color.rgb(13,13,18));
                robot.fit(canvas,0,0,getWidth()*.38f,getHeight()*.7f,true);
            }
        });
    }
}
