# Tutorial Penggunaan RAT Wanzofc

Dokumen ini memberikan panduan tentang cara menggunakan fitur Remote Administration Tool (RAT) yang tersedia untuk pengguna premium.

## Bagian 1: Windows RAT

RAT untuk Windows adalah program yang kuat yang memberi Anda kendali penuh atas komputer target.

### Langkah 1: Membuat RAT

1.  Buka menu "Awan Premium" di bot.
2.  Tekan tombol "🖥️ Generate Windows RAT".
3.  Bot akan secara otomatis membuat file `.exe` yang unik untuk Anda. Proses ini mungkin memakan waktu beberapa menit.
4.  Setelah selesai, bot akan mengirimi Anda file `rat_client.exe`.

### Langkah 2: Menjalankan RAT di Target

1.  Kirim file `rat_client.exe` ke komputer target.
2.  Jalankan file `.exe` tersebut di komputer target. Setelah file dieksekusi, ia akan berjalan secara otomatis di latar belakang (tidak terlihat) dan terhubung ke bot.

**Skenario dan Contoh Cara Eksekusi:**

Agar target menjalankan file `.exe` tersebut, Anda perlu menggunakan teknik rekayasa sosial (social engineering). Tujuannya adalah meyakinkan target untuk mengunduh dan membuka file tersebut.

*   **Skenario 1: Menyamarkan sebagai Dokumen Penting**
    1.  Ubah nama file `rat_client.exe` menjadi sesuatu yang terlihat tidak berbahaya, misalnya `Laporan_Keuangan_Q3.exe` atau `Data_Gaji_Karyawan.exe`.
    2.  Ubah ikon file `.exe` tersebut agar terlihat seperti ikon PDF atau Excel. Ini memerlukan software pihak ketiga seperti "Resource Hacker".
    3.  Kirim file tersebut melalui email dengan subjek yang meyakinkan, contoh: "Mohon diperiksa laporan keuangan terbaru."

*   **Skenario 2: Menyamarkan sebagai Installer Software**
    1.  Buat sebuah file installer palsu menggunakan software seperti "WinRAR SFX" atau "7-Zip SFX".
    2.  Bungkus `rat_client.exe` bersama dengan installer software yang asli (misalnya installer Notepad++).
    3.  Konfigurasikan SFX agar mengekstrak dan menjalankan kedua file tersebut (installer asli dan RAT Anda) secara diam-diam.
    4.  Beri nama file SFX tersebut `Notepad++_Installer.exe` dan kirimkan ke target. Saat target menjalankannya, Notepad++ akan terinstal seperti biasa, namun RAT Anda juga ikut berjalan di latar belakang.

*   **Skenario 3: Melalui Tautan Unduhan**
    1.  Upload file `rat_client.exe` ke layanan file hosting (contoh: MediaFire, Google Drive, dll).
    2.  Gunakan layanan pemendek URL (seperti bit.ly) untuk menyamarkan tautan unduhan.
    3.  Kirim tautan tersebut ke target melalui chat atau email dengan pesan yang menarik, contoh: "Cek aplikasi keren ini yang baru saya temukan!"

**Penting:** Keberhasilan eksekusi sangat bergantung pada seberapa meyakinkan skenario yang Anda buat.

### Langkah 3: Mengontrol Target

Setelah RAT aktif, Anda dapat mengirimkan perintah langsung dari obrolan pribadi Anda dengan bot. Bot RAT akan merespons dengan output dari perintah tersebut.

**Daftar Perintah Windows:**
*   `/info` - Mendapatkan informasi sistem lengkap.
*   `/screen` - Mengambil screenshot layar.
*   `/webcam` - Mengambil gambar dari webcam.
*   `/passwords_chrome` - Mencuri kata sandi yang tersimpan di Google Chrome.
*   `/pwd` - Mengetahui direktori saat ini.
*   `/ls` - Melihat daftar file dan folder.
*   `/cd <direktori>` - Pindah ke direktori lain.
*   `/download <path_file>` - Mengunduh file dari target.
*   `/cmd <perintah>` - Menjalankan perintah shell (CMD).
*   `/shutdown` - Mematikan komputer target.
*   `/reboot` - Me-reboot komputer target.
*   `/kill_process <nama_proses>` - Mematikan proses yang berjalan.
*   `/open_url <url>` - Membuka URL di browser default.
*   `/keylog_dump` - Mengambil data ketikan yang telah direkam oleh keylogger.

**Catatan Penting:**
*   Fitur *Persistence* sudah aktif secara default. Ini berarti RAT akan otomatis berjalan setiap kali komputer target dinyalakan.

## Bagian 2: Android RAT

RAT untuk Android memungkinkan Anda untuk memantau perangkat Android dari jarak jauh.

### Langkah 1: Menghubungkan Target

1.  Anda memerlukan file `.apk` klien RAT Android. File ini tidak dibuat oleh bot secara dinamis. Anda harus mendapatkannya dari admin.
2.  Instal file `.apk` di perangkat Android target.
3.  Buka aplikasi dan ikuti petunjuk untuk menghubungkannya dengan bot Anda. Biasanya ini melibatkan pemberian izin (permissions) yang diperlukan oleh aplikasi.

### Langkah 2: Menggunakan Perintah

1.  Buka menu "Awan Premium" di bot.
2.  Pilih "📱 List Android Devices" untuk melihat perangkat yang terhubung.
3.  Dari sana, Anda dapat memilih perintah yang tersedia.

**Daftar Perintah Android (yang sudah didukung oleh APK saat ini):**
*   `Get SMS` - Mengambil daftar SMS.
*   `Get Contacts` - Mengambil daftar kontak.
*   `Get Call Logs` - Mengambil riwayat panggilan.

**Perintah Baru (Stub):**
Tombol-tombol berikut telah ditambahkan ke menu, tetapi memerlukan pembaruan pada file `.apk` klien agar berfungsi:
*   `Screen Record`
*   `Mic Record`
*   `Get Clipboard`
*   `Stealth Mode`

---
**Peringatan:** Harap gunakan alat ini secara bertanggung jawab dan hanya pada perangkat yang Anda miliki izin untuk mengaksesnya. Penyalahgunaan alat ini dapat melanggar hukum.
