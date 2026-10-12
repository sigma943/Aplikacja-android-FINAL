package pl.pkslive.app;

import android.provider.Settings;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StableDeviceId")
public class StableDeviceIdPlugin extends Plugin {
  // A test installation must never transfer the production device registration,
  // including Android versions where ANDROID_ID is shared between applications.
  static String installationIdentifier(String packageName, String androidId) {
    if (androidId == null) return "";
    if (!"pl.pkslive.app.releasetest".equals(packageName) || androidId.isEmpty()) return androidId;
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(
        (packageName + ":" + androidId).getBytes(StandardCharsets.UTF_8));
      StringBuilder id = new StringBuilder(16);
      for (int i = 0; i < 8; i++) {
        id.append(Character.forDigit((digest[i] >>> 4) & 15, 16));
        id.append(Character.forDigit(digest[i] & 15, 16));
      }
      return id.toString();
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is required by Android", error);
    }
  }

  @PluginMethod
  public void getId(PluginCall call) {
    String androidId = Settings.Secure.getString(
      getContext().getContentResolver(),
      Settings.Secure.ANDROID_ID
    );

    JSObject result = new JSObject();
    result.put("identifier", installationIdentifier(getContext().getPackageName(), androidId));
    call.resolve(result);
  }
}
