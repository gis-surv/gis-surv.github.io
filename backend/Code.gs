
function getCustomerSheet(ss) {
  return ss.getSheetByName('Sheet1') || ss.getSheetByName('Calon Pelanggan') || ss.getSheets()[0];
}
/**
 * Google Apps Script - Web App Backend untuk Daftar Calon Pelanggan SPAM Landorundun Sesean Suloara'
 * PERUMDAM Amerta Toraya
 *
 * CARA MENGGUNAKAN:
 * 1. Buka Google Sheets baru: https://sheets.new
 * 2. Klik menu 'Ekstensi' > 'Apps Script'.
 * 3. Hapus kode default, lalu tempelkan kode di bawah ini.
 * 4. Klik tombol 'Deploy' > 'New deployment' > Jenis 'Web App'.
 * 5. Setel Execute as: Me | Who has access: Anyone  <-- PENTING!
 * 6. Salin URL dan tempelkan ke `js/config.js`.
 */

/* ================================================================
   ROUTING UTAMA
================================================================ */

function doPost(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'submit';
    if (action === 'login')           return handleLogin(e);
    if (action === 'update')          return handleUpdate(e);
    if (action === 'batch_shift')     return handleBatchShift(e);
    if (action === 'delete')          return handleDelete(e);
    if (action === 'save_pipe')       return handleSavePipe(e);
    if (action === 'update_pipe')     return handleUpdatePipe(e);
    if (action === 'delete_pipe')     return handleDeletePipe(e);
    if (action === 'save_facility')   return handleSaveFacility(e);
    if (action === 'delete_facility') return handleDeleteFacility(e);
    return handleSubmit(e);
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'get';
    if (action === 'get_pipes')      return handleGetPipes();
    if (action === 'get_facilities') return handleGetFacilities();
    return handleGetCustomers();
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/* ================================================================
   SUBMIT: Simpan data pendaftaran calon pelanggan baru
================================================================ */
function handleSubmit(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerSheet(ss);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'No', 'Latitude', 'Longitude', 'Nama Lengkap',
      'Nomor KTP / NIK', 'No. WhatsApp', 'Alamat Lengkap',
      'Peruntukan Bangunan', 'Klasifikasi Pelanggan', 'Koordinat Poligon Atap',
      'Sumber Data'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  } else {
    if (sheet.getRange(1, 10).getValue() === '') {
      sheet.getRange(1, 10).setValue('Koordinat Poligon Atap').setFontWeight('bold');
    }
    if (sheet.getRange(1, 11).getValue() === '') {
      sheet.getRange(1, 11).setValue('Sumber Data').setFontWeight('bold');
    }
  }

  var p          = e.parameter;
  var lat        = p.latitude        ? "'" + p.latitude        : '';
  var lng        = p.longitude       ? "'" + p.longitude       : '';
  var polygon    = p.polygon_coords  ? "'" + p.polygon_coords  : '';
  var nik        = p.nik             ? "'" + p.nik             : '';
  var wa         = p.whatsapp        ? "'" + p.whatsapp        : '';
  var sumberData = p.sumber_data     || p.petugas              || 'Surveyor';

  sheet.appendRow([
    '=ROW()-1', lat, lng, p.nama || '', nik, wa,
    p.alamat || '', p.peruntukan_bangunan || '', p.klasifikasi_pelanggan || '', polygon,
    sumberData
  ]);

  return jsonResponse({ status: 'success', message: 'Data pendaftaran berhasil disimpan ke sistem!' });
}

/* ================================================================
   LOGIN: Verifikasi Kredensial 100% dari Sheet "Admin" Spreadsheet
================================================================ */
function handleLogin(e) {
  var username = (e.parameter.username || '').toString().trim().toLowerCase();
  var password = (e.parameter.password || '').toString().trim();

  if (!username || !password) {
    return jsonResponse({ status: 'error', message: 'Username dan password wajib diisi.' });
  }

  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var adminSheet = ensureAdminSheet(ss);
  var data       = adminSheet.getDataRange().getValues();

  // Pencocokan langsung dengan baris-baris pada Sheet "Admin"
  // Kolom A (index 0) = Username
  // Kolom B (index 1) = Password
  // Kolom C (index 2) = Role (admin / survey / public)
  for (var i = 1; i < data.length; i++) {
    var u = data[i][0] ? data[i][0].toString().trim().toLowerCase() : '';
    var p = data[i][1] ? data[i][1].toString().trim() : '';
    var r = data[i][2] ? data[i][2].toString().trim().toLowerCase() : '';

    if (u === username && p === password) {
      var assignedRole = r || (username === 'admin' ? 'admin' : (username === 'survey' ? 'survey' : 'public'));
      return jsonResponse({
        status:  'success',
        message: 'Login berhasil',
        user:    username,
        role:    assignedRole
      });
    }
  }

  return jsonResponse({ status: 'error', message: 'Username atau password tidak cocok dengan data Sheet Admin.' });
}

/* ================================================================
   UPDATE PELANGGAN: Perbarui satu baris di Sheet 1
   Dengan validasi kepemilikan data (Ownership-Based Security)
   - Petugas survey hanya bisa mengedit data yang diinputnya sendiri
   - Admin berhak mengedit seluruh data
================================================================ */
function handleUpdate(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getCustomerSheet(ss);
  var rowIndex = parseInt(e.parameter.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2)
    return jsonResponse({ status: 'error', message: 'Row index tidak valid: ' + rowIndex });

  var p = e.parameter;
  var role          = (p.role || '').toString().trim().toLowerCase();
  var editorPetugas = (p.petugas_nama || p.sumber_data || '').toString().trim();

  // Validasi Kepemilikan Data:
  // Kolom 11 pada Sheet adalah "Sumber Data" / "Nama Petugas Surveyor"
  var existingPetugas = sheet.getRange(rowIndex, 11).getValue();
  existingPetugas = (existingPetugas !== undefined && existingPetugas !== null) ? existingPetugas.toString().trim() : '';

  // Jika bukan role 'admin', maka WAJIB mencocokkan nama petugas surveyor
  if (role !== 'admin') {
    if (!editorPetugas) {
      return jsonResponse({
        status: 'error',
        message: 'Identitas petugas surveyor wajib disertakan untuk memperbarui data.'
      });
    }
    if (existingPetugas && existingPetugas.toLowerCase() !== editorPetugas.toLowerCase()) {
      return jsonResponse({
        status: 'error',
        message: 'Akses Ditolak: Anda hanya diizinkan mengubah data yang Anda input sendiri. Data ini diinput oleh: "' + existingPetugas + '".'
      });
    }
  }

  var lat     = p.latitude        ? "'" + p.latitude        : '';
  var lng     = p.longitude       ? "'" + p.longitude       : '';
  var polygon = p.polygon_coords  ? "'" + p.polygon_coords  : '';
  var nik     = p.nik             ? "'" + p.nik             : '';
  var wa      = p.whatsapp        ? "'" + p.whatsapp        : '';

  sheet.getRange(rowIndex, 2).setValue(lat);
  sheet.getRange(rowIndex, 3).setValue(lng);
  sheet.getRange(rowIndex, 4).setValue(p.nama                  || '');
  sheet.getRange(rowIndex, 5).setValue(nik);
  sheet.getRange(rowIndex, 6).setValue(wa);
  sheet.getRange(rowIndex, 7).setValue(p.alamat                || '');
  sheet.getRange(rowIndex, 8).setValue(p.peruntukan_bangunan   || '');
  sheet.getRange(rowIndex, 9).setValue(p.klasifikasi_pelanggan || '');
  sheet.getRange(rowIndex, 10).setValue(polygon);

  // Jika admin mengubah nama petugas/sumber_data, izinkan admin memperbarui kolom 11.
  // Jika role surveyor, pertahankan nama petugas aslinya agar tidak dialihkan.
  if (role === 'admin' && p.sumber_data !== undefined) {
    sheet.getRange(rowIndex, 11).setValue(p.sumber_data || '');
  }

  return jsonResponse({ status: 'success', message: 'Data berhasil diperbarui' });
}

/* ================================================================
   BATCH SHIFT PELANGGAN: Pergeseran koordinat massal / kelompok (Hanya Admin)
   Menjaga kolom 11 (nama petugas survey) 100% utuh tanpa perubahan!
================================================================ */
function handleBatchShift(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerSheet(ss);
  var role  = (e.parameter.role || '').toString().trim().toLowerCase();
  if (role !== 'admin') {
    return jsonResponse({ status: 'error', message: 'Akses Ditolak: Hanya Administrator yang berhak melakukan pergeseran massal.' });
  }

  var updatesJson = e.parameter.updates;
  if (!updatesJson) {
    return jsonResponse({ status: 'error', message: 'Parameter updates kosong.' });
  }

  try {
    var updates = JSON.parse(updatesJson);
    if (!Array.isArray(updates) || updates.length === 0) {
      return jsonResponse({ status: 'error', message: 'Daftar pembaruan kosong.' });
    }

    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      var r = parseInt(u.rowIndex);
      if (!isNaN(r) && r >= 2) {
        if (u.latitude !== undefined && u.latitude !== null && u.latitude !== '') {
          sheet.getRange(r, 2).setValue("'" + u.latitude);
        }
        if (u.longitude !== undefined && u.longitude !== null && u.longitude !== '') {
          sheet.getRange(r, 3).setValue("'" + u.longitude);
        }
        if (u.polygon !== undefined && u.polygon !== null && u.polygon !== '') {
          sheet.getRange(r, 10).setValue("'" + u.polygon);
        }
        // Kolom 11 (Petugas Survey / Sumber Data) SENGAJA TIDAK DISENTUH
      }
    }

    return jsonResponse({
      status: 'success',
      message: updates.length + ' data pelanggan berhasil digeser dan disimpan ke Sheet.'
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Gagal memproses batch shift: ' + err.toString() });
  }
}

/* ================================================================
   DELETE PELANGGAN: Hapus satu baris di Sheet 1 (Hanya Admin)
================================================================ */
function handleDelete(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getCustomerSheet(ss);
  var rowIndex = parseInt(e.parameter.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2)
    return jsonResponse({ status: 'error', message: 'Row index tidak valid: ' + rowIndex });

  var role = (e.parameter.role || '').toString().trim().toLowerCase();
  if (role !== 'admin') {
    return jsonResponse({ status: 'error', message: 'Akses Ditolak: Hanya Administrator yang berhak menghapus data pelanggan.' });
  }

  sheet.deleteRow(rowIndex);
  return jsonResponse({ status: 'success', message: 'Data berhasil dihapus' });
}

/* ================================================================
   GET PELANGGAN: Kembalikan semua data pelanggan
================================================================ */
function handleGetCustomers() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerSheet(ss);

  if (sheet.getLastRow() >= 1) {
    if (sheet.getRange(1, 10).getValue() === '') {
      sheet.getRange(1, 10).setValue('Koordinat Poligon Atap').setFontWeight('bold');
    }
    if (sheet.getRange(1, 11).getValue() === '') {
      sheet.getRange(1, 11).setValue('Sumber Data').setFontWeight('bold');
    }
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse({ status: 'success', total: 0, data: [] });

  var headers = data[0];
  var colMap  = { lat:1, lng:2, nama:3, nik:4, whatsapp:5, alamat:6, peruntukan:7, klasifikasi:8, polygon:9, sumber:10 };

  for (var c = 0; c < headers.length; c++) {
    var h = headers[c] ? headers[c].toString().trim().toLowerCase() : '';
    if      (h.includes('lat'))                           colMap.lat        = c;
    else if (h.includes('long') || h.includes('lng'))     colMap.lng        = c;
    else if (h.includes('nama'))                          colMap.nama       = c;
    else if (h.includes('ktp')  || h.includes('nik'))     colMap.nik        = c;
    else if (h.includes('wa')   || h.includes('what'))    colMap.whatsapp   = c;
    else if (h.includes('alamat'))                        colMap.alamat     = c;
    else if (h.includes('peruntukan'))                    colMap.peruntukan = c;
    else if (h.includes('klasifikasi'))                   colMap.klasifikasi= c;
    else if (h.includes('poligon')||h.includes('polygon')||h.includes('atap')) colMap.polygon = c;
    else if (h.includes('sumber') || h.includes('petugas') || h.includes('paraf')) colMap.sumber = c;
  }

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[colMap.nama] || r[colMap.lat] || r[colMap.whatsapp]) {
      var rawLat = r[colMap.lat] !== undefined ? r[colMap.lat].toString().replace(/^'/,'').trim().replace(',','.') : '';
      var rawLng = r[colMap.lng] !== undefined ? r[colMap.lng].toString().replace(/^'/,'').trim().replace(',','.') : '';
      var nLat = parseFloat(rawLat);
      if (!isNaN(nLat) && !rawLat.includes('.') && Math.abs(nLat) > 1000) rawLat = (nLat/1000000).toFixed(6);
      var nLng = parseFloat(rawLng);
      if (!isNaN(nLng) && !rawLng.includes('.') && Math.abs(nLng) > 1000) rawLng = (nLng/1000000).toFixed(6);
      var rawPoly = (r[colMap.polygon] !== undefined && r[colMap.polygon] !== null)
        ? r[colMap.polygon].toString().replace(/^'/,'').trim() : '';
      var rawSumber = (colMap.sumber !== undefined && r[colMap.sumber] !== undefined && r[colMap.sumber] !== null)
        ? r[colMap.sumber].toString().replace(/^'/,'').trim() : '';

      rows.push({
        no: i, rowIndex: i + 1,
        latitude: rawLat, longitude: rawLng, polygon: rawPoly,
        nama:        r[colMap.nama]        || '',
        nik:         (r[colMap.nik]        || '').toString().replace(/^'/,''),
        whatsapp:    (r[colMap.whatsapp]   || '').toString().replace(/^'/,''),
        alamat:      r[colMap.alamat]      || '',
        peruntukan:  r[colMap.peruntukan]  || '',
        klasifikasi: r[colMap.klasifikasi] || '',
        sumber:      rawSumber || 'Surveyor'
      });
    }
  }

  return jsonResponse({ status: 'success', total: rows.length, data: rows });
}

/* ================================================================
   SAVE PIPE: Simpan jalur pipa baru ke Sheet 3 ("Pipa")
================================================================ */
function handleSavePipe(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensurePipeSheet(ss);
  var p     = e.parameter;

  // Beri tanda petik ' di depan nilai numerik / koordinat agar tidak kena formula error
  var cleanCoord = p.koordinat ? p.koordinat.toString().trim().replace(/^['=]/, '') : '';
  var safeCoord  = cleanCoord ? "'" + cleanCoord : '';

  var diameter   = p.diameter   ? "'" + p.diameter   : '';
  var elevAwal   = p.elev_awal  ? "'" + p.elev_awal  : '';
  var elevAkhir  = p.elev_akhir ? "'" + p.elev_akhir : '';
  var deltaH     = p.delta_h    ? "'" + p.delta_h    : '';
  var slope      = p.slope      ? "'" + p.slope      : '';

  sheet.appendRow([
    '=ROW()-1',                                    // 1. ID
    p.nama           || 'Jalur Pipa',              // 2. Nama Jalur
    diameter,                                      // 3. Diameter (inch)
    p.panjang        || '0',                       // 4. Panjang (m)
    p.titik_awal     || '',                        // 5. Titik Awal (Lat, Lng)
    elevAwal,                                      // 6. Elevasi Awal (mdpl)
    p.titik_akhir    || '',                        // 7. Titik Akhir (Lat, Lng)
    elevAkhir,                                     // 8. Elevasi Akhir (mdpl)
    deltaH,                                        // 9. Beda Tinggi / ΔH (m)
    slope,                                         // 10. Kemiringan (Slope %)
    safeCoord,                                     // 11. Seluruh Koordinat Jalur
    p.warna          || '#2563eb'                  // 12. Warna Simbol Jalur
  ]);

  return jsonResponse({ status: 'success', message: 'Data jalur pipa berhasil disimpan ke Sheet 3!' });
}

/* ================================================================
   UPDATE PIPE: Perbarui properti jalur pipa di Sheet 3
================================================================ */
function handleUpdatePipe(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = ensurePipeSheet(ss);
  var rowIndex = parseInt(e.parameter.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2)
    return jsonResponse({ status: 'error', message: 'Row index tidak valid' });

  var p = e.parameter;
  sheet.getRange(rowIndex, 2).setValue(p.nama     || '');
  sheet.getRange(rowIndex, 3).setValue(p.diameter ? "'" + p.diameter : '');
  if (p.warna) sheet.getRange(rowIndex, 12).setValue(p.warna);

  return jsonResponse({ status: 'success', message: 'Jalur pipa berhasil diperbarui' });
}

/* ================================================================
   DELETE PIPE: Hapus satu baris jalur pipa dari Sheet 3
================================================================ */
function handleDeletePipe(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = ensurePipeSheet(ss);
  var rowIndex = parseInt(e.parameter.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2)
    return jsonResponse({ status: 'error', message: 'Row index tidak valid' });

  sheet.deleteRow(rowIndex);
  return jsonResponse({ status: 'success', message: 'Jalur pipa berhasil dihapus' });
}

/* ================================================================
   GET PIPES: Kembalikan semua data jalur pipa dari Sheet 3
================================================================ */
function handleGetPipes() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensurePipeSheet(ss);
  var data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return jsonResponse({ status: 'success', total: 0, pipes: [] });

  var pipes = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];

    // 1. Temukan cell koordinat rute pipa di seluruh kolom baris ini
    var foundCoord = '';
    for (var c = 0; c < r.length; c++) {
      var val = r[c] ? r[c].toString().trim() : '';
      if (val.indexOf(';') !== -1 && val.indexOf(',') !== -1 && val.length > 20) {
        foundCoord = val.replace(/^['=]/, '').trim();
        break;
      }
    }

    var namaVal  = (r[1] ? r[1].toString().trim() : '') || ('Jalur Pipa ' + i);
    var diaVal   = r[2] ? r[2].toString().replace(/^'/, '').trim() : '';
    var lenVal   = r[3] ? r[3].toString().replace(/^'/, '').trim() : '0';
    var tAwal    = r[4] ? r[4].toString().trim() : '';
    var elAwal   = r[5] ? r[5].toString().replace(/^'/, '').trim() : '';
    var tAkhir   = r[6] ? r[6].toString().trim() : '';
    var elAkhir  = r[7] ? r[7].toString().replace(/^'/, '').trim() : '';
    var dH       = r[8] ? r[8].toString().replace(/^'/, '').trim() : '';
    var slp      = r[9] ? r[9].toString().replace(/^'/, '').trim() : '';
    var coordVal = foundCoord || (r[10] ? r[10].toString().replace(/^['=]/, '').trim() : '');
    var warna    = (r[11] ? r[11].toString().trim() : '') || '#2563eb';

    // 2. Koreksi cerdas jika data kolom tergeser oleh spreadsheet
    if (coordVal) {
      var pairs = coordVal.split(';');
      if (pairs.length >= 2) {
        if (!tAwal || tAwal.indexOf(',') === -1)   tAwal  = pairs[0].trim();
        if (!tAkhir || tAkhir.indexOf(',') === -1) tAkhir = pairs[pairs.length - 1].trim();
      }

      // Bersihkan jika elevasi tertukar dengan koordinat
      if (elAkhir.indexOf(';') !== -1 || elAkhir.length > 20) elAkhir = '';
      if (elAwal.indexOf(';') !== -1  || elAwal.length > 20)  elAwal  = '';

      // Kasus: kolom diameter berisi panjang (misal 1321) dan kolom panjang '0'
      if ((lenVal === '0' || !lenVal) && parseFloat(diaVal) > 40) {
        lenVal = diaVal;
        diaVal = '';
      }

      // Kasus: kolom 4 berisi elevasi awal (misal 789)
      if (r[4] && r[4].toString().indexOf(',') === -1 && !isNaN(parseFloat(r[4]))) {
        if (parseFloat(r[4]) > 100) elAwal = r[4].toString();
      }

      // Kasus: kolom 5 berisi delta H (misal -11)
      if (r[5] && !isNaN(parseFloat(r[5])) && parseFloat(r[5]) < 100 && parseFloat(r[5]) > -100) {
        dH = r[5].toString();
      }

      // Kasus: kolom 6 berisi slope (misal 0.83)
      if (r[6] && r[6].toString().indexOf(',') === -1 && !isNaN(parseFloat(r[6]))) {
        slp = r[6].toString();
      }

      // Hitung elevasi akhir otomatis jika ada elevAwal dan deltaH
      if (elAwal && dH && !elAkhir) {
        elAkhir = (parseFloat(elAwal) + parseFloat(dH)).toFixed(1);
      }
    }

    if (namaVal || coordVal || lenVal !== '0') {
      pipes.push({
        id:          i,
        rowIndex:    i + 1,
        nama:        namaVal,
        diameter:    diaVal,
        panjang:     lenVal,
        titik_awal:  tAwal,
        elev_awal:   elAwal,
        titik_akhir: tAkhir,
        elev_akhir:  elAkhir,
        delta_h:     dH,
        slope:       slp,
        koordinat:   coordVal,
        warna:       warna
      });
    }
  }

  return jsonResponse({ status: 'success', total: pipes.length, pipes: pipes });
}

/* ================================================================
   HELPERS
================================================================ */

function ensureAdminSheet(ss) {
  var sheet = ss.getSheetByName('Admin');
  if (!sheet) {
    sheet = ss.insertSheet('Admin');
    sheet.appendRow(['Username', 'Password', 'Role']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  } else {
    // Pastikan header kolom C berisi 'Role'
    if (sheet.getRange(1, 3).getValue() === '') {
      sheet.getRange(1, 3).setValue('Role').setFontWeight('bold');
    }
  }

  // Periksa apakah user default sudah ada, jika belum ada otomatis ditambahkan
  var data = sheet.getDataRange().getValues();
  var existingUsers = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      existingUsers.push(data[i][0].toString().trim().toLowerCase());
    }
  }

  if (existingUsers.indexOf('admin') === -1) {
    sheet.appendRow(['admin',  '@bathosai88', 'admin']);
  }
  if (existingUsers.indexOf('survey') === -1) {
    sheet.appendRow(['survey', 'surv123',     'survey']);
  }
  if (existingUsers.indexOf('public') === -1) {
    sheet.appendRow(['public', 'radar31',     'public']);
  }

  return sheet;
}

function ensurePipeSheet(ss) {
  // 1. Cek sheet berdasarkan nama Sheet3, Sheet 3, Pipa, dsb
  var sheet = ss.getSheetByName('Sheet3') ||
              ss.getSheetByName('Sheet 3') ||
              ss.getSheetByName('sheet3') ||
              ss.getSheetByName('Pipa') ||
              ss.getSheetByName('pipa');

  // 2. Jika tidak ditemukan lewat nama, periksa apakah ada sheet urutan ke-3 (index 2)
  if (!sheet) {
    var allSheets = ss.getSheets();
    if (allSheets.length >= 3) {
      sheet = allSheets[2]; // Tab urutan ke-3 di spreadsheet
    }
  }

  // 3. Jika tetap belum ada (total sheet < 3), buat sheet baru bernama 'Sheet3'
  if (!sheet) {
    sheet = ss.insertSheet('Sheet3');
    sheet.appendRow([
      'ID',
      'Nama Jalur',
      'Diameter (inch)',
      'Panjang (m)',
      'Titik Awal (Lat, Lng)',
      'Elevasi Awal (mdpl)',
      'Titik Akhir (Lat, Lng)',
      'Elevasi Akhir (mdpl)',
      'Beda Tinggi (ΔH m)',
      'Slope (%)',
      'Koordinat Jalur',
      'Warna Jalur'
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  return sheet;
}

/* ================================================================
   FASILITAS / BANGUNAN PENGOLAHAN (IPA / RESERVOIR / INTAKE)
   Sheet 4: Terpisah dari Calon Pelanggan & Jaringan Pipa
================================================================ */

function handleSaveFacility(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureFacilitySheet(ss);
  var p     = e.parameter;

  var cleanCoord = p.koordinat ? p.koordinat.toString().trim().replace(/^['=]/, '') : '';
  var safeCoord  = cleanCoord ? "'" + cleanCoord : '';
  var now        = new Date();

  var rowData = [
    '=ROW()-1',                                    // 1. ID
    p.nama           || 'Bangunan Pengolahan Air', // 2. Nama Fasilitas
    p.kategori       || 'Instalasi Pengolahan Air (IPA)', // 3. Kategori
    p.luas_m2        || '0',                       // 4. Luas Area (m²)
    p.kapasitas      || '-',                       // 5. Kapasitas / Debit
    p.titik_pusat    || '',                        // 6. Titik Pusat (Lat, Lng)
    safeCoord,                                     // 7. Koordinat Poligon Area
    p.warna          || '#16a34a',                 // 8. Warna Simbol
    p.status         || 'Rencana',                 // 9. Status
    p.catatan        || '',                        // 10. Catatan
    now.toLocaleString('id-ID')                    // 11. Waktu Simpan
  ];

  var rowIndex = parseInt(p.rowIndex);
  if (!isNaN(rowIndex) && rowIndex >= 2) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    return jsonResponse({ status: 'success', message: 'Data fasilitas berhasil diperbarui!' });
  } else {
    sheet.appendRow(rowData);
    return jsonResponse({ status: 'success', message: 'Bangunan pengolahan / fasilitas berhasil disimpan ke Sheet Fasilitas!' });
  }
}

function handleDeleteFacility(e) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = ensureFacilitySheet(ss);
  var rowIndex = parseInt(e.parameter.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2)
    return jsonResponse({ status: 'error', message: 'Row index tidak valid' });

  sheet.deleteRow(rowIndex);
  return jsonResponse({ status: 'success', message: 'Fasilitas berhasil dihapus' });
}

function handleGetFacilities() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureFacilitySheet(ss);
  var data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return jsonResponse({ status: 'success', total: 0, facilities: [] });

  var facilities = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[1] || r[6] || r[5]) {
      var coordVal = (r[6] ? r[6].toString().replace(/^['=]/, '').trim() : '');
      facilities.push({
        id:          i,
        rowIndex:    i + 1,
        nama:        r[1] ? r[1].toString().trim() : ('Fasilitas ' + i),
        kategori:    r[2] ? r[2].toString().trim() : 'Instalasi Pengolahan Air (IPA)',
        luas_m2:     r[3] ? r[3].toString().replace(/^'/, '').trim() : '0',
        kapasitas:   r[4] ? r[4].toString().trim() : '-',
        titik_pusat: r[5] ? r[5].toString().trim() : '',
        koordinat:   coordVal,
        warna:       (r[7] ? r[7].toString().trim() : '') || '#16a34a',
        status:      r[8] ? r[8].toString().trim() : 'Rencana',
        catatan:     r[9] ? r[9].toString().trim() : '',
        waktu:       r[10] ? r[10].toString().trim() : ''
      });
    }
  }

  return jsonResponse({ status: 'success', total: facilities.length, facilities: facilities });
}

function ensureFacilitySheet(ss) {
  var sheet = ss.getSheetByName('Fasilitas') ||
              ss.getSheetByName('fasilitas') ||
              ss.getSheetByName('Bangunan Pengolahan') ||
              ss.getSheetByName('IPA');

  if (!sheet) {
    sheet = ss.insertSheet('Fasilitas');
    sheet.appendRow([
      'ID',
      'Nama Fasilitas',
      'Kategori',
      'Luas Area (m²)',
      'Kapasitas / Debit',
      'Titik Pusat (Lat, Lng)',
      'Koordinat Poligon',
      'Warna Simbol',
      'Status',
      'Catatan',
      'Waktu Simpan'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
