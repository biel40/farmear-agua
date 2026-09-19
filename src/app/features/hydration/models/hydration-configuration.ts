export interface HydrationConfiguration {
  active: boolean;
  intervalMinutes: number;
  nextReminderAt: string | null;
}