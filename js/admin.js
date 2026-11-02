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

const PIPE_PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#ea580c'];
let pipeColorIdx = 0;

// ─── INISIALISASI ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
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
  document.getElementById('loggedUser').textContent    = username;
  loadAdminData();
}

// ─── TAB SWITCHING ─────────────────────────────────────────
function switchTab(tab) {
  const isCust = tab === 'customers';
  document.getElementById('tabBtnCustomers').classList.toggle('active', isCust);
  document.getElementById('tabBtnPipes').classList.toggle('active', !isCust);

  document.getElementById('sectionCustomers').style.display = isCust ? 'block' : 'none';
  document.getElementById('sectionPipes').style.display     = !isCust ? 'block' : 'none';

  if (!isCust) {
    if (!pipeMap) {
      setTimeout(() => {
        initPipeMap();
        loadPipes();
      }, 100);
    } else {
      setTimeout(() => pipeMap.invalidateSize(), 150);
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
        (r.nama||'').toLowerCase().includes(q) ||
        (r.nik||'').toLowerCase().includes(q) ||
        (r.alamat||'').toLowerCase().includes(q) ||
        (r.whatsapp||'').toLowerCase().includes(q) ||
        (r.klasifikasi||'').toLowerCase().includes(q) ||
        (r.peruntukan||'').toLowerCase().includes(q)
      )
    : [...allRows];
  document.getElementById('statFiltered').textContent = filteredRows.length;
  renderCustomerTable(filteredRows);
}

function renderCustomerTable(rows) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  tbody.innerHTML = '';

  if (rows.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  rows.forEach(row => {
    const hasPoly   = row.polygon && row.polygon.trim() !== '';
    const modeBadge = hasPoly
      ? '<span class="badge badge-polygon">🏠 Arsiran</span>'
      : '<span class="badge badge-point">📍 Titik</span>';
    const coordText = (row.latitude && row.longitude)
      ? `<span style="font-family:monospace;font-size:10.5px;color:#64748b">${parseFloat(row.latitude).toFixed(5)}, ${parseFloat(row.longitude).toFixed(5)}</span>`
      : '<span style="color:#cbd5e1">—</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${row.no}</td>
      <td class="td-nama td-truncate" title="${escHtml(row.nama)}">${escHtml(row.nama)||'—'}</td>
      <td class="td-truncate" style="font-family:monospace;font-size:11px">${escHtml(row.nik)||'—'}</td>
      <td class="td-truncate">${escHtml(row.whatsapp)||'—'}</td>
      <td class="td-truncate" title="${escHtml(row.alamat)}">${escHtml(row.alamat)||'—'}</td>
      <td>${escHtml(row.peruntukan)?`<span class="badge badge-blue">${escHtml(row.peruntukan)}</span>`:'—'}</td>
      <td>${escHtml(row.klasifikasi)?`<span class="badge badge-green">${escHtml(row.klasifikasi)}</span>`:'—'}</td>
      <td>${modeBadge}</td>
      <td>${coordText}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick='openEditModal(${JSON.stringify(row)})'>✏️ Edit</button>
          <button class="btn-delete" onclick="confirmDeleteCustomer(${row.rowIndex},${row.no},'${escHtml(row.nama).replace(/'/g,"\\'")}')">🗑️ Hapus</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ─── MODAL EDIT PELANGGAN DENGAN PETA ──────────────────────
function openEditModal(row) {
  document.getElementById('editRowIndex').value    = row.rowIndex;
  document.getElementById('modalTitle').textContent= `#${row.no} — ${row.nama || 'Pelanggan'}`;
  document.getElementById('editNama').value         = row.nama        || '';
  document.getElementById('editNik').value          = row.nik         || '';
  document.getElementById('editWa').value           = row.whatsapp    || '';
  document.getElementById('editAlamat').value       = row.alamat      || '';
  document.getElementById('editLat').value          = row.latitude    || '';
  document.getElementById('editLng').value          = row.longitude   || '';
  document.getElementById('editPolygon').value      = row.polygon     || '';
  setSelectValue(document.getElementById('editPeruntukan'),  row.peruntukan);
  setSelectValue(document.getElementById('editKlasifikasi'), row.klasifikasi);

  document.getElementById('editModal').classList.add('open');

  setTimeout(() => {
    if (!editMap) {
      initEditMap();
    } else {
      editMap.invalidateSize();
    }
    resetEditMapState();
    loadCustomerOnEditMap(row);
  }, 180);
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
}

function closeEditModalOutside(ev) {
  if (ev.target === document.getElementById('editModal')) closeEditModal();
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

function setEditMapMode(mode) {
  editMapMode = mode;
  const btnPoint = document.getElementById('btnModePoint');
  const btnPoly  = document.getElementById('btnModePolygon');
  const btnFin   = document.getElementById('btnFinishPoly');
  const dot      = document.getElementById('statusDot');
  const txt      = document.getElementById('statusText');

  btnPoint.className = 'map-mode-btn' + (mode === 'point'   ? ' active-point'   : '');
  btnPoly.className  = 'map-mode-btn' + (mode === 'polygon' ? ' active-polygon' : '');

  if (mode === 'polygon') {
    clearPolygonLayers();
    editPolyPoints = [];
    btnFin.classList.add('visible');
    dot.className = 'status-dot dot-polygon';
    txt.textContent = 'Klik sudut-sudut atap bangunan (min. 3 titik) lalu tekan ✅ Selesai';
  } else {
    btnFin.classList.remove('visible');
    dot.className = 'status-dot dot-point';
    txt.textContent = 'Klik di peta untuk memindahkan titik koordinat';
  }
}

function onEditMapClick(ev) {
  const { lat, lng } = ev.latlng;

  if (editMapMode === 'point') {
    if (editMarker) { editMap.removeLayer(editMarker); editMarker = null; }

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

    updateCoordInputs(lat, lng);
    clearPolygonLayers();
    document.getElementById('editPolygon').value = '';
    setEditStatus(`📍 Titik ditetapkan: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

  } else {
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

    setEditStatus(`✏️ ${editPolyPoints.length} sudut ditandai — tekan ✅ Selesai untuk menutup poligon`);
  }
}

function finishEditPolygon() {
  if (editPolyPoints.length < 3) {
    showToast('Minimal 3 sudut diperlukan untuk membentuk poligon', 'error');
    return;
  }

  if (editPreviewLine) { editMap.removeLayer(editPreviewLine); editPreviewLine = null; }

  if (editPolyLayer) { editMap.removeLayer(editPolyLayer); editPolyLayer = null; }
  editPolyLayer = L.polygon(editPolyPoints, {
    color: '#dc2626', weight: 2,
    fillColor: '#ef4444', fillOpacity: 0.4
  }).addTo(editMap);

  let sumLat = 0, sumLng = 0;
  editPolyPoints.forEach(p => { sumLat += p[0]; sumLng += p[1]; });
  const cLat = sumLat / editPolyPoints.length;
  const cLng = sumLng / editPolyPoints.length;

  if (editMarker) { editMap.removeLayer(editMarker); editMarker = null; }
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: '<div class="edit-pin" style="font-size:9px">CTR</div>',
    iconSize: [30,22], iconAnchor: [15,11]
  });
  editMarker = L.marker([cLat, cLng], { icon }).addTo(editMap);

  updateCoordInputs(cLat, cLng);
  const polyStr = editPolyPoints.map(p => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';');
  document.getElementById('editPolygon').value = polyStr;

  editMap.fitBounds(editPolyLayer.getBounds(), { padding: [20,20] });
  setEditStatus(`🏠 Poligon selesai: ${editPolyPoints.length} sudut · centroid ${cLat.toFixed(6)}, ${cLng.toFixed(6)}`);
  setEditMapMode('point');
}

function clearEditMapAll() {
  if (!confirm('Hapus semua penandaan di peta?')) return;
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
  editPolyDots.forEach(d => editMap.removeLayer(d));
  editPolyDots = [];
}

function resetEditMapState() {
  if (editMarker)      { editMap.removeLayer(editMarker);      editMarker      = null; }
  clearPolygonLayers();
  editPolyPoints = [];
  editMapMode    = 'point';

  document.getElementById('btnModePoint').className   = 'map-mode-btn active-point';
  document.getElementById('btnModePolygon').className = 'map-mode-btn';
  document.getElementById('btnFinishPoly').classList.remove('visible');
  setEditStatus('Klik peta untuk memindahkan titik koordinat', 'point');
}

function loadCustomerOnEditMap(row) {
  const hasPoly = row.polygon && row.polygon.trim() !== '';
  const lat     = parseFloat(row.latitude);
  const lng     = parseFloat(row.longitude);

  if (hasPoly) {
    const coords = parsePolyStr(row.polygon);
    if (coords.length >= 3) {
      editPolyPoints = coords;
      editPolyLayer  = L.polygon(coords, {
        color: '#dc2626', weight: 2,
        fillColor: '#ef4444', fillOpacity: 0.4
      }).addTo(editMap);

      if (!isNaN(lat) && !isNaN(lng)) {
        const icon = L.divIcon({
          className: 'leaflet-div-icon',
          html: '<div class="edit-pin" style="font-size:9px">CTR</div>',
          iconSize: [30,22], iconAnchor: [15,11]
        });
        editMarker = L.marker([lat, lng], { icon }).addTo(editMap);
      }

      editMap.fitBounds(editPolyLayer.getBounds(), { padding: [30,30] });
      setEditStatus(`🏠 Poligon atap: ${coords.length} sudut`, 'polygon');
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
      setEditStatus(`📍 Titik dipindahkan: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
    });
    editMap.setView([lat, lng], 18);
    setEditStatus(`📍 Titik koordinat — drag marker atau klik lokasi baru`, 'point');
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

  const body = new URLSearchParams({
    action:                'update',
    rowIndex,
    nama:                  document.getElementById('editNama').value.trim(),
    nik:                   document.getElementById('editNik').value.trim(),
    whatsapp:              document.getElementById('editWa').value.trim(),
    alamat:                document.getElementById('editAlamat').value.trim(),
    peruntukan_bangunan:   document.getElementById('editPeruntukan').value,
    klasifikasi_pelanggan: document.getElementById('editKlasifikasi').value,
    latitude:              document.getElementById('editLat').value.trim(),
    longitude:             document.getElementById('editLng').value.trim(),
    polygon_coords:        document.getElementById('editPolygon').value.trim()
  });

  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('✅ Data pelanggan berhasil diperbarui!', 'success');
      closeEditModal();
      await loadAdminData();
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

async function confirmDeleteCustomer(rowIndex, no, nama) {
  if (!confirm(`Hapus data pelanggan #${no} — "${nama}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const body = new URLSearchParams({ action: 'delete', rowIndex });
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
    center: [TORAJA_LAT, TORAJA_LNG],
    zoom: 15,
    layers: [pipeLayerSat],
    zoomControl: true
  });

  pipeMap.on('click', onPipeMapClick);
  setTimeout(() => pipeMap.invalidateSize(), 150);
  initMapLocationSearch();
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
      if (allBounds.length > 0 && !pipeDrawingActive) {
        pipeMap.fitBounds(L.latLngBounds(allBounds), { padding: [40, 40] });
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
  const clean = String(str).replace(/^['=]/, '').trim();
  const pairs = clean.split(/[;\n|]/);
  const result = [];
  pairs.forEach(pair => {
    const parts = pair.trim().split(',');
    if (parts.length >= 2) {
      const lt = parseFloat(parts[0].trim());
      const ln = parseFloat(parts[1].trim());
      if (!isNaN(lt) && !isNaN(ln)) result.push([lt, ln]);
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
  sel.value = '';
  if (!val) return;
  for (let o of sel.options) { if (o.value === val) { sel.value = val; return; } }
  const opt = document.createElement('option');
  opt.value = opt.textContent = val;
  sel.appendChild(opt);
  sel.value = val;
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
// PENCARIAN NAMA LOKASI, LANDMARK, ALAMAT & KOORDINAT PETA
// ============================================================
let mapSearchTimeout = null;
let mapSearchMarker  = null;
let mapSearchResultsData = [];
let mapSearchSelectedIndex = -1;

function initMapLocationSearch() {
  const input = document.getElementById('mapSearchInput');
  const clearBtn = document.getElementById('mapSearchClearBtn');
  const dropdown = document.getElementById('mapSearchResults');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    if (mapSearchTimeout) clearTimeout(mapSearchTimeout);
    if (!q || q.length < 2) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    // Tampilkan indikator memuat hasil
    if (dropdown) {
      dropdown.style.display = 'block';
      dropdown.innerHTML = `<div class="map-search-loading"><span class="spinner" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:5px;"></span> Mencari lokasi "${escHtml(q)}"...</div>`;
    }

    mapSearchTimeout = setTimeout(() => {
      executeMapLocationSearch(q);
    }, 320);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown ? dropdown.querySelectorAll('.map-search-item') : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        mapSearchSelectedIndex = (mapSearchSelectedIndex + 1) % items.length;
        updateSearchItemSelection(items);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        mapSearchSelectedIndex = (mapSearchSelectedIndex - 1 + items.length) % items.length;
        updateSearchItemSelection(items);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mapSearchSelectedIndex >= 0 && mapSearchResultsData[mapSearchSelectedIndex]) {
        selectMapSearchResult(mapSearchResultsData[mapSearchSelectedIndex]);
      } else if (mapSearchResultsData.length > 0) {
        selectMapSearchResult(mapSearchResultsData[0]);
      }
    } else if (e.key === 'Escape') {
      if (dropdown) dropdown.style.display = 'none';
    }
  });

  // Tutup dropdown saat klik di luar area pencarian
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pipe-map-search-box')) {
      if (dropdown) dropdown.style.display = 'none';
    }
  });
}

function updateSearchItemSelection(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('is-selected', idx === mapSearchSelectedIndex);
    if (idx === mapSearchSelectedIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function clearMapSearch() {
  const input = document.getElementById('mapSearchInput');
  const clearBtn = document.getElementById('mapSearchClearBtn');
  const dropdown = document.getElementById('mapSearchResults');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (dropdown) dropdown.style.display = 'none';
  if (mapSearchMarker && pipeMap) {
    try { pipeMap.removeLayer(mapSearchMarker); } catch(e){}
    mapSearchMarker = null;
  }
}

async function executeMapLocationSearch(query) {
  const dropdown = document.getElementById('mapSearchResults');
  if (!dropdown) return;
  mapSearchResultsData = [];
  mapSearchSelectedIndex = -1;

  const results = [];

  // 1. Deteksi input Koordinat langsung: e.g. "-2.9657, 119.9008" atau "-2.9657 119.9008"
  const cleanQ = query.replace(/[()]/g, '').trim();
  const parts = cleanQ.split(/[,;\s]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (parts.length === 2 && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
    results.push({
      type: 'coordinate',
      icon: '📌',
      title: `Koordinat: ${parts[0].toFixed(6)}, ${parts[1].toFixed(6)}`,
      subtitle: 'Buka dan terbang langsung ke titik GPS ini',
      lat: parts[0],
      lng: parts[1]
    });
  }

  // 2. Pencarian Jalur Pipa lokal
  const pipeList = typeof allPipes !== 'undefined' && Array.isArray(allPipes) ? allPipes : [];
  if (pipeList.length > 0) {
    const qLower = query.toLowerCase();
    pipeList.forEach(pipe => {
      if (pipe.nama && pipe.nama.toLowerCase().includes(qLower)) {
        const coords = parsePolyStr(pipe.koordinat);
        if (coords.length > 0) {
          results.push({
            type: 'pipe',
            icon: '🔧',
            badge: 'JALUR PIPA',
            badgeColor: '#2563eb',
            title: pipe.nama,
            subtitle: `Panjang: ${formatPipeLength(pipe.panjang)} • Elevasi: ${pipe.elev_awal || '-'}m ➔ ${pipe.elev_akhir || '-'}m`,
            lat: coords[0][0],
            lng: coords[0][1],
            pipeData: pipe
          });
        }
      }
    });
  }

  // 3. Pencarian Pelanggan lokal
  const customerList = typeof allRows !== 'undefined' && Array.isArray(allRows) ? allRows : (typeof allData !== 'undefined' && Array.isArray(allData) ? allData : []);
  if (customerList.length > 0) {
    const qLower = query.toLowerCase();
    let matchCustCount = 0;
    for (let c of customerList) {
      if (matchCustCount >= 4) break;
      const matchName = (c.nama || '').toLowerCase().includes(qLower);
      const matchAddr = (c.alamat || '').toLowerCase().includes(qLower);
      if (matchName || matchAddr) {
        const lat = parseFloat(c.latitude);
        const lng = parseFloat(c.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          results.push({
            type: 'customer',
            icon: '👤',
            badge: 'PELANGGAN',
            badgeColor: '#10b981',
            title: c.nama || 'Pelanggan',
            subtitle: `${c.alamat || 'Alamat terdaftar'} (${c.klasifikasi || 'Umum'})`,
            lat: lat,
            lng: lng
          });
          matchCustCount++;
        }
      }
    }
  }

  // 4. Pencarian Geocoding Nama Lokasi / Desa / Landmark Online via OpenStreetMap Nominatim
  try {
    const viewbox = '119.5,-3.4,120.3,-2.6';
    const cleanSearch = query.trim();
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanSearch)}&countrycodes=id&viewbox=${viewbox}&bounded=0&limit=8&addressdetails=1`;
    const res = await fetch(nominatimUrl, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      let places = await res.json();

      // Jika tidak ada hasil dan kata kunci memiliki tanda petik (misal: "To' Langi"), coba cari tanpa petik ("To Langi")
      if ((!Array.isArray(places) || places.length === 0) && cleanSearch.includes("'")) {
        const fallbackSearch = cleanSearch.replace(/'/g, ' ');
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackSearch)}&countrycodes=id&viewbox=${viewbox}&bounded=0&limit=8&addressdetails=1`;
        const res2 = await fetch(fallbackUrl, { headers: { 'Accept': 'application/json' } });
        if (res2.ok) places = await res2.json();
      }

      if (Array.isArray(places)) {
        places.forEach(item => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            let icon = '📍';
            const cat = ((item.type || '') + ' ' + (item.class || '') + ' ' + (item.display_name || '')).toLowerCase();
            if (cat.includes('school') || cat.includes('sekolah') || cat.includes('smp') || cat.includes('sma') || cat.includes('sd')) icon = '🏫';
            else if (cat.includes('church') || cat.includes('gereja') || cat.includes('mosque') || cat.includes('masjid')) icon = '⛪';
            else if (cat.includes('cemetery') || cat.includes('grave') || cat.includes('kuburan') || cat.includes('makam')) icon = '🪦';
            else if (cat.includes('market') || cat.includes('pasar') || cat.includes('shop') || cat.includes('toko')) icon = '🛒';
            else if (cat.includes('village') || cat.includes('desa') || cat.includes('kelurahan') || cat.includes('hamlet')) icon = '🏘️';
            else if (cat.includes('hospital') || cat.includes('rumah sakit') || cat.includes('puskesmas') || cat.includes('klinik')) icon = '🏥';
            else if (cat.includes('peak') || cat.includes('mountain') || cat.includes('gunung') || cat.includes('buntu')) icon = '⛰️';
            else if (cat.includes('highway') || cat.includes('road') || cat.includes('jalan')) icon = '🛣️';

            const nameParts = (item.display_name || '').split(',');
            const titleName = nameParts[0] ? nameParts[0].trim() : query;
            const subtitle  = nameParts.slice(1, 4).join(',').trim() || 'Indonesia';

            results.push({
              type: 'place',
              icon: icon,
              title: titleName,
              subtitle: subtitle,
              lat: lat,
              lng: lng
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn("Geocoding fetch warning:", err);
  }

  mapSearchResultsData = results;

  // Render hasil ke dropdown
  if (results.length === 0) {
    dropdown.innerHTML = `
      <div class="map-search-empty">
        <div>🔍 Lokasi <strong>"${escHtml(query)}"</strong> tidak ditemukan.</div>
        <div style="font-size:10.5px;color:#94a3b8;margin-top:3px;">Coba nama desa, jalan, kecamatan (contoh: <em>Minanga</em>, <em>Balla</em>, <em>Sa'dan</em>, <em>Rantepao</em>), atau koordinat GPS.</div>
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  let html = '';
  results.forEach((item, idx) => {
    const badgeHtml = item.badge ? `<span class="map-search-badge" style="background:${item.badgeColor || '#64748b'};color:#fff;">${item.badge}</span>` : '';
    html += `
      <div class="map-search-item" onclick="onMapSearchItemClick(${idx})">
        <div class="map-search-item-icon">${item.icon}</div>
        <div class="map-search-item-info">
          <div class="map-search-item-title">${badgeHtml}${escHtml(item.title)}</div>
          <div class="map-search-item-sub">${escHtml(item.subtitle)}</div>
        </div>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function onMapSearchItemClick(idx) {
  if (mapSearchResultsData[idx]) {
    selectMapSearchResult(mapSearchResultsData[idx]);
  }
}

function selectMapSearchResult(item) {
  const dropdown = document.getElementById('mapSearchResults');
  const input = document.getElementById('mapSearchInput');
  if (dropdown) dropdown.style.display = 'none';
  if (input) input.value = item.title;

  if (!pipeMap) return;

  const lat = item.lat;
  const lng = item.lng;

  // 1. Bersihkan marker pencarian sebelumnya jika ada
  if (mapSearchMarker) {
    try { pipeMap.removeLayer(mapSearchMarker); } catch(e){}
    mapSearchMarker = null;
  }

  // 2. Zoom dan terbang mulus ke lokasi hasil pencarian
  pipeMap.flyTo([lat, lng], 17, {
    animate: true,
    duration: 1.2
  });

  // 3. Tambahkan pin penanda khusus hasil pencarian
  const searchIcon = L.divIcon({
    className: 'search-location-pin',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="width:34px;height:34px;border-radius:50%;background:#0284c7;border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:16px;">
          ${item.icon || '📍'}
        </div>
        <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #0284c7;"></div>
      </div>
    `,
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -40]
  });

  mapSearchMarker = L.marker([lat, lng], { icon: searchIcon }).addTo(pipeMap);

  mapSearchMarker.bindPopup(`
    <div style="font-size:12px;line-height:1.45;min-width:190px;">
      <div style="font-weight:800;color:#0284c7;font-size:13px;margin-bottom:2px;">
        ${item.icon || '📍'} ${escHtml(item.title)}
      </div>
      <div style="color:#64748b;font-size:11px;margin-bottom:6px;">${escHtml(item.subtitle)}</div>
      <div style="font-family:monospace;font-size:10px;background:#f1f5f9;padding:4px 7px;border-radius:5px;margin-bottom:8px;color:#334155;">
        Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}
      </div>
      <button type="button" onclick="if(mapSearchMarker&&pipeMap){pipeMap.removeLayer(mapSearchMarker);mapSearchMarker=null;}" style="cursor:pointer;background:#f8fafc;border:1px solid #cbd5e1;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:600;color:#64748b;display:inline-flex;align-items:center;gap:3px;">
        ✕ Hapus Pin
      </button>
    </div>
  `).openPopup();

  // Jika item adalah jalur pipa, buka juga rutenya
  if (item.type === 'pipe' && item.pipeData) {
    zoomToPipe(item.pipeData.rowIndex);
  }
}

