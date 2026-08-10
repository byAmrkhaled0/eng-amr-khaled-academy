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

module.exports = { money, paymentStatus, paymentTotals };
