package io.github.initdv.lectura;

import android.content.res.AssetManager;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/** Kokoro v1.0 INT8, voice 30 (ff_siwis), via the official Sherpa-ONNX Kotlin/JNI API. */
final class Kokoro implements AutoCloseable {
    private static final String BASE="com.k2fsa.sherpa.onnx.";
    private final Object tts,config;
    private final Method generate,samples,phonemes,free;
    private final G2p g2p;
    private final boolean glide,palatal;
    final int rate;
    static boolean supported(){try{Class.forName(BASE+"OfflineTts",false,Kokoro.class.getClassLoader());return true;}
        catch(ClassNotFoundException|LinkageError e){return false;}}
    Kokoro(File dir,G2p g2p)throws Exception {
        this.g2p=g2p;
        List<String> tokens=Files.readAllLines(new File(dir,"tokens.txt").toPath());
        glide=hasToken(tokens,'ɥ');palatal=hasToken(tokens,'ɲ');
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
    private static boolean hasToken(List<String> tokens,char phone){
        return tokens.stream().anyMatch(s->s.length()>1&&s.charAt(0)==phone&&Character.isWhitespace(s.charAt(1)));
    }
    static int[][] phonemeChunks(String phrase,boolean glide,boolean palatal)throws IOException {
        if(!glide)phrase=phrase.replace('ɥ','y');
        if(!palatal)phrase=phrase.replace("ɲ","nj");
        String ipa=Normalizer.normalize(phrase,Normalizer.Form.NFD);
        // Sherpa splits blindly beyond 400 symbols. Prefer a word boundary before that limit.
        List<int[]> chunks=new ArrayList<>();int end=0;
        while(end<ipa.length()) {
            int limit=Math.min(ipa.length(),end+400),cut=limit;
            if(limit<ipa.length()) {
                int space=ipa.lastIndexOf(' ',limit);
                if(space>end)cut=space;
                if(Character.isLowSurrogate(ipa.charAt(cut)))cut--;
            }
            int[] chunk=ipa.substring(end,cut).trim().codePoints().toArray();
            if(chunk.length>0)chunks.add(chunk);
            end=cut;while(end<ipa.length()&&ipa.charAt(end)==' ')end++;
        }
        if(chunks.isEmpty()||chunks.size()>8)throw new IOException("Phrase Kokoro non prononçable ou trop longue.");
        return chunks.toArray(new int[chunks.size()][]);
    }
    float[] generate(String text)throws Exception {
        Pcm.interrupted();int[][] ipa=phonemeChunks(g2p.phrase(text,G2p.Profile.KOKORO),glide,palatal);
        try {
            // Sherpa 2.x no longer includes eSpeak. Supply Lectura's local French IPA (no service or lexicon download).
            phonemes.invoke(config,(Object)ipa);
            float[] pcm=(float[])samples.invoke(generate.invoke(tts,"",config));Pcm.interrupted();return pcm;
        }catch(InvocationTargetException e){throw new IOException("Synthèse Kokoro : "+cause(e),cause(e));}
    }
    private static Throwable cause(Throwable e){return e.getCause()==null?e:e.getCause();}
    @Override public void close(){try{free.invoke(tts);}catch(ReflectiveOperationException ignored){}}
}
