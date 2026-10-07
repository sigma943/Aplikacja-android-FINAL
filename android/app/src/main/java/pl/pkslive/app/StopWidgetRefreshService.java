package pl.pkslive.app;
import android.app.job.*;
import android.webkit.*;
import android.os.*;
import androidx.webkit.WebViewAssetLoader;
import org.json.*;
import java.net.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.*;
/** Reuses the app's packaged timetable client, even when its activity is closed. */
public class StopWidgetRefreshService extends JobService {
  private volatile WebView web;private JobParameters job;private int[] ids;private int index;private volatile boolean stopped;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ExecutorService network=Executors.newFixedThreadPool(2);
  private long startedAt;
  private boolean manual;
  private final Set<HttpURLConnection> connections=ConcurrentHashMap.newKeySet();
  private final Map<String,String[]> snapshots=new HashMap<>();
  private String stopKey(int id){try{return new JSONObject(StopWidgetProvider.prefs(this).getString("config_"+id,"{}")).getJSONObject("stop").toString();}catch(Exception e){return String.valueOf(id);}}
  private final Runnable timeout=()->{if(ids!=null&&index>=0&&index<ids.length){StopWidgetProvider.prefs(this).edit().putString("warning_"+ids[index],"Brak połączenia").apply();StopWidgetProvider.render(this,ids[index]);}next();};
  @Override public boolean onStartJob(JobParameters p){
    if(job!=null)return false;
    manual=p.getExtras().getBoolean("manual",false);
    job=p;stopped=false;startedAt=System.currentTimeMillis();snapshots.clear();
    int target=p.getExtras().getInt("widgetId",-1);
    ids=target!=-1?new int[]{target}:StopWidgetProvider.ids(this);
    // A bounded job continues with the least recently attempted stops next time.
    Integer[] ordered=Arrays.stream(ids).boxed().toArray(Integer[]::new);
    Arrays.sort(ordered,Comparator.comparingLong(id->StopWidgetProvider.prefs(this).getLong("attempted_"+id,0)));
    ids=Arrays.stream(ordered).mapToInt(Integer::intValue).toArray();index=-1;next();return true;
  }
  @Override public boolean onStopJob(JobParameters p){if(job==null||p.getJobId()!=job.getJobId())return false;stopped=true;cleanup();job=null;return false;}
  private void cleanup(){handler.removeCallbacks(timeout);for(HttpURLConnection connection:connections)connection.disconnect();connections.clear();if(web!=null){web.removeJavascriptInterface("NativeWidget");web.stopLoading();web.destroy();web=null;}}
  private void next(){
    cleanup();if(stopped||job==null)return;
    index++;
    while(index<ids.length){
      int id=ids[index];
      if(!StopWidgetProvider.prefs(this).contains("config_"+id)){index++;continue;}
      if(!manual&&!StopWidgetProvider.due(this,id)){index++;continue;}
      String[] cached=snapshots.get(stopKey(id));
      if(cached!=null){StopWidgetProvider.prefs(this).edit().putString("rows_"+id,cached[0]).putString("warning_"+id,cached[1]).putLong("updated_"+id,Long.parseLong(cached[2])).apply();StopWidgetProvider.render(this,id);index++;continue;}
      break;
    }
    if(index>=ids.length||System.currentTimeMillis()-startedAt>120000){JobParameters done=job;job=null;jobFinished(done,false);return;}
    StopWidgetProvider.prefs(this).edit().putLong("attempted_"+ids[index],System.currentTimeMillis()).apply();
    final int id=ids[index];final WebView runner=new WebView(this);web=runner;runner.getSettings().setJavaScriptEnabled(true);runner.getSettings().setDomStorageEnabled(true);runner.getSettings().setAllowFileAccess(false);runner.getSettings().setAllowContentAccess(false);
    WebViewAssetLoader loader=new WebViewAssetLoader.Builder().setDomain("appassets.androidplatform.net").addPathHandler("/",path->{try{String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".json")?"application/json":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open("public/"+path));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0]));}}).build();
    runner.setWebViewClient(new WebViewClient(){@Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){WebResourceResponse local=loader.shouldInterceptRequest(req.getUrl());return local!=null?local:new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,new ByteArrayInputStream(new byte[0]));}@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){return !"appassets.androidplatform.net".equals(r.getUrl().getHost());}});
    runner.addJavascriptInterface(new Object(){
      @JavascriptInterface public String config(){return StopWidgetProvider.prefs(StopWidgetRefreshService.this).getString("config_"+id,"{}");}
      @JavascriptInterface public void complete(String rows,String warning){handler.post(()->{if(web!=runner||stopped)return;try{new JSONArray(rows);if(!StopWidgetProvider.prefs(StopWidgetRefreshService.this).contains("config_"+id)){next();return;}snapshots.put(stopKey(id),new String[]{rows,warning,String.valueOf(System.currentTimeMillis())});StopWidgetProvider.prefs(StopWidgetRefreshService.this).edit().putString("rows_"+id,rows).putString("warning_"+id,warning).putLong("updated_"+id,System.currentTimeMillis()).apply();}catch(JSONException ignored){}StopWidgetProvider.render(StopWidgetRefreshService.this,id);next();});}
      @JavascriptInterface public void failed(){handler.post(()->{if(web!=runner||stopped)return;StopWidgetProvider.prefs(StopWidgetRefreshService.this).edit().putString("warning_"+id,"Brak połączenia").apply();StopWidgetProvider.render(StopWidgetRefreshService.this,id);next();});}
      @JavascriptInterface public void http(int requestId,String address){network.execute(()->{if(stopped||web!=runner)return;int status=0;String body="";HttpURLConnection connection=null;try{URL url=new URL(address);String host=url.getHost();boolean allowed="www.mpkrzeszow.pl".equals(host)||"api-site.marcel-bus.pl".equals(host)||"us-central1-aplikacja-b20fa.cloudfunctions.net".equals(host)||"einfo.zgpks.rzeszow.pl".equals(host)||"185.214.67.112".equals(host);if(!allowed||!("https".equals(url.getProtocol())||("http".equals(url.getProtocol())&&("einfo.zgpks.rzeszow.pl".equals(host)||"185.214.67.112".equals(host)))))throw new IOException("Unsupported host");connection=(HttpURLConnection)url.openConnection();connections.add(connection);if(stopped||web!=runner)throw new IOException("Widget job stopped");connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(12000);if("185.214.67.112".equals(host))connection.setRequestProperty("Host","einfo.zgpks.rzeszow.pl");connection.setRequestProperty("Accept","application/json, text/plain, */*");status=connection.getResponseCode();InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();if(input!=null){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int read;while((read=input.read(buffer))!=-1){out.write(buffer,0,read);if(out.size()>16*1024*1024)throw new IOException("Response too large");}input.close();body=out.toString("UTF-8");}}catch(Exception e){status=0;}finally{if(connection!=null){connections.remove(connection);connection.disconnect();}}final int resultStatus=status;final String resultBody=body;handler.post(()->{if(web==runner&&!stopped)runner.evaluateJavascript("window.widgetHttpResult&&window.widgetHttpResult("+requestId+","+resultStatus+","+JSONObject.quote(resultBody)+")",null);});});}
    },"NativeWidget");
    handler.postDelayed(timeout,Math.max(1000,Math.min(75000,120000-(System.currentTimeMillis()-startedAt))));runner.loadUrl("https://appassets.androidplatform.net/widget-data/index.html");
  }
  @Override public void onDestroy(){stopped=true;cleanup();network.shutdownNow();super.onDestroy();}
}
