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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Export aggregated statistics only to a document selected by the user. */
@CapacitorPlugin(name="AdminStatisticsExport")
public class AdminStatisticsExportPlugin extends Plugin {
  static Intent documentIntent(String filename) {
    return new Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("text/csv")
      .putExtra(Intent.EXTRA_TITLE, filename);
  }

  @PluginMethod public void save(PluginCall call) {
    String content=call.getString("content"),filename=call.getString("filename");
    if(content==null||content.length()>65536||filename==null||!filename.matches("pks-live-statystyki-[0-9]+-dni\\.csv")) {
      call.reject("Nieprawidłowy plik statystyk.");return;
    }
    getActivity().runOnUiThread(()->{
      try {startActivityForResult(call,documentIntent(filename),"documentSelected");}
      catch(Exception error){call.reject("Nie udało się otworzyć okna zapisu.",error);}
    });
  }

  @ActivityCallback private void documentSelected(PluginCall call,ActivityResult result) {
    if(call==null)return;
    Uri uri=result.getData()==null?null:result.getData().getData();
    if(result.getResultCode()!=Activity.RESULT_OK||uri==null){
      JSObject response=new JSObject();response.put("saved",false);call.resolve(response);return;
    }
    getBridge().execute(()->{
      try(OutputStream output=getContext().getContentResolver().openOutputStream(uri,"wt")) {
        if(output==null)throw new java.io.IOException("Document unavailable");
        output.write(call.getString("content","").getBytes(StandardCharsets.UTF_8));
      }catch(Exception error){call.reject("Nie udało się zapisać pliku statystyk.",error);return;}
      JSObject response=new JSObject();response.put("saved",true);call.resolve(response);
    });
  }
}
