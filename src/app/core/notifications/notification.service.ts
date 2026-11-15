import { inject, Injectable, InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HydrationNotifications } from './hydration-notifications';

const HYDRATION_NOTIFICATION_ID = 7_001;

type LocalNotificationApi = Pick<
  typeof LocalNotifications,
  'checkPermissions' | 'requestPermissions' | 'schedule' | 'cancel'
>;
// Keep Capacitor proxies behind plain adapters: Angular checks DI values for
// lifecycle hooks, which a plugin proxy interprets as native method calls.
export const LOCAL_NOTIFICATION_PLUGIN = new InjectionToken<LocalNotificationApi>(
  'LocalNotifications',
  {
    providedIn: 'root',
    factory: () => ({
      checkPermissions: () => LocalNotifications.checkPermissions(),
      requestPermissions: () => LocalNotifications.requestPermissions(),
      schedule: (options) => LocalNotifications.schedule(options),
      cancel: (options) => LocalNotifications.cancel(options),
    }),
  },
);
export const HYDRATION_NOTIFICATION_PLUGIN = new InjectionToken<typeof HydrationNotifications>(
  'HydrationNotifications',
  {
    providedIn: 'root',
    factory: () => ({
      schedule: (options) => HydrationNotifications.schedule(options),
      cancel: () => HydrationNotifications.cancel(),
      getStatus: () => HydrationNotifications.getStatus(),
      test: () => HydrationNotifications.test(),
    }),
  },
);

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly local = inject(LOCAL_NOTIFICATION_PLUGIN);
  private readonly android = inject(HYDRATION_NOTIFICATION_PLUGIN);

  async requestPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    const current = await this.local.checkPermissions();
    if (current.display !== 'granted') {
      const requested = await this.local.requestPermissions();
      if (requested.display !== 'granted') return false;
    }

    return this.isAndroid() ? (await this.android.getStatus()).notificationsEnabled : true;
  }

  async scheduleReminders(intervalMinutes: number): Promise<Date> {
    const nextReminderAt = new Date(Date.now() + intervalMinutes * 60_000);

    if (!Capacitor.isNativePlatform()) {
      return nextReminderAt;
    }

    if (this.isAndroid()) {
      // Remove the old Capacitor repeating alarm when upgrading an existing APK.
      await this.cancelLegacyReminder();
      const scheduled = await this.android.schedule({ intervalMinutes });
      return new Date(scheduled.nextReminderAt);
    }

    await this.local.schedule({
      notifications: [
        {
          id: HYDRATION_NOTIFICATION_ID,
          title: '💧 Hora de beber agua',
          body: 'Toca beber un poco de agua. Tu yo del futuro te lo agradecerá.',
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

    if (this.isAndroid()) await this.android.cancel();
    await this.cancelLegacyReminder();
  }

  async rescheduleReminders(intervalMinutes: number): Promise<Date> {
    await this.cancelReminders();
    return this.scheduleReminders(intervalMinutes);
  }

  async restoreReminders(
    intervalMinutes: number,
    nextReminderAt: Date,
  ): Promise<Date | null | undefined> {
    if (!this.isAndroid()) return undefined;

    const permissions = await this.local.checkPermissions();
    const status = await this.android.getStatus();
    if (permissions.display !== 'granted' || !status.notificationsEnabled) {
      await this.cancelReminders();
      return null;
    }

    await this.cancelLegacyReminder();
    if (status.active && status.intervalMinutes === intervalMinutes) {
      return new Date(status.nextReminderAt);
    }

    const scheduled = await this.android.schedule({
      intervalMinutes,
      nextReminderAt: nextReminderAt.getTime(),
    });
    return new Date(scheduled.nextReminderAt);
  }

  async testNotification(): Promise<boolean> {
    if (!(await this.requestPermissions())) return false;
    if (this.isAndroid()) {
      await this.android.test();
    } else if (Capacitor.isNativePlatform()) {
      await this.local.schedule({
        notifications: [
          { id: 7_002, title: '💧 Prueba de aviso', body: 'Las notificaciones están activadas.' },
        ],
      });
    }
    return true;
  }

  private isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  private async cancelLegacyReminder(): Promise<void> {
    await this.local.cancel({ notifications: [{ id: HYDRATION_NOTIFICATION_ID }] });
  }
}
