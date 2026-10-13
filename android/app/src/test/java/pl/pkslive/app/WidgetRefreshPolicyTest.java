package pl.pkslive.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class WidgetRefreshPolicyTest {
  @Test public void defaultsProtectExistingWidgets(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(0,null);assertEquals(30,p.minutes);assertFalse(p.allowed(true));assertTrue(p.allowed(false));}
  @Test public void disabledNeverUpdatesAutomatically(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(15,"off");assertFalse(p.due(0,0,999999999,false));assertFalse(p.due(0,0,999999999,true));}
  @Test public void saverIsPerWidget(){assertFalse(new WidgetRefreshPolicy(30,"battery-saver").allowed(true));assertTrue(new WidgetRefreshPolicy(30,"always").allowed(true));}
  @Test public void intervalAlsoThrottlesFailedRequests(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(120,"always");long interval=120*60000L;assertFalse(p.due(1000,0,interval,true));assertTrue(p.due(1000,0,interval+1000,true));assertFalse(p.due(0,1000,interval,true));}
  @Test public void supportedIntervals(){for(int minutes:new int[]{1,2,5,7,15,30,60,120,2147483647})assertEquals(minutes*60000L,new WidgetRefreshPolicy(minutes,"always").intervalMillis());assertEquals(30,new WidgetRefreshPolicy(-1,"always").minutes);}
  @Test public void nextRunUsesRemainingTimeAndRecentAttempts(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(2,"always");assertEquals(90000L,p.nextDelay(100000,0,130000,false));assertEquals(1000L,p.nextDelay(100000,0,230000,false));assertEquals(110000L,p.nextDelay(100000,200000,210000,false));}
  @Test public void pausedAndDisabledWidgetsDoNotSpin(){assertEquals(Long.MAX_VALUE,new WidgetRefreshPolicy(1,"off").nextDelay(0,0,999999,true));assertEquals(900000L,new WidgetRefreshPolicy(1,"battery-saver").nextDelay(0,0,999999,true));assertEquals(1000L,new WidgetRefreshPolicy(1,"always").nextDelay(0,0,999999,true));}
}
