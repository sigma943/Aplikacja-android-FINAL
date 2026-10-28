package pl.pkslive.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.View;
import androidx.core.graphics.Insets;

/** White system icons remain readable even over white maps or animated skies.
 * Native overlay stays above every WebView modal and never intercepts gestures. */
public class SystemBarProtection extends View {
  private Insets bars = Insets.NONE;
  private final Paint paint = new Paint();
  static final int SCRIM = 0xB8000000;
  public SystemBarProtection(Context context) {
    super(context);
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    setClickable(false);
    setFocusable(false);
  }
  public void setInsets(Insets value) { bars=value; invalidate(); }
  @Override protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    float fade=12*getResources().getDisplayMetrics().density;
    paint.setShader(null); paint.setColor(SCRIM);
    if(bars.top>0) {
      canvas.drawRect(0,0,getWidth(),bars.top,paint);
      paint.setShader(new LinearGradient(0,bars.top,0,bars.top+fade,SCRIM,Color.TRANSPARENT,Shader.TileMode.CLAMP));
      canvas.drawRect(0,bars.top,getWidth(),bars.top+fade,paint);
    }
    paint.setShader(null);
    if(bars.bottom>0) {
      canvas.drawRect(0,getHeight()-bars.bottom,getWidth(),getHeight(),paint);
      paint.setShader(new LinearGradient(0,getHeight()-bars.bottom-fade,0,getHeight()-bars.bottom,Color.TRANSPARENT,SCRIM,Shader.TileMode.CLAMP));
      canvas.drawRect(0,getHeight()-bars.bottom-fade,getWidth(),getHeight()-bars.bottom,paint);
    }
    paint.setShader(null);
    if(bars.left>0) canvas.drawRect(0,0,bars.left,getHeight(),paint);
    if(bars.right>0) canvas.drawRect(getWidth()-bars.right,0,getWidth(),getHeight(),paint);
  }
}
