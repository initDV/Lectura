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
        return "Clauses, question, pauses, texte et curseurs ; ɲ ≠ nj, liaison et ɥ dans les entrées Kokoro ; consonnes faibles conservées, Piper inchangé";
    }

    private static void quietEdges(Refs refs,JSONObject lex)throws Exception {
        int rate=24000,start=2400,end=12000,quiet=600;float[] input=new float[rate];
        for(int i=start-quiet;i<end+quiet;i++)input[i]=(i%2==0?1:-1)*(i>=start&&i<end?.4f:.001f);
        int[] span=VoiceRender.audible(input,rate);
        require(span[0]>start-quiet&&span[1]<end+quiet,"Le seuil de référence doit rogner les bords faibles de la fixture");
        for(var profile:List.of(VoiceRender.Profile.ESTELLE,VoiceRender.Profile.KOKORO)){
            var plan=SpeechPlan.plan("Chut.","fr",lex,true);
            try(Pcm wav=VoiceRender.render(refs.context.getCacheDir(),null,null,plan,rate,28,profile,s->input,(n,total)->{}).pcm){
                var p=plan.get(0).original;
                require(p.speechEnd==450&&p.to-p.speechEnd==320,"Bords faibles ou marge temporelle "+profile);
                require(DeviceChecks.pcmPeak(wav,4,20)>0&&DeviceChecks.pcmPeak(wav,430,446)>0
                    &&DeviceChecks.pcmPeak(wav,451,769)==0,"Bords perdus ou silence non nul "+profile);
            }
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
