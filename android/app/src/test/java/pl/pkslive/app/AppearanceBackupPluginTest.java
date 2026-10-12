package pl.pkslive.app;
import android.content.Intent;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class)
@Config(sdk=31)
public class AppearanceBackupPluginTest {
 @Test public void saveAndLoadUseSystemJsonDocumentsWithoutStoragePermissions(){
  Intent save=AppearanceBackupPlugin.documentIntent(true),load=AppearanceBackupPlugin.documentIntent(false);
  assertEquals(Intent.ACTION_CREATE_DOCUMENT,save.getAction());assertEquals(Intent.ACTION_OPEN_DOCUMENT,load.getAction());assertEquals("application/json",save.getType());assertEquals("application/json",load.getType());assertEquals("pks-live-wyglad.json",save.getStringExtra(Intent.EXTRA_TITLE));assertTrue(load.hasCategory(Intent.CATEGORY_OPENABLE));assertNull(load.getData());assertEquals(262144,AppearanceBackupPlugin.LIMIT);
 }
}
