'use strict';

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function paymentStatus(expectedAmount, paidAmount) {
  const expected = money(expectedAmount);
  const paid = money(paidAmount);
  if (paid <= 0) return 'unpaid';
  if (expected > 0 && paid < expected) return 'partial';
  return 'paid';
}

function paymentTotals(current, paidDelta, expectedAmount) {
  const expected = money(expectedAmount ?? current?.expectedAmount);
  const paid = money(money(current?.paidAmount) + Number(paidDelta || 0));
  return {
    expectedAmount: expected,
    paidAmount: paid,
    remainingAmount: money(Math.max(0, expected - paid)),
    status: paymentStatus(expected, paid)
  };
}

function paymentPeriodStatus(rows, academicYear, month) {
  const current = (rows || []).filter(row => row.academicYear === academicYear && row.month === month);
  return paymentStatus(current.reduce((total, row) => total + money(row.expectedAmount), 0),
    current.reduce((total, row) => total + money(row.paidAmount), 0));
}

// A positive monthly price is locked. A zero with recorded financial activity
// is not a blank legacy summary. A configured zero is an intentional free price.
function resolveExpectedAmount(summary, configuredPrice) {
  if (summary && (money(summary.expectedAmount) > 0 || money(summary.paidAmount) > 0 || Number(summary.transactionCount || 0) > 0 || Number(summary.activeTransactionCount || 0) > 0)) return money(summary.expectedAmount);
  return configuredPrice === undefined ? money(summary?.expectedAmount) : money(configuredPrice);
}

module.exports = { money, paymentStatus, paymentTotals, paymentPeriodStatus, resolveExpectedAmount };
