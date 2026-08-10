'use strict';

function approvalStatus(data = {}) {
  return String(data.approvalStatus || data.status || '').trim().slice(0, 100);
}

function studentApprovalPending(data = {}) {
  return /قيد التسجيل|انتظار|لم يتم قبول|pending/i.test(approvalStatus(data));
}

function studentApprovalRejected(data = {}) {
  return /رفض|rejected/i.test(approvalStatus(data));
}

function studentCanOpenPortal(data = {}) {
  if (studentApprovalRejected(data)) return false;
  return data.active !== false || studentApprovalPending(data);
}

function studentIsApproved(data = {}) {
  return data.active !== false && !studentApprovalPending(data) && !studentApprovalRejected(data);
}

module.exports = {
  approvalStatus,
  studentApprovalPending,
  studentApprovalRejected,
  studentCanOpenPortal,
  studentIsApproved
};
