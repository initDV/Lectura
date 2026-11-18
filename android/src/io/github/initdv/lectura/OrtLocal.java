package io.github.initdv.lectura;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Small binding to the Android ORT AAR; keeps the SDK-only compilation checkpoint usable. */
final class OrtLocal {
    private final Object env;
    private final Class<?> tensorType,optionsType;
    private final Method create,createFloat,createInt,info,run,open,output;
    private final Class<? extends Enum> valueTypes;
    OrtLocal()throws Exception {
        Class<?> environment=Class.forName("ai.onnxruntime.OrtEnvironment");
        tensorType=Class.forName("ai.onnxruntime.OnnxTensor");
        Class<?> session=Class.forName("ai.onnxruntime.OrtSession");
        optionsType=Class.forName("ai.onnxruntime.OrtSession$SessionOptions");
        valueTypes=Class.forName("ai.onnxruntime.OnnxJavaType").asSubclass(Enum.class);
        env=call(environment.getMethod("getEnvironment"),null);
        open=environment.getMethod("createSession",String.class,optionsType);
        create=tensorType.getMethod("createTensor",environment,ByteBuffer.class,long[].class,valueTypes);
        createFloat=tensorType.getMethod("createTensor",environment,FloatBuffer.class,long[].class);
        createInt=tensorType.getMethod("createTensor",environment,LongBuffer.class,long[].class);
        info=session.getMethod("getInputInfo");run=session.getMethod("run",Map.class);
        output=Class.forName("ai.onnxruntime.OrtSession$Result").getMethod("get",String.class);
    }
    static Object call(Method m,Object self,Object... args)throws Exception {
        try{return m.invoke(self,args);}catch(InvocationTargetException e){Throwable why=e.getCause();throw new IOException("ONNX : "+why.getMessage(),why);}
    }
    Session session(File path,int threads)throws Exception {return new Session(path,threads);}
    AutoCloseable floats(float[] data,long... shape)throws Exception{return (AutoCloseable)call(createFloat,null,env,FloatBuffer.wrap(data),shape);}
    AutoCloseable ints(long[] data,long... shape)throws Exception{return (AutoCloseable)call(createInt,null,env,LongBuffer.wrap(data),shape);}
    @SuppressWarnings({"unchecked","rawtypes"})
    AutoCloseable tensor(ByteBuffer data,long[] shape,String kind)throws Exception {
        return (AutoCloseable)call(create,null,env,data,shape,Enum.valueOf(valueTypes,kind));
    }
    float[] samples(Object tensor)throws Exception {
        FloatBuffer buffer=(FloatBuffer)call(tensorType.getMethod("getFloatBuffer"),tensor);
        if(buffer==null||buffer.remaining()>24000*90)throw new IOException("Tenseur audio inattendu.");
        float[] array=new float[buffer.remaining()];buffer.get(array);return array;
    }
    static ByteBuffer buffer(int size){return ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder());}
    static void dispose(AutoCloseable value){if(value!=null)try{value.close();}catch(Exception ignored){}}
    final class Session implements AutoCloseable {
        final AutoCloseable session;
        Session(File file,int threads)throws Exception {
            try(AutoCloseable opts=(AutoCloseable)optionsType.getConstructor().newInstance()) {
                call(optionsType.getMethod("setIntraOpNumThreads",int.class),opts,threads);
                call(optionsType.getMethod("setInterOpNumThreads",int.class),opts,1);
                // Avoid a second packed copy of the large inference weights and large arenas retained per session.
                call(optionsType.getMethod("addConfigEntry",String.class,String.class),opts,"session.disable_prepacking","1");
                call(optionsType.getMethod("setCPUArenaAllocator",boolean.class),opts,false);
                session=(AutoCloseable)call(open,env,file.getPath(),opts);
            }
        }
        Result run(Map<String,?> values)throws Exception {Pcm.interrupted();return new Result((AutoCloseable)call(run,session,values));}
        Map<String,Input> inputs()throws Exception {
            Map<String,Input> inputs=new LinkedHashMap<>();
            for(var e:((Map<?,?>)call(info,session)).entrySet()) {
                Object node=e.getValue(),tensor=call(node.getClass().getMethod("getInfo"),node);
                long[] shape=(long[])call(tensor.getClass().getMethod("getShape"),tensor);
                inputs.put((String)e.getKey(),new Input(shape,tensor.getClass().getField("type").get(tensor).toString()));
            }
            return inputs;
        }
        @Override public void close(){dispose(session);}
    }
    static final class Input {
        final long[] shape;final String type;
        Input(long[] shape,String type){this.shape=shape;this.type=type;}
        int bytes()throws IOException {
            long n=1;for(long size:shape){if(size<0||size>1_000_000||n*size>4_000_000)throw new IOException("Taille d’état ONNX invalide.");n*=size;}
            switch(type){case "BOOL":return (int)n;case "FLOAT16":return (int)n*2;case "FLOAT":return (int)n*4;case "INT64":return (int)n*8;
                default:throw new IOException("Type d’état ONNX inconnu : "+type);}
        }
    }
    final class Result implements AutoCloseable {
        final AutoCloseable result;
        Result(AutoCloseable result){this.result=result;}
        Object get(String name)throws Exception {
            Optional<?> o=(Optional<?>)call(output,result,name);
            if(!o.isPresent())throw new IOException("Sortie ONNX absente : "+name);return o.get();
        }
        float[] floats(String name)throws Exception{return samples(get(name));}
        @Override public void close(){dispose(result);}
    }
}
