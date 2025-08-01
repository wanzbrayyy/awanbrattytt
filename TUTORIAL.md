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

1.  Kirim file `rat_client.exe` ke komputer target. Anda bisa menggunakan metode apa pun, seperti email, USB, atau layanan hosting file.
2.  Jalankan file `.exe` di komputer target. Program akan berjalan di latar belakang tanpa menampilkan jendela apa pun.
3.  Setelah dijalankan, RAT akan terhubung ke bot dan Anda akan menerima pesan konfirmasi.

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
