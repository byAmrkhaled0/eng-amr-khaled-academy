# صادرات Functions في حزمة المراجعة

الجدول ناتج من metadata للصادرات المحلية، وليس قائمة وظائف منشورة. القيم غير المصرح بها صراحة ترث defaults؛ لا تستنتج عدد مثيلات فعليًا منها.

| الوظيفة | النوع | المنطقة | MiB | timeout s | maxInstances | concurrency |
|---|---|---|---:|---:|---:|---:|
| activateOwnerAccount | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| addStudentMotivationPoints | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| approveBooking | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| archiveContentItem | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| bulkMarkAttendance | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| cancelPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| cleanupArchivedStorage | schedule | europe-west1 | 512 | 300 | 10 | [object Object] |
| createBackupNow | callable | europe-west1 | 512 | 540 | 10 | [object Object] |
| createBooking | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| createMonthlyExamPlan | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| createPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| createReview | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| createStudentAccess | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| createStudentTransferRequest | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| deleteCurriculumEntity | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| deleteStudentSafely | callable | europe-west1 | 512 | 120 | 10 | [object Object] |
| editPaymentTransaction | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| finalizeExamAbsences | schedule | europe-west1 | 512 | 300 | 10 | [object Object] |
| finalizeExamAbsencesAdmin | callable | europe-west1 | 512 | 120 | 10 | [object Object] |
| freezeLeaderboardMonthAdmin | callable | europe-west1 | 512 | 120 | 10 | [object Object] |
| freezeMonthlyLeaderboard | schedule | europe-west1 | 512 | 180 | 10 | [object Object] |
| getAdminCollectionPage | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getAdminOperationsDashboard | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| getBackupDownloadUrl | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getBookingStatus | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getClassSessionWorkspace | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getCodeExecutionResult | callable | europe-west1 | 256 | 15 | 10 | [object Object] |
| getCodeLanguages | callable | europe-west1 | 256 | 15 | 10 | [object Object] |
| getCurriculumFileUrl | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getExamDashboard | callable | europe-west1 | 512 | 30 | 20 | 80 |
| getHomeworkAdminWorkspace | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getLectureContent | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getMotivationLeaderboardAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getMotivationSettingsAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getParentMonthlyReport | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| getPaymentDashboard | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| getPaymentHistory | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getPlatformHealth | callable | europe-west1 | 256 | 15 | 10 | [object Object] |
| getPlatformHealthHttp | HTTP | europe-west1 | 256 | 15 | 10 | [object Object] |
| getPortalStudent | callable | europe-west1 | 512 | 30 | 20 | 80 |
| getPublicLeaderboard | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getStudentAdminProfile | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getStudentCurriculum | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getStudentLeaderboardPosition | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getStudentMonthlyReportAdmin | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| getStudentMotivationAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getStudentResources | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| getTheoryLectureAnalytics | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| grantHomeworkRetake | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| invalidateReport_assignments | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_attendance | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_class_sessions | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_exam_attempts | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_exam_sessions | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_exams | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_grades | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_homework_submissions | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_monthly_payments | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_recitations | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_student_transfer_requests | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| invalidateReport_students | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| listAutomaticBackups | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| listCurriculumAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| logStaffActivity | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| migrateCurriculumV61 | callable | europe-west1 | 1024 | 540 | 10 | [object Object] |
| migrateLegacyPayments | callable | europe-west1 | 512 | 540 | 10 | [object Object] |
| migratePlatformV63 | callable | europe-west1 | 1024 | 540 | 10 | [object Object] |
| migrateStudentCodeSafely | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| notifyStaffOnBookingCreated | event | europe-west1 | 256 | [object Object] | 10 | [object Object] |
| prepareHomeworkUpload | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| prepareMonthlyParentReports | schedule | europe-west1 | 512 | 540 | 10 | [object Object] |
| prepareOfflineAttendance | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| previewAutomaticBackup | callable | europe-west1 | 512 | 120 | 10 | [object Object] |
| recordAttendance | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| recordClassProgress | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| recordLectureProgress | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| regenerateParentAccessCode | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| registerHomeworkSubmission | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| registerTeacherPushToken | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| rejectBooking | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| repairLegacyExamFormats | callable | europe-west1 | 512 | 540 | 10 | [object Object] |
| reportClientError | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| restoreAutomaticBackup | callable | europe-west1 | 1024 | 540 | 1 | 1 |
| restoreContentItem | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| reverseStudentMotivationTransaction | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| reviewExamAttempt | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| reviewHomeworkSubmission | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| reviewStudentTransferRequest | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| saveExamProgress | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| saveMotivationSettingsAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| saveStudentPrivateNote | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| scheduledPlatformBackup | schedule | europe-west1 | 512 | 540 | 10 | [object Object] |
| searchStudentsAdmin | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| startExam | callable | europe-west1 | 512 | 30 | 20 | 80 |
| submitAssignmentAnswer | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| submitCodeExecution | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| submitExam | callable | europe-west1 | 512 | 30 | 20 | 80 |
| syncOfflineAttendance | callable | europe-west1 | 512 | 60 | 10 | [object Object] |
| unifyLegacyStudentAccess | schedule | europe-west1 | 256 | 120 | 10 | [object Object] |
| unifyStudentAccessCodes | callable | europe-west1 | 512 | 120 | 10 | [object Object] |
| unregisterTeacherPushToken | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| updateStudentSafely | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| upsertClassSession | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| upsertCurriculumEntity | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| upsertGroupSchedule | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
| upsertVersionedContent | callable | europe-west1 | 256 | 30 | 10 | [object Object] |
