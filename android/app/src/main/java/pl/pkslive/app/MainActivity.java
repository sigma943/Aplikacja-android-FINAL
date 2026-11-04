package pl.pkslive.app;

import android.os.Bundle;
import android.os.Build;
import android.content.res.Configuration;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private Insets safeInsets = Insets.NONE;
  public JSObject systemInsets() {
    float density=getResources().getDisplayMetrics().density;
    JSObject result=new JSObject();
    result.put("top",safeInsets.top/density); result.put("bottom",safeInsets.bottom/density);
    result.put("left",safeInsets.left/density); result.put("right",safeInsets.right/density);
    return result;
  }
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(StableDeviceIdPlugin.class);
    registerPlugin(StopWidgetPlugin.class);
    registerPlugin(AdminStatisticsExportPlugin.class);
    registerPlugin(AppearanceBackupPlugin.class);
    registerPlugin(LandscapePowerPolicyPlugin.class);
    registerPlugin(SystemBarsPlugin.class);
    registerPlugin(GoogleMapsHttpPlugin.class);
    super.onCreate(savedInstanceState);
    PhoneOrientation.apply(this);
    WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    SystemBarsAppearance.apply(getWindow(),false);
    if(Build.VERSION.SDK_INT>=28) {
      WindowManager.LayoutParams params=getWindow().getAttributes();
      params.layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(params);
    }
    ViewGroup content=findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content,(view,insets)->{
      safeInsets=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
      Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());
      int keyboard=insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
      // Resize the WebView for the IME while keeping backgrounds behind system bars.
      view.setPadding(0,0,0,keyboard>bars.bottom?keyboard:0);
      if(bridge!=null&&bridge.getWebView()!=null) bridge.getWebView().evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('pks-insets',{detail:"+systemInsets().toString()+"}))",null);
      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(content);
  }
  @Override public void onConfigurationChanged(Configuration config) {
    super.onConfigurationChanged(config);
    PhoneOrientation.apply(this);
  }
}
