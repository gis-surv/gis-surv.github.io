document.addEventListener('DOMContentLoaded', function () {
  const initialLat = CONFIG.INITIAL_COORDS.lat;
  const initialLng = CONFIG.INITIAL_COORDS.lng;
  const defaultZoom = CONFIG.INITIAL_COORDS.defaultZoom;
  const gpsZoom = CONFIG.INITIAL_COORDS.gpsZoom;

  // 1. Layer Google Hybrid (Foto Satelit Asli Google + Nama Jalan / Label)
  const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  });

  // 2. Layer Google Peta Jalan Standar
  const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  });

  // 3. Layer Google Kontur & Topografi Medan (Terrain)
  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
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

  // Pengalih mode peta di kanan atas (Satelit, Jalan, & Kontur Topografi)
  const baseMaps = {
    "Google Satelit": googleHybrid,
    "Google Jalan": googleRoadmap,
    "Google Kontur / Medan": googleTerrain
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

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
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        statusMsg.className = "status-msg status-error";
        statusMsg.innerText = "Gagal mengirim: " + err.message;
        statusMsg.style.display = "block";
      }
    });
  });
});
