const tabs = [...document.querySelectorAll('[data-tab]')];
function selectTab(name, focus = false) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('active', active);
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus({ preventScroll: true });
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target !== undefined) { event.preventDefault(); selectTab(tabs[target].dataset.tab, true); }
  });
});
document.querySelectorAll('[data-explore]').forEach(link => link.addEventListener('click', () => selectTab(link.dataset.explore, true)));
const defaults = { size: 8, gap: 5, thickness: 2 };
function updateAim() {
  for (const name of Object.keys(defaults)) {
    const value = document.getElementById(`aim-${name}`).value;
    document.getElementById(`${name}-value`).value = value;
    document.getElementById('crosshair').style.setProperty(`--${name}`, `${Number(value)}px`);
  }
}
for (const name of Object.keys(defaults)) document.getElementById(`aim-${name}`).addEventListener('input', updateAim);
document.getElementById('reset-aim').addEventListener('click', () => {
  for (const [name, value] of Object.entries(defaults)) document.getElementById(`aim-${name}`).value = value;
  updateAim();
});
document.getElementById('copy-hash').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById('release-hash').textContent.trim());
    status.textContent = 'SHA-256 copiado.';
  } catch {
    status.textContent = 'Selecione e copie o código acima manualmente.';
  }
});
