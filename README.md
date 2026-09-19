# Farmear Agua

MVP móvil para configurar recordatorios periódicos de hidratación. Está construido con Angular 22 zoneless, Signals, Reactive Forms y Capacitor.

## Desarrollo

```bash
npm install
npm start
```

La aplicación queda disponible en `http://localhost:4200/`.

## Verificación

```bash
npm test -- --watch=false
npm run build
```

El proyecto no tiene un script de lint configurado actualmente.

## Notificaciones

La configuración se guarda en `localStorage` mediante un servicio aislado. En Android, `@capacitor/local-notifications` programa una notificación recurrente con un identificador estable; al pausar se cancela esa programación.

En el navegador se conserva y muestra el estado, pero no se emiten notificaciones del sistema. El permiso nativo solo se solicita al activar los recordatorios.

## Android

Instala y crea la plataforma una sola vez:

```bash
npm install @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Después de cada cambio web, ejecuta:

```bash
npm run build
npx cap sync android
```
