/**
 * Sistem Autentikasi & Kontrol Hak Akses Berbasis Role (RBAC)
 * PERUMDAM AMERTA TORAYA - RENCANA PEMBANGUNAN SPAM LANDORUNDUN
 * 
 * CATATAN KEAMANAN:
 * Seluruh verifikasi username & password diproses 100% di server Google Spreadsheet
 * pada tab Sheet "Admin". Tidak ada password yang disimpan di file JavaScript ini.
 */

const AUTH_KEY = 'amerta_auth_session';

// Konfigurasi Izin Halaman per Role
const ROLE_RULES = {
  admin: {
    name: 'Administrator',
    label: 'Admin',
    badgeColor: '#dc2626',
    home: 'admin.html',
    allowed: ['admin.html', 'index.html', 'cetak_peta.html', 'cetak_data.html', 'cetak_pipa.html']
  },
  survey: {
    name: 'Petugas Surveyor',
    label: 'Surveyor',
    badgeColor: '#0284c7',
    home: 'index.html',
    // Akses: Form & Peta, Cetak Peta, Cetak Data Pelanggan
    allowed: ['index.html', 'cetak_peta.html', 'cetak_data.html']
  },
  public: {
    name: 'Publikasi / Umum',
    label: 'Publik',
    badgeColor: '#16a34a',
    home: 'cetak_peta.html',
    // Akses: Cetak Peta, Cetak Data Pelanggan, Cetak Data Pipa
    allowed: ['cetak_peta.html', 'cetak_data.html', 'cetak_pipa.html']
  }
};

/**
 * Dapatkan session pengguna saat ini
 */
function getAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Simpan session pengguna
 */
function setAuthSession(sessionData) {
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
    localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
  } catch (e) {}
}

/**
 * Hapus session (Logout)
 */
function doAuthLogout() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem('amerta_admin_session');
  } catch (e) {}
  window.location.replace('login.html');
}

/**
 * Verifikasi kredensial login langsung ke Google Apps Script (Sheet "Admin")
 * Password TIDAK disimpan di frontend browser
 */
async function authenticateUser(username, password, petugasNama) {
  const user = String(username || '').trim().toLowerCase();
  const pass = String(password || '').trim();
  const namaPetugas = String(petugasNama || '').trim();

  if (!user || !pass) {
    return { success: false, message: 'Username dan password wajib diisi.' };
  }

  if (typeof CONFIG === 'undefined' || !CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.includes("ISI_DENGAN_GOOGLE")) {
    return { success: false, message: 'URL Google Apps Script belum disetel di js/config.js.' };
  }

  try {
    const body = new URLSearchParams({
      action:   'login',
      username: user,
      password: pass
    });

    const res = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();

    if (json.status === 'success') {
      const role = (json.role || 'public').toLowerCase();
      const roleConfig = ROLE_RULES[role] || ROLE_RULES.public;

      const savedPetugas = localStorage.getItem('saved_petugas_nama') || '';
      const finalPetugas = namaPetugas || (role === 'survey' ? (savedPetugas || 'Petugas Surveyor') : (json.user || user));

      if (finalPetugas && role === 'survey') {
        localStorage.setItem('saved_petugas_nama', finalPetugas);
      }

      const session = {
        username:     json.user || user,
        role:         role,
        roleName:     roleConfig.name,
        petugas_nama: finalPetugas,
        loggedInAt:   new Date().toISOString()
      };

      setAuthSession(session);

      // Jika role admin, set flag session admin legacy agar panel langsung terbuka
      if (role === 'admin') {
        sessionStorage.setItem('amerta_admin_session', 'true');
      }

      return {
        success: true,
        role:    role,
        home:    roleConfig.home
      };
    }

    return {
      success: false,
      message: json.message || 'Username atau password tidak sesuai dengan Sheet Admin.'
    };
  } catch (err) {
    console.error("Auth server error:", err);
    return {
      success: false,
      message: 'Gagal menghubungi server Google Spreadsheet. Periksa koneksi internet.'
    };
  }
}

/**
 * Guard Halaman: Memeriksa apakah pengguna berhak mengakses halaman ini
 */
function enforcePageGuard() {
  const path = window.location.pathname;
  const currentFile = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  // Jika sedang di halaman login, lewati guard
  if (currentFile === 'login.html') {
    const session = getAuthSession();
    if (session && session.role && ROLE_RULES[session.role]) {
      window.location.replace(ROLE_RULES[session.role].home);
    }
    return;
  }

  // Ambil session saat ini
  const session = getAuthSession();
  if (!session || !session.role || !ROLE_RULES[session.role]) {
    // Belum login -> Arahkan ke halaman login
    window.location.replace('login.html');
    return;
  }

  const roleConfig = ROLE_RULES[session.role];

  // Periksa apakah halaman ini diizinkan untuk role saat ini
  const isAllowed = roleConfig.allowed.includes(currentFile);
  if (!isAllowed) {
    alert(`Akses Dibatasi: Role "${roleConfig.name}" tidak memiliki izin mengakses halaman ini.`);
    window.location.replace(roleConfig.home);
    return;
  }

  // Sesuaikan tampilan navbar sesuai hak akses role
  customizeNavbarByRole(session);
}

/**
 * Sesuaikan Navbar Menu dan Profil Pengguna
 */
function customizeNavbarByRole(session) {
  const role = session.role;
  const roleConfig = ROLE_RULES[role];
  if (!roleConfig) return;

  // 1. Filter Link Navigasi Menu
  const navItems = document.querySelectorAll('.app-navbar .nav-item, .nav-links .nav-item');
  navItems.forEach(item => {
    const href = item.getAttribute('href');
    if (href) {
      const targetFile = href.split(/[?#]/)[0];
      if (targetFile && !roleConfig.allowed.includes(targetFile)) {
        item.style.display = 'none'; // Sembunyikan menu yang tidak boleh diakses
      }
    }
  });

  // 2. Tambahkan info pengguna dan tombol Logout di Navbar
  const navContainer = document.querySelector('.app-navbar .nav-container') || document.querySelector('.app-navbar');
  if (navContainer && !document.getElementById('authNavProfile')) {
    const profileWrap = document.createElement('div');
    profileWrap.id = 'authNavProfile';
    profileWrap.className = 'no-print';
    profileWrap.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:auto;padding-left:12px;';

    const isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    profileWrap.innerHTML = `
      ${!isAppInstalled ? `
        <button onclick="window.PWA && window.PWA.install ? window.PWA.install() : null" class="pwa-install-trigger" title="Pasang Aplikasi ke Layar Utama (PWA)"
          style="cursor:pointer;background:#0284c7;border:1px solid #0369a1;color:#ffffff;padding:5px 11px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;transition:all 0.15s ease;box-shadow:0 1px 3px rgba(2,132,199,0.3);">
          <span>📲</span> Pasang App
        </button>
      ` : ''}
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;background:#f8fafc;padding:4px 10px;border-radius:20px;border:1px solid #e2e8f0;">
        <span style="font-weight:700;color:#0f172a;" title="Pengguna aktif: ${session.petugas_nama || session.username}">👤 ${session.petugas_nama || session.username}</span>
        <span style="font-size:10px;font-weight:800;background:${roleConfig.badgeColor};color:#fff;padding:2px 7px;border-radius:10px;letter-spacing:0.3px;">
          ${roleConfig.label.toUpperCase()}
        </span>
      </div>
      ${role === 'admin' && !window.location.pathname.endsWith('admin.html') ? `
        <a href="admin.html" style="text-decoration:none;font-size:12px;font-weight:700;color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;padding:5px 11px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">
          ⚙️ Panel Admin
        </a>
      ` : ''}
      <button onclick="doAuthLogout()" title="Keluar dari sesi ini"
        style="cursor:pointer;background:#ffffff;border:1px solid #cbd5e1;color:#475569;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;transition:all 0.15s ease;">
        <span>⎋</span> Keluar
      </button>
    `;

    const btnLogout = profileWrap.querySelector('button');
    if (btnLogout) {
      btnLogout.onmouseenter = () => { btnLogout.style.borderColor = '#ef4444'; btnLogout.style.color = '#ef4444'; };
      btnLogout.onmouseleave = () => { btnLogout.style.borderColor = '#cbd5e1'; btnLogout.style.color = '#475569'; };
    }

    navContainer.appendChild(profileWrap);
  }
}

// Jalankan pemeriksaan akses segera saat skrip dimuat di DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enforcePageGuard);
} else {
  enforcePageGuard();
}
