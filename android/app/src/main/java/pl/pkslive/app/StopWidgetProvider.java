package pl.pkslive.app;
import android.app.*;
import android.app.job.*;
import android.appwidget.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.os.PersistableBundle;
import android.util.SizeF;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;
public class StopWidgetProvider extends AppWidgetProvider {
  public static final String PINNED="pl.pkslive.app.WIDGET_PINNED",TICK="pl.pkslive.app.WIDGET_TICK",REFRESH="pl.pkslive.app.WIDGET_REFRESH";
  static SharedPreferences prefs(Context c){return c.getSharedPreferences("stop_widgets",Context.MODE_PRIVATE);}
  static int[] ids(Context c){AppWidgetManager m=AppWidgetManager.getInstance(c);java.util.ArrayList<Integer> all=new java.util.ArrayList<>();for(Class<?> p:new Class<?>[]{StopWidgetProvider.class,SmallStopWidgetProvider.class,LargeStopWidgetProvider.class})for(int id:m.getAppWidgetIds(new ComponentName(c,p)))all.add(id);return all.stream().mapToInt(Integer::intValue).toArray();}
  static final long REFRESH_INTERVAL_MS=30*60*1000L;
  static void cancelTick(Context c){AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);PendingIntent p=PendingIntent.getBroadcast(c,7403,new Intent(c,StopWidgetProvider.class).setAction(TICK),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);alarm.cancel(p);}
  static void schedule(Context c){
    cancelTick(c);JobScheduler scheduler=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    if(ids(c).length==0){scheduler.cancel(7401);scheduler.cancel(7402);return;}
    JobInfo current=scheduler.getPendingJob(7401);
    if(current!=null&&current.getIntervalMillis()==REFRESH_INTERVAL_MS)return;
    JobInfo.Builder builder=new JobInfo.Builder(7401,new ComponentName(c,StopWidgetRefreshService.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(REFRESH_INTERVAL_MS,10*60*1000L).setPersisted(true);
    if(Build.VERSION.SDK_INT>=26)builder.setRequiresBatteryNotLow(true);
    scheduler.schedule(builder.build());
  }
  static synchronized void refresh(Context c,int id,boolean manual){
    if(!prefs(c).contains("config_"+id))return;
    long now=System.currentTimeMillis();
    if(manual){long previous=prefs(c).getLong("manual_"+id,0);if(now-previous<60000)return;prefs(c).edit().putLong("manual_"+id,now).apply();}
    else if(now-prefs(c).getLong("updated_"+id,0)<REFRESH_INTERVAL_MS)return;
    PersistableBundle extras=new PersistableBundle();extras.putInt("widgetId",id);extras.putBoolean("manual",manual);
    JobInfo.Builder builder=new JobInfo.Builder(7402,new ComponentName(c,StopWidgetRefreshService.class)).setExtras(extras).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0);
    if(!manual&&Build.VERSION.SDK_INT>=26)builder.setRequiresBatteryNotLow(true);
    ((JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE)).schedule(builder.build());
  }
  @Override public void onReceive(Context c,Intent intent){super.onReceive(c,intent);if(PINNED.equals(intent.getAction())){int id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);String token=intent.getStringExtra("token");String config=prefs(c).getString("pending_"+token,null);if(id!=-1&&config!=null){prefs(c).edit().putString("config_"+id,config).putString("rows_"+id,prefs(c).getString("pending_rows_"+token,"[]")).putLong("updated_"+id,"[]".equals(prefs(c).getString("pending_rows_"+token,"[]"))?0:System.currentTimeMillis()).putBoolean("added_"+token,true).remove("pending_"+token).remove("pending_rows_"+token).apply();render(c,id);schedule(c);refresh(c,id,false);}}else if(TICK.equals(intent.getAction())||Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())){schedule(c);for(int id:ids(c))render(c,id);}else if(REFRESH.equals(intent.getAction())){refresh(c,intent.getIntExtra("widgetId",-1),true);}else if(Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())||Intent.ACTION_TIME_CHANGED.equals(intent.getAction())||Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())){for(int id:ids(c))render(c,id);}}
  @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids){render(c,id);refresh(c,id,false);}schedule(c);}
  @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){render(c,id);}
  @Override public void onDeleted(Context c,int[] ids){for(int id:ids)prefs(c).edit().remove("config_"+id).remove("rows_"+id).remove("updated_"+id).remove("warning_"+id).remove("manual_"+id).remove("synced_"+id).remove("attempted_"+id).apply();schedule(c);}
  static PendingIntent open(Context c,int id){Intent i=new Intent(c,MainActivity.class).setAction("widget-open-"+id).putExtra("widgetId",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);return PendingIntent.getActivity(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static void render(Context c,int id){try{
    AppWidgetManager manager=AppWidgetManager.getInstance(c);Bundle options=manager.getAppWidgetOptions(id);
    if(Build.VERSION.SDK_INT>=31){ArrayList<SizeF> sizes=options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);if(sizes!=null&&!sizes.isEmpty()){Map<SizeF,RemoteViews> views=new HashMap<>();for(SizeF size:sizes){views.put(size,createView(c,id,Math.round(size.getWidth()),Math.round(size.getHeight())));if(views.size()>=16)break;}manager.updateAppWidget(id,new RemoteViews(views));return;}}
    int minWidth=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,240),minHeight=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,120),maxWidth=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minWidth),maxHeight=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minHeight);
    manager.updateAppWidget(id,new RemoteViews(createView(c,id,maxWidth,minHeight),createView(c,id,minWidth,maxHeight)));
  }catch(Exception e){Log.w("StopWidget","Cannot render widget",e);}}
  static RemoteViews createView(Context c,int id,int width,int height) throws JSONException {
    JSONObject config=new JSONObject(prefs(c).getString("config_"+id,"{}"));String theme=config.optString("theme","system");boolean dark="dark".equals(theme)||("system".equals(theme)&&(c.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES);
    int fg=Color.parseColor(dark?"#f1f5f9":"#0f172a"),muted=Color.parseColor(dark?"#94a3b8":"#64748b");
    RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.stop_widget);view.setInt(R.id.widget_root,"setBackgroundResource",dark?R.drawable.widget_dark:R.drawable.widget_light);
    String name=config.optJSONObject("stop")==null?"PKS Live":config.getJSONObject("stop").optString("name","PKS Live");view.setTextViewText(R.id.widget_title,name);view.setTextColor(R.id.widget_title,fg);view.setTextColor(R.id.widget_refresh,Color.parseColor("#14b8a6"));view.setOnClickPendingIntent(R.id.widget_root,open(c,id));
    Intent update=new Intent(c,StopWidgetProvider.class).setAction(REFRESH).putExtra("widgetId",id);view.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,id,update,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    view.removeAllViews(R.id.widget_rows);JSONArray rows=new JSONArray(prefs(c).getString("rows_"+id,"[]"));long now=System.currentTimeMillis();int limit=Math.max(1,Math.min(10,(height-60)/30)),count=0;
    SimpleDateFormat clock=new SimpleDateFormat("HH:mm",new Locale("pl","PL"));clock.setTimeZone(TimeZone.getTimeZone("Europe/Warsaw"));
    for(int i=0;i<rows.length()&&count<limit;i++){JSONObject row=rows.getJSONObject(i);JSONArray selected=config.optJSONArray("lines");if(selected!=null){boolean matches=false;for(int n=0;n<selected.length();n++)if(selected.optString(n).equals(row.optString("line")))matches=true;if(!matches)continue;}long time=row.optLong("realAtMs",row.optLong("plannedAtMs",0));long precision=row.optLong("boardTimePrecisionMs",0);if(time+precision<now)continue;
      RemoteViews item=new RemoteViews(c.getPackageName(),R.layout.stop_widget_row);String carrier=row.optJSONObject("carrier")==null?"pks":row.getJSONObject("carrier").optString("id","pks");String color="mpk".equals(carrier)?"#ff7a00":"marcel".equals(carrier)?"#84cc16":"#14b8a6";
      item.setTextViewText(R.id.widget_line,row.optString("line"));item.setTextColor(R.id.widget_line,Color.parseColor(color));item.setTextViewText(R.id.widget_direction,row.optString("direction"));item.setTextColor(R.id.widget_direction,fg);item.setViewVisibility(R.id.widget_direction,width<220?View.INVISIBLE:View.VISIBLE);
      item.setTextViewText(R.id.widget_time,clock.format(new Date(time)));int delay=row.optInt("delayMins",0);item.setTextColor(R.id.widget_time,delay>0?Color.parseColor("#f43f5e"):delay<0?Color.parseColor("#10b981"):fg);view.addView(R.id.widget_rows,item);count++;
    }
    long updated=prefs(c).getLong("updated_"+id,0);boolean stale=updated==0||now-updated>45*60000;String warning=prefs(c).getString("warning_"+id,"");String footer=stale?"Dane nieaktualne • dotknij ↻":!warning.isEmpty()?"Część danych niedostępna • "+clock.format(new Date(updated)):"Aktualizacja "+clock.format(new Date(updated));if(count==0)footer=updated==0?(config.optJSONObject("stop")==null?"Wybierz przystanek w aplikacji":"Wczytywanie odjazdów…"):stale?footer:"Brak najbliższych odjazdów";
    view.setTextViewText(R.id.widget_status,footer);view.setTextColor(R.id.widget_status,muted);return view;
  }
}
