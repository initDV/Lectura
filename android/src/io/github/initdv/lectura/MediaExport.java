package io.github.initdv.lectura;

import android.graphics.Bitmap;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLExt;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.os.SystemClock;
import android.view.Surface;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;

/** Actual H.264/AAC and VP8/VP9/Opus containers, using only Android codecs. */
final class MediaExport {
    private static final String AVC=MediaFormat.MIMETYPE_VIDEO_AVC,VP8=MediaFormat.MIMETYPE_VIDEO_VP8,VP9=MediaFormat.MIMETYPE_VIDEO_VP9,
        AAC=MediaFormat.MIMETYPE_AUDIO_AAC,OPUS=MediaFormat.MIMETYPE_AUDIO_OPUS;
    static final class Format {
        final String video,audio,ext,mime;
        final int container;
        String videoCodec,audioCodec;
        Format(String video,boolean webm){this.video=video;audio=webm?OPUS:AAC;ext=webm?"webm":"mp4";mime="video/"+ext;
            container=webm?MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM:MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4;}
    }
    static List<Format> available(int w,int h,boolean audio,int channels,int rate){
        List<Format> out=new ArrayList<>();MediaCodecList codecs=new MediaCodecList(MediaCodecList.REGULAR_CODECS);
        for(String id:new String[]{AVC,VP9,VP8}){
            Format f=new Format(id,!id.equals(AVC));try{
                f.videoCodec=codecs.findEncoderForFormat(video(f,w,h,true));if(audio)f.audioCodec=codecs.findEncoderForFormat(audio(f,channels,rate));
                if(f.videoCodec!=null&&(!audio||f.audioCodec!=null))out.add(f);
            }catch(IllegalArgumentException ignored){}
        }
        return out;
    }
    private static MediaFormat video(Format f,int w,int h,boolean surface){
        MediaFormat m=MediaFormat.createVideoFormat(f.video,w,h);m.setInteger(MediaFormat.KEY_COLOR_FORMAT,surface?MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface:MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible);
        m.setInteger(MediaFormat.KEY_FRAME_RATE,30);m.setInteger(MediaFormat.KEY_BIT_RATE,1_200_000);m.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,2);
        m.setInteger(MediaFormat.KEY_COLOR_RANGE,MediaFormat.COLOR_RANGE_LIMITED);m.setInteger(MediaFormat.KEY_COLOR_STANDARD,MediaFormat.COLOR_STANDARD_BT709);
        m.setInteger(MediaFormat.KEY_COLOR_TRANSFER,MediaFormat.COLOR_TRANSFER_SDR_VIDEO);
        // Keeping B-frames disabled avoids reordered presentation timestamps in the muxer.
        if(f.video.equals(AVC))m.setInteger(MediaFormat.KEY_PROFILE,MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);
        return m;
    }
    private static int sampleRate(Format f,int rate){return f.audio.equals(OPUS)||rate>48000||rate<8000?48000:rate;}
    private static MediaFormat audio(Format f,int ch,int rate){
        MediaFormat m=MediaFormat.createAudioFormat(f.audio,sampleRate(f,rate),ch);
        m.setInteger(MediaFormat.KEY_BIT_RATE,ch==2?160000:96000);m.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE,16384);
        if(f.audio.equals(AAC))m.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        return m;
    }
    static final class Frame {
        final Bitmap image;final long us;
        Frame(Bitmap b,long t){image=b;us=t;}
    }
    /** Timed slices from the audio-only clock. The listening gain and mute are intentionally not copied. */
    static final class Mark {
        final long us;final double sourceMs,rate;final boolean playing;
        Mark(long us,double sourceMs,double rate,boolean playing){this.us=us;this.sourceMs=sourceMs;this.rate=rate;this.playing=playing;}
    }
    static final class Recording {
        final int w,h;final File dir;final Pcm sound;
        private Frame next;
        private boolean writing,stopped,cancelled,begun;
        private long stopAt;
        private final ArrayList<Mark> marks=new ArrayList<>();
        Recording(int w,int h,File dir,Pcm sound)throws IOException{
            this.w=w;this.h=h;this.dir=dir;this.sound=sound==null?null:new Pcm(sound.file,sound.channels,sound.rate,sound.frames,false);
        }
        synchronized boolean room(){return !stopped&&!cancelled&&!writing&&next==null;}
        synchronized void offer(Bitmap b,long us){if(!room()){b.recycle();return;}next=new Frame(b,us);notifyAll();}
        synchronized void mark(Mark mark){if(!stopped&&!cancelled&&sound!=null)marks.add(mark);}
        synchronized void end(long us){stopped=true;stopAt=us;notifyAll();}
        synchronized void cancel(){
            if(cancelled)return;cancelled=true;if(next!=null){next.image.recycle();next=null;}
            if(!begun&&sound!=null)sound.close();notifyAll();
        }
        synchronized void check(){if(cancelled||Thread.currentThread().isInterrupted())throw new CancellationException();}
        private synchronized Frame take()throws InterruptedException {while(!stopped&&!cancelled&&next==null)wait(100);check();Frame f=next;next=null;writing=f!=null;return f;}
        private synchronized void taken(){writing=false;}
        File run(String forcedExt,Runnable started)throws Exception {
            synchronized(this){check();begun=true;}
            File video=null,audio=null,merged=null,finalFile=null;
            try{
                List<Format> choices=available(w,h,sound!=null,sound==null?1:sound.channels,sound==null?48000:sound.rate);
                Format f=null;VideoEncoder encoder=null;Exception error=null;
                for(Format candidate:choices){if(forcedExt!=null&&!candidate.ext.equals(forcedExt))continue;
                    video=File.createTempFile("lecture-video-","."+candidate.ext,dir);
                    try{encoder=new VideoEncoder(candidate,w,h,video);f=candidate;break;}
                    catch(Exception e){error=e;video.delete();video=null;}}
                if(encoder==null)throw new IOException("Aucun encodeur vidéo utilisable à cette résolution.",error);
                long last=0;int n=0;
                try(VideoEncoder destination=encoder){
                    started.run();
                    while(true){Frame frame=take();if(frame==null)break;
                        try{destination.write(frame);n++;last=frame.us;}finally{frame.image.recycle();taken();}
                    }
                    if(n==0)throw new IOException("Enregistrement vide.");
                    destination.end();
                }
                check();long length=Math.max(last+33333,stopAt);
                if(sound!=null){audio=File.createTempFile("lecture-audio-","."+(f.ext.equals("webm")?"webm":"m4a"),dir);encodeAudio(f,sound,length,new ArrayList<>(marks),audio);
                    merged=File.createTempFile("lectura-","."+f.ext,dir);join(f,video,audio,merged);
                }else{merged=video;video=null;}
                if(f.ext.equals("mp4"))fastStart(merged);
                verify(merged,f,w,h,sound!=null);finalFile=merged;return finalFile;
            }finally{
                cancel();if(sound!=null)sound.close();if(video!=null)video.delete();if(audio!=null)audio.delete();if(merged!=null&&merged!=finalFile)merged.delete();
            }
        }
    }
    private static final class VideoEncoder implements AutoCloseable {
        MediaCodec codec;
        Surface window;
        Egl egl;
        Track output;
        VideoEncoder(Format f,int w,int h,File file)throws Exception {
            try {
                codec=MediaCodec.createByCodecName(f.videoCodec);codec.configure(video(f,w,h,true),null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);
                window=codec.createInputSurface();egl=new Egl(window,w,h);codec.start();output=new Track(file,f.container);
            }catch(Exception e){close();throw e;}
        }
        void write(Frame frame)throws IOException{
            output.drain(codec,0);egl.blit(frame.image,frame.us);output.drain(codec,0);
        }
        void end()throws IOException {codec.signalEndOfInputStream();output.untilEnd(codec);output.finish();}
        @Override public void close(){
            if(output!=null)output.close();if(egl!=null)egl.close();if(window!=null)window.release();if(codec!=null)codec.release();
        }
    }
    private static final class Track implements AutoCloseable {
        final MediaMuxer muxer;final MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();int track=-1;
        boolean done,started;
        Track(File file,int format)throws IOException{muxer=new MediaMuxer(file.getPath(),format);}
        boolean drain(MediaCodec codec,long wait)throws IOException{
            boolean active=false;
            while(true){Pcm.interrupted();int index=codec.dequeueOutputBuffer(info,wait);if(index==MediaCodec.INFO_TRY_AGAIN_LATER)return active;
                active=true;wait=0;
                if(index==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){if(track>=0)throw new IOException("Le format de l'encodeur a changé.");
                    track=muxer.addTrack(codec.getOutputFormat());muxer.start();started=true;}
                else if(index>=0){
                    try{if(info.size>0&&(info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0){
                        ByteBuffer b=codec.getOutputBuffer(index);if(!started||b==null)throw new IOException("Piste non initialisée.");
                        b.position(info.offset).limit(info.offset+info.size);muxer.writeSampleData(track,b,info);}
                        if((info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0){done=true;return true;}
                    }finally{codec.releaseOutputBuffer(index,false);}
                }
            }
        }
        void untilEnd(MediaCodec codec)throws IOException{
            long time=SystemClock.elapsedRealtime();while(!done){if(drain(codec,20000))time=SystemClock.elapsedRealtime();if(SystemClock.elapsedRealtime()-time>8000)throw new IOException("L'encodeur ne répond plus.");}
        }
        void finish()throws IOException{if(!started)throw new IOException("Aucune piste encodée.");muxer.stop();started=false;}
        @Override public void close(){if(started)try{muxer.stop();}catch(Exception ignored){}muxer.release();}
    }
    private static void encodeAudio(Format f,Pcm sound,long us,List<Mark> marks,File out)throws IOException {
        int rate=sampleRate(f,sound.rate);long total=Math.max(1,Math.round(us*rate/1_000_000.));
        MediaCodec codec=MediaCodec.createByCodecName(f.audioCodec);
        try(Track track=new Track(out,f.container)){
            codec.configure(audio(f,sound.channels,sound.rate),null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();
            AudioMix mix=new AudioMix(sound,rate,marks);long clock=SystemClock.elapsedRealtime();long at=0;
            while(at<total){Pcm.interrupted();int index=codec.dequeueInputBuffer(10000);
                if(index>=0){ByteBuffer b=codec.getInputBuffer(index);if(b==null)throw new IOException("Encodeur audio indisponible.");b.clear();b.order(ByteOrder.LITTLE_ENDIAN);
                    int n=(int)Math.min(total-at,Math.min(1024,b.remaining()/(sound.channels*2)));mix.fill(at,n,b);
                    codec.queueInputBuffer(index,0,n*sound.channels*2,at*1_000_000/rate,0);at+=n;clock=SystemClock.elapsedRealtime();
                }
                track.drain(codec,0);if(SystemClock.elapsedRealtime()-clock>8000)throw new IOException("L’encodeur audio ne répond plus.");
            }
            int index;clock=SystemClock.elapsedRealtime();while((index=codec.dequeueInputBuffer(10000))<0){track.drain(codec,0);if(SystemClock.elapsedRealtime()-clock>8000)throw new IOException("Piste audio incomplète.");}
            codec.queueInputBuffer(index,0,0,at*1_000_000/rate,MediaCodec.BUFFER_FLAG_END_OF_STREAM);
            track.untilEnd(codec);track.finish();
        }finally{codec.release();}
    }
    /** Overlap-aligned 20 ms grains at non-unit playback speeds; at unit speed samples map directly. */
    private static final class AudioMix {
        final Pcm sound;final int rate,hop,ch;final List<Mark> marks;
        int span=-1;long spanFrame;double first,grain=-1,old=-1;long block=-1;
        long cacheStart=-1;int count;final short[] cache;
        AudioMix(Pcm sound,int rate,List<Mark> marks){this.sound=sound;this.rate=rate;this.marks=marks;ch=sound.channels;hop=rate/50;cache=new short[16384*ch];}
        void fill(long offset,int n,ByteBuffer target)throws IOException{
            for(long i=offset;i<offset+n;i++){
                long us=i*1_000_000/rate;int before=span;while(span+1<marks.size()&&marks.get(span+1).us<=us)span++;
                Mark m=span<0?null:marks.get(span);if(m==null||!m.playing){for(int k=0;k<ch;k++)target.putShort((short)0);continue;}
                if(span!=before){spanFrame=(m.us*rate+999999)/1_000_000;first=m.sourceMs*sound.rate/1000;block=-1;old=-1;}
                double srcStep=sound.rate/(double)rate;long local=Math.max(0,i-spanFrame);
                if(Math.abs(m.rate-1)<.001){for(int k=0;k<ch;k++)target.putShort(sample(first+local*srcStep,k));continue;}
                long pos=local/hop;int within=(int)(local%hop);
                if(pos!=block){
                    old=grain;double wanted=first+pos*hop*srcStep*m.rate;grain=wanted;
                    if(block>=0){double best=-2;int search=sound.rate/200,step=Math.max(1,sound.rate/4000);
                        for(int s=-search;s<=search;s+=3*step){double dot=0,aa=1,bb=1;
                            for(int q=0;q<hop;q+=5*step){double x=sample(old+(hop+q)*srcStep,0),y=sample(wanted+s+q*srcStep,0);dot+=x*y;aa+=x*x;bb+=y*y;}
                            double score=dot/Math.sqrt(aa*bb)-.01*Math.abs(s)/(search+1);if(score>best){best=score;grain=wanted+s;}
                        }
                    }
                    block=pos;
                }
                for(int k=0;k<ch;k++){short x=sample(grain+within*srcStep,k);double t=within/(double)hop;
                    target.putShort(old<0?(short)(x*t):(short)Math.round(sample(old+(hop+within)*srcStep,k)*(1-t)+x*t));}
            }
        }
        private short sample(double at,int channel)throws IOException{
            long i=(long)Math.floor(at);if(i<0||i>=sound.frames)return 0;
            if(i<cacheStart||i+1>=cacheStart+count){cacheStart=Math.max(0,i-4096);count=sound.read(cacheStart,cache,cache.length/ch);}
            int index=(int)((i-cacheStart)*ch+channel);short a=cache[index],b=i+1<sound.frames?cache[index+ch]:0;return (short)Math.round(a+(b-a)*(at-i));
        }
    }
    private static void join(Format f,File video,File audio,File out)throws IOException{
        MediaExtractor v=new MediaExtractor(),a=new MediaExtractor();MediaMuxer m=null;boolean started=false;
        try{
            v.setDataSource(video.getPath());a.setDataSource(audio.getPath());
            if(v.getTrackCount()!=1||a.getTrackCount()!=1)throw new IOException("Pistes vidéo/audio incomplètes.");
            v.selectTrack(0);a.selectTrack(0);m=new MediaMuxer(out.getPath(),f.container);int vt=m.addTrack(v.getTrackFormat(0)),at=m.addTrack(a.getTrackFormat(0));m.start();started=true;
            ByteBuffer buf=ByteBuffer.allocateDirect(2*1024*1024);MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            while(v.getSampleTime()>=0||a.getSampleTime()>=0){
                Pcm.interrupted();boolean fromVideo=a.getSampleTime()<0||v.getSampleTime()>=0&&v.getSampleTime()<=a.getSampleTime();MediaExtractor src=fromVideo?v:a;
                buf.clear();long size=src.getSampleSize();if(size>16*1024*1024)throw new IOException("Image encodée trop volumineuse.");if(size>buf.capacity())buf=ByteBuffer.allocateDirect((int)size);
                int got=src.readSampleData(buf,0);if(got<0)break;info.set(0,got,src.getSampleTime(),(src.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_SYNC)!=0?MediaCodec.BUFFER_FLAG_KEY_FRAME:0);
                m.writeSampleData(fromVideo?vt:at,buf,info);src.advance();
            }
            m.stop();started=false;
        }finally{if(m!=null){if(started)try{m.stop();}catch(Exception ignored){}m.release();}v.release();a.release();}
    }
    static String verify(File file,Format f,int w,int h,boolean withAudio)throws IOException {
        MediaExtractor ex=new MediaExtractor();try {
            ex.setDataSource(file.getPath());boolean video=false,audio=false;
            for(int i=0;i<ex.getTrackCount();i++){
                MediaFormat x=ex.getTrackFormat(i);if(f.video.equals(x.getString(MediaFormat.KEY_MIME))){video=x.getInteger(MediaFormat.KEY_WIDTH)==w&&x.getInteger(MediaFormat.KEY_HEIGHT)==h;}
                if(f.audio.equals(x.getString(MediaFormat.KEY_MIME)))audio=true;
            }
            if(!video||withAudio&&!audio)throw new IOException("Les pistes encodées ne correspondent pas au format demandé.");
        }finally{ex.release();}
        try(MediaMetadataRetriever r=new MediaMetadataRetriever()){
            r.setDataSource(file.getPath());String d=r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if(d==null||Long.parseLong(d)<=0)throw new IOException("La durée de la vidéo est illisible.");
            Bitmap frame=r.getFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if(frame==null)throw new IOException("La première image de la vidéo est illisible.");frame.recycle();
            return w+" × "+h+" · "+Refs.time(Long.parseLong(d));
        }
    }
    /** Move a generated MP4's moov ahead of mdat and relocate all chunk offsets. */
    private static void fastStart(File input)throws IOException {
        File result=File.createTempFile("faststart-",".mp4",input.getParentFile());boolean move=false;
        try(RandomAccessFile f=new RandomAccessFile(input,"r")){
            long moov=-1,head=0,mdat=-1,length=0;
            for(long n=0;n+8<=f.length();){f.seek(n);long s=f.readInt()&0xffffffffL;int kind=f.readInt();long header=8;
                if(s==1){s=f.readLong();header=16;}if(s==0)s=f.length()-n;if(s<header||s>f.length()-n)throw new IOException("Boîte MP4 invalide.");
                if(kind==four("ftyp"))head=n+s;else if(kind==four("mdat"))mdat=n;else if(kind==four("moov")){moov=n;length=s;}n+=s;
            }
            if(moov<0||mdat<0)throw new IOException("Index MP4 introuvable.");if(moov<mdat)return;
            if(length>32*1024*1024||head>mdat)throw new IOException("Index MP4 trop grand.");
            ByteBuffer b=ByteBuffer.allocate((int)length);f.seek(moov);f.readFully(b.array());fixOffsets(b,0,(int)length,head,moov,length);
            try(RandomAccessFile out=new RandomAccessFile(result,"rw")){copy(f,out,0,head);out.write(b.array());copy(f,out,head,moov-head);copy(f,out,moov+length,f.length()-moov-length);}move=true;
        }finally{if(!move)result.delete();}
        try{Files.move(result.toPath(),input.toPath(),StandardCopyOption.REPLACE_EXISTING);}finally{result.delete();}
    }
    private static void fixOffsets(ByteBuffer b,int a,int end,long head,long moov,long shift)throws IOException{
        for(int i=a;i+8<=end;){long n=b.getInt(i)&0xffffffffL;int kind=b.getInt(i+4),h=8;if(n==1){n=b.getLong(i+8);h=16;}if(n==0)n=end-i;
            if(n<h||n>end-i)throw new IOException("Index MP4 invalide.");int p=i+h;
            if(kind==four("moov")||kind==four("trak")||kind==four("mdia")||kind==four("minf")||kind==four("stbl"))fixOffsets(b,p,(int)(i+n),head,moov,shift);
            else if(kind==four("stco")||kind==four("co64")){
                int len=kind==four("stco")?4:8,count=b.getInt(p+4);if(count<0||count*(long)len>n-h-8)throw new IOException("Offsets MP4 invalides.");
                for(int j=0;j<count;j++){int k=p+8+j*len;long old=len==4?b.getInt(k)&0xffffffffL:b.getLong(k);
                    if(old>=head&&old<moov){long adjusted=old+shift;if(len==4){if(adjusted>0xffffffffL)throw new IOException("MP4 trop grand.");b.putInt(k,(int)adjusted);}else b.putLong(k,adjusted);}}
            }
            i+=n;
        }
    }
    private static int four(String s){return ByteBuffer.wrap(s.getBytes(StandardCharsets.US_ASCII)).getInt();}
    private static void copy(RandomAccessFile a,RandomAccessFile b,long offset,long size)throws IOException{
        a.seek(offset);byte[] bytes=new byte[65536];while(size>0){Pcm.interrupted();int n=(int)Math.min(size,bytes.length);a.readFully(bytes,0,n);b.write(bytes,0,n);size-=n;}
    }
    private static final class Egl implements AutoCloseable {
        private static final int EGL_RECORDABLE_ANDROID=0x3142;
        EGLDisplay display=EGL14.EGL_NO_DISPLAY;EGLContext context=EGL14.EGL_NO_CONTEXT;EGLSurface surface=EGL14.EGL_NO_SURFACE;
        final int width,height;
        final FloatBuffer vertex=ByteBuffer.allocateDirect(64).order(ByteOrder.nativeOrder()).asFloatBuffer();
        int program,tex,xy,uv;
        Egl(Surface target,int w,int h)throws IOException{
            width=w;height=h;
            try{
                display=EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);int[] ver=new int[2];req(EGL14.eglInitialize(display,ver,0,ver,1));
                int[] spec={EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT,EGL_RECORDABLE_ANDROID,1,EGL14.EGL_NONE};
                EGLConfig[] cfg=new EGLConfig[1];int[] n=new int[1];req(EGL14.eglChooseConfig(display,spec,0,cfg,0,1,n,0)&&n[0]==1);
                context=EGL14.eglCreateContext(display,cfg[0],EGL14.EGL_NO_CONTEXT,new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE},0);
                surface=EGL14.eglCreateWindowSurface(display,cfg[0],target,new int[]{EGL14.EGL_NONE},0);
                req(EGL14.eglMakeCurrent(display,surface,surface,context));
                int v=shader(GLES20.GL_VERTEX_SHADER,"attribute vec2 aPos;attribute vec2 aUv;varying vec2 uv;void main(){uv=aUv;gl_Position=vec4(aPos,0.0,1.0);}");
                int f=shader(GLES20.GL_FRAGMENT_SHADER,"precision mediump float;varying vec2 uv;uniform sampler2D img;void main(){gl_FragColor=texture2D(img,uv);}");
                program=GLES20.glCreateProgram();GLES20.glAttachShader(program,v);GLES20.glAttachShader(program,f);GLES20.glLinkProgram(program);
                int[] ok=new int[1];GLES20.glGetProgramiv(program,GLES20.GL_LINK_STATUS,ok,0);if(ok[0]==0)throw new IOException(GLES20.glGetProgramInfoLog(program));
                GLES20.glDeleteShader(v);GLES20.glDeleteShader(f);GLES20.glUseProgram(program);GLES20.glGenTextures(1,ok,0);tex=ok[0];
                xy=GLES20.glGetAttribLocation(program,"aPos");uv=GLES20.glGetAttribLocation(program,"aUv");
                GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,tex);GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_LINEAR);
                GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_S,GLES20.GL_CLAMP_TO_EDGE);GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_T,GLES20.GL_CLAMP_TO_EDGE);
                vertex.put(new float[]{-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0});
                GLES20.glEnableVertexAttribArray(xy);GLES20.glEnableVertexAttribArray(uv);
                vertex.position(0);GLES20.glVertexAttribPointer(xy,2,GLES20.GL_FLOAT,false,16,vertex);vertex.position(2);GLES20.glVertexAttribPointer(uv,2,GLES20.GL_FLOAT,false,16,vertex);
                GLES20.glViewport(0,0,w,h);
            }catch(Exception e){close();throw e;}
        }
        void blit(Bitmap b,long us)throws IOException {
            GLUtils.texImage2D(GLES20.GL_TEXTURE_2D,0,b,0);GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP,0,4);
            req(EGLExt.eglPresentationTimeANDROID(display,surface,us*1000));req(EGL14.eglSwapBuffers(display,surface));
        }
        private static int shader(int kind,String source)throws IOException{
            int shader=GLES20.glCreateShader(kind);GLES20.glShaderSource(shader,source);GLES20.glCompileShader(shader);int[] ok=new int[1];GLES20.glGetShaderiv(shader,GLES20.GL_COMPILE_STATUS,ok,0);
            if(ok[0]==0)throw new IOException(GLES20.glGetShaderInfoLog(shader));return shader;
        }
        private void req(boolean ok)throws IOException{if(!ok)throw new IOException("EGL : 0x"+Integer.toHexString(EGL14.eglGetError()));}
        @Override public void close(){if(display!=EGL14.EGL_NO_DISPLAY){
            EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT);
            if(surface!=EGL14.EGL_NO_SURFACE)EGL14.eglDestroySurface(display,surface);if(context!=EGL14.EGL_NO_CONTEXT)EGL14.eglDestroyContext(display,context);
            EGL14.eglReleaseThread();EGL14.eglTerminate(display);
        }}
    }
}
