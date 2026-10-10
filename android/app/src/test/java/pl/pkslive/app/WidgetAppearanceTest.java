package pl.pkslive.app;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.BitmapDrawable;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=31)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WidgetAppearanceTest {
  private Context context;
  @Before public void setup(){context=RuntimeEnvironment.getApplication();StopWidgetProvider.prefs(context).edit().clear().putLong("updated_7",System.currentTimeMillis()).putString("rows_7","[{\"line\":\"108\",\"direction\":\"Rzeszów D.A.\",\"delayMins\":1,\"realAtMs\":"+(System.currentTimeMillis()+600000)+"}]").apply();}
  private View view(String appearance,int width,int height)throws Exception{
    StopWidgetProvider.prefs(context).edit().putString("config_7","{\"stop\":{\"name\":\"Boguchwała, Stadion Motor 99\"},\"theme\":\"dark\",\"refreshMode\":\"off\",\"appearance\":"+appearance+"}").apply();
    View root=StopWidgetProvider.createView(context,7,width,height).apply(context,new FrameLayout(context));
    float density=context.getResources().getDisplayMetrics().density;
    root.measure(View.MeasureSpec.makeMeasureSpec(Math.round(width*density),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(Math.round(height*density),View.MeasureSpec.EXACTLY));
    root.layout(0,0,root.getMeasuredWidth(),root.getMeasuredHeight());return root;
  }
  @Test public void transparencyChangesOnlyTheBackgroundAndKeepsTextOpaque()throws Exception{
    for(int transparency:new int[]{0,65,100}){
      View root=view("{\"transparency\":"+transparency+"}",320,180);
      Bitmap background=((BitmapDrawable)((ImageView)root.findViewById(R.id.widget_background)).getDrawable()).getBitmap();
      assertEquals(Math.round(255*(1-transparency/100f)),Color.alpha(background.getPixel(background.getWidth()/2,background.getHeight()/2)));
      assertEquals(1f,root.getAlpha(),0f);assertEquals(1f,root.findViewById(R.id.widget_time).getAlpha(),0f);
      assertEquals(255,Color.alpha(((TextView)root.findViewById(R.id.widget_title)).getCurrentTextColor()));
      assertTrue(background.getWidth()<=192);assertTrue(background.getHeight()<=192);
    }
  }
  @Test public void customAccentAndContentTogglesReachRemoteViews()throws Exception{
    View root=view("{\"accentColor\":\"#8b5cf6\",\"lineColors\":\"accent\",\"showDirections\":false,\"showStatus\":false}",320,180);
    WidgetAppearance style=new WidgetAppearance(new JSONObject("{\"appearance\":{\"accentColor\":\"#8b5cf6\"}}"),true);
    assertEquals(style.readable(style.accent),((TextView)root.findViewById(R.id.widget_line)).getCurrentTextColor());
    assertEquals(View.INVISIBLE,root.findViewById(R.id.widget_direction).getVisibility());
    assertEquals(View.GONE,root.findViewById(R.id.widget_status).getVisibility());
    assertEquals("+1 min",((TextView)root.findViewById(R.id.widget_delay)).getText().toString());
    View hidden=view("{\"showDelay\":false,\"showStatus\":false}",320,180);assertEquals(View.GONE,hidden.findViewById(R.id.widget_delay).getVisibility());
    StopWidgetProvider.prefs(context).edit().putLong("updated_7",0).apply();
    View stale=StopWidgetProvider.createView(context,7,320,180).apply(context,new FrameLayout(context));assertEquals(View.VISIBLE,stale.findViewById(R.id.widget_status).getVisibility());
  }
  @Test public void userFontSizesAndSpacingNeverRenderPartialRows()throws Exception{
    for(String density:new String[]{"compact","comfortable"})for(String textSize:new String[]{"small","normal","large"}){
      String appearance="{\"density\":\""+density+"\",\"textSize\":\""+textSize+"\"}";
      WidgetAppearance style=new WidgetAppearance(new JSONObject("{\"appearance\":"+appearance+"}"),true);
      for(int height:new int[]{70,120,180,320}){
        WidgetLayoutMetrics metrics=new WidgetLayoutMetrics(height,style);
        assertTrue(metrics.reservedHeight+metrics.capacity*metrics.rowHeight<=height);
        View root=view(appearance,320,height);TextView time=root.findViewById(R.id.widget_time);
        assertNotNull("smallest widget retains one full departure",time);
        android.graphics.Rect bounds=new android.graphics.Rect();time.getDrawingRect(bounds);((android.view.ViewGroup)root).offsetDescendantRectToMyCoords(time,bounds);
        assertTrue(bounds.bottom<=root.getHeight());assertTrue(bounds.right<=root.getWidth());
        View delay=root.findViewById(R.id.widget_delay),row=root.findViewById(R.id.widget_row_root);
        Rect badgeBounds=new Rect(),rowBounds=new Rect();
        delay.getDrawingRect(badgeBounds);((android.view.ViewGroup)root).offsetDescendantRectToMyCoords(delay,badgeBounds);
        row.getDrawingRect(rowBounds);((android.view.ViewGroup)root).offsetDescendantRectToMyCoords(row,rowBounds);
        float dp=context.getResources().getDisplayMetrics().density;
        assertTrue("badge stays clear of the separator: "+appearance+" height="+height,rowBounds.bottom-badgeBounds.bottom>=Math.round(2*dp));
        assertTrue("badge stays below the time",badgeBounds.top-bounds.bottom>=Math.round(2*dp));
        assertTrue("whole badge fits in the widget",badgeBounds.bottom<=root.getHeight());

      }
    }
  }
  @Test public void softBackgroundAddsDepthWithoutChangingOpacityOrCorners()throws Exception{
    for(int transparency:new int[]{0,65,100}){
      String common="{\"appearance\":{\"transparency\":"+transparency;
      WidgetAppearance plain=new WidgetAppearance(new JSONObject(common+"}}"),false);
      WidgetAppearance soft=new WidgetAppearance(new JSONObject(common+",\"softBackground\":true,\"softBackgroundStrength\":100}}"),false);
      Bitmap a=plain.background(320,180,true),b=soft.background(320,180,true);
      int x=a.getWidth()/4,y=a.getHeight()/4;
      assertEquals(Color.alpha(a.getPixel(x,y)),Color.alpha(b.getPixel(x,y)));
      assertEquals(Color.alpha(a.getPixel(0,0)),Color.alpha(b.getPixel(0,0)));
      if(transparency<100)assertNotEquals(a.getPixel(x,y),b.getPixel(x,y));
      else assertEquals(0,Color.alpha(b.getPixel(x,y)));
      assertTrue(b.getWidth()<=192);assertTrue(b.getHeight()<=192);
    }
  }
  @Test public void unsafeOrInvalidValuesFallBackAndCornersStayBounded()throws Exception{
    WidgetAppearance style=new WidgetAppearance(new JSONObject("{\"appearance\":{\"transparency\":250,\"cornerRadius\":-1,\"accentColor\":\"invalid\"}}"),false);
    assertEquals(100,style.transparency);assertEquals(0,style.cornerRadius);assertEquals(Color.parseColor("#14b8a6"),style.accent);
    assertEquals(20,WidgetAppearance.clamp(Double.NaN,20,100));
    Bitmap square=style.background(320,180,true);assertEquals(0,Color.alpha(square.getPixel(0,0)));
  }
}
