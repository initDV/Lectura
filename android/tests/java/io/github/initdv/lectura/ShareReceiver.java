package io.github.initdv.lectura;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.os.ResultReceiver;
import java.io.InputStream;

/** Lives under the test APK's own UID, so it needs the actual temporary read grant. */
public final class ShareReceiver extends Activity {
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Intent send=getIntent();ResultReceiver reply=send.getParcelableExtra("lectura.test.result");
        Bundle result=new Bundle();result.putInt("uid",Process.myUid());int code=RESULT_CANCELED;
        if(reply!=null&&Intent.ACTION_SEND.equals(send.getAction())){
            Uri uri=send.getParcelableExtra(Intent.EXTRA_STREAM);
            try(InputStream file=getContentResolver().openInputStream(uri)){
                result.putString("mime",getContentResolver().getType(uri));
                if(file!=null&&file.read()>=0)code=RESULT_OK;
            }catch(Exception e){result.putString("error",e.toString());}
            reply.send(code,result);
        }
        finish();
    }
}
