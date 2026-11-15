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

En la APK de Android, los recordatorios usan una alarma nativa que puede despertar el dispositivo durante el reposo y se rearma sin depender de que Angular siga ejecutándose. La frecuencia y el próximo aviso se conservan al reiniciar el teléfono y al actualizar la APK. Al actualizar desde la programación anterior de Capacitor, se cancela la alarma antigua. Pausar cancela ambas programaciones.

`@capacitor/local-notifications` gestiona el permiso. Solo se solicita al activar los recordatorios o pulsar «Probar aviso»; al abrir o reanudar la app se comprueban el permiso y el canal sin volver a pedirlos. Si están bloqueados, la interfaz deja de mostrar los avisos como activos. «Probar aviso» envía una notificación real del sistema en la APK y abre el diálogo dentro de la app en el navegador.

Los avisos son aproximados: no necesitan acceso especial a alarmas exactas. Android puede retrasarlos por ahorro de batería; en reposo no se garantiza la frecuencia de intervalos inferiores a nueve minutos. El contador indica la hora prevista, no una garantía de entrega. Véase la [documentación de Android sobre Doze](https://developer.android.com/training/monitoring-device-state/doze-standby).

### Comprobar la APK en un Vivo

1. Instala la APK actualizada, abre Farmear Agua y pulsa «Probar aviso». Concede el permiso y comprueba la notificación en el panel del teléfono.
2. Si no aparece, revisa Ajustes → Aplicaciones → Farmear Agua → Notificaciones, incluido el canal «Recordatorios de hidratación», y el modo No molestar.
3. Activa un intervalo de 15 minutos, bloquea la pantalla y comprueba al menos dos avisos sin volver a abrir la app. Puede haber retrasos del sistema.
4. Si la prueba inmediata funciona pero los avisos con pantalla apagada no llegan, permite la actividad en segundo plano en los ajustes de batería de Farmear Agua y revisa el inicio automático de Vivo. Los nombres y las rutas cambian según la versión de Funtouch OS/OriginOS.
5. Reinicia el teléfono y desbloquéalo una vez; comprueba que la frecuencia sigue siendo la elegida. Pausa los recordatorios y verifica que no llegan más.

Forzar la detención desde Ajustes bloquea las alarmas de Android hasta volver a abrir la app. Esta limitación y las restricciones adicionales del fabricante requieren comprobación en el teléfono real; un emulador no reproduce la gestión de batería de Vivo.
