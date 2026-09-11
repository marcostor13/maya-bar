import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'site.mayacrm.app',
  appName: 'Maya',
  // Build estático del proyecto `mobile` (el build `frontend` es SSR y no sirve aquí).
  webDir: 'dist/mobile/browser',
  server: {
    // Con `https` el origen del WebView es `https://localhost`, lo que mantiene
    // `localStorage` persistente entre arranques y habilita getUserMedia (QR).
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FFFFFF',
      androidSpinnerStyle: 'small',
      spinnerColor: '#E11D48',
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
