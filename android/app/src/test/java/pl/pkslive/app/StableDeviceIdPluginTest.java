package pl.pkslive.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class StableDeviceIdPluginTest {
  @Test public void productionIdentityRemainsExactlyUnchanged() {
    assertEquals("0123456789abcdef", StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app", "0123456789abcdef"));
    assertEquals("", StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app", null));
  }
  @Test public void testIdentityIsSeparateStableAndAcceptedByExistingRegistration() {
    String id = StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app.releasetest", "0123456789abcdef");
    assertTrue(id.matches("[a-f0-9]{16}"));
    assertNotEquals("0123456789abcdef", id);
    assertEquals(id, StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app.releasetest", "0123456789abcdef"));
    assertNotEquals(id, StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app.releasetest", "fedcba9876543210"));
    assertEquals("", StableDeviceIdPlugin.installationIdentifier("pl.pkslive.app.releasetest", ""));
  }
}
