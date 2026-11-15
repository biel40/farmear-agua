import { Capacitor } from '@capacitor/core';
import { TestBed } from '@angular/core/testing';
import {
  HYDRATION_NOTIFICATION_PLUGIN,
  LOCAL_NOTIFICATION_PLUGIN,
  NotificationService,
} from './notification.service';

const { local, native } = {
  local: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    cancel: vi.fn(),
    schedule: vi.fn(),
  },
  native: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    test: vi.fn(),
  },
};

describe('NotificationService on Android', () => {
  let service: NotificationService;
  const next = new Date('2026-11-15T12:30:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    local.checkPermissions.mockResolvedValue({ display: 'granted' });
    local.requestPermissions.mockResolvedValue({ display: 'granted' });
    native.getStatus.mockResolvedValue({
      active: true,
      intervalMinutes: 30,
      nextReminderAt: next.getTime(),
      notificationsEnabled: true,
    });
    native.schedule.mockResolvedValue({ nextReminderAt: next.getTime() });
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCAL_NOTIFICATION_PLUGIN, useValue: local },
        { provide: HYDRATION_NOTIFICATION_PLUGIN, useValue: native },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('migrates the old repeating alarm to the native idle-aware scheduler', async () => {
    expect(await service.scheduleReminders(45)).toEqual(next);
    expect(local.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7001 }] });
    expect(native.schedule).toHaveBeenCalledWith({ intervalMinutes: 45 });
    expect(local.schedule).not.toHaveBeenCalled();
  });

  it('checks the channel as well as the app notification permission', async () => {
    native.getStatus.mockResolvedValue({ notificationsEnabled: false });
    expect(await service.requestPermissions()).toBe(false);
    expect(local.requestPermissions).not.toHaveBeenCalled();
  });

  it('does not schedule or test when the user denies permission', async () => {
    local.checkPermissions.mockResolvedValue({ display: 'prompt' });
    local.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await service.testNotification()).toBe(false);
    expect(native.test).not.toHaveBeenCalled();
  });

  it('restores existing native timing without restarting its interval or asking permission', async () => {
    expect(await service.restoreReminders(30, next)).toEqual(next);
    expect(local.requestPermissions).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
  });

  it('repairs a missing alarm from the persisted app deadline', async () => {
    native.getStatus.mockResolvedValue({ active: false, notificationsEnabled: true });
    expect(await service.restoreReminders(45, next)).toEqual(next);
    expect(native.schedule).toHaveBeenCalledWith({
      intervalMinutes: 45,
      nextReminderAt: next.getTime(),
    });
  });

  it.each(['permission', 'channel'])(
    'pauses native reminders when %s is blocked',
    async (blocked) => {
      if (blocked === 'permission') {
        local.checkPermissions.mockResolvedValue({ display: 'denied' });
      } else {
        native.getStatus.mockResolvedValue({ notificationsEnabled: false });
      }
      expect(await service.restoreReminders(30, next)).toBeNull();
      expect(native.cancel).toHaveBeenCalledOnce();
      expect(local.cancel).toHaveBeenCalledOnce();
      expect(native.schedule).not.toHaveBeenCalled();
      expect(local.requestPermissions).not.toHaveBeenCalled();
    },
  );

  it('sends the preview through the same native notification path', async () => {
    expect(await service.testNotification()).toBe(true);
    expect(native.test).toHaveBeenCalledOnce();
    expect(native.schedule).not.toHaveBeenCalled();
  });

  it('cancels both the new scheduler and any legacy repeating alarm', async () => {
    await service.cancelReminders();
    expect(native.cancel).toHaveBeenCalledOnce();
    expect(local.cancel).toHaveBeenCalledOnce();
  });

  it('leaves browser scheduling in the app without calling native APIs', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    await service.scheduleReminders(30);
    await service.cancelReminders();
    expect(await service.restoreReminders(30, next)).toBeUndefined();
    expect(native.schedule).not.toHaveBeenCalled();
    expect(native.getStatus).not.toHaveBeenCalled();
    expect(local.cancel).not.toHaveBeenCalled();
  });
});
