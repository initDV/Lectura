package io.github.initdv.lectura;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import org.json.JSONObject;

/** Same text for all listening clips, and focused checks that do not depend on subjective voice quality. */
final class VoiceDictionChecks {
    static final String SAMPLE="À 8 h 30, les enfants longent la montagne sous la pluie. Tu viens avec nous ?\nOui !";

    static String run(Refs refs)throws Exception {
        JSONObject lex=Refs.object(refs.json("prononciation.json"),"fr");
        String text="Tu viens, ce matin, avec nous ?\r\n$ echo silence\r\nOui !";
        var grouped=SpeechPlan.plan(text,"fr",lex,true);
        require(grouped.size()==3&&grouped.get(0).spoken.equals("Tu viens, ce matin, avec nous ?")
            &&grouped.get(0).closedQuestion&&grouped.get(0).pauseMs==560&&grouped.get(1).spoken.isEmpty(),"Contexte et silences du phrasé");
        require(SpeechPlan.plan(text,"fr",lex).size()==5,"Le découpage Piper ne doit pas changer");
        require(SpeechPlan.plan("Bonjour,  ","fr",lex,true).get(0).pauseMs==140,"Pause en fin de ligne");
        String first="Les enfants avancent dans la montagne ".repeat(3).trim()+",";
        String longer=first+" puis "+"ils tournent vers la source ".repeat(3).trim()+".";
        var bounded=SpeechPlan.plan(longer,"fr",lex,true);
        require(bounded.size()==2&&bounded.get(0).spoken.equals(first)&&bounded.get(0).pauseMs==140,"Couper la longue phrase sur la virgule");
        for(var f:grouped){
            var p=f.original;require(p.text.equals(text.substring(p.start,p.end)),"Plage originale modifiée");
            if(p.cursor!=null)require(Arrays.stream(p.cursor).allMatch(i->i>=p.start&&i<p.end),"Curseur hors de son fragment");
        }
        require(Pocket.prompt("  bonjour,  ").equals("Bonjour.")&&Pocket.prompt("d’accord; tu viens :").equals("D'accord, tu viens.")
            &&Pocket.prompt("tu viens ?").equals("Tu viens ?"),"Ponctuation Pocket");
        G2p g=new G2p(refs.json("g2p.json"));
        String phrase="La montagne, le panier, des oignons, la pluie et les yeux.";
        String ipa=g.phrase(phrase,G2p.Profile.KOKORO),piper=g.phrase(phrase);
        require(ipa.contains("mɔ̃tˈaɲ")&&ipa.contains("panjˈe")&&ipa.contains("ɔɲˈɔ̃")&&ipa.contains("plɥˈi")&&ipa.contains("lez jˈø")
            &&!ipa.contains("-")&&!piper.contains("ɲ")&&piper.contains("mɔ̃tˈanj"),"Phonèmes Kokoro / Piper : "+ipa+" / "+piper);
        int[][] chunks=Kokoro.phonemeChunks(ipa,true,true);
        require(chunks.length==1&&new String(chunks[0],0,chunks[0].length).equals(ipa),"Perte de phonèmes du pack Kokoro");
        String longIpa=("panjˈe ".repeat(100)).trim();
        chunks=Kokoro.phonemeChunks(longIpa,true,true);
        require(chunks.length==2&&Arrays.stream(chunks).allMatch(c->c.length<=400)
            &&(new String(chunks[0],0,chunks[0].length)+" "+new String(chunks[1],0,chunks[1].length)).equals(longIpa),"Borne Kokoro sans coupe de mot");
        quietEdges(refs,lex);
        estellePresence(refs,lex);
        estelleProjection(refs,lex);
        return "Clauses, questions, texte et curseurs ; ɲ ≠ nj ; Estelle : +5 % à 3 kHz conservé, soutien plus fort en fin de phrase faible, niveau de fond et silences inchangés";
    }

    private static void quietEdges(Refs refs,JSONObject lex)throws Exception {
        int rate=24000,start=2400,end=12000,quiet=600;float[] input=new float[rate];
        for(int i=start-quiet;i<end+quiet;i++)input[i]=(i%2==0?1:-1)*(i>=start&&i<end?.4f:.001f);
        int[] span=VoiceRender.audible(input,rate);
        require(span[0]>start-quiet&&span[1]<end+quiet,"Le seuil de référence doit rogner les bords faibles de la fixture");
        for(var profile:List.of(VoiceRender.Profile.ESTELLE,VoiceRender.Profile.PACK)){
            var plan=SpeechPlan.plan("Chut.","fr",lex,true);
            try(Pcm wav=VoiceRender.render(refs.context.getCacheDir(),null,null,plan,rate,28,profile,s->input,(n,total)->{}).pcm){
                var p=plan.get(0).original;
                require(p.speechEnd==450&&p.to-p.speechEnd==320,"Bords faibles ou marge temporelle "+profile);
                require(DeviceChecks.pcmPeak(wav,4,20)>0&&DeviceChecks.pcmPeak(wav,430,446)>0
                    &&DeviceChecks.pcmPeak(wav,451,769)==0,"Bords perdus ou silence non nul "+profile);
            }
        }
    }

    private static void estellePresence(Refs refs,JSONObject lex)throws Exception {
        int rate=24000;
        for(int hz:new int[]{220,3000,10000}){
            float[] tone=new float[rate];
            for(int i=0;i<tone.length;i++)tone[i]=(float)(.25*Math.sin(2*Math.PI*hz*i/rate));
            float[] original=tone.clone();
            var dryPlan=SpeechPlan.plan("Bonjour.","fr",lex,true);
            var wetPlan=SpeechPlan.plan("Bonjour.","fr",lex,true);
            File dir=refs.context.getCacheDir();
            try(Pcm dry=VoiceRender.render(dir,null,null,dryPlan,rate,28,VoiceRender.Profile.PACK,s->tone,(n,total)->{}).pcm;
                Pcm wet=VoiceRender.render(dir,null,null,wetPlan,rate,28,VoiceRender.Profile.ESTELLE_PRESENCE,s->tone,(n,total)->{}).pcm){
                var a=dryPlan.get(0).original;var b=wetPlan.get(0).original;
                require(dry.frames==wet.frames&&a.speechEnd==b.speechEnd&&a.to==b.to&&b.to-b.speechEnd==320
                    &&DeviceChecks.pcmPeak(wet,b.speechEnd+1,b.to-1)==0,"Renfort Estelle : modification de la durée ou du silence");
                require(Arrays.equals(original,tone),"Renfort Estelle : modification du PCM source en cache");
                double gain=rms(wet,rate/4)/rms(dry,rate/4);
                require(hz==3000?Math.abs(gain-1.05)<.001:Math.abs(gain-1)<.005,"Renfort Estelle à "+hz+" Hz : "+gain);
            }
        }
    }

    private static void estelleProjection(Refs refs,JSONObject lex)throws Exception {
        int rate=24000;float[] input=new float[rate*2];
        for(int i=0;i<input.length;i++){
            double level=i<rate*3/4?.30:i<rate*5/4?.002:.055;
            input[i]=(float)(level*Math.sin(2*Math.PI*220*i/rate));
        }
        var baseline=SpeechPlan.plan("Je suis prête.","fr",lex,true);
        var projected=SpeechPlan.plan("Je suis prête.","fr",lex,true);
        File dir=refs.context.getCacheDir();
        try(Pcm dry=VoiceRender.render(dir,null,null,baseline,rate,28,VoiceRender.Profile.ESTELLE_PRESENCE,s->input,(n,total)->{}).pcm;
            Pcm wet=VoiceRender.render(dir,null,null,projected,rate,28,VoiceRender.Profile.ESTELLE,s->input,(n,total)->{}).pcm){
            var a=baseline.get(0).original;var b=projected.get(0).original;
            require(dry.frames==wet.frames&&a.speechEnd==b.speechEnd&&a.to==b.to&&b.to-b.speechEnd==320
                &&DeviceChecks.pcmPeak(wet,b.speechEnd+1,b.to-1)==0,"Projection Estelle : pauses ou chronologie modifiées");
            int strong=rate/4,background=rate*7/8,soft=rate*3/2;
            require(Math.abs(rms(wet,strong)/rms(dry,strong)-1.18)<.002,"Projection Estelle : syllabe forte");
            require(Math.abs(rms(wet,background)/rms(dry,background)-1)<.002,"Projection Estelle : fond amplifié");
            double lift=rms(wet,soft)/rms(dry,soft);
            require(lift>1.27&&lift<=1.301,"Projection Estelle : la finale faible doit recevoir plus d’appui : "+lift);
        }
    }

    private static double rms(Pcm pcm,int from)throws Exception {
        short[] buffer=new short[pcm.rate/4];
        int n=pcm.read(from,buffer,buffer.length);require(n==buffer.length,"Fenêtre de mesure PCM incomplète");
        double sum=0;for(short value:buffer)sum+=(double)value*value;
        return Math.sqrt(sum/n);
    }

    static void estelleComparison(Refs refs,Hd.Synthesis after,int cps,VoiceRender.Renderer raw)throws Exception {
        var plan=SpeechPlan.plan(SAMPLE,"fr",Refs.object(refs.json("prononciation.json"),"fr"),true);
        // Reassemble the very same model output as #58 would, with presence but without projection.
        var before=VoiceRender.render(refs.context.getCacheDir(),null,null,plan,Pocket.RATE,cps,
            VoiceRender.Profile.ESTELLE_PRESENCE,raw,(n,total)->{});
        try(Pcm old=before.pcm){
            require(old.frames==after.pcm.frames&&before.segments.size()==after.segments.size(),"Durée du comparatif Estelle");
            for(int i=0;i<before.segments.size();i++){
                var a=before.segments.get(i);var b=after.segments.get(i);
                require(a.from==b.from&&a.speechEnd==b.speechEnd&&a.to==b.to&&a.text.equals(b.text),"Repère modifié dans le comparatif Estelle");
            }
            sample(refs,"02-estelle-avant",old);
            sample(refs,"03-estelle-projetee",after.pcm);
        }
    }

    static void sample(Refs refs,String name,Pcm audio)throws Exception {
        File dir=refs.context.getExternalFilesDir("verification");
        Files.write(new File(dir,"voix-texte.txt").toPath(),(SAMPLE+"\n").getBytes(StandardCharsets.UTF_8));
        // Transfer as opaque test data, not as an audio item in Android's shared storage.
        File sample=new File(dir,"voix-"+name+".bin");
        try(OutputStream out=Files.newOutputStream(sample.toPath())){Files.copy(audio.file.toPath(),out);}
        require(Pcm.mono16Frames(sample,audio.rate)==audio.frames,"Copie de l’extrait vocal : "+name);
    }

    private static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
}
