// content/facebook.js  — standalone autofill on Marketplace (Create -> Vehicle)
(() => {
  // Utilities loaded by util.js (attached as window.vputil in this build)
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

  // ---- scope everything to the main content, never the header search ----
  const root = () => document.querySelector('[role="main"]') || document.body;

  const $ = (sel, r = root()) => r.querySelector(sel);
  const $$ = (sel, r = root()) => Array.from(r.querySelectorAll(sel));

  // Prefers an element whose aria-label (or nearby label) matches /re/
  function findLabeled(re, within = root()) {
    const rx = re instanceof RegExp ? re : new RegExp(re, 'i');

    // 1) Direct aria-label
    const labeled = $$('*[aria-label]', within).find(el => rx.test(el.getAttribute('aria-label')));
    if (labeled) return labeled;

    // 2) Text label next to a control
    const leaves = $$('*', within).filter(n => !n.children.length);
    for (const leaf of leaves) {
      const text = clean(leaf.textContent || '');
      if (!rx.test(text)) continue;

      // look forward for a control
      let cur = leaf;
      for (let i = 0; i < 5 && cur; i++) {
        const ctrl = cur.querySelector('input, textarea, [role="textbox"], [role="combobox"], div[role="button"]');
        if (ctrl) return ctrl;
        cur = cur.parentElement;
      }
      // or the next sibling lane
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
    const host = findLabeled(labelRe);
    if (!host) return false;

    // Some FB inputs are wrappers; pick the actual input/textarea
    const input = host.matches('input,textarea,[contenteditable="true"],[role="textbox"]')
      ? host
      : host.querySelector('input,textarea,[contenteditable="true"],[role="textbox"]');

    if (!input) return false;

    input.scrollIntoView({ block: 'center', behavior: 'instant' });

    // React-safe value set
    await sleep(80);
    input.focus();
    await sleep(40);
    const isCE = input.getAttribute && input.getAttribute('contenteditable') === 'true';

    if (isCE || input.getAttribute('role') === 'textbox') {
      // contenteditable area
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, String(value));
    } else {
      // real <input> / <textarea>
      const proto = input.tagName.toLowerCase() === 'textarea'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await sleep(120);
    return true;
  }

  async function setCheckboxByLabel(labelRe, checked = true) {
    const host = findLabeled(labelRe);
    if (!host) return false;

    // find a checkbox inside/around
    const checkbox =
      host.matches('input[type="checkbox"]') ? host :
      host.querySelector('input[type="checkbox"]') ||
      host.closest('label')?.querySelector('input[type="checkbox"]') ||
      host.parentElement?.querySelector('input[type="checkbox"]');

    if (!checkbox) return false;

    const current = !!checkbox.checked;
    if (current !== !!checked) {
      checkbox.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(40);
      checkbox.click();
      await sleep(120);
    }
    return true;
  }

  // Open a combobox and pick an option by exact (case-insensitive) text,
  // or type into the internal Search and press Enter.
  async function setComboByLabel(labelRe, value) {
    if (value == null || value === '') return false;
    const host = findLabeled(labelRe);
    if (!host) return false;

    const opener = host.matches('[role="combobox"],div[role="button"]') ? host :
                   host.closest('[role="combobox"]') || host.querySelector('[role="combobox"]') || host;
    opener.scrollIntoView({ block: 'center', behavior: 'instant' });

    await sleep(80);
    opener.click();
    await sleep(150);

    // the menu/listbox that opens
    const menu = document.querySelector('[role="listbox"], [role="menu"], [role="dialog"]');
    if (!menu) return false;

    const want = clean(String(value)).toLowerCase();

    // 1) try direct option match
    const options = Array.from(menu.querySelectorAll('[role="option"], [role="menuitem"], span, div'))
      .filter(el => clean(el.textContent || '').length > 0);
    for (const op of options) {
      if (clean(op.textContent || '').toLowerCase() === want) {
        op.click();
        await sleep(150);
        return true;
      }
    }

    // 2) try "Search" box inside menu
    const search = menu.querySelector('input[aria-label="Search"], input[type="search"]');
    if (search) {
      search.focus();
      await sleep(40);
      // clear then type
      search.value = '';
      search.dispatchEvent(new InputEvent('input', { bubbles: true }));
      for (const ch of String(value)) {
        search.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: ch, inputType: 'insertText' }));
        search.value += ch;
        search.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        await sleep(12);
      }
      // press Enter to select first filtered match
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      search.dispatchEvent(e);
      await sleep(150);
      return true;
    }

    // fallback: type directly to combobox then Enter
    opener.focus();
    await sleep(40);
    for (const ch of String(value)) {
      opener.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: ch, inputType: 'insertText' }));
      await sleep(10);
    }
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(150);
    return true;
  }

  // Button UI in the bottom-right (coexists with your current styling)
  function ensurePill() {
    if (document.getElementById('vp-pill')) return;
    const pill = document.createElement('div');
    pill.id = 'vp-pill';
    pill.innerHTML = `
      <span>Vehicle Poster</span>
      <span class="btn" id="vp-auto">Autofill vehicle</span>
      <span class="btn secondary" id="vp-photos">Open photos</span>`;
    document.body.appendChild(pill);

    document.getElementById('vp-photos').addEventListener('click', () => {
      // focus the photo picker button if present
      const add = findLabeled(/Add photos|Photos|Upload photos/i);
      add?.scrollIntoView({ block: 'center', behavior: 'instant' });
      add?.click();
    });

    document.getElementById('vp-auto').addEventListener('click', runAutofill);
  }

  async function runAutofill() {
    try {
      const { vehiclePayload: v } = await chrome.storage.local.get(['vehiclePayload']);
      if (!v) {
        alert('No saved data. Go to a cars.com page, Scan, then “Send to FB tab”.');
        return;
      }

      // Normalize values for FB UI
      const bodyStyle = inferBodyStyle(v);
      const extColor  = normColor(v.exteriorColor || '');
      const intColor  = normColor(v.interiorColor || '');
      const fuel      = inferFuel(v);
      const trans     = inferTransmission(v);
      const cond      = conditionLabel(v.mileage);

      // Step 1: top section
      await setComboByLabel(/^vehicle type$/i, 'Car/van');

      await setComboByLabel(/^year$/i, v.year);
      await setComboByLabel(/^make$/i, v.make);
      // Model is a plain text input on your build
      await setTextByLabel(/^model$/i, v.model);

      // IMPORTANT: these three are plain inputs (not combos)
      await setTextByLabel(/^mileage|odometer$/i, v.mileage);
      await setTextByLabel(/^price$/i, v.price);

      // Step 2: appearance/features
      await setComboByLabel(/body style|bodytype/i, bodyStyle);
      await setComboByLabel(/exterior colou?r/i, extColor);
      await setComboByLabel(/interior colou?r/i, intColor);

      // Details
      await setCheckboxByLabel(/clean title/i, true);
      await setComboByLabel(/vehicle condition|condition/i, cond);
      await setComboByLabel(/fuel type|fuel/i, fuel);
      await setComboByLabel(/transmission/i, trans);

      // Description (keep short if needed)
      const parts = [
        clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')),
        clean(v.drivetrain || ''),
        clean(v.transmission || ''),
        clean(v.engine || ''),
        v.vin ? `VIN ${clean(v.vin)}` : ''
      ].filter(Boolean);
      await setTextByLabel(/^description|about/i, parts.join('. ') + '.');

      // Optional: Title (FB lets you write your own)
      await setTextByLabel(/^title$/i, clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')));

      // Done
      alert('Autofill complete ✔️  Review the form and add photos.');
    } catch (e) {
      console.warn('Autofill error', e);
      alert('Autofill hit an error. See console for details.');
    }
  }

  // Boot only on the create-vehicle page
  const onReady = () => {
    const isCreateVehicle = /facebook\.com\/marketplace\/create\/vehicle/i.test(location.href);
    if (!isCreateVehicle) return;
    ensurePill();
  };

  document.addEventListener('readystatechange', onReady);
  window.addEventListener('load', onReady);
  setTimeout(onReady, 800);
})();
