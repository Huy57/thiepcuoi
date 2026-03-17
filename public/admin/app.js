const API_BASE = '/api';
let events = [];
let guestModal, eventModal, importModal;
let importType = '';   // 'guests' | 'rsvp' | 'wishes'
let importData = null; // parsed Excel rows

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    guestModal = new bootstrap.Modal(document.getElementById('guestModal'));
    eventModal = new bootstrap.Modal(document.getElementById('eventModal'));
    importModal = new bootstrap.Modal(document.getElementById('importModal'));

    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.target.closest('.nav-link').dataset.page;
            showPage(page);
        });
    });

    // Search
    document.getElementById('guest-search').addEventListener('input', debounce(loadGuests, 300));
    document.getElementById('rsvp-event-filter').addEventListener('change', loadRsvp);
    document.getElementById('rsvp-status-filter').addEventListener('change', loadRsvp);

    // Load initial data
    loadDashboard();
    loadEvents();
});

function showPage(page) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    switch(page) {
        case 'dashboard': loadDashboard(); break;
        case 'guests': loadGuests(); break;
        case 'rsvp': loadRsvp(); break;
        case 'wishes': loadWishes(); break;
        case 'events': loadEventsPage(); break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();
        
        if (!data.error) {
            const s = data.data.summary;
            document.getElementById('stat-guests').textContent = s.totalGuests;
            document.getElementById('stat-attending').textContent = s.attendingWithPlusOnes;
            document.getElementById('stat-pending').textContent = s.pending;
            document.getElementById('stat-wishes').textContent = s.approvedWishes;

            // Event stats
            let eventHtml = '';
            data.data.rsvpByEvent.forEach(e => {
                const total = e.attending + (e.plus_ones || 0);
                eventHtml += `
                    <tr>
                        <td>${e.name}</td>
                        <td><span class="badge bg-success">${e.attending}</span></td>
                        <td><span class="badge bg-info">${e.plus_ones || 0}</span></td>
                        <td><span class="badge bg-danger">${e.not_attending}</span></td>
                        <td><strong>${total}</strong></td>
                    </tr>
                `;
            });
            document.getElementById('event-stats-body').innerHTML = eventHtml;

            // Recent RSVP
            let rsvpHtml = '';
            data.data.recentRsvp.slice(0, 5).forEach(r => {
                const statusBadge = getStatusBadge(r.attendance_status);
                rsvpHtml += `
                    <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
                        <div>
                            <strong>${r.guest_name}</strong>
                            <small class="text-muted d-block">${r.event_name || ''}</small>
                        </div>
                        ${statusBadge}
                    </div>
                `;
            });
            document.getElementById('recent-rsvp').innerHTML = rsvpHtml || '<p class="text-muted">Chưa có xác nhận</p>';

            // Recent wishes
            let wishHtml = '';
            data.data.recentWishes.slice(0, 5).forEach(w => {
                wishHtml += `
                    <div class="mb-2 p-2 bg-light rounded">
                        <strong>${w.name}</strong>
                        <p class="mb-0 small">${w.content.substring(0, 100)}...</p>
                    </div>
                `;
            });
            document.getElementById('recent-wishes').innerHTML = wishHtml || '<p class="text-muted">Chưa có lời chúc</p>';
        }
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

// Guests
async function loadGuests() {
    try {
        const search = document.getElementById('guest-search').value;
        const url = search ? `${API_BASE}/guests?search=${encodeURIComponent(search)}` : `${API_BASE}/guests`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.error) {
            let html = '';
            data.data.forEach(g => {
                const eventNames = g.event_ids ? g.event_ids.split(',').map(id => {
                    const e = events.find(ev => ev.id === id);
                    return e ? e.name : id;
                }).join(', ') : '';
                
                html += `
                    <tr>
                        <td><span class="badge bg-secondary">${g.code}</span></td>
                        <td>${g.name}</td>
                        <td>${g.phone || '-'}</td>
                        <td>${g.email || '-'}</td>
                        <td><small>${eventNames || '-'}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" onclick="editGuest('${g.id}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteGuest('${g.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            document.getElementById('guests-body').innerHTML = html || '<tr><td colspan="6" class="text-center">Không có dữ liệu</td></tr>';
        }
    } catch (err) {
        console.error('Error loading guests:', err);
    }
}

function showGuestModal(guest = null) {
    document.getElementById('guestModalTitle').textContent = guest ? 'Sửa khách mời' : 'Thêm khách mời';
    document.getElementById('guest-id').value = guest ? guest.id : '';
    document.getElementById('guest-name').value = guest ? guest.name : '';
    document.getElementById('guest-phone').value = guest ? guest.phone : '';
    document.getElementById('guest-email').value = guest ? guest.email : '';
    document.getElementById('guest-notes').value = guest ? guest.notes : '';

    // Events checkboxes
    const guestEvents = guest ? (guest.event_ids || '').split(',') : [];
    let checkboxHtml = '';
    events.forEach(e => {
        const checked = guestEvents.includes(e.id) ? 'checked' : '';
        checkboxHtml += `
            <div class="form-check">
                <input class="form-check-input guest-event-cb" type="checkbox" value="${e.id}" id="ge-${e.id}" ${checked}>
                <label class="form-check-label" for="ge-${e.id}">${e.name}</label>
            </div>
        `;
    });
    document.getElementById('guest-events-checkboxes').innerHTML = checkboxHtml;

    guestModal.show();
}

async function editGuest(id) {
    const res = await fetch(`${API_BASE}/guests/${id}`);
    const data = await res.json();
    if (!data.error) {
        showGuestModal(data.data);
    }
}

async function saveGuest() {
    const id = document.getElementById('guest-id').value;
    const eventIds = Array.from(document.querySelectorAll('.guest-event-cb:checked')).map(cb => cb.value);
    
    const guestData = {
        name: document.getElementById('guest-name').value,
        phone: document.getElementById('guest-phone').value,
        email: document.getElementById('guest-email').value,
        event_ids: eventIds,
        notes: document.getElementById('guest-notes').value
    };

    const url = id ? `${API_BASE}/guests/${id}` : `${API_BASE}/guests`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestData)
    });

    const data = await res.json();
    if (!data.error) {
        guestModal.hide();
        loadGuests();
        alert(data.message);
    } else {
        alert(data.message);
    }
}

async function deleteGuest(id) {
    if (!confirm('Bạn có chắc muốn xóa khách mời này?')) return;
    
    const res = await fetch(`${API_BASE}/guests/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.error) {
        loadGuests();
    }
}

// RSVP
async function loadRsvp() {
    try {
        const eventId = document.getElementById('rsvp-event-filter').value;
        const status = document.getElementById('rsvp-status-filter').value;
        
        let url = `${API_BASE}/rsvp?`;
        if (eventId) url += `event_id=${eventId}&`;
        if (status !== '') url += `status=${status}`;

        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.error) {
            let html = '';
            data.data.forEach(r => {
                const statusBadge = getStatusBadge(r.attendance_status);
                const date = new Date(r.created_at).toLocaleDateString('vi-VN');
                
                html += `
                    <tr>
                        <td>${r.guest_name}</td>
                        <td>${r.guest_phone || '-'}</td>
                        <td>${r.event_name || '-'}</td>
                        <td>${statusBadge}</td>
                        <td>${r.plus_ones > 0 ? '+' + r.plus_ones : '-'}</td>
                        <td>${date}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteRsvp('${r.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            document.getElementById('rsvp-body').innerHTML = html || '<tr><td colspan="7" class="text-center">Không có dữ liệu</td></tr>';
        }
    } catch (err) {
        console.error('Error loading RSVP:', err);
    }
}

async function deleteRsvp(id) {
    if (!confirm('Bạn có chắc muốn xóa xác nhận này?')) return;
    
    const res = await fetch(`${API_BASE}/rsvp/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.error) {
        loadRsvp();
        loadDashboard();
    }
}

// Wishes
async function loadWishes() {
    try {
        const res = await fetch(`${API_BASE}/wishes?all=true`);
        const data = await res.json();
        
        if (!data.error) {
            let html = '';
            data.data.forEach(w => {
                const date = new Date(w.created_at).toLocaleDateString('vi-VN');
                const statusBadge = w.is_approved 
                    ? '<span class="badge bg-success">Hiển thị</span>'
                    : '<span class="badge bg-secondary">Ẩn</span>';
                
                html += `
                    <tr>
                        <td>
                            <strong>${w.name}</strong>
                            ${w.email ? `<small class="d-block text-muted">${w.email}</small>` : ''}
                        </td>
                        <td>${w.content}</td>
                        <td>${date}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-${w.is_approved ? 'warning' : 'success'}" onclick="toggleWish('${w.id}')">
                                <i class="bi bi-${w.is_approved ? 'eye-slash' : 'eye'}"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteWish('${w.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            document.getElementById('wishes-body').innerHTML = html || '<tr><td colspan="5" class="text-center">Không có dữ liệu</td></tr>';
        }
    } catch (err) {
        console.error('Error loading wishes:', err);
    }
}

async function toggleWish(id) {
    const res = await fetch(`${API_BASE}/wishes/${id}/approve`, { method: 'PATCH' });
    const data = await res.json();
    if (!data.error) {
        loadWishes();
    }
}

async function deleteWish(id) {
    if (!confirm('Bạn có chắc muốn xóa lời chúc này?')) return;
    
    const res = await fetch(`${API_BASE}/wishes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.error) {
        loadWishes();
    }
}

// Events
async function loadEvents() {
    try {
        const res = await fetch(`${API_BASE}/events`);
        const data = await res.json();
        
        if (!data.error) {
            events = data.data;
            
            // Update filter dropdowns
            let optionsHtml = '<option value="">Tất cả sự kiện</option>';
            events.forEach(e => {
                optionsHtml += `<option value="${e.id}">${e.name}</option>`;
            });
            document.getElementById('rsvp-event-filter').innerHTML = optionsHtml;
        }
    } catch (err) {
        console.error('Error loading events:', err);
    }
}

async function loadEventsPage() {
    await loadEvents();
    
    let html = '';
    events.forEach(e => {
        const date = e.event_date ? new Date(e.event_date).toLocaleDateString('vi-VN') : '';
        html += `
            <div class="col-md-6 mb-4">
                <div class="card shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">${e.name}</h5>
                        <p class="card-text text-muted">${e.description || ''}</p>
                        <p class="mb-1"><i class="bi bi-geo-alt"></i> ${e.location || '-'}</p>
                        <p class="mb-3"><i class="bi bi-calendar"></i> ${date} ${e.event_time || ''}</p>
                        <button class="btn btn-sm btn-outline-primary" onclick="editEvent('${e.id}')">
                            <i class="bi bi-pencil"></i> Sửa
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent('${e.id}')">
                            <i class="bi bi-trash"></i> Xóa
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    document.getElementById('events-container').innerHTML = html;
}

function showEventModal(event = null) {
    document.getElementById('eventModalTitle').textContent = event ? 'Sửa sự kiện' : 'Thêm sự kiện';
    document.getElementById('event-id').value = event ? event.id : '';
    document.getElementById('event-name').value = event ? event.name : '';
    document.getElementById('event-description').value = event ? event.description : '';
    document.getElementById('event-location').value = event ? event.location : '';
    document.getElementById('event-location-url').value = event ? event.location_url : '';
    document.getElementById('event-date').value = event ? event.event_date : '';
    document.getElementById('event-time').value = event ? event.event_time : '';
    document.getElementById('event-image-url').value = event ? (event.image_url || '') : '';
    eventModal.show();
}

async function editEvent(id) {
    const res = await fetch(`${API_BASE}/events/${id}`);
    const data = await res.json();
    if (!data.error) {
        showEventModal(data.data);
    }
}

async function saveEvent() {
    const id = document.getElementById('event-id').value;
    
    const eventData = {
        name: document.getElementById('event-name').value,
        description: document.getElementById('event-description').value,
        location: document.getElementById('event-location').value,
        location_url: document.getElementById('event-location-url').value,
        event_date: document.getElementById('event-date').value,
        event_time: document.getElementById('event-time').value,
        image_url: document.getElementById('event-image-url').value
    };

    const url = id ? `${API_BASE}/events/${id}` : `${API_BASE}/events`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });

    const data = await res.json();
    if (!data.error) {
        eventModal.hide();
        loadEventsPage();
        loadEvents();
        alert(data.message);
    } else {
        alert(data.message);
    }
}

async function deleteEvent(id) {
    if (!confirm('Bạn có chắc muốn xóa sự kiện này?')) return;
    
    const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.error) {
        loadEventsPage();
        loadEvents();
    }
}

// Helpers
function getStatusBadge(status) {
    switch(parseInt(status)) {
        case 1: return '<span class="badge bg-success">Sẽ tham dự</span>';
        case 2: return '<span class="badge bg-danger">Không tham dự</span>';
        default: return '<span class="badge bg-warning">Chưa xác định</span>';
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================
// Excel Export Functions
// ============================================

function getStatusText(status) {
    switch(parseInt(status)) {
        case 1: return 'Sẽ tham dự';
        case 2: return 'Không tham dự';
        default: return 'Chưa xác định';
    }
}

async function exportGuests() {
    try {
        const res = await fetch(`${API_BASE}/guests`);
        const data = await res.json();
        if (data.error || !data.data.length) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        const rows = data.data.map(g => {
            const eventNames = g.event_ids ? g.event_ids.split(',').map(id => {
                const e = events.find(ev => ev.id === id);
                return e ? e.name : id;
            }).join(', ') : '';
            return {
                'Mã khách': g.code || '',
                'Họ tên': g.name,
                'Số điện thoại': g.phone || '',
                'Email': g.email || '',
                'Sự kiện': eventNames,
                'Ghi chú': g.notes || '',
                'Ngày tạo': g.created_at ? new Date(g.created_at).toLocaleDateString('vi-VN') : ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 20 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Khách mời');
        XLSX.writeFile(wb, 'Khach_moi_' + new Date().toISOString().slice(0,10) + '.xlsx');
    } catch (err) {
        alert('Lỗi xuất Excel: ' + err.message);
    }
}

async function exportRsvp() {
    try {
        const eventId = document.getElementById('rsvp-event-filter').value;
        const status = document.getElementById('rsvp-status-filter').value;
        let url = `${API_BASE}/rsvp?`;
        if (eventId) url += `event_id=${eventId}&`;
        if (status !== '') url += `status=${status}&`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.error || !data.data.length) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        const rows = data.data.map(r => ({
            'Họ tên': r.guest_name,
            'Số điện thoại': r.guest_phone || '',
            'Email': r.guest_email || '',
            'Sự kiện': r.event_name || r.event_id || '',
            'Trạng thái': getStatusText(r.attendance_status),
            'Người đi cùng': r.plus_ones || 0,
            'Lời nhắn': r.message || '',
            'Xác nhận tự do': r.is_free_confirm ? 'Có' : 'Không',
            'Ngày xác nhận': r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Xác nhận tham dự');
        XLSX.writeFile(wb, 'Xac_nhan_tham_du_' + new Date().toISOString().slice(0,10) + '.xlsx');
    } catch (err) {
        alert('Lỗi xuất Excel: ' + err.message);
    }
}

async function exportWishes() {
    try {
        const res = await fetch(`${API_BASE}/wishes?all=true`);
        const data = await res.json();
        if (data.error || !data.data.length) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        const rows = data.data.map(w => ({
            'Người gửi': w.name,
            'Email': w.email || '',
            'Nội dung': w.content,
            'Trạng thái': w.is_approved ? 'Đã duyệt' : 'Chưa duyệt',
            'Ngày gửi': w.created_at ? new Date(w.created_at).toLocaleDateString('vi-VN') : ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 60 }, { wch: 12 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Lời chúc');
        XLSX.writeFile(wb, 'Loi_chuc_' + new Date().toISOString().slice(0,10) + '.xlsx');
    } catch (err) {
        alert('Lỗi xuất Excel: ' + err.message);
    }
}

// ============================================
// Excel Import Functions
// ============================================

const importTitles = {
    guests: 'Import Khách mời',
    rsvp: 'Import Xác nhận tham dự',
    wishes: 'Import Lời chúc'
};

function showImportModal(type) {
    importType = type;
    importData = null;
    document.getElementById('importModalTitle').textContent = importTitles[type] || 'Import dữ liệu';
    document.getElementById('import-file').value = '';
    document.getElementById('import-preview').classList.add('d-none');
    document.getElementById('import-error').classList.add('d-none');
    document.getElementById('import-confirm-btn').disabled = true;
    document.getElementById('mode-replace').checked = true;
    importModal.show();
}

function handleImportFile() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);

            if (rows.length === 0) {
                document.getElementById('import-error').textContent = 'File Excel không có dữ liệu';
                document.getElementById('import-error').classList.remove('d-none');
                document.getElementById('import-preview').classList.add('d-none');
                document.getElementById('import-confirm-btn').disabled = true;
                return;
            }

            importData = rows;
            const cols = Object.keys(rows[0]).join(', ');
            document.getElementById('import-preview-text').textContent =
                `Tìm thấy ${rows.length} dòng dữ liệu. Cột: ${cols}`;
            document.getElementById('import-preview').classList.remove('d-none');
            document.getElementById('import-error').classList.add('d-none');
            document.getElementById('import-confirm-btn').disabled = false;
        } catch (err) {
            document.getElementById('import-error').textContent = 'Lỗi đọc file: ' + err.message;
            document.getElementById('import-error').classList.remove('d-none');
            document.getElementById('import-confirm-btn').disabled = true;
        }
    };
    reader.readAsArrayBuffer(file);
}

async function confirmImport() {
    if (!importData || !importType) return;

    const mode = document.querySelector('input[name="importMode"]:checked').value;

    if (mode === 'replace') {
        if (!confirm('Chế độ GHI ĐÈ sẽ xóa toàn bộ dữ liệu cũ. Bạn có chắc chắn?')) return;
    }

    const btn = document.getElementById('import-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang import...';

    try {
        let mappedData;
        let url;

        if (importType === 'guests') {
            url = `${API_BASE}/guests/import`;
            mappedData = importData.map(row => ({
                name: row['Họ tên'] || row['name'] || '',
                phone: row['Số điện thoại'] || row['phone'] || '',
                email: row['Email'] || row['email'] || '',
                event_names: row['Sự kiện'] || row['event_names'] || '',
                notes: row['Ghi chú'] || row['notes'] || ''
            }));
        } else if (importType === 'rsvp') {
            url = `${API_BASE}/rsvp/import`;
            mappedData = importData.map(row => ({
                guest_name: row['Họ tên'] || row['guest_name'] || '',
                guest_phone: row['Số điện thoại'] || row['SĐT'] || row['guest_phone'] || '',
                guest_email: row['Email'] || row['guest_email'] || '',
                event_name: row['Sự kiện'] || row['event_name'] || '',
                attendance_status: row['Trạng thái'] || row['attendance_status'] || '',
                plus_ones: row['Người đi cùng'] || row['plus_ones'] || 0,
                message: row['Lời nhắn'] || row['message'] || ''
            }));
        } else if (importType === 'wishes') {
            url = `${API_BASE}/wishes/import`;
            mappedData = importData.map(row => ({
                name: row['Người gửi'] || row['name'] || '',
                email: row['Email'] || row['email'] || '',
                content: row['Nội dung'] || row['content'] || '',
                is_approved: row['Trạng thái'] || row['is_approved'] || 'Đã duyệt'
            }));
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, data: mappedData })
        });
        const result = await res.json();

        if (result.error) {
            alert('Lỗi: ' + result.message);
        } else {
            alert(result.message);
            importModal.hide();
            // Reload the corresponding page
            if (importType === 'guests') loadGuests();
            else if (importType === 'rsvp') loadRsvp();
            else if (importType === 'wishes') loadWishes();
            loadDashboard();
        }
    } catch (err) {
        alert('Lỗi import: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-upload"></i> Xác nhận Import';
    }
}
