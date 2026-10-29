package pl.pkslive.app;

import android.os.Build;
import android.graphics.Color;
import android.view.Window;
import androidx.core.view.WindowCompat;

/** System icons change colour; the app's map/sky stays completely unobscured. */
public final class SystemBarsAppearance {
  private SystemBarsAppearance() {}
  public static void apply(Window window, boolean darkIcons) {
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.TRANSPARENT);
    if(Build.VERSION.SDK_INT>=28) window.setNavigationBarDividerColor(Color.TRANSPARENT);
    if(Build.VERSION.SDK_INT>=29) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    WindowCompat.getInsetsController(window,window.getDecorView()).setAppearanceLightStatusBars(darkIcons);
    WindowCompat.getInsetsController(window,window.getDecorView()).setAppearanceLightNavigationBars(darkIcons);
  }
}
