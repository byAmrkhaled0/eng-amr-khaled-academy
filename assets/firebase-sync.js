(function () {
  'use strict';

  const REGION = 'europe-west1';
  const config = window.MF_FIREBASE_CONFIG || {};
  const publicEmpty = () => ({
    students: [], bookings: [], payments: [], attendance: [], materials: [], questions: [],
    exams: [], examAttempts: [], grades: [], reviews: [], groups: [], assignments: [], files: [],
    services: [], onlineLectures: [], onlineLectureAttendance: [], settings: {}
  });

  const ERROR_MESSAGES = {
    'functions/invalid-argument': 'البيانات المدخلة غير صحيحة.',
    'functions/unauthenticated': 'سجّل الدخول أولًا ثم أعد المحاولة.',
    'functions/permission-denied': 'غير مصرح لك بتنفيذ هذه العملية.',
    'functions/not-found': 'لم يتم العثور على البيانات المطلوبة.',
    'functions/already-exists': 'تم تنفيذ هذا الطلب من قبل.',
    'functions/failed-precondition': 'لا يمكن تنفيذ العملية في حالتها الحالية.',
    'functions/resource-exhausted': 'تم إرسال طلبات كثيرة أو اكتملت السعة. حاول لاحقًا.',
    'functions/deadline-exceeded': 'انتهت مهلة العملية. حاول مرة أخرى.',
    'functions/unavailable': 'الخدمة غير متاحة مؤقتًا. حاول بعد قليل.',
    'functions/cancelled': 'تم إلغاء العملية قبل اكتمالها.',
    'functions/internal': 'حدث خطأ داخلي بالخدمة. تم تسجيله للمراجعة.',
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة.',
    'auth/user-disabled': 'هذا الحساب موقوف.',
    'auth/too-many-requests': 'محاولات دخول كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    'auth/network-request-failed': 'تعذر الوصول إلى خدمة تسجيل الدخول. أعد المحاولة بعد استقرار الاتصال.',
    'storage/unauthorized': 'غير مصرح لك برفع أو فتح هذا الملف.',
    'storage/canceled': 'تم إلغاء رفع الملف.',
    'storage/quota-exceeded': 'تم بلوغ سعة التخزين المتاحة.',
    'permission-denied': 'لا تملك صلاحية الوصول إلى هذه البيانات.'
  };

  function arabicError(error, fallback = 'حدث خطأ غير متوقع. حاول مرة أخرى.') {
    const code = String(error?.code || '');
    const serverMessage = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
    const message = ERROR_MESSAGES[code] || serverMessage || fallback;
    const wrapped = new Error(message);
    wrapped.code = code || 'unknown';
    wrapped.original = error;
    return wrapped;
  }

  if (!config.enabled || !window.firebase) {
    window.MFCloud = { ready: false, error: 'Firebase غير مفعل', arabicError };
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(config);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const storage = firebase.storage();
    let functionsPromise = null;

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const old = document.querySelector(`script[src="${src}"]`);
        if (old?.dataset.loaded === '1') return resolve();
        const script = old || document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => { script.dataset.loaded = '1'; resolve(); };
        script.onerror = () => reject(new Error('تعذر تحميل وحدة Firebase Functions.'));
        if (!old) document.head.appendChild(script);
      });
    }

    async function getFunctions() {
      if (firebase.functions) return firebase.app().functions(REGION);
      if (!functionsPromise) {
        functionsPromise = loadScript('assets/vendor/firebase-functions-compat.js').then(() => {
          if (!firebase.functions) throw new Error('وحدة Firebase Functions غير متاحة.');
          return firebase.app().functions(REGION);
        });
      }
      return functionsPromise;
    }

    async function call(name, data = {}) {
      try {
        const functions = await getFunctions();
        const response = await functions.httpsCallable(name)(data);
        return response.data;
      } catch (error) {
        throw arabicError(error);
      }
    }

    async function getStaffProfile() {
      const user = auth.currentUser;
      if (!user) return null;
      const snap = await db.collection('users').doc(user.uid).get();
      return snap.exists ? { uid: user.uid, email: user.email, ...snap.data() } : null;
    }

    async function isStaff() {
      const profile = await getStaffProfile().catch(() => null);
      return !!profile && profile.active !== false && ['admin', 'teacher', 'assistant'].includes(profile.role);
    }

    function rows(snapshot) {
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async function getCollection(name, limit = 250) {
      const snap = await db.collection(name).limit(limit).get();
      return rows(snap);
    }

    async function loadSiteData() {
      const data = publicEmpty();
      const staff = await isStaff();
      if (staff) {
        const names = ['students', 'bookings', 'payments', 'class_progress', 'materials', 'exams', 'exam_attempts', 'reviews', 'groups', 'tracks', 'settings', 'assignments', 'services', 'onlineLectures', 'onlineLectureAttendance', 'homework_submissions', 'practical_tasks', 'practical_submissions'];
        const results = await Promise.all(names.map(name => getCollection(name, name === 'class_progress' ? 500 : 250).catch(() => [])));
        const map = Object.fromEntries(names.map((name, index) => [name, results[index]]));
        return {
          ...data,
          ...map,
          settings: (map.settings || []).reduce((all, item) => ({ ...all, ...item }), {}),
          attendance: map.class_progress,
          examAttempts: map.exam_attempts,
          onlineLectures: map.onlineLectures,
          onlineLectureAttendance: map.onlineLectureAttendance,
          homeworkSubmissions: map.homework_submissions,
          practicalTasks: map.practical_tasks,
          practicalSubmissions: map.practical_submissions
        };
      }
      const [reviews, services, materials, publicContent] = await Promise.all([
        db.collection('reviews').where('approved', '==', true).limit(50).get().then(rows).catch(() => []),
        getCollection('services', 50).catch(() => []),
        db.collection('materials').where('isPublic', '==', true).where('status', '==', 'منشور').limit(80).get().then(rows).catch(() => []),
        getCollection('public_content', 20).catch(() => [])
      ]);
      data.reviews = reviews;
      data.services = services;
      data.materials = materials;
      data.settings = publicContent.reduce((all, item) => ({ ...all, ...item }), {});
      return data;
    }

    async function uploadStaffFile(file, folder = 'teacher-uploads/materials') {
      if (!file) throw new Error('اختر ملفًا أولًا.');
      if (file.size > 15 * 1024 * 1024) throw new Error('حجم الملف أكبر من 15 ميجابايت.');
      const prepared = await call('prepareStaffUpload', { isPublic: folder.startsWith('public/'), file: { name: file.name, contentType: file.type || 'text/plain', size: file.size } });
      const response = await fetch(prepared.uploadUrl, { method: prepared.method || 'PUT', headers: prepared.headers || {}, body: file });
      if (!response.ok) throw new Error(`فشل رفع الملف (HTTP ${response.status}).`);
      return { path: prepared.path, url: prepared.downloadUrl, fileName: file.name, contentType: file.type, size: file.size };
    }

    async function uploadHomework(file, studentCode, assignmentId) {
      const prepared = await call('prepareHomeworkUpload', {
        studentCode,
        assignmentId,
        file: { name: file.name, contentType: file.type || 'text/plain', size: file.size },
        deviceId: getDeviceId()
      });
      const response = await fetch(prepared.uploadUrl, { method: prepared.method || 'PUT', headers: prepared.headers || {}, body: file });
      if (!response.ok) throw new Error(`فشل رفع الملف (HTTP ${response.status}).`);
      return call('registerHomeworkSubmission', { ticketId: prepared.ticketId, token: prepared.token, deviceId: getDeviceId() });
    }

    function getDeviceId() {
      const key = 'tm_device_id';
      try {
        let id = localStorage.getItem(key);
        if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; localStorage.setItem(key, id); }
        return id;
      } catch (_) { return 'browser'; }
    }

    window.MFCloud = {
      ready: true,
      db,
      auth,
      storage,
      region: REGION,
      arabicError,
      getDeviceId,
      call,
      loadSiteData,
      loadBookingGroups: track => call('getBookingGroups', { track, deviceId: getDeviceId() }).then(result => result.groups || []),
      createBooking: booking => call('createBooking', { ...booking, deviceId: getDeviceId() }),
      getBookingByCode: code => call('getBookingStatus', { code, deviceId: getDeviceId() }),
      approveBooking: bookingId => call('approveBooking', { bookingId }),
      rejectBooking: (bookingId, reason = '') => call('rejectBooking', { bookingId, reason }),
      createStudentAccess: data => call('createStudentAccess', data),
      migrateLegacyStudentCodes: data => call('migrateLegacyStudentCodes', data || {}),
      createStudentSafely: data => call('createStudentSafely', data),
      updateStudentSafely: data => call('updateStudentSafely', data),
      getStudentByCode: code => call('getPortalStudent', { code, portal: 'student', deviceId: getDeviceId() }),
      getParentStudent: code => call('getPortalStudent', { code, portal: 'parent', deviceId: getDeviceId() }),
      recordClassProgress: data => call('recordClassProgress', data),
      startExam: data => call('startExam', { ...data, deviceId: getDeviceId() }),
      submitExam: data => call('submitExam', { ...data, deviceId: getDeviceId() }),
      gradeExamAttempt: data => call('gradeExamAttempt', data),
      publishExamResult: data => call('publishExamResult', data),
      approveExamResult: data => call('approveExamResult', data),
      createExam: data => call('createExam', data),
      createAssignment: data => call('createAssignment', data),
      createPracticalTask: data => call('createPracticalTask', data),
      recordPayment: data => call('recordPayment', data),
      recordGrade: data => call('recordGrade', data),
      uploadHomework,
      reviewHomeworkSubmission: data => call('reviewHomeworkSubmission', data),
      reviewHomework: data => call('reviewHomework', data),
      reviewPracticalSubmission: data => call('reviewPracticalSubmission', data),
      createReview: review => call('createReview', { ...review, deviceId: getDeviceId() }),
      getPublicLeaderboard: (track, month) => call('getPublicLeaderboard', { track, month, deviceId: getDeviceId() }),
      deleteStudentSafely: studentCode => call('deleteStudentSafely', { studentCode }),
      adminUpsertRecord: (collection, id, data) => call('adminUpsertRecord', { collection, id, data }),
      adminDeleteRecord: (collection, id) => call('adminDeleteRecord', { collection, id }),
      listAdminRecords: options => call('listAdminRecords', options),
      getAdminDashboard: () => call('getAdminDashboard', {}),
      listStaffAccounts: () => call('listStaffAccounts', {}),
      updateStaffRole: data => call('updateStaffRole', data),
      searchAdminRecords: options => call('searchAdminRecords', options),
      reportClientError: payload => call('reportClientError', { ...payload, deviceId: getDeviceId() }),
      getCodeLanguages: () => call('getCodeLanguages', { deviceId: getDeviceId() }),
      submitCodeExecution: data => call('submitCodeExecution', { ...data, deviceId: getDeviceId() }),
      getCodeExecutionResult: token => call('getCodeExecutionResult', { token, deviceId: getDeviceId() }),
      submitPracticalTask: data => call('submitPracticalTask', { ...data, deviceId: getDeviceId() }),
      getPracticalTaskResult: data => call('getPracticalTaskResult', { ...data, deviceId: getDeviceId() }),
      savePracticalDraft: data => call('savePracticalDraft', { ...data, deviceId: getDeviceId() }),
      uploadAttachment: uploadStaffFile,
      signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
      signOut: () => auth.signOut(),
      onAuthStateChanged: callback => auth.onAuthStateChanged(callback),
      getCurrentStaffProfile: async () => {
        const profile = await getStaffProfile();
        return { ...profile, allowed: !!profile && profile.active !== false && ['admin', 'teacher', 'assistant'].includes(profile.role) };
      },
      saveSiteData: async () => { throw new Error('تم إيقاف الحفظ الجماعي من المتصفح. استخدم الدالة المخصصة لكل عملية.'); },
      saveBooking: async () => { throw new Error('استخدم createBooking بدل الكتابة المباشرة.'); },
      saveReview: review => call('createReview', review),
      saveExamAttempt: async () => { throw new Error('استخدم startExam وsubmitExam بدل الكتابة المباشرة.'); }
    };
  } catch (error) {
    console.error('Firebase initialization failed', error?.code || error?.message);
    window.MFCloud = { ready: false, error: 'تعذر تشغيل Firebase في هذا المتصفح.', arabicError };
  }
})();
