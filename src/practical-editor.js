import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';

const $ = selector => document.querySelector(selector);
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const state = { languages: [], current: null, running: false, controller: null, pollGeneration: 0, mode: 'free', saveTimer: null };

const templates = {
  python: 'name = input("اكتب اسمك: ")\nprint("أهلًا", name)',
  javascript: 'const name = "Techno Minds";\nconsole.log(`Hello ${name}`);',
  typescript: 'const message: string = "Hello Techno Minds";\nconsole.log(message);',
  c: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello Techno Minds\\n");\n    return 0;\n}',
  'c++': '#include <iostream>\n\nint main() {\n    std::cout << "Hello Techno Minds\\n";\n    return 0;\n}',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello Techno Minds");\n    }\n}',
  'c#': 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello Techno Minds");\n    }\n}',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello Techno Minds")\n}',
  rust: 'fn main() {\n    println!("Hello Techno Minds");\n}',
  php: '<?php\necho "Hello Techno Minds\\n";\n?>',
  ruby: 'puts "Hello Techno Minds"',
  kotlin: 'fun main() {\n    println("Hello Techno Minds")\n}',
  swift: 'print("Hello Techno Minds")',
  bash: 'echo "Hello Techno Minds"',
  sql: 'SELECT "Hello Techno Minds" AS message;'
};

const extensions = { python: 'py', javascript: 'js', typescript: 'ts', c: 'c', 'c++': 'cpp', java: 'java', 'c#': 'cs', go: 'go', rust: 'rs', php: 'php', ruby: 'rb', kotlin: 'kt', swift: 'swift', bash: 'sh', sql: 'sql' };

function family(name = '') {
  const n = name.toLowerCase();
  if (n.includes('typescript')) return 'typescript';
  if (n.includes('javascript') || n.includes('node.js')) return 'javascript';
  if (n.includes('python')) return 'python';
  if (/c\+\+/.test(n)) return 'c++';
  if (/^c\s|\(gcc\)|clang/.test(n)) return 'c';
  if (n.includes('c#')) return 'c#';
  if (n.includes('java') && !n.includes('javascript')) return 'java';
  if (n.includes('kotlin')) return 'kotlin';
  if (n.includes('golang') || /^go\s/.test(n)) return 'go';
  if (n.includes('rust')) return 'rust';
  if (n.includes('php')) return 'php';
  if (n.includes('ruby')) return 'ruby';
  if (n.includes('swift')) return 'swift';
  if (n.includes('bash')) return 'bash';
  if (n.includes('sql')) return 'sql';
  return n.split(/\s|\(/)[0] || 'text';
}

function languageExtension(kind) {
  if (kind === 'python') return python();
  if (kind === 'javascript') return javascript();
  if (kind === 'typescript') return javascript({ typescript: true });
  if (kind === 'c' || kind === 'c++') return cpp();
  if (kind === 'java') return java();
  return [];
}

function preferredLanguages(rows) {
  const wanted = ['python', 'javascript', 'typescript', 'c', 'c++', 'java', 'c#', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'bash', 'sql'];
  const selected = [];
  for (const kind of wanted) {
    const matches = rows.filter(row => family(row.name) === kind);
    selected.push(...matches.slice(-3));
  }
  const seen = new Set();
  return selected.filter(row => !seen.has(row.id) && seen.add(row.id));
}

function status(message, type = '') {
  const el = $('#runnerStatus');
  if (el) { el.textContent = message; el.dataset.state = type; }
}

function output(result) {
  $('#stdoutOutput').textContent = result.stdout || (result.finished && !result.stderr && !result.compileOutput ? 'تم التنفيذ بنجاح بدون مخرجات.' : '');
  $('#stderrOutput').textContent = result.stderr || 'لا توجد Runtime Errors.';
  $('#compileOutput').textContent = result.compileOutput || 'لا توجد Compilation Errors.';
  $('#executionTime').textContent = result.time == null ? '-' : `${result.time} ثانية`;
  $('#executionMemory').textContent = result.memory == null ? '-' : `${result.memory} KB`;
  $('#executionExit').textContent = result.exitCode == null ? '-' : String(result.exitCode);
  status(arabicStatus(result.status?.description), result.finished ? 'done' : 'running');
}

function arabicStatus(value = '') {
  const n = String(value).toLowerCase();
  if (n.includes('queue')) return 'في قائمة الانتظار';
  if (n.includes('processing')) return 'جارٍ التنفيذ';
  if (n.includes('accepted')) return 'تم التنفيذ بنجاح';
  if (n.includes('wrong')) return 'الناتج غير مطابق';
  if (n.includes('time limit')) return 'انتهى وقت التنفيذ';
  if (n.includes('compilation')) return 'فشل Compilation';
  if (n.includes('runtime')) return 'حدث Runtime Error';
  return value || 'غير معروف';
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function setRunning(running) {
  state.running = running;
  $('#runCodeBtn').disabled = running;
  $('#submitTaskBtn').disabled = running;
  $('#stopCodeBtn').disabled = !running;
}

function draftKey() { return `tm_practical_draft_${state.current?.id || 'default'}`; }

function saveDraft() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    try { localStorage.setItem(draftKey(), editor.state.doc.toString()); status('تم حفظ المسودة على الجهاز', 'saved'); } catch (_) {}
    if (state.mode === 'task') {
      const taskId = $('#taskId')?.value.trim(), studentCode = $('#taskStudentCode')?.value.trim();
      if (taskId && studentCode && window.MFCloud?.savePracticalDraft) window.MFCloud.savePracticalDraft({ taskId, studentCode, sourceCode: editor.state.doc.toString(), languageId: state.current?.id }).catch(() => {});
    }
  }, 650);
}

const initialLanguage = [];
const editor = new EditorView({
  parent: $('#codeEditor'),
  state: EditorState.create({
    doc: templates.python,
    extensions: [basicSetup, keymap.of([indentWithTab]), languageCompartment.of(initialLanguage), themeCompartment.of(document.documentElement.dataset.theme === 'dark' ? oneDark : []), EditorView.updateListener.of(update => { if (update.docChanged) saveDraft(); })]
  })
});

async function selectLanguage() {
  const id = Number($('#languageSelect').value);
  state.current = state.languages.find(row => Number(row.id) === id) || state.languages[0];
  const kind = family(state.current?.name);
  editor.dispatch({ effects: languageCompartment.reconfigure(languageExtension(kind)) });
  $('#runtimeVersion').textContent = state.current?.name || 'Runtime';
  let saved = '';
  try { saved = localStorage.getItem(draftKey()) || ''; } catch (_) {}
  const next = saved || templates[kind] || `// ${state.current?.name || 'Code'}\n`;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
}

async function loadLanguages() {
  const select = $('#languageSelect');
  try {
    if (!window.MFCloud?.getCodeLanguages) throw new Error('خدمة تشغيل الأكواد غير متاحة.');
    const result = await window.MFCloud.getCodeLanguages();
    state.languages = preferredLanguages(result.languages || []);
    if (!state.languages.length) throw new Error('لم ترجع الخدمة أي لغة مدعومة.');
    select.innerHTML = state.languages.map(row => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('');
    const pythonRow = state.languages.find(row => family(row.name) === 'python');
    if (pythonRow) select.value = String(pythonRow.id);
    await selectLanguage();
    status('خدمة التشغيل جاهزة', 'ready');
  } catch (error) {
    select.innerHTML = '<option>غير مفعلة</option>';
    status(error.message || 'خدمة التشغيل غير مفعلة بعد', 'error');
    $('#runCodeBtn').disabled = true;
    $('#submitTaskBtn').disabled = true;
  }
}

async function pollFree(token, generation) {
  for (let i = 0; i < 30; i += 1) {
    await wait(i ? 700 : 250, state.controller.signal);
    if (generation !== state.pollGeneration) throw new DOMException('Aborted', 'AbortError');
    const result = await window.MFCloud.getCodeExecutionResult(token);
    output(result);
    if (result.finished) return result;
  }
  throw new Error('استغرق التنفيذ وقتًا أطول من المتوقع. أوقف الطلب وحاول مرة أخرى.');
}

async function runFree() {
  if (state.running) return;
  const sourceCode = editor.state.doc.toString();
  if (!sourceCode.trim()) return status('اكتب كودًا أولًا.', 'error');
  setRunning(true); state.controller = new AbortController(); const generation = ++state.pollGeneration;
  status('جارٍ إرسال الكود إلى البيئة المعزولة...', 'running');
  try {
    const submitted = await window.MFCloud.submitCodeExecution({ sourceCode, stdin: $('#stdinInput').value, languageId: state.current.id });
    await pollFree(submitted.token, generation);
  } catch (error) {
    if (error.name !== 'AbortError') { status(error.message || 'فشل تشغيل الكود.', 'error'); $('#stderrOutput').textContent = error.message || String(error); }
  } finally { setRunning(false); state.controller = null; }
}

async function runTask() {
  if (state.running) return;
  const taskId = $('#taskId').value.trim(), studentCode = $('#taskStudentCode').value.trim();
  if (!taskId || !studentCode) return status('اكتب كود الطالب ومعرّف المهمة.', 'error');
  setRunning(true); state.controller = new AbortController(); const generation = ++state.pollGeneration;
  try {
    const submitted = await window.MFCloud.submitPracticalTask({ taskId, studentCode, sourceCode: editor.state.doc.toString(), languageId: state.current.id });
    for (let i = 0; i < 35; i += 1) {
      await wait(i ? 800 : 300, state.controller.signal);
      if (generation !== state.pollGeneration) throw new DOMException('Aborted', 'AbortError');
      const result = await window.MFCloud.getPracticalTaskResult({ runId: submitted.runId, studentCode });
      status(result.finished ? `تم اختبار الحل: ${result.score}%` : 'جارٍ تشغيل اختبارات المهمة...', result.finished ? 'done' : 'running');
      $('#taskResults').innerHTML = (result.tests || []).map(test => `<div class="task-test ${test.passed ? 'pass' : 'fail'}"><b>${escapeHtml(test.title || 'اختبار')}</b><span>${test.passed ? 'ناجح' : result.finished ? 'لم ينجح' : test.status}</span></div>`).join('');
      if (result.finished) { $('#stdoutOutput').textContent = `النتيجة: ${result.score}%\nالاختبارات الناجحة: ${result.passedTests}/${result.totalTests}`; return; }
    }
    throw new Error('انتهت مهلة متابعة اختبارات المهمة.');
  } catch (error) {
    if (error.name !== 'AbortError') status(error.message || 'تعذر اختبار المهمة.', 'error');
  } finally { setRunning(false); state.controller = null; }
}

function stop() { state.pollGeneration += 1; state.controller?.abort(); state.controller = null; setRunning(false); status('تم إلغاء متابعة الطلب. قد يستمر التنفيذ القصير داخل البيئة المعزولة حتى ينتهي حد الوقت.', 'stopped'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

function bind() {
  $('#languageSelect').addEventListener('change', selectLanguage);
  $('#runCodeBtn').addEventListener('click', runFree);
  $('#submitTaskBtn').addEventListener('click', runTask);
  $('#stopCodeBtn').addEventListener('click', stop);
  $('#copyCodeBtn').addEventListener('click', () => navigator.clipboard.writeText(editor.state.doc.toString()).then(() => status('تم نسخ الكود', 'saved')));
  $('#copyOutputBtn').addEventListener('click', () => navigator.clipboard.writeText($('#stdoutOutput').textContent).then(() => status('تم نسخ النتيجة', 'saved')));
  $('#clearCodeBtn').addEventListener('click', () => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '' } }));
  $('#downloadCodeBtn').addEventListener('click', () => { const kind = family(state.current?.name), blob = new Blob([editor.state.doc.toString()], { type: 'text/plain;charset=utf-8' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `main.${extensions[kind] || 'txt'}`; link.click(); URL.revokeObjectURL(link.href); });
  $('#uploadCodeBtn').addEventListener('click', () => $('#codeFileInput').click());
  $('#codeFileInput').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 65_536) return status('حجم ملف الكود أكبر من 64KB.', 'error'); const content = await file.text(); editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } }); });
  $('#fullscreenBtn').addEventListener('click', () => { const shell = $('#practicalShell'); if (!document.fullscreenElement) shell.requestFullscreen?.(); else document.exitFullscreen?.(); });
  $('#shareCodeBtn').addEventListener('click', async () => { const data = { title: 'Techno Minds Practical Lab', text: 'بيئة تشغيل الأكواد في Techno Minds', url: location.href.split('#')[0] }; if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(data.url); });
  document.querySelectorAll('[data-run-mode]').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.runMode; document.querySelectorAll('[data-run-mode]').forEach(item => item.classList.toggle('active', item === button)); $('#taskPanel').hidden = state.mode !== 'task'; $('#runCodeBtn').hidden = state.mode === 'task'; $('#submitTaskBtn').hidden = state.mode !== 'task'; }));
  const task = new URLSearchParams(location.search).get('task');
  if (task) { $('#taskId').value = task; document.querySelector('[data-run-mode="task"]').click(); }
  window.addEventListener('beforeunload', stop);
  new MutationObserver(() => editor.dispatch({ effects: themeCompartment.reconfigure(document.documentElement.dataset.theme === 'dark' ? oneDark : []) })).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

bind();
loadLanguages();
