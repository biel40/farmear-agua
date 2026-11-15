package es.farmearagua.app;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HydrationNotifications")
public class HydrationNotificationsPlugin extends Plugin {
    @Override
    public void load() {
        // Force-stop removes Android alarms. Opening the application repairs an
        // enabled schedule; an explicitly paused schedule stays paused.
        try {
            HydrationReminderScheduler.restore(getContext());
        } catch (RuntimeException exception) {
            Log.e("HydrationNotifications", "No se pudo restaurar el recordatorio", exception);
        }
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            Object interval = call.getData().opt("intervalMinutes");
            if (!(interval instanceof Number)) {
                throw new IllegalArgumentException("Debes indicar un intervalo en minutos.");
            }
            double intervalValue = ((Number) interval).doubleValue();
            if (!Double.isFinite(intervalValue) || intervalValue != Math.rint(intervalValue)
                || intervalValue < 1 || intervalValue > 1_440) {
                throw new IllegalArgumentException("El intervalo debe estar entre 1 y 1440 minutos.");
            }

            Long requestedAt = null;
            if (call.getData().has("nextReminderAt")) {
                Object timestamp = call.getData().opt("nextReminderAt");
                if (!(timestamp instanceof Number)) {
                    throw new IllegalArgumentException("La fecha del próximo aviso no es válida.");
                }
                double timestampValue = ((Number) timestamp).doubleValue();
                if (!Double.isFinite(timestampValue) || timestampValue != Math.rint(timestampValue)
                    || timestampValue <= 0 || timestampValue > HydrationReminderSchedule.MAX_DATE_MILLIS) {
                    throw new IllegalArgumentException("La fecha del próximo aviso no es válida.");
                }
                requestedAt = ((Number) timestamp).longValue();
            }

            HydrationReminderSchedule scheduled = HydrationReminderScheduler.schedule(
                getContext(), (int) intervalValue, requestedAt
            );
            JSObject result = new JSObject();
            result.put("nextReminderAt", scheduled.nextReminderAt);
            call.resolve(result);
        } catch (IllegalArgumentException exception) {
            call.reject(exception.getMessage(), "invalid-schedule", exception);
        } catch (SecurityException exception) {
            call.reject(exception.getMessage(), "notifications-disabled", exception);
        } catch (RuntimeException exception) {
            call.reject("No se pudo programar el recordatorio.", "schedule-failed", exception);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            HydrationReminderScheduler.cancel(getContext());
            call.resolve();
        } catch (RuntimeException exception) {
            call.reject("No se pudo pausar el recordatorio.", "cancel-failed", exception);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            HydrationReminderSchedule state = HydrationReminderScheduler.getSchedule(getContext());
            JSObject result = new JSObject();
            result.put("active", state != null);
            result.put("intervalMinutes", state == null ? 0 : state.intervalMinutes);
            result.put("nextReminderAt", state == null ? 0L : state.nextReminderAt);
            result.put("notificationsEnabled", HydrationReminderScheduler.notificationsEnabled(getContext()));
            call.resolve(result);
        } catch (RuntimeException exception) {
            call.reject("No se pudo comprobar el estado de los avisos.", "status-failed", exception);
        }
    }

    @PluginMethod
    public void test(PluginCall call) {
        try {
            HydrationReminderScheduler.showTest(getContext());
            call.resolve();
        } catch (SecurityException exception) {
            call.reject(exception.getMessage(), "notifications-disabled", exception);
        } catch (RuntimeException exception) {
            call.reject("No se pudo mostrar la notificación de prueba.", "test-failed", exception);
        }
    }
}
