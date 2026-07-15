(function () {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = {
    students: [], bookings: [], groups: [], tracks: [], payments: [], materials: [],
    exams: [], examAttempts: [], reviews: [], services: [], onlineLectures: [],
    assignments: [], homeworkSubmissions: [], classProgress: [], practicalTasks: [],
    practicalSubmissions: [], grades: [], staff: [], activityLog: [], clientErrors: [], settings: {}, dashboard: null
  };
  let modalType = null;
  let modalItem = null;
  let scanner = null;
  let searchTimer = null;
  let modalReturnFocus = null;
  let activeSection = 'overview';
  let staffProfile = null;
  const loadedSections = new Set();
  const sectionRequests = new Map();
  const cursors = {};
  const collectionStateKey = {
    class_progress: 'classProgress', homework_submissions: 'homeworkSubmissions',
    exam_attempts: 'examAttempts', practical_tasks: 'practicalTasks',
    practical_submissions: 'practicalSubmissions', activityLog: 'activityLog', client_errors: 'clientErrors',
    onlineLectures: 'onlineLectures'
  };
  const sectionCollections = {
    bookings: [['bookings', 50], ['groups', 100], ['tracks', 100]],
    students: [['students', 50], ['groups', 100], ['tracks', 100], ['class_progress', 200], ['exam_attempts', 100]],
    tracks: [['tracks', 100], ['groups', 100]],
    groups: [['groups', 100], ['tracks', 100]],
    online: [['onlineLectures', 50], ['groups', 100], ['tracks', 100]],
    attendance: [['class_progress', 100], ['students', 50], ['groups', 100], ['tracks', 100]],
    progress: [['class_progress', 100], ['students', 50], ['groups', 100], ['tracks', 100]],
    homeworks: [['assignments', 50], ['homework_submissions', 50], ['students', 50], ['groups', 100], ['tracks', 100]],
    practical: [['practical_tasks', 50], ['practical_submissions', 50], ['students', 50], ['groups', 100], ['tracks', 100]],
    payments: [['students', 50], ['payments', 100], ['groups', 100], ['tracks', 100]],
    materials: [['materials', 50], ['groups', 100], ['tracks', 100]],
    exams: [['exams', 50], ['exam_attempts', 50], ['groups', 100], ['tracks', 100]],
    grades: [['grades', 50], ['students', 50], ['groups', 100], ['tracks', 100]],
    services: [['services', 50]], reviews: [['reviews', 50]],
    activity: [['activityLog', 80]], errors: [['client_errors', 80]], settings: [['settings', 20]],
    leaderboard: [['tracks', 100]]
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const text = (value, length = 80) => String(value || '').length > length ? `${String(value).slice(0, length)}…` : String(value || '');
  const codeOf = student => String(student?.studentCode || student?.code || student?.id || '');
  const trackOf = item => String(item?.track || item?.grade || '');
  const statusBadge = status => { const s = String(status || '-'); const good = ['approved', 'active', 'open', 'paid', 'exempt', 'تم الدفع', 'منشور', 'حاضر', 'graded'].includes(s); const bad = ['rejected', 'closed', 'unpaid', 'late', 'مرفوض', 'غائب'].includes(s); return `<span class="badge ${good ? 'good' : bad ? 'danger' : 'warn'}">${escapeHtml(arabicStatus(s))}</span>`; };
  const emptyRow = (cols, message = 'لا توجد بيانات بعد.') => `<tr><td colspan="${cols}" class="muted-cell">${message}</td></tr>`;
  const nowDate = () => new Date().toISOString().slice(0, 10);
  const sessionKey = (date, title) => { let hash = 2166136261; for (const char of String(title)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); } return `${date}-${(hash >>> 0).toString(36)}`; };
  const formatDate = value => { if (!value) return '-'; const date = value?.toDate?.() || new Date(value); return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ar-EG'); };
  const formatTime = value => { if (!value) return '-'; const date = value?.toDate?.() || new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }); };

  function arabicStatus(value) {
    return ({ pending: 'بانتظار الموافقة', approved: 'مقبول', rejected: 'مرفوض', active: 'نشط', open: 'متاحة', closed: 'مغلقة', paid: 'تم الدفع', partial: 'دفع جزئي', unpaid: 'لم يدفع', exempt: 'معفي', late: 'متأخر', needs_changes: 'يحتاج تعديل', submitted: 'بانتظار التصحيح', graded: 'تم التصحيح' })[value] || value;
  }

  function toastError(error, fallback = 'تعذر تنفيذ العملية.') {
    window.toast?.(error?.message || fallback);
    window.MFCloud?.reportClientError?.({ page: 'admin.html', action: modalType || 'admin', code: error?.code || '', message: error?.message || fallback }).catch(() => {});
  }

  function allTracks() {
    const dynamic = [...state.tracks.map(item => item.name), ...state.groups.map(trackOf), ...state.students.map(trackOf)].filter(Boolean);
    return [...new Set(dynamic.length ? dynamic : (window.GRADES || []))];
  }

  async function withRetry(operation) {
    try { return await operation(); }
    catch (error) {
      if (!/unavailable|deadline-exceeded|internal/.test(String(error?.code || ''))) throw error;
      await new Promise(resolve => setTimeout(resolve, 450));
      return operation();
    }
  }

  async function busy(button, operation) {
    if (button?.disabled) return;
    const old = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = 'جارٍ الحفظ...'; }
    try { return await withRetry(operation); }
    finally { if (button) { button.disabled = false; button.innerHTML = old; } }
  }

  async function requireAdminSession() {
    if (!window.MFCloud?.ready) throw new Error('Firebase غير متاح.');
    return new Promise((resolve, reject) => {
      let stop = () => {};
      stop = window.MFCloud.onAuthStateChanged(async user => {
        stop?.();
        if (!user) return reject(new Error('انتهت جلسة الدخول.'));
        const profile = await window.MFCloud.getCurrentStaffProfile();
        if (!profile?.allowed) return reject(new Error('غير مصرح لهذا الحساب بدخول لوحة الإدارة.'));
        resolve(profile);
      });
    });
  }

  function showSectionLoading(name, loading) {
    const section = $(`#tab-${name}`); if (!section) return;
    section.classList.toggle('is-loading', loading);
    section.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  async function loadCollection(collection, limit = 50, append = false) {
    const key = collectionStateKey[collection] || collection;
    const result = await window.MFCloud.listAdminRecords({ collection, limit, cursor: append ? cursors[collection] : null });
    const rows = result.rows || [];
    state[key] = append ? [...state[key], ...rows.filter(row => !state[key].some(old => old.id === row.id))] : rows;
    cursors[collection] = result.nextCursor || null;
    return rows;
  }

  async function loadOverview() {
    state.dashboard = await window.MFCloud.getAdminDashboard();
  }

  async function loadSection(name = activeSection, force = false) {
    activeSection = name;
    if (!force && loadedSections.has(name)) { render(); return; }
    const requestId = (sectionRequests.get(name) || 0) + 1;
    sectionRequests.set(name, requestId);
    showSectionLoading(name, true);
    try {
      if (name === 'overview') await loadOverview();
      else if (name === 'staff') state.staff = (await window.MFCloud.listStaffAccounts()).rows || [];
      else await Promise.all((sectionCollections[name] || []).map(([collection, limit]) => loadCollection(collection, limit)));
      if (sectionRequests.get(name) !== requestId) return;
      loadedSections.add(name);
      render();
    } finally { if (sectionRequests.get(name) === requestId) showSectionLoading(name, false); }
  }

  async function load() {
    loadedSections.delete(activeSection);
    return loadSection(activeSection, true);
  }

  function bindServerSearch(inputId, collection, stateKey, statusId) {
    const input = $(`#${inputId}`); if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const term = input.value.trim(); const status = $(`#${statusId}`);
        try {
          if (!term) { if (status) status.textContent = ''; await load(); return; }
          if (status) status.textContent = 'جارٍ البحث على السيرفر...';
          const result = await window.MFCloud.searchAdminRecords({ collection, term });
          state[stateKey] = result.rows || []; render();
          if (status) status.textContent = `${state[stateKey].length} نتيجة`;
        } catch (error) { if (status) status.textContent = error.message; }
      }, 350);
    });
  }

  function studentByCode(code) { return state.students.find(student => codeOf(student) === String(code)); }
  function groupById(id) { return state.groups.find(group => String(group.id) === String(id)); }
  function assignmentTitle(id) { return state.assignments.find(item => item.id === id)?.title || id || '-'; }

  function compactList(rows, renderRow, empty = 'لا توجد بيانات حديثة.') {
    return rows?.length ? rows.map(renderRow).join('') : `<p class="admin-empty-compact">${empty}</p>`;
  }

  function renderDashboard() {
    const dashboard = state.dashboard; if (!dashboard) return;
    const stats = dashboard.stats || {};
    const values = {
      stStudents: stats.activeStudents, stBookings: stats.pendingBookings,
      stTodayAttendance: stats.presentToday, stTodayAbsent: stats.absentToday,
      stPendingHomework: stats.pendingHomework, stPendingPractical: stats.pendingPractical,
      stPendingExams: stats.pendingCorrection, stPaid: stats.paidStudents,
      stUnpaid: stats.unpaidStudents, stFullGroups: stats.fullGroups,
      stOnlineLectures: stats.lecturesToday, stRecentErrors: stats.recentErrors
    };
    Object.entries(values).forEach(([id, value]) => { const node = $(`#${id}`); if (node) node.textContent = Number(value || 0); });
    const bookingBox = $('#overviewRecentBookings'); if (bookingBox) bookingBox.innerHTML = compactList(dashboard.recentBookings, item => `<button class="admin-feed-row" data-admin-tab="bookings"><span><b>${escapeHtml(item.name || 'حجز')}</b><small>${escapeHtml(item.track || '')} · ${escapeHtml(item.groupName || '-')}</small></span>${statusBadge(item.status)}</button>`);
    const lectureBox = $('#overviewTodayLectures'); if (lectureBox) lectureBox.innerHTML = compactList(dashboard.todayLectures, item => `<button class="admin-feed-row" data-admin-tab="online"><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.groupName || '-')} · ${escapeHtml(format12Hour(item.time))}</small></span>${statusBadge(item.status)}</button>`, 'لا توجد محاضرات اليوم.');
    const workBox = $('#overviewRecentWork'); if (workBox) workBox.innerHTML = compactList([...(dashboard.recentHomework || []).map(item => ({ ...item, kind: 'واجب' })), ...(dashboard.recentPractical || []).map(item => ({ ...item, kind: 'عملي' }))].slice(0, 6), item => `<div class="admin-feed-row"><span><b>${escapeHtml(item.studentName || item.studentCode || item.fileName || item.kind)}</b><small>${escapeHtml(item.kind)} · ${escapeHtml(item.taskTitle || item.assignmentId || '')}</small></span>${statusBadge(item.status)}</div>`);
    const alertBox = $('#overviewAlerts'); if (alertBox) alertBox.innerHTML = compactList([...(dashboard.fullGroups || []).map(item => ({ title: `اكتملت ${item.name}`, note: `${item.track} · السعة ${item.capacity}`, type: 'warn' })), ...(dashboard.recentErrors || []).map(item => ({ title: item.action || item.code || 'خطأ تقني', note: item.message || item.page, type: 'danger' }))].slice(0, 6), item => `<div class="admin-feed-row"><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(text(item.note, 80))}</small></span><span class="badge ${item.type}">${item.type === 'danger' ? 'خطأ' : 'تنبيه'}</span></div>`, 'لا توجد تنبيهات حاليًا.');
  }

  function studentMetrics(student) {
    const code = codeOf(student), progress = state.classProgress.filter(item => item.studentCode === code);
    const percent = (done, total) => total ? Math.round((done / total) * 100) : 0;
    const attempts = state.examAttempts.filter(item => item.studentCode === code && Number.isFinite(Number(item.score)));
    const attendance = percent(progress.filter(item => item.attendanceStatus === 'حاضر').length, progress.length);
    const homework = percent(progress.filter(item => item.homeworkCompleted).length, progress.length);
    const practical = percent(progress.filter(item => item.practicalCompleted).length, progress.length);
    const grades = attempts.length ? Math.round(attempts.reduce((sum, item) => sum + Number(item.score), 0) / attempts.length) : 0;
    const overall = Math.round(attendance * .3 + homework * .2 + practical * .25 + grades * .25);
    return { attendance, homework, practical, grades, overall };
  }

  function renderStudentRows() {
    const box = $('#studentRows'); if (!box) return;
    const term = ($('#studentSearch')?.value || '').trim().toLowerCase();
    const track = $('#studentTrackFilter')?.value || '', group = $('#studentGroupFilter')?.value || '', payment = $('#studentPaymentFilter')?.value || '';
    const rows = state.students.filter(item => {
      const haystack = [item.name, item.studentName, codeOf(item), item.studentPhone, item.phone, item.parentPhone].join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!track || trackOf(item) === track) && (!group || item.groupId === group) && (!payment || String(item.paymentStatus || 'unpaid') === payment);
    });
    box.innerHTML = rows.length ? rows.map(item => {
      const code = codeOf(item), metrics = studentMetrics(item), name = item.name || item.studentName || 'طالب';
      return `<article class="student-admin-row" data-row-id="${escapeHtml(code)}">
        <label class="admin-select-row" aria-label="تحديد ${escapeHtml(name)}"><input type="checkbox" data-select-student="${escapeHtml(code)}"></label>
        <span class="student-avatar">${escapeHtml(name.trim().charAt(0) || 'ط')}</span>
        <div class="student-row-main"><b>${escapeHtml(name)}</b><button class="student-code-copy" data-copy-code="${escapeHtml(code)}" title="نسخ الكود">${escapeHtml(code)}</button><small>${escapeHtml(trackOf(item))} · ${escapeHtml(item.groupName || item.group || '-')} · ${escapeHtml(item.mode || groupById(item.groupId)?.mode || '-')}</small></div>
        <div class="student-row-contact"><span>${escapeHtml(item.studentPhone || item.phone || '-')}</span><small>ولي الأمر: ${escapeHtml(item.parentPhone || '-')}</small></div>
        <div class="student-row-metrics"><span title="الحضور">حضور <b>${metrics.attendance}%</b></span><span title="الواجب">واجب <b>${metrics.homework}%</b></span><span title="العملي">عملي <b>${metrics.practical}%</b></span><span title="الدرجات">درجات <b>${metrics.grades}%</b></span></div>
        <div class="student-row-status">${statusBadge(item.paymentStatus || 'unpaid')}<span class="badge ${metrics.overall >= 75 ? 'good' : metrics.overall >= 50 ? 'warn' : 'danger'}">المستوى ${metrics.overall}%</span></div>
        <div class="student-row-actions"><a class="small-btn primary" href="student.html?code=${encodeURIComponent(code)}" target="_blank" rel="noopener">فتح الملف</a><button class="small-btn" data-edit-student="${escapeHtml(code)}">تعديل</button><details class="admin-row-menu"><summary class="small-btn">إجراءات</summary><div><button data-student-attendance="${escapeHtml(code)}">تسجيل حضور</button><button data-student-payment="${escapeHtml(code)}">تسجيل دفع</button><button data-student-progress="${escapeHtml(code)}:homework">تم الواجب</button><button data-student-progress="${escapeHtml(code)}:practical">تم التطبيق العملي</button><button data-student-grade="${escapeHtml(code)}">إضافة درجة</button><button data-edit-student="${escapeHtml(code)}">إضافة ملاحظة / نقل</button><button data-whatsapp="${escapeHtml(code)}">واتساب</button><a href="parent.html?code=${encodeURIComponent(code)}&print=1" target="_blank">طباعة التقرير</a><button data-show-qr="${escapeHtml(code)}">عرض QR</button><button data-copy-code="${escapeHtml(code)}">نسخ الكود</button>${staffProfile?.role === 'admin' ? `<button data-change-code="${escapeHtml(code)}">تغيير الكود</button><button class="danger" data-delete-student="${escapeHtml(code)}">حذف الطالب</button>` : ''}</div></details></div>
      </article>`;
    }).join('') : '<p class="admin-empty-compact">لا توجد نتائج مطابقة.</p>';
    const pageStatus = $('#studentPageStatus'); if (pageStatus) pageStatus.textContent = `معروض ${rows.length} من ${state.students.length}`;
    const more = $('#loadMoreStudents'); if (more) more.hidden = !cursors.students;
    window.hydrateIcons?.();
  }

  function paymentFor(code, month) {
    return state.payments.find(item => item.studentCode === code && (!month || item.month === month));
  }

  function renderPaymentRows() {
    const box = $('#paymentRows'); if (!box) return;
    const month = $('#paymentMonth')?.value || new Date().toISOString().slice(0, 7);
    const term = ($('#paymentSearch')?.value || '').trim().toLowerCase();
    const wantedStatus = $('#paymentStatusFilter')?.value || '';
    const rows = state.students.filter(student => {
      const payment = paymentFor(codeOf(student), month), status = payment?.status || student.paymentStatus || 'unpaid';
      return (!term || `${student.name || student.studentName} ${codeOf(student)}`.toLowerCase().includes(term)) && (!wantedStatus || status === wantedStatus);
    });
    box.innerHTML = rows.length ? rows.map(student => {
      const code = codeOf(student), payment = paymentFor(code, month), status = payment?.status || student.paymentStatus || 'unpaid';
      const amount = Number(payment?.amount ?? student.paymentAmount ?? 0), paid = Number(payment?.paidAmount ?? student.paidAmount ?? 0);
      return `<article class="admin-data-row payment-admin-row" data-payment-row="${escapeHtml(code)}"><span class="student-avatar">${escapeHtml((student.name || student.studentName || 'ط').charAt(0))}</span><div><b>${escapeHtml(student.name || student.studentName || code)}</b><small>${escapeHtml(code)} · ${escapeHtml(trackOf(student))} · ${escapeHtml(student.groupName || '-')} · ${escapeHtml(month)}</small></div><div class="payment-numbers"><small>المطلوب <b>${amount}</b></small><small>المدفوع <b>${paid}</b></small><small>المتبقي <b>${Math.max(0, amount - paid)}</b></small></div><div data-payment-badge>${statusBadge(status)}</div><div class="admin-table-actions"><button class="small-btn primary" data-payment-status="${escapeHtml(code)}:paid">تم الدفع</button><button class="small-btn" data-payment-status="${escapeHtml(code)}:partial">جزئي</button><button class="small-btn" data-payment-status="${escapeHtml(code)}:unpaid">لم يدفع</button><button class="small-btn" data-student-payment="${escapeHtml(code)}">تفاصيل</button><button class="small-btn" data-whatsapp="${escapeHtml(code)}">واتساب</button></div></article>`;
    }).join('') : '<p class="admin-empty-compact">لا توجد نتائج دفع مطابقة.</p>';
  }

  async function saveQuickPayment(button) {
    const [studentCode, status] = button.dataset.paymentStatus.split(':'), student = studentByCode(studentCode);
    const month = $('#paymentMonth')?.value || new Date().toISOString().slice(0, 7);
    const oldStatus = student.paymentStatus || 'unpaid', amount = Number(student.paymentAmount || 0);
    student.paymentStatus = status; renderPaymentRows();
    try {
      await busy($(`[data-payment-status="${CSS.escape(studentCode)}:${CSS.escape(status)}"]`), () => window.MFCloud.recordPayment({ studentCode, month, amount, paidAmount: status === 'paid' ? amount : status === 'unpaid' ? 0 : Number(student.paidAmount || 0), status, method: student.paymentMethod || 'كاش' }));
      loadedSections.delete('overview');
    } catch (error) { student.paymentStatus = oldStatus; renderPaymentRows(); toastError(error, 'تعذر تسجيل الدفع.'); }
  }

  let acceptedBookings = 0;
  async function approveBookingFast(button, bookingId) {
    const booking = state.bookings.find(item => item.id === bookingId), index = state.bookings.indexOf(booking);
    if (!booking || booking.status !== 'pending') return;
    state.bookings.splice(index, 1); render();
    try {
      await busy(button, () => window.MFCloud.approveBooking(bookingId));
      acceptedBookings += 1;
      const counter = $('#acceptedBookingCounter');
      if (counter) { counter.hidden = false; counter.textContent = `تم قبول ${acceptedBookings}`; }
      loadedSections.delete('students'); loadedSections.delete('overview');
    } catch (error) { state.bookings.splice(index, 0, booking); render(); toastError(error, 'تعذر قبول الحجز.'); }
  }

  function render() {
    if (state.dashboard) renderDashboard();
    const today = nowDate();
    const stats = state.dashboard ? {} : {
      stBookings: state.bookings.filter(item => item.status === 'pending').length,
      stStudents: state.students.length,
      stGroups: state.groups.length,
      stOnlineLectures: state.onlineLectures.length,
      stPaid: state.students.filter(item => ['paid', 'تم الدفع'].includes(item.paymentStatus) || item.paid).length,
      stTodayAttendance: state.classProgress.filter(item => item.date === today && item.attendanceStatus === 'حاضر').length,
      stPdfs: state.materials.length,
      stExams: state.exams.length,
      stReviews: state.reviews.filter(item => item.approved === true).length
    };
    Object.entries(stats).forEach(([id, value]) => { if ($(`#${id}`)) $(`#${id}`).textContent = value; });

    if ($('#bookingRows')) $('#bookingRows').innerHTML = state.bookings.length ? state.bookings.map(item => `<tr data-row-id="${escapeHtml(item.id)}"><td><input aria-label="تحديد حجز ${escapeHtml(item.name || item.studentName)}" data-select-booking="${escapeHtml(item.id)}" type="checkbox" ${item.status !== 'pending' ? 'disabled' : ''}></td><td><b>${escapeHtml(item.name || item.studentName)}</b><small>${escapeHtml(item.studentCode || '')}</small></td><td>${escapeHtml(item.studentPhone || '-')}<small>${escapeHtml(item.parentPhone || '')}</small></td><td>${escapeHtml(trackOf(item))}</td><td>${escapeHtml(item.groupName || item.group || '-')}</td><td>${statusBadge(item.status)}</td><td><div class="admin-table-actions">${item.status === 'pending' ? `<button class="small-btn primary" data-approve-booking="${escapeHtml(item.id)}">قبول</button><button class="small-btn danger" data-reject-booking="${escapeHtml(item.id)}">رفض</button>` : ''}</div></td></tr>`).join('') : emptyRow(7, 'لا توجد طلبات حجز.');

    renderStudentRows();

    if ($('#trackRows')) $('#trackRows').innerHTML = allTracks().map(name => { const saved = state.tracks.find(item => item.name === name); return `<tr><td><b>${escapeHtml(name)}</b></td><td>${escapeHtml(saved?.description || '-')}</td><td>${statusBadge(saved?.status || 'active')}</td><td>${saved ? `<button class="small-btn" data-edit-record="tracks:${escapeHtml(saved.id)}">تعديل</button>` : '<small>مسار أساسي</small>'}</td></tr>`; }).join('');

    if ($('#groupRows')) $('#groupRows').innerHTML = state.groups.length ? state.groups.map(item => `<tr><td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(trackOf(item))}</small></td><td>${escapeHtml(item.day || '')} · ${escapeHtml(item.time || item.schedule || '-')}</td><td>${escapeHtml(item.mode || '-')}</td><td>${Number(item.activeStudentCount || 0)} / ${Number(item.capacity || 0) || '∞'}</td><td>${statusBadge(item.status || 'open')}</td><td><button class="small-btn" data-edit-record="groups:${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="groups:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(6);

    if ($('#onlineLectureRows')) $('#onlineLectureRows').innerHTML = state.onlineLectures.length ? state.onlineLectures.map(item => `<tr><td><b>${escapeHtml(item.title)}</b></td><td>${escapeHtml(item.groupName || item.group || '-')}</td><td>${escapeHtml(item.date || '-')} · ${escapeHtml(format12Hour(item.time))}</td><td>${item.meetingUrl ? `<a class="small-btn" target="_blank" rel="noopener" href="${escapeHtml(item.meetingUrl)}">فتح</a>` : '-'}</td><td>${statusBadge(item.status)}</td><td><button class="small-btn" data-edit-record="onlineLectures:${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="onlineLectures:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(6);

    const progressRows = state.classProgress.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const progressHtml = progressRows.length ? progressRows.map(item => `<tr><td><b>${escapeHtml(item.studentName || studentByCode(item.studentCode)?.name || '-')}</b><small>${escapeHtml(item.studentCode)}</small></td><td>${escapeHtml(item.sessionTitle || '-')}</td><td>${escapeHtml(item.date || '-')}</td><td>${statusBadge(item.attendanceStatus || '-')}</td><td>${item.homeworkCompleted ? 'تم' : '-'}</td><td>${item.practicalCompleted ? 'تم' : '-'}</td><td>${escapeHtml(item.recordedByName || '-')}</td></tr>`).join('') : emptyRow(7, 'لا توجد متابعة محاضرات بعد.');
    if ($('#progressRows')) $('#progressRows').innerHTML = progressHtml;
    if ($('#attendanceRows')) $('#attendanceRows').innerHTML = progressRows.length ? progressRows.map(item => `<tr><td>${escapeHtml(item.studentName || '-')}</td><td>${escapeHtml(item.studentCode)}</td><td>${escapeHtml(item.sessionTitle || '-')}</td><td>${escapeHtml(item.date || '-')} · ${formatTime(item.updatedAt)}</td><td>${statusBadge(item.attendanceStatus)}</td><td><button class="small-btn" data-load-progress="${escapeHtml(item.id)}">تعديل</button></td></tr>`).join('') : emptyRow(6);

    renderPaymentRows();

    if ($('#pdfRows')) $('#pdfRows').innerHTML = state.materials.length ? state.materials.map(item => `<tr><td><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.desc || '')}</small></td><td>${escapeHtml(item.type || '-')}</td><td>${escapeHtml(item.groupName || item.track || (item.isPublic ? 'عام' : '-'))}</td><td>${escapeHtml(item.fileName || '-')}</td><td>${item.fileUrl ? `<a class="small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener">فتح</a>` : '-'}</td><td><button class="small-btn" data-edit-record="materials:${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="materials:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(6);

    if ($('#examRows')) $('#examRows').innerHTML = state.exams.length ? state.exams.map(item => `<tr><td><b>${escapeHtml(item.title)}</b></td><td>${escapeHtml(item.duration || 20)} دقيقة</td><td>${escapeHtml((item.questions || []).map(q => q.type).join(' / ') || item.type || '-')}</td><td>${escapeHtml(item.targetType || 'all')} · ${escapeHtml(item.track || item.targetGroup || '')}</td><td>${escapeHtml(text(item.questions?.[0]?.question || item.question, 70))}</td><td><button class="small-btn" data-edit-record="exams:${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="exams:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(6);
    renderExamAttempts();

    if ($('#serviceRows')) $('#serviceRows').innerHTML = state.services.length ? state.services.map(item => `<tr><td><b>${escapeHtml(item.title)}</b></td><td>${escapeHtml(text(item.desc, 90))}</td><td>${escapeHtml(item.price || '-')}</td><td>${statusBadge(item.status || 'active')}</td><td><button class="small-btn" data-edit-record="services:${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="services:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(5);

    if ($('#reviewRows')) $('#reviewRows').innerHTML = state.reviews.length ? state.reviews.map(item => `<tr><td><b>${escapeHtml(item.name)}</b></td><td>${escapeHtml(item.role || '-')}</td><td>${'★'.repeat(Number(item.rating || 5))}</td><td>${escapeHtml(text(item.text, 90))}</td><td>${statusBadge(item.approved ? 'منشور' : 'بانتظار الموافقة')}</td><td><button class="small-btn primary" data-toggle-review="${escapeHtml(item.id)}">${item.approved ? 'إخفاء' : 'اعتماد'}</button><button class="small-btn danger" data-delete-record="reviews:${escapeHtml(item.id)}">حذف</button></td></tr>`).join('') : emptyRow(6);

    if ($('#homeworkRows')) $('#homeworkRows').innerHTML = state.homeworkSubmissions.length ? state.homeworkSubmissions.map(item => `<tr><td>${escapeHtml(studentByCode(item.studentCode)?.name || item.studentCode)}</td><td>${escapeHtml(assignmentTitle(item.assignmentId))}</td><td>${escapeHtml(item.fileName || '-')}</td><td>${statusBadge(item.status)}</td><td><button class="small-btn primary" data-review-homework="${escapeHtml(item.id)}:approved">اعتماد</button><button class="small-btn danger" data-review-homework="${escapeHtml(item.id)}:rejected">رفض</button></td></tr>`).join('') : emptyRow(5);

    if ($('#practicalRows')) $('#practicalRows').innerHTML = state.practicalSubmissions.length ? state.practicalSubmissions.map(item => `<tr><td>${escapeHtml(item.studentName || item.studentCode)}</td><td>${escapeHtml(item.taskTitle || item.taskId)}</td><td>${escapeHtml(item.languageId)}</td><td>${item.score ?? '-'}%</td><td>${statusBadge(item.status)}</td><td>${formatDate(item.submittedAt || item.createdAt)}${item.status !== 'running'?`<button class="small-btn" data-review-practical="${escapeHtml(item.id)}">مراجعة</button>`:''}</td></tr>`).join('') : emptyRow(6);

    if ($('#gradeRows')) $('#gradeRows').innerHTML = state.grades.length ? state.grades.map(item => `<article class="admin-data-row"><span class="student-avatar">${escapeHtml((studentByCode(item.studentCode)?.name || 'د').charAt(0))}</span><div><b>${escapeHtml(studentByCode(item.studentCode)?.name || item.studentCode)}</b><small>${escapeHtml(item.title || item.examId || 'درجة')} · ${escapeHtml(item.month || '-')} · ${escapeHtml(item.type || 'تقييم')}</small></div><strong>${Number(item.score || 0)}%</strong><div class="admin-table-actions"><button class="small-btn" data-edit-grade="${escapeHtml(item.id)}">تعديل</button><button class="small-btn danger" data-delete-record="grades:${escapeHtml(item.id)}">حذف</button></div></article>`).join('') : '<p class="admin-empty-compact">لا توجد درجات مسجلة.</p>';

    if ($('#staffRows')) $('#staffRows').innerHTML = state.staff.length ? state.staff.map(item => `<article class="admin-data-row staff-admin-row" data-staff-id="${escapeHtml(item.id)}"><span class="student-avatar">${escapeHtml((item.name || item.email || 'ف').charAt(0))}</span><div><b>${escapeHtml(item.name || 'عضو فريق')}</b><small>${escapeHtml(item.email || item.id)}</small></div><select data-staff-role aria-label="دور ${escapeHtml(item.name || item.id)}"><option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Admin</option><option value="teacher" ${item.role === 'teacher' ? 'selected' : ''}>Teacher</option><option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Assistant</option></select><label class="staff-active-toggle"><input type="checkbox" data-staff-active ${item.active !== false ? 'checked' : ''}> نشط</label><button class="small-btn primary" data-save-staff="${escapeHtml(item.id)}">حفظ</button></article>`).join('') : '<p class="admin-empty-compact">لا توجد حسابات فريق مسجلة.</p>';

    if ($('#activityRows')) $('#activityRows').innerHTML = state.activityLog.length ? state.activityLog.map(item => `<div class="admin-list-row"><div><b>${escapeHtml(item.action || 'عملية')}</b><small>${escapeHtml(item.studentCode || item.bookingId || '')} · ${formatDate(item.createdAt)} ${formatTime(item.createdAt)}</small></div></div>`).join('') : '<p>لا توجد أنشطة مسجلة.</p>';
    if ($('#errorRows')) $('#errorRows').innerHTML = state.clientErrors.length ? state.clientErrors.map(item => `<div class="admin-list-row rich"><div><b>${escapeHtml(item.action || item.code || 'خطأ')}</b><small>${escapeHtml(item.page || '')} · ${formatDate(item.createdAt)} ${formatTime(item.createdAt)}</small><p>${escapeHtml(item.message || '')}</p></div></div>`).join('') : '<p>لا توجد أخطاء مسجلة.</p>';

    if ($('#settingsPreview')) $('#settingsPreview').innerHTML = `<div class="admin-list-row"><b>إعدادات العرض العامة</b><small>${escapeHtml(state.settings.siteName || 'Techno Minds')}</small></div>`;
    const trackFilter = $('#studentTrackFilter'), groupFilter = $('#studentGroupFilter');
    if (trackFilter) { const current = trackFilter.value; trackFilter.innerHTML = '<option value="">كل المسارات</option>' + allTracks().map(track => `<option value="${escapeHtml(track)}">${escapeHtml(track)}</option>`).join(''); trackFilter.value = current; }
    if (groupFilter) { const current = groupFilter.value; groupFilter.innerHTML = '<option value="">كل المجموعات</option>' + state.groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join(''); groupFilter.value = current; }
    setupLeaderboardSelector();
    window.hydrateIcons?.();
  }

  function renderExamAttempts() {
    const tab = $('#tab-exams');
    if (!tab) return;
    let panel = $('#examAttemptsAdmin');
    if (!panel) { panel = document.createElement('div'); panel.id = 'examAttemptsAdmin'; panel.className = 'admin-pro-card'; tab.appendChild(panel); }
    panel.innerHTML = `<h3>إجابات الطلاب والتصحيح</h3>${state.examAttempts.length ? state.examAttempts.map(item => `<div class="admin-list-row"><div><b>${escapeHtml(item.studentName || item.studentCode)} — ${escapeHtml(item.examTitle)}</b><small>${arabicStatus(item.status)} · ${item.score ?? '-'}% ${item.resultPublished ? '· منشورة' : '· غير منشورة'}</small></div>${item.status === 'submitted' ? `<button class="small-btn primary" data-grade-attempt="${escapeHtml(item.id)}">تصحيح</button>` : item.status === 'graded' && !item.resultPublished ? `<button class="small-btn primary" data-publish-attempt="${escapeHtml(item.id)}">اعتماد ونشر</button>` : ''}</div>`).join('') : '<p>لا توجد محاولات بعد.</p>'}`;
  }

  function setupLeaderboardSelector() {
    const select = $('#adminLeaderboardTrack');
    if (!select || select.options.length) return;
    select.innerHTML = allTracks().map(track => `<option>${escapeHtml(track)}</option>`).join('');
    select.addEventListener('change', renderAdminLeaderboard);
    renderAdminLeaderboard();
  }

  let leaderboardRequest = 0;
  async function renderAdminLeaderboard() {
    const box = $('#adminLeaderboard'); if (!box) return;
    const track = $('#adminLeaderboardTrack').value, request = ++leaderboardRequest;
    box.innerHTML = '<div class="skeleton"></div>';
    try {
      const result = await window.MFCloud.getPublicLeaderboard(track, new Date().toISOString().slice(0, 7));
      if (request !== leaderboardRequest) return;
      box.innerHTML = result.students.length ? result.students.map(item => `<div class="card"><span class="badge good">#${item.rank}</span><h3>${escapeHtml(item.name)}</h3><b>${item.score}%</b><small>اختبارات ${item.details.exams}% · حضور ${item.details.attendance}% · واجب ${item.details.homework}% · عملي ${item.details.practical}% · مشاركة ${item.details.participation}%</small></div>`).join('') : '<p>لا توجد أنشطة لهذا المسار خلال الشهر الحالي.</p>';
    } catch (error) { if (request === leaderboardRequest) box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
  }

  function format12Hour(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/); if (!match) return value || '-';
    const hour = Number(match[1]), minute = match[2]; return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'م' : 'ص'}`;
  }

  const fieldConfigs = {
    track: { title: 'مسار', collection: 'tracks', fields: [['name', 'اسم المسار'], ['description', 'الوصف', 'textarea'], ['status', 'الحالة', 'select', ['active', 'closed']]] },
    group: { title: 'مجموعة', collection: 'groups', fields: [['name', 'اسم المجموعة'], ['track', 'المسار', 'select', allTracks], ['day', 'اليوم'], ['time', 'الوقت', 'time'], ['mode', 'نوع الحضور', 'select', ['أونلاين', 'أوفلاين', 'هجين']], ['capacity', 'السعة القصوى', 'number'], ['status', 'الحالة', 'select', ['open', 'closed']], ['meetingUrl', 'رابط المحاضرة الأونلاين'], ['notes', 'ملاحظات', 'textarea']] },
    payment: { title: 'دفعة', collection: 'payments', fields: [['studentCode', 'كود الطالب'], ['month', 'الشهر'], ['amount', 'المبلغ المطلوب', 'number'], ['paidAmount', 'المبلغ المدفوع', 'number'], ['method', 'الطريقة', 'select', ['كاش']], ['status', 'الحالة', 'select', [['paid', 'تم الدفع'], ['partial', 'دفع جزئي'], ['unpaid', 'لم يدفع'], ['exempt', 'معفي'], ['late', 'متأخر']]], ['note', 'ملاحظة', 'textarea']] },
    grade: { title: 'درجة', collection: 'grades', fields: [['studentCode', 'كود الطالب'], ['title', 'اسم التقييم'], ['type', 'نوع التقييم', 'select', [['exam', 'امتحان'], ['homework', 'واجب'], ['practical', 'تطبيق عملي'], ['manual', 'درجة يدوية']]], ['month', 'الشهر'], ['score', 'الدرجة من 100', 'number'], ['note', 'ملاحظة', 'textarea']] },
    pdf: { title: 'محتوى', collection: 'materials', fields: [['title', 'العنوان'], ['type', 'النوع', 'select', ['محاضرة', 'ملف', 'شرح', 'واجب', 'فيديو']], ['track', 'المسار', 'select', allTracks], ['groupId', 'المجموعة', 'select', groupOptions], ['isPublic', 'عرض عام', 'select', [['false', 'خاص بالمسار/المجموعة'], ['true', 'عام']]], ['status', 'الحالة', 'select', ['منشور', 'مخفي']], ['link', 'رابط خارجي'], ['file', 'ملف', 'file'], ['desc', 'الوصف', 'textarea']] },
    exam: { title: 'امتحان', collection: 'exams', fields: [['title', 'العنوان'], ['duration', 'المدة بالدقائق', 'number'], ['targetType', 'مخصص إلى', 'select', ['all', 'group', 'student']], ['track', 'المسار', 'select', allTracks], ['targetGroupId', 'المجموعة', 'select', groupOptions], ['targetStudentCode', 'كود طالب محدد'], ['attachmentUrl', 'رابط PDF'], ['questionsJson', 'الأسئلة JSON: type/question/options/correctAnswer/points', 'code'], ['status', 'الحالة', 'select', ['published', 'hidden']], ['allowRetake', 'إعادة المحاولة', 'select', [['false', 'لا'], ['true', 'نعم']]]] },
    online: { title: 'محاضرة أونلاين', collection: 'onlineLectures', fields: [['title', 'العنوان'], ['track', 'المسار', 'select', allTracks], ['groupId', 'المجموعة', 'select', groupOptions], ['date', 'التاريخ', 'date'], ['time', 'الوقت', 'time'], ['meetingUrl', 'رابط Zoom / Meet'], ['recordingUrl', 'رابط التسجيل'], ['status', 'الحالة', 'select', ['متاحة', 'لم تبدأ', 'انتهت', 'مخفي']], ['hideAfterEnd', 'إخفاء بعد الانتهاء', 'select', [['false', 'لا'], ['true', 'نعم']]], ['notes', 'ملاحظات', 'textarea']] },
    service: { title: 'خدمة', collection: 'services', fields: [['title', 'الاسم'], ['desc', 'الوصف', 'textarea'], ['price', 'السعر/الملاحظة'], ['status', 'الحالة', 'select', ['active', 'closed']]] },
    review: { title: 'تقييم', collection: 'reviews', fields: [['name', 'الاسم'], ['role', 'الصفة'], ['rating', 'التقييم', 'number'], ['text', 'النص', 'textarea'], ['approved', 'الحالة', 'select', [['false', 'بانتظار الموافقة'], ['true', 'منشور']]]] },
    assignment: { title: 'واجب', collection: 'assignments', fields: [['title', 'عنوان الواجب'], ['track', 'المسار', 'select', allTracks], ['groupId', 'المجموعة', 'select', groupOptions], ['dueDate', 'آخر موعد', 'date'], ['status', 'الحالة', 'select', ['published', 'closed']], ['description', 'التعليمات', 'textarea']] },
    practicalTask: { title: 'مهمة عملية', collection: 'practical_tasks', fields: [['title', 'عنوان المهمة'], ['track', 'المسار', 'select', allTracks], ['groupId', 'المجموعة', 'select', groupOptions], ['description', 'التعليمات', 'textarea'], ['visibleTestsJson', 'الاختبارات الظاهرة JSON', 'code'], ['hiddenTestsJson', 'الاختبارات المخفية JSON', 'code'], ['status', 'الحالة', 'select', ['published', 'hidden']]] },
    settings: { title: 'إعدادات', collection: 'settings', fields: [['siteName', 'اسم الموقع'], ['teacherName', 'اسم المدرس'], ['teacherPhone', 'واتساب'], ['siteUrl', 'رابط الموقع'], ['heroText', 'رسالة الموقع', 'textarea']] }
  };

  function groupOptions() { return [['', 'كل المجموعات'], ...state.groups.map(group => [group.id, `${group.name} — ${trackOf(group)}`])]; }

  function fieldHtml(field, value) {
    let [name, label, type = 'text', options = []] = field;
    if (typeof options === 'function') options = options();
    if (type === 'select') return `<label>${label}<select name="${name}">${options.map(option => { const pair = Array.isArray(option) ? option : [option, option]; return `<option value="${escapeHtml(pair[0])}" ${String(value ?? '') === String(pair[0]) ? 'selected' : ''}>${escapeHtml(pair[1])}</option>`; }).join('')}</select></label>`;
    if (type === 'textarea' || type === 'code') return `<label class="wide">${label}<textarea name="${name}" class="${type === 'code' ? 'admin-code-area' : ''}" ${type === 'code' ? 'dir="ltr"' : ''}>${escapeHtml(value || '')}</textarea></label>`;
    if (type === 'file') return `<label>${label}<input type="file" name="${name}" accept="application/pdf,image/*,text/*"></label>`;
    return `<label>${label}<input type="${type}" name="${name}" value="${escapeHtml(value ?? '')}"></label>`;
  }

  function recordFor(collection, id) { return (state[collection] || []).find(item => String(item.id) === String(id)); }

  function examQuestionHtml(question = {}, index = 0) {
    const type = ['mcq', 'essay', 'code'].includes(question.type) ? question.type : 'mcq';
    const options = Array.from({ length: 4 }, (_, optionIndex) => String(question.options?.[optionIndex] || ''));
    const storedCorrect = question.correctAnswer ?? question.correctIndex ?? '';
    const matchedCorrect = Number.isInteger(Number(storedCorrect)) && Number(storedCorrect) >= 0 && Number(storedCorrect) <= 3 ? Number(storedCorrect) : options.findIndex(option => option && String(storedCorrect) === option);
    const correctIndex = Math.max(0, matchedCorrect);
    const radioGroup = `correct-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return `<article class="exam-builder-question" data-question-id="${escapeHtml(question.id || `q${Date.now()}${index}`)}">
      <div class="exam-builder-head"><b>سؤال <span data-question-number>${index + 1}</span></b><button class="small-btn danger" data-remove-exam-question type="button">حذف السؤال</button></div>
      <div class="admin-form exam-question-core">
        <label>نوع السؤال<select class="exam-question-type"><option value="mcq" ${type === 'mcq' ? 'selected' : ''}>اختيار من متعدد</option><option value="essay" ${type === 'essay' ? 'selected' : ''}>سؤال مقالي</option><option value="code" ${type === 'code' ? 'selected' : ''}>كتابة كود</option></select></label>
        <label>درجة السؤال<input class="exam-question-points" type="number" min="1" max="1000" value="${escapeHtml(question.points || 1)}" required></label>
        <label class="wide">نص السؤال<textarea class="exam-question-text" required placeholder="اكتب السؤال بشكل واضح...">${escapeHtml(question.question || '')}</textarea></label>
      </div>
      <div class="exam-mcq-fields" ${type === 'mcq' ? '' : 'hidden'}>
        <p>اكتب الاختيارات الأربعة وحدد الإجابة الصحيحة:</p>
        ${options.map((option, optionIndex) => `<label class="exam-option-row"><input class="exam-correct-option" type="radio" name="${radioGroup}" value="${optionIndex}" ${optionIndex === correctIndex ? 'checked' : ''}><span>${['أ', 'ب', 'ج', 'د'][optionIndex]}</span><input class="exam-option-value" value="${escapeHtml(option)}" placeholder="الاختيار ${optionIndex + 1}"></label>`).join('')}
      </div>
      <div class="admin-form exam-code-fields" ${type === 'code' ? '' : 'hidden'}>
        <label>لغة الكود<input class="exam-code-language" value="${escapeHtml(question.language || 'Python')}" placeholder="Python"></label>
        <label class="wide">كود البداية (اختياري)<textarea class="exam-code-starter admin-code-area" dir="ltr">${escapeHtml(question.starterCode || question.starter || '')}</textarea></label>
      </div>
    </article>`;
  }

  function renumberExamQuestions() {
    $$('#examQuestionsBuilder .exam-builder-question').forEach((card, index) => { card.querySelector('[data-question-number]').textContent = index + 1; });
  }

  function openExamModal(item = null) {
    modalType = 'exam'; modalItem = item;
    const data = item || {}, questions = Array.isArray(data.questions) && data.questions.length ? data.questions : [{ type: 'mcq', points: 1, options: ['', '', '', ''] }];
    $('#adminModalContent').innerHTML = `<div class="exam-builder-title"><div><span class="kicker">منشئ الامتحان</span><h2>${item ? 'تعديل الامتحان' : 'امتحان جديد'}</h2><p>اكتب السؤال والاختيارات مباشرة؛ لا تحتاج إلى JSON.</p></div></div>
      <form id="modalForm" class="admin-form admin-modal-form exam-builder-form">
        <label>اسم الامتحان<input name="title" value="${escapeHtml(data.title || '')}" required placeholder="مثال: اختبار Python الأسبوعي"></label>
        <label>المدة بالدقائق<input name="duration" type="number" min="1" max="300" value="${escapeHtml(data.duration || 20)}" required></label>
        <label>مخصص إلى<select name="targetType"><option value="all" ${data.targetType === 'all' ? 'selected' : ''}>مسار كامل</option><option value="group" ${data.targetType === 'group' ? 'selected' : ''}>مجموعة محددة</option><option value="student" ${data.targetType === 'student' ? 'selected' : ''}>طالب محدد</option></select></label>
        <label>المسار<select name="track">${allTracks().map(track => `<option value="${escapeHtml(track)}" ${track === data.track ? 'selected' : ''}>${escapeHtml(track)}</option>`).join('')}</select></label>
        <label>المجموعة<select name="targetGroupId">${groupOptions().map(pair => `<option value="${escapeHtml(pair[0])}" ${pair[0] === data.targetGroupId ? 'selected' : ''}>${escapeHtml(pair[1])}</option>`).join('')}</select></label>
        <label>كود الطالب (عند اختيار طالب)<input name="targetStudentCode" inputmode="numeric" maxlength="8" value="${escapeHtml(data.targetStudentCode || '')}" placeholder="12345678"></label>
        <label>الحالة<select name="status"><option value="published" ${data.status === 'published' ? 'selected' : ''}>منشور</option><option value="hidden" ${data.status !== 'published' ? 'selected' : ''}>مسودة مخفية</option></select></label>
        <label>إعادة المحاولة<select name="allowRetake"><option value="false" ${!data.allowRetake ? 'selected' : ''}>لا</option><option value="true" ${data.allowRetake ? 'selected' : ''}>نعم</option></select></label>
        <label>رابط PDF (اختياري)<input name="attachmentUrl" type="url" value="${escapeHtml(data.attachmentUrl || '')}" placeholder="https://..."></label>
        <label>أو ارفع PDF<input name="attachmentFile" type="file" accept="application/pdf"></label>
        <label class="wide">تعليمات الامتحان<textarea name="instructions" placeholder="تعليمات تظهر للطالب قبل البدء">${escapeHtml(data.instructions || '')}</textarea></label>
        <div class="wide exam-builder-section-head"><div><b>أسئلة الامتحان</b><small>اختيار من متعدد، مقالي، أو كتابة كود</small></div><button class="btn ghost" id="addExamQuestion" type="button">+ إضافة سؤال</button></div>
        <div class="wide exam-questions-builder" id="examQuestionsBuilder">${questions.map(examQuestionHtml).join('')}</div>
        <div class="wide exam-builder-savebar"><span>سيتم حفظ الإجابات الصحيحة في الخادم فقط.</span><button class="btn primary" type="submit">حفظ الامتحان</button></div>
      </form>`;
    revealModal();
    $('#addExamQuestion').addEventListener('click', () => { const box = $('#examQuestionsBuilder'); box.insertAdjacentHTML('beforeend', examQuestionHtml({}, box.children.length)); renumberExamQuestions(); });
    $('#examQuestionsBuilder').addEventListener('click', event => { const remove = event.target.closest('[data-remove-exam-question]'); if (!remove) return; const cards = $$('#examQuestionsBuilder .exam-builder-question'); if (cards.length === 1) return window.toast?.('يجب أن يحتوي الامتحان على سؤال واحد على الأقل.'); remove.closest('.exam-builder-question').remove(); renumberExamQuestions(); });
    $('#examQuestionsBuilder').addEventListener('change', event => { if (!event.target.matches('.exam-question-type')) return; const card = event.target.closest('.exam-builder-question'), type = event.target.value; card.querySelector('.exam-mcq-fields').hidden = type !== 'mcq'; card.querySelector('.exam-code-fields').hidden = type !== 'code'; });
    $('#modalForm').addEventListener('submit', saveModal);
  }

  function collectExamQuestions(form) {
    return [...form.querySelectorAll('.exam-builder-question')].map((card, index) => {
      const type = card.querySelector('.exam-question-type').value;
      const question = card.querySelector('.exam-question-text').value.trim();
      const points = Number(card.querySelector('.exam-question-points').value || 1);
      if (!question) throw new Error(`اكتب نص السؤال رقم ${index + 1}.`);
      const result = { id: card.dataset.questionId || `q${index + 1}`, type, question, points };
      if (type === 'mcq') {
        const options = [...card.querySelectorAll('.exam-option-value')].map(input => input.value.trim());
        if (options.some(option => !option)) throw new Error(`أكمل الاختيارات الأربعة في السؤال رقم ${index + 1}.`);
        const correctIndex = Number(card.querySelector('.exam-correct-option:checked')?.value ?? -1);
        if (correctIndex < 0) throw new Error(`حدد الإجابة الصحيحة للسؤال رقم ${index + 1}.`);
        result.options = options; result.correctAnswer = options[correctIndex];
      }
      if (type === 'code') { result.language = card.querySelector('.exam-code-language').value.trim(); result.starterCode = card.querySelector('.exam-code-starter').value; }
      return result;
    });
  }

  function revealModal() {
    const modal = $('#adminModal');
    if (!modal.classList.contains('show')) modalReturnFocus = document.activeElement;
    modal.inert = false;
    modal.classList.add('show');
  }

  function openModal(type, item = null) {
    if (type === 'exam') return openExamModal(item);
    const config = fieldConfigs[type]; if (!config) return;
    modalType = type; modalItem = item;
    const data = item ? { ...item } : {};
    if (type === 'exam' && item) data.questionsJson = JSON.stringify(item.questions || [], null, 2);
    if (type === 'practicalTask' && item) { data.visibleTestsJson = JSON.stringify(item.visibleTests || [], null, 2); data.hiddenTestsJson = JSON.stringify(item.hiddenTests || [], null, 2); }
    $('#adminModalContent').innerHTML = `<h2>${item ? 'تعديل' : 'إضافة'} ${config.title}</h2><form id="modalForm" class="admin-form admin-modal-form">${config.fields.map(field => fieldHtml(field, data[field[0]])).join('')}<button class="btn primary wide" type="submit">حفظ</button></form>`;
    revealModal();
    $('#modalForm').addEventListener('submit', saveModal);
  }

  function closeModal() { const modal = $('#adminModal'); modal.classList.remove('show'); modal.inert = true; modalReturnFocus?.focus?.(); modalReturnFocus = null; modalType = null; modalItem = null; }

  async function saveModal(event) {
    event.preventDefault();
    const button = event.submitter, config = fieldConfigs[modalType], form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    try {
      await busy(button, async () => {
        if (modalType === 'student') return;
        const data = { ...raw };
        ['capacity', 'duration', 'amount', 'paidAmount', 'rating', 'score'].forEach(key => { if (key in data) data[key] = Number(data[key] || 0); });
        ['approved', 'isPublic', 'allowRetake', 'hideAfterEnd'].forEach(key => { if (key in data) data[key] = data[key] === 'true'; });
        if (modalType === 'exam') {
          data.questions = collectExamQuestions(form);
          delete data.questionsJson;
          const attachment = form.querySelector('[name="attachmentFile"]')?.files?.[0];
          if (attachment) { if (attachment.type !== 'application/pdf') throw new Error('ملف الامتحان يجب أن يكون PDF.'); const uploaded = await window.MFCloud.uploadAttachment(attachment, 'teacher-uploads/exams'); data.attachmentUrl = uploaded.url; }
          delete data.attachmentFile;
        }
        if (modalType === 'practicalTask') { data.visibleTests = JSON.parse(data.visibleTestsJson || '[]'); data.hiddenTests = JSON.parse(data.hiddenTestsJson || '[]'); delete data.visibleTestsJson; delete data.hiddenTestsJson; }
        const file = form.querySelector('[name="file"]')?.files?.[0];
        if (file) { const uploaded = await window.MFCloud.uploadAttachment(file, data.isPublic ? 'public/uploads' : 'teacher-uploads/materials'); Object.assign(data, { fileUrl: uploaded.url, filePath: uploaded.path, fileName: uploaded.fileName, contentType: uploaded.contentType, size: uploaded.size }); }
        const id = modalItem?.id || `${config.collection.slice(0, 3).toUpperCase()}-${Date.now()}`;
        const payload = { ...modalItem, ...data };
        if (modalType === 'payment') await window.MFCloud.recordPayment(payload);
        else if (modalType === 'grade') await window.MFCloud.recordGrade({ id: modalItem?.id || '', data: payload, ...payload });
        else if (modalType === 'assignment') await window.MFCloud.createAssignment({ id: modalItem?.id || '', data: payload });
        else if (modalType === 'practicalTask') await window.MFCloud.createPracticalTask({ id: modalItem?.id || '', data: payload });
        else if (modalType === 'exam') await window.MFCloud.createExam({ id: modalItem?.id || '', data: payload });
        else await window.MFCloud.adminUpsertRecord(config.collection, id, payload);
      });
      closeModal(); await load();
    } catch (error) { toastError(error, 'تعذر حفظ البيانات.'); }
  }

  function openStudentModal(student = null) {
    modalType = 'student'; modalItem = student;
    const data = student || {};
    const paymentFields = staffProfile?.role === 'admin' ? `<label>حالة الدفع<select name="paymentStatus"><option value="unpaid">لم يدفع</option><option value="paid" ${data.paymentStatus === 'paid' ? 'selected' : ''}>تم الدفع</option><option value="partial" ${data.paymentStatus === 'partial' ? 'selected' : ''}>دفع جزئي</option><option value="exempt" ${data.paymentStatus === 'exempt' ? 'selected' : ''}>معفي</option><option value="late" ${data.paymentStatus === 'late' ? 'selected' : ''}>متأخر</option></select></label><label>المبلغ<input name="paymentAmount" type="number" min="0" value="${escapeHtml(data.paymentAmount || 0)}"></label>` : '';
    $('#adminModalContent').innerHTML = `<div class="exam-builder-title"><span class="kicker">ملف الطالب</span><h2>${student ? 'تعديل أو نقل الطالب' : 'إضافة طالب جديد'}</h2><p>الكود الموحد وQR يتم إنشاؤهما من الخادم تلقائيًا.</p></div><form id="studentModalForm" class="admin-form admin-modal-form">
      <label>الاسم الكامل<input name="name" value="${escapeHtml(data.name || data.studentName || '')}" required></label>
      <label>رقم الطالب<input name="studentPhone" inputmode="tel" value="${escapeHtml(data.studentPhone || data.phone || '')}" required></label>
      <label>رقم ولي الأمر<input name="parentPhone" inputmode="tel" value="${escapeHtml(data.parentPhone || '')}" required></label>
      <label>المسار<select name="track">${allTracks().map(track => `<option value="${escapeHtml(track)}" ${track === trackOf(data) ? 'selected' : ''}>${escapeHtml(track)}</option>`).join('')}</select></label>
      <label>المجموعة<select name="groupId"></select></label>
      <label>نوع الحضور<select name="mode"><option value="أوفلاين" ${data.mode === 'أوفلاين' ? 'selected' : ''}>أوفلاين</option><option value="أونلاين" ${data.mode === 'أونلاين' ? 'selected' : ''}>أونلاين</option><option value="هجين" ${data.mode === 'هجين' ? 'selected' : ''}>هجين</option></select></label>
      <label>الشهر<input name="month" type="month" value="${escapeHtml(data.month || new Date().toISOString().slice(0, 7))}"></label>
      <label>حالة الطالب<select name="status"><option value="active" ${data.status !== 'stopped' ? 'selected' : ''}>نشط</option><option value="stopped" ${data.status === 'stopped' ? 'selected' : ''}>متوقف</option></select></label>
      <label>تاريخ الانضمام<input name="joinedAt" type="date" value="${escapeHtml(data.joinedAt || nowDate())}"></label>
      ${paymentFields}
      <label class="wide">ملاحظات الإدارة<textarea name="notes">${escapeHtml(data.teacherNote || data.notes || '')}</textarea></label>
      <button class="btn primary wide" type="submit">${student ? 'حفظ التعديلات' : 'إنشاء الطالب والكود'}</button>
    </form>`;
    revealModal();
    const form = $('#studentModalForm'), trackSelect = form.elements.track, groupSelect = form.elements.groupId;
    const fillGroups = () => { const selected = groupSelect.value || data.groupId || ''; const groups = state.groups.filter(group => trackOf(group) === trackSelect.value); groupSelect.innerHTML = groups.map(group => `<option value="${escapeHtml(group.id)}" ${group.id === selected ? 'selected' : ''}>${escapeHtml(group.name)} · ${escapeHtml(group.day || '')} ${escapeHtml(format12Hour(group.time || ''))}</option>`).join(''); };
    trackSelect.addEventListener('change', fillGroups); fillGroups();
    form.addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); try { const result = await busy(event.submitter, () => student ? window.MFCloud.updateStudentSafely({ studentCode: codeOf(student), ...values }) : window.MFCloud.createStudentSafely(values)); loadedSections.delete('students'); if (student) { closeModal(); await load(); } else { await showCreatedStudent(result.code); await loadCollection('students', 50); render(); } } catch (error) { toastError(error); } });
  }

  async function showCreatedStudent(code) {
    await window.ensureQrTools?.();
    const qr = window.TechnoQrTools.createDataURL(code);
    $('#adminModalContent').innerHTML = `<div class="student-created-modal"><span class="badge good">تم إنشاء الطالب</span><h2>كود الدخول الموحد</h2><img src="${qr}" alt="QR الطالب"><b>${escapeHtml(code)}</b><p>الكود نفسه للطالب وولي الأمر والحضور والامتحانات والواجبات.</p><div class="admin-created-actions"><button class="btn primary" data-copy-code="${escapeHtml(code)}">نسخ الكود</button><button class="btn ghost" onclick="window.print()">طباعة البطاقة</button><a class="btn ghost" href="student.html?code=${encodeURIComponent(code)}" target="_blank">بوابة الطالب</a><a class="btn ghost" href="parent.html?code=${encodeURIComponent(code)}" target="_blank">بوابة ولي الأمر</a></div></div>`;
    window.hydrateIcons?.();
  }

  async function saveProgress(button, clearAfter = false) {
    const code = $('#attendanceCode').value.trim(); const student = studentByCode(code);
    if (!student) return window.toast?.('لم يتم العثور على طالب بهذا الكود.');
    const sessionTitle = $('#attendanceSession').value.trim(), date = $('#attendanceDate').value;
    const sessionId = sessionKey(date, sessionTitle);
    try {
      await busy(button, () => window.MFCloud.recordClassProgress({ studentCode: code, sessionId, sessionTitle, date, group: student.groupName || student.group || '', groupId: student.groupId || '', track: trackOf(student), attendanceStatus: $('#attendanceStatus').value, homeworkCompleted: $('#attendanceHomework').checked, practicalCompleted: $('#attendancePractical').checked, participation: $('#attendanceParticipation').value, teacherNote: $('#attendanceNote').value }));
      if (clearAfter) { $('#attendanceCode').value = ''; $('#attendanceHomework').checked = false; $('#attendancePractical').checked = false; $('#attendanceNote').value = ''; }
      await load();
    } catch (error) { toastError(error); }
  }

  async function recordProgress(event) { event.preventDefault(); return saveProgress(event.submitter, true); }

  async function openScanner() {
    try {
      await window.ensureQrTools?.();
      $('#adminModalContent').innerHTML = '<h2>مسح QR الطالب</h2><video id="adminQrVideo" autoplay playsinline muted></video><p>وجّه الكاميرا الخلفية إلى QR الطالب.</p>';
      revealModal();
      scanner = await window.TechnoQrTools.startScanner($('#adminQrVideo'), async value => { const active = scanner; scanner = null; await active?.stop?.(); $('#attendanceCode').value = window.extractStudentCodeInput(value); closeModal(); });
    } catch (error) { toastError(error, 'تعذر فتح الكاميرا. استخدم الإدخال اليدوي.'); }
  }

  async function showQr(code) {
    await window.ensureQrTools?.();
    const dataUrl = window.TechnoQrTools.createDataURL(code);
    $('#adminModalContent').innerHTML = `<h2>كود الطالب</h2><div class="admin-qr-preview"><img src="${dataUrl}" alt="QR الطالب"><b>${escapeHtml(code)}</b><p>الكود نفسه للطالب وولي الأمر والحضور والامتحانات والواجبات.</p></div>`;
    revealModal();
  }

  async function changeCode(oldCode) {
    if (!confirm('سيتم تغيير الكود وتحديث السجلات المرتبطة. هل تريد المتابعة؟')) return;
    try { const result = await window.MFCloud.createStudentAccess({ oldCode }); window.toast?.(`الكود الجديد: ${result.code}`); await load(); } catch (error) { toastError(error); }
  }

  function whatsappStudent(code) {
    const student = studentByCode(code); if (!student?.parentPhone) return window.toast?.('رقم ولي الأمر غير موجود.');
    const phone = String(student.parentPhone).replace(/\D/g, '').replace(/^0/, '20');
    const progress = state.classProgress.filter(item => item.studentCode === code).slice(0, 8);
    const latestExam = state.examAttempts.filter(item => item.studentCode === code && item.score !== null && item.score !== undefined).sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0];
    const message = `تقرير Techno Minds\nالطالب: ${student.name || student.studentName}\nالكود: ${code}\nالمسار: ${trackOf(student)}\nالمجموعة: ${student.groupName || '-'}\nالدفع: ${arabicStatus(student.paymentStatus || 'unpaid')}\nآخر اختبار: ${latestExam ? `${latestExam.examTitle || 'اختبار'} - ${latestExam.score}%` : 'لا توجد نتيجة معتمدة'}\nآخر متابعة:\n${progress.map(item => `${item.date}: ${item.attendanceStatus || '-'} - ${item.homeworkCompleted ? 'تم الواجب' : 'الواجب لم يكتمل'} - ${item.practicalCompleted ? 'تم التطبيق العملي' : 'التطبيق العملي لم يكتمل'}`).join('\n') || 'لا توجد متابعة بعد'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  function setAdminMenu(open) {
    const mobile = matchMedia('(max-width:900px)').matches;
    const sidebar = $('.admin-pro-sidebar'), toggle = $('#adminMenuToggle'), backdrop = $('#adminMenuBackdrop');
    if (!open && mobile && sidebar?.contains(document.activeElement)) toggle?.focus();
    document.body.classList.toggle('admin-menu-open', !!open && mobile);
    if (sidebar) sidebar.inert = mobile && !open;
    if (backdrop) backdrop.hidden = !(open && mobile);
    toggle?.setAttribute('aria-expanded', String(!!open && mobile));
  }

  async function switchTab(name) {
    activeSection = name;
    $$('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === name));
    $$('.admin-pro-section').forEach(section => section.classList.toggle('active', section.id === `tab-${name}`));
    setAdminMenu(false);
    try { await loadSection(name); if (name === 'leaderboard') renderAdminLeaderboard(); }
    catch (error) { toastError(error, 'تعذر تحميل هذا القسم.'); }
  }

  async function ensureModalData(type) {
    const dependencies = {
      student: [['groups', 100], ['tracks', 100]], payment: [['students', 50]], grade: [['students', 50]],
      group: [['tracks', 100]], online: [['groups', 100], ['tracks', 100]], assignment: [['groups', 100], ['tracks', 100]],
      practicalTask: [['groups', 100], ['tracks', 100]], exam: [['groups', 100], ['tracks', 100]], pdf: [['groups', 100], ['tracks', 100]]
    };
    await Promise.all((dependencies[type] || []).map(([collection, limit]) => state[collectionStateKey[collection] || collection]?.length ? null : loadCollection(collection, limit)));
  }

  function bind() {
    $('#adminMenuToggle').addEventListener('click', () => setAdminMenu(!document.body.classList.contains('admin-menu-open')));
    $('#adminMenuBackdrop').addEventListener('click', () => setAdminMenu(false));
    $('#adminSidebarCollapse')?.addEventListener('click', () => document.body.classList.toggle('admin-sidebar-collapsed'));
    addEventListener('resize', () => setAdminMenu(false), { passive: true });
    setAdminMenu(false);
    $('#attendanceDate').value = nowDate();
    $('#attendanceForm').addEventListener('submit', recordProgress);
    bindServerSearch('bookingSearch', 'bookings', 'bookings', 'bookingSearchStatus');
    bindServerSearch('studentSearch', 'students', 'students', 'studentSearchStatus');
    ['studentTrackFilter', 'studentGroupFilter', 'studentPaymentFilter'].forEach(id => $(`#${id}`)?.addEventListener('change', renderStudentRows));
    $('#studentSearch')?.addEventListener('input', renderStudentRows);
    $('#paymentMonth').value = new Date().toISOString().slice(0, 7);
    ['paymentSearch', 'paymentMonth', 'paymentStatusFilter'].forEach(id => $(`#${id}`)?.addEventListener(id === 'paymentSearch' ? 'input' : 'change', renderPaymentRows));
    $('#selectAllBookings')?.addEventListener('change', event => $$('[data-select-booking]:not(:disabled)').forEach(input => { input.checked = event.currentTarget.checked; }));
    $('#approveSelectedBookings')?.addEventListener('click', async event => {
      const selected = $$('[data-select-booking]:checked').map(input => input.dataset.selectBooking);
      if (!selected.length) return window.toast?.('حدد حجزًا واحدًا على الأقل.');
      const button = event.currentTarget, old = button.innerHTML; button.disabled = true;
      try { for (const id of selected) await approveBookingFast(null, id); }
      finally { button.disabled = false; button.innerHTML = old; }
    });
    $('#loadMoreStudents')?.addEventListener('click', async event => { try { await busy(event.currentTarget, () => loadCollection('students', 50, true)); renderStudentRows(); } catch (error) { toastError(error, 'تعذر تحميل المزيد من الطلاب.'); } });
    $('#exportGradesBtn')?.addEventListener('click', () => { const header = ['studentCode', 'title', 'type', 'month', 'score', 'note']; const csv = [header.join(','), ...state.grades.map(item => header.map(key => `"${String(item[key] || '').replace(/"/g, '""')}"`).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); link.download = `technominds-grades-${nowDate()}.csv`; link.click(); URL.revokeObjectURL(link.href); });
    $('#startAttendanceScan').addEventListener('click', openScanner);
    $('#migrateCodesBtn').addEventListener('click', async event => {
      if (!confirm('سيتم ترحيل دفعة صغيرة من الأكواد القديمة إلى أكواد موحدة من 8 أرقام مع تحديث السجلات المرتبطة. متابعة؟')) return;
      try { const result = await busy(event.currentTarget, () => window.MFCloud.migrateLegacyStudentCodes({ limit: 5 })); $('#codeMigrationStatus').textContent = result.migrated.length ? `تم ترحيل ${result.migrated.length} طالب. اضغط مرة أخرى لاستكمال أي دفعة متبقية.` : 'لا توجد أكواد قديمة في الدفعة المفحوصة.'; await load(); } catch (error) { toastError(error, 'تعذر ترحيل الأكواد.'); }
    });
    $('#adminModalClose').addEventListener('click', async () => { await scanner?.stop?.(); scanner = null; closeModal(); });
    $('#adminModal').addEventListener('click', async event => { if (event.target.id === 'adminModal') { await scanner?.stop?.(); scanner = null; closeModal(); } });
    window.addEventListener('pagehide', async () => { await scanner?.stop?.(); scanner = null; });
    $('#adminLogoutBtn').addEventListener('click', async () => { await window.MFCloud.signOut(); location.replace('teacher-login.html'); });
    $('#adminExportBtn').addEventListener('click', () => { const header = ['name', 'studentCode', 'studentPhone', 'parentPhone', 'track', 'groupName', 'paymentStatus']; const csv = [header.join(','), ...state.students.map(student => header.map(key => `"${String(student[key] || '').replace(/"/g, '""')}"`).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); link.download = `technominds-students-${nowDate()}.csv`; link.click(); URL.revokeObjectURL(link.href); });

    document.addEventListener('click', async event => {
      const tabJump = event.target.closest('[data-admin-tab]'); if (tabJump) { await switchTab(tabJump.dataset.adminTab); return; }
      const open = event.target.closest('[data-open-modal]'); if (open) { await ensureModalData(open.dataset.openModal); if (open.dataset.openModal === 'student') openStudentModal(); else if (open.dataset.openModal === 'booking') location.href = 'booking.html'; else openModal(open.dataset.openModal); return; }
      if (event.target.closest('[data-jump-attendance]')) return switchTab('attendance');
      const copyCode = event.target.closest('[data-copy-code]'); if (copyCode) { await navigator.clipboard.writeText(copyCode.dataset.copyCode); copyCode.classList.add('saved'); setTimeout(() => copyCode.classList.remove('saved'), 900); return; }
      const studentAttendance = event.target.closest('[data-student-attendance]'); if (studentAttendance) { await switchTab('attendance'); $('#attendanceCode').value = studentAttendance.dataset.studentAttendance; $('#attendanceStatus').value = 'حاضر'; $('#attendanceSession').focus(); return; }
      const studentPayment = event.target.closest('[data-student-payment]'); if (studentPayment) { await ensureModalData('payment'); return openModal('payment', { studentCode: studentPayment.dataset.studentPayment, month: new Date().toISOString().slice(0, 7), status: 'paid', method: 'كاش' }); }
      const studentGrade = event.target.closest('[data-student-grade]'); if (studentGrade) { await ensureModalData('grade'); return openModal('grade', { studentCode: studentGrade.dataset.studentGrade, month: new Date().toISOString().slice(0, 7), type: 'manual' }); }
      const studentProgress = event.target.closest('[data-student-progress]'); if (studentProgress) { const [code, action] = studentProgress.dataset.studentProgress.split(':'); await switchTab('attendance'); $('#attendanceCode').value = code; if (action === 'homework') $('#attendanceHomework').checked = true; if (action === 'practical') $('#attendancePractical').checked = true; $('#attendanceSession').focus(); return; }
      const editGrade = event.target.closest('[data-edit-grade]'); if (editGrade) return openModal('grade', state.grades.find(item => item.id === editGrade.dataset.editGrade));
      const saveStaff = event.target.closest('[data-save-staff]'); if (saveStaff) { const row = saveStaff.closest('[data-staff-id]'); try { await busy(saveStaff, () => window.MFCloud.updateStaffRole({ uid: row.dataset.staffId, role: row.querySelector('[data-staff-role]').value, active: row.querySelector('[data-staff-active]').checked, name: state.staff.find(item => item.id === row.dataset.staffId)?.name || '' })); saveStaff.classList.add('saved'); } catch (error) { toastError(error); } return; }
      const paymentStatus = event.target.closest('[data-payment-status]'); if (paymentStatus) { await saveQuickPayment(paymentStatus); return; }
      const quickProgress = event.target.closest('[data-quick-progress]'); if (quickProgress) { const action = quickProgress.dataset.quickProgress; if (action === 'present') $('#attendanceStatus').value = 'حاضر'; if (action === 'absent') $('#attendanceStatus').value = 'غائب'; if (action === 'homework') $('#attendanceHomework').checked = true; if (action === 'practical') $('#attendancePractical').checked = true; if (action === 'participation') $('#attendanceParticipation').value = 'مشاركة متميزة'; if (action === 'note') $('#attendanceNote').focus(); if (action !== 'note' || $('#attendanceNote').value.trim()) await saveProgress(quickProgress, false); return; }
      const editStudent = event.target.closest('[data-edit-student]'); if (editStudent) return openStudentModal(studentByCode(editStudent.dataset.editStudent));
      const loadProgress = event.target.closest('[data-load-progress]'); if (loadProgress) { const item = state.classProgress.find(row => row.id === loadProgress.dataset.loadProgress); if (!item) return; switchTab('attendance'); $('#attendanceSession').value = item.sessionTitle || ''; $('#attendanceDate').value = item.date || nowDate(); $('#attendanceCode').value = item.studentCode || ''; $('#attendanceStatus').value = item.attendanceStatus || 'حاضر'; $('#attendanceHomework').checked = item.homeworkCompleted === true; $('#attendancePractical').checked = item.practicalCompleted === true; $('#attendanceParticipation').value = item.participation || ''; $('#attendanceNote').value = item.teacherNote || ''; return; }
      const edit = event.target.closest('[data-edit-record]'); if (edit) { const [collection, id] = edit.dataset.editRecord.split(':'); const type = { tracks: 'track', groups: 'group', payments: 'payment', materials: 'pdf', exams: 'exam', onlineLectures: 'online', services: 'service', reviews: 'review', assignments: 'assignment', practical_tasks: 'practicalTask' }[collection]; return openModal(type, recordFor(collection === 'practical_tasks' ? 'practicalTasks' : collection, id)); }
      const approve = event.target.closest('[data-approve-booking]'); if (approve) { await approveBookingFast(approve, approve.dataset.approveBooking); return; }
      const reject = event.target.closest('[data-reject-booking]'); if (reject) { const reason = prompt('سبب الرفض (اختياري):') || ''; try { await busy(reject, () => window.MFCloud.rejectBooking(reject.dataset.rejectBooking, reason)); await load(); } catch (error) { toastError(error); } return; }
      const removeStudent = event.target.closest('[data-delete-student]'); if (removeStudent) { if (!confirm('سيتم حذف الطالب وسجلاته وملفاته المرتبطة. متابعة؟')) return; try { await busy(removeStudent, () => window.MFCloud.deleteStudentSafely(removeStudent.dataset.deleteStudent)); await load(); } catch (error) { toastError(error); } return; }
      const remove = event.target.closest('[data-delete-record]'); if (remove) { const [collection, id] = remove.dataset.deleteRecord.split(':'); if (!confirm('تأكيد الحذف؟')) return; try { await busy(remove, () => window.MFCloud.adminDeleteRecord(collection, id)); await load(); } catch (error) { toastError(error); } return; }
      const qr = event.target.closest('[data-show-qr]'); if (qr) return showQr(qr.dataset.showQr);
      const whatsapp = event.target.closest('[data-whatsapp]'); if (whatsapp) return whatsappStudent(whatsapp.dataset.whatsapp);
      const code = event.target.closest('[data-change-code]'); if (code) return changeCode(code.dataset.changeCode);
      const toggleReview = event.target.closest('[data-toggle-review]'); if (toggleReview) { const review = state.reviews.find(item => item.id === toggleReview.dataset.toggleReview); try { await busy(toggleReview, () => window.MFCloud.adminUpsertRecord('reviews', review.id, { ...review, approved: !review.approved })); await load(); } catch (error) { toastError(error); } return; }
      const homework = event.target.closest('[data-review-homework]'); if (homework) { const [submissionId, status] = homework.dataset.reviewHomework.split(':'); const teacherNote = prompt('ملاحظة للطالب (اختياري):') || ''; try { await busy(homework, () => window.MFCloud.reviewHomeworkSubmission({ submissionId, status, teacherNote })); await load(); } catch (error) { toastError(error); } return; }
      const practicalReview = event.target.closest('[data-review-practical]'); if (practicalReview) { const submission = state.practicalSubmissions.find(item => item.id === practicalReview.dataset.reviewPractical); const score = prompt('درجة المهمة العملية من 100:', submission?.score ?? 0); if (score === null) return; const teacherNote = prompt('ملاحظة المدرس على الكود (اختياري):', submission?.teacherNote || '') || ''; try { await busy(practicalReview, () => window.MFCloud.reviewPracticalSubmission({ submissionId: practicalReview.dataset.reviewPractical, score: Number(score), teacherNote })); await load(); } catch (error) { toastError(error); } return; }
      const grade = event.target.closest('[data-grade-attempt]'); if (grade) { const score = prompt('الدرجة من 100:'); if (score === null) return; const teacherNotes = prompt('ملاحظات التصحيح:') || ''; try { await busy(grade, () => window.MFCloud.gradeExamAttempt({ attemptId: grade.dataset.gradeAttempt, score: Number(score), teacherNotes, publish: true })); await load(); } catch (error) { toastError(error); } }
      const publish = event.target.closest('[data-publish-attempt]'); if (publish) { try { await busy(publish, () => window.MFCloud.publishExamResult({ attemptId: publish.dataset.publishAttempt })); await load(); } catch (error) { toastError(error); } }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      staffProfile = await requireAdminSession();
      const welcome = $('#adminWelcomeName');
      if (welcome) welcome.textContent = staffProfile?.name || 'Eng. Amr Khaled';
      document.documentElement.dataset.staffRole = staffProfile?.role || '';
      $$('[data-admin-tab="staff"]').forEach(button => { button.hidden = staffProfile?.role !== 'admin'; });
      if (staffProfile?.role !== 'admin') $$('[data-admin-tab="payments"],[data-admin-tab="activity"],[data-admin-tab="errors"]').forEach(button => { button.hidden = true; });
      bind(); await load(); window.hydrateIcons?.();
    }
    catch (error) { window.toast?.(error.message); setTimeout(() => location.replace('teacher-login.html'), 900); }
  });
})();
