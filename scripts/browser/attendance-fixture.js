// Local browser fixture only; scripts/ is excluded from the production build.
// Load the real teacher styles, renderers and wrappers. Never load Firebase SDKs.
window.MFCloud = { ready: false };
window.OfflineAttendance = {
  counts: async () => ({ roster: 26, pending: 2, syncing: 0, synced: 0, failed: 0, total: 2 }),
  getQueue: async () => []
};
document.addEventListener('DOMContentLoaded', () => {
  const date = isoDateAdmin();
  const course = GRADES[0];
  currentStaff = { uid: 'fixture-admin', name: 'مدرس تجريبي', role: 'admin', allowed: true };
  currentSection = 'attendance';
  adminData = {
    settings: { academicYear: '2026/2027', term: 'الترم الأول' },
    groups: [{ id: 'demo-group', name: 'مجموعة تجريبية', grade: course, days: 'يوميًا', active: true }],
    students: Array.from({ length: 26 }, (_, index) => ({
      id: `DEMO${index + 1}`, studentCode: `DEMO${index + 1}`,
      name: `طالب تجريبي ${index + 1}`, grade: course, group: 'مجموعة تجريبية',
      scheduleId: 'demo-group', active: true, academicYear: '2026/2027',
      attendance: index < 6 ? [{ date, status: 'present', time: '17:00' }] : [],
      grades: [], homeworks: [], recitations: []
    }))
  };
  // Disable remote listeners, camera preloading and persistence in this fixture.
  startBookingNotifications = () => {};
  startAdminLiveData = () => {};
  window.__adminQrOfflinePrepared = true;
  saveData = () => {};
  sessionStorage.removeItem('attGrade');
  sessionStorage.removeItem('attGroup');
  // Other production modules install wrappers on DOMContentLoaded; render after them.
  setTimeout(() => renderAdmin(), 100);
});
