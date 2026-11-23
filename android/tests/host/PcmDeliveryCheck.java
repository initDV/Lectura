package io.github.initdv.lectura;

import java.util.ArrayDeque;

// JVM only: javac -d "$out" android/src/io/github/initdv/lectura/PcmDelivery.java android/tests/host/PcmDeliveryCheck.java
// Then: java -cp "$out" io.github.initdv.lectura.PcmDeliveryCheck
public final class PcmDeliveryCheck {
    private static final class CloseProbe {
        int count;
        void close(){require(++count==1,"PCM fermé deux fois");}
    }
    private static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    private static void unexpectedAdoption(){throw new AssertionError("Le PCM ne doit pas être adopté");}

    private static void postRefused(){
        PcmDelivery delivery=new PcmDelivery(callback->false);
        CloseProbe pcm=new CloseProbe();
        require(!delivery.post(PcmDeliveryCheck::unexpectedAdoption,pcm::close),"Un refus ne transfère pas la propriété");
        require(pcm.count==0,"Le worker est encore propriétaire");
        pcm.close(); // AudioPreparation's finally on a rejected delivery.
        delivery.close();
        require(pcm.count==1,"Le refus doit laisser une seule fermeture, par le worker");
    }

    private static void destroyBeforeAdoption(){
        ArrayDeque<Runnable> callbacks=new ArrayDeque<>();
        PcmDelivery delivery=new PcmDelivery(callbacks::offer);
        CloseProbe pcm=new CloseProbe();
        require(delivery.post(PcmDeliveryCheck::unexpectedAdoption,pcm::close),"La remise doit être acceptée");
        require(callbacks.size()==1&&pcm.count==0,"Le PCM doit attendre son adoption sans être fermé");
        Runnable queued=callbacks.getFirst();
        delivery.close();
        callbacks.clear(); // onDestroy purges the Handler after closing pending results.
        require(pcm.count==1,"La destruction avant adoption doit fermer le PCM une fois");
        queued.run(); // Even if dispatched, a discarded callback must not adopt the PCM.

        CloseProbe late=new CloseProbe();
        require(!delivery.post(PcmDeliveryCheck::unexpectedAdoption,late::close)&&callbacks.isEmpty(),
            "Un worker qui termine après la destruction ne peut plus publier");
        late.close();
        delivery.close();
        require(pcm.count==1&&late.count==1,"Une seule fermeture par PCM");
    }

    public static void main(String[] args){
        postRefused();
        System.out.println("post-returns-false : OK");
        destroyBeforeAdoption();
        System.out.println("destroy-before-adoption : OK");
    }
}
