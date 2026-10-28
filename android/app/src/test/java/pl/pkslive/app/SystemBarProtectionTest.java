package pl.pkslive.app;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import androidx.core.graphics.Insets;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class SystemBarProtectionTest {
 @Test public void whiteSystemIconsKeepContrastOverTheBrightestThemeWithoutCoveringContent(){
  Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
  SystemBarProtection view=new SystemBarProtection(activity);
  view.layout(0,0,393,851);view.setInsets(Insets.of(0,32,0,24));
  Bitmap bitmap=Bitmap.createBitmap(393,851,Bitmap.Config.ARGB_8888);
  view.draw(new Canvas(bitmap));
  assertTrue(Color.alpha(bitmap.getPixel(100,10))>=180);
  assertTrue(Color.alpha(bitmap.getPixel(100,845))>=180);
  assertEquals(0,Color.alpha(bitmap.getPixel(100,400)));
  assertFalse(view.isClickable());assertFalse(view.isFocusable());
  // White (#fff) over the protected brightest possible background exceeds 4.5:1.
  double channel=(255-Color.alpha(bitmap.getPixel(100,10)))/255.0;
  double luminance=Math.pow((channel+.055)/1.055,2.4);
  assertTrue(1.05/(luminance+.05)>4.5);
 }
 @Test public void rotationMovesProtectionToSideNavigationWithoutCoveringTheCentre(){
  Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
  SystemBarProtection view=new SystemBarProtection(activity);view.layout(0,0,851,393);
  view.setInsets(Insets.of(0,24,48,0));
  Bitmap bitmap=Bitmap.createBitmap(851,393,Bitmap.Config.ARGB_8888);view.draw(new Canvas(bitmap));
  assertTrue(Color.alpha(bitmap.getPixel(840,200))>=180);
  assertEquals(0,Color.alpha(bitmap.getPixel(400,200)));
 }
}
