const links = [
  ['Home', './index.html'],
  ['Submissions', './submissions.html'],
  ['Join', './register.html'],
  ['How It Works', './how-it-works.html'],
  ['NASA Data Hub', './nasa-hub.html'],
  ['Compare', './compare.html'],
  ['Leaderboard', './leaderboard.html']
];

const currentPath = location.pathname.replace(/\/$/, '/index.html');
const header = document.createElement('header');
header.className = 'aegis-header';
header.innerHTML = `
  <div class="aegis-nav-row">
    <a class="aegis-wordmark" href="./index.html" aria-label="AEGIS home">AEGIS <span>HELIOS-01</span></a>
    <button class="aegis-menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="aegis-navigation">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
    </button>
    <nav class="aegis-nav" id="aegis-navigation" aria-label="Main navigation">
      ${links.map(([label, href]) => {
        const path = new URL(href, location.href).pathname;
        const active = path === currentPath;
        return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
      }).join('')}
    </nav>
  </div>`;

document.body.insertAdjacentElement('afterbegin', header);
const main = document.querySelector('main');
const footer = document.createElement('footer');
footer.className = 'aegis-footer';
footer.innerHTML = `<span>TEAM HELIOS-01 · NASA SPACE APPS CHALLENGE</span><span class="aegis-demo-pill">${location.pathname.endsWith('/nasa-hub.html') ? 'LIVE SOURCES · ESTIMATES LABELED' : 'SIMULATED DEMO DATA'}</span>`;
if (main) main.insertAdjacentElement('afterend', footer);
else document.body.append(footer);

const toggle = header.querySelector('.aegis-menu-toggle');
const nav = header.querySelector('.aegis-nav');
const focusableLinks = () => [...nav.querySelectorAll('a')];
function setOpen(open) {
  header.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  if (open) focusableLinks()[0]?.focus();
}
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
document.addEventListener('keydown', (event) => {
  if (!header.classList.contains('is-open')) return;
  if (event.key === 'Escape') { setOpen(false); toggle.focus(); return; }
  if (event.key !== 'Tab') return;
  const items = focusableLinks();
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
window.addEventListener('resize', () => { if (window.innerWidth > 800) setOpen(false); });
