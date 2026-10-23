package pl.pkslive.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Event based, no polling and no additional permissions. */
@CapacitorPlugin(name = "LandscapePowerPolicy")
public class LandscapePowerPolicyPlugin extends Plugin {
  private PowerManager power;
  private BroadcastReceiver receiver;
  private PowerManager.OnThermalStatusChangedListener thermalListener;
  private JSObject status() {
    JSObject value = new JSObject();
    boolean hot = Build.VERSION.SDK_INT >= 29 && power.getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_MODERATE;
    value.put("limited", power.isPowerSaveMode() || hot);
    value.put("critical", Build.VERSION.SDK_INT >= 29 && power.getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_SEVERE);
    return value;
  }
  @Override public void load() {
    power = (PowerManager)getContext().getSystemService(Context.POWER_SERVICE);
    receiver = new BroadcastReceiver() {
      @Override public void onReceive(Context context, Intent intent) { notifyListeners("powerPolicy", status()); }
    };
    getContext().registerReceiver(receiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));
    if (Build.VERSION.SDK_INT >= 29) {
      thermalListener = value -> notifyListeners("powerPolicy", status());
      power.addThermalStatusListener(thermalListener);
    }
  }
  @PluginMethod public void getStatus(PluginCall call) { call.resolve(status()); }
  @Override protected void handleOnDestroy() {
    if (receiver != null) getContext().unregisterReceiver(receiver);
    if (Build.VERSION.SDK_INT >= 29 && thermalListener != null) power.removeThermalStatusListener(thermalListener);
  }
}
