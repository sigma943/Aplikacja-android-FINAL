package pl.pkslive.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class WidgetRefreshPolicyTest {
  @Test public void defaultsProtectExistingWidgets(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(0,null);assertEquals(30,p.minutes);assertFalse(p.allowed(true));assertTrue(p.allowed(false));}
  @Test public void disabledNeverUpdatesAutomatically(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(15,"off");assertFalse(p.due(0,0,999999999,false));assertFalse(p.due(0,0,999999999,true));}
  @Test public void saverIsPerWidget(){assertFalse(new WidgetRefreshPolicy(30,"battery-saver").allowed(true));assertTrue(new WidgetRefreshPolicy(30,"always").allowed(true));}
  @Test public void intervalAlsoThrottlesFailedRequests(){WidgetRefreshPolicy p=new WidgetRefreshPolicy(120,"always");long interval=120*60000L;assertFalse(p.due(1000,0,interval,true));assertTrue(p.due(1000,0,interval+1000,true));assertFalse(p.due(0,1000,interval,true));}
  @Test public void supportedIntervals(){for(int minutes:new int[]{15,30,60,120})assertEquals(minutes*60000L,new WidgetRefreshPolicy(minutes,"always").intervalMillis());assertEquals(30,new WidgetRefreshPolicy(1,"always").minutes);}
}
