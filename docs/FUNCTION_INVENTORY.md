# تحديث نطاق Functions — 13 سبتمبر 2026

هذه قائمة مصدر محلي وليست إثباتًا لحالة النشر. لا وظائف جديدة ولا تغيير موارد التشغيل في هذه الدفعة.

| التغيير | الصادرات المباشرة |
|---|---|
| بنك PDF تابع للدرس ووراثة جمهوره والتحقق من الملف | upsertCurriculumEntity |
| الفلترة وصفحات ثابتة عند تساوي الترتيب | listCurriculumAdmin |
| إظهار البنوك تحت الدرس والتحقق من صلاحياته | getStudentResources، getLectureContent، getCurriculumFileUrl |
| حفظ null للدرجة السابقة المعلقة في التدقيق | reviewHomeworkSubmission |
| استبعاد المؤرشف | مسارات contentIsOpen ومنها getStudentCurriculum وrecordLectureProgress |
| توحيد درجات الواجب والإعادات والمعلق | مستهلكو functions/lib/portal-results.js ومنها getPortalStudent وgetStudentAdminProfile وgetExamDashboard |

انشر الحزمة المتماسكة من entry.js بعد المراجعة. لا تحذف الوظائف البعيدة غير الموجودة محليًا دون مراجعة تبعياتها. تحقق من الرحلات بعد النشر؛ تطابق اسم التصدير وحده لا يثبت نجاحه.

الجدول التالي تاريخي. القيم غير المحلولة فيه لا تعني concurrency فعليًا؛ استعلم عن الخدمة المنشورة قبل أي ضبط تكلفة أو سعة.

---

# صادرات Functions في حزمة المراجعة

الجدول ناتج من metadata للصادرات المحلية، وليس قائمة وظائف منشورة. القيم غير المصرح بها صراحة ترث defaults؛ لا تستنتج عدد مثيلات فعليًا منها.

| الوظيفة | النوع | المنطقة | MiB | timeout s | maxInstances | concurrency |
|---|---|---|---:|---:|---:|---:|
| activateOwnerAccount | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| addStudentMotivationPoints | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| approveBooking | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| archiveContentItem | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| bulkMarkAttendance | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| cancelPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| cleanupArchivedStorage | schedule | europe-west1 | 512 | 300 | 10 | غير محلول في التصدير التاريخي |
| createBackupNow | callable | europe-west1 | 512 | 540 | 10 | غير محلول في التصدير التاريخي |
| createBooking | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| createMonthlyExamPlan | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| createPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| createReview | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| createStudentAccess | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| createStudentTransferRequest | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| deleteCurriculumEntity | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| deleteStudentSafely | callable | europe-west1 | 512 | 120 | 10 | غير محلول في التصدير التاريخي |
| editPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| finalizeExamAbsences | schedule | europe-west1 | 512 | 300 | 10 | غير محلول في التصدير التاريخي |
| finalizeExamAbsencesAdmin | callable | europe-west1 | 512 | 120 | 10 | غير محلول في التصدير التاريخي |
| freezeLeaderboardMonthAdmin | callable | europe-west1 | 512 | 120 | 10 | غير محلول في التصدير التاريخي |
| freezeMonthlyLeaderboard | schedule | europe-west1 | 512 | 180 | 10 | غير محلول في التصدير التاريخي |
| getAdminCollectionPage | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getAdminOperationsDashboard | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| getBackupDownloadUrl | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getBookingStatus | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getClassSessionWorkspace | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getCodeExecutionResult | callable | europe-west1 | 256 | 15 | 10 | غير محلول في التصدير التاريخي |
| getCodeLanguages | callable | europe-west1 | 256 | 15 | 10 | غير محلول في التصدير التاريخي |
| getCurriculumFileUrl | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getExamDashboard | callable | europe-west1 | 512 | 30 | 20 | 80 |
| getHomeworkAdminWorkspace | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getLectureContent | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getMotivationLeaderboardAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getMotivationSettingsAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getParentMonthlyReport | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| getPaymentDashboard | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| getPaymentHistory | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getPlatformHealth | callable | europe-west1 | 256 | 15 | 10 | غير محلول في التصدير التاريخي |
| getPlatformHealthHttp | HTTP | europe-west1 | 256 | 15 | 10 | غير محلول في التصدير التاريخي |
| getPortalStudent | callable | europe-west1 | 512 | 30 | 20 | 80 |
| getPublicLeaderboard | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getStudentAdminProfile | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getStudentCurriculum | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getStudentLeaderboardPosition | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getStudentMonthlyReportAdmin | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| getStudentMotivationAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getStudentResources | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| getTheoryLectureAnalytics | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| grantHomeworkRetake | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_assignments | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_attendance | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_class_sessions | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_exam_attempts | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_exam_sessions | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_exams | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_grades | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_homework_submissions | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_monthly_payments | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_recitations | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_student_transfer_requests | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| invalidateReport_students | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| listAutomaticBackups | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| listCurriculumAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| logStaffActivity | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| migrateCurriculumV61 | callable | europe-west1 | 1024 | 540 | 10 | غير محلول في التصدير التاريخي |
| migrateLegacyPayments | callable | europe-west1 | 512 | 540 | 10 | غير محلول في التصدير التاريخي |
| migratePlatformV63 | callable | europe-west1 | 1024 | 540 | 10 | غير محلول في التصدير التاريخي |
| migrateStudentCodeSafely | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| notifyStaffOnBookingCreated | event | europe-west1 | 256 | غير محلول في التصدير التاريخي | 10 | غير محلول في التصدير التاريخي |
| prepareHomeworkUpload | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| prepareMonthlyParentReports | schedule | europe-west1 | 512 | 540 | 10 | غير محلول في التصدير التاريخي |
| prepareOfflineAttendance | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| previewAutomaticBackup | callable | europe-west1 | 512 | 120 | 10 | غير محلول في التصدير التاريخي |
| recordAttendance | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| recordClassProgress | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| recordLectureProgress | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| regenerateParentAccessCode | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| registerHomeworkSubmission | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| registerTeacherPushToken | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| rejectBooking | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| repairLegacyExamFormats | callable | europe-west1 | 512 | 540 | 10 | غير محلول في التصدير التاريخي |
| reportClientError | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| restoreAutomaticBackup | callable | europe-west1 | 1024 | 540 | 1 | 1 |
| restoreContentItem | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| reverseStudentMotivationTransaction | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| reviewExamAttempt | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| reviewHomeworkSubmission | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| reviewStudentTransferRequest | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| saveExamProgress | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| saveMotivationSettingsAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| saveStudentPrivateNote | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| scheduledPlatformBackup | schedule | europe-west1 | 512 | 540 | 10 | غير محلول في التصدير التاريخي |
| searchStudentsAdmin | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| startExam | callable | europe-west1 | 512 | 30 | 20 | 80 |
| submitAssignmentAnswer | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| submitCodeExecution | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| submitExam | callable | europe-west1 | 512 | 30 | 20 | 80 |
| syncOfflineAttendance | callable | europe-west1 | 512 | 60 | 10 | غير محلول في التصدير التاريخي |
| unifyLegacyStudentAccess | schedule | europe-west1 | 256 | 120 | 10 | غير محلول في التصدير التاريخي |
| unifyStudentAccessCodes | callable | europe-west1 | 512 | 120 | 10 | غير محلول في التصدير التاريخي |
| unregisterTeacherPushToken | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| updateStudentSafely | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| upsertClassSession | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| upsertCurriculumEntity | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| upsertGroupSchedule | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
| upsertVersionedContent | callable | europe-west1 | 256 | 30 | 10 | غير محلول في التصدير التاريخي |
