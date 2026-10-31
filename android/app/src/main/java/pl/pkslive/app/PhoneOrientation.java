package pl.pkslive.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;

public final class PhoneOrientation {
  private PhoneOrientation() {}
  public static void apply(Activity activity) {
    int orientation=activity.getResources().getBoolean(R.bool.lock_phone_orientation)
      ?ActivityInfo.SCREEN_ORIENTATION_PORTRAIT:ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    if(activity.getRequestedOrientation()!=orientation) activity.setRequestedOrientation(orientation);
  }
}
