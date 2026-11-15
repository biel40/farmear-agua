import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { NotificationService } from '../../../../core/notifications/notification.service';
import { HydrationJournalService } from '../../services/hydration-journal.service';
import { HydrationReminderService } from '../../services/hydration-reminder.service';
import { HydrationReminderComponent } from './hydration-reminder.component';

describe('HydrationReminderComponent', () => {
  let fixture: ComponentFixture<HydrationReminderComponent>;

  const intervalMinutes = signal(30);
  const isActive = signal(false);
  const nextReminderAt = signal<Date | null>(null);
  const notifications = { testNotification: vi.fn(async () => true) };
  const reminder = {
    activate: vi.fn(async () => {
      isActive.set(true);
      nextReminderAt.set(new Date('2026-09-19T13:30:00.000Z'));
      return true;
    }),
    intervalLabel: computed(() => `${intervalMinutes()} min`),
    intervalMinutes,
    isActive,
    nextReminderAt,
    reminderDue: signal(false),
    notificationError: signal<string | null>(null),
    countdown: signal('30:00'),
    pause: vi.fn(async () => {
      isActive.set(false);
      nextReminderAt.set(null);
    }),
    setInterval: vi.fn((minutes: number) => intervalMinutes.set(minutes)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    intervalMinutes.set(30);
    isActive.set(false);
    nextReminderAt.set(null);
    reminder.reminderDue.set(false);
    reminder.notificationError.set(null);
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [HydrationReminderComponent],
      providers: [
        { provide: HydrationReminderService, useValue: reminder },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HydrationReminderComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends a real notification when previewing in the APK', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    fixture.destroy();
    fixture = TestBed.createComponent(HydrationReminderComponent);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.preview-button')!
      .click();
    await fixture.whenStable();
    expect(notifications.testNotification).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).querySelector('dialog')?.open).toBe(false);
  });

  it('explains how to enable notifications when the native preview is blocked', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    notifications.testNotification.mockResolvedValueOnce(false);
    fixture.destroy();
    fixture = TestBed.createComponent(HydrationReminderComponent);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.preview-button')!
      .click();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Ajustes > Aplicaciones > Farmear Agua > Notificaciones');
  });

  it('shows the configured interval and inactive status', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector<HTMLSelectElement>('#interval-preset')?.value).toBe('30');
    expect(element.textContent).toContain('En pausa');
  });

  it('converts a custom interval in hours to minutes', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const preset = element.querySelector<HTMLSelectElement>('#interval-preset')!;
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const amount = element.querySelector<HTMLInputElement>('#custom-amount')!;
    amount.value = '3';
    amount.dispatchEvent(new Event('input'));

    const unit = element.querySelector<HTMLSelectElement>('#custom-unit')!;
    unit.value = 'hours';
    unit.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(reminder.setInterval).toHaveBeenLastCalledWith(180);
  });

  it('accepts a custom interval greater than 24 minutes', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const preset = element.querySelector<HTMLSelectElement>('#interval-preset')!;
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const amount = element.querySelector<HTMLInputElement>('#custom-amount')!;
    amount.value = '90';
    amount.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(reminder.setInterval).toHaveBeenLastCalledWith(90);
  });

  it('activates and pauses reminders from the primary action', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const action = element.querySelector<HTMLButtonElement>('[data-testid="reminder-action"]')!;

    action.click();
    await fixture.whenStable();
    expect(reminder.activate).toHaveBeenCalledOnce();

    action.click();
    await fixture.whenStable();
    expect(reminder.pause).toHaveBeenCalledOnce();
  });

  it('records a selected amount and undoes the last drink', async () => {
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.amount-picker button:last-child')!.click();
    element.querySelector<HTMLButtonElement>('.add-water')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.water-total strong')?.textContent).toBe('500');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
    element.querySelector<HTMLButtonElement>('.undo-button')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.water-total strong')?.textContent).toBe('0');
    expect(element.querySelector<HTMLButtonElement>('.undo-button')!.disabled).toBe(true);
  });

  it('replays the visual feedback for each drink with the recorded amount', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const addWater = element.querySelector<HTMLButtonElement>('.add-water')!;
    const largeAmount = element.querySelector<HTMLButtonElement>(
      '.amount-picker button:last-child',
    )!;

    addWater.click();
    await fixture.whenStable();
    const firstPop = element.querySelector('.water-pop');
    expect(firstPop?.textContent).toContain('+250 ml');

    largeAmount.click();
    await fixture.whenStable();
    expect(firstPop?.textContent).toContain('+250 ml');

    addWater.click();
    await fixture.whenStable();
    const secondPop = element.querySelector('.water-pop');
    expect(secondPop).not.toBe(firstPop);
    expect(secondPop?.textContent).toContain('+500 ml');
  });

  it('changes the daily expression as drinks are added and undone', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const scene = element.querySelector('.water-scene');
    const addWater = element.querySelector<HTMLButtonElement>('.add-water')!;
    const journal = TestBed.inject(HydrationJournalService);

    expect(scene?.getAttribute('data-mood')).toBe('waiting');

    addWater.click();
    await fixture.whenStable();
    expect(scene?.getAttribute('data-mood')).toBe('warming');

    journal.addDrink(750);
    await fixture.whenStable();
    expect(scene?.getAttribute('data-mood')).toBe('happy');
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/50\s*%/);

    journal.addDrink(999);
    await fixture.whenStable();
    expect(scene?.getAttribute('data-mood')).toBe('happy');
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/99\s*%/);

    addWater.click();
    await fixture.whenStable();
    expect(scene?.getAttribute('data-mood')).toBe('celebrating');
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/100\s*%/);
    expect(element.querySelector('.splash--goal')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('.undo-button')!.click();
    await fixture.whenStable();
    expect(scene?.getAttribute('data-mood')).toBe('happy');
    expect(element.querySelector('.splash--goal')).toBeNull();
  });

  it('uses capped progress for the elapsed week when the weekly view is selected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const journal = TestBed.inject(HydrationJournalService);
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    journal.addDrink(5000);
    vi.setSystemTime(new Date(2026, 9, 22, 12));
    journal.addDrink(2000);
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    journal.addDrink(1000);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const scene = element.querySelector('.water-scene');
    const week = element.querySelector<HTMLButtonElement>('[data-period="week"]')!;
    week.click();
    await fixture.whenStable();

    expect(week.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.mascot-week-note')?.textContent).toMatch(/1\s+de\s+3/);
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/50\s*%/);
    expect(scene?.getAttribute('data-mood')).toBe('happy');

    journal.setGoal(3000);
    await fixture.whenStable();
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/44\s*%/);
    expect(scene?.getAttribute('data-mood')).toBe('warming');

    element.querySelector<HTMLButtonElement>('[data-period="today"]')!.click();
    await fixture.whenStable();
    expect(week.getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.mascot-percent')?.textContent).toMatch(/33\s*%/);
  });

  it('celebrates the new daily goal even before the date refresh timer runs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const journal = TestBed.inject(HydrationJournalService);
    vi.setSystemTime(new Date(2026, 9, 19, 23, 59));
    journal.setGoal(500);
    journal.addDrink(500);
    await fixture.whenStable();

    vi.setSystemTime(new Date(2026, 9, 20, 0, 1));
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.amount-picker button:last-child')!.click();
    element.querySelector<HTMLButtonElement>('.add-water')!.click();
    await fixture.whenStable();

    expect(element.querySelector('.splash--goal')).not.toBeNull();
  });

  it('persists the selected theme', async () => {
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.theme-switch button:last-child')!.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.parse(localStorage.getItem('hydration-theme')!)).toBe('dark');
    fixture.destroy();
    fixture = TestBed.createComponent(HydrationReminderComponent);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.theme-switch button:last-child')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('rejects a fractional custom interval and recovers when choosing a preset', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const preset = element.querySelector<HTMLSelectElement>('#interval-preset')!;
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const amount = element.querySelector<HTMLInputElement>('#custom-amount')!;
    amount.value = '1.5';
    amount.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(
      element.querySelector<HTMLButtonElement>('[data-testid="reminder-action"]')!.disabled,
    ).toBe(true);
    expect(reminder.setInterval).not.toHaveBeenCalledWith(1.5);
    preset.value = '30';
    preset.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(
      element.querySelector<HTMLButtonElement>('[data-testid="reminder-action"]')!.disabled,
    ).toBe(false);
    expect(reminder.setInterval).toHaveBeenLastCalledWith(30);
  });

  it('rejects a custom interval longer than a day', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const preset = element.querySelector<HTMLSelectElement>('#interval-preset')!;
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const amount = element.querySelector<HTMLInputElement>('#custom-amount')!;
    amount.value = '25';
    amount.dispatchEvent(new Event('input'));
    const unit = element.querySelector<HTMLSelectElement>('#custom-unit')!;
    unit.value = 'hours';
    unit.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(
      element.querySelector<HTMLButtonElement>('[data-testid="reminder-action"]')!.disabled,
    ).toBe(true);
    expect(reminder.setInterval).not.toHaveBeenCalledWith(1500);
  });
});
