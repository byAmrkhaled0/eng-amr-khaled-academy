const screen = document.getElementById('screen');
document.getElementById('width').onchange = event => { screen.style.width = `${event.target.value}px`; };
function applyTheme() {
  const theme = document.getElementById('theme').value;
  screen.contentDocument.documentElement.dataset.theme = theme;
  screen.contentDocument.body.classList.toggle('dark', theme === 'dark');
}
screen.addEventListener('load', applyTheme);
document.getElementById('theme').onchange = applyTheme;
document.getElementById('measure').onclick = () => {
  const doc = screen.contentDocument;
  const card = doc.querySelector('.attendance-control-card');
  const summary = doc.querySelector('.attendance-date-summary');
  const bounds = summary.getBoundingClientRect();
  const result = {
    width: screen.clientWidth,
    cardHeight: Math.round(card.getBoundingClientRect().height),
    summaryWidth: Math.round(bounds.width), summaryHeight: Math.round(bounds.height),
    pageOverflow: doc.documentElement.scrollWidth > screen.clientWidth,
    innerOverflow: [...card.querySelectorAll('select,input,button,p,small')]
      .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className || el.tagName)
  };
  document.getElementById('result').textContent = JSON.stringify(result);
};
