import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const HYDRATION_NOTIFICATION_ID = 7_001;
const HYDRATION_CHANNEL_ID = 'hydration-reminders';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  async requestPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      return true;
    }

    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  }

  async scheduleReminders(intervalMinutes: number): Promise<Date> {
    const nextReminderAt = new Date(Date.now() + intervalMinutes * 60_000);

    if (!Capacitor.isNativePlatform()) {
      return nextReminderAt;
    }

    await this.ensureAndroidChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: HYDRATION_NOTIFICATION_ID,
          title: '💧 Hora de beber agua',
          body: 'Toca beber un poco de agua. Tu yo del futuro te lo agradecerá.',
          channelId: HYDRATION_CHANNEL_ID,
          schedule: {
            allowWhileIdle: true,
            at: nextReminderAt,
            repeats: true,
          },
          isExactNotification: false,
        },
      ],
    });

    return nextReminderAt;
  }

  async cancelReminders(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    await LocalNotifications.cancel({
      notifications: [{ id: HYDRATION_NOTIFICATION_ID }],
    });
  }

  async rescheduleReminders(intervalMinutes: number): Promise<Date> {
    await this.cancelReminders();
    return this.scheduleReminders(intervalMinutes);
  }

  private async ensureAndroidChannel(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }

    await LocalNotifications.createChannel({
      id: HYDRATION_CHANNEL_ID,
      name: 'Recordatorios de hidratación',
      description: 'Avisos para beber agua durante el día',
      importance: 4,
      visibility: 1,
    });
  }
}