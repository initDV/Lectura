package io.github.initdv.lectura;

import android.content.ClipData;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import static io.github.initdv.lectura.Refs.*;

/** Only the explicitly shared file receives a temporary Android read grant. */
public final class SharedMedia extends ContentProvider {
    private static final String AUTH="io.github.initdv.lectura.files";
    @Override public boolean onCreate(){return true;}
    private File resolve(Uri uri){
        if(!AUTH.equals(uri.getAuthority()))throw new IllegalArgumentException("URI de partage invalide.");
        List<String> p=uri.getPathSegments();if(p.size()!=2||!p.get(0).matches("[a-f0-9-]{36}\\.(mp4|webm|mp3)")||!p.get(1).matches("[a-z0-9-]+\\.(mp4|webm|mp3)"))throw new IllegalArgumentException("Média invalide.");
        if(!extension(p.get(0)).equals(extension(p.get(1))))throw new IllegalArgumentException("Extension invalide.");
        return new File(Library.dir(getContext().getCacheDir(),"shares"),p.get(0));
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
        if(!mode.equals("r"))throw new FileNotFoundException("Lecture seule.");return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] selectionArgs,String sortOrder){
        File f=resolve(uri);String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
        MatrixCursor out=new MatrixCursor(cols);if(f.isFile()){Object[] data=new Object[cols.length];for(int i=0;i<cols.length;i++){
            if(cols[i].equals(OpenableColumns.DISPLAY_NAME))data[i]=uri.getLastPathSegment();else if(cols[i].equals(OpenableColumns.SIZE))data[i]=f.length();}out.addRow(data);}return out;
    }
    @Override public String getType(Uri uri){return mime(extension(resolve(uri).getName()));}
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
    static String mime(String ext){return ext.equals("mp3")?"audio/mpeg":ext.equals("png")?"image/png":"video/"+ext;}
    static String extension(String name){int dot=name.lastIndexOf('.');return dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);}
    static Uri reserveShare(Context a,File file,String name)throws IOException{
        String ext=extension(name);File dir=Library.dir(a.getCacheDir(),"shares");File dest=new File(dir,UUID.randomUUID()+"."+ext);
        Files.copy(file.toPath(),dest.toPath());File[] files=dir.listFiles();
        if(files!=null){java.util.Arrays.sort(files,Comparator.comparingLong(File::lastModified).reversed());long size=0;for(int i=0;i<files.length;i++){
            size+=files[i].length();if(!files[i].equals(dest)&&(i>=20||size>150L*1024*1024))files[i].delete();}}
        return new Uri.Builder().scheme("content").authority(AUTH).appendPath(dest.getName()).appendPath(name).build();
    }
    static void share(Context a,Uri uri,String name){
        Intent send=new Intent(Intent.ACTION_SEND).setType(mime(extension(name))).putExtra(Intent.EXTRA_STREAM,uri).putExtra(Intent.EXTRA_TITLE,name)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newUri(a.getContentResolver(),name,uri));
        a.startActivity(Intent.createChooser(send,null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
    }
    static Uri publish(Context a,File file,String name)throws IOException {
        String ext=extension(name);boolean audio=ext.equals("mp3"),png=ext.equals("png");
        Uri collection=audio?MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY):png?
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY):MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        ContentValues cv=new ContentValues();cv.put(MediaStore.MediaColumns.DISPLAY_NAME,name);cv.put(MediaStore.MediaColumns.MIME_TYPE,mime(ext));
        cv.put(MediaStore.MediaColumns.RELATIVE_PATH,(audio?Environment.DIRECTORY_MUSIC:png?Environment.DIRECTORY_PICTURES:Environment.DIRECTORY_MOVIES)+"/Lectura");
        cv.put(MediaStore.MediaColumns.IS_PENDING,1);Uri uri=a.getContentResolver().insert(collection,cv);if(uri==null)throw new IOException("Stockage du média indisponible.");
        boolean ok=false;try{
            try(OutputStream out=a.getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException("Le média ne peut pas être écrit.");Files.copy(file.toPath(),out);}
            ContentValues visible=new ContentValues();visible.put(MediaStore.MediaColumns.IS_PENDING,0);
            if(a.getContentResolver().update(uri,visible,null,null)<1)throw new IOException("Le média ne peut pas être publié.");ok=true;return uri;
        }finally{if(!ok)a.getContentResolver().delete(uri,null,null);}
    }
}

final class Movies {
    private static final long MAX=150L*1024*1024;
    final File dir;
    Movies(Context a){dir=Library.dir(a.getFilesDir(),"videos");}
    static final class Entry {
        final File file,json;final String title,date,format;
        Entry(File f,File document,JSONObject meta){file=f;json=document;title=meta.optString("titre");date=meta.optString("date");format=SharedMedia.extension(file.getName());}
        String name(){return title+"."+format;}
    }
    synchronized List<Entry> list()throws IOException{
        List<Entry> out=new ArrayList<>();File[] fs=dir.listFiles((d,n)->n.endsWith(".json"));if(fs==null)return out;
        for(File f:fs){JSONObject m=Library.readJson(f);String extension=m.optString("format");if(!extension.matches("mp4|webm|mp3"))continue;
            File blob=new File(dir,f.getName().replace(".json","."+extension));if(blob.isFile())out.add(new Entry(blob,f,m));}
        out.sort(Comparator.comparing((Entry e)->e.date).reversed());return out;
    }
    synchronized void save(File video,String name)throws IOException {
        if(video.length()>MAX)throw new IOException("Média trop volumineux pour Mes vidéos.");
        String id=UUID.randomUUID().toString(),ext=SharedMedia.extension(name);if(!ext.matches("mp4|webm|mp3"))throw new IOException("Format impossible à conserver.");
        File blob=new File(dir,id+"."+ext),json=new File(dir,id+".json");JSONObject meta=new JSONObject();
        put(meta,"titre",Project.ascii(name.substring(0,name.length()-ext.length()-1)));put(meta,"date",Instant.now().toString());put(meta,"format",ext);
        try{Files.copy(video.toPath(),blob.toPath(),StandardCopyOption.REPLACE_EXISTING);Library.writeJson(json,meta);}catch(IOException e){blob.delete();throw e;}
        long total=0;int n=0;for(Entry e:list()){if((total+=e.file.length())>MAX||n++>=20)delete(e);}
    }
    synchronized void delete(Entry e){e.json.delete();e.file.delete();}
}
