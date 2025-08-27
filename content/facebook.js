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

    // Find the actual clickable dropdown element
    const opener = host.matches('[role="combobox"],div[role="button"]') ? host :
                   host.closest('[role="combobox"]') || 
                   host.querySelector('[role="combobox"]') ||
                   host.querySelector('div[role="button"]') ||
                   host;

    opener.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(100);
    
    // Try clicking multiple times if needed
    opener.click();
    await sleep(300);
    
    // Wait for dropdown menu to appear with longer timeout - prioritize listbox for form dropdowns
    const menu = await waitFor(() => {
      // First priority: actual form dropdown listboxes
      const listbox = document.querySelector('[role="listbox"]');
      if (listbox && !listbox.closest('[data-testid*="notification"]')) {
        return listbox;
      }
      
      // Second priority: other dropdown menus not related to notifications
      const otherMenus = document.querySelectorAll('[role="menu"], [role="dialog"], .uiLayer');
      for (const menu of otherMenus) {
        if (!menu.closest('[data-testid*="notification"]') && 
            !menu.textContent.toLowerCase().includes('notification')) {
          return menu;
        }
      }
      
      return null;
    }, {timeout: 3000});
    
    if (!menu) {
      // Try clicking again
      opener.click();
      await sleep(500);
      const menu2 = document.querySelector('[role="listbox"], [role="menu"], [role="dialog"], .uiLayer');
      if (!menu2) return false;
    }

    const actualMenu = menu || document.querySelector('[role="listbox"], [role="menu"], [role="dialog"], .uiLayer');
    const want = clean(String(value)).toLowerCase();
    
    // 1) Try exact match first
    const options = Array.from(actualMenu.querySelectorAll('[role="option"], [role="menuitem"], span, div, li'))
      .filter(el => clean(el.textContent || '').length > 0);
    
    for (const op of options) {
      const optionText = clean(op.textContent || '').toLowerCase();
      if (optionText === want) {
        op.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        await sleep(50);
        op.click();
        await sleep(200);
        return true;
      }
    }

    // 2) Try partial match
    for (const op of options) {
      const optionText = clean(op.textContent || '').toLowerCase();
      if (optionText.includes(want) || want.includes(optionText)) {
        op.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        await sleep(50);
        op.click();
        await sleep(200);
        return true;
      }
    }

    // 3) Search functionality
    const search = actualMenu.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
    if (search) {
      search.focus();
      await sleep(50);
      search.value = '';
      search.dispatchEvent(new InputEvent('input', { bubbles: true }));
      
      // Type the search value
      for (const ch of String(value)) {
        search.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: ch, inputType: 'insertText' }));
        search.value += ch;
        search.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        await sleep(10);
      }
      
      await sleep(200);
      
      // Try to select first result
      const firstOption = actualMenu.querySelector('[role="option"], [role="menuitem"]');
      if (firstOption) {
        firstOption.click();
        await sleep(200);
        return true;
      }
      
      // Press Enter to select
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, code: 'Enter' }));
      await sleep(200);
      return true;
    }

    // 4) Fallback: type directly into opener
    opener.focus();
    await sleep(50);
    
    // Clear existing content
    opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await sleep(20);
    
    // Type the value
    for (const ch of String(value)) {
      opener.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      opener.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
      opener.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
      await sleep(10);
    }
    
    opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, code: 'Enter' }));
    await sleep(200);
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

  // Get all form fields in top-to-bottom order, excluding search bars
  function getFormFieldsInOrder() {
    const scope = formScope();
    const allFields = [];
    
    // Get all potential form controls
    const controls = scope.querySelectorAll('input:not([type="hidden"]), textarea, [role="textbox"], [role="combobox"], div[role="button"], select');
    
    // Filter out search bars and convert to array with position info
    for (const control of controls) {
      // Skip search bars at the top of the page
      const isSearchBar = control.matches('input[type="search"]') || 
                         control.matches('input[placeholder*="search" i]') ||
                         control.matches('input[aria-label*="search" i]') ||
                         (control.getAttribute('aria-label') || '').toLowerCase().includes('search');
      
      if (isSearchBar) continue;
      
      const rect = control.getBoundingClientRect();
      allFields.push({
        element: control,
        top: rect.top + window.scrollY
      });
    }
    
    // Sort by vertical position (top to bottom)
    return allFields.sort((a, b) => a.top - b.top).map(field => field.element);
  }

  // ==== main ================================================================
  async function runAutofill() {
    try {
      const { vehiclePayload: v } = await chrome.storage.local.get(['vehiclePayload']);
      if (!v) {
        alert('No saved data. On cars.com: click Scan → "Send to FB tab" first.');
        return;
      }

      // Normalize values the way FB expects them
      const bodyStyle = inferBodyStyle(v);
      const extColor  = normColor(v.exteriorColor || '');
      const intColor  = normColor(v.interiorColor || '');
      const fuel      = inferFuel(v);
      const trans     = inferTransmission(v);
      
      const cond      = conditionLabel(v.mileage);
      const title = clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '));

      window.scrollTo({ top: 0, behavior: 'instant' });

      // Define field mappings in order of appearance
      // Content box fields use dropdown selection, non-content box fields use text input
      const fieldMappings = [
        { pattern: /^vehicle type$/i, value: 'Car/van', type: 'combo' }, // 1. content box - always car/van
        { pattern: /^year$/i, value: v.year, type: 'combo' }, // 2. content box - dropdown
        { pattern: /^make$/i, value: v.make, type: 'combo' }, // 3. content box - dropdown
        { pattern: /^model$/i, value: v.model, type: 'text' }, // 4. NOT content box - type input
        { pattern: /^mileage|odometer$/i, value: v.mileage, type: 'text' }, // 5. NOT content box - type input
        { pattern: /^price$/i, value: v.price, type: 'text' }, // 6. NOT content box - type input
        { pattern: /body style|bodytype/i, value: bodyStyle, type: 'combo' }, // 7. content box - dropdown
        { pattern: /exterior colou?r/i, value: extColor, type: 'combo' }, // 8. content box - dropdown
        { pattern: /interior colou?r/i, value: intColor, type: 'combo' }, // 9. content box - dropdown
        { pattern: /vehicle condition|condition/i, value: 'Good', type: 'combo' }, // 10. content box - always good
        { pattern: /fuel type|fuel/i, value: fuel, type: 'combo' }, // 11. content box - dropdown
        { pattern: /clean title/i, value: true, type: 'checkbox' },
        { pattern: /transmission/i, value: trans, type: 'combo' },
        { pattern: /^title$/i, value: title, type: 'text' },
        { pattern: /^description|about/i, value: (() => {
          const descParts = [
            title,
            clean(v.drivetrain || ''),
            clean(v.transmission || ''),
            clean(v.engine || ''),
            v.vin ? `VIN ${clean(v.vin)}` : ''
          ].filter(Boolean);
          return (descParts.join('. ') + '.').replace(/\.\./g, '.');
        })(), type: 'text' }
      ];

      // Vehicle type first (unlocks the form combos)
      await setComboByLabel(/^vehicle type$/i, 'Car/van');
      await sleep(500);

      // wait for the Year/Make controls to materialize
      await waitFor(() => findLabeled(/^year$/i));
      await waitFor(() => findLabeled(/^make$/i));

      // Fill fields in top-to-bottom order with delays
      for (const mapping of fieldMappings.slice(1)) { // Skip vehicle type since we already did it
        if (!mapping.value) continue;
        
        let success = false;
        switch (mapping.type) {
          case 'text':
            success = await setTextByLabel(mapping.pattern, mapping.value);
            break;
          case 'combo':
            success = await setComboByLabel(mapping.pattern, mapping.value);
            break;
          case 'checkbox':
            success = await setCheckboxByLabel(mapping.pattern, mapping.value);
            break;
        }
        
        if (success) {
          console.log(`Filled field: ${mapping.pattern} with value: ${mapping.value}`);
        }
        
        // Wait 500ms between each field
        await sleep(500);
      }

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
