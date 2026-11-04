# Farmear Agua

Aplicación de hidratación con Angular 22, Signals, Reactive Forms y Capacitor.

## Desarrollo

```bash
npm install
npm start
```

Abre `http://localhost:4200/`.

## Funciones

- Diseño adaptable a móvil y escritorio, con temas claro y oscuro. La primera visita sigue la apariencia del sistema; la selección se conserva entre sesiones y se aplica antes del primer renderizado.
- Vaso con ondas, burbujas y nivel de agua que responde al progreso diario; celebración al registrar agua. Las animaciones respetan `prefers-reduced-motion`.
- Vasos de 100, 250 o 500 ml, objetivo diario editable, deshacer el último registro e historial semanal con datos reales. Cada día se calcula según la fecha local del dispositivo.
- Recordatorios con cuenta atrás, frecuencias rápidas y personalizadas de 1 minuto a 24 horas. Pausa los avisos para modificar el intervalo.
- Aviso visual accesible con foco contenido en un diálogo, cierre con Escape y registro de agua desde el propio aviso. El botón «Probar aviso» permite verlo al instante.
- PWA instalable con acceso sin conexión tras la primera carga y aplicación nativa Android con Capacitor.

Los registros, el objetivo, la apariencia y la configuración de los avisos se guardan en `localStorage`, sin cuenta ni servicios externos.

## Verificación

```bash
npm test -- --watch=false
npm run build
```

Las pruebas cubren persistencia, cambio de día, historial, registro y deshacer, temas, validación de intervalos, permisos y avisos recurrentes dentro de la aplicación. No hay script de lint configurado.

## Notificaciones

En el navegador, el diálogo se muestra mientras la aplicación está abierta. Los temporizadores pueden demorarse cuando la pestaña está en segundo plano; al volver se calcula la siguiente fecha y se muestra un único aviso pendiente. No se envían notificaciones web del sistema con la página cerrada.

La integración nativa existente usa `@capacitor/local-notifications`. El permiso solo se solicita al activar los recordatorios; pausar cancela la programación nativa. El comportamiento en segundo plano debe verificarse en un dispositivo Android.
