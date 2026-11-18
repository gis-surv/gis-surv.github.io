/**
 * ADMIN JAVASCRIPT — PERUMDAM AMERTA TORAYA
 * Manajemen Data Pelanggan & Jalur Pipa Distribusi
 */

// ─── STATE GLOBAL ──────────────────────────────────────────
const SESSION_KEY = 'admin_auth_v1';
const TORAJA_LAT  = -2.97190;
const TORAJA_LNG  = 119.89596;

let allRows      = [];
let filteredRows = [];

// Edit Pelanggan Map State
let editMap         = null;
let editLayerSat    = null;
let editLayerRoad   = null;
let editLayerTopo   = null;
let editMapMode     = 'point';
let editMarker      = null;
let editPolyLayer   = null;
let editPreviewLine = null;
let editPolyDots    = [];
let editPolyPoints  = [];
let editNeighborsLayer = null;
let editPipesLayer     = null;
let editFacLayer       = null;
let editNeighborsVisible = true;
let currentEditingRow  = null;

// Pipe Map State
let pipeMap             = null;
let pipeLayerSat        = null;
let pipeLayerRoad       = null;
let pipeLayerTopo       = null;
let pipeDrawingActive   = false;
let pipeCurrentPoints   = [];
let pipeCurrentPolyline = null;
let pipeNodeMarkers     = [];
let allPipes            = [];
let pipeLayers          = {}; // id/rowIndex -> L.polyline
let pipeLayerVisible    = {};
let pipeMapInitialCenterSet = false;

const PIPE_PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#ea580c'];
let pipeColorIdx = 0;

// Facility / Bangunan Pengolahan Map State
let facilityMap             = null;
let facilityLayerSat        = null;
let facilityLayerRoad       = null;
let facilityLayerTopo       = null;
let facilityDrawingActive   = false;
let facilityCurrentPoints   = [];
let facilityPreviewLine     = null;
let facilityCurrentPolygon  = null;
let facilityNodeMarkers     = [];
let allFacilities           = [];
let facilityLayers          = {}; // id/rowIndex -> L.polygon
let facilityCustLayer       = null;
let facilityPipeLayer       = null;
let facilityFacLayer        = null;
let facilitySearchedMarker  = null;
let facilityMapInitialCenterSet = false;

// ─── INISIALISASI ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const authSession = (typeof getAuthSession === 'function') ? getAuthSession() : null;
  const saved = (authSession && authSession.role === 'admin' && (authSession.username || 'admin')) || sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    showPanel(saved);
  }
});

// ─── AUTHENTICATION ────────────────────────────────────────
async function doLogin(ev) {
  ev.preventDefault();
  const username = document.getElementById('inputUser').value.trim();
  const password = document.getElementById('inputPass').value.trim();
  const btnEl    = document.getElementById('btnLogin');
  const errEl    = document.getElementById('loginError');

  btnEl.disabled    = true;
  btnEl.textContent = '🔄 Memverifikasi...';
  errEl.style.display = 'none';

  try {
    const body = new URLSearchParams({ action: 'login', username, password });
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();

    if (json.status === 'success') {
      sessionStorage.setItem(SESSION_KEY, username);
      showPanel(username);
    } else {
      errEl.textContent   = '❌ ' + (json.message || 'Login gagal');
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent   = '❌ Gagal terhubung ke Google Apps Script.';
    errEl.style.display = 'block';
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = 'Masuk ke Panel Admin';
  }
}

function doLogout() {
  if (!confirm('Yakin ingin keluar dari panel admin?')) return;
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('adminPanel').style.display  = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('inputUser').value = '';
  document.getElementById('inputPass').value = '';
}

function showPanel(username) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display  = 'block';
  document.getElementById('loggedUser').textContent    = (username && username.toLowerCase() === 'admin') ? 'Administrator' : username;
  loadAdminData();
}

// ─── TAB SWITCHING ─────────────────────────────────────────
function switchTab(tab) {
  const isCust  = tab === 'customers';
  const isPipes = tab === 'pipes';
  const isFac   = tab === 'facilities';

  document.getElementById('tabBtnCustomers').classList.toggle('active', isCust);
  document.getElementById('tabBtnPipes').classList.toggle('active', isPipes);
  const btnFac = document.getElementById('tabBtnFacilities');
  if (btnFac) btnFac.classList.toggle('active', isFac);

  document.getElementById('sectionCustomers').style.display  = isCust ? 'block' : 'none';
  document.getElementById('sectionPipes').style.display      = isPipes ? 'block' : 'none';
  const secFac = document.getElementById('sectionFacilities');
  if (secFac) secFac.style.display                          = isFac ? 'block' : 'none';

  if (isPipes) {
    if (!pipeMap) {
      setTimeout(() => {
        initPipeMap();
        loadPipes();
      }, 100);
    } else {
      setTimeout(() => pipeMap.invalidateSize(), 150);
    }
  } else if (isFac) {
    if (!facilityMap) {
      setTimeout(async () => {
        initFacilityMap();
        if (allRows.length === 0) await loadAdminData();
        if (allPipes.length === 0) await loadPipes();
        await loadFacilities();
        renderFacilityReferenceLayers();
        zoomFitAllFacilityMap(true);
      }, 100);
    } else {
      setTimeout(() => {
        facilityMap.invalidateSize();
        renderFacilityReferenceLayers();
      }, 150);
    }
  }
}

// ─── TAB 1: PELANGGAN DATA & CRUD ──────────────────────────
async function loadAdminData() {
  document.getElementById('tableLoading').style.display   = 'block';
  document.getElementById('tableContainer').style.display = 'none';

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL);
    const json = await res.json();
    if (json.status === 'success') {
      allRows = Array.isArray(json.data) ? json.data : [];
      populatePetugasDatalist();
      filterTable();
      updateCustomerStats();
    } else {
      showToast('Gagal memuat data: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('Koneksi gagal saat memuat data pelanggan.', 'error');
  } finally {
    document.getElementById('tableLoading').style.display   = 'none';
    document.getElementById('tableContainer').style.display = 'block';
  }
}

function updateCustomerStats() {
  const withPoly = allRows.filter(r => r.polygon && r.polygon.trim() !== '').length;
  document.getElementById('statTotal').textContent    = allRows.length;
  document.getElementById('statPolygon').textContent = withPoly;
  document.getElementById('statPoint').textContent   = allRows.length - withPoly;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  filteredRows = q
    ? allRows.filter(r =>
        String(r.nama || '').toLowerCase().includes(q) ||
        String(r.sumber || r.petugas || r.sumber_data || '').toLowerCase().includes(q) ||
        String(r.nik || '').toLowerCase().includes(q) ||
        String(r.alamat || '').toLowerCase().includes(q) ||
        String(r.whatsapp || '').toLowerCase().includes(q) ||
        String(r.klasifikasi || '').toLowerCase().includes(q) ||
        String(r.peruntukan || '').toLowerCase().includes(q)
      )
    : [...allRows];
  document.getElementById('statFiltered').textContent = filteredRows.length;
  renderCustomerTable(filteredRows);
}

// Simpan referensi data baris pelanggan ke memori JS agar kebal terhadap karakter tanda petik/kutip
window.customerDataMap = window.customerDataMap || {};

function renderCustomerTable(rows) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  tbody.innerHTML = '';

  if (rows.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  window.customerDataMap = {};

  rows.forEach(row => {
    window.customerDataMap[row.rowIndex] = row;

    const hasPoly   = row.polygon && row.polygon.trim() !== '';
    const modeBadge = hasPoly
      ? '<span class="badge badge-polygon">🏠 Arsiran</span>'
      : '<span class="badge badge-point">📍 Titik</span>';

    const rawLat = parseFloat(String(row.latitude || '').replace(',', '.'));
    const rawLng = parseFloat(String(row.longitude || '').replace(',', '.'));
    const coordText = (!isNaN(rawLat) && !isNaN(rawLng))
      ? `<span style="font-family:monospace;font-size:10.5px;color:#64748b">${rawLat.toFixed(5)}, ${rawLng.toFixed(5)}</span>`
      : '<span style="color:#cbd5e1">—</span>';

    const petugasName = (row.sumber || row.petugas || row.sumber_data || '').trim();

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${row.no}</td>
      <td class="td-nama" style="max-width:180px;">
        <div style="font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(row.nama)}">
          ${escHtml(row.nama)||'—'}
        </div>
        <div class="petugas-badge-pill" title="Petugas Surveyor / Sumber Data: ${escHtml(petugasName || 'Belum diisi')}">
          <span class="petugas-icon">📋</span>
          <span class="petugas-name">${escHtml(petugasName || 'Tanpa Petugas')}</span>
        </div>
      </td>
      <td class="td-truncate" style="font-family:monospace;font-size:11px">${escHtml(row.nik)||'—'}</td>
      <td class="td-truncate">${escHtml(row.whatsapp)||'—'}</td>
      <td class="td-truncate" title="${escHtml(row.alamat)}">${escHtml(row.alamat)||'—'}</td>
      <td>${escHtml(row.peruntukan)?`<span class="badge badge-blue">${escHtml(row.peruntukan)}</span>`:'—'}</td>
      <td>${escHtml(row.klasifikasi)?`<span class="badge badge-green">${escHtml(row.klasifikasi)}</span>`:'—'}</td>
      <td>${modeBadge}</td>
      <td>${coordText}</td>
      <td>
        <div class="action-btns">
          <button type="button" class="btn-edit" onclick="openEditModalByRowIndex(${row.rowIndex})">✏️ Edit</button>
          <button type="button" class="btn-delete" onclick="confirmDeleteCustomerByRowIndex(${row.rowIndex})">🗑️ Hapus</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openEditModalByRowIndex(rowIndex) {
  const row = (window.customerDataMap && window.customerDataMap[rowIndex]) || allRows.find(r => r.rowIndex === rowIndex);
  if (!row) {
    showToast('Data pelanggan tidak ditemukan', 'error');
    return;
  }
  openEditModal(row);
}

function confirmDeleteCustomerByRowIndex(rowIndex) {
  const row = (window.customerDataMap && window.customerDataMap[rowIndex]) || allRows.find(r => r.rowIndex === rowIndex);
  if (!row) return;
  confirmDeleteCustomer(row.rowIndex, row.no, row.nama || '');
}

// ─── MODAL EDIT PELANGGAN DENGAN PETA ──────────────────────
function openEditModal(row) {
  if (!row) {
    showToast('Data pelanggan tidak valid', 'error');
    return;
  }
  try {
    document.getElementById('editRowIndex').value    = row.rowIndex || '';
    document.getElementById('modalTitle').textContent= `#${row.no} — ${row.nama || 'Pelanggan'}`;
    document.getElementById('editNama').value         = row.nama        || '';
    document.getElementById('editNik').value          = row.nik         || '';
    document.getElementById('editWa').value           = row.whatsapp    || '';
    document.getElementById('editAlamat').value       = row.alamat      || '';
    const editSumberEl = document.getElementById('editSumber');
    if (editSumberEl) editSumberEl.value               = row.sumber || row.petugas || row.sumber_data || '';
    document.getElementById('editLat').value          = row.latitude    || '';
    document.getElementById('editLng').value          = row.longitude   || '';
    document.getElementById('editPolygon').value      = row.polygon     || '';
    setSelectValue(document.getElementById('editPeruntukan'),  row.peruntukan);
    setSelectValue(document.getElementById('editKlasifikasi'), row.klasifikasi);

    document.getElementById('editModal').classList.add('open');

    setTimeout(() => {
      try {
        if (!editMap) {
          initEditMap();
        } else {
          editMap.invalidateSize();
        }
        resetEditMapState();
        currentEditingRow = row;
        renderEditMapReferences(row);
        loadCustomerOnEditMap(row);

        // Muat pipa & fasilitas jika belum ada di memori
        if (allPipes.length === 0) {
          loadPipes().then(() => { if (editMap && currentEditingRow) renderEditMapReferences(currentEditingRow); });
        }
        if (allFacilities.length === 0) {
          loadFacilities().then(() => { if (editMap && currentEditingRow) renderEditMapReferences(currentEditingRow); });
        }
      } catch (errMap) {
        console.warn('Gagal render peta edit modal:', errMap);
      }
    }, 180);
  } catch (err) {
    console.error('Gagal membuka modal edit:', err);
    showToast('Gagal membuka modal edit: ' + err.message, 'error');
  }
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
}

function closeEditModalOutside(ev) {
  if (ev.target === document.getElementById('editModal')) closeEditModal();
}

function ensureAdminHatchPattern() {
  try {
    const svg = document.querySelector('#editMap svg');
    if (!svg) return;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    if (!svg.querySelector('#diagonalHatchAdmin')) {
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', 'diagonalHatchAdmin');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '8');
      pattern.setAttribute('height', '8');
      pattern.setAttribute('patternTransform', 'rotate(45)');
      pattern.innerHTML = '<rect width="8" height="8" fill="rgba(239, 68, 68, 0.45)" /><line x1="0" y1="0" x2="0" y2="8" stroke="#dc2626" stroke-width="2" />';
      defs.appendChild(pattern);
    }
  } catch (e) {}
}

function initEditMap() {
  editLayerSat  = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  editLayerRoad = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  editLayerTopo = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google (Terrain)'
  });

  editMap = L.map('editMap', {
    center: [TORAJA_LAT, TORAJA_LNG],
    zoom: 17,
    layers: [editLayerSat],
    zoomControl: true
  });

  // Layer referensi penandaan & arsiran atap tetangga yang sudah ada
  editNeighborsLayer = L.featureGroup().addTo(editMap);
  editPipesLayer     = L.featureGroup().addTo(editMap);
  editFacLayer       = L.featureGroup().addTo(editMap);

  editMap.on('click', onEditMapClick);
  setTimeout(() => editMap.invalidateSize(), 100);
}

function switchEditLayer(mode) {
  if (!editMap) return;
  [editLayerSat, editLayerRoad, editLayerTopo].forEach(l => { try { editMap.removeLayer(l); } catch(e){} });
  document.getElementById('layerBtnSat').classList.toggle('active',  mode === 'satellite');
  document.getElementById('layerBtnRoad').classList.toggle('active', mode === 'roadmap');
  document.getElementById('layerBtnTopo').classList.toggle('active', mode === 'terrain');
  if (mode === 'satellite') editLayerSat.addTo(editMap);
  else if (mode === 'roadmap') editLayerRoad.addTo(editMap);
  else editLayerTopo.addTo(editMap);
}

let editVertexMarkers = [];

function clearEditVertexMarkers() {
  editVertexMarkers.forEach(m => { try { editMap.removeLayer(m); } catch(e){} });
  editVertexMarkers = [];
}

// Render Titik Sudut Interaktif (Draggable Handles) untuk Setiap Sudut Poligon Atap
function renderEditPolygonVertices() {
  clearEditVertexMarkers();
  if (!editMap || !editPolyPoints || editPolyPoints.length < 3) return;

  editPolyPoints.forEach((pt, idx) => {
    const handleIcon = L.divIcon({
      className: 'leaflet-div-icon',
      html: `<div style="width:18px;height:18px;background:#ffffff;border:2.5px solid #2563eb;border-radius:50%;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;color:#2563eb;" title="Tarik sudut #${idx + 1} untuk menyesuaikan bentuk atap">${idx + 1}</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const vMarker = L.marker([pt[0], pt[1]], {
      icon: handleIcon,
      draggable: true,
      zIndexOffset: 3000
    }).addTo(editMap);

    vMarker.on('drag', function(ev) {
      const pos = ev.target.getLatLng();
      editPolyPoints[idx] = [pos.lat, pos.lng];
      if (editPolyLayer) {
        editPolyLayer.setLatLngs(editPolyPoints);
      }
      onPolygonVerticesUpdated();
    });

    vMarker.on('dragend', function() {
      onPolygonVerticesUpdated();
      setEditStatus(`🏠 Sudut #${idx + 1} disesuaikan: ${editPolyPoints[idx][0].toFixed(6)}, ${editPolyPoints[idx][1].toFixed(6)}`);
    });

    editVertexMarkers.push(vMarker);
  });
}

function onPolygonVerticesUpdated() {
  const polyStr = editPolyPoints.map(p => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';');
  document.getElementById('editPolygon').value = polyStr;

  let sumLat = 0, sumLng = 0;
  editPolyPoints.forEach(p => { sumLat += p[0]; sumLng += p[1]; });
  const cLat = sumLat / editPolyPoints.length;
  const cLng = sumLng / editPolyPoints.length;

  if (editMarker) {
    editMarker.setLatLng([cLat, cLng]);
  }
  updateCoordInputs(cLat, cLng);
}

function setEditMapMode(mode) {
  editMapMode = mode;
  const btnPoint   = document.getElementById('btnModePoint');
  const btnPoly    = document.getElementById('btnModePolygon');
  const btnFin     = document.getElementById('btnFinishPoly');
  const btnRestart = document.getElementById('btnRestartPoly');
  const dot        = document.getElementById('statusDot');
  const txt        = document.getElementById('statusText');

  btnPoint.className = 'map-mode-btn' + (mode === 'point'   ? ' active-point'   : '');
  btnPoly.className  = 'map-mode-btn' + (mode === 'polygon' ? ' active-polygon' : '');

  if (mode === 'polygon') {
    dot.className = 'status-dot dot-polygon';
    if (editPolyPoints.length >= 3) {
      // Poligon sudah ada: aktifkan titik sudut interaktif agar bisa digeser
      renderEditPolygonVertices();
      btnFin.classList.remove('visible');
      if (btnRestart) btnRestart.style.display = 'inline-flex';
      txt.textContent = '🏠 Seret sudut (1, 2, 3...) untuk menyesuaikan bentuk atap, atau klik peta untuk menambah sudut';
    } else {
      // Belum ada poligon: aktifkan mode penandaan sudut baru
      btnFin.classList.add('visible');
      if (btnRestart) btnRestart.style.display = 'none';
      txt.textContent = 'Klik sudut-sudut atap bangunan (min. 3 titik) lalu tekan ✅ Selesai Arsiran';
    }
  } else {
    // Mode Titik Rumah
    btnFin.classList.remove('visible');
    if (btnRestart) btnRestart.style.display = 'none';
    dot.className = 'status-dot dot-point';
    txt.textContent = '📍 Seret pin untuk memindahkan titik lokasi, atau klik langsung pada posisi baru';
  }
}

function onEditMapClick(ev) {
  const { lat, lng } = ev.latlng;

  if (editMapMode === 'point') {
    // Geser atau buat titik lokasi tanpa menghapus arsiran atap
    if (editMarker) {
      editMarker.setLatLng([lat, lng]);
    } else {
      const icon = L.divIcon({
        className: 'leaflet-div-icon',
        html: '<div class="edit-pin" style="cursor:grab;">📍</div>',
        iconSize: [22,22], iconAnchor: [11,11]
      });
      editMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(editMap);

      editMarker.on('dragend', e => {
        const pos = e.target.getLatLng();
        updateCoordInputs(pos.lat, pos.lng);
        setEditStatus(`📍 Titik: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
      });
    }

    updateCoordInputs(lat, lng);
    setEditStatus(`📍 Titik ditetapkan: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

  } else {
    // Mode Poligon / Arsiran Atap
    if (editPolyLayer && editPolyPoints.length >= 3) {
      // Tambah sudut baru ke poligon yang sudah ada
      editPolyPoints.push([lat, lng]);
      editPolyLayer.setLatLngs(editPolyPoints);
      renderEditPolygonVertices();
      onPolygonVerticesUpdated();
      setEditStatus(`🏠 Sudut #${editPolyPoints.length} ditambahkan`);
    } else {
      // Sedang menandai poligon baru
      editPolyPoints.push([lat, lng]);

      const dotIcon = L.divIcon({
        className: 'leaflet-div-icon',
        html: '<div class="poly-dot"></div>',
        iconSize: [10,10], iconAnchor: [5,5]
      });
      const dot = L.marker([lat, lng], { icon: dotIcon }).addTo(editMap);
      editPolyDots.push(dot);

      if (editPreviewLine) { editMap.removeLayer(editPreviewLine); editPreviewLine = null; }
      if (editPolyPoints.length >= 2) {
        editPreviewLine = L.polyline(editPolyPoints, {
          color: '#7c3aed', weight: 2, dashArray: '6 4'
        }).addTo(editMap);
      }

      const btnFin = document.getElementById('btnFinishPoly');
      if (btnFin) btnFin.classList.add('visible');
      setEditStatus(`✏️ ${editPolyPoints.length} sudut ditandai — tekan ✅ Selesai Arsiran`);
    }
  }
}

function finishEditPolygon() {
  if (editPolyPoints.length < 3) {
    showToast('Minimal 3 sudut diperlukan untuk membentuk poligon', 'error');
    return;
  }

  if (editPreviewLine) { editMap.removeLayer(editPreviewLine); editPreviewLine = null; }
  editPolyDots.forEach(d => { try { editMap.removeLayer(d); } catch(e){} });
  editPolyDots = [];

  if (editPolyLayer) { editMap.removeLayer(editPolyLayer); editPolyLayer = null; }
  editPolyLayer = L.polygon(editPolyPoints, {
    color: '#2563eb', weight: 3,
    fillColor: '#3b82f6', fillOpacity: 0.45
  }).addTo(editMap);

  let sumLat = 0, sumLng = 0;
  editPolyPoints.forEach(p => { sumLat += p[0]; sumLng += p[1]; });
  const cLat = sumLat / editPolyPoints.length;
  const cLng = sumLng / editPolyPoints.length;

  if (editMarker) { editMap.removeLayer(editMarker); editMarker = null; }
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: '<div class="edit-pin" style="font-size:9px;cursor:grab;">CTR</div>',
    iconSize: [30,22], iconAnchor: [15,11]
  });
  editMarker = L.marker([cLat, cLng], { icon, draggable: true }).addTo(editMap);

  editMarker.on('dragend', e => {
    const pos = e.target.getLatLng();
    updateCoordInputs(pos.lat, pos.lng);
    setEditStatus(`📍 Titik pusat: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
  });

  renderEditPolygonVertices();
  onPolygonVerticesUpdated();

  editMap.fitBounds(editPolyLayer.getBounds(), { padding: [20,20] });
  setEditStatus(`🏠 Poligon selesai: ${editPolyPoints.length} sudut · seret sudut (1, 2...) untuk menyesuaikan`);

  const btnFin = document.getElementById('btnFinishPoly');
  const btnRestart = document.getElementById('btnRestartPoly');
  if (btnFin) btnFin.classList.remove('visible');
  if (btnRestart) btnRestart.style.display = 'inline-flex';
}

function restartEditPolygon() {
  if (editPolyPoints.length >= 3 && !confirm('Hapus arsiran atap saat ini dan gambar ulang dari awal?')) return;
  clearPolygonLayers();
  editPolyPoints = [];
  document.getElementById('editPolygon').value = '';

  const btnFin = document.getElementById('btnFinishPoly');
  const btnRestart = document.getElementById('btnRestartPoly');
  if (btnFin) btnFin.classList.add('visible');
  if (btnRestart) btnRestart.style.display = 'none';

  setEditStatus('Klik sudut-sudut atap bangunan di peta (min. 3 titik) lalu tekan ✅ Selesai Arsiran');
}

function clearEditMapAll() {
  const hasPoint = !!editMarker;
  const hasPoly  = editPolyPoints.length > 0;
  if (!hasPoint && !hasPoly) return;

  if (!confirm('Hapus semua penandaan (titik dan arsiran atap) pada data pelanggan ini?')) return;

  if (editMarker)      { editMap.removeLayer(editMarker);      editMarker      = null; }
  clearPolygonLayers();
  editPolyPoints = [];
  document.getElementById('editLat').value     = '';
  document.getElementById('editLng').value     = '';
  document.getElementById('editPolygon').value = '';
  setEditStatus('Semua penandaan dihapus — klik peta untuk mulai menandai');
}

function clearPolygonLayers() {
  if (editPolyLayer)   { editMap.removeLayer(editPolyLayer);   editPolyLayer   = null; }
  if (editPreviewLine) { editMap.removeLayer(editPreviewLine); editPreviewLine = null; }
  editPolyDots.forEach(d => { try { editMap.removeLayer(d); } catch(e){} });
  editPolyDots = [];
  clearEditVertexMarkers();
}

function resetEditMapState() {
  if (editMarker)      { editMap.removeLayer(editMarker);      editMarker      = null; }
  clearPolygonLayers();
  editPolyPoints = [];
  editMapMode    = 'point';

  const btnPoint   = document.getElementById('btnModePoint');
  const btnPoly    = document.getElementById('btnModePolygon');
  const btnFin     = document.getElementById('btnFinishPoly');
  const btnRestart = document.getElementById('btnRestartPoly');

  if (btnPoint) btnPoint.className = 'map-mode-btn active-point';
  if (btnPoly)  btnPoly.className  = 'map-mode-btn';
  if (btnFin)   btnFin.classList.remove('visible');
  if (btnRestart) btnRestart.style.display = 'none';
  setEditStatus('Klik peta untuk memindahkan titik koordinat', 'point');
}

// ─── TAMPILKAN PENANDAAN & ARSIRAN LAIN YANG SUDAH ADA DI PETA EDIT ───
function renderEditMapReferences(currentRow) {
  if (!editMap) return;
  ensureAdminHatchPattern();

  if (!editNeighborsLayer) editNeighborsLayer = L.featureGroup().addTo(editMap);
  if (!editPipesLayer)     editPipesLayer     = L.featureGroup().addTo(editMap);
  if (!editFacLayer)       editFacLayer       = L.featureGroup().addTo(editMap);

  editNeighborsLayer.clearLayers();
  editPipesLayer.clearLayers();
  editFacLayer.clearLayers();

  // 1. Tampilkan Pelanggan Lain (Titik Penanda & Poligon Arsiran Atap Tetangga)
  if (Array.isArray(allRows) && allRows.length > 0) {
    allRows.forEach(r => {
      // Lewati pelanggan yang sedang diedit (karena ditangani oleh editPolyLayer & editMarker)
      if (currentRow && String(r.rowIndex) === String(currentRow.rowIndex)) return;

      let rawLat = (r.latitude !== undefined && r.latitude !== '') ? r.latitude : r.lat;
      let rawLng = (r.longitude !== undefined && r.longitude !== '') ? r.longitude : r.lng;
      let rLat = parseFloat(String(rawLat || '').replace(/^['"=]+/, '').trim().replace(',', '.'));
      let rLng = parseFloat(String(rawLng || '').replace(/^['"=]+/, '').trim().replace(',', '.'));
      if (rLat > 0 && rLat <= 10) rLat = -rLat; // Koreksi latitude Toraja
      if (Math.abs(rLat) > 1000) rLat /= 1000000;
      if (Math.abs(rLng) > 1000) rLng /= 1000000;

      const polyRaw = r.polygon || r.poligon || r.polygon_coords || '';
      const polyCoords = parsePolyStr(polyRaw);

      const neighborTooltip = `<strong>#${r.no}. ${escHtml(r.nama || 'Pelanggan')}</strong><br>${escHtml(r.alamat || '-')}<br><span style="color:#059669;font-size:10px;">📋 ${escHtml(r.klasifikasi || 'Rumah Tangga')}</span>`;

      // A. Arsiran Atap Rumah Tetangga
      if (polyCoords.length >= 3) {
        const neighborRoof = L.polygon(polyCoords, {
          className: 'roof-hatched-polygon',
          color: '#ef4444',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 0.38,
          dashArray: '4, 4'
        });

        neighborRoof.bindTooltip(neighborTooltip, { direction: 'top', sticky: true });

        // Teruskan event klik ke peta agar tidak menghalangi saat admin menandai sudut atap baru
        neighborRoof.on('click', function(ev) {
          onEditMapClick(ev);
        });

        editNeighborsLayer.addLayer(neighborRoof);

        // Jika lat/lng kosong, hitung pusat atap
        if (isNaN(rLat) || isNaN(rLng)) {
          let sLat = 0, sLng = 0;
          polyCoords.forEach(p => { sLat += p[0]; sLng += p[1]; });
          rLat = sLat / polyCoords.length;
          rLng = sLng / polyCoords.length;
        }
      }

      // B. Penanda Nomor Urut Pelanggan Tetangga
      if (!isNaN(rLat) && !isNaN(rLng)) {
        const neighborHasRoof = (polyCoords.length >= 3);
        const neighborIcon = L.divIcon({
          className: 'custom-pin-wrapper ' + (neighborHasRoof ? 'pin-has-roof' : 'pin-no-roof'),
          html: `<div class="marker-number-pin ${neighborHasRoof ? 'has-roof-pin' : 'no-roof-pin'}" style="width:22px;height:22px;font-size:10.5px;background:#ef4444 !important;color:#fff !important;border:2px solid #fff !important;border-radius:50% !important;display:flex;align-items:center;justify-content:center;font-weight:800;box-shadow:0 2px 5px rgba(0,0,0,0.45);cursor:pointer;" title="#${r.no}. ${escHtml(r.nama)}">${r.no}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        const neighborMarker = L.marker([rLat, rLng], {
          icon: neighborIcon,
          zIndexOffset: 200
        });

        neighborMarker.bindTooltip(neighborTooltip, { direction: 'top', offset: [0, -11] });

        // Teruskan event klik ke peta saat mode gambar aktif
        neighborMarker.on('click', function(ev) {
          onEditMapClick(ev);
        });

        editNeighborsLayer.addLayer(neighborMarker);
      }
    });
  }

  // 2. Tampilkan Jalur Pipa Distribusi Sekitar sebagai Referensi
  if (Array.isArray(allPipes) && allPipes.length > 0) {
    allPipes.forEach(pipe => {
      const coords = parsePolyStr(pipe.koordinat);
      if (coords.length >= 2) {
        const color = pipe.warna || '#2563eb';
        const pipeLine = L.polyline(coords, {
          color: color,
          weight: 3.5,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round'
        });
        pipeLine.bindTooltip(`🔧 <strong>${escHtml(pipe.nama)}</strong> (${formatPipeLength(pipe.panjang)})`, { sticky: true });
        pipeLine.on('click', function(ev) { onEditMapClick(ev); });
        editPipesLayer.addLayer(pipeLine);
      }
    });
  }

  // 3. Tampilkan Fasilitas Pengolahan IPA Sekitar sebagai Referensi
  if (Array.isArray(allFacilities) && allFacilities.length > 0) {
    allFacilities.forEach(fac => {
      const coords = parsePolyStr(fac.koordinat);
      if (coords.length >= 3) {
        const color = fac.warna || '#16a34a';
        const facPoly = L.polygon(coords, {
          color: color,
          weight: 2.5,
          fillColor: color,
          fillOpacity: 0.25,
          dashArray: '4, 4'
        });
        facPoly.bindTooltip(`🏭 <strong>${escHtml(fac.nama)}</strong>`, { sticky: true });
        facPoly.on('click', function(ev) { onEditMapClick(ev); });
        editFacLayer.addLayer(facPoly);
      }
    });
  }
}

function toggleEditNeighbors() {
  if (!editMap || !editNeighborsLayer) return;
  editNeighborsVisible = !editNeighborsVisible;
  const btn = document.getElementById('btnToggleNeighbors');
  if (editNeighborsVisible) {
    if (!editMap.hasLayer(editNeighborsLayer)) editMap.addLayer(editNeighborsLayer);
    if (editPipesLayer && !editMap.hasLayer(editPipesLayer)) editMap.addLayer(editPipesLayer);
    if (editFacLayer && !editMap.hasLayer(editFacLayer)) editMap.addLayer(editFacLayer);
    if (btn) btn.classList.add('active');
  } else {
    if (editMap.hasLayer(editNeighborsLayer)) editMap.removeLayer(editNeighborsLayer);
    if (editPipesLayer && editMap.hasLayer(editPipesLayer)) editMap.removeLayer(editPipesLayer);
    if (editFacLayer && editMap.hasLayer(editFacLayer)) editMap.removeLayer(editFacLayer);
    if (btn) btn.classList.remove('active');
  }
}

function loadCustomerOnEditMap(row) {
  const hasPoly = row.polygon && String(row.polygon).trim() !== '';
  let rawLat = (row.latitude !== undefined && row.latitude !== '') ? row.latitude : row.lat;
  let rawLng = (row.longitude !== undefined && row.longitude !== '') ? row.longitude : row.lng;
  let lat = parseFloat(String(rawLat || '').replace(/^['"=]+/, '').trim().replace(',', '.'));
  let lng = parseFloat(String(rawLng || '').replace(/^['"=]+/, '').trim().replace(',', '.'));
  if (lat > 0 && lat <= 10) lat = -lat; // Koreksi latitude Toraja Utara
  if (Math.abs(lat) > 1000) lat /= 1000000;
  if (Math.abs(lng) > 1000) lng /= 1000000;

  if (hasPoly) {
    const coords = parsePolyStr(row.polygon);
    if (coords.length >= 3) {
      editPolyPoints = coords;
      editPolyLayer  = L.polygon(coords, {
        color: '#2563eb', weight: 3,
        fillColor: '#3b82f6', fillOpacity: 0.45
      }).addTo(editMap);

      // Buat titik sudut interaktif yang bisa digeser (draggable)
      renderEditPolygonVertices();

      const pinLat = (!isNaN(lat) && !isNaN(lng)) ? lat : coords[0][0];
      const pinLng = (!isNaN(lat) && !isNaN(lng)) ? lng : coords[0][1];

      const icon = L.divIcon({
        className: 'leaflet-div-icon',
        html: '<div class="edit-pin" style="font-size:9px;cursor:grab;">CTR</div>',
        iconSize: [30,22], iconAnchor: [15,11]
      });
      editMarker = L.marker([pinLat, pinLng], { icon, draggable: true }).addTo(editMap);

      editMarker.on('dragend', e => {
        const pos = e.target.getLatLng();
        updateCoordInputs(pos.lat, pos.lng);
        setEditStatus(`📍 Titik pusat dipindahkan: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
      });

      try {
        const bounds = editPolyLayer.getBounds();
        if (bounds && bounds.isValid()) {
          editMap.fitBounds(bounds, { padding: [30,30] });
        } else {
          editMap.setView([pinLat, pinLng], 18);
        }
      } catch (errBounds) {
        editMap.setView([pinLat, pinLng], 18);
      }

      const btnRestart = document.getElementById('btnRestartPoly');
      if (btnRestart) btnRestart.style.display = 'inline-flex';

      setEditStatus(`🏠 Poligon atap: ${coords.length} sudut · seret sudut (1, 2...) atau titik untuk menyesuaikan`, 'polygon');
      return;
    }
  }

  if (!isNaN(lat) && !isNaN(lng)) {
    const icon = L.divIcon({
      className: 'leaflet-div-icon',
      html: '<div class="edit-pin">📍</div>',
      iconSize: [22,22], iconAnchor: [11,11]
    });
    editMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(editMap);
    editMarker.on('dragend', e => {
      const pos = e.target.getLatLng();
      updateCoordInputs(pos.lat, pos.lng);
      setEditStatus(`📍 Titik: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
    });
    editMap.setView([lat, lng], 18);
    setEditStatus(`📍 Titik lokasi: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  } else {
    editMap.setView([TORAJA_LAT, TORAJA_LNG], 15);
    setEditStatus('Belum ada koordinat — klik peta untuk menandai lokasi');
  }
}

async function saveCustomerEdit() {
  const rowIndex = document.getElementById('editRowIndex').value;
  if (!rowIndex) return;

  const btnSave = document.getElementById('btnSave');
  btnSave.disabled    = true;
  btnSave.textContent = '⏳ Menyimpan...';

  const newNama        = document.getElementById('editNama').value.trim();
  const newNik         = document.getElementById('editNik').value.trim();
  const newWa          = document.getElementById('editWa').value.trim();
  const newAlamat      = document.getElementById('editAlamat').value.trim();
  const editSumberEl   = document.getElementById('editSumber');
  const foundRow       = allRows.find(r => String(r.rowIndex) === String(rowIndex));
  // Kunci nama petugas: gunakan petugas asli dari data, jangan diubah
  const originalPetugas= (foundRow ? (foundRow.sumber || foundRow.petugas || foundRow.sumber_data) : '') || (editSumberEl ? editSumberEl.value.trim() : '') || 'Surveyor';
  const newSumber      = originalPetugas;
  const newPeruntukan  = document.getElementById('editPeruntukan').value;
  const newKlasifikasi = document.getElementById('editKlasifikasi').value;
  const newLat         = document.getElementById('editLat').value.trim();
  const newLng         = document.getElementById('editLng').value.trim();
  const newPoly        = document.getElementById('editPolygon').value.trim();

  const body = new URLSearchParams({
    action:                'update',
    role:                  'admin',
    petugas_nama:          'Admin',
    rowIndex,
    nama:                  newNama,
    nik:                   newNik,
    whatsapp:              newWa,
    alamat:                newAlamat,
    sumber_data:           newSumber,
    sumber:                newSumber,
    petugas:               newSumber,
    peruntukan_bangunan:   newPeruntukan,
    klasifikasi_pelanggan: newKlasifikasi,
    latitude:              newLat,
    longitude:             newLng,
    polygon_coords:        newPoly
  });

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('✅ Data pelanggan & petugas survey berhasil diperbarui!', 'success');
      const found = allRows.find(r => r.rowIndex == rowIndex);
      if (found) {
        found.nama        = newNama;
        found.nik         = newNik;
        found.whatsapp    = newWa;
        found.alamat      = newAlamat;
        found.sumber      = newSumber;
        found.petugas     = newSumber;
        found.sumber_data = newSumber;
        found.peruntukan  = newPeruntukan;
        found.klasifikasi = newKlasifikasi;
        found.latitude    = newLat;
        found.longitude   = newLng;
        found.polygon     = newPoly;
      }
      closeEditModal();
      filterTable();
      populatePetugasDatalist();
    } else {
      showToast('❌ Gagal: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menyimpan pelanggan.', 'error');
  } finally {
    btnSave.disabled    = false;
    btnSave.textContent = '💾 Simpan Perubahan';
  }
}

// ─── MANAJEMEN & PENGGANTIAN NAMA PETUGAS SURVEY ───────────
function populatePetugasDatalist() {
  let datalist = document.getElementById('petugasDatalist');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'petugasDatalist';
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = '';

  const unique = getUniquePetugasList();
  unique.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
}

function getUniquePetugasList() {
  const set = new Set();
  allRows.forEach(r => {
    const p = String(r.sumber || r.petugas || r.sumber_data || '').trim();
    if (p) set.add(p);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
}

// Modal Cepat Ganti Petugas per Baris Data
function openQuickPetugasModal(rowIndex) {
  const row = (window.customerDataMap && window.customerDataMap[rowIndex]) || allRows.find(r => r.rowIndex === rowIndex);
  if (!row) {
    showToast('Data pelanggan tidak ditemukan', 'error');
    return;
  }
  document.getElementById('quickPetugasRowIndex').value = row.rowIndex;
  const currentPetugas = (row.sumber || row.petugas || row.sumber_data || '').trim();
  const infoEl = document.getElementById('quickPetugasCustomerInfo');
  if (infoEl) {
    infoEl.textContent = `#${row.no} — ${row.nama || 'Tanpa Nama'} (${row.alamat || 'Alamat —'})`;
  }

  const inputEl = document.getElementById('quickPetugasInput');
  if (inputEl) {
    inputEl.value = currentPetugas;
  }

  renderQuickPetugasSuggestions(currentPetugas);

  const modal = document.getElementById('quickPetugasModal');
  if (modal) {
    modal.classList.add('open');
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 120);
  }
}

function closeQuickPetugasModal() {
  const modal = document.getElementById('quickPetugasModal');
  if (modal) modal.classList.remove('open');
}

function closeQuickPetugasModalOutside(ev) {
  if (ev.target === document.getElementById('quickPetugasModal')) {
    closeQuickPetugasModal();
  }
}

function renderQuickPetugasSuggestions(currentPetugas) {
  const container = document.getElementById('quickPetugasSuggestions');
  if (!container) return;
  container.innerHTML = '';

  const unique = getUniquePetugasList();
  if (unique.length === 0) return;

  const label = document.createElement('span');
  label.style.color = '#64748b';
  label.style.fontWeight = '700';
  label.style.fontSize = '10.5px';
  label.style.textTransform = 'uppercase';
  label.style.letterSpacing = '0.3px';
  label.textContent = 'Petugas Terdaftar:';
  container.appendChild(label);

  unique.forEach(name => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'petugas-chip';
    chip.textContent = name;
    if (name.toLowerCase() === currentPetugas.toLowerCase()) {
      chip.style.borderColor = '#0284c7';
      chip.style.background = '#e0f2fe';
      chip.style.color = '#0284c7';
    }
    chip.onclick = () => {
      const inputEl = document.getElementById('quickPetugasInput');
      if (inputEl) {
        inputEl.value = name;
        inputEl.focus();
      }
    };
    container.appendChild(chip);
  });
}

async function saveQuickPetugas() {
  const rowIndex = document.getElementById('quickPetugasRowIndex').value;
  const row = (window.customerDataMap && window.customerDataMap[rowIndex]) || allRows.find(r => r.rowIndex == rowIndex);
  if (!row) {
    showToast('Data pelanggan tidak valid', 'error');
    return;
  }

  const newPetugas = document.getElementById('quickPetugasInput').value.trim();
  const currentPetugas = (row.sumber || row.petugas || row.sumber_data || '').trim();

  if (newPetugas === currentPetugas) {
    closeQuickPetugasModal();
    return;
  }

  const btnSave = document.getElementById('btnSaveQuickPetugas');
  btnSave.disabled = true;
  btnSave.textContent = '⏳ Menyimpan...';

  const body = new URLSearchParams({
    action:                'update',
    role:                  'admin',
    petugas_nama:          'Admin',
    rowIndex:              row.rowIndex,
    nama:                  row.nama || '',
    nik:                   row.nik || '',
    whatsapp:              row.whatsapp || '',
    alamat:                row.alamat || '',
    sumber_data:           newPetugas,
    sumber:                newPetugas,
    petugas:               newPetugas,
    peruntukan_bangunan:   row.peruntukan || '',
    klasifikasi_pelanggan: row.klasifikasi || '',
    latitude:              row.latitude || '',
    longitude:             row.longitude || '',
    polygon_coords:        row.polygon || ''
  });

  try {
    const res = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast(`✅ Nama petugas survey berhasil diubah menjadi "${newPetugas || 'Tanpa Petugas'}"!`, 'success');
      row.sumber = newPetugas;
      row.petugas = newPetugas;
      row.sumber_data = newPetugas;
      closeQuickPetugasModal();
      filterTable();
      populatePetugasDatalist();
    } else {
      showToast('❌ Gagal mengubah petugas: ' + (json.message || 'Error server'), 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat mengubah nama petugas.', 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = '💾 Simpan Perubahan';
  }
}

// Modal Ganti Petugas Survey Secara Massal
function openBulkPetugasModal() {
  const selectEl = document.getElementById('bulkPetugasOldSelect');
  selectEl.innerHTML = '<option value="">-- Pilih Petugas Survey Saat Ini --</option>';

  const counts = {};
  allRows.forEach(r => {
    const p = String(r.sumber || r.petugas || r.sumber_data || '').trim();
    const key = p || '__KOSONG__';
    counts[key] = (counts[key] || 0) + 1;
  });

  Object.keys(counts).sort((a, b) => a.localeCompare(b, 'id')).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === '__KOSONG__' 
      ? `(Tanpa Petugas / Belum Diisi) — ${counts[key]} data`
      : `${key} — ${counts[key]} data`;
    selectEl.appendChild(opt);
  });

  document.getElementById('bulkPetugasNewInput').value = '';
  document.getElementById('bulkPetugasMatchInfo').textContent = 'Pilih petugas di atas untuk melihat jumlah data yang terpengaruh.';
  document.getElementById('bulkPetugasModal').classList.add('open');
}

function closeBulkPetugasModal() {
  const modal = document.getElementById('bulkPetugasModal');
  if (modal) modal.classList.remove('open');
}

function closeBulkPetugasModalOutside(ev) {
  if (ev.target === document.getElementById('bulkPetugasModal')) {
    closeBulkPetugasModal();
  }
}

function updateBulkPetugasCount() {
  const selected = document.getElementById('bulkPetugasOldSelect').value;
  const infoEl = document.getElementById('bulkPetugasMatchInfo');
  if (!selected) {
    infoEl.textContent = 'Pilih petugas di atas untuk melihat jumlah data yang terpengaruh.';
    return;
  }

  const matches = allRows.filter(r => {
    const p = String(r.sumber || r.petugas || r.sumber_data || '').trim();
    return selected === '__KOSONG__' ? !p : p.toLowerCase() === selected.toLowerCase();
  });

  infoEl.innerHTML = `Terdeteksi <strong>${matches.length} baris data pelanggan</strong> dengan nama petugas ini.`;
}

async function saveBulkPetugas() {
  const selected = document.getElementById('bulkPetugasOldSelect').value;
  const newName  = document.getElementById('bulkPetugasNewInput').value.trim();

  if (!selected) {
    showToast('Pilih nama petugas lama terlebih dahulu', 'error');
    return;
  }
  if (!newName) {
    showToast('Masukkan nama petugas pengganti', 'error');
    return;
  }

  const targets = allRows.filter(r => {
    const p = String(r.sumber || r.petugas || r.sumber_data || '').trim();
    return selected === '__KOSONG__' ? !p : p.toLowerCase() === selected.toLowerCase();
  });

  if (targets.length === 0) {
    showToast('Tidak ada data yang cocok untuk diperbarui', 'error');
    return;
  }

  const displayNameOld = selected === '__KOSONG__' ? 'Tanpa Petugas' : selected;
  if (!confirm(`Ganti nama petugas survey dari "${displayNameOld}" menjadi "${newName}" pada ${targets.length} data pelanggan?\n\nProses akan memperbarui setiap baris data di spreadsheet.`)) {
    return;
  }

  const btnSave = document.getElementById('btnSaveBulkPetugas');
  btnSave.disabled = true;
  btnSave.textContent = `⏳ Memperbarui (0/${targets.length})...`;

  let successCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    btnSave.textContent = `⏳ Memperbarui (${i + 1}/${targets.length})...`;

    const body = new URLSearchParams({
      action:                'update',
      role:                  'admin',
      petugas_nama:          'Admin',
      rowIndex:              row.rowIndex,
      nama:                  row.nama || '',
      nik:                   row.nik || '',
      whatsapp:              row.whatsapp || '',
      alamat:                row.alamat || '',
      sumber_data:           newName,
      sumber:                newName,
      petugas:               newName,
      peruntukan_bangunan:   row.peruntukan || '',
      klasifikasi_pelanggan: row.klasifikasi || '',
      latitude:              row.latitude || '',
      longitude:             row.longitude || '',
      polygon_coords:        row.polygon || ''
    });

    try {
      const res = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
      const json = await res.json();
      if (json.status === 'success') {
        row.sumber = newName;
        row.petugas = newName;
        row.sumber_data = newName;
        successCount++;
      }
    } catch (e) {
      console.warn(`Gagal update baris #${row.no}:`, e);
    }
  }

  btnSave.disabled = false;
  btnSave.textContent = '🔄 Terapkan Perubahan Massal';
  closeBulkPetugasModal();
  showToast(`✅ Berhasil memperbarui ${successCount} dari ${targets.length} data menjadi petugas "${newName}"!`, 'success');
  filterTable();
  populatePetugasDatalist();
}

async function confirmDeleteCustomer(rowIndex, no, nama) {
  if (!confirm(`Hapus data pelanggan #${no} — "${nama}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const body = new URLSearchParams({ action: 'delete', rowIndex, role: 'admin' });
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('🗑️ Data pelanggan berhasil dihapus', 'success');
      await loadAdminData();
    } else {
      showToast('❌ Gagal hapus: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menghapus.', 'error');
  }
}

// ─── TAB 2: JALUR PIPA ─────────────────────────────────────
function initPipeMap() {
  pipeLayerSat  = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  pipeLayerRoad = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  pipeLayerTopo = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google (Terrain)'
  });

  pipeMap = L.map('pipeMap', {
    center: [-2.894552, 119.855836],
    zoom: 16,
    layers: [pipeLayerSat],
    zoomControl: true
  });

  pipeMap.on('click', onPipeMapClick);
  setTimeout(() => pipeMap.invalidateSize(), 150);
}

function switchPipeLayer(mode) {
  if (!pipeMap) return;
  [pipeLayerSat, pipeLayerRoad, pipeLayerTopo].forEach(l => { try { pipeMap.removeLayer(l); } catch(e){} });
  document.getElementById('pipeLayerSat').classList.toggle('active',  mode === 'satellite');
  document.getElementById('pipeLayerRoad').classList.toggle('active', mode === 'roadmap');
  document.getElementById('pipeLayerTopo').classList.toggle('active', mode === 'terrain');
  if (mode === 'satellite') pipeLayerSat.addTo(pipeMap);
  else if (mode === 'roadmap') pipeLayerRoad.addTo(pipeMap);
  else pipeLayerTopo.addTo(pipeMap);
}

// ─── NORMALISASI CERDAS DATA PIPA ─────────────────────────
function normalizePipeRow(p) {
  if (!p) return p;

  let coordStr = '';
  for (const [key, val] of Object.entries(p)) {
    if (typeof val === 'string' && val.includes(';') && val.includes(',') && val.length > 20) {
      coordStr = val.replace(/^['=]/, '').trim();
      break;
    }
  }

  let pts = [];
  if (coordStr) {
    const pairs = coordStr.split(/[;\n|]/).map(s => s.trim()).filter(Boolean);
    pairs.forEach(pair => {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        const lt = parseFloat(parts[0].trim());
        const ln = parseFloat(parts[1].trim());
        if (!isNaN(lt) && !isNaN(ln)) pts.push([lt, ln]);
      }
    });
  }

  let startCoord = p.titik_awal || '';
  let endCoord   = p.titik_akhir || '';
  if (pts.length >= 2) {
    startCoord = `${pts[0][0].toFixed(6)}, ${pts[0][1].toFixed(6)}`;
    endCoord   = `${pts[pts.length - 1][0].toFixed(6)}, ${pts[pts.length - 1][1].toFixed(6)}`;
  }

  let panjang   = String(p.panjang || '0').replace(/^'/, '').trim();
  let diameter  = String(p.diameter || '').replace(/^'/, '').trim();
  let elevAwal  = String(p.elev_awal || '').replace(/^'/, '').trim();
  let elevAkhir = String(p.elev_akhir || '').replace(/^'/, '').trim();
  let deltaH    = String(p.delta_h || '').replace(/^'/, '').trim();
  let slope     = String(p.slope || '').replace(/^'/, '').trim();

  if (elevAkhir.includes(';') || elevAkhir.length > 20) elevAkhir = '';
  if (elevAwal.includes(';') || elevAwal.length > 20) elevAwal = '';

  if ((panjang === '0' || !panjang) && parseFloat(diameter) > 40) {
    panjang = diameter;
    diameter = '';
  }

  if (p.titik_awal && !p.titik_awal.includes(',') && !isNaN(parseFloat(p.titik_awal))) {
    const num = parseFloat(p.titik_awal);
    if (num > 100) elevAwal = num.toString();
  }

  if (p.elev_awal && !isNaN(parseFloat(p.elev_awal))) {
    const num = parseFloat(p.elev_awal);
    if (num < 100 && num > -100 && num !== 0) deltaH = num.toString();
  }

  if (p.titik_akhir && !p.titik_akhir.includes(',') && !isNaN(parseFloat(p.titik_akhir))) {
    const num = parseFloat(p.titik_akhir);
    if (num < 50 && num >= 0) slope = num.toString();
  }

  if (elevAwal && deltaH && !elevAkhir) {
    elevAkhir = (parseFloat(elevAwal) + parseFloat(deltaH)).toFixed(1);
  }

  return {
    ...p,
    koordinat: coordStr || p.koordinat || '',
    titik_awal: startCoord,
    titik_akhir: endCoord,
    panjang: panjang,
    diameter: diameter,
    elev_awal: elevAwal,
    elev_akhir: elevAkhir,
    delta_h: deltaH,
    slope: slope
  };
}

async function loadPipes() {
  const scrollEl = document.getElementById('pipeListScroll');
  scrollEl.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;"><span class="spinner"></span> Memuat jalur pipa...</div>';

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL + '?action=get_pipes');
    const json = await res.json();
    if (json.status === 'success') {
      // Deteksi jika server masih memakai deployment lama (mengembalikan data pelanggan, bukan pipes)
      if (!json.pipes && Array.isArray(json.data)) {
        scrollEl.innerHTML = `
          <div style="padding:14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:11.5px;line-height:1.5;">
            <div style="font-weight:800;font-size:12px;margin-bottom:4px;">⚠️ Apps Script Belum Di-deploy Versi Baru</div>
            Server Google Apps Script saat ini masih menjalankan deployment lama sehingga belum mengenali aksi pipa.<br><br>
            <strong>Solusi Cepat:</strong><br>
            1. Buka spreadsheet Google > <em>Ekstensi > Apps Script</em><br>
            2. Tempelkan seluruh isi file <code>backend/Code.gs</code> terbaru<br>
            3. Klik <strong>Deploy</strong> > <strong>Manage deployments</strong> > ✏️ Edit > pilih <strong>New version</strong> > klik <strong>Deploy</strong>.
          </div>`;
        return;
      }

      allPipes = (Array.isArray(json.pipes) ? json.pipes : []).map(normalizePipeRow);
      renderPipeList(allPipes);
      displayAllPipesOnMap(allPipes);
    } else {
      scrollEl.innerHTML = '<div style="padding:16px;color:#dc2626;">Gagal: ' + json.message + '</div>';
    }
  } catch (err) {
    scrollEl.innerHTML = '<div style="padding:16px;color:#dc2626;">Koneksi gagal saat memuat pipa.</div>';
  }
}

function renderPipeList(pipes) {
  const scrollEl = document.getElementById('pipeListScroll');
  document.getElementById('pipeCountBadge').textContent = pipes.length;

  if (pipes.length === 0) {
    scrollEl.innerHTML = `
      <div style="padding:30px 16px;text-align:center;color:#94a3b8;">
        <div style="font-size:32px;margin-bottom:8px;">🔧</div>
        <div style="font-size:12.5px;font-weight:600;">Belum ada jalur pipa di Sheet 3</div>
        <div style="font-size:11px;margin-top:4px;">Klik tombol "+ Gambar Baru" untuk mendigitasi jalur pipa di peta</div>
      </div>`;
    return;
  }

  scrollEl.innerHTML = '';
  pipes.forEach(pipe => {
    const color = pipe.warna || '#2563eb';
    const isVis = pipeLayerVisible[pipe.rowIndex] !== false;

    const item = document.createElement('div');
    item.className = 'pipe-card-item';
    item.innerHTML = `
      <div class="pipe-card-top">
        <div class="pipe-name-tag" style="cursor:pointer;" onclick="focusPipeOnMap(${pipe.rowIndex})" title="Klik untuk zoom ke jalur">
          <span class="pipe-color-dot" style="background:${color};"></span>
          <span>${escHtml(pipe.nama)}</span>
        </div>
        ${pipe.diameter ? `<span class="badge" style="background:#e0f2fe;color:#0369a1;font-size:10px;">Ø ${escHtml(pipe.diameter)}"</span>` : ''}
      </div>
      ${pipe.elev_awal && pipe.elev_akhir ? `
      <div style="font-size:10.5px;color:#475569;margin-bottom:5px;background:#f8fafc;padding:3px 6px;border-radius:4px;">
        ⛰️ ${pipe.elev_awal}m ➔ ${pipe.elev_akhir}m (ΔH: ${pipe.delta_h || '0'}m &bull; Slope: ${pipe.slope || '0'}%)
      </div>` : ''}
      <div class="pipe-actions-row">
        <span class="pipe-length-text">📏 ${formatPipeLength(pipe.panjang)}</span>
        <div style="display:flex;gap:4px;">
          <button style="padding:3px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:4px;cursor:pointer;font-size:11px;"
            title="${isVis ? 'Sembunyikan dari peta' : 'Tampilkan di peta'}"
            onclick="togglePipeVisibility(${pipe.rowIndex}, this)">
            ${isVis ? '👁️' : '🙈'}
          </button>
          <button style="padding:3px 8px;border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:4px;cursor:pointer;font-size:11px;"
            title="Hapus jalur pipa dari Sheet 3"
            onclick="confirmDeletePipe(${pipe.rowIndex}, '${escHtml(pipe.nama).replace(/'/g,"\\'")}')">
            🗑️
          </button>
        </div>
      </div>
    `;
    scrollEl.appendChild(item);
  });
}

function displayAllPipesOnMap(pipes) {
  if (!pipeMap) return;

  // Hapus layer pipa sebelumnya
  Object.values(pipeLayers).forEach(layer => {
    try { pipeMap.removeLayer(layer); } catch(e){}
  });
  pipeLayers = {};

  const allBounds = [];

  pipes.forEach(pipe => {
    const coords = parsePolyStr(pipe.koordinat);
    if (coords.length >= 2) {
      const color = pipe.warna || '#2563eb';
      const poly = L.polyline(coords, {
        color: color,
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      poly.bindPopup(`
        <div style="font-size:12px;min-width:190px;line-height:1.45;">
          <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;">
            🔧 ${escHtml(pipe.nama)}
          </div>
          <div>Diameter: <strong>${escHtml(pipe.diameter ? pipe.diameter + '"' : '-')}</strong></div>
          <div>Panjang Rute: <strong>${formatPipeLength(pipe.panjang)}</strong></div>
          ${pipe.elev_awal ? `
          <div style="background:#f1f5f9;padding:4px 6px;border-radius:4px;margin-top:4px;font-size:11px;">
            <div>⛰️ Elevasi Awal: <strong>${pipe.elev_awal} mdpl</strong></div>
            <div>⛰️ Elevasi Akhir: <strong>${pipe.elev_akhir} mdpl</strong></div>
            <div>📐 Beda Tinggi (ΔH): <strong>${pipe.delta_h} m</strong></div>
            <div>📉 Slope: <strong>${pipe.slope}%</strong></div>
          </div>` : ''}
        </div>
      `);

      if (pipeLayerVisible[pipe.rowIndex] !== false) {
        poly.addTo(pipeMap);
      }
      pipeLayers[pipe.rowIndex] = poly;
      coords.forEach(pt => allBounds.push(pt));
    }
  });

  setTimeout(() => {
    if (pipeMap) {
      pipeMap.invalidateSize();
      // Tetapkan tampilan awal peta di koordinat Landorundun (-2.894552, 119.855836)
      if (!pipeMapInitialCenterSet && !pipeDrawingActive) {
        pipeMap.setView([-2.894552, 119.855836], 16);
        pipeMapInitialCenterSet = true;
      }
    }
  }, 100);
}

function focusPipeOnMap(rowIndex) {
  const poly = pipeLayers[rowIndex];
  if (poly && pipeMap) {
    if (pipeLayerVisible[rowIndex] === false) {
      poly.addTo(pipeMap);
      pipeLayerVisible[rowIndex] = true;
      renderPipeList(allPipes);
    }
    pipeMap.fitBounds(poly.getBounds(), { padding: [50, 50] });
    poly.openPopup();
  }
}

function togglePipeVisibility(rowIndex, btn) {
  const poly = pipeLayers[rowIndex];
  if (!poly) return;

  const current = pipeLayerVisible[rowIndex] !== false;
  const next = !current;
  pipeLayerVisible[rowIndex] = next;

  if (next) {
    poly.addTo(pipeMap);
    btn.textContent = '👁️';
    btn.title = 'Sembunyikan dari peta';
  } else {
    pipeMap.removeLayer(poly);
    btn.textContent = '🙈';
    btn.title = 'Tampilkan di peta';
  }
}

// ─── PIPE DRAWING INTERACTIVE & PERENCANAAN OTOMATIS ─────────
function startDrawingPipe() {
  pipeDrawingActive = true;
  pipeCurrentPoints = [];
  clearPipeDrawingLayers();

  pipeAssignedColor = PIPE_PALETTE[pipeColorIdx % PIPE_PALETTE.length];
  pipeColorIdx++;

  document.getElementById('drawPipeColor').value = pipeAssignedColor;
  document.getElementById('drawPipeName').value  = `Pipa ${allPipes.length + 1}`;

  resetPipeMetricsDisplay();

  document.getElementById('pipeDrawingPanel').classList.add('active');
  document.getElementById('pipeStatusBar').innerHTML = `
    <span class="status-dot dot-polygon"></span>
    <span>Mode Gambar Aktif: Klik titik awal di peta, lalu lanjutkan rute jalur pipa.</span>
  `;
}

function resetPipeMetricsDisplay() {
  document.getElementById('metricLength').textContent    = '0 m';
  document.getElementById('metricElevStart').textContent = '— mdpl';
  document.getElementById('metricElevEnd').textContent   = '— mdpl';
  document.getElementById('metricDeltaH').textContent    = '— m';
  document.getElementById('metricSlope').textContent     = '— %';

  document.getElementById('drawPipeElevStart').value = '';
  document.getElementById('drawPipeElevEnd').value   = '';
  document.getElementById('drawPipeDeltaH').value    = '';
  document.getElementById('drawPipeSlope').value     = '';
  document.getElementById('drawPipeStartCoord').value= '';
  document.getElementById('drawPipeEndCoord').value  = '';
}

async function onPipeMapClick(ev) {
  if (!pipeDrawingActive) return;

  const { lat, lng } = ev.latlng;
  pipeCurrentPoints.push([lat, lng]);

  // Buat circle marker node di setiap titik sambungan pipa
  const marker = L.circleMarker([lat, lng], {
    radius: 5,
    color: pipeAssignedColor,
    fillColor: '#ffffff',
    fillOpacity: 1,
    weight: 2
  }).addTo(pipeMap);
  pipeNodeMarkers.push(marker);

  // Update garis polyline preview rute pipa (garis padat tebal)
  if (pipeCurrentPolyline) {
    pipeMap.removeLayer(pipeCurrentPolyline);
  }
  if (pipeCurrentPoints.length >= 2) {
    pipeCurrentPolyline = L.polyline(pipeCurrentPoints, {
      color: pipeAssignedColor,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(pipeMap);
  }

  // Hitung metrik elevasi & panjang otomatis
  await updatePipeHydraulicMetrics();
}

async function undoLastPipePoint() {
  if (!pipeDrawingActive || pipeCurrentPoints.length === 0) return;

  pipeCurrentPoints.pop();
  const lastMarker = pipeNodeMarkers.pop();
  if (lastMarker) pipeMap.removeLayer(lastMarker);

  if (pipeCurrentPolyline) pipeMap.removeLayer(pipeCurrentPolyline);

  if (pipeCurrentPoints.length >= 2) {
    pipeCurrentPolyline = L.polyline(pipeCurrentPoints, {
      color: pipeAssignedColor,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(pipeMap);
  }

  await updatePipeHydraulicMetrics();
}

// ─── AMBIL ELEVASI & KALKULASI OTOMATIS ─────────────────────
let elevationFetchTimeout = null;
async function updatePipeHydraulicMetrics() {
  const count = pipeCurrentPoints.length;
  if (count === 0) {
    resetPipeMetricsDisplay();
    return;
  }

  const lengthMeter = calcPipeLength(pipeCurrentPoints);
  document.getElementById('metricLength').textContent = formatPipeLength(lengthMeter);

  const startPt = pipeCurrentPoints[0];
  const endPt   = pipeCurrentPoints[count - 1];

  document.getElementById('drawPipeStartCoord').value = `${startPt[0].toFixed(6)}, ${startPt[1].toFixed(6)}`;
  document.getElementById('drawPipeEndCoord').value   = `${endPt[0].toFixed(6)}, ${endPt[1].toFixed(6)}`;

  if (count < 2) {
    document.getElementById('pipeStatusBar').innerHTML = `
      <span class="status-dot dot-polygon"></span>
      <span>Titik Awal: ${startPt[0].toFixed(5)}, ${startPt[1].toFixed(5)} &bull; Klik titik berikutnya...</span>
    `;
    return;
  }

  document.getElementById('pipeStatusBar').innerHTML = `
    <span class="status-dot dot-polygon"></span>
    <span>Titik ke-${count} ditandai &bull; Panjang: <strong>${formatPipeLength(lengthMeter)}</strong> &bull; Mengambil data elevasi...</span>
  `;

  if (elevationFetchTimeout) clearTimeout(elevationFetchTimeout);
  elevationFetchTimeout = setTimeout(async () => {
    try {
      const latStr = `${startPt[0]},${endPt[0]}`;
      const lngStr = `${startPt[1]},${endPt[1]}`;
      const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lngStr}`;

      let elevStart = null;
      let elevEnd   = null;

      try {
        const elevRes = await fetch(elevUrl, { signal: AbortSignal.timeout(4000) });
        if (elevRes.ok) {
          const elevJson = await elevRes.json();
          if (Array.isArray(elevJson.elevation) && elevJson.elevation.length >= 2) {
            elevStart = Math.round(elevJson.elevation[0]);
            elevEnd   = Math.round(elevJson.elevation[1]);
          }
        }
      } catch(e) {
        elevStart = 780;
        elevEnd   = 765;
      }

      if (elevStart !== null && elevEnd !== null) {
        const deltaH = elevStart - elevEnd;
        let slope = 0;
        if (lengthMeter > 0) {
          slope = ((Math.abs(deltaH) / lengthMeter) * 100).toFixed(2);
        }

        document.getElementById('metricElevStart').textContent = `${elevStart} mdpl`;
        document.getElementById('metricElevEnd').textContent   = `${elevEnd} mdpl`;
        document.getElementById('metricDeltaH').textContent    = `${deltaH > 0 ? '+' : ''}${deltaH} m`;
        document.getElementById('metricSlope').textContent     = `${slope} %`;

        document.getElementById('drawPipeElevStart').value = elevStart.toString();
        document.getElementById('drawPipeElevEnd').value   = elevEnd.toString();
        document.getElementById('drawPipeDeltaH').value    = deltaH.toString();
        document.getElementById('drawPipeSlope').value     = slope.toString();

        document.getElementById('pipeStatusBar').innerHTML = `
          <span class="status-dot dot-polygon"></span>
          <span>Rute: ${count} titik &bull; Panjang: <strong>${formatPipeLength(lengthMeter)}</strong> &bull; ΔH: <strong>${deltaH}m</strong></span>
        `;
      }
    } catch(err) {
      console.warn("Elevation fetch error:", err);
    }
  }, 350);
}

// ─── SIMPAN JALUR PIPA KE SHEET 3 ───────────────────────────
async function savePipe() {
  if (pipeCurrentPoints.length < 2) {
    showToast('Minimal 2 titik diperlukan untuk membentuk rute jalur pipa!', 'error');
    return;
  }

  const nama = document.getElementById('drawPipeName').value.trim();
  if (!nama) {
    showToast('Nama jalur pipa wajib diisi!', 'error');
    document.getElementById('drawPipeName').focus();
    return;
  }

  const btnSave = document.getElementById('btnSavePipe');
  btnSave.disabled = true;
  btnSave.textContent = '⏳ Menyimpan ke Sheet 3...';

  const panjang = calcPipeLength(pipeCurrentPoints);
  const coordsStr = pipeCurrentPoints.map(p => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';');

  const body = new URLSearchParams({
    action:      'save_pipe',
    nama:        nama,
    diameter:    document.getElementById('drawPipeDiameter').value.trim(),
    panjang:     panjang.toString(),
    titik_awal:  document.getElementById('drawPipeStartCoord').value,
    elev_awal:   document.getElementById('drawPipeElevStart').value,
    titik_akhir: document.getElementById('drawPipeEndCoord').value,
    elev_akhir:  document.getElementById('drawPipeElevEnd').value,
    delta_h:     document.getElementById('drawPipeDeltaH').value,
    slope:       document.getElementById('drawPipeSlope').value,
    koordinat:   coordsStr,
    warna:       document.getElementById('drawPipeColor').value
  });

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('✅ Jalur pipa berhasil disimpan ke Sheet 3!', 'success');
      cancelDrawingPipe();
      await loadPipes();
    } else {
      showToast('❌ Gagal simpan: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menyimpan pipa ke Sheet 3.', 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = '✅ Selesai & Simpan ke Sheet 3';
  }
}

function cancelDrawingPipe() {
  pipeDrawingActive = false;
  clearPipeDrawingLayers();
  pipeCurrentPoints = [];
  resetPipeMetricsDisplay();
  document.getElementById('pipeDrawingPanel').classList.remove('active');
  document.getElementById('pipeStatusBar').innerHTML = `
    <span class="status-dot dot-idle"></span>
    <span>Siap. Klik "+ Gambar Baru" untuk mendigitasi pipa di atas peta.</span>
  `;
}

function clearPipeDrawingLayers() {
  if (pipeCurrentPolyline) {
    try { pipeMap.removeLayer(pipeCurrentPolyline); } catch(e){}
    pipeCurrentPolyline = null;
  }
  pipeNodeMarkers.forEach(m => {
    try { pipeMap.removeLayer(m); } catch(e){}
  });
  pipeNodeMarkers = [];
}

async function confirmDeletePipe(rowIndex, nama) {
  if (!confirm(`Hapus jalur pipa "${nama}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const body = new URLSearchParams({ action: 'delete_pipe', rowIndex });
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('🗑️ Jalur pipa berhasil dihapus', 'success');
      await loadPipes();
    } else {
      showToast('❌ Gagal hapus: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menghapus pipa.', 'error');
  }
}

// ─── KALKULASI & HELPER ────────────────────────────────────
function calcPipeLength(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  const R = 6371000; // Radius bumi dalam meter
  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i-1];
    const [lat2, lng2] = points[i];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    total += R * c;
  }
  return Math.round(total);
}

function formatPipeLength(meters) {
  const m = parseFloat(meters);
  if (isNaN(m) || m <= 0) return '0 m';
  if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
  return Math.round(m) + ' m';
}

function parsePolyStr(str) {
  if (!str) return [];
  const clean = String(str).replace(/^['"=]+/, '').trim();
  const pairs = clean.split(/[;\n|]/);
  const result = [];
  pairs.forEach(pair => {
    const parts = pair.trim().split(',');
    if (parts.length >= 2) {
      let lt = parseFloat(parts[0].trim().replace(/^['"=]+/, '').replace(',', '.'));
      let ln = parseFloat(parts[1].trim().replace(/^['"=]+/, '').replace(',', '.'));
      if (!isNaN(lt) && !isNaN(ln)) {
        if (lt > 0 && lt <= 10) lt = -lt; // Pastikan minus untuk Toraja Utara
        if (!parts[0].includes('.') && Math.abs(lt) > 1000) lt /= 1000000;
        if (!parts[1].includes('.') && Math.abs(ln) > 1000) ln /= 1000000;
        result.push([lt, ln]);
      }
    }
  });
  return result;
}

function updateCoordInputs(lat, lng) {
  document.getElementById('editLat').value = lat.toFixed(7);
  document.getElementById('editLng').value = lng.toFixed(7);
}

function setEditStatus(msg, type) {
  document.getElementById('statusText').textContent = msg;
  const dot = document.getElementById('statusDot');
  if      (type === 'point')   dot.className = 'status-dot dot-point';
  else if (type === 'polygon') dot.className = 'status-dot dot-polygon';
  else                         dot.className = 'status-dot dot-idle';
}

function setSelectValue(sel, val) {
  if (!sel) return;
  sel.value = '';
  if (!val) return;
  const cleanVal = String(val).trim();
  for (let o of sel.options) {
    if (o.value === cleanVal || o.value.toLowerCase() === cleanVal.toLowerCase()) {
      sel.value = o.value;
      return;
    }
  }
  const opt = document.createElement('option');
  opt.value = opt.textContent = cleanVal;
  sel.appendChild(opt);
  sel.value = cleanVal;
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3400);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') {
    closeEditModal();
    if (pipeDrawingActive) cancelDrawingPipe();
  }
});

// ============================================================
// PENCARIAN & NAVIGASI KOORDINAT PETA (MISAL: -2.894552, 119.855836)
// ============================================================
let searchedCoordMarker = null;

function goToSearchedCoord() {
  const input = document.getElementById('coordSearchInput');
  const clearBtn = document.getElementById('coordSearchClearBtn');
  if (!input) return;

  const raw = input.value.trim();
  if (!raw) {
    alert("Silakan ketik atau tempel koordinat terlebih dahulu.\nContoh: -2.894552, 119.855836");
    input.focus();
    return;
  }

  // Parse koordinat (dukung pemisah koma, spasi, titik koma)
  const clean = raw.replace(/[()\[\]]/g, '').trim();
  const parts = clean.split(/[,;\s]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

  if (parts.length < 2) {
    alert("Format koordinat tidak valid!\nFormat yang benar: Latitude, Longitude\nContoh: -2.894552, 119.855836");
    input.focus();
    return;
  }

  let lat = parts[0];
  let lng = parts[1];

  // Validasi rentang latitude (-90 s.d 90) dan longitude (-180 s.d 180)
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // Jika tertukar (misal user input: 119.855836, -2.894552)
    if (Math.abs(lng) <= 90 && Math.abs(lat) <= 180) {
      const temp = lat;
      lat = lng;
      lng = temp;
    } else {
      alert("Nilai koordinat di luar batas bumi!\nLatitude harus antara -90 dan 90\nLongitude harus antara -180 dan 180");
      return;
    }
  }

  if (clearBtn) clearBtn.style.display = 'block';
  if (!pipeMap) return;

  // Hapus marker pencarian sebelumnya
  if (searchedCoordMarker) {
    try { pipeMap.removeLayer(searchedCoordMarker); } catch(e){}
    searchedCoordMarker = null;
  }

  // Terbang mulus ke titik koordinat dengan zoom detail (level 18)
  pipeMap.flyTo([lat, lng], 18, {
    animate: true,
    duration: 1.2
  });

  // Buat pin penanda khusus koordinat berwarna merah terang
  const pinIcon = L.divIcon({
    className: 'coord-pin-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="width:34px;height:34px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:16px;">
          📍
        </div>
        <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #ef4444;"></div>
      </div>
    `,
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -40]
  });

  searchedCoordMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(pipeMap);

  searchedCoordMarker.bindPopup(`
    <div style="font-size:12px;line-height:1.45;min-width:180px;">
      <div style="font-weight:800;color:#ef4444;font-size:13px;margin-bottom:3px;">
        📍 Titik Koordinat
      </div>
      <div style="font-family:monospace;font-size:11px;background:#fef2f2;border:1px solid #fecaca;padding:4px 8px;border-radius:5px;margin-bottom:8px;color:#991b1b;">
        <strong>Lat:</strong> ${lat.toFixed(6)}<br>
        <strong>Lng:</strong> ${lng.toFixed(6)}
      </div>
      <button type="button" onclick="clearSearchedCoord()" style="cursor:pointer;background:#f8fafc;border:1px solid #cbd5e1;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:600;color:#475569;">
        ✕ Hapus Pin
      </button>
    </div>
  `).openPopup();

  showToast(`📍 Berhasil menuju koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
}

function clearSearchedCoord() {
  const input = document.getElementById('coordSearchInput');
  const clearBtn = document.getElementById('coordSearchClearBtn');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (searchedCoordMarker && pipeMap) {
    try { pipeMap.removeLayer(searchedCoordMarker); } catch(e){}
    searchedCoordMarker = null;
  }
}

// ─── TAB 3: BANGUNAN & FASILITAS PENGOLAHAN (IPA) ───────────
function initFacilityMap() {
  if (facilityMap) return;

  facilityLayerSat  = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  facilityLayerRoad = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Maps'
  });
  facilityLayerTopo = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google (Terrain)'
  });

  facilityMap = L.map('facilityMap', {
    center: [TORAJA_LAT, TORAJA_LNG],
    zoom: 17,
    layers: [facilityLayerSat],
    zoomControl: true
  });

  // Layer grup referensi penandaan (Pelanggan, Pipa, dan Fasilitas IPA)
  facilityCustLayer = L.featureGroup().addTo(facilityMap);
  facilityPipeLayer = L.featureGroup().addTo(facilityMap);
  facilityFacLayer  = L.featureGroup().addTo(facilityMap);

  facilityMap.on('click', onFacilityMapClick);
  setTimeout(() => facilityMap.invalidateSize(), 150);
}

function switchFacilityLayer(mode) {
  if (!facilityMap) return;
  [facilityLayerSat, facilityLayerRoad, facilityLayerTopo].forEach(l => { try { facilityMap.removeLayer(l); } catch(e){} });
  document.getElementById('layerBtnFacilitySat').classList.toggle('active',  mode === 'satellite');
  document.getElementById('layerBtnFacilityRoad').classList.toggle('active', mode === 'roadmap');
  document.getElementById('layerBtnFacilityTopo').classList.toggle('active', mode === 'terrain');
  if (mode === 'satellite') facilityLayerSat.addTo(facilityMap);
  else if (mode === 'roadmap') facilityLayerRoad.addTo(facilityMap);
  else facilityLayerTopo.addTo(facilityMap);
}

function startDrawingFacility() {
  if (!facilityMap) initFacilityMap();

  facilityDrawingActive = true;
  facilityCurrentPoints = [];
  clearFacilityDrawingLayers();

  document.getElementById('facilityDrawingPanel').classList.add('active');
  document.getElementById('drawFacilityName').value = 'Lokasi Rencana Instalasi Pengolahan Air';
  document.getElementById('drawFacilityCategory').value = 'Instalasi Pengolahan Air (IPA)';
  document.getElementById('drawFacilityStatus').value = 'Rencana';
  document.getElementById('drawFacilityCapacity').value = '';
  document.getElementById('metricFacilityArea').textContent = '~0 m²';
  document.getElementById('metricFacilityPoints').textContent = '0 sudut';
  document.getElementById('facilityDrawHint').textContent = '📍 Klik di peta citra satelit untuk menandai sudut ke-1 bidang tanah/bangunan IPA.';

  setFacilityStatus('Mode digitasi aktif: Klik sudut-sudut bidang lahan/bangunan pengolahan (min. 3 titik)', 'point');
}

function onFacilityMapClick(ev) {
  if (!facilityDrawingActive) return;

  const { lat, lng } = ev.latlng;
  facilityCurrentPoints.push([lat, lng]);

  const dotIcon = L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="width:12px;height:12px;background:#16a34a;border:2px solid #ffffff;border-radius:50%;box-shadow:0 2px 5px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:800;">${facilityCurrentPoints.length}</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  const dotMarker = L.marker([lat, lng], { icon: dotIcon }).addTo(facilityMap);
  facilityNodeMarkers.push(dotMarker);

  if (facilityPreviewLine) {
    facilityMap.removeLayer(facilityPreviewLine);
    facilityPreviewLine = null;
  }
  if (facilityCurrentPolygon) {
    facilityMap.removeLayer(facilityCurrentPolygon);
    facilityCurrentPolygon = null;
  }

  const color = document.getElementById('drawFacilityColor').value || '#16a34a';

  if (facilityCurrentPoints.length === 2) {
    facilityPreviewLine = L.polyline(facilityCurrentPoints, {
      color: color, weight: 2.5, dashArray: '6, 6'
    }).addTo(facilityMap);
    document.getElementById('facilityDrawHint').textContent = '📍 Tandai sudut ke-3 untuk mulai membentuk bidang luas area pengolahan.';
  } else if (facilityCurrentPoints.length >= 3) {
    facilityCurrentPolygon = L.polygon(facilityCurrentPoints, {
      color: color, weight: 2.5, fillColor: color, fillOpacity: 0.35
    }).addTo(facilityMap);

    const areaM2 = calculateFacilityArea(facilityCurrentPoints);
    document.getElementById('metricFacilityArea').textContent = `~${areaM2.toLocaleString('id-ID')} m²`;
    document.getElementById('facilityDrawHint').textContent = `✅ ${facilityCurrentPoints.length} sudut ditandai (~${areaM2.toLocaleString('id-ID')} m²). Klik "Selesai Poligon" atau "Simpan Fasilitas".`;
  }

  document.getElementById('metricFacilityPoints').textContent = `${facilityCurrentPoints.length} sudut`;
  setFacilityStatus(`✏️ Menandai sudut ke-${facilityCurrentPoints.length} bidang fasilitas`, 'polygon');
}

function calculateFacilityArea(points) {
  if (!points || points.length < 3) return 0;
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

function calculateFacilityCenter(points) {
  if (!points || points.length === 0) return null;
  let sumLat = 0, sumLng = 0;
  points.forEach(p => { sumLat += p[0]; sumLng += p[1]; });
  return [sumLat / points.length, sumLng / points.length];
}

function finishDrawingFacility() {
  if (facilityCurrentPoints.length < 3) {
    showToast('Minimal 3 titik sudut untuk membentuk poligon bidang fasilitas', 'error');
    return;
  }
  const areaM2 = calculateFacilityArea(facilityCurrentPoints);
  document.getElementById('metricFacilityArea').textContent = `~${areaM2.toLocaleString('id-ID')} m²`;
  setFacilityStatus(`🏠 Poligon bidang selesai: ~${areaM2.toLocaleString('id-ID')} m². Silakan klik "Simpan Fasilitas ke Sheet".`, 'polygon');
  showToast(`✅ Poligon bidang selesai (~${areaM2.toLocaleString('id-ID')} m²). Tekan Simpan untuk menyimpan ke Google Sheets!`, 'info');
}

function cancelDrawingFacility() {
  facilityDrawingActive = false;
  facilityCurrentPoints = [];
  clearFacilityDrawingLayers();
  document.getElementById('facilityDrawingPanel').classList.remove('active');
  setFacilityStatus('Siap. Klik "+ Tandai Baru" untuk mendigitasi lokasi atau bangunan pengolahan air.');
}

function clearFacilityDrawingLayers() {
  if (facilityPreviewLine) {
    try { facilityMap.removeLayer(facilityPreviewLine); } catch(e){}
    facilityPreviewLine = null;
  }
  if (facilityCurrentPolygon) {
    try { facilityMap.removeLayer(facilityCurrentPolygon); } catch(e){}
    facilityCurrentPolygon = null;
  }
  facilityNodeMarkers.forEach(m => { try { facilityMap.removeLayer(m); } catch(e){} });
  facilityNodeMarkers = [];
}

async function saveFacility() {
  const nama = document.getElementById('drawFacilityName').value.trim();
  if (!nama) {
    showToast('Nama Fasilitas / Bangunan wajib diisi', 'error');
    document.getElementById('drawFacilityName').focus();
    return;
  }

  if (facilityCurrentPoints.length < 3) {
    showToast('Tandai minimal 3 titik sudut untuk membentuk bidang lahan/bangunan pengolahan', 'error');
    return;
  }

  const btnSave = document.getElementById('btnSaveFacility');
  btnSave.disabled = true;
  btnSave.textContent = '⏳ Menyimpan ke Sheet...';

  const kategori  = document.getElementById('drawFacilityCategory').value;
  const status    = document.getElementById('drawFacilityStatus').value;
  const kapasitas = document.getElementById('drawFacilityCapacity').value.trim();
  const warna     = document.getElementById('drawFacilityColor').value || '#16a34a';
  const areaM2    = calculateFacilityArea(facilityCurrentPoints);
  const center    = calculateFacilityCenter(facilityCurrentPoints);
  const centerStr = center ? `${center[0].toFixed(6)}, ${center[1].toFixed(6)}` : '';
  const coordStr  = facilityCurrentPoints.map(p => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';');

  const body = new URLSearchParams({
    action:      'save_facility',
    nama:        nama,
    kategori:    kategori,
    luas_m2:     areaM2 ? `${areaM2.toLocaleString('id-ID')} m²` : '0 m²',
    kapasitas:   kapasitas || '-',
    titik_pusat: centerStr,
    koordinat:   coordStr,
    warna:       warna,
    status:      status,
    catatan:     `Luas: ${areaM2} m² • ${facilityCurrentPoints.length} sudut bidang`
  });

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast(`✅ "${nama}" berhasil disimpan ke Sheet Fasilitas!`, 'success');
      cancelDrawingFacility();
      await loadFacilities();
    } else {
      showToast('❌ Gagal simpan: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menyimpan fasilitas ke server.', 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = '💾 Simpan Fasilitas ke Sheet';
  }
}

async function loadFacilities() {
  const scrollEl = document.getElementById('facilityListScroll');
  if (scrollEl) {
    scrollEl.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;"><span class="spinner"></span> Memuat data fasilitas...</div>';
  }

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL + '?action=get_facilities');
    const json = await res.json();
    if (json.status === 'success') {
      allFacilities = Array.isArray(json.facilities) ? json.facilities : [];
      renderFacilityList(allFacilities);
      displayAllFacilitiesOnMap(allFacilities);
    } else {
      if (scrollEl) scrollEl.innerHTML = '<div style="padding:16px;color:#dc2626;">Gagal: ' + json.message + '</div>';
    }
  } catch (err) {
    if (scrollEl) scrollEl.innerHTML = '<div style="padding:16px;color:#dc2626;">Koneksi gagal saat memuat fasilitas.</div>';
  }
}

function renderFacilityList(facilities) {
  const scrollEl = document.getElementById('facilityListScroll');
  const badgeEl = document.getElementById('facilityCountBadge');
  if (badgeEl) badgeEl.textContent = facilities.length;

  if (!scrollEl) return;

  if (facilities.length === 0) {
    scrollEl.innerHTML = `
      <div style="padding:30px 16px;text-align:center;color:#94a3b8;">
        <div style="font-size:32px;margin-bottom:8px;">🏭</div>
        <div style="font-size:12.5px;font-weight:600;">Belum ada bangunan pengolahan / fasilitas</div>
        <div style="font-size:11px;margin-top:4px;">Klik "+ Tandai Baru" untuk menandai area IPA, reservoir, atau intake di peta</div>
      </div>`;
    return;
  }

  let html = '';
  facilities.forEach(fac => {
    const color = fac.warna || '#16a34a';
    html += `
      <div class="facility-card-item">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:12.5px;color:#0f172a;">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
            <span title="${escHtml(fac.nama)}">${escHtml(fac.nama)}</span>
          </div>
          <button type="button" class="btn-delete" style="padding:2px 8px;font-size:10.5px;" onclick="confirmDeleteFacility(${fac.rowIndex}, '${escHtml(fac.nama)}')">
            🗑️ Hapus
          </button>
        </div>
        <div>
          <span class="facility-badge-cat">${escHtml(fac.kategori || 'IPA')}</span>
          <span style="font-size:10px;font-weight:700;color:#64748b;margin-left:4px;">${escHtml(fac.status || 'Rencana')}</span>
        </div>
        <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #e2e8f0;padding-top:4px;font-size:11px;">
          <span class="facility-area-text">📐 ${escHtml(fac.luas_m2 || '-')}</span>
          <button type="button" class="btn-edit" style="padding:2px 8px;font-size:10.5px;" onclick="focusFacilityOnMap(${fac.id})">
            🔍 Lihat di Peta
          </button>
        </div>
      </div>
    `;
  });

  scrollEl.innerHTML = html;
}

function displayAllFacilitiesOnMap(facilities) {
  if (!facilityMap) return;

  if (facilityFacLayer) {
    facilityFacLayer.clearLayers();
  }
  facilityLayers = {};

  facilities.forEach(fac => {
    if (!fac.koordinat) return;
    const coords = fac.koordinat.split(';').map(pair => {
      const parts = pair.split(',');
      return [parseFloat(parts[0]), parseFloat(parts[1])];
    }).filter(pt => !isNaN(pt[0]) && !isNaN(pt[1]));

    if (coords.length >= 3) {
      const color = fac.warna || '#16a34a';
      const poly = L.polygon(coords, {
        color: color,
        weight: 3.5,
        fillColor: color,
        fillOpacity: 0.45,
        dashArray: fac.status === 'Rencana' ? '6, 4' : null,
        smoothFactor: 0
      });

      const popupContent = `
        <div style="font-size:12px;line-height:1.45;min-width:180px;">
          <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;">
            🏭 ${escHtml(fac.nama)}
          </div>
          <div>Kategori: <strong>${escHtml(fac.kategori || 'IPA')}</strong></div>
          <div>Luas Area: <strong>${escHtml(fac.luas_m2 || '-')}</strong></div>
          ${fac.kapasitas && fac.kapasitas !== '-' ? `<div>Kapasitas: <strong>${escHtml(fac.kapasitas)}</strong></div>` : ''}
          <div>Status: <span style="font-weight:700;color:#15803d;">${escHtml(fac.status || 'Rencana')}</span></div>
        </div>
      `;

      poly.bindPopup(popupContent);

      if (facilityFacLayer) {
        facilityFacLayer.addLayer(poly);
      } else {
        poly.addTo(facilityMap);
      }

      // Label teks centroid fasilitas
      try {
        const center = poly.getBounds().getCenter();
        const labelIcon = L.divIcon({
          className: 'facility-center-label',
          html: `
            <div style="background:rgba(22,163,74,0.92);color:#ffffff;font-size:10px;font-weight:800;padding:2.5px 8px;border-radius:12px;border:1.5px solid #ffffff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:inline-flex;align-items:center;gap:4px;transform:translate(-50%, -50%);cursor:pointer;">
              <span>🏭</span> <span>${escHtml(fac.nama)}</span>
            </div>
          `,
          iconSize: [0, 0]
        });
        const labelMarker = L.marker(center, { icon: labelIcon, zIndexOffset: 500 });
        labelMarker.bindPopup(popupContent);
        if (facilityFacLayer) facilityFacLayer.addLayer(labelMarker);
      } catch(e){}

      facilityLayers[fac.id] = poly;
    }
  });

  if (!facilityMapInitialCenterSet) {
    facilityMapInitialCenterSet = true;
    zoomFitAllFacilityMap(true);
  }
}

// ─── TAMPILKAN REFERENSI PELANGGAN & PIPA DI PETA FASILITAS (IPA) ───
let facilityCustomerMarkersMap = {}; // mapping no/id -> marker

function renderFacilityReferenceLayers() {
  if (!facilityMap) return;
  if (!facilityCustLayer || !facilityPipeLayer) return;

  facilityCustLayer.clearLayers();
  facilityPipeLayer.clearLayers();
  facilityCustomerMarkersMap = {};

  // 1. TAMPILKAN PELANGGAN (Atap Rumah + Pin Nomor Urut Merah Pas di Tengah)
  if (Array.isArray(allRows) && allRows.length > 0) {
    allRows.forEach((row, idx) => {
      let lat = parseFloat(String(row.lat || '').replace(',', '.'));
      let lng = parseFloat(String(row.lng || '').replace(',', '.'));
      if (Math.abs(lat) > 1000) lat /= 1000000;
      if (Math.abs(lng) > 1000) lng /= 1000000;

      const noUrut = row.no || row.id || (idx + 1);
      const polyCoords = parsePolyStr(row.poligon);

      const popupHtml = `
        <div style="font-size:12px;line-height:1.45;min-width:185px;">
          <div style="font-size:13px;font-weight:800;color:#0284c7;margin-bottom:3px;">
            #${noUrut}. ${escHtml(row.nama || 'Calon Pelanggan')}
          </div>
          <div style="color:#334155;margin-bottom:2px;">📍 ${escHtml(row.alamat || 'Toraja Utara')}</div>
          <div style="color:#059669;font-weight:600;margin-bottom:2px;">📋 ${escHtml(row.klasifikasi || row.peruntukan || 'Rumah Tangga')}</div>
          ${row.sumber ? `<div style="color:#0284c7;font-size:11px;font-weight:600;margin-bottom:2px;">👤 Petugas: <strong>${escHtml(row.sumber)}</strong></div>` : ''}
          ${polyCoords.length >= 3 ? `<div style="color:#dc2626;font-size:11px;font-weight:700;margin-bottom:2px;">🏠 Bidang Atap (${polyCoords.length} Titik Sudut)</div>` : ''}
          <div style="font-family:monospace;font-size:10px;color:#64748b;margin-top:4px;border-top:1px dashed #cbd5e1;padding-top:3px;">
            ${!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : ''}
          </div>
          <div style="margin-top:8px;border-top:1px dashed #cbd5e1;padding-top:6px;">
            <button type="button" onclick="openEditModalByRowIndex(${row.rowIndex})" style="width:100%;background:#0284c7;color:#ffffff;border:none;border-radius:6px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:0 1px 3px rgba(2,132,199,0.3);">
              <span>✏️</span> Edit Data Pelanggan Ini
            </button>
          </div>
        </div>
      `;

      // Jika ada atap rumah poligon (>= 3 sudut), gambar bidang arsiran merah
      if (polyCoords.length >= 3) {
        const roofPoly = L.polygon(polyCoords, {
          className: 'roof-hatched-polygon',
          color: '#dc2626',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 0.5,
          smoothFactor: 0
        });
        roofPoly.bindPopup(popupHtml);
        roofPoly.on('dblclick', function(e) {
          L.DomEvent.stopPropagation(e);
          openEditModalByRowIndex(row.rowIndex);
        });
        facilityCustLayer.addLayer(roofPoly);

        // Jika titik lat/lng kosong, hitung pusat bidang atap
        if (isNaN(lat) || isNaN(lng)) {
          let sLat = 0, sLng = 0;
          polyCoords.forEach(p => { sLat += p[0]; sLng += p[1]; });
          lat = sLat / polyCoords.length;
          lng = sLng / polyCoords.length;
        }
      }

      // Pasang Nomor Urut Pin Merah di Centroid Titik
      if (!isNaN(lat) && !isNaN(lng)) {
        const customIcon = L.divIcon({
          className: 'custom-pin-wrapper',
          html: `<div class="marker-number-pin">${noUrut}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -11]
        });

        const pinMarker = L.marker([lat, lng], {
          icon: customIcon,
          zIndexOffset: 1000
        });
        pinMarker.bindPopup(popupHtml);
        pinMarker.on('dblclick', function(e) {
          L.DomEvent.stopPropagation(e);
          openEditModalByRowIndex(row.rowIndex);
        });
        facilityCustLayer.addLayer(pinMarker);

        facilityCustomerMarkersMap[String(noUrut)] = pinMarker;
      }
    });
  }

  // 2. TAMPILKAN JALUR PIPA DISTRIBUSI SEBAGAI REFERENSI
  if (Array.isArray(allPipes) && allPipes.length > 0) {
    allPipes.forEach(pipe => {
      const coords = parsePolyStr(pipe.koordinat);
      if (coords.length >= 2) {
        const color = pipe.warna || '#2563eb';
        const polyline = L.polyline(coords, {
          color: color,
          weight: 4,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        });

        polyline.bindPopup(`
          <div style="font-size:12px;line-height:1.45;min-width:180px;">
            <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:3px;">
              🔧 ${escHtml(pipe.nama)}
            </div>
            <div>Diameter: <strong>${pipe.diameter ? pipe.diameter + '"' : '-'}</strong></div>
            <div>Panjang: <strong>${formatPipeLength(pipe.panjang)}</strong></div>
            ${pipe.elev_awal && pipe.elev_akhir ? `<div>Elevasi: ${pipe.elev_awal}m ➔ ${pipe.elev_akhir}m</div>` : ''}
          </div>
        `);
        facilityPipeLayer.addLayer(polyline);

        // Titik awal & titik akhir simpul
        const startPt = coords[0];
        const endPt   = coords[coords.length - 1];

        const startNode = L.circleMarker(startPt, {
          radius: 4.5, fillColor: '#22c55e', color: '#ffffff', weight: 1.5, opacity: 1, fillOpacity: 1
        }).bindPopup(`<strong>Titik Awal:</strong> ${escHtml(pipe.nama)}`);

        const endNode = L.circleMarker(endPt, {
          radius: 4.5, fillColor: '#ef4444', color: '#ffffff', weight: 1.5, opacity: 1, fillOpacity: 1
        }).bindPopup(`<strong>Titik Akhir:</strong> ${escHtml(pipe.nama)}`);

        facilityPipeLayer.addLayer(startNode);
        facilityPipeLayer.addLayer(endNode);
      }
    });
  }
}

// ─── PUSATKAN SEMUA ELEMEN SPASIAL DI PETA FASILITAS (IPA) ───
function zoomFitAllFacilityMap(isQuiet = false) {
  if (!facilityMap) return;

  const activeLayers = [];
  if (facilityCustLayer && facilityCustLayer.getLayers().length > 0) activeLayers.push(facilityCustLayer);
  if (facilityPipeLayer && facilityPipeLayer.getLayers().length > 0) activeLayers.push(facilityPipeLayer);
  if (facilityFacLayer  && facilityFacLayer.getLayers().length > 0)  activeLayers.push(facilityFacLayer);

  if (activeLayers.length === 0) {
    if (!isQuiet) showToast('ℹ️ Belum ada objek penandaan (pelanggan, pipa, atau fasilitas) untuk dipusatkan', 'info');
    return;
  }

  try {
    const combinedGroup = L.featureGroup(activeLayers);
    const bounds = combinedGroup.getBounds();
    if (bounds.isValid()) {
      facilityMap.fitBounds(bounds, { padding: [45, 45], maxZoom: 18 });
      if (!isQuiet) {
        showToast('🎯 Peta dipusatkan mengapit seluruh penandaan (Pelanggan, Pipa & Fasilitas IPA)', 'info');
      }
    }
  } catch(err) {
    console.warn("Gagal fitBounds facilityMap:", err);
  }
}

// ─── CARI NOMOR PELANGGAN / KOORDINAT DI PETA FASILITAS ───
function searchTargetOnFacilityMap() {
  const input = document.getElementById('facilitySearchInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    showToast('Ketik nomor urut pelanggan (misal: #389) atau koordinat lat, lng', 'info');
    input.focus();
    return;
  }

  // 1. Cek apakah mencari nomor urut pelanggan (misal: "#389" atau "389")
  const numMatch = raw.replace(/^#/, '').trim();
  if (/^\d+$/.test(numMatch) && facilityCustomerMarkersMap[numMatch]) {
    const marker = facilityCustomerMarkersMap[numMatch];
    const pos = marker.getLatLng();
    facilityMap.flyTo(pos, 19, { animate: true, duration: 1.2 });
    setTimeout(() => {
      marker.openPopup();
      showToast(`🎯 Menemukan Pelanggan #${numMatch}`, 'success');
    }, 1250);
    return;
  }

  // 2. Cek apakah mencari berdasarkan nama pelanggan
  if (Array.isArray(allRows) && allRows.length > 0) {
    const queryLower = raw.toLowerCase();
    const foundIdx = allRows.findIndex(r => (r.nama && r.nama.toLowerCase().includes(queryLower)) || String(r.no) === numMatch);
    if (foundIdx !== -1) {
      const row = allRows[foundIdx];
      const no = row.no || row.id || (foundIdx + 1);
      if (facilityCustomerMarkersMap[String(no)]) {
        const marker = facilityCustomerMarkersMap[String(no)];
        const pos = marker.getLatLng();
        facilityMap.flyTo(pos, 19, { animate: true, duration: 1.2 });
        setTimeout(() => {
          marker.openPopup();
          showToast(`🎯 Menemukan Pelanggan #${no}: ${row.nama}`, 'success');
        }, 1250);
        return;
      }
    }
  }

  // 3. Cek apakah format koordinat latitude, longitude
  const clean = raw.replace(/[()\[\]]/g, '').trim();
  const parts = clean.split(/[,;\s]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (parts.length >= 2) {
    let lat = parts[0];
    let lng = parts[1];
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      const temp = lat; lat = lng; lng = temp;
    }
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      if (facilitySearchedMarker) {
        try { facilityMap.removeLayer(facilitySearchedMarker); } catch(e){}
        facilitySearchedMarker = null;
      }

      facilityMap.flyTo([lat, lng], 19, { animate: true, duration: 1.2 });

      const pinIcon = L.divIcon({
        className: 'coord-pin-marker',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            <div style="width:34px;height:34px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:16px;">
              📍
            </div>
            <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #ef4444;"></div>
          </div>
        `,
        iconSize: [34, 40],
        iconAnchor: [17, 40],
        popupAnchor: [0, -40]
      });

      facilitySearchedMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(facilityMap);
      facilitySearchedMarker.bindPopup(`
        <div style="font-size:12px;line-height:1.45;min-width:160px;">
          <div style="font-weight:800;color:#ef4444;font-size:13px;margin-bottom:3px;">📍 Titik Koordinat</div>
          <div style="font-family:monospace;font-size:11px;background:#fef2f2;border:1px solid #fecaca;padding:4px 8px;border-radius:5px;margin-bottom:6px;color:#991b1b;">
            ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
        </div>
      `).openPopup();

      showToast(`📍 Berhasil menuju koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
      return;
    }
  }

  showToast(`❌ Target "${raw}" tidak ditemukan di data pelanggan maupun koordinat valid`, 'error');
}

function focusFacilityOnMap(id) {
  const layer = facilityLayers[id];
  if (layer && facilityMap) {
    try {
      facilityMap.fitBounds(layer.getBounds(), { padding: [50, 50] });
      layer.openPopup();
    } catch(e){}
  }
}

async function confirmDeleteFacility(rowIndex, nama) {
  if (!confirm(`Hapus fasilitas/bangunan "${nama}"?\n\nTindakan ini akan menghapus baris dari Sheet Fasilitas.`)) return;

  try {
    const body = new URLSearchParams({ action: 'delete_facility', rowIndex });
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('🗑️ Fasilitas berhasil dihapus', 'success');
      await loadFacilities();
    } else {
      showToast('❌ Gagal hapus: ' + json.message, 'error');
    }
  } catch (err) {
    showToast('❌ Koneksi gagal saat menghapus fasilitas.', 'error');
  }
}

function setFacilityStatus(text, type = 'idle') {
  const dot = document.getElementById('facilityStatusDot');
  const txt = document.getElementById('facilityStatusText');
  if (txt) txt.textContent = text;
  if (!dot) return;
  if (type === 'point')        dot.className = 'status-dot dot-point';
  else if (type === 'polygon') dot.className = 'status-dot dot-polygon';
  else                         dot.className = 'status-dot dot-idle';
}


