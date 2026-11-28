package io.github.initdv.lectura;

import java.io.File;
import java.io.IOException;
import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Stateful Mimi decoder for the pinned Estelle pack. A phrase always starts from the empty state. */
final class Mimi implements AutoCloseable {
    static final int RATE=24000,LATENT=32,SAMPLES_PER_LATENT=1920,MAX_FRAMES=235; // 12.5 latent frames/s, mono.
    private final OrtLocal ort;
    private final OrtLocal.Session decoder;
    private final Map<String,AutoCloseable> initial=new LinkedHashMap<>();
    private final Map<String,String> feedback=new LinkedHashMap<>();

    Mimi(OrtLocal ort,File model,int threads)throws Exception {
        this.ort=ort;decoder=ort.session(model,threads);
        try {
            for(var e:decoder.inputs().entrySet()) {
                String name=e.getKey();if(!name.startsWith("state_"))continue;
                OrtLocal.Input input=e.getValue();
                // Empty convolution/attention state; the graph masks unused KV slots.
                initial.put(name,ort.tensor(OrtLocal.buffer(input.bytes()),input.shape,input.type));
                feedback.put(name,"out_"+name);
            }
            if(initial.size()!=56)throw new IOException("Décodeur Pocket TTS incompatible.");
        }catch(Exception|LinkageError e){close();throw e;}
    }
    float[] decode(float[] latents)throws Exception {
        int count=latents.length/LATENT;
        if(count<1||count>MAX_FRAMES||latents.length%LATENT!=0)throw new IOException("Trames Mimi invalides.");
        float[] audio=new float[count*SAMPLES_PER_LATENT];
        FloatBuffer frame=OrtLocal.buffer(LATENT*Float.BYTES).asFloatBuffer();
        Map<String,Object> input=new HashMap<>(initial);OrtLocal.Result state=null;
        try(AutoCloseable latent=ort.floats(frame,1,1,LATENT)) {
            input.put("latent",latent);
            // One latent expands into 16 attention positions; the 250-slot K/V ring is updated
            // before attention. A full phrase can overwrite keys that its earlier queries need.
            // Carry the convolution histories and the K/V ring forward, without copying state to Java.
            for(int i=0;i<count;i++) {
                Pcm.interrupted();frame.clear();frame.put(latents,i*LATENT,LATENT);frame.rewind();
                if(state!=null)for(var e:feedback.entrySet())input.put(e.getKey(),state.get(e.getValue()));
                OrtLocal.Result next=decoder.run(input);OrtLocal.dispose(state);state=next;
                state.copyFloats("audio_frame",audio,i*SAMPLES_PER_LATENT,SAMPLES_PER_LATENT);
            }
            return audio;
        }finally{OrtLocal.dispose(state);}
    }
    @Override public void close() {
        for(AutoCloseable state:initial.values())OrtLocal.dispose(state);initial.clear();
        OrtLocal.dispose(decoder);
    }
}
