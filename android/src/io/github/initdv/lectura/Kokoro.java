package io.github.initdv.lectura;

import android.content.res.AssetManager;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.text.Normalizer;

/** Kokoro v1.0 INT8, voice 30 (ff_siwis), via the official Sherpa-ONNX Kotlin/JNI API. */
final class Kokoro implements AutoCloseable {
    private static final String BASE="com.k2fsa.sherpa.onnx.";
    private final Object tts,config;
    private final Method generate,samples,phonemes,free;
    private final G2p g2p;
    final int rate;
    static boolean supported(){try{Class.forName(BASE+"OfflineTts",false,Kokoro.class.getClassLoader());return true;}
        catch(ClassNotFoundException|LinkageError e){return false;}}
    Kokoro(File dir,G2p g2p)throws Exception {
        this.g2p=g2p;
        try {
            Class<?> type=Class.forName(BASE+"OfflineTts"),generation=Class.forName(BASE+"GenerationConfig");
            config=generation.getConstructor().newInstance();generation.getMethod("setSid",int.class).invoke(config,30);
            phonemes=generation.getMethod("setPhonemeCodepoints",int[][].class);
            samples=Class.forName(BASE+"GeneratedAudio").getMethod("getSamples");
            free=type.getMethod("free");generate=type.getMethod("generateWithConfig",String.class,generation);
            Class<?> settings=Class.forName(BASE+"OfflineTtsConfig");Object cfg=settings.getConstructor().newInstance();
            Object model=settings.getMethod("getModel").invoke(cfg);
            model.getClass().getMethod("setNumThreads",int.class).invoke(model,Math.min(3,Runtime.getRuntime().availableProcessors()));
            Object kokoro=model.getClass().getMethod("getKokoro").invoke(model);
            for(String[] prop:new String[][]{{"Model","model.int8.onnx"},{"Voices","voices.bin"},{"Tokens","tokens.txt"}})
                kokoro.getClass().getMethod("set"+prop[0],String.class).invoke(kokoro,new File(dir,prop[1]).getPath());
            tts=type.getConstructor(AssetManager.class,settings).newInstance(null,cfg);
            try {
                rate=(Integer)type.getMethod("sampleRate").invoke(tts);
                if(rate!=24000||(Integer)type.getMethod("numSpeakers").invoke(tts)<=30)throw new IOException("Modèle Kokoro incompatible.");
            }catch(Exception e){close();throw e;}
        }catch(InvocationTargetException|LinkageError e){throw new IOException("Initialisation Kokoro/Sherpa-ONNX : "+cause(e),cause(e));}
    }
    float[] generate(String text)throws Exception {
        Pcm.interrupted();int[] ipa=Normalizer.normalize(g2p.phrase(text),Normalizer.Form.NFD).codePoints().toArray();
        if(ipa.length==0||ipa.length>500)throw new IOException("Phrase Kokoro non prononçable ou trop longue.");
        try {
            // Sherpa 2.x no longer includes eSpeak. Supply Lectura's local French IPA (no service or lexicon download).
            phonemes.invoke(config,(Object)new int[][]{ipa});
            float[] pcm=(float[])samples.invoke(generate.invoke(tts,text,config));Pcm.interrupted();return pcm;
        }catch(InvocationTargetException e){throw new IOException("Synthèse Kokoro : "+cause(e),cause(e));}
    }
    private static Throwable cause(Throwable e){return e.getCause()==null?e:e.getCause();}
    @Override public void close(){try{free.invoke(tts);}catch(ReflectiveOperationException ignored){}}
}
