import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { StorageService } from '../../../core/storage/storage.service';
import { HydrationReminderService } from './hydration-reminder.service';

describe('HydrationReminderService', () => {
  const savedConfiguration = {
    active: true,
    intervalMinutes: 45,
    nextReminderAt: '2026-09-19T12:45:00.000Z',
  };

  const storage = {
    get: vi.fn(() => savedConfiguration),
    set: vi.fn(),
  };

  const notifications = {
    cancelReminders: vi.fn(async (): Promise<void> => undefined),
    requestPermissions: vi.fn(async () => true),
    scheduleReminders: vi.fn(async () => new Date('2026-09-19T13:30:00.000Z')),
    restoreReminders: vi.fn(async (): Promise<Date | null | undefined> => undefined),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    vi.clearAllMocks();
    notifications.restoreReminders.mockReset().mockResolvedValue(undefined);
    storage.get.mockReturnValue(savedConfiguration);

    TestBed.configureTestingModule({
      providers: [
        HydrationReminderService,
        { provide: NotificationService, useValue: notifications },
        { provide: StorageService, useValue: storage },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  it('opens an in-app reminder when due and advances the recurring countdown', () => {
    const service = TestBed.inject(HydrationReminderService);
    vi.advanceTimersByTime(45 * 60_000);
    expect(service.reminderDue()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe('2026-09-19T13:30:00.000Z');
    expect(service.countdown()).toBe('45:00');
    service.reminderDue.set(false);
    vi.advanceTimersByTime(1000);
    expect(service.reminderDue()).toBe(false);
    expect(service.countdown()).toBe('44:59');
  });

  it('catches up after suspension with one reminder and a future deadline', () => {
    const service = TestBed.inject(HydrationReminderService);
    vi.setSystemTime(new Date('2026-09-19T15:00:00.000Z'));
    vi.advanceTimersByTime(1000);
    expect(service.reminderDue()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe('2026-09-19T15:45:00.000Z');
  });

  it('does not emit in-app reminders after pausing', async () => {
    const service = TestBed.inject(HydrationReminderService);
    await service.pause();
    vi.advanceTimersByTime(60 * 60_000);
    expect(service.reminderDue()).toBe(false);
    expect(service.countdown()).toBe('—');
  });

  it('rejects invalid and fractional intervals', () => {
    const service = TestBed.inject(HydrationReminderService);
    for (const minutes of [0, -1, 1.5, NaN, 1441]) {
      expect(() => service.setInterval(minutes)).toThrow(RangeError);
    }
  });

  it('restores the persisted reminder configuration', () => {
    const service = TestBed.inject(HydrationReminderService);

    expect(service.isActive()).toBe(true);
    expect(service.intervalMinutes()).toBe(45);
    expect(service.nextReminderAt()?.toISOString()).toBe(savedConfiguration.nextReminderAt);
  });

  it('reconciles saved active reminders without requesting permission again', async () => {
    const nextReminderAt = new Date('2026-09-19T12:30:00.000Z');
    notifications.restoreReminders.mockResolvedValueOnce(nextReminderAt);
    const service = TestBed.inject(HydrationReminderService);

    await vi.advanceTimersByTimeAsync(0);

    expect(notifications.restoreReminders).toHaveBeenCalledWith(
      45,
      new Date(savedConfiguration.nextReminderAt),
    );
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
    expect(service.isActive()).toBe(true);
    expect(service.nextReminderAt()).toEqual(nextReminderAt);
    expect(service.countdown()).toBe('30:00');
    expect(service.notificationError()).toBeNull();
  });

  it('keeps browser reminder dates when no native reconciliation is needed', async () => {
    const service = TestBed.inject(HydrationReminderService);

    await vi.advanceTimersByTimeAsync(0);

    expect(service.isActive()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe(savedConfiguration.nextReminderAt);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('clears a saved active state when Android notification permission was revoked', async () => {
    notifications.restoreReminders.mockResolvedValueOnce(null);
    const service = TestBed.inject(HydrationReminderService);
    service.reminderDue.set(true);

    await vi.advanceTimersByTimeAsync(0);

    expect(service.isActive()).toBe(false);
    expect(service.nextReminderAt()).toBeNull();
    expect(service.reminderDue()).toBe(false);
    expect(service.countdown()).toBe('—');
    expect(service.notificationError()).toContain('Ajustes');
    expect(storage.set).toHaveBeenLastCalledWith('hydration-reminder', {
      active: false,
      intervalMinutes: 45,
      nextReminderAt: null,
    });
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
  });

  it('reports failed native restoration and allows activation to recover', async () => {
    notifications.restoreReminders.mockRejectedValueOnce(new Error('Native schedule failed'));
    const service = TestBed.inject(HydrationReminderService);

    await vi.advanceTimersByTimeAsync(0);

    expect(notifications.cancelReminders).toHaveBeenCalledOnce();
    expect(service.isActive()).toBe(false);
    expect(service.notificationError()).toContain('restaurar');
    expect(await service.activate()).toBe(true);
    expect(service.notificationError()).toBeNull();
    expect(service.isActive()).toBe(true);
  });

  it('keeps the pause action available when restoration and native cancellation both fail', async () => {
    notifications.restoreReminders.mockRejectedValueOnce(new Error('Native status failed'));
    notifications.cancelReminders.mockRejectedValueOnce(new Error('Native cancellation failed'));
    const service = TestBed.inject(HydrationReminderService);

    await vi.advanceTimersByTimeAsync(0);

    expect(service.isActive()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe(savedConfiguration.nextReminderAt);
    expect(service.notificationError()).toContain('comprobar ni pausar');
    expect(storage.set).not.toHaveBeenCalled();

    await service.pause();

    expect(service.isActive()).toBe(false);
    expect(service.notificationError()).toBeNull();
  });

  it('does not clear a new activation after a failed restoration finishes native cancellation', async () => {
    const cancellation = deferred<void>();
    notifications.restoreReminders.mockRejectedValueOnce(new Error('Native restoration failed'));
    notifications.cancelReminders.mockReturnValueOnce(cancellation.promise);
    const service = TestBed.inject(HydrationReminderService);
    await vi.advanceTimersByTimeAsync(0);
    expect(notifications.cancelReminders).toHaveBeenCalledOnce();

    const activating = service.activate();
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
    cancellation.resolve(undefined);

    expect(await activating).toBe(true);
    expect(service.isActive()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe('2026-09-19T13:30:00.000Z');
    expect(service.notificationError()).toBeNull();
    expect(storage.set).not.toHaveBeenCalledWith('hydration-reminder', {
      active: false,
      intervalMinutes: 45,
      nextReminderAt: null,
    });
  });

  it('reconciles again when the app becomes visible and merges duplicate events', async () => {
    const service = TestBed.inject(HydrationReminderService);
    const page = TestBed.inject(DOCUMENT);
    const visibility = vi.spyOn(page, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(0);

    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(notifications.restoreReminders).toHaveBeenCalledOnce();

    const nextReminderAt = new Date('2026-09-19T12:20:00.000Z');
    notifications.restoreReminders.mockResolvedValueOnce(nextReminderAt);
    visibility.mockReturnValue('visible');
    page.dispatchEvent(new Event('visibilitychange'));
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(notifications.restoreReminders).toHaveBeenCalledTimes(2);
    expect(service.nextReminderAt()).toEqual(nextReminderAt);
  });

  it('does not restore reminders while paused', async () => {
    storage.get.mockReturnValue({ ...savedConfiguration, active: false });
    const service = TestBed.inject(HydrationReminderService);
    const page = TestBed.inject(DOCUMENT);
    vi.spyOn(page, 'visibilityState', 'get').mockReturnValue('visible');

    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(service.isActive()).toBe(false);
    expect(notifications.restoreReminders).not.toHaveBeenCalled();
  });

  it('finishes native restoration before cancelling when paused during restoration', async () => {
    const restoration = deferred<Date | null | undefined>();
    notifications.restoreReminders.mockReturnValueOnce(restoration.promise);
    const service = TestBed.inject(HydrationReminderService);
    await vi.advanceTimersByTimeAsync(0);

    const pausing = service.pause();
    expect(notifications.cancelReminders).not.toHaveBeenCalled();
    restoration.resolve(new Date('2026-09-19T12:30:00.000Z'));
    await pausing;

    expect(notifications.cancelReminders).toHaveBeenCalledOnce();
    expect(service.isActive()).toBe(false);
    expect(service.nextReminderAt()).toBeNull();
    expect(service.notificationError()).toBeNull();
  });

  it('ignores a stale restoration failure when a new activation succeeds', async () => {
    const restoration = deferred<Date | null | undefined>();
    notifications.restoreReminders.mockReturnValueOnce(restoration.promise);
    const service = TestBed.inject(HydrationReminderService);
    await vi.advanceTimersByTimeAsync(0);

    const activating = service.activate();
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
    restoration.reject(new Error('Old restoration failed'));

    expect(await activating).toBe(true);
    expect(service.isActive()).toBe(true);
    expect(service.nextReminderAt()?.toISOString()).toBe('2026-09-19T13:30:00.000Z');
    expect(service.notificationError()).toBeNull();
    expect(notifications.cancelReminders).not.toHaveBeenCalled();
  });

  it('activates reminders only after permission is granted and persists the result', async () => {
    const service = TestBed.inject(HydrationReminderService);
    service.setInterval(30);

    const activated = await service.activate();

    expect(activated).toBe(true);
    expect(notifications.requestPermissions).toHaveBeenCalledOnce();
    expect(notifications.scheduleReminders).toHaveBeenCalledWith(30);
    expect(service.isActive()).toBe(true);
    expect(storage.set).toHaveBeenLastCalledWith('hydration-reminder', {
      active: true,
      intervalMinutes: 30,
      nextReminderAt: '2026-09-19T13:30:00.000Z',
    });
  });

  it('does not activate reminders when permission is denied', async () => {
    notifications.requestPermissions.mockResolvedValueOnce(false);
    const service = TestBed.inject(HydrationReminderService);

    const activated = await service.activate();

    expect(activated).toBe(false);
    expect(notifications.scheduleReminders).not.toHaveBeenCalled();
  });

  it('cancels reminders and clears the next reminder when paused', async () => {
    const service = TestBed.inject(HydrationReminderService);

    await service.pause();

    expect(notifications.cancelReminders).toHaveBeenCalledOnce();
    expect(service.isActive()).toBe(false);
    expect(service.nextReminderAt()).toBeNull();
  });
});
