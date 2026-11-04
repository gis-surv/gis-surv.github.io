/**
 * PWA Helper & Installer Script
 * DAFTAR CALON PELANGGAN SPAM LANDORUNDUN SESEAN SULOARA' — PERUMDAM Amerta Toraya
 */

(function () {
  'use strict';

  let deferredPrompt = null;

  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
          try { reg.update(); } catch(e) {}
          console.log('[PWA] Service Worker terdaftar dengan scope:', reg.scope);
        })
        .catch(err => {
          console.warn('[PWA] Gagal mendaftarkan Service Worker:', err);
        });
    });
  }

  // 2. Cek apakah sudah berjalan dalam mode Standalone PWA (sudah terinstal)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  if (isStandalone) {
    console.log('[PWA] Aplikasi berjalan dalam mode Standalone.');
    return;
  }

  // 3. Tangkap event beforeinstallprompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showPwaInstallPrompt();
  });

  // 4. Tangkap event appinstalled
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplikasi berhasil dipasang ke perangkat!');
    deferredPrompt = null;
    hidePwaInstallPrompt();
    showToastInstallSuccess();
  });

  // Tampilkan tombol / banner instalasi
  function showPwaInstallPrompt() {
    if (document.getElementById('pwaInstallFloatingBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwaInstallFloatingBanner';
    banner.innerHTML = `
      <div class="pwa-banner-card">
        <div class="pwa-banner-icon">
          <img src="assets/icons/icon-192.png" alt="Logo SPAM Landorundun Sesean Suloara'" width="40" height="40">
        </div>
        <div class="pwa-banner-info">
          <div class="pwa-banner-title">Pasang Aplikasi PWA</div>
          <div class="pwa-banner-sub">Akses cepat offline & fullscreen di HP / PC</div>
        </div>
        <div class="pwa-banner-actions">
          <button type="button" class="pwa-btn-install" id="pwaBtnInstallAction">
            <span>📲</span> Pasang
          </button>
          <button type="button" class="pwa-btn-close" id="pwaBtnDismissAction" title="Tutup">✕</button>
        </div>
      </div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.id = 'pwaInstallStyles';
    style.textContent = `
      #pwaInstallFloatingBanner {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        max-width: 380px;
        width: calc(100% - 40px);
        animation: pwaSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes pwaSlideUp {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .pwa-banner-card {
        background: #0f172a;
        color: #ffffff;
        border: 1.5px solid #0284c7;
        border-radius: 14px;
        padding: 12px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      }
      .pwa-banner-icon img {
        border-radius: 10px;
        display: block;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      .pwa-banner-info {
        flex: 1;
        min-width: 0;
      }
      .pwa-banner-title {
        font-weight: 800;
        font-size: 13.5px;
        color: #f8fafc;
        line-height: 1.25;
      }
      .pwa-banner-sub {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 2px;
        line-height: 1.2;
      }
      .pwa-banner-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pwa-btn-install {
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        border: none;
        padding: 7px 13px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: transform 0.15s, box-shadow 0.15s;
        box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4);
      }
      .pwa-btn-install:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(2, 132, 199, 0.6);
      }
      .pwa-btn-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 15px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.15s, color 0.15s;
      }
      .pwa-btn-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }
      @media print {
        #pwaInstallFloatingBanner { display: none !important; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    // Event handlers
    document.getElementById('pwaBtnInstallAction').addEventListener('click', triggerPwaInstall);
    document.getElementById('pwaBtnDismissAction').addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }

  function hidePwaInstallPrompt() {
    const banner = document.getElementById('pwaInstallFloatingBanner');
    if (banner) banner.remove();
  }

  function triggerPwaInstall() {
    if (!deferredPrompt) {
      alert('Untuk memasang aplikasi ini di browser Anda:\n- Di Android Chrome: Klik menu titik tiga (⋮) > pilih "Install app" atau "Tambahkan ke Layar Utama".\n- Di iPhone Safari: Klik ikon Share (kotak panah ke atas) > pilih "Add to Home Screen".\n- Di Desktop Chrome/Edge: Klik ikon Pasang/Install di sebelah kanan bilah alamat (URL bar).');
      return;
    }

    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(choiceResult => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] Pengguna menyetujui instalasi aplikasi.');
      } else {
        console.log('[PWA] Pengguna membatalkan instalasi aplikasi.');
      }
      deferredPrompt = null;
      hidePwaInstallPrompt();
    });
  }

  function showToastInstallSuccess() {
    const toast = document.createElement('div');
    toast.textContent = '🎉 Aplikasi SPAM Landorundun Sesean Suloara' berhasil dipasang!';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 100000;
      animation: pwaSlideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // Hook tombol kustom jika ada di halaman
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.pwa-install-trigger').forEach(btn => {
      btn.addEventListener('click', triggerPwaInstall);
    });
  });

  // Ekspor global helper
  window.PWA = {
    install: triggerPwaInstall,
    isStandalone: isStandalone
  };
})();

