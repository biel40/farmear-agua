import { registerPlugin } from '@capacitor/core';

export interface HydrationNotificationStatus {
  active: boolean;
  intervalMinutes: number;
  nextReminderAt: number;
  notificationsEnabled: boolean;
}

interface HydrationNotificationsPlugin {
  schedule(options: {
    intervalMinutes: number;
    nextReminderAt?: number;
  }): Promise<{ nextReminderAt: number }>;
  cancel(): Promise<void>;
  getStatus(): Promise<HydrationNotificationStatus>;
  test(): Promise<void>;
}

export const HydrationNotifications =
  registerPlugin<HydrationNotificationsPlugin>('HydrationNotifications');
