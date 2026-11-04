package pl.pkslive.app;
import com.getcapacitor.JSObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class GoogleMapsHttpTest {
 private HttpURLConnection connection(int status,String location,String text) throws Exception {
  return new HttpURLConnection(new URL("https://maps.app.goo.gl/fPMXwpSaTGh31K3h8")) {
   public void connect(){} public void disconnect(){} public boolean usingProxy(){return false;}
   @Override public int getResponseCode(){return status;}
   @Override public String getHeaderField(String name){return "Location".equalsIgnoreCase(name)?location:null;}
   @Override public InputStream getInputStream(){if(status!=200)throw new AssertionError("A redirect body must never be consumed");return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));}
  };
 }
 @Test public void redirectHeaderIsReturnedVerbatimWithoutFollowingOrReadingTheBody() throws Exception {
  String target="https://www.google.com/maps/place/Fontanna/data=!4m2!3m1!1s0x473cfb0024e51293:0x8b38bfc9aded7933";
  HttpURLConnection connection=connection(302,target,"");
  JSObject reply=GoogleMapsHttpPlugin.read(connection);
  assertEquals(302,reply.getInteger("status").intValue());
  assertEquals(target,reply.getJSObject("headers").getString("location"));
  assertEquals("",reply.getString("text"));assertFalse(connection.getInstanceFollowRedirects());
 }
 @Test public void publicPreviewRemainsRawTextIncludingItsXssiPrefix() throws Exception {
  String text=")]}'\n[null,null,\"żółć\"]";
  assertEquals(text,GoogleMapsHttpPlugin.read(connection(200,null,text)).getString("text"));
 }
 @Test public void onlyGoogleMapsHttpsEndpointsCanBeRequested(){
  assertTrue(GoogleMapsHttpPlugin.allowed("https://maps.app.goo.gl/fPMXwpSaTGh31K3h8"));
  assertTrue(GoogleMapsHttpPlugin.allowed("https://www.google.com/maps/preview/place?pb=test"));
  for(String url:new String[]{"http://maps.app.goo.gl/test","https://www.google.com.evil.test/maps","https://www.google.com/accounts","https://user@www.google.com/maps","https://www.google.com:444/maps","https://127.0.0.1/maps"}) assertFalse(url,GoogleMapsHttpPlugin.allowed(url));
 }
 @Test public void suppliedLinkReturnsAnActualGoogleMapsRedirect() throws Exception {
  HttpURLConnection connection=(HttpURLConnection)new URL("https://maps.app.goo.gl/fPMXwpSaTGh31K3h8").openConnection();
  try {
   JSObject reply=GoogleMapsHttpPlugin.read(connection);
   assertEquals(302,reply.getInteger("status").intValue());
   String location=reply.getJSObject("headers").getString("location");
   assertNotNull(location);assertTrue(location,GoogleMapsHttpPlugin.allowed(location));
   assertTrue(location.contains("0x473cfb0024e51293:0x8b38bfc9aded7933"));
  } finally {connection.disconnect();}
 }
}
