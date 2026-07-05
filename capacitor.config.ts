import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hiddenwatermark.app',
  appName: '隐藏水印大师',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
