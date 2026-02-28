import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livematch.tracker',
  appName: 'Live Match Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    BackgroundRunner: {
      label: 'com.livematch.tracker.background',
      src: 'background.js',
      event: 'checkPlayers',
      repeat: true,
      interval: 1,
      autoStart: true
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#488AFF",
      sound: "beep.wav",
    }
  }
};

export default config;
