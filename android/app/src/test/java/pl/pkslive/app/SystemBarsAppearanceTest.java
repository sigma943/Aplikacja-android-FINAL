package pl.pkslive.app;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.ComponentName;
import android.graphics.Color;
import androidx.core.view.WindowCompat;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class SystemBarsAppearanceTest {
 @Test public void switchingIconColoursKeepsBothBarsFullyTransparent(){
  Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
  for(boolean darkIcons:new boolean[]{true,false,true}) {
   SystemBarsAppearance.apply(activity.getWindow(),darkIcons);
   assertEquals(Color.TRANSPARENT,activity.getWindow().getStatusBarColor());
   assertEquals(Color.TRANSPARENT,activity.getWindow().getNavigationBarColor());
   assertFalse(activity.getWindow().isStatusBarContrastEnforced());
   assertFalse(activity.getWindow().isNavigationBarContrastEnforced());
   assertEquals(darkIcons,WindowCompat.getInsetsController(activity.getWindow(),activity.getWindow().getDecorView()).isAppearanceLightStatusBars());
   assertEquals(darkIcons,WindowCompat.getInsetsController(activity.getWindow(),activity.getWindow().getDecorView()).isAppearanceLightNavigationBars());
  }
 }
 @Test @Config(qualifiers="sw411dp-port") public void phoneUsesFixedPortraitRatherThanSensorOrUserRotation() throws Exception {
  Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
  PhoneOrientation.apply(activity);
  assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,activity.getRequestedOrientation());
  ActivityInfo declared=RuntimeEnvironment.getApplication().getPackageManager().getActivityInfo(new ComponentName(RuntimeEnvironment.getApplication(),MainActivity.class),0);
  assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,declared.screenOrientation);
 }
 @Test @Config(qualifiers="sw800dp-land") public void tabletRetainsItsNormalOrientationPolicy(){
  Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
  activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
  PhoneOrientation.apply(activity);
  assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED,activity.getRequestedOrientation());
 }
}
