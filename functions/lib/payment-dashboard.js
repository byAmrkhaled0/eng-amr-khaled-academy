'use strict';
const {money,paymentStatus} = require('../payment-domain');

function buildPaymentDashboard({students,summaries,todayTransactions,prices,filters,canonical=value=>value}) {
  const code = row => String(row.studentCode||row.code||row.id||'');
  const same = (a,b) => canonical(a) === canonical(b);
  const query = String(filters.query||'').trim().toLocaleLowerCase('ar');
  const eligible = students.filter(row=>row.active!==false && (filters.grade==='all'||same(row.grade,filters.grade)) &&
    (!query || `${row.studentName||row.name} ${code(row)}`.toLocaleLowerCase('ar').includes(query)));
  const studentMap = new Map(eligible.map(row=>[code(row),row]));
  const price = student => money(prices[Object.keys(prices).find(key=>same(key,student.grade))]);
  function makeRow(student,summary,month,academicYear) {
    const expected=money(summary?.expectedAmount??price(student)),paid=money(summary?.paidAmount);
    return {key:`${code(student)}|${academicYear}|${month}|${summary?.course||student.grade}`,student:{studentCode:code(student),name:student.studentName||student.name||'',grade:student.grade,group:student.group||''},summary:summary||null,month,academicYear,expected,paid,remaining:money(Math.max(0,expected-paid)),status:paymentStatus(expected,paid)};
  }
  let rows;
  if(filters.month==='all'||filters.academicYear==='all') {
    rows=summaries.filter(s=>studentMap.has(String(s.studentCode))).map(s=>makeRow(studentMap.get(String(s.studentCode)),s,s.month,s.academicYear));
  } else {
    const byPeriod=new Map(summaries.map(s=>[`${s.studentCode}|${canonical(s.course)}`,s]));
    rows=eligible.map(student=>makeRow(student,byPeriod.get(`${code(student)}|${canonical(student.grade)}`),filters.month,filters.academicYear));
    // Preserve ledger records from a previous course after a transfer.
    for(const summary of summaries) {
      const student=studentMap.get(String(summary.studentCode));
      if(student&&!same(summary.course,student.grade)) rows.push(makeRow(student,summary,summary.month,summary.academicYear));
    }
  }
  rows=rows.filter(row=>filters.status==='all'||row.status===filters.status).sort((a,b)=>a.key.localeCompare(b.key,'en'));
  const allowed = new Set(rows.map(row=>`${row.student.studentCode}|${canonical(row.summary?.course||row.student.grade)}`));
  const totals={expected:0,collected:0,remaining:0,paid:0,partial:0,unpaid:0,today:0},courses={};
  for(const row of rows) {
    totals.expected+=row.expected;totals.collected+=row.paid;totals.remaining+=row.remaining;totals[row.status]++;
    const course=row.summary?.course||row.student.grade;
    const group=courses[course]||(courses[course]={expected:0,paid:0,students:0});
    group.expected+=row.expected;group.paid+=row.paid;group.students++;
  }
  totals.today=todayTransactions.filter(t=>t.status==='active'&&allowed.has(`${t.studentCode}|${canonical(t.course)}`)).reduce((sum,t)=>sum+money(t.amount),0);
  for(const field of ['expected','collected','remaining','today'])totals[field]=money(totals[field]);
  return {rows,totals,courses,totalRows:rows.length};
}
module.exports={buildPaymentDashboard};
