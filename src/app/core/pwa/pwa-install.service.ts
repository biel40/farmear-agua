import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Capacitor } from '@capacitor/core';
import { fromEvent } from 'rxjs';
import { StorageService } from '../storage/storage.service';

const DISMISSAL_KEY = 'pwa-install-hidden-until';
const DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallPlatform = 'ios' | 'safari-mac' | 'android' | 'other';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly browser = inject(DOCUMENT).defaultView;
  private readonly storage = inject(StorageService);
  private readonly promptEvent = signal<InstallPromptEvent | null>(null);
  private readonly prompting = signal(false);
  private readonly installed = signal(
    this.browser?.matchMedia?.('(display-mode: standalone)').matches === true ||
      (this.browser?.navigator as (Navigator & { standalone?: boolean }) | undefined)
        ?.standalone === true,
  );
  private readonly dismissed = signal(this.wasDismissed());
  private readonly enabled =
    this.browser !== null &&
    this.browser.isSecureContext !== false &&
    !Capacitor.isNativePlatform();

  readonly showBanner = computed(() => this.enabled && !this.installed() && !this.dismissed());
  readonly canPrompt = computed(() => this.promptEvent() !== null);
  readonly isPrompting = this.prompting.asReadonly();
  readonly platform = this.installPlatform();

  constructor() {
    const browser = this.browser;
    if (!browser || !this.showBanner()) return;

    fromEvent<InstallPromptEvent>(browser, 'beforeinstallprompt')
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (!this.showBanner() || typeof event.prompt !== 'function') return;
        event.preventDefault();
        this.promptEvent.set(event);
      });
    fromEvent(browser, 'appinstalled')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.markInstalled());
  }

  async prompt(): Promise<boolean> {
    const event = this.promptEvent();
    if (!event || this.prompting()) return false;

    this.prompting.set(true);
    try {
      const { outcome } = await event.prompt();
      if (outcome === 'accepted') this.markInstalled();
      return true;
    } catch {
      return false;
    } finally {
      // A new event may have arrived while the previous prompt was open.
      if (this.promptEvent() === event) this.promptEvent.set(null);
      this.prompting.set(false);
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
    this.promptEvent.set(null);
    this.storage.set(DISMISSAL_KEY, Date.now() + DISMISSAL_MS);
  }

  private markInstalled(): void {
    this.installed.set(true);
    this.promptEvent.set(null);
  }

  private wasDismissed(): boolean {
    const until = this.storage.get<unknown>(DISMISSAL_KEY);
    return typeof until === 'number' && until > Date.now();
  }

  private installPlatform(): InstallPlatform {
    const navigator = this.browser?.navigator;
    if (!navigator) return 'other';

    const { userAgent, maxTouchPoints } = navigator;
    const isMac = /Macintosh/i.test(userAgent);
    if (/iPhone|iPad|iPod/i.test(userAgent) || (isMac && maxTouchPoints > 1)) return 'ios';
    if (isMac && /Version\/[\d.]+.*Safari\//.test(userAgent)) return 'safari-mac';
    if (/Android/i.test(userAgent)) return 'android';
    return 'other';
  }
}
