package io.github.initdv.lectura;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import mp3.BitStream;
import mp3.GainAnalysis;
import mp3.ID3Tag;
import mp3.Lame;
import mp3.LameGlobalFlags;
import mp3.MPEGMode;
import mp3.Presets;
import mp3.Quantize;
import mp3.QuantizePVT;
import mp3.Reservoir;
import mp3.Takehiro;
import mp3.VBRTag;
import mp3.Version;
import mpg.Common;
import mpg.Interface;
import mpg.MPGLib;

/** Narrow PCM adapter to the original Java LAME port used to produce lamejs. */
final class Mp3 {
    static void transcode(File media,File file,File tmp)throws IOException {
        try(Pcm pcm=Pcm.decode(media,tmp);FileOutputStream out=new FileOutputStream(file)){
            Lame lame=new Lame();GainAnalysis ga=new GainAnalysis();BitStream bs=new BitStream();Presets p=new Presets();QuantizePVT qvt=new QuantizePVT();
            Quantize q=new Quantize();VBRTag vbr=new VBRTag();Version ver=new Version();ID3Tag tags=new ID3Tag();Reservoir rv=new Reservoir();Takehiro tak=new Takehiro();
            MPGLib mpg=new MPGLib();Interface inter=new Interface();Common common=new Common();mpg.setModules(inter,common);inter.setModules(vbr,common);
            lame.setModules(ga,bs,p,qvt,q,vbr,ver,tags,mpg);bs.setModules(ga,mpg,ver,vbr);tags.setModules(bs,ver);p.setModules(lame);
            q.setModules(bs,rv,qvt,tak);qvt.setModules(tak,rv,lame.enc.psy);rv.setModules(bs);tak.setModules(qvt);vbr.setModules(lame,bs,ver);
            LameGlobalFlags cfg=lame.lame_init();cfg.num_channels=pcm.channels;cfg.in_samplerate=pcm.rate;cfg.brate=pcm.channels==2?192:128;
            cfg.mode=pcm.channels==1?MPEGMode.MONO:MPEGMode.STEREO;cfg.quality=3;cfg.bWriteVbrTag=false;cfg.disable_reservoir=true;cfg.write_id3tag_automatic=false;
            if(lame.lame_init_params(cfg)!=0)throw new IOException("Paramètres MP3 non pris en charge.");
            try{
                int block=1152;short[] pcmBuffer=new short[block*pcm.channels];int[] left=new int[block],right=new int[block];byte[] buffer=new byte[1_440+7_200];
                for(long i=0;i<pcm.frames;){Pcm.interrupted();int n=pcm.read(i,pcmBuffer,block);if(n<=0)break;
                    for(int k=0;k<n;k++){left[k]=pcmBuffer[k*pcm.channels];right[k]=pcmBuffer[k*pcm.channels+pcm.channels-1];}
                    write(out,buffer,lame.lame_encode_buffer_int(cfg,left,right,n,buffer,0,buffer.length));i+=n;
                }
                write(out,buffer,lame.lame_encode_flush(cfg,buffer,0,buffer.length));
            }finally{lame.lame_close(cfg);}
        }
    }
    private static void write(FileOutputStream file,byte[] b,int n)throws IOException{if(n<0)throw new IOException("LAME : "+n);file.write(b,0,n);}
}
