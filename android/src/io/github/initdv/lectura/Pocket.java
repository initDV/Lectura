package io.github.initdv.lectura;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;

/** Estelle, preset-only Pocket TTS FR. Uses the pinned Okuvia ONNX graph contract, no voice encoder or cloning. */
final class Pocket implements AutoCloseable {
    static final int RATE=24000;
    private static final int LATENT=32,TEXT_DIM=1024,CACHE_SIZE=1000,HEADS=16,HEAD_DIM=64,STATES=18;
    private final OrtLocal ort;
    private final LocalUnigram tokenizer;
    private OrtLocal.Session main,flow,decoder,text;
    private final Map<String,AutoCloseable> preset=new LinkedHashMap<>(),mimi=new LinkedHashMap<>();
    private final Random random=new Random();
    Pocket(File path)throws Exception {
        File models=new File(path,"models");
        tokenizer=new LocalUnigram(Files.readAllBytes(new File(models,"tokenizer.model").toPath()));
        ort=new OrtLocal();
        int n=Math.min(4,Math.max(1,Runtime.getRuntime().availableProcessors()));
        try {
            Pcm.interrupted();main=ort.session(new File(models,"flow_lm_main.onnx"),n);
            Pcm.interrupted();flow=ort.session(new File(models,"flow_lm_flow.onnx"),n);
            Pcm.interrupted();decoder=ort.session(new File(models,"mimi_decoder.onnx"),n);
            Pcm.interrupted();text=ort.session(new File(models,"text_conditioner.onnx"),1);
            readPreset(new File(path,"voices/estelle.preset"));
            for(var e:decoder.inputs().entrySet()) {
                if(!e.getKey().startsWith("state_"))continue;
                OrtLocal.Input input=e.getValue();ByteBuffer data=OrtLocal.buffer(input.bytes());
                // Empty convolution/attention state; the graphs explicitly mask unused KV slots.
                mimi.put(e.getKey(),ort.tensor(data,input.shape,input.type));
            }
            if(mimi.size()!=56)throw new IOException("Décodeur Pocket TTS incompatible.");
        }catch(Exception|LinkageError e){close();throw e;}
    }
    private void readPreset(File file)throws Exception {
        ByteBuffer b=ByteBuffer.wrap(Files.readAllBytes(file.toPath())).order(ByteOrder.LITTLE_ENDIAN);
        if(b.getInt()!=0x3143564b||b.getLong()!=b.remaining()||b.getInt()!=0||b.getInt()!=STATES)throw new IOException("Préréglage Estelle invalide.");
        long position=-1;
        for(int i=0;i<STATES;i++) {
            Pcm.interrupted();int rank=b.getInt();String key="state_"+i;
            if(i%3==2) {
                if(rank!=1||b.getLong()!=1||b.getInt()!=7||b.getLong()!=8)throw new IOException("Position Estelle invalide.");
                long offset=b.getLong();if(offset<=0||offset>250||position>=0&&offset!=position)throw new IOException("Cache Estelle invalide.");
                position=offset;preset.put(key,ort.ints(new long[]{offset},1));
            } else {
                if(rank!=4||b.getLong()!=1)throw new IOException("Cache Estelle invalide.");
                long used=b.getLong();
                if(used<=0||used>250||position>=0&&used!=position||b.getLong()!=HEADS||b.getLong()!=HEAD_DIM||b.getInt()!=10)
                    throw new IOException("Tenseur Estelle invalide.");
                position=used;int count=(int)used*HEADS*HEAD_DIM*2;
                if(b.getLong()!=count||b.remaining()<count)throw new IOException("Données Estelle tronquées.");
                ByteBuffer padded=OrtLocal.buffer(CACHE_SIZE*HEADS*HEAD_DIM*2),slice=b.slice();
                slice.limit(count);padded.put(slice);padded.position(0);b.position(b.position()+count);
                preset.put(key,ort.tensor(padded,new long[]{1,CACHE_SIZE,HEADS,HEAD_DIM},"FLOAT16"));
            }
        }
        if(b.hasRemaining())throw new IOException("Préréglage Estelle inattendu.");
    }
    float[] generate(String raw)throws Exception {
        String s=raw.replace('’','\'').replace(':',',').replace(";","").replace('…','.').trim();
        if(s.isEmpty())throw new IOException("Phrase Estelle vide.");
        int first=s.codePointAt(0);s=new String(Character.toChars(Character.toUpperCase(first)))+s.substring(Character.charCount(first));
        if(Character.isLetterOrDigit(s.codePointBefore(s.length())))s+=".";
        int words=s.split(" +").length,tail=words<=4?5:3;
        long[] ids=tokenizer.encode(s);
        if(ids.length==0||ids.length>300)throw new IOException("Phrase Estelle trop longue.");
        int limit=Math.min(235,Math.max(45,ids.length*6+28)),count=0,ending=-1;
        float[] latents=new float[limit*LATENT],current=new float[LATENT];Arrays.fill(current,Float.NaN);
        OrtLocal.Result state=null;
        try(AutoCloseable tokens=ort.ints(ids,1,ids.length);
            OrtLocal.Result textEmbeddings=text.run(Map.of("token_ids",tokens));
            AutoCloseable noSequence=ort.floats(new float[0],1,0,LATENT);
            AutoCloseable noText=ort.floats(new float[0],1,0,TEXT_DIM);
            AutoCloseable start=ort.floats(new float[]{0},1,1);
            AutoCloseable end=ort.floats(new float[]{1},1,1)) {
            Map<String,Object> in=new HashMap<>(preset);in.put("sequence",noSequence);in.put("text_embeddings",textEmbeddings.get("embeddings"));
            state=main.run(in);
            for(int i=0;i<limit;i++) {
                Pcm.interrupted();in.clear();
                for(int j=0;j<STATES;j++)in.put("state_"+j,state.get("out_state_"+j));
                in.put("text_embeddings",noText);
                try(AutoCloseable last=ort.floats(current,1,1,LATENT)) {
                    in.put("sequence",last);OrtLocal.Result next=main.run(in);state.close();state=next;
                }
                float eos=state.floats("eos_logit")[0];
                if(!Float.isFinite(eos))throw new IOException("Estelle : état de synthèse non fini.");
                if(ending<0&&eos>-4)ending=i;
                if(ending>=0&&i-ending>=tail)break;
                float[] noise=new float[LATENT];for(int j=0;j<LATENT;j++)noise[j]=(float)(random.nextGaussian()*Math.sqrt(.3));
                try(AutoCloseable x=ort.floats(noise,1,LATENT);
                    OrtLocal.Result out=flow.run(Map.of("c",state.get("conditioning"),"s",start,"t",end,"x",x))) {
                    float[] velocity=out.floats("flow_dir");
                    for(int j=0;j<LATENT;j++) {
                        current[j]=noise[j]+velocity[j];
                        if(!Float.isFinite(current[j]))throw new IOException("Estelle : latent non fini.");
                    }
                }
                System.arraycopy(current,0,latents,count++*LATENT,LATENT);
            }
        }finally{OrtLocal.dispose(state);}
        if(count<2||ending<0)throw new IOException("Estelle : fin de phrase non reconnue. Essaie un texte plus court ou une autre voix locale.");
        try(AutoCloseable latent=ort.floats(Arrays.copyOf(latents,count*LATENT),1,count,LATENT)) {
            Map<String,Object> input=new HashMap<>(mimi);input.put("latent",latent);
            try(OrtLocal.Result result=decoder.run(input)){return result.floats("audio_frame");}
        }
    }
    @Override public void close() {
        for(AutoCloseable state:preset.values())OrtLocal.dispose(state);preset.clear();
        for(AutoCloseable state:mimi.values())OrtLocal.dispose(state);mimi.clear();
        OrtLocal.dispose(main);OrtLocal.dispose(flow);OrtLocal.dispose(decoder);OrtLocal.dispose(text);
    }
}
