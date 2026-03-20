import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

class NotificationService {
  async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      const { display } = await LocalNotifications.requestPermissions();
      return display === 'granted';
    } else if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  async sendNotification(title: string, body: string, id: number = Math.floor(Math.random() * 100000)) {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            attachments: [],
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}

export const notificationService = new NotificationService();
