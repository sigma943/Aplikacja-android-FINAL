package pl.pkslive.app;
import android.content.Intent;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=31)
public class AdminStatisticsExportPluginTest {
  @Test public void exportUsesSystemDocumentPickerWithoutStoragePermissions() {
    Intent intent=AdminStatisticsExportPlugin.documentIntent("pks-live-statystyki-7-dni.csv");
    assertEquals(Intent.ACTION_CREATE_DOCUMENT,intent.getAction());
    assertEquals("text/csv",intent.getType());
    assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE));
    assertEquals("pks-live-statystyki-7-dni.csv",intent.getStringExtra(Intent.EXTRA_TITLE));
    assertNull(intent.getData());
  }
}
