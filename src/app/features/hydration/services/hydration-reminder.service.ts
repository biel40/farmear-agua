import { computed, inject, Injectable, signal } from '@angular/core';
import { NotificationService } from '../../../core/notifications/notification.service';
import { StorageService } from '../../../core/storage/storage.service';
import { HydrationConfiguration } from '../models/hydration-configuration';

const STORAGE_KEY = 'hydration-reminder';
const DEFAULT_INTERVAL_MINUTES = 30;

@Injectable({ providedIn: 'root' })
export class HydrationReminderService {
  private readonly notifications = inject(NotificationService);
  private readonly storage = inject(StorageService);
  private readonly saved = this.storage.get<HydrationConfiguration>(STORAGE_KEY);

  readonly intervalMinutes = signal(this.saved?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES);
  readonly isActive = signal(this.saved?.active ?? false);
  readonly nextReminderAt = signal(this.parseDate(this.saved?.nextReminderAt));
  readonly intervalLabel = computed(() => this.formatInterval(this.intervalMinutes()));

  setInterval(intervalMinutes: number): void {
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
      throw new RangeError('El intervalo debe ser un número entero mayor que cero.');
    }

    this.intervalMinutes.set(intervalMinutes);
    this.persist();
  }

  async activate(): Promise<boolean> {
    const permissionGranted = await this.notifications.requestPermissions();
    if (!permissionGranted) {
      return false;
    }

    const nextReminderAt = await this.notifications.scheduleReminders(this.intervalMinutes());
    this.nextReminderAt.set(nextReminderAt);
    this.isActive.set(true);
    this.persist();
    return true;
  }

  async pause(): Promise<void> {
    await this.notifications.cancelReminders();
    this.isActive.set(false);
    this.nextReminderAt.set(null);
    this.persist();
  }

  private persist(): void {
    this.storage.set<HydrationConfiguration>(STORAGE_KEY, {
      active: this.isActive(),
      intervalMinutes: this.intervalMinutes(),
      nextReminderAt: this.nextReminderAt()?.toISOString() ?? null,
    });
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatInterval(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
}