(function(){
  'use strict';

  const cfg = window.MF_FIREBASE_CONFIG || {};
  if(!cfg.enabled || typeof firebase === 'undefined'){
    window.MFCloud = { ready:false, error:'Firebase غير مفعل' };
    return;
  }

  const cleanDocId = value => String(value || '').trim().replace(/[\\/#?\[\]]/g,'-');
  const digits = value => String(value || '').replace(/\D/g,'');
  const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();

  try{
    const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();
    const siteDoc = db.collection('settings').doc('siteData');

    function normalizedStudent(raw){
      const s = raw || {};
      const code = String(s.studentCode || s.code || s.id || '').trim();
      return {
        id: code,
        code,
        studentCode: code,
        name: s.studentName || s.name || '',
        studentName: s.studentName || s.name || '',
        studentPhone: s.studentPhone || '',
        parentPhone: s.parentPhone || '',
        grade: s.grade || '',
        month: s.month || '',
        group: s.group || s.mode || '',
        paid: !!s.paid,
        paymentDate: s.paymentDate || '',
        notes: s.notes || '',
        attendance: Array.isArray(s.attendance) ? s.attendance : [],
        grades: Array.isArray(s.grades) ? s.grades : [],
        homeworks: Array.isArray(s.homeworks) ? s.homeworks : [],
        recitations: Array.isArray(s.recitations) ? s.recitations : []
      };
    }

    function portalPayload(student, extra){
      const s = normalizedStudent(student);
      return {
        studentId: s.id,
        studentCode: s.studentCode,
        code: s.studentCode,
        studentName: s.studentName,
        name: s.studentName,
        parentPhoneDigits: digits(s.parentPhone),
        grade: s.grade,
        group: s.group,
        month: s.month,
        paid: s.paid,
        paymentDate: s.paymentDate || '',
        notes: s.notes || '',
        attendance: s.attendance || [],
        grades: s.grades || [],
        homeworks: s.homeworks || [],
        recitations: s.recitations || [],
        ...(extra || {}),
        updatedAt: serverTime()
      };
    }

    async function upload(file, folder){
      if(!file) throw new Error('No file selected');
      const safeName = `${Date.now()}-${file.name}`.replace(/[\\/#?\[\]]/g,'-');
      const path = `${folder || 'public/uploads'}/${safeName}`;
      const ref = storage.ref(path);
      await ref.put(file, { contentType:file.type || 'application/octet-stream' });
      return { url: await ref.getDownloadURL(), path, fileName:file.name, size:file.size, contentType:file.type };
    }

    async function mirrorStudent(student, batch){
      const s = normalizedStudent(student);
      if(!s.studentCode) return;
      const id = cleanDocId(s.studentCode);
      const studentRef = db.collection('students').doc(id);
      const studentData = { ...s, updatedAt:serverTime() };
      delete studentData.id;
      batch.set(studentRef, studentData, { merge:true });
      batch.set(db.collection('student_portal').doc(id), portalPayload(s), { merge:true });
      const parentId = cleanDocId(`${s.studentCode}_${digits(s.parentPhone)}`);
      if(digits(s.parentPhone)) batch.set(db.collection('parent_portal').doc(parentId), portalPayload(s), { merge:true });
      batch.set(db.collection('payments').doc(id), {
        studentId:id, studentCode:s.studentCode, studentName:s.studentName, grade:s.grade, group:s.group,
        paid:s.paid, paymentDate:s.paymentDate || '', updatedAt:serverTime()
      }, { merge:true });
    }

    async function mirrorPayloadToCollections(payload){
      const data = payload || {};
      // مزامنة حالة الدفع من سجلات payments إلى الطلاب قبل المرايا
      const payList = Array.isArray(data.payments) ? data.payments : [];
      (data.students || []).forEach(st=>{
        const code = String(st.studentCode || st.code || st.id || '').trim();
        const lastPaid = [...payList].reverse().find(p => String(p.studentCode || p.code || '').trim()===code || String(p.student || p.studentName || '')===String(st.name || st.studentName || ''));
        if(lastPaid){ st.paid = lastPaid.status === 'تم الدفع'; st.paymentDate = lastPaid.date || st.paymentDate || ''; }
      });
      const batch = db.batch();
      (data.students || []).forEach(st => mirrorStudent(st, batch));
      (data.bookings || []).forEach(b=>{
        const id = cleanDocId(b.code || b.id || `${Date.now()}`);
        batch.set(db.collection('bookings').doc(id), { ...b, id:b.id || id, code:b.code || id, updatedAt:serverTime() }, { merge:true });
      });
      (data.materials || []).forEach(m=>{
        const id = cleanDocId(m.id || m.title || `${Date.now()}`);
        batch.set(db.collection('materials').doc(id), { ...m, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.questions || []).forEach(q=>{
        const id = cleanDocId(q.id || q.title || `${Date.now()}`);
        batch.set(db.collection('questions').doc(id), { ...q, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.exams || []).forEach(e=>{
        const id = cleanDocId(e.id || e.title || `${Date.now()}`);
        batch.set(db.collection('exams').doc(id), { ...e, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.reviews || []).forEach(r=>{
        const id = cleanDocId(r.id || `${Date.now()}-${r.name || 'review'}`);
        batch.set(db.collection('reviews').doc(id), { ...r, id, approved:r.approved !== false, updatedAt:serverTime() }, { merge:true });
      });
      (data.onlineLectures || []).forEach(l=>{
        const id = cleanDocId(l.id || l.title || `${Date.now()}`);
        batch.set(db.collection('onlineLectures').doc(id), { ...l, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.onlineLectureAttendance || []).forEach(a=>{
        const id = cleanDocId(a.id || `${a.lectureId || 'lecture'}_${a.studentCode || 'guest'}_${Date.now()}`);
        batch.set(db.collection('onlineLectureAttendance').doc(id), { ...a, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.groups || []).forEach(g=>{
        const id = cleanDocId(g.id || g.name || `${Date.now()}`);
        batch.set(db.collection('groups').doc(id), { ...g, id, updatedAt:serverTime() }, { merge:true });
      });

      (data.files || []).forEach(item=>{
        const id = cleanDocId(item.id || item.title || `${Date.now()}`);
        batch.set(db.collection('files').doc(id), { ...item, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.assignments || []).forEach(a=>{
        const id = cleanDocId(a.id || a.title || `${Date.now()}`);
        batch.set(db.collection('assignments').doc(id), { ...a, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.grades || []).forEach(g=>{
        const id = cleanDocId(g.id || `${g.studentCode || g.code || 'student'}_${g.exam || g.examTitle || 'exam'}_${g.date || Date.now()}`);
        batch.set(db.collection('grades').doc(id), { ...g, id, updatedAt:serverTime() }, { merge:true });
      });
      (data.examAttempts || []).forEach(a=>{
        const id = cleanDocId(a.id || `${a.examId || 'exam'}_${a.studentCode || 'student'}`);
        batch.set(db.collection('exam_submissions').doc(id), { ...a, id, updatedAt:serverTime() }, { merge:true });
      });
      await batch.commit();
    }

    async function getDocs(collection, limit){
      const ref = limit ? db.collection(collection).limit(limit) : db.collection(collection);
      const snap = await ref.get();
      return snap.docs.map(d=>({ id:d.id, ...d.data() }));
    }

    async function loadFromCollections(){
      const [students, bookings, materials, questions, exams, reviews, groups, onlineLectures, onlineLectureAttendance, files, assignments, submissions, legacyAttempts, grades] = await Promise.all([
        getDocs('students').catch(()=>[]),
        getDocs('bookings').catch(()=>[]),
        getDocs('materials').catch(()=>[]),
        getDocs('questions').catch(()=>[]),
        getDocs('exams').catch(()=>[]),
        getDocs('reviews').catch(()=>[]),
        getDocs('groups').catch(()=>[]),
        getDocs('onlineLectures').catch(()=>[]),
        getDocs('onlineLectureAttendance', 500).catch(()=>[]),
        getDocs('files').catch(()=>[]),
        getDocs('assignments').catch(()=>[]),
        getDocs('exam_submissions', 500).catch(()=>[]),
        getDocs('exam_attempts', 500).catch(()=>[]),
        getDocs('grades', 500).catch(()=>[])
      ]);
      const attempts = [...(submissions||[]), ...(legacyAttempts||[]).filter(a=>!(submissions||[]).some(s=>String(s.id)===String(a.id)))];
      const normalizedStudents = students.map(normalizedStudent);
      (grades || []).forEach(g=>{
        const code = String(g.studentCode || g.code || '').trim();
        const st = normalizedStudents.find(s=>String(s.studentCode).trim()===code);
        if(st) st.grades = [...(st.grades || []), g];
      });
      return {
        students: normalizedStudents,
        bookings, materials, questions, exams, reviews, groups, onlineLectures, onlineLectureAttendance, files, assignments, examAttempts:attempts, grades
      };
    }

    async function getCurrentStaffProfile(){
      const user = auth.currentUser;
      if(!user) return null;
      let profile = {};
      let source = 'none';

      // الطريقة الأساسية: document ID يساوي UID بتاع حساب Firebase Authentication
      const userDoc = await db.collection('users').doc(user.uid).get();
      if(userDoc.exists){
        profile = userDoc.data() || {};
        source = 'uid';
      }else{
        // fallback لو اتعمل document ID بالاسم بالغلط لكن جواه نفس الإيميل
        const byEmail = await db.collection('users')
          .where('email','==',user.email)
          .limit(1)
          .get()
          .catch(()=>null);
        if(byEmail && !byEmail.empty){
          profile = byEmail.docs[0].data() || {};
          source = 'email';
        }
      }

      const role = String(profile.role || '').trim().toLowerCase();
      const allowed = ['admin','teacher','assistant'].includes(role) && profile.active !== false;
      return { uid:user.uid, email:user.email, role, allowed, profileSource:source, ...profile };
    }

    async function upsertAttendance(record){
      const docId = cleanDocId(`${record.studentId || record.studentCode}_${record.date}`);
      const payload = { ...record, id:docId, updatedAt:serverTime() };
      await db.collection('attendance').doc(docId).set(payload, { merge:true });
      return { id:docId, ...payload };
    }

    async function getAttendanceForDate(date, grade, group){
      let q = db.collection('attendance').where('date','==',date);
      if(grade && grade !== 'all') q = q.where('grade','==',grade);
      if(group && group !== 'all') q = q.where('group','==',group);
      const snap = await q.get();
      return snap.docs.map(d=>({ id:d.id, ...d.data() }));
    }

    async function attemptsForStudent(code){
      const clean = String(code || '').trim();
      if(!clean) return [];
      const snap = await db.collection('exam_submissions').where('studentCode','==',clean).limit(100).get().catch(()=>null);
      return snap ? snap.docs.map(d=>({ id:d.id, ...d.data() })) : [];
    }

    async function getStudentByCode(code){
      const id = cleanDocId(code);
      if(!id) return null;
      const snap = await db.collection('student_portal').doc(id).get();
      if(!snap.exists) return null;
      const st = normalizedStudent({ id:snap.id, ...snap.data() });
      st.examAttempts = await attemptsForStudent(st.studentCode);
      return st;
    }


    async function getBookingByCode(code){
      const id = cleanDocId(code);
      if(!id) return null;
      const snap = await db.collection('bookings').doc(id).get().catch(()=>null);
      if(snap && snap.exists) return { id:snap.id, ...snap.data() };
      return null;
    }

    async function getParentStudent(code){
      const id = cleanDocId(code);
      if(!id) return null;
      // دخول ولي الأمر بالكود فقط: نستخدم نفس بيانات بوابة الطالب، بدون رقم هاتف.
      const snap = await db.collection('student_portal').doc(id).get();
      if(!snap.exists) return null;
      const st = normalizedStudent({ id:snap.id, ...snap.data() });
      st.examAttempts = await attemptsForStudent(st.studentCode);
      return st;
    }

    window.MFCloud = {
      ready:true, app, auth, db, storage, cleanDocId, normalizePhoneDigits:digits,
      currentUser:()=>auth.currentUser,
      signIn:(email,password)=>auth.signInWithEmailAndPassword(email,password),
      signOut:()=>auth.signOut(),
      getCurrentStaffProfile,
      loadSiteData: async()=>{
        const site = await siteDoc.get().catch(()=>null);
        const fromCollections = await loadFromCollections().catch(()=>null);
        if(fromCollections && Object.values(fromCollections).some(v=>Array.isArray(v) && v.length)) return fromCollections;
        if(site && site.exists && site.data().payload) return site.data().payload;
        return fromCollections || null;
      },
      saveSiteData: async(payload)=>{
        // لا نوقف حفظ الجداول لو إعدادات الموقع ممنوعة في Firestore Rules مؤقتًا
        await siteDoc.set({ payload, updatedAt:serverTime() }, { merge:true }).catch(()=>{});
        await mirrorPayloadToCollections(payload);
      },
      saveStudent: async(student)=>{
        const batch = db.batch();
        await mirrorStudent(student, batch);
        await batch.commit();
      },
      createBooking: async(booking)=>{
        const raw = booking || {};
        const code = String(raw.code || raw.studentCode || raw.id || `ST-${Date.now()}`).trim();
        const id = cleanDocId(code);
        const payload = {
          ...raw,
          id,
          code,
          studentCode: code,
          name: raw.name || raw.studentName || '',
          studentName: raw.studentName || raw.name || '',
          studentPhone: raw.studentPhone || '',
          parentPhone: raw.parentPhone || '',
          grade: raw.grade || '',
          month: raw.month || '',
          group: raw.group || raw.groupName || '',
          groupId: raw.groupId || '',
          groupName: raw.groupName || raw.group || '',
          groupSchedule: raw.groupSchedule || '',
          groupMode: raw.groupMode || '',
          notes: raw.notes || '',
          status: raw.status || 'بانتظار الموافقة',
          date: raw.date || new Date().toISOString().slice(0,10),
          createdAt: serverTime(),
          updatedAt: serverTime()
        };
        await db.collection('bookings').doc(id).set(payload, { merge:true });
        return payload;
      },
      saveReview: async(review)=>{
        const id = cleanDocId(review.id || `${Date.now()}-${review.name || 'review'}`);
        await db.collection('reviews').doc(id).set({ ...review, id, approved:true, hidden:false, createdAt:serverTime(), updatedAt:serverTime() }, { merge:true });
      },
      saveExamAttempt: async(attempt)=>{
        const id = cleanDocId(attempt.id || `${attempt.examId}_${attempt.studentCode}`);
        const payload = { ...attempt, id, updatedAt:serverTime(), createdAt: attempt.createdAt || serverTime() };
        await db.collection('exam_submissions').doc(id).set(payload, { merge:true });
      },
      updateExamSubmission: async(attempt)=>{
        const id = cleanDocId(attempt.id || `${attempt.examId}_${attempt.studentCode}`);
        const payload = { ...attempt, id, updatedAt:serverTime() };
        await db.collection('exam_submissions').doc(id).set(payload, { merge:true });
      },
      upsertAttendance,
      getAttendanceForDate,
      getBookingByCode,
      getStudentByCode,
      getParentStudent,
      recordOnlineLectureAttendance: async(record)=>{
        const id = cleanDocId(record.id || `${record.lectureId || 'lecture'}_${record.studentCode || 'guest'}_${Date.now()}`);
        const payload = { ...record, id, joinedAt: record.joinedAt || serverTime(), updatedAt:serverTime() };
        await db.collection('onlineLectureAttendance').doc(id).set(payload, { merge:true });
        return payload;
      },
      uploadHomework: async(file, studentCode)=>{
        const up = await upload(file, `homework/${cleanDocId(studentCode)}`);
        await db.collection('homework_submissions').add({ studentCode, ...up, createdAt:serverTime() }).catch(()=>{});
        return up;
      },
      uploadAttachment:(file, folder)=>upload(file, folder || 'teacher-uploads'),
      deleteAttachment: async(path)=>{
        if(path) await storage.ref(path).delete();
      },
      deleteDocument: async(collection,id)=>{
        if(collection && id) await db.collection(collection).doc(cleanDocId(id)).delete();
      },
      deleteWhere: async(collection, field, value)=>{
        const snap = await db.collection(collection).where(field,'==',value).get();
        if(snap.empty) return;
        const batch = db.batch();
        snap.forEach(doc=>batch.delete(doc.ref));
        await batch.commit();
      }
    };
  }catch(err){
    window.MFCloud = { ready:false, error:err };
  }
})();
