package pl.pkslive.app;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
@CapacitorPlugin(name="AppearanceBackup")
public class AppearanceBackupPlugin extends Plugin {
  static final int LIMIT=262144;
  static Intent documentIntent(boolean save){
    Intent intent=new Intent(save?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
    if(save)intent.putExtra(Intent.EXTRA_TITLE,"pks-live-wyglad.json");return intent;
  }
  @PluginMethod public void save(PluginCall call){
    String content=call.getString("content");if(content==null||content.getBytes(StandardCharsets.UTF_8).length>LIMIT){call.reject("Nieprawidłowy plik wyglądu.");return;}open(call,true,"savedDocument");
  }
  @PluginMethod public void load(PluginCall call){open(call,false,"loadedDocument");}
  private void open(PluginCall call,boolean save,String callback){getActivity().runOnUiThread(()->{try{startActivityForResult(call,documentIntent(save),callback);}catch(Exception e){call.reject("Nie udało się otworzyć okna plików.",e);}});}
  private Uri resultUri(PluginCall call,ActivityResult result,boolean save){
    Uri uri=result.getData()==null?null:result.getData().getData();
    if(result.getResultCode()!=Activity.RESULT_OK||uri==null){JSObject response=new JSObject();response.put(save?"saved":"cancelled",!save);call.resolve(response);return null;}return uri;
  }
  @ActivityCallback private void savedDocument(PluginCall call,ActivityResult result){
    if(call==null)return;Uri uri=resultUri(call,result,true);if(uri==null)return;
    getBridge().execute(()->{try(OutputStream out=getContext().getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new java.io.IOException();out.write(call.getString("content","").getBytes(StandardCharsets.UTF_8));JSObject response=new JSObject();response.put("saved",true);call.resolve(response);}catch(Exception e){call.reject("Nie udało się zapisać wyglądu.",e);}});
  }
  @ActivityCallback private void loadedDocument(PluginCall call,ActivityResult result){
    if(call==null)return;Uri uri=resultUri(call,result,false);if(uri==null)return;
    getBridge().execute(()->{try(InputStream in=getContext().getContentResolver().openInputStream(uri)){if(in==null)throw new java.io.IOException();ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>LIMIT)throw new java.io.IOException("Limit 256 KB");out.write(buffer,0,n);}JSObject response=new JSObject();response.put("content",new String(out.toByteArray(),StandardCharsets.UTF_8));call.resolve(response);}catch(Exception e){call.reject("Nie udało się odczytać kopii wyglądu (maksymalnie 256 KB).",e);}});
  }
}
