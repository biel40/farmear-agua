import { DatePipe, DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { StorageService } from '../../../../core/storage/storage.service';
import { HydrationJournalService, localDateKey } from '../../services/hydration-journal.service';
import { HydrationReminderService } from '../../services/hydration-reminder.service';

type IntervalPreset = '15' | '30' | '45' | '60' | '120' | 'custom';
type IntervalUnit = 'minutes' | 'hours';
type Theme = 'light' | 'dark';

@Component({
  selector: 'app-hydration-reminder',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './hydration-reminder.component.html',
  styleUrls: [
    './hydration-reminder.component.scss',
    './hydration-sidebar.scss',
    './hydration-scene.scss',
    './hydration-daily.scss',
    './hydration-schedule.scss',
    './hydration-activity.scss',
    './hydration-dialog.scss',
    './hydration-motion.scss',
    './hydration-desktop.scss',
    './hydration-mobile.scss',
    './hydration-focus.scss',
  ],
})
export class HydrationReminderComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageService);
  private readonly reminderDialog = viewChild<ElementRef<HTMLDialogElement>>('reminderDialog');
  protected readonly reminder = inject(HydrationReminderService);
  protected readonly journal = inject(HydrationJournalService);
  protected readonly isBusy = signal(false);
  protected readonly feedback = signal<string | null>(null);
  protected readonly toast = signal<{ message: string; visible: boolean } | null>(null);
  protected readonly waterFeedback = signal<
    readonly { id: number; amount: number; goal: boolean }[]
  >([]);
  protected readonly selectedAmount = signal(250);
  protected readonly waterAmounts = [
    { ml: 100, icon: '#i-glass' },
    { ml: 250, icon: '#i-cup' },
    { ml: 500, icon: '#i-bottle' },
  ];
  protected readonly theme = signal<Theme>(this.initialTheme());
  protected readonly activeSection = signal('today');
  protected readonly isNative = Capacitor.isNativePlatform();
  protected readonly currentDate = computed(() => {
    this.journal.today();
    return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(
      new Date(),
    );
  });
  protected readonly latestDrinks = computed(() => this.journal.drinks().slice(-3).reverse());
  protected readonly dailyProgress = computed(() =>
    Math.min(this.journal.progress(), this.journal.remaining() === 0 ? 100 : 99),
  );
  private toastTimer?: ReturnType<typeof setTimeout>;
  private celebrationTimer?: ReturnType<typeof setTimeout>;
  private waterFeedbackId = 0;

  protected readonly intervalOptions: ReadonlyArray<{ label: string; value: IntervalPreset }> = [
    { label: '15 minutos', value: '15' },
    { label: '30 minutos', value: '30' },
    { label: '45 minutos', value: '45' },
    { label: '1 hora', value: '60' },
    { label: '2 horas', value: '120' },
    { label: 'Personalizado', value: 'custom' },
  ];
  protected readonly intervalForm = new FormGroup({
    preset: new FormControl<IntervalPreset>(this.initialPreset(), { nonNullable: true }),
    customAmount: new FormControl(this.reminder.intervalMinutes(), {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(1440),
        Validators.pattern(/^\d+$/),
      ],
    }),
    customUnit: new FormControl<IntervalUnit>('minutes', { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.setAttribute('data-theme', theme);
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#11152b' : '#f2f4ff');
    });
    effect(() => {
      if (this.reminder.reminderDue()) this.openReminder();
    });
    afterNextRender(() => {
      if (this.reminder.reminderDue()) this.openReminder();
    });
    this.intervalForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applySelectedInterval());
    const dayTimer = setInterval(() => this.journal.today.set(localDateKey()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(dayTimer);
      clearTimeout(this.toastTimer);
      clearTimeout(this.celebrationTimer);
    });
  }

  protected setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.storage.set('hydration-theme', theme);
  }

  protected addWater(): void {
    const wasComplete = this.journal.remaining() === 0;
    const amount = this.selectedAmount();
    this.journal.addDrink(amount);
    const goal = !wasComplete && this.journal.remaining() === 0;
    this.waterFeedback.set([{ id: ++this.waterFeedbackId, amount, goal }]);
    clearTimeout(this.celebrationTimer);
    this.celebrationTimer = setTimeout(() => this.waterFeedback.set([]), 1600);
    this.notify(
      goal ? 'Objetivo completado.' : `+${amount} ml registrados.`,
      this.reminderDialog()?.nativeElement.open === true,
    );
    this.closeReminder();
  }

  protected undoWater(): void {
    this.journal.undoDrink();
    clearTimeout(this.celebrationTimer);
    this.waterFeedback.set([]);
    this.notify('Registro deshecho.');
  }

  protected openReminder(): void {
    const dialog = this.reminderDialog()?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  protected closeReminder(): void {
    this.reminder.reminderDue.set(false);
    const dialog = this.reminderDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected async toggleReminders(): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    this.feedback.set(null);
    try {
      if (this.reminder.isActive()) {
        await this.reminder.pause();
        this.notify('Recordatorios en pausa.');
      } else if (!(await this.reminder.activate())) {
        this.feedback.set('Necesitamos permiso para enviarte recordatorios.');
      } else {
        this.notify('Recordatorios activados.');
      }
    } catch {
      this.feedback.set('No pudimos actualizar los recordatorios. Inténtalo de nuevo.');
    } finally {
      this.isBusy.set(false);
    }
  }

  private notify(message: string, visible = true): void {
    this.toast.set({ message, visible });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4500);
  }

  private applySelectedInterval(): void {
    const { preset, customAmount, customUnit } = this.intervalForm.getRawValue();
    const customControl = this.intervalForm.controls.customAmount;
    if (preset !== 'custom') {
      customControl.disable({ emitEvent: false });
      this.intervalForm.setErrors(null);
      this.reminder.setInterval(Number(preset));
      return;
    }
    customControl.enable({ emitEvent: false });
    const minutes = customAmount * (customUnit === 'hours' ? 60 : 1);
    this.intervalForm.setErrors(
      !Number.isInteger(minutes) || minutes < 1 || minutes > 1440 ? { interval: true } : null,
    );
    if (this.intervalForm.valid) this.reminder.setInterval(minutes);
  }

  private initialPreset(): IntervalPreset {
    const interval = String(this.reminder.intervalMinutes());
    return ['15', '30', '45', '60', '120'].includes(interval)
      ? (interval as IntervalPreset)
      : 'custom';
  }

  private initialTheme(): Theme {
    const saved = this.storage.get<Theme>('hydration-theme');
    return saved === 'dark' || saved === 'light'
      ? saved
      : this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
}
