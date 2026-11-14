import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.narra.notch',
  appName: 'narra-notch',
  webDir: 'dist',
  server: {
    // 'http' so the app origin matches the plain-http companion server: Android's
    // WebView blocks http EventSource from an https origin, which killed live sync.
    androidScheme: 'http'
  },
  // App origin is https://localhost; the PC companion server is plain http,
  // so Android WebView must allow mixed content or every fetch is blocked.
  android: {
    allowMixedContent: true
  }
};

export default config;
