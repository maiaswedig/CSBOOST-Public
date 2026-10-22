const fs = require('node:fs/promises');
const path = require('node:path');

// Runs only against the fixture window supplied by free-ui-harness.cjs.
module.exports = async ({js, click, waitFor, win, output}) => {
  const checks = [];
  const originalSize = win.getSize();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const evaluate = (fn, ...args) => js(`(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`);

  async function noHorizontalOverflow(view) {
    const overflow = await evaluate(() => [document.documentElement, document.querySelector('.workspace'), document.querySelector('.page')]
      .filter(Boolean).filter(node => node.scrollWidth > node.clientWidth + 2)
      .map(node => ({element: node.className || node.tagName, width: node.clientWidth, content: node.scrollWidth})));
    if (overflow.length) throw Error(`Premium UI horizontal overflow on ${view}: ${JSON.stringify(overflow)}`);
  }

  // Compose transparent solid backgrounds through ancestors; gradients/images
  // cannot be assessed reliably from computed colors, so body-copy checks skip them.
  async function textContrast(selectors, required = false) {
    const results = await evaluate(selectors => {
      const rgba = value => {
        const match = value.match(/^rgba?\(([^)]+)\)$/);
        if (!match) return null;
        const parts = match[1].trim().split(/[\s,/]+/).map(Number);
        return parts.length >= 3 ? [...parts.slice(0, 3), parts[3] ?? 1] : null;
      };
      const over = (front, back) => {
        const alpha = front[3] + back[3] * (1 - front[3]);
        return [...front.slice(0, 3).map((channel, i) => alpha ? (channel * front[3] + back[i] * back[3] * (1 - front[3])) / alpha : 0), alpha];
      };
      const luminance = color => color.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      const background = node => {
        let result = [0, 0, 0, 0];
        for (let current = node; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) return null;
          const color = rgba(style.backgroundColor);
          if (!color) return null;
          result = over(result, color);
          if (result[3] >= .999) return result;
        }
        return null;
      };
      return [...document.querySelectorAll(selectors)].filter(node => node.textContent.trim() && node.getClientRects().length).map(node => {
        const style = getComputedStyle(node), foreground = rgba(style.color), back = background(node);
        const label = node.textContent.trim().replace(/\s+/g, ' ').slice(0, 90);
        if (!foreground || !back || Number(style.opacity) !== 1) return {label, skipped: 'non-solid or translucent surface'};
        const first = luminance(over(foreground, back)), second = luminance(back);
        return {label, ratio: (Math.max(first, second) + .05) / (Math.min(first, second) + .05)};
      });
    }, selectors);
    if (!results.length) throw Error(`Premium contrast check found no text: ${selectors}`);
    if (required && results.some(result => result.skipped)) throw Error(`Primary action needs measurable solid contrast: ${JSON.stringify(results)}`);
    const measured = results.filter(result => !result.skipped);
    for (const result of measured) if (result.ratio < 4.5) throw Error(`Premium text contrast below 4.5:1 (${result.ratio.toFixed(2)}): ${result.label}`);
    return measured;
  }

  async function keyboardFocus(selector, view) {
    await waitFor(() => js(`!!document.querySelector(${JSON.stringify(selector)})`), `${view} keyboard target`);
    const baseline = await evaluate(selector => {
      const target = document.querySelector(selector);
      document.activeElement?.blur();
      const style = getComputedStyle(target);
      const before = {shadow: style.boxShadow, border: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor].join('|')};
      const anchor = document.createElement('span');
      anchor.tabIndex = 0;
      anchor.dataset.premiumFocusAnchor = 'true';
      anchor.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const location = target.tagName === 'SUMMARY' ? target.parentElement : target;
      location.parentElement.insertBefore(anchor, location);
      target.dataset.premiumFocusTarget = 'true';
      anchor.focus({preventScroll: true});
      return before;
    }, selector);
    const debuggerWasAttached = win.webContents.debugger.isAttached();
    try {
      if (!debuggerWasAttached) win.webContents.debugger.attach('1.3');
      // The harness intentionally keeps this fixture window hidden. Chromium's
      // focus emulation permits trusted keyboard input without showing it.
      await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled: true});
      await js("document.querySelector('[data-premium-focus-anchor]').focus({preventScroll:true})");
      for (const type of ['keyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9});
      await waitFor(() => js("document.activeElement===document.querySelector('[data-premium-focus-target]')&&document.activeElement.matches(':focus-visible')"), `${view} trusted Chromium Tab focus`);
      await pause(180);
      const focus = await evaluate(before => {
        const target = document.querySelector('[data-premium-focus-target]'), style = getComputedStyle(target), rect = target.getBoundingClientRect();
        const opaque = color => color !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(color);
        const outline = parseFloat(style.outlineWidth) >= 1 && !['none', 'hidden'].includes(style.outlineStyle) && opaque(style.outlineColor);
        const shadow = style.boxShadow !== 'none' && style.boxShadow !== before.shadow;
        const border = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor].join('|') !== before.border;
        return {visible: rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.top >= -2 && rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2, indicated: outline || shadow || border};
      }, baseline);
      if (!focus.visible || !focus.indicated) throw Error(`Premium keyboard focus is not visibly indicated on ${view}: ${JSON.stringify(focus)}`);
      checks.push(`${view}: trusted Chromium Tab input reaches an interactive element with visible keyboard focus in the hidden fixture`);
    } finally {
      try {
        await js("document.querySelector('[data-premium-focus-anchor]')?.remove();document.querySelector('[data-premium-focus-target]')?.removeAttribute('data-premium-focus-target')");
        if (win.webContents.debugger.isAttached()) await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled: false});
      } finally {
        if (!debuggerWasAttached && win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
      }
    }
  }

  try {
    win.setSize(960, 640);
    await waitFor(() => js('window.innerWidth<=960&&window.innerHeight<=640'), 'premium minimum window');
    await click('Início');
    await waitFor(() => js("!!document.querySelector('.hero .button-primary')"), 'premium home');
    await pause(300);
    const homeContent = await evaluate(() => {
      const visible = node => {
        if (!node || !node.getClientRects().length) return false;
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      };
      const heading = document.querySelector('.page h1');
      const card = [...document.querySelectorAll('.page .hero, .page .panel')].find(node => [...node.querySelectorAll('h2')].some(title => visible(title) && title.textContent.trim() === 'Counter-Strike 2'));
      return {heading: visible(heading) && heading.textContent.trim() === 'Início', card: visible(card), slogans: /Gráficos leves|Desempenho medido|Seu próximo passo/i.test(document.querySelector('.page')?.innerText || '')};
    });
    if (!homeContent.heading || !homeContent.card || homeContent.slogans) throw Error(`Premium homepage must use direct labels without slogans: ${JSON.stringify(homeContent)}`);
    checks.push('Homepage visibly shows Início and a Counter-Strike 2 card without the removed slogans');
    const navResult = await evaluate(() => {
      const expected = ['Início', 'FPS+', 'Desempenho', 'Config do CS2', 'Benchmark', 'Notícias', 'Ranking Valve', 'Times e configs', 'Configurações'];
      const nav = document.querySelector('.sidebar nav'), items = [...(nav?.querySelectorAll('.nav-item') || [])];
      if (!nav || items.length !== expected.length || expected.some(label => !items.some(item => item.textContent.trim() === label && !item.disabled))) return {error: 'All nine navigation destinations must remain available'};
      const rect = nav.getBoundingClientRect(), style = getComputedStyle(nav), previousScroll = nav.scrollTop;
      if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2) return {error: 'Navigation viewport extends outside the minimum window'};
      if (nav.scrollHeight > nav.clientHeight + 2 && !['auto', 'scroll', 'overlay'].includes(style.overflowY)) return {error: 'Overflowing navigation cannot be scrolled'};
      const inaccessible = [];
      for (const item of items) {
        item.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
        const bounds = item.getBoundingClientRect(), viewport = nav.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top));
        if (bounds.width <= 0 || bounds.height <= 0 || bounds.left < viewport.left - 2 || bounds.right > viewport.right + 2 || visibleHeight < Math.min(bounds.height, nav.clientHeight) - 2) inaccessible.push(item.textContent.trim());
      }
      nav.scrollTop = previousScroll;
      return {inaccessible, count: items.length};
    });
    if (navResult.error || navResult.inaccessible.length) throw Error(`Premium minimum-window navigation: ${JSON.stringify(navResult)}`);
    checks.push('At 960×640 all nine navigation destinations fit or scroll fully into the visible navigation viewport');
    await noHorizontalOverflow('Início');
    const primary = await textContrast('.page .button-primary:not(:disabled)', true);
    const homeText = await textContrast('.page-description');
    checks.push(`Home primary action normal text contrast is at least 4.5:1 (minimum ${Math.min(...primary.map(result => result.ratio)).toFixed(2)}:1)`);
    await pause(300);
    await fs.writeFile(path.join(output, 'premium-home-QA.png'), (await win.webContents.capturePage()).toPNG());

    await click('Config do CS2');
    await waitFor(() => js("document.querySelector('.page h1')?.textContent==='Config do CS2'"), 'premium config editor');
    await noHorizontalOverflow('Config do CS2');
    await keyboardFocus('.page button:not(:disabled)', 'Config do CS2');

    await click('Configurações');
    await waitFor(() => js("document.querySelector('.page h1')?.textContent==='Configurações'&&!!document.querySelector('.compatibility-features > summary')"), 'premium settings compatibility');
    await pause(300);
    await noHorizontalOverflow('Configurações');
    const settingsText = await textContrast('.page-description, .settings-description');
    if (!homeText.length || !settingsText.length) throw Error('Premium body-copy contrast was not measurable on solid surfaces');
    checks.push('Home and settings body copy on solid surfaces meet 4.5:1 text contrast');
    await js("document.querySelector('.workspace').scrollTop=0");
    await pause(300);
    await fs.writeFile(path.join(output, 'premium-settings-QA.png'), (await win.webContents.capturePage()).toPNG());
    await keyboardFocus('.compatibility-features > summary', 'Configurações summary');
    checks.push('Home, config editor, and settings have no horizontal overflow at 960×640');
    checks.push('Captured premium-home-QA.png and premium-settings-QA.png at the minimum window size');
    return checks;
  } finally {
    win.setSize(...originalSize);
  }
};
