package io.github.initdv.lectura.capture;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.ByteArrayOutputStream;
import org.xmlpull.v1.XmlSerializer;

/** Runs in its own disposable test APK. Queries public accessibility nodes without an idle heuristic. */
public final class UiSnapshot extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            UiAutomation automation = getUiAutomation();
            AccessibilityNodeInfo root = null;
            for (int i = 0; i < 20; i++) {
                root = automation.getRootInActiveWindow();
                if (root != null && "io.github.initdv.lectura".contentEquals(root.getPackageName())) break;
                if (root != null) root.recycle();
                root = null;
                SystemClock.sleep(100);
            }
            if (root == null) throw new IllegalStateException("Lectura's active window is not available");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            XmlSerializer xml = Xml.newSerializer();
            xml.setOutput(out, "UTF-8");
            xml.startDocument("UTF-8", true);
            xml.startTag(null, "hierarchy");
            print(xml, root, 0);
            root.recycle();
            xml.endTag(null, "hierarchy");
            xml.endDocument();
            result.putString("snapshot", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            finish(Activity.RESULT_OK, result);
        } catch (Exception failed) {
            result.putString("error", failed.toString());
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void print(XmlSerializer xml, AccessibilityNodeInfo node, int depth) throws Exception {
        if (!node.isVisibleToUser() || depth > 72) return;
        Rect r = new Rect();
        node.getBoundsInScreen(r);
        if (r.isEmpty()) return;
        xml.startTag(null, "node");
        xml.attribute(null, "package", string(node.getPackageName()));
        xml.attribute(null, "text", string(node.getText()));
        xml.attribute(null, "content-desc", string(node.getContentDescription()));
        xml.attribute(null, "class", string(node.getClassName()));
        xml.attribute(null, "enabled", Boolean.toString(node.isEnabled()));
        xml.attribute(null, "clickable", Boolean.toString(node.isClickable()));
        xml.attribute(null, "bounds", "[" + r.left + "," + r.top + "][" + r.right + "," + r.bottom + "]");
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { try { print(xml, child, depth + 1); } finally { child.recycle(); } }
        }
        xml.endTag(null, "node");
    }

    private static String string(CharSequence s) { return s == null ? "" : s.toString(); }
}
