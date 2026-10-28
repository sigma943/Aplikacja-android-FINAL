package pl.pkslive.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
  @PluginMethod public void setStyle(PluginCall call) {
    boolean darkIcons=Boolean.TRUE.equals(call.getBoolean("darkIcons",false));
    getActivity().runOnUiThread(()->{
      SystemBarsAppearance.apply(getActivity().getWindow(),darkIcons);
      call.resolve();
    });
  }
  @PluginMethod public void getInsets(PluginCall call) {
    getActivity().runOnUiThread(() -> call.resolve(((MainActivity)getActivity()).systemInsets()));
  }
}
