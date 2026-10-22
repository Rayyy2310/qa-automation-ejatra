# 📋 Notulensi Perkembangan Proyek QA Automation Studio (e-Jatra)
**Periode Pengerjaan:** 19 Agustus 2026 – 16 September 2026  
**Stack Utama:** CodeIgniter 4 (PHP) + Node.js Playwright + Multi-LLM (Groq / Gemini / Claude / GPT / Ollama)  
**Tujuan Sistem:** Pengujian otomatis modul bisnis e-Jatra menggunakan instruksi bahasa manusia biasa (*Natural Language*).

---

## 📅 19 Agustus 2026 — Telaah Konsep & Bedah Dokumen Awal (PRD v1)
* **Latar Belakang:**
  * Pengguna mengajukan dokumen konsep awal pengujian otomatis: `PRD - Automation Testing (e-Jatra).pdf`.
* **Fokus Pengerjaan & Temuan:**
  * Menelaah kelayakan konsep penggabungan **CodeIgniter 4 + Groq LLM + Playwright**.
  * Memberikan masukan teknis awal terkait potensi masalah pada versi awal, seperti:
    1. Perlunya menghindari jeda waktu statis (*hard sleep*) agar pengetesan tidak rapuh (*flaky*).
    2. Perlunya strategi khusus menangani token keamanan CSRF dinamis bawaan CodeIgniter.
    3. Merancang metode komunikasi antara PHP (CI4) dengan runtime JavaScript Playwright (Node.js).

---

## 📅 20 Agustus 2026 — Perancangan Struktur Data (ERD) & Diagram Alir Sistem
* **Fokus Pengerjaan:**
  * **Entity Relationship Diagram (ERD):** Merancang struktur database pengetesan dengan 4 tabel utama: `ai_test_module` (daftar modul), `ai_test_case` (skenario tes), `ai_test_run` (riwayat eksekusi), dan `ai_test_run_detail` (rincian langkah per langkah).
  * **Flowchart Alur Sistem:** Menyusun diagram alir visual proses dari input bahasa manusia oleh pengguna ➔ diterjemahkan AI ➔ validasi keamanan backend CI4 ➔ eksekusi browser oleh Playwright ➔ penyimpanan laporan hasil.
  * **Rancangan Multi-LLM:** Pengguna meminta arsitektur agar tidak terkunci hanya pada Groq, melainkan bisa diganti menggunakan penyedia AI lain (Gemini, Claude, GPT, dan model lokal Ollama).

---

## 📅 21 Agustus 2026 — Pondasi Awal & Desain Sistem Anti-Rapuh (PRD v2)
* **Latar Belakang & Masalah:**
  * Di versi awal (v1), robot otomatisasi Playwright berjalan kaku dengan jeda waktu tetap (*hard sleep/waitForTimeout*). Hal ini menyebabkan tes sering gagal (*flaky*) saat koneksi atau render halaman web sedang lambat.
* **Solusi & Implementasi:**
  * **Arsitektur Baru:** Membangun modul pengujian terpusat di CodeIgniter 4 yang terhubung ke service robot Node.js + Playwright melalui REST API internal berotentikasi token (`X-Internal-Token`).
  * **Sinkronisasi Cerdas:** Mengharuskan robot selalu menunggu kondisi nyata di layar (elemen selesai dimuat, animasi selesai, atau request AJAX selesai) sebelum melanjutkan ke langkah berikutnya.
  * **Dukungan Multi-AI:** Menerapkan arsitektur *Adapter Pattern* agar sistem bebas berganti model AI (Groq, Google Gemini, OpenAI GPT, Claude, maupun Ollama lokal) tanpa mengubah kode aplikasi.
  * **Pemisahan Lingkungan Data:** Mengarahkan proses pengujian ke database khusus pengetesan (`ejatra_testing`) agar database operasional tidak tercemar data transaksi palsu.

---

## 📅 24 Agustus 2026 — Perumusan Logika Kerja & Integrasi AI
* **Fokus Pengerjaan:**
  * Menghubungkan instruksi bahasa manusia (seperti: *"Login lalu buat pesanan aspal 18 ton"*) agar diubah oleh AI menjadi rencana pengujian teknis yang terstruktur (*Test Plan JSON*).
* **Aturan Keamanan:**
  * Menetapkan batasan tegas bahwa AI hanya bertindak sebagai penerjemah rencana, bukan pelaksana langsung di browser. Rencana langkah dari AI wajib divalidasi oleh backend CI4 sebelum diizinkan berjalan di Playwright.

---

## 📅 25 Agustus 2026 — Eksperimen Claude CLI & Penyeragaman Format Eksekusi
* **Fokus Pengerjaan:**
  * Mengeksplorasi opsi pemanggilan model AI lewat terminal (Claude CLI) guna memanfaatkan kuota akun Pro berlangganan untuk menghemat biaya API.
* **Hasil:**
  * Memperkuat format kontrak data JSON antara backend CI4 dan Playwright agar format perintah yang dieksekusi Playwright selalu seragam, apa pun model AI yang menghasilkan rencananya.

---

## 📅 26 Agustus 2026 — Penanganan Kendala Database & Artefak Visual Pengujian
* **Masalah yang Terjadi:**
  * Layanan database MySQL lokal (XAMPP) sempat menolak koneksi (*connection refused / timeout*), menyebabkan eksekusi pengetesan macet total.
* **Solusi:**
  * Memperbaiki konfigurasi *port* dan koneksi database di file `.env`.
  * **Penambahan Artefak Visual:** Menambahkan pencatatan bukti pengujian berupa tangkapan layar (*screenshot*) otomatis dan rekaman dokumen HTML (*DOM snapshot*) setiap kali terjadi error, sehingga penyebab kegagalan bisa dilihat langsung secara visual.

---

## 📅 27 Agustus 2026 — Perancangan Modul Pemindai Elemen (Scanner)
* **Latar Belakang:**
  * AI sering salah menebak nama tombol atau input formulir karena tidak mengetahui struktur nyata di halaman web target.
* **Solusi:**
  * Merancang modul **Page Scanner**: robot Playwright diperintahkan membuka web target untuk memindai daftar tombol, isian teks, dan tabel, lalu menyimpannya ke tabel database `ai_page_element`.
  * Data hasil pemindaian ini dijadikan contekan nyata (*ground truth*) bagi AI saat menyusun rencana pengujian.

---

## 📅 28 Agustus 2026 — Pemindaian Halaman Berotentikasi & Penyaringan Konteks (RAG)
* **Tantangan:**
  * Pemindai tidak bisa melihat halaman transaksi penting (seperti Kontrak atau SPM) jika belum melewati gerbang login.
* **Solusi:**
  * Menambahkan mekanisme *auto-login*: robot otomatis memasukkan kredensial pengetesan (`edpraya`), melewati dialog sambutan, lalu baru memindai menu yang dituju.
  * Menerapkan teknik penyaringan kata tidak penting (*stop-words filtering*) agar saat data elemen diserahkan ke AI, kuota token prompt tetap hemat dan tidak boros.

---

## 📅 31 Agustus 2026 — Evaluasi Framework Eksternal & Keamanan Data Internal
* **Analisis Framework Luar:**
  * Membandingkan arsitektur yang kita bangun dengan framework otomatisasi AI di internet (seperti Stagehand dan Midscene).
* **Keputusan Teknis:**
  * Memutuskan tetap memakai arsitektur mandiri (CI4 + Playwright sendiri) karena:
    1. **Hemat Biaya:** Framework luar memanggil AI di setiap klik tombol, sedangkan sistem kita hanya memanggil AI sekali di awal untuk menyusun rencana.
    2. **Kerahasiaan Data:** Mencegah data operasional internal kantor terkirim mentah-mentah ke server pihak ketiga di luar negeri.

---

## 📅 1 September 2026 — Penanganan Tombol Baris Tabel & Dropdown Dinamis
* **Masalah 1 (Tombol Baris Terlewat):**
  * Tombol aksi seperti *View Data* berada di bawah kolom "Aksi". Playwright sering gagal menemukan tombol ini karena mencarinya sebagai tombol umum di badan halaman.
* **Masalah 2 (Dropdown Select2 Macet):**
  * Kotak pilihan Select2 membutuhkan jeda waktu sepersekian detik untuk memuat data dari server. Playwright mengetik terlalu cepat sebelum pilihan selesai dimuat.
* **Solusi:**
  * Menambahkan jeda kesiapan elemen pada pengisian Select2 dan mulai memetakan logika klik khusus baris tabel.

---

## 📅 2 September 2026 — Penanganan Dokumen PDF Tab Baru & Menu Hamburger
* **Tantangan Dokumen PDF:**
  * Tombol *Cetak* membuka file PDF di tab/jendela baru browser, sehingga Playwright yang tertinggal di tab lama menganggap tes selesai atau macet.
* **Solusi PDF:**
  * Menambahkan deteksi multi-tab: Playwright secara otomatis beralih fokus ke tab browser paling baru dan memastikan dokumen laporan selesai dimuat.
* **Tantangan Menu Hamburger (`☰`):**
  * Fitur baris tabel e-Jatra tersembunyi di dalam tombol titik/garis tiga. Mulai disiapkan alur 2 langkah: klik tombol hamburger `☰` terlebih dahulu, baru mengeklik menu aksi di dalamnya.

---

## 📅 3 September 2026 — Penyesuaian Akses Jaringan Lokal & Audit Token AI
* **Penyesuaian Jaringan:**
  * Mengarahkan target uji coba ke server aplikasi kantor di IP lokal `http://192.168.15.69:8080/`.
* **Audit Kuota AI:**
  * Menyelidiki kuota API yang mendadak habis. Ditemukan bahwa ada prompt pelengkap yang mengirim data terlalu besar, sehingga konteks yang dikirim ke AI dipersempit agar efisien.

---

## 📅 7 September 2026 — Pemantauan Penggunaan Token di Antarmuka Web
* **Penyempurnaan Tampilan:**
  * Menambahkan lencana informasi token (*Token Usage Badge*) pada dashboard web pengujian (`localhost:8080`).
  * Pengguna dapat melihat secara langsung berapa jumlah *prompt tokens* (input) dan *completion tokens* (output) yang terpakai pada setiap skenario yang dibuat.

---

## 📅 8 September 2026 — Solusi Tampilan Jendela Browser (Mode Visual)
* **Masalah:**
  * Mode visual (browser Chromium terlihat di layar) hanya berjalan sekali saat laptop baru menyala. Jika web di-*refresh*, pengujian berikutnya berjalan di latar belakang tanpa jendela (*headless*).
* **Penyebab:**
  * Sisa proses Chromium dari pengujian sebelumnya masih menggantung di latar belakang Windows (*zombie process*) dan mengunci sesi tampilan.
* **Solusi:**
  * Menambahkan tombol **"Bersihkan Browser"** dan mekanisme otomatis di backend untuk mematikan sisa proses browser lama sebelum pengujian baru dimulai.

---

## 📅 9 September 2026 — Alur Edit Kontrak & Pop-up Konfirmasi SweetAlert
* **Perbaikan Alur Edit:**
  * Mematangkan alur pengeditan data: cari nomor kontrak di kotak pencarian ➔ buka menu hamburger ➔ klik menu *Ubah* ➔ formulir terisi data lama.
* **Masalah Pop-up SweetAlert:**
  * Setelah tombol *Simpan* diklik, web memunculkan dialog konfirmasi (*"Yakin simpan data?"*). Awalnya Playwright macet di sini.
* **Solusi SweetAlert:**
  * Robot diprogram agar otomatis mendeteksi dan menekan tombol konfirmasi seperti *"Ya, Simpan"* atau *"OK"* di latar belakang tanpa perlu diperintahkan secara manual di prompt.

---

## 📅 10 September 2026 — Pemilihan Dropdown Universal Tanpa ID Teknis
* **Masalah Dropdown:**
  * Pemilihan filter status hanya berhasil jika ID teknis elemennya ditulis manual. Jika pindah ke halaman lain, pemilihan dropdown gagal.
* **Solusi Universal (*Proximity Discovery*):**
  * Membuat fungsi pencarian cerdas: Playwright mencari teks label (misalnya teks *"Status"* atau *"Unit"*), lalu mencari wadah Select2 terdekat di sekitar teks tersebut untuk memilih nilainya secara otomatis.

---

## 📅 11 September 2026 — Navigasi Menu Samping Bertingkat (Accordion Sidebar)
* **Masalah Navigasi:**
  * Skenario yang meminta navigasi seperti *Dashboard ➔ Aspal* sering kali hanya membuka lipatan menu utama tanpa mengeklik tautan di dalamnya.
* **Penyebab:**
  * Menu e-Jatra menggunakan sistem akordeon: menu utama berupa tombol pemicu buka-tutup dan submenu berupa tautan halaman nyata.
* **Solusi:**
  * Memperbaiki logika navigasi: Playwright memastikan menu utama terbuka terlebih dahulu sebelum mengeklik link submenu di dalamnya.
  * Memperbaiki tombol *Detail* dan *Hapus Riwayat* di tabel pengujian agar responsif.

---

## 📅 14 September 2026 — Restrukturisasi Kode Runner (*Clean Code*)
* **Tujuan:**
  * Merapikan kode Playwright runner yang sudah terlalu panjang (monolitik) agar mudah dirawat dan tidak gampang memicu error baru.
* **Pengerjaan:**
  * Memecah file inti menjadi modul-modul independen:
    * `clickAction.js` khusus untuk klik umum dan penanganan tombol login/simpan.
    * `tableRowAction.js` khusus untuk operasi tombol hamburger dan menu baris tabel.
    * `dialogConfirmHandler.js` khusus untuk konfirmasi pop-up SweetAlert.
  * Memindahkan kamus kata sinonim dan template prompt ke file konfigurasi JSON & TXT terpisah.

---

## 📅 15 September 2026 — Penanganan Tab Form vs Modal & Perbaikan Layar Putih (*Whitescreen*)
* **Masalah 1 (Asersi `.modal.show` Gagal):**
  * Langkah verifikasi *Lihat Data* selalu gagal mencari pop-up modal.
  * **Fakta:** Di modul Kontrak dan SPM, tombol *View Data* ternyata **tidak membuka modal**, melainkan berpindah ke **Tab Form**. Robot diperbarui agar adaptif mengenali perpindahan tab maupun kemunculan modal.
* **Masalah 2 (Layar Putih / *Whitescreen*):**
  * Ketika kembali dari tab form ke tab tabel, layar browser tiba-tiba putih polos dan tabel menghilang.
  * **Akar Masalah:** Kode sebelumnya sempat menyuntikkan inline style manual `display: none` pada kontainer tabel. Inline style ini menimpa class Bootstrap sehingga tabel tetap tersembunyi.
  * **Solusi:** Menghapus seluruh manipulasi `display: none` manual dan mengembalikannya ke fungsi bawaan Bootstrap murni (`bootstrap.Tab.show()`). Masalah layar putih selesai total.

---

## 📅 16 September 2026 — Fitur Aksi "Close", Penyelarasan Istilah, & Validasi PO
* **Masalah Aksi "Close" Macet:**
  * Saat disuruh klik opsi *Close* pada baris kontrak aktif, Playwright bersikap membingungkan.
  * **Penyebab:** Kata `"close"` dan `"tutup"` belum terdaftar di kamus aksi baris tabel. Playwright mengira ini tombol silang biasa, bukan opsi penutupan status di menu hamburger `☰`.
  * **Solusi:** Mendaftarkan kata kunci `close` dan `tutup` ke modul aksi baris, menambahkan penanganan SweetAlert konfirmasi penutupan kontrak, serta membedakan antara aksi *"Close Kontrak"* dengan aksi *"Kembali ke Tabel"* (`#tabel-tab`).
* **Analisis Aturan Bisnis e-Jatra:**
  * Menemukan alasan mengapa pembatalan kontrak sempat ditolak: kontrak yang sudah memiliki transaksi pesanan (PO) atau sudah lewat tanggal berlakunya diproteksi oleh sistem agar tidak bisa dibatalkan sembarangan.
  * Menyusun panduan format prompt pengujian agar AI dapat membedakan antara pengujian alur sukses (*Happy Path*) dengan pengujian aturan pencegahan sistem (*Negative Testing*).

## 📅 17 September 2026 — Pengurutan Abjad Fitur Skenario Tersimpan (Regression Suite)
* **Kebutuhan Pengguna:**
  * Menginginkan daftar pada dropdown **Skenario Tersimpan (Regression Suite)** diurutkan secara abjad (*Ascending A-Z*), sehingga skenario uji regresi yang tersimpan mudah dicari dan tidak berantakan.
* **Perubahan yang Dilakukan:**
  * **Di Backend Model (`AiTestCaseModel.php`):** Mengubah pengurutan database dari `orderBy('id', 'DESC')` menjadi `orderBy('test_name', 'ASC')`.
  * **Di Frontend JS (`ai-automation-test.js` & `qa-studio.js`):** Menambahkan pengurutan abjad di sisi klien dengan `localeCompare(..., { numeric: true })` agar penamaan skenario seperti `TC-ACT-001`, `TC-ACT-002`, `TC-ACT-010` terurut rapi secara berurutan.

## 📅 17 September 2026 — Perbaikan Bug Tab Switching Saat Mengisi Form Kontrak & Penyelarasan Alur Tab
* **Masalah 1 (Terlempar ke Tabel saat isi Form):**
  * Saat mengisi data di `form-tab`, robot Playwright sempat terlempar kembali ke `tabel-tab` karena aksi `search` Select2 dikira kueri tabel oleh fungsi `autoRevealParentContainer`.
* **Masalah 2 (Salah Masuk ke Form saat Kueri Tabel):**
  * Heuristik perpindahan tab otomatis di `overlayHandler.js` berpotensi memindahkan halaman yang sedang berada di tabel ke tab form secara tidak diinginkan jika selector field form (`#unit`) terdeteksi di DOM, sehingga skenario filter tabel (seperti `TC-FLT-003`) atau halaman tanpa tab form bisa gagal.
* **Solusi Akhir & Prinsip Clean Code:**
  * **Pemberian Hak Navigasi Tab ke Aplikasi & Skenario Murni:** Menghapus seluruh logika pemaksaan perpindahan tab workspace (`#tabel-tab` / `#form-tab`) otomatis dari `overlayHandler.js`. `overlayHandler.js` kini hanya berfokus pada tugas aslinya: membersihkan pop-up pemblokir (modal/alert) dan membuka accordion yang tertutup.
  * **Posisi Awal Terjaga:** Saat membuka submenu (misal Kontrak), robot tetap berada di tab awal bawaan halaman (`tabel-tab`). Robot hanya berpindah ke `form-tab` jika ada instruksi klik tombol (seperti klik `#btnTambah`, `#form-tab`, atau tombol *Ubah*/*View Data*).
  * **Sensitivitas Tab Aktif (`.tab-pane.active`):** Di `searchSelect2Action.js` dan `locatorResolver.js`, pencarian elemen memprioritaskan kontainer tab yang sedang aktif (`.tab-pane.active`). Jika sedang di tabel, otomatis memilih filter tabel (`#f_unit`), dan jika sedang di form, otomatis memilih input form (`#unit`). Skenario apa pun berjalan natural tanpa konflik tab.

---
*Dokumen ini dibuat otomatis sebagai dokumentasi resmi perkembangan sistem QA Automation Studio e-Jatra.*
