# Akuntansi untuk tim developer

> Bagian dari skill `nito-accounting`. Ringkasan berbahasa Indonesia untuk
> anggota tim yang membangun ERP tapi bukan akuntan. Setiap aturan di sini
> diambil dari file referensi lain di folder ini, lengkap dengan sumber dan
> labelnya; kalau ragu, buka file yang disebut.

## 1. Inti dalam satu kalimat

Setiap kejadian yang mengubah apa yang perusahaan **miliki**, **utangi**, atau
**hasilkan** dicatat sebagai jurnal dengan debit sama dengan kredit. Dari
jurnal itulah semua laporan dibuat.

## 2. Persamaan dasar dan arti debit kredit

Aset = Liabilitas + Ekuitas (`foundations-and-standards.md`).

Debit dan kredit adalah **sisi**, bukan tambah atau kurang. Apakah sebuah
akun bertambah di debit tergantung tipenya:

| Tipe akun | Contoh | Bertambah di | Berkurang di |
|---|---|---|---|
| Aset | Kas, Bank, Piutang, Persediaan, Aset Tetap | Debit | Kredit |
| Beban | Gaji, Sewa, HPP, Penyusutan | Debit | Kredit |
| Liabilitas | Utang Usaha, Utang Pajak, Utang Gaji | Kredit | Debit |
| Ekuitas | Modal, Laba Ditahan | Kredit | Debit |
| Pendapatan | Penjualan, Pendapatan Jasa | Kredit | Debit |
| Kontra aset | Akumulasi Penyusutan, Cadangan Kerugian Piutang | Kredit | Debit |

Contoh: jual barang kredit Rp100 juta setelah diskon 5%, PPN 12% x 11/12
(contoh A1 di `ar-ap-ppn.md`):

| Akun | Debit | Kredit |
|---|---|---|
| Piutang Usaha | 105.450.000 | |
| Penjualan | | 95.000.000 |
| PPN Keluaran | | 10.450.000 |

Piutang (aset) naik di debit; penjualan (pendapatan) dan PPN Keluaran
(liabilitas ke negara) naik di kredit. Total debit sama dengan total kredit.

## 3. Istilah yang dipakai di kode

| Istilah | Artinya | Di kode |
|---|---|---|
| Bagan akun (COA) | Daftar akun perusahaan | `T_M_ACC_ACCOUNT`, `coa-template-id.json` |
| Jurnal | Satu kejadian, beberapa baris, debit = kredit | `T_L_ACC_JOURNAL_ENTRY` dan `_LINE` |
| Buku besar (GL) | Semua baris jurnal per akun | query atas baris jurnal |
| Neraca saldo | Saldo semua akun; total debit = total kredit | `trialBalance` |
| Akun kontrol | Akun yang rinciannya ada di buku pembantu (piutang per pelanggan, utang per pemasok, persediaan per barang) | `control_type` |
| Buku pembantu | Rincian per pihak atau per barang | open item, register aset, kartu stok |
| Open item | Faktur yang belum lunas | `openItems` |
| Alokasi | Pembayaran dicocokkan ke faktur | `T_L_ACC_ALLOCATION` |
| GR/IR | Barang sudah diterima, faktur pemasok belum | role `stock_received_not_billed` |
| Akrual | Beban sudah terjadi, tagihan belum datang | event `accrual` |
| Jurnal balik | Koreksi: jurnal baru yang membalik jurnal lama | `reverse` |
| Tutup buku | Periode dikunci; akhir tahun laba dipindah ke laba ditahan | `T_M_ACC_PERIOD`, `closingEntries` |
| Event | Jenis kejadian bisnis yang dikirim modul | `EVENTS`, `event-catalogue.md` |
| Role | Peran nominal dalam event (piutang, penjualan, PPN) | kunci di `amounts` |
| Penentuan akun | Role ke akun, diatur per perusahaan | `T_M_ACC_DEFAULT_ACCOUNT` |

## 4. Sepuluh aturan sistem

1. Setiap jurnal seimbang. Dicek di service, bukan cuma di database.
2. Jurnal yang sudah diposting tidak pernah diubah atau dihapus. Koreksi =
   jurnal balik + jurnal baru.
3. Uang tidak pernah float. String desimal di luar, BigInt di dalam,
   `DECIMAL(18,2)` di database.
4. Modul tidak pernah menulis baris jurnal sendiri. Modul mengirim event dan
   nominal per role ke service.
5. Mesin membaca tipe dan penanda akun, bukan kode akun. Bagan akun boleh
   beda per perusahaan.
6. Setiap jurnal menyimpan dokumen asalnya dan kunci idempotensi; kirim ulang
   tidak membuat jurnal kedua.
7. Role tanpa akun menolak posting. Tidak ada lempar ke akun penampung.
8. Buku pembantu harus sama dengan akun kontrolnya. Dicek tiap hari.
9. Tarif pajak tidak pernah ditulis di kode. Ada tabel kode pajak berlaku
   tanggal, dan statusnya (`values-to-verify.md`) ikut disimpan.
10. Nomor jurnal berurutan tanpa celah per jurnal per tahun; posting yang
    gagal tidak memakan nomor.

## 5. Kapan modul harus mengirim event

Tanyakan: kalau langkah ini dibatalkan besok, apakah akuntan perlu
mencatat sesuatu? Kalau tidak, itu bukan event.

| Kirim event | Jangan kirim |
|---|---|
| Barang dikirim, faktur terbit, uang diterima atau dibayar | Penawaran, sales order, purchase order, booking |
| Barang diterima, dipakai, dipindah, dihitung | Rencana produksi, rencana voyage |
| Pekerjaan atau voyage berjalan melewati akhir bulan | Perubahan status tanpa nilai yang berpindah |
| Payroll disetujui, aset dibeli atau disusutkan | Approval, cuti, absensi |

Daftar lengkap per modul ada di `integration-playbook.md`, dan per domain di
`domains/`.

## 6. Pajak yang paling sering muncul

| Pajak | Singkatnya | Di sistem |
|---|---|---|
| PPN | 12% atas DPP nilai lain 11/12, jadi efektif 11% untuk barang dan jasa umum (berlaku s.d. pertengahan 2026, cek ulang) | role `tax_output_ppn` (jual), `tax_input_ppn` (beli), kompensasi tiap masa |
| PPh 23 | 2% atas jasa dan sewa selain tanah dan bangunan, dipotong pembeli | dipotong pelanggan: pajak dibayar di muka; kita memotong: utang PPh 23 |
| PPh 4(2) final | Sewa tanah dan bangunan 10%, jasa konstruksi 1,75% sampai 6% | final: beban, tidak bisa dikreditkan |
| PPh 15 pelayaran | Dalam negeri 1,2% final dari bruto | `domains/voyage-shipping.md` |
| PPh 21 | Gaji, dengan tarif efektif (TER) | `payroll.md` |
| BPJS | Ketenagakerjaan dan Kesehatan, sebagian dipotong dari gaji | `payroll.md`; beberapa tarif dan batas masih bertentangan antar sumber |

Semua angka di atas wajib dicek ulang ke regulasi terbaru sebelum dipakai;
statusnya ada di `values-to-verify.md`.

## 7. Cara pakai skill ini

Tanya langsung, contohnya:

- "Jurnal untuk penjualan jasa Rp50 juta yang dipotong PPh 23?"
- "Bagaimana mencatat uang muka pelanggan lalu faktur pelunasannya?"
- "Modul voyage kita mau dihubungkan ke akuntansi, event apa saja?"
- "CRM kita cuma bikin invoice, bagaimana supaya ada dashboard keuangan?"
- "Bikin modul akuntansi dari nol untuk ERP baru."

Skill akan membuka file yang tepat, memberi jurnal yang seimbang beserta
sumber dan labelnya, dan menyebut file kode yang perlu disalin.

## 8. Urutan kerja membangun akuntansi

Ikuti `build-from-zero.md`: putuskan lima hal, salin aset, buat tabel,
siapkan perusahaan dengan `seedSql`, pasang service, hubungkan modul satu per
satu, buat layar, jalankan pengecekan harian.
