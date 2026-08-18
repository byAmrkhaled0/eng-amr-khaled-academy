from pathlib import Path

def read(path): return Path(path).read_text(encoding='utf-8').replace('\r\n','\n')
def write(path,text): Path(path).write_text(text,encoding='utf-8')
def require_replace(text, old, new, label):
    if old not in text: raise SystemExit(f'{label}: marker not found')
    return text.replace(old,new,1)
def function_end(text, signature):
    start=text.index(signature); brace=text.index('{',start); depth=0; quote=None; esc=False; i=brace
    while i<len(text):
        c=text[i]
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
        else:
            if c in "'\"`": quote=c
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return i+1
        i+=1
    raise SystemExit(f'unclosed function: {signature}')

# Backend: structured + legacy exam parsing, schema-63 restore, archived content restore.
path='functions/index.js'; text=read(path)
sig='function parseExamQuestions(source) {'
start=text.index(sig); end=function_end(text,sig)
structured=text[start:end].replace('function parseExamQuestions(source) {','function parseStructuredExamQuestions(source) {',1)
wrapper=r'''function parseLegacyExamQuestions(source) {
  const blocks = normalizeDigits(source).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).slice(0, 200);
  return blocks.map(block => {
    const lines = block.split('\n');
    const answerIndex = lines.findIndex(line => /^(answer|correct|الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة)\s*[:=：-]?/i.test(line.trim()));
    const answer = answerIndex >= 0 ? cleanAnswerLine(lines[answerIndex].trim()) : '';
    const body = answerIndex >= 0 ? lines.slice(0, answerIndex) : lines.slice();
    const options = [];
    const questionLines = [];
    for (const line of body) {
      const option = parseOptionLine(line);
      if (option && questionLines.length) options.push(option);
      else questionLines.push(line);
    }
    while (questionLines.length && !questionLines[0].trim()) questionLines.shift();
    while (questionLines.length && !questionLines[questionLines.length - 1].trim()) questionLines.pop();
    if (questionLines.length) questionLines[0] = questionLines[0].replace(/^(\s*)س\d*\s*[:\-]?\s*/, '$1');
    const question = text(questionLines.join('\n'), 1500);
    if (!question) return null;
    if (options.length >= 2 && answer) return {
      type: 'mcq', question,
      options: options.slice(0, 8).map(option => text(option.text, 700)),
      optionLabels: options.slice(0, 8).map(option => text(option.label, 10)),
      answer: text(answer, 700), mark: 1
    };
    return { type: 'essay', question, options: [], optionLabels: [], answer: '', modelAnswer: '', mark: 1 };
  }).filter(Boolean);
}

function parseExamQuestions(source) {
  const structured = parseStructuredExamQuestions(source);
  if (structured.length) return structured;
  return parseLegacyExamQuestions(source);
}'''
text=text[:start]+structured+'\n\n'+wrapper+text[end:]
text=require_replace(text,"if (!['RESTORE-V53', 'RESTORE-V54', 'RESTORE-V60.6'].includes(confirmation)) throw new HttpsError('failed-precondition', 'تأكيد الاستعادة غير صحيح.');","if (!['RESTORE-V53', 'RESTORE-V54', 'RESTORE-V60.6', 'RESTORE-V63'].includes(confirmation)) throw new HttpsError('failed-precondition', 'تأكيد الاستعادة غير صحيح.');",'restore confirmation')
text=require_replace(text,"![53,54,60].includes(payload.schemaVersion)","![53,54,60,63].includes(payload.schemaVersion)",'restore schema')
marker="exports.getAdminCollectionPage = onCall(CALLABLE_OPTIONS, async request => {"
restore=r'''exports.restoreContentItem = onCall(CALLABLE_OPTIONS, async request => {
  const staff = await requireStaff(request, ['admin']);
  const collection = text(request.data?.collection, 40);
  const id = cleanDocId(text(request.data?.id, 120));
  if (!new Set(['assignments','exams']).has(collection) || !id) throw new HttpsError('invalid-argument', 'بيانات الاستعادة غير مكتملة.');
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'العنصر المؤرشف غير موجود.');
  const current = snap.data() || {};
  if (current.archived !== true && current.lifecycleStatus !== 'archived') return { ok:true, collection, id, restored:false };
  await ref.set({
    archived: false, active: true, published: true,
    lifecycleStatus: collection === 'assignments' ? (assignmentIsReleased(current) ? 'open' : 'scheduled') : 'open',
    archiveReason: FieldValue.delete(), archivedBy: FieldValue.delete(), archivedAt: FieldValue.delete(),
    storageCleanupEligibleAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: staff.email || staff.uid
  }, { merge:true });
  await serverActivity(staff, 'استعادة محتوى مؤرشف', { collection, id });
  return { ok:true, collection, id, restored:true };
});

'''
if 'exports.restoreContentItem = onCall' not in text: text=require_replace(text,marker,restore+marker,'restore content callable')
write(path,text)

# Client loader and restore binding.
path='assets/firebase-sync.js'; text=read(path)
text=require_replace(text,"archiveContentItem:callable('archiveContentItem'),","archiveContentItem:callable('archiveContentItem'),\n      restoreContentItem:callable('restoreContentItem'),",'restore callable binding')
old="""async function getDocs(collection,limit,orderField='',direction='desc'){
      let ref=db.collection(collection);
      if(orderField)ref=ref.orderBy(orderField,direction);
      if(limit)ref=ref.limit(limit);
      const snap=await ref.get();return snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    }"""
new="""async function getDocs(collection,limit,orderField='',direction='desc'){
      const load=async ordered=>{let ref=db.collection(collection);if(ordered&&orderField)ref=ref.orderBy(orderField,direction);if(limit)ref=ref.limit(limit);const snap=await ref.get();return snap.docs.map(doc=>({id:doc.id,...doc.data()}));};
      const ordered=await load(true);
      if(!orderField||!limit||ordered.length>=limit)return ordered;
      const fallback=await load(false),merged=new Map();
      [...ordered,...fallback].forEach(row=>merged.set(String(row.id),row));
      return [...merged.values()].slice(0,limit);
    }"""
text=require_replace(text,old,new,'legacy loader')
text=text.replace("getDocs('exams',150,'updatedAt')","getDocs('exams',500,'updatedAt')").replace("getDocs('exams',150)","getDocs('exams',500)")
text=text.replace("getDocs('assignments',150,'updatedAt')","getDocs('assignments',500,'updatedAt')").replace("getDocs('assignments',150)","getDocs('assignments',500)")
method="restoreContentItem:payload=>{if(!calls.restoreContentItem)throw new Error('Restore content service unavailable');return calls.restoreContentItem(payload||{});},\n      "
anchor="getHomeworkAdminWorkspace:payload=>{if(!calls.getHomeworkAdminWorkspace)throw new Error('Homework workspace service unavailable');return calls.getHomeworkAdminWorkspace(payload||{});},"
if method.strip() not in text: text=require_replace(text,anchor,method+anchor,'restore client method')
write(path,text)

# Admin workflow: remove from platform + restore.
path='assets/v60-admin-workflow.js'; text=read(path)
text=require_replace(text,"const availableExams=(adminData.exams||[]).filter(exam=>exam.archived!==true).slice().reverse();","const availableExams=(adminData.exams||[]).filter(exam=>exam.archived!==true).slice().reverse();\n    const archivedExams=(adminData.exams||[]).filter(exam=>exam.archived===true).slice().reverse();",'archived exams variable')
text=text.replace(">أرشفة</button></div></article>`;}).join('');",">حذف من المنصة</button></div></article>`;}).join('');",1)
old="<div class=\"admin-exam-grid\">${examCards||empty('لا توجد اختبارات محفوظة.')}</div>\n      ${currentExam?"
archive_html="<div class=\"admin-exam-grid\">${examCards||empty('لا توجد اختبارات محفوظة.')}</div>\n      ${archivedExams.length?`<details class=\"card admin-collapsible\"><summary>المحذوفة من المنصة <span class=\"badge warn\">${archivedExams.length}</span></summary><div class=\"admin-detail-body\">${archivedExams.map(exam=>`<div class=\"admin-content-row\"><div><b>${safe(exam.title)}</b><small>${safe(exam.grade||'كل المسارات')} · النتائج والمحاولات محفوظة</small></div><button class=\"small-btn primary\" type=\"button\" onclick=\"restoreArchivedContent('exams','${safe(exam.id)}')\">استعادة للمنصة</button></div>`).join('')}</div></details>`:''}\n      ${currentExam?"
text=require_replace(text,old,archive_html,'exam archive list')
anchor="window.toggleLiveExam=async function(id){"
restore_ui=r'''window.restoreArchivedContent=async function(collection,id){
    const label=collection==='exams'?'الامتحان':'الواجب';
    if(!confirm(`استعادة ${label} إلى المنصة وإتاحته للطلاب مرة أخرى؟`))return;
    try{
      if(!window.MFCloud?.restoreContentItem)throw new Error('Restore service unavailable');
      await window.MFCloud.restoreContentItem({collection,id});
      const row=(adminData[collection]||[]).find(item=>String(item.id)===String(id));
      if(row)Object.assign(row,{archived:false,active:true,published:true,lifecycleStatus:'open'});
      saveData(adminData);aToast(`تمت استعادة ${label} إلى المنصة`);
      if(collection==='exams')renderExamsV6061();else window.renderAssignments?.();
    }catch(error){aToast(adminActionErrorMessage(error,`تعذر استعادة ${label}.`));}
  };

  '''
if 'window.restoreArchivedContent=async function' not in text: text=require_replace(text,anchor,restore_ui+anchor,'restore ui handler')
old="if(assignment.archived===true){controls.className='homework-archive-note';controls.textContent='هذا الواجب مؤرشف للقراءة والمتابعة فقط.';}else{"
new="if(assignment.archived===true){controls.className='homework-file-actions';controls.innerHTML='<span class=\"homework-archive-note\">هذا الواجب محذوف من المنصة، والتسليمات والدرجات محفوظة.</span><button class=\"small-btn primary\" type=\"button\" data-homework-restore>استعادة للمنصة</button>';controls.querySelector('[data-homework-restore]').addEventListener('click',()=>restoreArchivedContent('assignments',assignment.id));}else{"
text=require_replace(text,old,new,'homework restore control')
text=text.replace("<button class=\"small-btn danger\" type=\"button\" data-homework-archive>أرشفة</button>","<button class=\"small-btn danger\" type=\"button\" data-homework-archive>حذف من المنصة</button>",1)
write(path,text)

# Base admin copy.
path='assets/admin.js'; text=read(path)
text=text.replace("const archived=['assignments','exams','materials'].includes(collection);if(!confirm(archived?'أرشفة العنصر مع الاحتفاظ بسجلات الطلاب؟':'حذف العنصر؟'))return;","const archived=['assignments','exams','materials'].includes(collection);if(!confirm(archived?'إزالة العنصر من المنصة؟ سيختفي عن الطلاب مع الاحتفاظ بالنتائج والتسليمات وإمكانية الاستعادة.':'حذف العنصر؟'))return;",1)
text=text.replace("button.textContent=archived?'جارٍ الأرشفة…':'جارٍ الحذف…';","button.textContent=archived?'جارٍ الإزالة من المنصة…':'جارٍ الحذف…';",1)
text=text.replace("aToast(archived?'تمت الأرشفة مع حفظ السجل التاريخي':'تم الحذف');","aToast(archived?'تمت الإزالة من المنصة مع حفظ السجل التاريخي':'تم الحذف');",1)
write(path,text)

# Tests.
path='scripts/exam-workflow-v621.test.js'; tests=read(path)
addition=r'''\n\ntest('legacy exams remain readable after multiline parser upgrade', () => {\n  const backend=read('functions/index.js'),app=read('assets/app.js');\n  assert.match(backend,/function parseLegacyExamQuestions/);\n  assert.match(backend,/return parseLegacyExamQuestions\\(source\\)/);\n  assert.match(backend,/function parseStructuredExamQuestions/);\n  assert.match(app,/white-space:pre-wrap/);\n});\n'''.replace('\\n','\n')
if 'legacy exams remain readable after multiline parser upgrade' not in tests: tests=tests.rstrip()+addition+'\n'
write(path,tests)

path='scripts/final-regression-v634.test.js'; tests=read(path)
addition=r'''\n\ntest('current backups restore and archived exams or homework can be restored safely', () => {\n  const backend=read('functions/index.js'),sync=read('assets/firebase-sync.js'),workflow=read('assets/v60-admin-workflow.js');\n  assert.match(backend,/\\[53,54,60,63\\]\\.includes\\(payload\\.schemaVersion\\)/);\n  assert.match(backend,/RESTORE-V63/);\n  assert.match(backend,/exports\\.restoreContentItem = onCall/);\n  assert.match(sync,/restoreContentItem:callable\\('restoreContentItem'\\)/);\n  assert.match(workflow,/حذف من المنصة/);\n  assert.match(workflow,/استعادة للمنصة/);\n});\n\ntest('staff core loader recovers legacy docs that do not have updatedAt', () => {\n  const sync=read('assets/firebase-sync.js');\n  assert.match(sync,/const fallback=await load\\(false\\)/);\n  assert.match(sync,/getDocs\\('exams',500,'updatedAt'\\)/);\n  assert.match(sync,/getDocs\\('assignments',500,'updatedAt'\\)/);\n});\n'''.replace('\\n','\n')
if 'current backups restore and archived exams or homework can be restored safely' not in tests: tests=tests.rstrip()+addition+'\n'
write(path,tests)

print('platform audit repair applied')
