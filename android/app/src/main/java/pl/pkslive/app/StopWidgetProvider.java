package pl.pkslive.app;
import android.app.*;
import android.app.job.*;
import android.appwidget.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.util.TypedValue;
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
  static WidgetRefreshPolicy policy(Context c,int id){
    try{JSONObject config=new JSONObject(prefs(c).getString("config_"+id,"{}"));return new WidgetRefreshPolicy(config.optInt("refreshMinutes",30),config.optString("refreshMode","battery-saver"));}
    catch(JSONException e){return new WidgetRefreshPolicy(30,"battery-saver");}
  }
  static boolean powerSave(Context c){return ((android.os.PowerManager)c.getSystemService(Context.POWER_SERVICE)).isPowerSaveMode();}
  static boolean due(Context c,int id){long now=System.currentTimeMillis();return policy(c,id).due(prefs(c).getLong("updated_"+id,0),prefs(c).getLong("attempted_"+id,0),now,powerSave(c));}
  static void cancelTick(Context c){AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);PendingIntent p=PendingIntent.getBroadcast(c,7403,new Intent(c,StopWidgetProvider.class).setAction(TICK),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);alarm.cancel(p);}
  static void schedule(Context c){
    cancelTick(c);JobScheduler scheduler=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    int[] widgets=ids(c);long interval=Long.MAX_VALUE;boolean batteryNotLow=true;
    for(int id:widgets){if(!prefs(c).contains("config_"+id))continue;WidgetRefreshPolicy p=policy(c,id);if(p.enabled()){interval=Math.min(interval,p.intervalMillis());if("always".equals(p.mode))batteryNotLow=false;}}
    if(interval==Long.MAX_VALUE){scheduler.cancel(7401);if(widgets.length==0)scheduler.cancel(7402);return;}
    JobInfo current=scheduler.getPendingJob(7401);
    if(current!=null&&current.getIntervalMillis()==interval&&(Build.VERSION.SDK_INT<26||current.isRequireBatteryNotLow()==batteryNotLow))return;
    JobInfo.Builder builder=new JobInfo.Builder(7401,new ComponentName(c,StopWidgetRefreshService.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(interval,Math.min(interval/3,10*60000L)).setPersisted(true);
    if(Build.VERSION.SDK_INT>=26)builder.setRequiresBatteryNotLow(batteryNotLow);
    scheduler.schedule(builder.build());
  }
  static synchronized void refresh(Context c,int id,boolean manual){
    if(!prefs(c).contains("config_"+id))return;
    long now=System.currentTimeMillis();
    if(manual){long previous=prefs(c).getLong("manual_"+id,0);if(now-previous<60000){prefs(c).edit().putString("notice_"+id,"Kolejne odświeżenie za "+Math.max(1,(60000-(now-previous)+999)/1000)+" s").putLong("noticeAt_"+id,now).apply();render(c,id);return;}}
    else if(!due(c,id))return;
    PersistableBundle extras=new PersistableBundle();extras.putInt("widgetId",id);extras.putBoolean("manual",manual);
    JobInfo.Builder builder=new JobInfo.Builder(7402,new ComponentName(c,StopWidgetRefreshService.class)).setExtras(extras).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
    if(manual&&Build.VERSION.SDK_INT>=31)builder.setExpedited(true);
    else if(manual)builder.setOverrideDeadline(0);
    else builder.setMinimumLatency(0);
    if(!manual&&Build.VERSION.SDK_INT>=26)builder.setRequiresBatteryNotLow(!"always".equals(policy(c,id).mode));
    JobScheduler scheduler=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    int result=scheduler.schedule(builder.build());
    if(result==JobScheduler.RESULT_FAILURE&&manual&&Build.VERSION.SDK_INT>=31)result=scheduler.schedule(builder.setExpedited(false).setOverrideDeadline(0).build());
    if(manual){prefs(c).edit().putLong("manual_"+id,result==JobScheduler.RESULT_SUCCESS?now:0).putLong("refreshing_"+id,result==JobScheduler.RESULT_SUCCESS?now:0).remove("notice_"+id).apply();if(result!=JobScheduler.RESULT_SUCCESS)prefs(c).edit().putString("notice_"+id,"Nie udało się uruchomić odświeżania").putLong("noticeAt_"+id,now).apply();render(c,id);}
  }
  @Override public void onReceive(Context c,Intent intent){super.onReceive(c,intent);if(PINNED.equals(intent.getAction())){int id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);String token=intent.getStringExtra("token");String config=prefs(c).getString("pending_"+token,null);if(id!=-1&&config!=null){prefs(c).edit().putString("config_"+id,config).putString("rows_"+id,prefs(c).getString("pending_rows_"+token,"[]")).putLong("updated_"+id,"[]".equals(prefs(c).getString("pending_rows_"+token,"[]"))?0:System.currentTimeMillis()).putBoolean("added_"+token,true).remove("pending_"+token).remove("pending_rows_"+token).apply();render(c,id);schedule(c);if(prefs(c).getLong("updated_"+id,0)==0)refresh(c,id,true);}}else if(TICK.equals(intent.getAction())||Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())){schedule(c);for(int id:ids(c))render(c,id);}else if(REFRESH.equals(intent.getAction())){refresh(c,intent.getIntExtra("widgetId",-1),true);}else if(Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())||Intent.ACTION_TIME_CHANGED.equals(intent.getAction())||Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())){for(int id:ids(c))render(c,id);}}
  @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids){render(c,id);refresh(c,id,false);}schedule(c);}
  @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){render(c,id);}
  @Override public void onDeleted(Context c,int[] ids){for(int id:ids)prefs(c).edit().remove("config_"+id).remove("rows_"+id).remove("updated_"+id).remove("warning_"+id).remove("manual_"+id).remove("synced_"+id).remove("attempted_"+id).remove("refreshing_"+id).remove("notice_"+id).remove("noticeAt_"+id).apply();schedule(c);}
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
    WidgetAppearance appearance=new WidgetAppearance(config,dark);
    WidgetLayoutMetrics layout=new WidgetLayoutMetrics(height,appearance);boolean compact=layout.compact,footerVisible=layout.footerVisible;
    RemoteViews view=new RemoteViews(c.getPackageName(),compact?R.layout.stop_widget_compact:R.layout.stop_widget);
    int accent=appearance.readable(appearance.accent),font=appearance.fontAdjustment(height);
    {
      view.setInt(android.R.id.background,"setBackgroundResource",android.R.color.transparent);
      view.setImageViewBitmap(R.id.widget_background,appearance.background(width,height,config.optBoolean("glass",true)));
      view.setImageViewIcon(R.id.widget_bus,Icon.createWithResource(c,R.drawable.widget_bus).setTint(accent));
      view.setImageViewIcon(R.id.widget_refresh,Icon.createWithResource(c,R.drawable.widget_refresh).setTint(accent));
      view.setInt(R.id.widget_refresh,"setBackgroundResource",android.R.color.transparent);
      view.setImageViewBitmap(R.id.widget_refresh_background,appearance.control(accent,true));
      view.setImageViewBitmap(R.id.widget_bus_background,appearance.control(accent,false));
      view.setTextViewTextSize(R.id.widget_title,TypedValue.COMPLEX_UNIT_SP,(compact?11:12)+font);
    }
    String name=config.optJSONObject("stop")==null?"PKS Live":config.getJSONObject("stop").optString("name","PKS Live");String title=name.replaceFirst("(?i)^Rzeszów[, ]+", "");view.setTextViewText(R.id.widget_title,title);view.setTextColor(R.id.widget_title,fg);view.setOnClickPendingIntent(android.R.id.background,open(c,id));
    Intent update=new Intent(c,StopWidgetProvider.class).setAction(REFRESH).putExtra("widgetId",id);view.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,id,update,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    view.removeAllViews(R.id.widget_rows);JSONArray rows=new JSONArray(prefs(c).getString("rows_"+id,"[]"));long now=System.currentTimeMillis();int limit=layout.capacity,count=0;
    SimpleDateFormat clock=new SimpleDateFormat("HH:mm",new Locale("pl","PL"));clock.setTimeZone(TimeZone.getTimeZone("Europe/Warsaw"));
    for(int i=0;i<rows.length()&&count<limit;i++){JSONObject row=rows.getJSONObject(i);JSONArray selected=config.optJSONArray("lines");if(selected!=null){boolean matches=false;for(int n=0;n<selected.length();n++)if(selected.optString(n).equals(row.optString("line")))matches=true;if(!matches)continue;}long time=row.optLong("realAtMs",row.optLong("plannedAtMs",0));long precision=row.optLong("boardTimePrecisionMs",0);if(time+precision<now)continue;
      RemoteViews item=new RemoteViews(c.getPackageName(),compact?R.layout.stop_widget_row_compact:R.layout.stop_widget_row);String carrier=row.optJSONObject("carrier")==null?"pks":row.getJSONObject("carrier").optString("id","pks");
      item.setTextViewText(R.id.widget_line,row.optString("line"));item.setTextViewText(R.id.widget_direction,row.optString("direction"));item.setTextColor(R.id.widget_direction,fg);
      item.setTextViewText(R.id.widget_time,clock.format(new Date(time)));int delay=row.optInt("delayMins",0);
      {
        boolean dense=compact||"compact".equals(appearance.density),highlight=appearance.highlightNext&&count==0;
        int lineColor=appearance.lineColor(carrier);
        item.setInt(R.id.widget_row_root,"setMinimumHeight",Math.round(layout.rowHeight*c.getResources().getDisplayMetrics().density));
        item.setImageViewBitmap(R.id.widget_row_background,appearance.rowBackground(Math.max(1,width-(compact?16:20)),layout.rowHeight,highlight,appearance.showSeparators));
        item.setInt(R.id.widget_line,"setBackgroundResource",android.R.color.transparent);
        item.setImageViewBitmap(R.id.widget_badge_background,appearance.badge(lineColor));
        item.setTextColor(R.id.widget_line,lineColor);
        item.setTextViewTextSize(R.id.widget_line,TypedValue.COMPLEX_UNIT_SP,(dense?11:12)+font);
        item.setTextViewTextSize(R.id.widget_direction,TypedValue.COMPLEX_UNIT_SP,(dense?11:12)+font);
        item.setViewVisibility(R.id.widget_direction,appearance.showDirections&&width>=220?View.VISIBLE:View.INVISIBLE);
        item.setTextViewTextSize(R.id.widget_time,TypedValue.COMPLEX_UNIT_SP,(dense?14:16)+font);
        item.setTextColor(R.id.widget_time,highlight?accent:fg);
        item.setViewVisibility(R.id.widget_delay,appearance.showDelay&&delay!=0?View.VISIBLE:View.GONE);
        item.setTextViewText(R.id.widget_delay,(row.optBoolean("delayEstimated",false)?"szac. ":"")+(delay>0?"+":"")+delay+" min");
        item.setTextViewTextSize(R.id.widget_delay,TypedValue.COMPLEX_UNIT_SP,8+Math.max(font,0));
        item.setTextColor(R.id.widget_delay,Color.parseColor(delay>0?(dark?"#f3bec7":"#9f3450"):(dark?"#99dbc4":"#206d54")));
        item.setInt(R.id.widget_delay,"setBackgroundResource",delay>0?(dark?R.drawable.widget_delay_dark:R.drawable.widget_delay_light):(dark?R.drawable.widget_early_dark:R.drawable.widget_early_light));
      }
      view.addView(R.id.widget_rows,item);count++;
    }
    long updated=prefs(c).getLong("updated_"+id,0);boolean stale=updated==0||now-updated>Math.max(45*60000L,policy(c,id).intervalMillis()+15*60000L);String warning=prefs(c).getString("warning_"+id,"");String footer=stale?"Dane nieaktualne • dotknij ↻":!warning.isEmpty()?"Część danych niedostępna • "+clock.format(new Date(updated)):("off".equals(policy(c,id).mode)?"Ręcznie • ":"Aktualizacja ")+clock.format(new Date(updated));if(count==0)footer=updated==0?(config.optJSONObject("stop")==null?"Wybierz przystanek w aplikacji":"Wczytywanie odjazdów…"):stale?footer:"Brak najbliższych odjazdów";
    boolean refreshing=now-prefs(c).getLong("refreshing_"+id,0)<90000;
    String notice=now-prefs(c).getLong("noticeAt_"+id,0)<10000?prefs(c).getString("notice_"+id,""):"";
    if(refreshing)footer="Odświeżanie odjazdów…";else if(!notice.isEmpty())footer=notice;
    if(!footerVisible&&(refreshing||!notice.isEmpty()))view.setTextViewText(R.id.widget_title,refreshing?"Odświeżanie…":notice);
    view.removeAllViews(R.id.widget_refresh_progress);
    view.setViewVisibility(R.id.widget_refresh_progress,refreshing?View.VISIBLE:View.GONE);
    view.setViewVisibility(R.id.widget_refresh,refreshing?View.INVISIBLE:View.VISIBLE);
    if(refreshing){
      RemoteViews spinner=new RemoteViews(c.getPackageName(),R.layout.widget_refresh_spinner);
      spinner.setInt(R.id.widget_spinner,"setBackgroundResource",android.R.color.transparent);
      for(int n=0;n<16;n++)spinner.setImageViewIcon(c.getResources().getIdentifier("widget_spinner_frame_"+n,"id",c.getPackageName()),Icon.createWithResource(c,R.drawable.widget_refresh).setTint(accent));
      view.addView(R.id.widget_refresh_progress,spinner);
    }
    view.setOnClickPendingIntent(R.id.widget_refresh_progress,PendingIntent.getBroadcast(c,id,update,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    boolean important=stale||!warning.isEmpty()||refreshing||!notice.isEmpty()||count==0;
    view.setViewVisibility(R.id.widget_status,(footerVisible&&(appearance.showStatus||important))||count==0?View.VISIBLE:View.GONE);
    if(stale&&count>0&&!footerVisible&&!refreshing&&notice.isEmpty())view.setTextViewText(R.id.widget_title,"Nieaktualne • "+title);
    view.setTextViewText(R.id.widget_status,footer);view.setTextColor(R.id.widget_status,muted);return view;
  }
}
