import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uk.splinteredapex.healthmonitor',
  appName: 'Health Recovery',
  webDir: 'dist',
  android: {
    // No remote content: the app is fully bundled and works offline.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
