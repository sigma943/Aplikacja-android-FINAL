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
  @Before public void setup(){context=RuntimeEnvironment.getApplication();StopWidgetProvider.prefs(context).edit().clear().putString("config_7","{\"stop\":{\"name\":\"Rzeszów, Podkarpacka Matuszczaka 04\"},\"refreshMode\":\"off\"}").putString("rows_7","[{\"line\":\"108\",\"direction\":\"Gwoźnica Górna\",\"realAtMs\":"+(System.currentTimeMillis()+600000)+"}]").apply();}
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
  @Test public void refreshClickSendsTheWidgetIdAndQueuesExpeditedJobEvenWhenAutomaticRefreshIsOff()throws Exception{
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
