package pl.pkslive.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Raw, single-hop Maps reads: no WebView cookies, automatic redirects or JSON
 * conversion. The JS resolver validates each Location and the selected place. */
@CapacitorPlugin(name="GoogleMapsHttp")
public class GoogleMapsHttpPlugin extends Plugin {
  private final ExecutorService reader=Executors.newFixedThreadPool(2);
  static boolean allowed(String value) {
    try {
      URI uri=new URI(value);
      if(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||uri.getPort()!=-1)return false;
      String host=uri.getHost();
      if(!Arrays.asList("maps.app.goo.gl","goo.gl","google.com","www.google.com","maps.google.com","google.pl","www.google.pl","maps.google.pl").contains(host))return false;
      String path=uri.getPath();
      if(host.equals("maps.app.goo.gl"))return path.matches("/[\\w-]+/?");
      if(host.equals("goo.gl"))return path.matches("/maps/[\\w-]+/?");
      return host.startsWith("maps.")||path.equals("/maps")||path.startsWith("/maps/");
    }catch(Exception error){return false;}
  }
  static JSObject read(HttpURLConnection connection) throws Exception {
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(5000);connection.setReadTimeout(7000);
    connection.setRequestProperty("Accept","text/html,application/json");
    connection.setRequestProperty("User-Agent","Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
    int status=connection.getResponseCode();
    JSObject headers=new JSObject(),result=new JSObject();
    String location=connection.getHeaderField("Location");
    if(location!=null)headers.put("location",location);
    result.put("status",status);result.put("headers",headers);result.put("text","");
    // Don't let generic response parsing discard a redirect or consume its body.
    if(status==200) {
      if(connection.getContentLengthLong()>2000000)throw new Exception("Odpowiedź linku jest zbyt duża.");
      try(InputStream stream=connection.getInputStream();ByteArrayOutputStream body=new ByteArrayOutputStream()) {
        byte[] buffer=new byte[8192];int count;
        while((count=stream.read(buffer))!=-1) {
          if(body.size()+count>2000000)throw new Exception("Odpowiedź linku jest zbyt duża.");
          body.write(buffer,0,count);
        }
        result.put("text",new String(body.toByteArray(),StandardCharsets.UTF_8));
      }
    }
    return result;
  }
  @PluginMethod public void get(PluginCall call) {
    String url=call.getString("url","");
    if(!allowed(url)){call.reject("Nieprawidłowy adres Google Maps.");return;}
    reader.execute(()->{
      HttpURLConnection connection=null;
      try {connection=(HttpURLConnection)new URL(url).openConnection();call.resolve(read(connection));}
      catch(Exception error){call.reject("Nie udało się odczytać linku Google Maps. "+error.getMessage());}
      finally {if(connection!=null)connection.disconnect();}
    });
  }
  @Override protected void handleOnDestroy() { reader.shutdownNow(); }
}
