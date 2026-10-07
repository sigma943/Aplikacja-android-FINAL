package pl.pkslive.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class WidgetLayoutMetricsTest {
  @Test public void smallWidgetFitsACompleteDepartureWithoutFooter(){WidgetLayoutMetrics m=new WidgetLayoutMetrics(70);assertTrue(m.compact);assertFalse(m.footerVisible);assertEquals(1,m.capacity);assertTrue(m.reservedHeight+m.capacity*m.rowHeight<=70);}
  @Test public void resizingNeverAddsClippedRowsOrReducesCapacity(){int previous=0;for(int height=60;height<=500;height++){WidgetLayoutMetrics m=new WidgetLayoutMetrics(height);assertTrue(m.capacity>=previous);if(m.capacity>0)assertTrue(m.reservedHeight+m.capacity*m.rowHeight<=height);previous=m.capacity;}}
  @Test public void largerLayoutsShowMoreInformation(){assertEquals(2,new WidgetLayoutMetrics(120).capacity);assertEquals(4,new WidgetLayoutMetrics(180).capacity);assertTrue(new WidgetLayoutMetrics(180).footerVisible);}
}
