document.addEventListener('DOMContentLoaded', function () {
  const initialLat = CONFIG.INITIAL_COORDS.lat;
  const initialLng = CONFIG.INITIAL_COORDS.lng;
  const defaultZoom = CONFIG.INITIAL_COORDS.defaultZoom;
  const gpsZoom = CONFIG.INITIAL_COORDS.gpsZoom;

  // 1. Layer Google Hybrid (Foto Satelit Asli Google + Nama Jalan / Label)
  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    crossOrigin: true,
    referrerPolicy: 'no-referrer'
  });

  // 2. Layer Google Peta Jalan Standar
  const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    crossOrigin: true,
    referrerPolicy: 'no-referrer'
  });

  // 3. Layer Google Kontur & Topografi Medan (Terrain)
  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    crossOrigin: true,
    referrerPolicy: 'no-referrer'
  });

  // Inisialisasi Peta
  const map = L.map('map', {
    center: [initialLat, initialLng],
    zoom: defaultZoom,
    zoomControl: false,
    layers: [googleHybrid] // Default langsung menampilkan Satelit Google
  });

  // Tombol zoom di kiri atas
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // Layer Penanda Pelanggan & Jalur Pipa Terdaftar di Sekitar
  const existingCustomersGroup = L.featureGroup().addTo(map);
  const existingPipesGroup     = L.featureGroup().addTo(map);

  // Pengalih mode peta di kanan atas (Satelit, Jalan, & Kontur Topografi)
  const baseMaps = {
    "Google Satelit": googleHybrid,
    "Google Jalan": googleRoadmap,
    "Google Kontur / Medan": googleTerrain
  };
  const overlayMaps = {
    "Pelanggan Terdata (Titik & Atap)": existingCustomersGroup,
    "Jaringan Pipa Distribusi": existingPipesGroup
  };
  L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

  // Pastikan render ukuran peta sempurna di layar mobile
  setTimeout(() => { map.invalidateSize(); }, 300);
  window.addEventListener('resize', () => { map.invalidateSize(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { map.invalidateSize(); }, 200); });

  // ==========================================
  // STATE DIGITASI POLIGON ATAP BANGUNAN
  // ==========================================
  let isDrawingMode = false;
  let polygonPoints = [];       // Array [ [lat, lng], ... ]
  let roofPolygonLayer = null;  // Layer L.polygon
  let cornerMarkersGroup = L.layerGroup().addTo(map);

  // Pin Penanda Pusat (Default Marker)
  const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

  // Elemen DOM Kontrol Gambar Atap
  const btnDrawPolygon = document.getElementById('btnDrawPolygon');
  const btnFinishPolygon = document.getElementById('btnFinishPolygon');
  const btnResetPolygon = document.getElementById('btnResetPolygon');
  const drawInstructions = document.getElementById('drawInstructions');
  const inputPolygonCoords = document.getElementById('polygon_coords');
  const displayArea = document.getElementById('displayArea');

  // Fungsi update koordinat ke input form & display badge
  function setCoordinates(lat, lng) {
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);
    document.getElementById('displayLat').innerText = lat.toFixed(5);
    document.getElementById('displayLng').innerText = lng.toFixed(5);
  }
  setCoordinates(initialLat, initialLng);

  // Saat pin pusat digeser manual
  marker.on('dragend', function () {
    if (!isDrawingMode && polygonPoints.length === 0) {
      const pos = marker.getLatLng();
      setCoordinates(pos.lat, pos.lng);
    }
  });

  // ==========================================
  // ALAT PENARIKAN GARIS POLIGON ATAP
  // ==========================================
  function activateDrawingMode() {
    isDrawingMode = true;
    btnDrawPolygon.classList.add('is-drawing');
    btnDrawPolygon.innerHTML = `<span>✏️</span> Menggambar...`;
    btnResetPolygon.style.display = 'inline-flex';
    drawInstructions.style.display = 'block';
    map.getContainer().style.cursor = 'crosshair';

    // Sembunyikan marker titik tunggal agar pandangan atap bersih
    map.removeLayer(marker);
  }

  function finishDrawingMode() {
    if (polygonPoints.length < 3) {
      alert("Harap buat minimal 3 titik sudut untuk membentuk bidang atap bangunan!");
      return;
    }

    isDrawingMode = false;
    btnDrawPolygon.classList.remove('is-drawing');
    btnDrawPolygon.innerHTML = `<span>✏️</span> Gambar Atap`;
    btnFinishPolygon.style.display = 'none';
    drawInstructions.style.display = 'none';
    map.getContainer().style.cursor = '';

    // Kunci bentuk poligon (garis jadi solid tegas)
    if (roofPolygonLayer) {
      roofPolygonLayer.setStyle({
        color: '#0284c7',
        weight: 2.5,
        fillColor: '#0284c7',
        fillOpacity: 0.4,
        dashArray: null
      });
    }

    // Tampilkan kembali pin penanda tepat di pusat atap (centroid)
    const centroid = calculateCentroid(polygonPoints);
    marker.setLatLng([centroid.lat, centroid.lng]);
    map.addLayer(marker);
    setCoordinates(centroid.lat, centroid.lng);
  }

  function resetRoofPolygon() {
    isDrawingMode = false;
    polygonPoints = [];
    if (roofPolygonLayer) {
      map.removeLayer(roofPolygonLayer);
      roofPolygonLayer = null;
    }
    cornerMarkersGroup.clearLayers();

    btnDrawPolygon.classList.remove('is-drawing');
    btnDrawPolygon.innerHTML = `<span>✏️</span> Gambar Atap`;
    btnFinishPolygon.style.display = 'none';
    btnResetPolygon.style.display = 'none';
    drawInstructions.style.display = 'none';
    map.getContainer().style.cursor = '';

    if (inputPolygonCoords) inputPolygonCoords.value = '';
    if (displayArea) displayArea.innerText = 'Titik Tunggal';

    // Kembalikan marker titik awal
    marker.setLatLng([initialLat, initialLng]);
    map.addLayer(marker);
    setCoordinates(initialLat, initialLng);
  }

  // Tombol Toggle Gambar Atap
  if (btnDrawPolygon) {
    btnDrawPolygon.addEventListener('click', function() {
      if (!isDrawingMode) {
        activateDrawingMode();
      } else {
        if (polygonPoints.length >= 3) {
          finishDrawingMode();
        } else {
          resetRoofPolygon();
        }
      }
    });
  }

  // Tombol Selesai Gambar
  if (btnFinishPolygon) {
    btnFinishPolygon.addEventListener('click', finishDrawingMode);
  }

  // Tombol Ulangi / Hapus
  if (btnResetPolygon) {
    btnResetPolygon.addEventListener('click', resetRoofPolygon);
  }

  // Hitung Titik Tengah (Centroid) Poligon Atap
  function calculateCentroid(points) {
    let sumLat = 0, sumLng = 0;
    points.forEach(p => { sumLat += p[0]; sumLng += p[1]; });
    return {
      lat: sumLat / points.length,
      lng: sumLng / points.length
    };
  }

  // Hitung Estimasi Luas Poligon (m²)
  function calculateApproxArea(points) {
    if (points.length < 3) return 0;
    const earthRadius = 6378137;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      let j = (i + 1) % points.length;
      let p1 = points[i];
      let p2 = points[j];
      let lat1 = p1[0] * Math.PI / 180;
      let lat2 = p2[0] * Math.PI / 180;
      let dLng = (p2[1] - p1[1]) * Math.PI / 180;
      area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    area = Math.abs(area * earthRadius * earthRadius / 4.0);
    return Math.round(area);
  }

  // Saat Peta Diklik
  map.on('click', function (e) {
    if (isDrawingMode) {
      // 1. Tambah titik sudut atap baru
      const newPoint = [e.latlng.lat, e.latlng.lng];
      polygonPoints.push(newPoint);

      // Buat penanda titik sudut (bulatan kecil)
      const cornerIcon = L.divIcon({
        className: '',
        html: `<div style="width:9px; height:9px; background:#ffffff; border:2px solid #0284c7; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
        iconSize: [9, 9],
        iconAnchor: [5, 5]
      });
      L.marker(e.latlng, { icon: cornerIcon }).addTo(cornerMarkersGroup);

      // 2. Gambar atau perbarui bidang poligon arsiran atap
      if (polygonPoints.length === 1) {
        // Baru 1 titik
        if (displayArea) displayArea.innerText = '1 sudut ditandai';
      } else if (polygonPoints.length === 2) {
        // 2 titik: gambar garis bantu
        if (roofPolygonLayer) map.removeLayer(roofPolygonLayer);
        roofPolygonLayer = L.polyline(polygonPoints, {
          color: '#0284c7',
          weight: 2.5,
          dashArray: '5, 3'
        }).addTo(map);
        if (displayArea) displayArea.innerText = '2 sudut ditandai';
      } else {
        // 3 titik atau lebih: gambar poligon arsiran
        if (roofPolygonLayer) map.removeLayer(roofPolygonLayer);
        roofPolygonLayer = L.polygon(polygonPoints, {
          color: '#0284c7',
          weight: 2.5,
          fillColor: '#0284c7',
          fillOpacity: 0.4,
          dashArray: '5, 3'
        }).addTo(map);

        btnFinishPolygon.style.display = 'inline-flex';

        // Hitung luas dan koordinat
        const approxArea = calculateApproxArea(polygonPoints);
        if (displayArea) displayArea.innerText = `Atap: ~${approxArea} m² (${polygonPoints.length} sudut)`;
      }

      // 3. Simpan koordinat poligon ke string format 'lat,lng;lat,lng;...'
      const coordsString = polygonPoints.map(pt => `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`).join(';');
      if (inputPolygonCoords) inputPolygonCoords.value = coordsString;

      // Update koordinat pusat atap (centroid)
      const centroid = calculateCentroid(polygonPoints);
      setCoordinates(centroid.lat, centroid.lng);

    } else if (polygonPoints.length === 0) {
      // Mode biasa tanpa poligon: geser titik marker tunggal
      marker.setLatLng(e.latlng);
      setCoordinates(e.latlng.lat, e.latlng.lng);
    }
  });

  // Tombol Deteksi GPS
  const btnGps = document.getElementById('btnGps');
  if (btnGps) {
    btnGps.addEventListener('click', function () {
      if (!navigator.geolocation) {
        alert("GPS tidak didukung oleh browser Anda.");
        return;
      }

      btnGps.innerText = "Mencari...";

      navigator.geolocation.getCurrentPosition(
        function (pos) {
          btnGps.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
            Lokasi Saya`;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          map.setView([lat, lng], gpsZoom);
          if (!isDrawingMode && polygonPoints.length === 0) {
            marker.setLatLng([lat, lng]);
            setCoordinates(lat, lng);
          }
        },
        function () {
          btnGps.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
            Lokasi Saya`;
          alert("Gagal membaca GPS. Pastikan izin lokasi telah diaktifkan di browser/perangkat Anda.");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ==========================================
  // LOGIKA CHECKBOX PERUNTUKAN BANGUNAN
  // ==========================================
  const form = document.getElementById('customerForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusMsg = document.getElementById('statusMessage');

  const peruntukanCheckboxes = document.querySelectorAll('.cb-peruntukan');
  const peruntukanHidden = document.getElementById('peruntukan_bangunan');
  const cbLainnya = document.getElementById('cbLainnya');
  const peruntukanLainnyaWrapper = document.getElementById('peruntukanLainnyaWrapper');
  const peruntukanLainnyaInput = document.getElementById('peruntukan_lainnya');

  function syncPeruntukan() {
    const selected = [];
    peruntukanCheckboxes.forEach(cb => {
      if (cb.checked) {
        if (cb.id === 'cbLainnya') {
          const extra = peruntukanLainnyaInput.value.trim();
          selected.push(extra ? `Lainnya (${extra})` : 'Lainnya');
        } else {
          selected.push(cb.value);
        }
      }
    });
    peruntukanHidden.value = selected.join(', ');
  }

  peruntukanCheckboxes.forEach(cb => {
    cb.addEventListener('change', function () {
      const parent = this.closest('.checkbox-label');
      if (parent) {
        parent.classList.toggle('is-checked', this.checked);
      }
      if (this.id === 'cbLainnya') {
        if (this.checked) {
          peruntukanLainnyaWrapper.style.display = 'block';
          peruntukanLainnyaInput.focus();
        } else {
          peruntukanLainnyaWrapper.style.display = 'none';
          peruntukanLainnyaInput.value = '';
        }
      }
      syncPeruntukan();
    });
  });

  if (peruntukanLainnyaInput) {
    peruntukanLainnyaInput.addEventListener('input', syncPeruntukan);
  }

  // Reset form handler
  form.addEventListener('reset', function () {
    setTimeout(() => {
      peruntukanCheckboxes.forEach(cb => {
        const parent = cb.closest('.checkbox-label');
        if (parent) parent.classList.remove('is-checked');
      });
      peruntukanHidden.value = '';
      if (peruntukanLainnyaWrapper) peruntukanLainnyaWrapper.style.display = 'none';
      if (peruntukanLainnyaInput) peruntukanLainnyaInput.value = '';
      resetRoofPolygon();
      map.setView([initialLat, initialLng], defaultZoom);
    }, 0);
  });

  // ==========================================
  // MANAJEMEN IDENTITAS PETUGAS / SUMBER DATA
  // ==========================================
  const displayPetugasEl = document.getElementById('displayPetugasNama');
  const inputSumberData  = document.getElementById('sumber_data');
  const btnUbahPetugas   = document.getElementById('btnUbahPetugas');
  let activePetugasName  = '';

  function initSurveyorIdentity() {
    let session = (typeof getAuthSession === 'function') ? getAuthSession() : null;
    let savedName = localStorage.getItem('saved_petugas_nama') || '';
    activePetugasName = (session && session.petugas_nama) ? session.petugas_nama : savedName;

    // Jika belum ada nama dan yang login adalah surveyor
    if (!activePetugasName && session && session.role === 'survey') {
      const input = prompt("Silakan masukkan Nama Lengkap Anda sebagai Petugas Surveyor:", "");
      if (input && input.trim()) {
        activePetugasName = input.trim();
        session.petugas_nama = activePetugasName;
        if (typeof setAuthSession === 'function') setAuthSession(session);
        localStorage.setItem('saved_petugas_nama', activePetugasName);
      }
    }

    if (!activePetugasName) {
      activePetugasName = (session && session.username) ? ('Petugas ' + session.username) : 'Petugas Surveyor';
    }

    if (displayPetugasEl) displayPetugasEl.textContent = activePetugasName;
    if (inputSumberData)  inputSumberData.value = activePetugasName;
  }

  if (btnUbahPetugas) {
    btnUbahPetugas.addEventListener('click', function () {
      const baru = prompt("Ubah Nama Lengkap Petugas Surveyor / Sumber Data:", activePetugasName);
      if (baru !== null && baru.trim() !== '') {
        activePetugasName = baru.trim();
        if (displayPetugasEl) displayPetugasEl.textContent = activePetugasName;
        if (inputSumberData)  inputSumberData.value = activePetugasName;
        localStorage.setItem('saved_petugas_nama', activePetugasName);

        let session = (typeof getAuthSession === 'function') ? getAuthSession() : null;
        if (session) {
          session.petugas_nama = activePetugasName;
          if (typeof setAuthSession === 'function') setAuthSession(session);
        }
      }
    });
  }

  initSurveyorIdentity();

  // ==========================================
  // PENGIRIMAN DATA FORMULIR KE BACKEND
  // ==========================================
  const successModal = document.getElementById('successModal');
  const btnModalClose = document.getElementById('btnModalClose');

  function showSuccessModal() {
    if (successModal) {
      successModal.style.display = 'flex';
    }
  }

  function hideSuccessModal() {
    if (successModal) {
      successModal.style.display = 'none';
    }
  }

  if (btnModalClose) {
    btnModalClose.addEventListener('click', hideSuccessModal);
  }

  if (successModal) {
    successModal.addEventListener('click', function (e) {
      if (e.target === successModal) {
        hideSuccessModal();
      }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const scriptUrl = CONFIG.SCRIPT_URL;

    if (!scriptUrl || scriptUrl.includes("ISI_DENGAN_GOOGLE")) {
      alert("Harap masukkan SCRIPT_URL Google Apps Script Anda terlebih dahulu di file js/config.js!");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Mengirim...";
    statusMsg.style.display = "none";

    const formData = new FormData(form);
    // Pastikan sumber data / nama petugas selalu terisi
    formData.set('sumber_data', activePetugasName || (inputSumberData ? inputSumberData.value : 'Surveyor'));

    fetch(scriptUrl, {
      method: 'POST',
      body: formData
    })
    .then(res => {
      if (!res.ok && res.status !== 0) {
        throw new Error(`HTTP status: ${res.status}`);
      }
      return res.json().catch(() => ({ status: 'success', message: 'Data pendaftaran berhasil terkirim!' }));
    })
    .then(res => {
      submitBtn.disabled = false;
      submitBtn.innerText = "Kirim Pendaftaran";

      if (res.status === 'success') {
        showSuccessModal();
        form.reset();
        if (inputSumberData) inputSumberData.value = activePetugasName;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error(res.message || "Gagal menyimpan data");
      }
    })
    .catch(err => {
      submitBtn.disabled = false;
      submitBtn.innerText = "Kirim Pendaftaran";
      // Google Apps Script melakukan redirect 302 yang kadang memicu blokir CORS browser lokal,
      // padahal data sudah sukses diterima dan disimpan di Google Sheets.
      if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("Load failed"))) {
        showSuccessModal();
        form.reset();
        if (inputSumberData) inputSumberData.value = activePetugasName;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        statusMsg.className = "status-msg status-error";
        statusMsg.innerText = "Gagal mengirim: " + err.message;
        statusMsg.style.display = "block";
      }
    });
  });

  // ==========================================
  // PEMUATAN DATA GIS SEKITAR (PELANGGAN & PIPA)
  // Berfokus pada pemusatan lokasi saat ini tanpa fitBounds
  // ==========================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parsePolygonCoords(str) {
    if (!str) return [];
    const cleanStr = String(str).replace(/^['=]+/, '').trim();
    const rawPairs = cleanStr.split(/[;\n|]/).map(s => s.trim()).filter(Boolean);
    const coords = [];
    rawPairs.forEach(pair => {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        let pLat = parseFloat(parts[0].trim().replace(',', '.'));
        let pLng = parseFloat(parts[1].trim().replace(',', '.'));
        if (!isNaN(pLat) && !isNaN(pLng)) {
          if (!parts[0].includes('.') && Math.abs(pLat) > 1000) pLat /= 1000000;
          if (!parts[1].includes('.') && Math.abs(pLng) > 1000) pLng /= 1000000;
          coords.push([pLat, pLng]);
        }
      }
    });
    return coords;
  }

  function normalizePipeRow(p) {
    if (!p) return {};
    let coordStr = '';
    for (const [key, val] of Object.entries(p)) {
      if (typeof val === 'string' && val.includes(';') && val.includes(',') && val.length > 20) {
        coordStr = val.replace(/^['=]/, '').trim();
        break;
      }
    }
    return {
      nama: p.nama || 'Jalur Pipa',
      diameter: p.diameter ? String(p.diameter).replace(/^'/, '').trim() : '',
      panjang: p.panjang ? String(p.panjang).replace(/^'/, '').trim() : '',
      elev_awal: p.elev_awal ? String(p.elev_awal).replace(/^'/, '').trim() : '',
      elev_akhir: p.elev_akhir ? String(p.elev_akhir).replace(/^'/, '').trim() : '',
      warna: p.warna || '#2563eb',
      koordinat: coordStr || (p.koordinat ? String(p.koordinat).replace(/^['=]/, '').trim() : '')
    };
  }

  function parsePipeCoords(str) {
    if (!str) return [];
    const cleanStr = String(str).replace(/^['=]+/, '').trim();
    const pairs = cleanStr.split(';').map(s => s.trim()).filter(Boolean);
    const coords = [];
    pairs.forEach(pair => {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        let lat = parseFloat(parts[0].trim().replace(',', '.'));
        let lng = parseFloat(parts[1].trim().replace(',', '.'));
        if (!isNaN(lat) && !isNaN(lng)) {
          if (!parts[0].includes('.') && Math.abs(lat) > 1000) lat /= 1000000;
          if (!parts[1].includes('.') && Math.abs(lng) > 1000) lng /= 1000000;
          coords.push([lat, lng]);
        }
      }
    });
    return coords;
  }

  function loadExistingGisLayers() {
    const scriptUrl = CONFIG.SCRIPT_URL;
    if (!scriptUrl || scriptUrl.includes("ISI_DENGAN_GOOGLE")) return;

    const badgeStatus = document.getElementById('gisLayersStatus');
    let loadedCustCount = 0;
    let loadedPipeCount = 0;

    function updateBadgeText() {
      if (badgeStatus) {
        badgeStatus.textContent = `${loadedCustCount} Pelanggan & ${loadedPipeCount} Rute Pipa Terdata`;
      }
    }

    // 1. Muat Data Pelanggan Terdaftar (Titik & Poligon Atap)
    fetch(scriptUrl)
      .then(res => res.json())
      .then(res => {
        const rows = Array.isArray(res) ? res :
                     (res.status === 'success' && Array.isArray(res.data)) ? res.data :
                     (Array.isArray(res.data) ? res.data : []);

        existingCustomersGroup.clearLayers();
        loadedCustCount = rows.length;
        updateBadgeText();

        rows.forEach((row, idx) => {
          const noUrut = row.no || (idx + 1);
          let rawLat = (row.latitude !== undefined && row.latitude !== "") ? row.latitude : row.lat;
          let rawLng = (row.longitude !== undefined && row.longitude !== "") ? row.longitude : row.lng;
          let lat = parseFloat(String(rawLat || '').replace(/^'/, '').trim().replace(',', '.'));
          let lng = parseFloat(String(rawLng || '').replace(/^'/, '').trim().replace(',', '.'));
          if (!isNaN(lat) && !String(rawLat).includes('.') && Math.abs(lat) > 1000) lat /= 1000000;
          if (!isNaN(lng) && !String(rawLng).includes('.') && Math.abs(lng) > 1000) lng /= 1000000;

          const polyRaw = row.polygon || row.polygon_coords || '';
          const polygonCoords = parsePolygonCoords(polyRaw);

          const popupHtml = `
            <div style="font-size:12px;line-height:1.45;min-width:185px;">
              <div style="font-size:13px;font-weight:800;color:#0284c7;margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;">
                #${noUrut}. ${escapeHtml(row.nama || 'Pelanggan Terdaftar')}
              </div>
              <div style="color:#334155;margin-bottom:2px;">📍 ${escapeHtml(row.alamat || '-')}</div>
              <div style="color:#059669;font-weight:600;margin-bottom:2px;">📋 ${escapeHtml(row.klasifikasi || row.peruntukan || 'Rumah Tangga')}</div>
              ${row.whatsapp ? `<div style="color:#2563eb;font-size:11px;margin-bottom:2px;">📞 ${escapeHtml(row.whatsapp)}</div>` : ''}
              ${polygonCoords.length >= 3 ? `<div style="color:#dc2626;font-size:11px;font-weight:700;">🏠 Bidang Atap (${polygonCoords.length} Sudut Arsiran)</div>` : ''}
              <div style="font-size:10px;color:#64748b;margin-top:4px;border-top:1px dashed #e2e8f0;padding-top:2px;">Sumber: <strong>${escapeHtml(row.sumber || 'Surveyor')}</strong></div>
            </div>
          `;

          // A. Arsiran Atap Bangunan yang sudah terdata
          if (polygonCoords.length >= 3) {
            const roofPoly = L.polygon(polygonCoords, {
              color: '#dc2626',
              weight: 1.8,
              fillColor: '#ef4444',
              fillOpacity: 0.35,
              dashArray: '3, 3'
            }).bindPopup(popupHtml);

            roofPoly.on('click', function(e) {
              if (isDrawingMode) {
                L.DomEvent.stopPropagation(e);
                map.fire('click', e);
              }
            });

            existingCustomersGroup.addLayer(roofPoly);

            if (isNaN(lat) || isNaN(lng)) {
              let sumLat = 0, sumLng = 0;
              polygonCoords.forEach(pt => { sumLat += pt[0]; sumLng += pt[1]; });
              lat = sumLat / polygonCoords.length;
              lng = sumLng / polygonCoords.length;
            }
          }

          // B. Pin Titik Pelanggan yang sudah terdata
          if (!isNaN(lat) && !isNaN(lng)) {
            const pinIcon = L.divIcon({
              className: 'existing-cust-pin-wrapper',
              html: `<div class="existing-cust-pin" title="${escapeHtml(row.nama || 'Pelanggan')}">${noUrut}</div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              popupAnchor: [0, -10]
            });

            const custMarker = L.marker([lat, lng], {
              icon: pinIcon,
              zIndexOffset: 50
            }).bindPopup(popupHtml);

            custMarker.on('click', function(e) {
              if (isDrawingMode) {
                L.DomEvent.stopPropagation(e);
                map.fire('click', e);
              }
            });

            existingCustomersGroup.addLayer(custMarker);
          }
        });
        // CATATAN: TIDAK melakukan fitBounds agar posisi peta tetap terpusat di lokasi surveyor
      })
      .catch(err => {
        console.warn("Gagal memuat layer pelanggan:", err);
      });

    // 2. Muat Jalur Pipa Distribusi dari Sheet 3
    fetch(scriptUrl + '?action=get_pipes')
      .then(res => res.json())
      .then(json => {
        if (json.status === 'success' && Array.isArray(json.pipes)) {
          existingPipesGroup.clearLayers();
          const validPipes = [];

          json.pipes.forEach(rawPipe => {
            const pipe = normalizePipeRow(rawPipe);
            const coords = parsePipeCoords(pipe.koordinat);
            if (coords.length >= 2) {
              validPipes.push(pipe);
              const color = pipe.warna || '#2563eb';

              const polyline = L.polyline(coords, {
                color: color,
                weight: 4,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }).bindPopup(`
                <div style="font-size:12px;line-height:1.45;min-width:180px;">
                  <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;">
                    🔧 ${escapeHtml(pipe.nama || 'Jalur Pipa')}
                  </div>
                  <div>Dimensi: <strong>${pipe.diameter ? pipe.diameter + '"' : '-'}</strong></div>
                  <div>Panjang: <strong>${pipe.panjang || '0'} meter</strong></div>
                  ${pipe.elev_awal ? `<div>Elevasi: <strong>${pipe.elev_awal}m ➔ ${pipe.elev_akhir}m</strong></div>` : ''}
                </div>
              `);

              polyline.on('click', function(e) {
                if (isDrawingMode) {
                  L.DomEvent.stopPropagation(e);
                  map.fire('click', e);
                }
              });

              existingPipesGroup.addLayer(polyline);

              // Titik simpul pipa awal & akhir
              existingPipesGroup.addLayer(L.circleMarker(coords[0], {
                radius: 4, fillColor: '#22c55e', color: '#fff', weight: 1.5, fillOpacity: 1
              }).bindPopup(`<strong>Titik Awal:</strong> ${escapeHtml(pipe.nama)}`));

              existingPipesGroup.addLayer(L.circleMarker(coords[coords.length - 1], {
                radius: 4, fillColor: '#ef4444', color: '#fff', weight: 1.5, fillOpacity: 1
              }).bindPopup(`<strong>Titik Akhir:</strong> ${escapeHtml(pipe.nama)}`));
            }
          });

          loadedPipeCount = validPipes.length;
          updateBadgeText();
          // CATATAN: TIDAK melakukan fitBounds agar posisi peta tetap terpusat di lokasi surveyor
        }
      })
      .catch(err => {
        console.warn("Gagal memuat layer pipa:", err);
      });
  }

  // Muat data GIS sekitar saat inisialisasi awal
  loadExistingGisLayers();

});