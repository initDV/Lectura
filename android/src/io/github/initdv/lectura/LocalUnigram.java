package io.github.initdv.lectura;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The Estelle pack exports a SentencePiece unigram vocabulary with byte fallback. No native tokenizer. */
final class LocalUnigram {
    private static final char MARK='\u2581';
    private final Node root=new Node();
    private final int unknown;
    private final int[] bytes=new int[256];
    private float minimum=0;
    private static final class Node {
        final Map<Integer,Node> children=new HashMap<>();int id=-1;float score;
    }
    LocalUnigram(byte[] data)throws IOException {
        ByteBuffer model=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        Arrays.fill(bytes,-1);int unk=-1,id=0;
        while(model.hasRemaining()) {
            int key=varint(model);
            if(key!=10){skip(model,key);continue;}
            ByteBuffer entry=message(model);String piece="";float score=0;int type=1;
            while(entry.hasRemaining()) {
                key=varint(entry);
                if(key==10){ByteBuffer value=message(entry);byte[] b=new byte[value.remaining()];value.get(b);piece=new String(b,StandardCharsets.UTF_8);}
                else if(key==21)score=entry.getFloat();
                else if(key==24)type=varint(entry);
                else skip(entry,key);
            }
            if(!Float.isFinite(score)||piece.isEmpty()||piece.length()>128||id>=4500)throw new IOException("Vocabulaire Estelle invalide.");
            if(type==1||type==4) {
                Node node=root;for(int cp:piece.codePoints().toArray())node=node.children.computeIfAbsent(cp,x->new Node());
                node.id=id;node.score=score;minimum=Math.min(minimum,score);
            }else if(type==2)unk=id;
            else if(type==6&&piece.matches("<0x[0-9A-Fa-f]{2}>"))bytes[Integer.parseInt(piece.substring(3,5),16)]=id;
            id++;
        }
        unknown=unk;if(unknown<0||(id!=4000&&id!=4001)||!root.children.containsKey((int)MARK))throw new IOException("Vocabulaire Estelle inattendu.");
    }
    long[] encode(String text) {
        String normalized=Normalizer.normalize(text,Normalizer.Form.NFKC).trim().replaceAll("[\\s\\p{Z}]+"," ");
        int[] chars=(MARK+normalized.replace(' ',MARK)).codePoints().toArray();
        float[] score=new float[chars.length+1];Arrays.fill(score,Float.NEGATIVE_INFINITY);score[0]=0;
        int[] previous=new int[score.length],id=new int[score.length];Arrays.fill(id,unknown);
        for(int i=0;i<chars.length;i++) {
            if(!Float.isFinite(score[i]))continue;
            Node node=root;boolean single=false;
            for(int j=i;j<chars.length;j++) {
                node=node.children.get(chars[j]);if(node==null)break;
                if(node.id<0)continue;if(j==i)single=true;
                float candidate=node.score+score[i];if(candidate>score[j+1]){score[j+1]=candidate;id[j+1]=node.id;previous[j+1]=i;}
            }
            float fallback=score[i]+minimum-10;
            if(!single&&fallback>score[i+1]){score[i+1]=fallback;id[i+1]=unknown;previous[i+1]=i;}
        }
        List<Long> tokens=new ArrayList<>();
        for(int i=chars.length;i>0;i=previous[i]) {
            if(id[i]==unknown) {
                byte[] utf8=new String(Character.toChars(chars[previous[i]])).getBytes(StandardCharsets.UTF_8);
                if(bytes[utf8[0]&255]<0)tokens.add((long)unknown);
                else for(int j=utf8.length-1;j>=0;j--)tokens.add((long)bytes[utf8[j]&255]);
            }else tokens.add((long)id[i]);
        }
        long[] out=new long[tokens.size()];for(int i=0;i<out.length;i++)out[i]=tokens.get(out.length-i-1);return out;
    }
    private static int varint(ByteBuffer b)throws IOException {
        int v=0;for(int s=0;s<=28&&b.hasRemaining();s+=7){int c=b.get()&255;v|=(c&127)<<s;if((c&128)==0)return v;}
        throw new IOException("Vocabulaire protobuf tronqué.");
    }
    private static ByteBuffer message(ByteBuffer b)throws IOException {
        int n=varint(b);if(n<0||n>b.remaining())throw new IOException("Taille du vocabulaire incorrecte.");
        ByteBuffer part=b.slice().order(ByteOrder.LITTLE_ENDIAN);part.limit(n);b.position(b.position()+n);return part;
    }
    private static void skip(ByteBuffer b,int key)throws IOException {
        switch(key&7) {
            case 0: varint(b);break;
            case 1: b.getLong();break;
            case 2: message(b);break;
            case 5: b.getInt();break;
            default: throw new IOException("Champ protobuf inconnu.");
        }
    }
}
