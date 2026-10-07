package pl.pkslive.app;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.UUID;
@CapacitorPlugin(name="StopWidget")
public class StopWidgetPlugin extends Plugin {
  @PluginMethod public void pin(PluginCall call) {
    getActivity().runOnUiThread(()->{
      AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
      if(Build.VERSION.SDK_INT<26||!manager.isRequestPinAppWidgetSupported()){call.reject("Ten ekran główny nie obsługuje dodawania widżetów z aplikacji.");return;}
      try {
        String config=call.getString("config");JSONObject data=new JSONObject(config);
        if(data.optJSONArray("lines")!=null&&data.getJSONArray("lines").length()==0){call.reject("Wybierz co najmniej jedną linię.");return;}
        String token=UUID.randomUUID().toString();
        StopWidgetProvider.prefs(getContext()).edit().putString("pending_"+token,config).putString("pending_rows_"+token,call.getString("departures","[]")).apply();
        Intent intent=new Intent(getContext(),StopWidgetProvider.class).setAction(StopWidgetProvider.PINNED).putExtra("token",token).setData(android.net.Uri.parse("pkslive://widget/pin/"+token));
        PendingIntent callback=PendingIntent.getBroadcast(getContext(),0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE);
        String size=data.optString("size","medium");Class<?> provider="small".equals(size)?SmallStopWidgetProvider.class:"large".equals(size)?LargeStopWidgetProvider.class:StopWidgetProvider.class;
        if(!manager.requestPinAppWidget(new ComponentName(getContext(),provider),null,callback)){call.reject("Nie udało się poprosić o dodanie widżetu.");return;}
        JSObject result=new JSObject();result.put("token",token);call.resolve(result);
      } catch(Exception e){call.reject("Nie udało się przygotować widżetu.",e);}
    });
  }
  private JSObject launchStop(Intent intent){JSObject result=new JSObject();int id=intent.getIntExtra("widgetId",-1);intent.removeExtra("widgetId");try{JSONObject config=new JSONObject(StopWidgetProvider.prefs(getContext()).getString("config_"+id,"{}"));result.put("stop",config.optJSONObject("stop"));}catch(Exception ignored){}return result;}
  @PluginMethod public void getLaunchStop(PluginCall call){call.resolve(launchStop(getActivity().getIntent()));}
  @Override protected void handleOnNewIntent(Intent intent){JSObject result=launchStop(intent);if(result.has("stop"))notifyListeners("openStop",result,true);}
  @PluginMethod public void sync(PluginCall call){try{String rows=call.getString("departures","[]");new org.json.JSONArray(rows);for(int id:StopWidgetProvider.ids(getContext())){JSONObject config=new JSONObject(StopWidgetProvider.prefs(getContext()).getString("config_"+id,"{}"));JSONObject stop=config.optJSONObject("stop");if(stop!=null&&stop.optString("id").equals(call.getString("stopId"))&&System.currentTimeMillis()-StopWidgetProvider.prefs(getContext()).getLong("synced_"+id,0)>=60000){StopWidgetProvider.prefs(getContext()).edit().putString("rows_"+id,rows).putLong("synced_"+id,System.currentTimeMillis()).putLong("updated_"+id,System.currentTimeMillis()).putString("warning_"+id,call.getString("warning","")).apply();StopWidgetProvider.render(getContext(),id);}}call.resolve();}catch(Exception e){call.reject("Nie udało się odświeżyć widżetu.",e);}}
  @PluginMethod public void status(PluginCall call){JSObject r=new JSObject();r.put("added",StopWidgetProvider.prefs(getContext()).getBoolean("added_"+call.getString("token"),false));call.resolve(r);}
}
