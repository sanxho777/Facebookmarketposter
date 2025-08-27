// content/facebook.js — Marketplace autofill, scoped to the LEFT form column
(() => {
  const U = window.vputil || {};
  const {
    clean = s => String(s ?? '').replace(/\s+/g, ' ').trim(),
    sleep = (ms) => new Promise(r => setTimeout(r, ms)),
    inferBodyStyle = (v) => 'Saloon',
    inferFuel = (v) => 'Gasoline',
    inferTransmission = (v) => 'Automatic transmission',
    conditionLabel = (miles) => 'Good',
    normColor = (s) => s
  } = U;

  // ==== scope & helpers ======================================================
  const roleMain = () => document.querySelector('[role="main"]') || document.body;

  // the left pane – anchor using the "About this vehicle" group
  const formScope = () => {
    const within = roleMain();
    const anchor = Array.from(within.querySelectorAll('div,section'))
      .find(el => /about this vehicle/i.test(el.textContent || ''));
    // fallback to main if not found yet
    return anchor || within;
  };

  const $  = (sel, r=formScope()) => r.querySelector(sel);
  const $$ = (sel, r=formScope()) => Array.from(r.querySelectorAll(sel));

  async function waitFor(fn, {timeout=12000, interval=150} = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  // prefer an element/control whose aria-label or nearby label matches /re/
  function findLabeled(re, within=formScope()) {
    const rx = re instanceof RegExp ? re : new RegExp(re, 'i');

    // direct aria-label
    const labeled = $$('*[aria-label]', within).find(el => rx.test(el.getAttribute('aria-label') || ''));
    if (labeled) return labeled;

    // aria-labelledby indirection
    const labeledby = $$('*[aria-labelledby]', within).find(el => {
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      const text = ids.map(id => document.getElementById(id)?.textContent || '').join(' ');
      return rx.test(clean(text));
    });
    if (labeledby) return labeledby;

    // text leaf near a control
    const leaves = $$('*', within).filter(n => !n.children.length);
    for (const leaf of leaves) {
      const txt = clean(leaf.textContent || '');
      if (!rx.test(txt)) continue;

      // up to a nearby control
      let cur = leaf;
      for (let i = 0; i < 5 && cur; i++) {
        const ctrl = cur.querySelector('input, textarea, [role="textbox"], [role="combobox"], div[role="button"]');
        if (ctrl) return ctrl;
        cur = cur.parentElement;
      }
      // …or the next sibling strip
      let sib = leaf.nextElementSibling;
      while (sib && !sib.querySelector('input, textarea, [role="textbox"], [role="combobox"]')) {
        sib = sib.nextElementSibling;
      }
      if (sib) {
        const ctrl = sib.querySelector('input, textarea, [role="textbox"], [role="combobox"]');
        if (ctrl) return ctrl;
      }
    }
    return null;
  }

  async function setTextByLabel(labelRe, value) {
    if (value == null || value === '') return false;
    const host = await waitFor(() => findLabeled(labelRe));
    if (!host) return false;

    const input = host.matches('input,textarea,[contenteditable="true"],[role="textbox"]')
      ? host
      : host.querySelector('input,textarea,[contenteditable="true"],[role="textbox"]');

    if (!input) return false;

    input.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(60);
    input.focus();
    await sleep(40);

    const isCE = input.getAttribute && input.getAttribute('contenteditable') === 'true';
    if (isCE || input.getAttribute('role') === 'textbox') {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, String(value));
    } else {
      const proto = input.tagName.toLowerCase() === 'textarea'
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await sleep(120);
    return true;
  }

  async function setCheckboxByLabel(labelRe, checked = true) {
    const host = await waitFor(() => findLabeled(labelRe));
    if (!host) return false;

    const box = host.matches('input[type="checkbox"]') ? host :
      host.querySelector('input[type="checkbox"]') ||
      host.closest('label')?.querySelector('input[type="checkbox"]') ||
      host.parentElement?.querySelector('input[type="checkbox"]');

    if (!box) return false;

    const cur = !!box.checked;
    if (cur !== !!checked) {
      box.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(40);
      box.click();
      await sleep(120);
    }
    return true;
  }

  async function setComboByLabel(labelRe, value) {
    if (value == null || value === '') return false;
    const host = await waitFor(() => findLabeled(labelRe));
    if (!host) return false;

    const opener = host.matches('[role="combobox"],div[role="button"]') ? host :
                   host.closest('[role="combobox"]') || host.querySelector('[role="combobox"]') || host;

    opener.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(60);
    opener.click();
    await sleep(150);

    // menu/list
    const menu = document.querySelector('[role="listbox"], [role="menu"], [role="dialog"]');
    if (!menu) return false;

    const want = clean(String(value)).toLowerCase();

    // 1) exact match
    const options = Array.from(menu.querySelectorAll('[role="option"], [role="menuitem"], span, div'))
      .filter(el => clean(el.textContent || '').length > 0);
    for (const op of options) {
      if (clean(op.textContent || '').toLowerCase() === want) {
        op.click();
        await sleep(150);
        return true;
      }
    }

    // 2) search inside menu
    const search = menu.querySelector('input[aria-label="Search"], input[type="search"]');
    if (search) {
      search.focus();
      await sleep(40);
      search.value = '';
      search.dispatchEvent(new InputEvent('input', { bubbles: true }));
      for (const ch of String(value)) {
        search.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: ch, inputType: 'insertText' }));
        search.value += ch;
        search.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        await sleep(8);
      }
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(150);
      return true;
    }

    // 3) fallback: type + Enter to combobox
    opener.focus();
    await sleep(40);
    document.execCommand('insertText', false, String(value));
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(150);
    return true;
  }

  function ensurePill() {
    if (document.getElementById('vp-pill')) return;
    const pill = document.createElement('div');
    pill.id = 'vp-pill';
    pill.innerHTML = `
      <span class="label">Vehicle Poster</span>
      <span class="btn" id="vp-auto">Autofill vehicle</span>
      <span class="btn secondary" id="vp-photos">Open photos</span>`;
    document.body.appendChild(pill);

    document.getElementById('vp-photos').addEventListener('click', () => {
      const add = findLabeled(/Add photos|Photos|Upload photos/i);
      add?.scrollIntoView({ block: 'center', behavior: 'instant' });
      add?.click();
    });

    document.getElementById('vp-auto').addEventListener('click', runAutofill);
  }

  // ==== main ================================================================
  async function runAutofill() {
    try {
      const { vehiclePayload: v } = await chrome.storage.local.get(['vehiclePayload']);
      if (!v) {
        alert('No saved data. On cars.com: click Scan → “Send to FB tab” first.');
        return;
      }

      // Normalize values the way FB expects them
      const bodyStyle = inferBodyStyle(v);
      const extColor  = normColor(v.exteriorColor || '');
      const intColor  = normColor(v.interiorColor || '');
      const fuel      = inferFuel(v);
      const trans     = inferTransmission(v);
      const cond      = conditionLabel(v.mileage);

      window.scrollTo({ top: 0, behavior: 'instant' });

      // Vehicle type first (unlocks the form combos)
      await setComboByLabel(/^vehicle type$/i, 'Car/van');

      // wait for the Year/Make controls to materialize
      await waitFor(() => findLabeled(/^year$/i));
      await waitFor(() => findLabeled(/^make$/i));

      // Top row
      await setComboByLabel(/^year$/i, v.year);
      await setComboByLabel(/^make$/i, v.make);
      // Model is a text box in your build
      await setTextByLabel(/^model$/i, v.model);

      await setTextByLabel(/^mileage|odometer$/i, v.mileage);
      await setTextByLabel(/^price$/i, v.price);

      // Appearance / features
      await setComboByLabel(/body style|bodytype/i, bodyStyle);
      await setComboByLabel(/exterior colou?r/i, extColor);
      await setComboByLabel(/interior colou?r/i, intColor);

      // Details
      await setCheckboxByLabel(/clean title/i, true);
      await setComboByLabel(/vehicle condition|condition/i, cond);
      await setComboByLabel(/fuel type|fuel/i, fuel);
      await setComboByLabel(/transmission/i, trans);

      // Title + Description
      const title = clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '));
      await setTextByLabel(/^title$/i, title);

      const descParts = [
        title,
        clean(v.drivetrain || ''),
        clean(v.transmission || ''),
        clean(v.engine || ''),
        v.vin ? `VIN ${clean(v.vin)}` : ''
      ].filter(Boolean);
      await setTextByLabel(/^description|about/i, (descParts.join('. ') + '.').replace(/\.\./g, '.'));

      alert('Autofill complete ✔️  Review and add photos.');
    } catch (e) {
      console.warn('Autofill error', e);
      alert('Autofill hit an error. See console for details.');
    }
  }

  // Boot only on the create-vehicle page
  function boot() {
    if (!/facebook\.com\/marketplace\/create\/vehicle/i.test(location.href)) return;
    ensurePill();
  }
  document.addEventListener('readystatechange', boot);
  window.addEventListener('load', boot);
  setTimeout(boot, 800);
})();
