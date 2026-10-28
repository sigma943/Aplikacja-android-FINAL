package pl.pkslive.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
  @PluginMethod public void getInsets(PluginCall call) {
    getActivity().runOnUiThread(() -> call.resolve(((MainActivity)getActivity()).systemInsets()));
  }
}
