package io.github.initdv.lectura;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.CancellationException;

/** Decode native media to a bounded, file-backed PCM stream (not a waveform estimate). */
final class Pcm implements AutoCloseable {
    static final long MAX_BYTES=512L*1024*1024;
    final File file; final int channels,rate; final long frames;
    private final boolean temporary;
    private final RandomAccessFile reader;
    private byte[] bytes=new byte[0];
    Pcm(File f,int ch,int rate,long frames,boolean temporary) throws IOException {
        file=f;channels=ch;this.rate=rate;this.frames=frames;this.temporary=temporary;reader=new RandomAccessFile(file,"r");
    }
    double duration(){return frames*1000.0/rate;}
    static void interrupted(){if(Thread.currentThread().isInterrupted())throw new CancellationException();}
    static Pcm decode(File source,File cache) throws IOException {
        MediaExtractor ex=new MediaExtractor();MediaCodec dec=null;
        File file=File.createTempFile("lecture-",".wav",cache);boolean ok=false;
        try(RandomAccessFile out=new RandomAccessFile(file,"rw")){
            ex.setDataSource(source.getPath());MediaFormat format=null;
            for(int i=0;i<ex.getTrackCount();i++){
                MediaFormat f=ex.getTrackFormat(i);String mime=f.getString(MediaFormat.KEY_MIME);
                if(mime!=null&&mime.startsWith("audio/")){format=f;ex.selectTrack(i);break;}
            }
            if(format==null)throw new IOException("Aucune piste audio lisible.");
            boolean raw="audio/raw".equals(format.getString(MediaFormat.KEY_MIME));
            if(!raw){dec=MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));dec.configure(format,null,null,0);dec.start();}
            out.seek(44);int channels=format.getInteger(MediaFormat.KEY_CHANNEL_COUNT),rate=format.getInteger(MediaFormat.KEY_SAMPLE_RATE),encoding=format.getInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);
            int finalChannels=channels==1?1:2; PcmWriter writer=new PcmWriter(out);
            boolean done=false,queued=false;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            if(raw){ByteBuffer buffer=ByteBuffer.allocate(256*1024);while(true){interrupted();buffer.clear();int n=ex.readSampleData(buffer,0);if(n<0)break;
                buffer.position(0).limit(n);writer.append(buffer,channels,encoding);ex.advance();}}
            else {long active=android.os.SystemClock.elapsedRealtime();while(!done){
                interrupted();if(!queued){int i=dec.dequeueInputBuffer(5000);if(i>=0){ByteBuffer b=dec.getInputBuffer(i);if(b==null)throw new IOException("Décodeur audio indisponible.");
                    b.clear();int n=ex.readSampleData(b,0);if(n<0){queued=true;dec.queueInputBuffer(i,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);}else{dec.queueInputBuffer(i,0,n,ex.getSampleTime(),0);ex.advance();}active=android.os.SystemClock.elapsedRealtime();}}
                int i=dec.dequeueOutputBuffer(info,5000);
                if(i==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){MediaFormat f=dec.getOutputFormat();rate=f.getInteger(MediaFormat.KEY_SAMPLE_RATE);channels=f.getInteger(MediaFormat.KEY_CHANNEL_COUNT);finalChannels=channels==1?1:2;encoding=f.getInteger(MediaFormat.KEY_PCM_ENCODING,AudioFormat.ENCODING_PCM_16BIT);}
                else if(i>=0){try{ByteBuffer b=dec.getOutputBuffer(i);if(b!=null&&info.size>0){b.position(info.offset).limit(info.offset+info.size);writer.append(b,channels,encoding);}done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;active=android.os.SystemClock.elapsedRealtime();}finally{dec.releaseOutputBuffer(i,false);}}
                else if(android.os.SystemClock.elapsedRealtime()-active>8000)throw new IOException("Le décodeur audio ne répond pas.");
            }}
            long data=out.length()-44;if(data<=0||rate<=0)throw new IOException("Le fichier audio est vide.");
            header(out,finalChannels,rate,data);Pcm p=new Pcm(file,finalChannels,rate,data/(2L*finalChannels),true);ok=true;return p;
        }finally{ex.release();if(dec!=null)dec.release();if(!ok)file.delete();}
    }
    private static final class PcmWriter {
        final RandomAccessFile out;byte[] bytes=new byte[0];
        PcmWriter(RandomAccessFile o){out=o;}
        void append(ByteBuffer b,int channels,int encoding)throws IOException{
            if(channels<1)throw new IOException("Piste audio invalide.");
            b.order(ByteOrder.LITTLE_ENDIAN);int stride=encoding==AudioFormat.ENCODING_PCM_FLOAT||encoding==AudioFormat.ENCODING_PCM_32BIT?4:encoding==AudioFormat.ENCODING_PCM_24BIT_PACKED?3:encoding==AudioFormat.ENCODING_PCM_8BIT?1:2;
            int frames=b.remaining()/(channels*stride),dst=channels==1?1:2,n=frames*dst*2;
            if(out.getFilePointer()+n>MAX_BYTES)throw new IOException("Fichier audio décodé trop volumineux.");
            if(bytes.length<n)bytes=new byte[n];
            if(encoding==AudioFormat.ENCODING_PCM_16BIT&&channels<=2)b.get(bytes,0,n);
            else {int p=0;for(int k=0;k<frames;k++){
                for(int j=0;j<channels;j++){
                    short value;
                    if(stride==1)value=(short)(((b.get()&255)-128)*256);
                    else if(stride==3){b.get();value=b.getShort();}
                    else if(encoding==AudioFormat.ENCODING_PCM_FLOAT)value=sample(b.getFloat());
                    else if(stride==4)value=(short)(b.getInt()>>16);else value=b.getShort();
                    if(j<dst){bytes[p++]=(byte)value;bytes[p++]=(byte)(value>>8);}
                }
            }}
            out.write(bytes,0,n);
        }
    }
    static short sample(float x){return (short)Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767));}
    static void header(RandomAccessFile out,int ch,int rate,long data)throws IOException{
        ByteBuffer h=ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.putInt(0x46464952).putInt((int)data+36).putInt(0x45564157).putInt(0x20746d66).putInt(16).putShort((short)1).putShort((short)ch);
        h.putInt(rate).putInt(rate*ch*2).putShort((short)(ch*2)).putShort((short)16).putInt(0x61746164).putInt((int)data);
        out.seek(0);out.write(h.array());
    }
    synchronized int read(long start,short[] out,int frameCount)throws IOException{
        int n=(int)Math.max(0,Math.min(frameCount,frames-start));int len=n*2*channels;
        if(n==0)return 0;if(bytes.length<len)bytes=new byte[len];reader.seek(44+2L*channels*Math.max(0,start));reader.readFully(bytes,0,len);
        for(int i=0;i<len;i+=2)out[i/2]=(short)((bytes[i]&255)|(bytes[i+1]<<8));return n;
    }
    @Override public synchronized void close() {try{reader.close();}catch(IOException ignored){}if(temporary)file.delete();}
}

/** Web Audio AnalyserNode's 1024-sample RMS, frequency magnitudes and hysteresis. */
final class Lip {
    private static final int N=1024;
    private final Pcm pcm; private final short[] samples;
    private final double[] real=new double[N],imag=new double[N],freq=new double[N/2],window=new double[N];
    private double env,peak=.05; private int level;
    int shape=48;
    Lip(Pcm p){pcm=p;samples=new short[N*p.channels];for(int i=0;i<N;i++)window[i]=.42-.5*Math.cos(2*Math.PI*i/N)+.08*Math.cos(4*Math.PI*i/N);}
    void reset(){env=0;level=0;}
    int read(double ms,boolean pro){
        // AnalyserNode reads the latest samples, never the samples after the current playhead.
        long end=Math.min(pcm.frames,Math.max(0,(long)(ms*pcm.rate/1000))),start=Math.max(0,end-N);
        int count=(int)(end-start),prefix=N-count,n=0;
        try{n=pcm.read(start,samples,count);}catch(IOException ignored){}
        double sum=0;for(int i=0;i<N;i++){
            int sample=i-prefix;
            double a=sample<0||sample>=n?0:pcm.channels==1?samples[sample]/32768.:(samples[sample*2]+samples[sample*2+1])/65536.;
            double x=Math.max(-128,Math.min(127,Math.floor(a*128)))/128;sum+=x*x;
            if(pro){int j=Integer.reverse(i)>>>22;real[j]=a*window[i];imag[j]=0;}
        }
        double rms=Math.sqrt(sum/N);env=rms>env?rms:env*.85+rms*.15;peak=Math.max(.03,Math.max(env,peak*.9995));double x=env/peak;
        while(level<3&&x>(level==0?.12:level==1?.40:.70))level++;
        while(level>0&&x<(level==1?.08:level==2?.34:.64))level--;
        shape=48;if(pro)bands();return level;
    }
    private void bands(){
        for(int l=2;l<=N;l*=2){double angle=-2*Math.PI/l,c=Math.cos(angle),s=Math.sin(angle);
            for(int k=0;k<N;k+=l){double u=1,v=0;for(int j=k;j<k+l/2;j++){
                int b=j+l/2;double r=real[b]*u-imag[b]*v,i=imag[b]*u+real[b]*v;
                real[b]=real[j]-r;imag[b]=imag[j]-i;real[j]+=r;imag[j]+=i;double t=u*c-v*s;v=u*s+v*c;u=t;
            }}
        }
        double low=0,mid=0,high=0;int nl=0,nm=0,nh=0;
        for(int k=1;k<N/2;k++){double f=k*pcm.rate/(double)N;
            if(f>=6000)break;double m=freq[k]=freq[k]*.6+.4*Math.hypot(real[k],imag[k])/N;
            double v=Math.floor(255*Math.max(0,Math.min(1,(20*Math.log10(m)+100)/70)))/255;
            if(f<500){low+=v;nl++;}else if(f<2000){mid+=v;nm++;}else {high+=v;nh++;}
        }
        low/=Math.max(1,nl);mid/=Math.max(1,nm);high/=Math.max(1,nh);
        if(high>.18&&high>mid*1.15&&high>low*.9)shape=58;else if(low>.3&&low>mid*1.6&&high<.08)shape=32;
    }
}
