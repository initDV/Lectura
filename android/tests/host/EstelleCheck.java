package io.github.initdv.lectura;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CancellationException;

// The same decoder as on Android; only the cancellation check is needed from Pcm here.
final class Pcm {static void interrupted(){if(Thread.currentThread().isInterrupted())throw new CancellationException();}}

public final class EstelleCheck {
    private static final int RATE=Mimi.RATE,BLOCK=Mimi.SAMPLES_PER_LATENT,DIM=Mimi.LATENT;
    private static final String LINE="Ce matin la lumière traverse la fenêtre et nous prenons le temps de lire quelques lignes ensemble.";
    private static final int THREADS=Math.min(4,Runtime.getRuntime().availableProcessors());
    private static final String ARCH=System.getProperty("os.arch");
    public static void main(String[] args)throws Exception {
        File root=new File(args[0]),graph=new File(root,"models/mimi_decoder.onnx");
        Path dir=Path.of(args[1]);Files.createDirectories(dir);
        try {
            switch(args[2]) {
                case "prepare":
                    try(Pocket p=new Pocket(root)){
                        float[] latent=p.latents(LINE);
                        require(latent.length/DIM>=32,"La phrase de test doit dépasser plusieurs tours du tampon Mimi.");
                        write(dir.resolve("latents.f32"),latent);
                        write(dir.resolve("question.f32"),p.latents("Tu veux venir ce soir ?"));
                    }
                    break;
                case "v28":write(dir.resolve("avant.f32"),legacy(graph,read(dir.resolve("latents.f32"))));break;
                case "v29":
                    try(Mimi mimi=new Mimi(new OrtLocal(),graph,THREADS)){
                        write(dir.resolve("apres.f32"),mimi.decode(read(dir.resolve("latents.f32"))));
                    }
                    break;
                case "check":compare(graph,dir);break;
                default:throw new IllegalArgumentException(args[2]);
            }
        }catch(Throwable e){System.out.println("::error title=Contrat Estelle::"+e.toString().replace("\n","%0A"));throw e;}
    }
    private static float[] legacy(File graph,float[] latent)throws Exception {
        // Exact v28 whole-phrase call, with the same latent samples supplied to both versions.
        OrtLocal ort=new OrtLocal();Map<String,AutoCloseable> states=new LinkedHashMap<>();
        try(var decoder=ort.session(graph,THREADS)){
            for(var entry:decoder.inputs().entrySet())if(entry.getKey().startsWith("state_")){
                var in=entry.getValue();states.put(entry.getKey(),ort.tensor(OrtLocal.buffer(in.bytes()),in.shape,in.type));
            }
            states.put("latent",ort.floats(latent,1,latent.length/DIM,DIM));
            try(var out=decoder.run(states)){return out.floats("audio_frame");}
        }finally{for(var state:states.values())OrtLocal.dispose(state);}
    }
    private static void compare(File graph,Path dir)throws Exception {
        float[] z=read(dir.resolve("latents.f32")),before=read(dir.resolve("avant.f32")),after=read(dir.resolve("apres.f32"));
        require(before.length==after.length&&after.length==z.length/DIM*BLOCK,"1 920 échantillons/trame à 24 kHz");
        float p0=peak(before),p1=peak(after);require(p1>.01,"Signal Mimi muet");
        double sum=0,maxSeam=0;
        for(int i=0;i<after.length;i++){double d=after[i]-before[i];sum+=d*d;}
        for(int i=BLOCK;i<after.length;i+=BLOCK){
            double jump=Math.abs(after[i]-after[i-1]),nearby=0;
            for(int j=i-120;j<=i+120;j++)if(j!=i)nearby=Math.max(nearby,Math.abs(after[j]-after[j-1]));
            require(jump<=2*nearby+.06,"Saut anormal à un raccord Mimi : "+i+" / "+jump+" / "+nearby);
            maxSeam=Math.max(maxSeam,jump);
        }
        try(Mimi mimi=new Mimi(new OrtLocal(),graph,THREADS)){
            for(int frames:new int[]{3,18,32}){
                float[] prefix=mimi.decode(Arrays.copyOf(z,frames*DIM));
                require(Arrays.equals(prefix,0,prefix.length,after,0,prefix.length),"L’ajout de latents futurs change le début du PCM");
            }
            Thread.currentThread().interrupt();
            try{mimi.decode(z);throw new AssertionError("Annulation Mimi ignorée");}
            catch(CancellationException expected){/* Next phrase must still start with empty decoder state. */}
            finally{Thread.interrupted();}
            float[] question=mimi.decode(read(dir.resolve("question.f32")));
            int end=question.length;while(end>1&&Math.abs(question[end-1])<.001)end--;
            float[] shifted=QuestionPitch.adjust(question,0,end,RATE,0);
            boolean lift=shifted!=question;
            require(shifted.length==question.length,"Le phrasé Estelle ne doit pas allonger le PCM.");
            int changed=0;
            for(int i=0;i<question.length;i++)if(question[i]!=shifted[i]){
                require(i>=end-12480&&i<end,"Montée hors de la finale");changed++;
            }
            require(lift==(changed>0),"Montée sans modification du PCM");peak(shifted);
            System.out.printf("::notice title=Contour de question %s::%d échantillons modifiés, durée inchangée, pic %.3f avant et %.3f après%n",
                ARCH,changed,peak(question),peak(shifted));
            wav(dir.resolve("question-v29.wav"),shifted);
        }
        System.out.printf("::notice title=Mimi %s::%d trames / %.2f s, pics %.3f → %.3f, écart RMS v28/v29 %.4f, plus grand delta aux raccords %.4f ; préfixes 3/18/32 trames identiques, état remis à zéro%n",
            ARCH,after.length/BLOCK,after.length/(double)RATE,p0,p1,Math.sqrt(sum/after.length),maxSeam);
        wav(dir.resolve("meme-phrase-v28.wav"),before);wav(dir.resolve("meme-phrase-v29.wav"),after);
    }
    private static float peak(float[] pcm){float p=0;for(float f:pcm){require(Float.isFinite(f),"Échantillon non fini");p=Math.max(p,Math.abs(f));}return p;}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private static float[] read(Path path)throws Exception {
        byte[] raw=Files.readAllBytes(path);float[] data=new float[raw.length/4];
        ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(data);return data;
    }
    private static void write(Path path,float[] data)throws Exception {
        ByteBuffer b=ByteBuffer.allocate(data.length*4).order(ByteOrder.LITTLE_ENDIAN);b.asFloatBuffer().put(data);Files.write(path,b.array());
    }
    private static void wav(Path path,float[] pcm)throws Exception {
        int bytes=pcm.length*2;
        ByteBuffer b=ByteBuffer.allocate(bytes+44).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt(0x46464952).putInt(bytes+36).putInt(0x45564157).putInt(0x20746d66).putInt(16).putShort((short)1).putShort((short)1);
        b.putInt(RATE).putInt(2*RATE).putShort((short)2).putShort((short)16).putInt(0x61746164).putInt(bytes);
        for(float f:pcm)b.putShort((short)Math.round(32767*Math.max(-1,Math.min(1,f))));Files.write(path,b.array());
    }
}
