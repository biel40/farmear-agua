package es.farmearagua.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HydrationNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
