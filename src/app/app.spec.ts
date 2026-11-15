import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the app title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Farmear Agua');
  });

  it('offers the browser install prompt on click and clears it after cancellation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const prompt = vi.fn(async () => ({ outcome: 'dismissed' }));
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
    window.dispatchEvent(event);
    await fixture.whenStable();

    const action = element.querySelector<HTMLButtonElement>('.install-action')!;
    expect(action.textContent).toContain('Instalar app');
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();

    action.click();
    await fixture.whenStable();
    expect(prompt).toHaveBeenCalledOnce();
    expect(action.textContent).toContain('Cómo instalar');

    action.click();
    await fixture.whenStable();
    expect(prompt).toHaveBeenCalledOnce();
    expect(element.querySelector<HTMLElement>('#install-help')?.hidden).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));
    await fixture.whenStable();
    expect(element.querySelector('.install-banner')).toBeNull();
  });

  it('hides the suggestion after accepting the install prompt', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const prompt = vi.fn(async () => ({ outcome: 'accepted' }));
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }),
    );
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('.install-action')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.install-banner')).toBeNull();
  });

  it('shows manual home screen instructions on iPhone', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const action = element.querySelector<HTMLButtonElement>('.install-action')!;
    expect(action.getAttribute('aria-expanded')).toBe('false');

    action.click();
    await fixture.whenStable();
    expect(action.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('#install-help')?.textContent).toContain(
      'Añadir a pantalla de inicio',
    );
  });

  it.each(['standalone', 'native'] as const)('hides the suggestion in %s mode', async (mode) => {
    if (mode === 'native') {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    } else {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(display-mode: standalone)',
      }));
    }

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.install-banner')).toBeNull();
  });

  it('lets users hide the suggestion and remembers the dismissal', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.install-dismiss')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.install-banner')).toBeNull();
    expect(Number(localStorage.getItem('pwa-install-hidden-until'))).toBeGreaterThan(Date.now());
  });
});
