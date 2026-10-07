package pl.pkslive.app;
import android.app.Application;
import android.app.job.*;
import android.content.*;
import android.content.res.Configuration;
import android.view.*;
import android.widget.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=31)
public class StopWidgetInteractionTest {
  private Context context;
  @Before public void setup(){context=RuntimeEnvironment.getApplication();StopWidgetProvider.prefs(context).edit().clear().putLong("updated_7",System.currentTimeMillis()).putString("config_7","{\"stop\":{\"name\":\"Rzeszów, Podkarpacka Matuszczaka 04\"},\"refreshMode\":\"off\"}").putString("rows_7","[{\"line\":\"108\",\"direction\":\"Gwoźnica Górna\",\"realAtMs\":"+(System.currentTimeMillis()+600000)+"}]").apply();}
  private View inflate(Context c,int width,int height)throws Exception{
    View root=StopWidgetProvider.createView(c,7,width,height).apply(c,new FrameLayout(c));
    float density=c.getResources().getDisplayMetrics().density;
    root.measure(View.MeasureSpec.makeMeasureSpec(Math.round(width*density),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(Math.round(height*density),View.MeasureSpec.EXACTLY));root.layout(0,0,root.getMeasuredWidth(),root.getMeasuredHeight());return root;
  }
  @Test public void refreshHasItsOwnBoundsAboveDepartureEvenWithLargeFonts()throws Exception{
    Configuration config=new Configuration(context.getResources().getConfiguration());config.fontScale=1.8f;
    Context enlarged=context.createConfigurationContext(config);
    for(int height:new int[]{70,180,320}){
      View root=inflate(enlarged,320,height),refresh=root.findViewById(R.id.widget_refresh),rows=root.findViewById(R.id.widget_rows);
      assertTrue(refresh instanceof ImageView);assertTrue(refresh.isClickable());assertTrue(refresh.getHeight()>0);
      android.graphics.Rect bounds=new android.graphics.Rect();refresh.getDrawingRect(bounds);((ViewGroup)root).offsetDescendantRectToMyCoords(refresh,bounds);
      assertTrue("refresh control overlaps departure rows",bounds.bottom<=rows.getTop());
      assertEquals(android.R.id.background,root.getId());
    }
  }
  @Test public void compactHeaderKeepsTheRefreshTargetAndReadableDepartureAtMinimumWidth()throws Exception{
    View root=inflate(context,140,70);
    TextView title=root.findViewById(R.id.widget_title);
    assertEquals("Podkarpacka Matuszczaka 04",title.getText().toString());
    ImageView refresh=root.findViewById(R.id.widget_refresh);
    assertNotNull(refresh.getDrawable());assertNotNull(refresh.getBackground());
    assertTrue(refresh.getLeft()>=title.getRight());
    TextView time=root.findViewById(R.id.widget_time);
    assertNotNull(time);assertTrue(time.getMeasuredWidth()>0);
    android.graphics.Rect bounds=new android.graphics.Rect();time.getDrawingRect(bounds);
    ((ViewGroup)root).offsetDescendantRectToMyCoords(time,bounds);
    assertTrue(bounds.right<=root.getWidth());assertTrue(bounds.bottom<=root.getHeight());
  }
  @Test public void glassUsesTranslucentBackgroundAndOpaqueContentInBothThemes()throws Exception{
    for(String theme:new String[]{"dark","light"}){
      StopWidgetProvider.prefs(context).edit().putString("config_7","{\"stop\":{\"name\":\"Test\"},\"theme\":\""+theme+"\"}").apply();
      View root=inflate(context,320,180);
      android.graphics.drawable.GradientDrawable bg=(android.graphics.drawable.GradientDrawable)root.getBackground();
      for(int color:bg.getColors()){assertTrue(android.graphics.Color.alpha(color)<255);assertTrue(android.graphics.Color.alpha(color)>=128);}
      assertEquals(1f,root.getAlpha(),0f);assertEquals(1f,root.findViewById(R.id.widget_title).getAlpha(),0f);
      assertTrue(root.getClipToOutline());assertTrue(bg.getCornerRadius()>0);
    }
  }
  @Test public void glassCanBeDisabledForAnOpaqueBackground()throws Exception{
    StopWidgetProvider.prefs(context).edit().putString("config_7","{\"stop\":{\"name\":\"Test\"},\"glass\":false}").apply();
    android.graphics.drawable.GradientDrawable bg=(android.graphics.drawable.GradientDrawable)inflate(context,320,180).getBackground();
    for(int color:bg.getColors())assertEquals(255,android.graphics.Color.alpha(color));
  }
  @Test public void refreshClickSendsTheWidgetIdAndQueuesExpeditedJobEvenWhenAutomaticRefreshIsOff()throws Exception{
    // Robolectric records PendingIntent broadcasts but does not deliver all
    // manifest receivers. Register the real receiver for this interaction test.
    StopWidgetProvider receiver=new StopWidgetProvider();
    context.registerReceiver(receiver,new IntentFilter(StopWidgetProvider.REFRESH));
    try {
    View root=inflate(context,320,180);assertTrue(root.findViewById(R.id.widget_refresh).performClick());
    Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
    Intent request=Shadows.shadowOf((Application)context).getBroadcastIntents().stream().filter(i->StopWidgetProvider.REFRESH.equals(i.getAction())).findFirst().orElseThrow(()->new AssertionError("refresh click sent no broadcast"));
    assertEquals(7,request.getIntExtra("widgetId",-1));
    JobInfo job=((JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).getPendingJob(7402);
    assertNotNull("refresh broadcast did not schedule its job",job);
    assertTrue("manual job was not expedited",job.isExpedited());
    assertTrue(job.getExtras().getBoolean("manual"));assertEquals(7,job.getExtras().getInt("widgetId"));
    assertTrue(StopWidgetProvider.prefs(context).getLong("refreshing_7",0)>0);
    assertTrue(((TextView)inflate(context,320,180).findViewById(R.id.widget_status)).getText().toString().contains("Odświeżanie"));
    } finally {context.unregisterReceiver(receiver);}
  }
  @Test public void repeatedTapDoesNotQueueAnotherRequestAndReportsTheCooldown(){
    StopWidgetProvider.refresh(context,7,true);long accepted=StopWidgetProvider.prefs(context).getLong("manual_7",0);
    StopWidgetProvider.refresh(context,7,true);
    assertEquals(accepted,StopWidgetProvider.prefs(context).getLong("manual_7",0));assertTrue(StopWidgetProvider.prefs(context).getString("notice_7","").contains("za"));
  }
  @Test public void exhaustedExpeditedQuotaFallsBackToANormalManualJob(){
    JobScheduler scheduler=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    Shadows.shadowOf(scheduler).failExpeditedJob(true);
    StopWidgetProvider.refresh(context,7,true);
    JobInfo job=scheduler.getPendingJob(7402);
    assertNotNull(job);assertFalse(job.isExpedited());assertTrue(job.getExtras().getBoolean("manual"));
    assertTrue(StopWidgetProvider.prefs(context).getLong("refreshing_7",0)>0);
  }
}
