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
    cancelReminders: vi.fn(async () => undefined),
    requestPermissions: vi.fn(async () => true),
    scheduleReminders: vi.fn(async () => new Date('2026-09-19T13:30:00.000Z')),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    vi.clearAllMocks();
    storage.get.mockReturnValue(savedConfiguration);

    TestBed.configureTestingModule({
      providers: [
        HydrationReminderService,
        { provide: NotificationService, useValue: notifications },
        { provide: StorageService, useValue: storage },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

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
