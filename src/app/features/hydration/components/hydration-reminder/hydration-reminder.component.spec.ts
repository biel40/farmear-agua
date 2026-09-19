import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HydrationReminderService } from '../../services/hydration-reminder.service';
import { HydrationReminderComponent } from './hydration-reminder.component';

describe('HydrationReminderComponent', () => {
  let fixture: ComponentFixture<HydrationReminderComponent>;

  const intervalMinutes = signal(30);
  const isActive = signal(false);
  const nextReminderAt = signal<Date | null>(null);
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

    await TestBed.configureTestingModule({
      imports: [HydrationReminderComponent],
      providers: [{ provide: HydrationReminderService, useValue: reminder }],
    }).compileComponents();

    fixture = TestBed.createComponent(HydrationReminderComponent);
    await fixture.whenStable();
  });

  it('shows the configured interval and inactive status', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('30 min');
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
});