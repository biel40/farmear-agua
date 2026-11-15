import { DOCUMENT } from '@angular/common';
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
  private readonly document = inject(DOCUMENT);
  private readonly saved = this.storage.get<HydrationConfiguration>(STORAGE_KEY);
  private notificationOperation: Promise<void> = Promise.resolve();
  private operationVersion = 0;
  private isRestoring = false;

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
  readonly notificationError = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly countdown = computed(() => {
    const next = this.nextReminderAt();
    if (!this.isActive() || !next) return '—';
    const seconds = Math.max(0, Math.ceil((next.getTime() - this.now()) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.tick(), 1000);
    const onVisibilityChange = () => {
      if (this.document.visibilityState === 'visible') void this.restoreReminders();
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
      this.operationVersion++;
    });
    void this.restoreReminders();
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
    const version = ++this.operationVersion;
    this.notificationError.set(null);
    return this.runNotificationOperation(async () => {
      if (version !== this.operationVersion) return false;
      const permissionGranted = await this.notifications.requestPermissions();
      if (version !== this.operationVersion) return false;
      if (!permissionGranted) {
        this.clearActiveReminder();
        return false;
      }

      const nextReminderAt = await this.notifications.scheduleReminders(this.intervalMinutes());
      if (version !== this.operationVersion) return false;
      this.nextReminderAt.set(nextReminderAt);
      this.now.set(Date.now());
      this.isActive.set(true);
      this.persist();
      return true;
    });
  }

  async pause(): Promise<void> {
    const version = ++this.operationVersion;
    this.notificationError.set(null);
    return this.runNotificationOperation(async () => {
      if (version !== this.operationVersion) return;
      await this.notifications.cancelReminders();
      if (version === this.operationVersion) this.clearActiveReminder();
    });
  }

  private async restoreReminders(): Promise<void> {
    const nextReminderAt = this.nextReminderAt();
    if (!this.isActive() || !nextReminderAt || this.isRestoring) return;
    this.isRestoring = true;
    const version = this.operationVersion;
    const intervalMinutes = this.intervalMinutes();
    try {
      const restored = await this.runNotificationOperation(() =>
        version === this.operationVersion
          ? this.notifications.restoreReminders(intervalMinutes, nextReminderAt)
          : Promise.resolve(undefined),
      );
      if (version !== this.operationVersion || restored === undefined) return;
      if (restored === null) {
        this.clearActiveReminder();
        this.notificationError.set(
          'Los avisos están bloqueados. Permite las notificaciones de Farmear Agua en Ajustes y vuelve a activarlos.',
        );
        return;
      }
      this.nextReminderAt.set(restored);
      this.now.set(Date.now());
      this.notificationError.set(null);
      this.persist();
    } catch {
      if (version !== this.operationVersion) return;
      try {
        await this.runNotificationOperation(async () => {
          if (version === this.operationVersion) await this.notifications.cancelReminders();
        });
        if (version !== this.operationVersion) return;
        this.clearActiveReminder();
        this.notificationError.set(
          'No pudimos restaurar los recordatorios. Vuelve a activarlos para intentarlo de nuevo.',
        );
      } catch {
        if (version !== this.operationVersion) return;
        this.notificationError.set(
          'No pudimos comprobar ni pausar los recordatorios. Intenta pausarlos de nuevo.',
        );
      }
    } finally {
      this.isRestoring = false;
    }
  }

  private runNotificationOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.notificationOperation.then(operation);
    // Keep native mutations ordered, even if an earlier request fails.
    this.notificationOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private clearActiveReminder(): void {
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
