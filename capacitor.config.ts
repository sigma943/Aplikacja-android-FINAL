import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pl.pkslive.app',
  appName: 'PKS Live',
  webDir: 'out',
  plugins: {
    CapacitorHttp: {
      // Firebase WebChannel needs browser fetch/XHR. Transport APIs use
      // CapacitorHttp.request explicitly and do not need global patching.
      enabled: false,
    },
  },
};

export default config;
