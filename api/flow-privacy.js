// api/flow-privacy.js - Live Privacy Policy Page for Chrome Web Store
module.exports = (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).send(`<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kebijakan Privasi - Flow Mass Downloader</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #090a0f;
            --card-bg: rgba(17, 21, 33, 0.85);
            --card-border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
            --accent-cyan: #38bdf8;
            --accent-indigo: #6366f1;
            --accent-violet: #a855f7;
            --accent-emerald: #10b981;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-base);
            color: var(--text-main);
            min-height: 100vh;
            line-height: 1.8;
            padding: 40px 20px 80px;
            position: relative;
            overflow-x: hidden;
        }

        /* Ambient Glow */
        .glow-orb {
            position: fixed;
            filter: blur(140px);
            z-index: 0;
            opacity: 0.25;
            pointer-events: none;
        }
        .glow-1 { top: -100px; left: 10%; width: 450px; height: 450px; background: var(--accent-indigo); }
        .glow-2 { bottom: -100px; right: 10%; width: 450px; height: 450px; background: var(--accent-cyan); }

        .container {
            max-width: 840px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }

        /* Header */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(56, 189, 248, 0.1);
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 700;
            color: var(--accent-cyan);
            margin-bottom: 16px;
        }
        .header h1 {
            font-size: 2.2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }
        .effective-date {
            color: var(--text-dim);
            font-size: 0.9rem;
            font-weight: 500;
        }

        /* Content Card */
        .content-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            padding: 40px;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            gap: 32px;
        }

        .section {
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            padding-bottom: 24px;
        }
        .section:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        h2 span.icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            background: rgba(99, 102, 241, 0.15);
            color: var(--accent-indigo);
            font-size: 0.9rem;
        }

        p {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-bottom: 12px;
        }

        ul {
            list-style: none;
            padding-left: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        li {
            color: var(--text-muted);
            font-size: 0.92rem;
            position: relative;
            padding-left: 20px;
        }

        li::before {
            content: "•";
            color: var(--accent-cyan);
            font-weight: bold;
            font-size: 1.2rem;
            position: absolute;
            left: 4px;
            top: -2px;
        }

        .highlight-box {
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 12px;
            padding: 16px 20px;
            margin-top: 12px;
        }

        .highlight-box p {
            color: #a7f3d0;
            margin-bottom: 0;
            font-size: 0.9rem;
        }

        .footer {
            text-align: center;
            margin-top: 40px;
            color: var(--text-dim);
            font-size: 0.85rem;
        }
        .footer a {
            color: var(--accent-cyan);
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="glow-orb glow-1"></div>
    <div class="glow-orb glow-2"></div>

    <div class="container">
        <div class="header">
            <div class="badge">🛡️ Kebijakan Privasi Resmi (Privacy Policy)</div>
            <h1>Flow Mass Downloader</h1>
            <div class="effective-date">Berlaku Mulai: 30 Agustus 2026 • Versi 1.2</div>
        </div>

        <div class="content-card">
            <!-- Section 1 -->
            <div class="section">
                <h2><span class="icon">1</span> Pendahuluan</h2>
                <p>Flow Mass Downloader ("kami", "ekstensi", atau "aplikasi") berkomitmen penuh untuk menghormati dan melindungi privasi serta keamanan data setiap pengguna. Kebijakan Privasi ini menjelaskan bagaimana data dan informasi Anda dikelola saat menggunakan ekstensi Chrome Flow Mass Downloader.</p>
            </div>

            <!-- Section 2 -->
            <div class="section">
                <h2><span class="icon">2</span> Data yang Dikumpulkan & Tujuannya</h2>
                <p>Ekstensi kami dirancang dengan prinsip <i>Privacy-First</i> dan <i>Data Minimization</i>. Kami hanya mengumpulkan data yang mutlak diperlukan untuk mengoperasikan fitur ekstensi:</p>
                <ul>
                    <li><b>Informasi Akun Google (Email & Nama Profil):</b> Diambil saat Anda melakukan Login dengan Google untuk memverifikasi masa aktif Free Trial (2 Hari) dan lisensi Lifetime Pro Anda.</li>
                    <li><b>Preferensi Unduhan Lokal:</b> Pilihan resolusi (1K/2K/4K), nama subfolder tujuan, pengaturan delay timer, dan bahasa antarmuka disimpan secara lokal di browser Anda menggunakan <code>chrome.storage.local</code>.</li>
                    <li><b>Konten Media:</b> Ekstensi hanya membaca elemen gambar/video yang tampil di tab aktif Google Labs Flow (<code>labs.google</code>) atas perintah klik Anda untuk memulai unduhan.</li>
                </ul>
            </div>

            <!-- Section 3 -->
            <div class="section">
                <h2><span class="icon">3</span> Izin Ekstensi Chrome (Permissions)</h2>
                <p>Ekstensi hanya meminta izin minimum yang diperlukan untuk menjalankan fungsinya:</p>
                <ul>
                    <li><code>downloads</code>: Digunakan untuk memicu penyimpanan berkas media yang dihasilkan ke folder komputer lokal Anda.</li>
                    <li><code>storage</code>: Digunakan untuk menyimpan preferensi pengguna (resolusi, folder, delay) secara lokal pada perangkat Anda.</li>
                    <li><code>identity</code>: Digunakan untuk memfasilitasi autentikasi Google Sign-In secara aman.</li>
                    <li><code>host_permissions (labs.google)</code>: Digunakan untuk berinteraksi dengan antarmuka web Google Labs Flow guna mendeteksi media dan memicu proses unduhan.</li>
                </ul>
            </div>

            <!-- Section 4 -->
            <div class="section">
                <h2><span class="icon">4</span> Perlindungan & Larangan Penjualan Data</h2>
                <div class="highlight-box">
                    <p><b>Jaminan Keamanan:</b> Kami <b>TIDAK PERNAH</b> menjual, menyewakan, meminjamkan, atau membagikan informasi pribadi atau data penggunaan Anda kepada pihak ketiga, pengiklan, atau broker data mana pun.</p>
                </div>
                <p style="margin-top: 12px;">Kami tidak melacak riwayat penjelajahan (browsing history) Anda di luar situs <code>labs.google</code>. Seluruh transmisi otentikasi login dan verifikasi lisensi diamankan dengan protokol enkripsi standar industri HTTPS/TLS.</p>
            </div>

            <!-- Section 5 -->
            <div class="section">
                <h2><span class="icon">5</span> Pembayaran & Lisensi</h2>
                <p>Transaksi pembelian Lisensi Lifetime diproses secara aman melalui platform pembayaran resmi pihak ketiga (Lynk.id / QRIS). Kami tidak menyimpan informasi kartu kredit atau detail perbankan Anda di server kami.</p>
            </div>

            <!-- Section 6 -->
            <div class="section">
                <h2><span class="icon">6</span> Kontak Kami</h2>
                <p>Jika Anda memiliki pertanyaan, masukan, atau permintaan terkait Kebijakan Privasi ini, silakan hubungi tim pengembang kami melalui email:</p>
                <p><b>Email Dukungan:</b> <code style="color: var(--accent-cyan);">aronisme@gmail.com</code></p>
            </div>
        </div>

        <div class="footer">
            © 2026 Flow Mass Downloader. Dikembangkan oleh Aron Muhammad. Semua hak dilindungi undang-undang.
        </div>
    </div>
</body>
</html>`);
};
