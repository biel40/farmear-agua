import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
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

  readonly intervalMinutes = signal(
    Number.isInteger(this.saved?.intervalMinutes) &&
      this.saved!.intervalMinutes >= 1 &&
      this.saved!.intervalMinutes <= 1440
      ? this.saved!.intervalMinutes
      : DEFAULT_INTERVAL_MINUTES,
  );
  readonly isActive = signal(
    this.saved?.active === true && this.parseDate(this.saved?.nextReminderAt) !== null,
  );
  readonly nextReminderAt = signal(
    this.isActive() ? this.parseDate(this.saved?.nextReminderAt) : null,
  );
  readonly intervalLabel = computed(() => this.formatInterval(this.intervalMinutes()));
  readonly reminderDue = signal(false);
  readonly now = signal(Date.now());
  readonly countdown = computed(() => {
    const next = this.nextReminderAt();
    if (!this.isActive() || !next) return '—';
    const seconds = Math.max(0, Math.ceil((next.getTime() - this.now()) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.tick(), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private tick(): void {
    const now = Date.now();
    this.now.set(now);
    const next = this.nextReminderAt();
    if (!this.isActive() || !next || next.getTime() > now) return;
    this.reminderDue.set(true);
    const interval = this.intervalMinutes() * 60_000;
    const missed = Math.floor((now - next.getTime()) / interval) + 1;
    this.nextReminderAt.set(new Date(next.getTime() + missed * interval));
    this.persist();
  }

  setInterval(intervalMinutes: number): void {
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      throw new RangeError('El intervalo debe ser un número entero entre 1 y 1440 minutos.');
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
    this.now.set(Date.now());
    this.isActive.set(true);
    this.persist();
    return true;
  }

  async pause(): Promise<void> {
    await this.notifications.cancelReminders();
    this.isActive.set(false);
    this.nextReminderAt.set(null);
    this.reminderDue.set(false);
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
