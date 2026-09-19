# Farmear Agua: Copilot Instructions

## Project Context

- This is a mobile-first hydration reminder built with Angular 22, TypeScript 6, Vitest, and Capacitor 8.
- Angular runs without Zone.js through `provideZonelessChangeDetection()` in `src/app/app.config.ts`.
- Browser storage and native notifications are technical boundaries. Keep Capacitor and Web APIs behind services in `src/app/core/`.
- User-facing copy is Spanish. Preserve that language unless the product requirement explicitly changes.

## Working Agreement

1. Read the owning feature, its nearest test, and the relevant boundary service before changing behavior.
2. For behavior changes, write or update a failing test first, make the smallest implementation change, and rerun the focused test.
3. Keep changes scoped. Do not refactor unrelated code or introduce abstractions for hypothetical reuse.
4. Follow existing local patterns unless they conflict with a rule in this file.
5. State assumptions and report commands actually run. Never claim verification that was not performed.

## Repository Map

- `src/app/app.config.ts`: application providers and composition root.
- `src/app/app.routes.ts`: top-level routes; load features lazily.
- `src/app/core/`: application-wide technical adapters such as storage and notifications. It must not contain feature business rules or UI.
- `src/app/features/<feature>/`: a vertical slice that owns its UI, models, stateful services, and tests.
- `src/app/shared/`: create only for stable, feature-agnostic UI or utilities reused by multiple features. Shared code must not depend on a feature.
- `public/`: static assets.

## Architecture

Use feature-first Clean Architecture with pragmatic boundaries:

- Keep simple features in the existing `components/`, `models/`, and `services/` structure.
- When a feature becomes complex, separate it into `domain/`, `application/`, `infrastructure/`, and `presentation/`. Do not create empty layers preemptively.
- Domain code contains pure TypeScript types and business rules. It must not import Angular, RxJS, Capacitor, browser APIs, or presentation code.
- Application code coordinates use cases and state. It depends on domain contracts, not concrete infrastructure.
- Infrastructure code implements storage, network, or native-device ports. Keep platform-specific details at this boundary.
- Presentation code renders state and delegates workflows. Components must not call `localStorage`, Capacitor, or other infrastructure APIs directly.
- Dependency direction is `presentation -> application -> domain`; infrastructure implements inward-facing ports. Never import presentation from an inner layer.
- A feature must not import another feature's internal files. Move genuinely shared contracts to `shared/` or expose a deliberate public API.
- Keep `app.config.ts` and route definitions as composition roots. Do not hide global providers inside feature internals.

## Angular 22

- Use standalone components, directives, and pipes. Do not create NgModules and do not add `standalone: true`; it is the default.
- Do not set `ChangeDetectionStrategy.OnPush`; it is the Angular 22 default.
- Use signals for synchronous state, `computed()` for derived state, and `linkedSignal()` only when writable state must stay synchronized with other signals.
- Update signals with `set()` or `update()`; never use `mutate()` or modify referenced objects in place.
- Use `input()`, `output()`, and `model()` instead of decorator-based inputs and outputs.
- Use `inject()` instead of constructor injection.
- Prefer `@Service()` for new automatically provided singleton services. Use `@Injectable()` when its provider configuration is specifically required.
- Keep components focused on presentation and interaction. Put reusable business workflows in a feature service or application use case.
- Prefer Signal Forms for new forms. Preserve existing Reactive Forms unless migration has a concrete benefit; do not introduce Template-driven Forms.
- Use native template control flow (`@if`, `@for`, `@switch`) and include `track` in every `@for`.
- Do not import `CommonModule`. Import only the directives and pipes used by the template.
- Do not use `ngClass` or `ngStyle`; use class and style bindings.
- Use `NgOptimizedImage` for static image files, but not for inline base64 images.
- Use the component `host` object instead of `@HostBinding` or `@HostListener`.
- Lazy-load feature routes with `loadComponent` or `loadChildren`.
- In this zoneless app, ensure UI state changes are observable through signals, Angular bindings, or supported async primitives. Do not rely on Zone.js side effects.

## TypeScript

- Preserve strict typing. Do not use `any`; use `unknown` and narrow it at the boundary.
- Prefer inference for obvious local values and explicit types for public contracts and boundary data.
- Model finite states with unions and invalid combinations with discriminated unions.
- Keep state transformations pure and immutable.
- Validate untrusted persisted, native, or network data before using it as a domain value.
- Avoid non-null assertions unless an invariant is both unavoidable and locally evident.

## Templates, UX, and Accessibility

- Keep templates declarative; move complex calculations to `computed()` values or typed component methods.
- Use semantic HTML before ARIA. Every control needs an accessible name and visible keyboard focus.
- Meet WCAG 2.2 AA for contrast, keyboard access, focus management, status feedback, and touch target sizing.
- Associate validation messages with their controls and expose dynamic feedback with an appropriate live region.
- Preserve mobile layouts from 320 px upward and prevent horizontal overflow.
- Use SCSS local to a component for feature styling and `src/styles.css` only for application-wide tokens and resets.

## Testing

- Co-locate tests as `*.spec.ts` beside the unit under test.
- Test public behavior and observable state, not private implementation details.
- Add regression coverage for every bug fix and cover success, denial/error, and boundary cases where relevant.
- Replace storage, time, browser, and Capacitor boundaries with deterministic fakes or spies.
- Component tests must cover user interaction, disabled/busy states, visible feedback, and critical accessibility semantics.
- Keep tests independent of execution order and reset mocks between cases.

## Commands

- Install dependencies: `npm install`
- Start development server: `npm start`
- Run tests once: `npm test -- --watch=false`
- Type-check application: `npx tsc -p tsconfig.app.json --noEmit`
- Type-check tests: `npx tsc -p tsconfig.spec.json --noEmit`
- Production build: `npm run build`
- There is currently no lint script. Do not invent or report lint results.

Run the narrowest relevant check first, then the complete test suite when the change affects shared behavior or cross-feature contracts.