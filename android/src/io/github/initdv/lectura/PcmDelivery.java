package io.github.initdv.lectura;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Predicate;

/** Tracks posted preparation results until adoption or teardown, both on the main thread. */
final class PcmDelivery {
    private final Predicate<Runnable> enqueue;
    private final Map<Runnable,Runnable> pending=new HashMap<>();
    private boolean closed;

    PcmDelivery(Predicate<Runnable> enqueue){this.enqueue=enqueue;}

    /** A false return or a posting exception leaves cleanup with the worker. */
    synchronized boolean post(Runnable adopt,Runnable discard){
        if(closed)return false;
        Runnable callback=new Runnable(){
            @Override public void run(){
                synchronized(PcmDelivery.this){if(pending.remove(this)==null)return;}
                adopt.run();
            }
        };
        pending.put(callback,discard);
        boolean accepted=false;
        try{
            accepted=enqueue.test(callback);
            return accepted;
        }finally{if(!accepted)pending.remove(callback);}
    }

    synchronized void close(){
        closed=true;
        for(Runnable discard:pending.values())discard.run();
        pending.clear();
    }
}
