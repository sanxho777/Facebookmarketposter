(() => {
  const U = window.vputil;
  const { clean, asNumber, sleep, normColor } = U;

  // ---------- guards: never read our own overlay ----------
  const isOverlay = (el) => !!el && (el.closest('#vp-modal') || el.closest('#vp-pill'));
  const $site = (sel, root = document) =>
    Array.from(root.querySelectorAll(sel)).find(el => !isOverlay(el)) || null;
  const $$site = (sel, root = document) =>
    Array.from(root.querySelectorAll(sel)).filter(el => !isOverlay(el));

  const rootEl = () => $site('main') || document.body;

  // ---------- "Basics" section ----------
  const basicsSection = () => {
    const heads = $$site('h1,h2,h3,h4', rootEl());
    const h = heads.find(x => /^\s*Basics\s*$/i.test(x.textContent || ''));
    return h ? (h.closest('section') || h.parentElement || null) : null;
  };

  // find a label/value pair inside Basics (exact label text)
  function valueFromBasics(labelText) {
    const sec = basicsSection();
    if (!sec) return null;
    const want = labelText.toLowerCase();

    // dt/dd
    const dts = $$site('dt', sec);
    for (const dt of dts) {
      const lab = clean(dt.textContent).toLowerCase();
      if (lab === want) {
        const dd = dt.nextElementSibling && dt.nextElementSibling.tagName === 'DD'
          ? dt.nextElementSibling : null;
        const v = dd ? clean(dd.textContent) : '';
        if (v) return v;
      }
    }

    // generic "row"
    const leaves = $$site('*', sec).filter(n => !n.children.length);
    for (const leaf of leaves) {
      const txt = clean(leaf.textContent).toLowerCase();
      if (txt !== want) continue;

      const p = leaf.parentElement;
      if (p && p.children.length >= 2) {
        const other = Array.from(p.children)
          .filter(x => x !== leaf)
          .map(x => clean(x.textContent))
          .find(Boolean);
        if (other) return other;
      }
      let sib = leaf.nextElementSibling;
      while (sib && !clean(sib.textContent)) sib = sib.nextElementSibling;
      if (sib) {
        const v = clean(sib.textContent);
        if (v) return v;
      }
    }
    return null;
  }

  // ---------- fallback: cars.com "Vehicle preview" card (if present) ----------
  function valueFromPreview(labelRe) {
    const re = labelRe instanceof RegExp ? labelRe : new RegExp(labelRe, 'i');
    const heads = $$site('h2,h3,div,span', rootEl())
      .filter(el => /vehicle\s*preview/i.test(el.textContent || ''));
    let box = null;
    for (const h of heads) {
      let cur = h.closest('div')?.parentElement;
      for (let i = 0; i < 4 && cur; i++) {
        if (isOverlay(cur)) break;
        const hasRows = $$site('*', cur).some(n => /year|make|model|trim/i.test(n.textContent || ''));
        if (hasRows) { box = cur; break; }
        cur = cur.parentElement;
      }
      if (box) break;
    }
    if (!box) return null;

    const leaves = $$site('*', box).filter(n => !n.children.length);
    for (const leaf of leaves) {
      const t = clean(leaf.textContent);
      if (!re.test(t)) continue;

      const p = leaf.parentElement;
      if (p && p.children.length === 2) {
        const other = p.children[0] === leaf ? p.children[1] : p.children[0];
        const v = clean(other.textContent);
        if (v) return v;
      }
      const tr = leaf.closest('tr');
      if (tr) {
        const cells = $$site('td,th', tr).map(c => clean(c.textContent));
        if (cells.length >= 2) return cells[cells.length - 1];
      }
      const sib = leaf.nextElementSibling;
      if (sib) {
        const v = clean(sib.textContent);
        if (v) return v;
      }
    }
    return null;
  }

  // ---------- robust price (must have $; choose largest) ----------
  function priceFromPage() {
    const texts = [];
    $$site('*', rootEl()).forEach(el => {
      const t = clean(el.textContent || '');
      if (/\$\s*\d/.test(t)) texts.push(t);
    });
    let max = null;
    for (const t of texts) {
      const re = /\$\s*([0-9][0-9,]{2,})/g;
      let m;
      while ((m = re.exec(t))) {
        const n = asNumber(m[1]);
        if (!n || n < 500 || n > 250000) continue;
        if (max == null || n > max) max = n;
      }
    }
    return max;
  }

  // ---------- parse Year/Make/Model/Trim from the title ----------
  function parseYMMT() {
    const h1 = $site('h1', rootEl());
    const t = clean(h1?.textContent || '');
    if (!t) return {};

    // strip prefixes like "Used", "New", "Certified", "CPO", etc.
    const s = t.replace(/\b(used|new|certified|cpo|pre[-\s]*owned)\b/gi, '').replace(/\s+/g, ' ').trim();

    const yearMatch = s.match(/\b(19|20)\d{2}\b/);
    if (!yearMatch) return { title: s };
    const year = +yearMatch[0];

    const after = s.slice(yearMatch.index + yearMatch[0].length).trim();
    const tokens = after.split(/\s+/);

    const make = tokens[0] || '';
    const TRIM_TOKENS = new Set([
      'l','le','se','xle','xse','sport','limited','platinum','touring','base','premium','plus',
      'essence','preferred','ultimate','xl','xlr','sr','sr5','sv','sl','s','lx','ex','xlt','gt',
      'awd','fwd','rwd','4wd','4x4','awdrive','all-wheel','all-wheel'
    ]);

    let modelParts = [];
    let trimParts  = [];

    for (let i = 1; i < tokens.length; i++) {
      const w = tokens[i];
      const low = w.toLowerCase();
      const isDrivetrain = /^(awd|fwd|rwd|4wd|4x4|quattro|xdrive|4matic)$/i.test(low);
      const isTrim = TRIM_TOKENS.has(low) || isDrivetrain || /^[A-Z0-9-]{2,}$/.test(w) && w === w.toUpperCase();

      if (!modelParts.length || (!isTrim && modelParts.join(' ').length < 18)) {
        modelParts.push(w);
      } else {
        trimParts = tokens.slice(i);
        break;
      }
    }

    const model = clean(modelParts.join(' ')).replace(/\s+/g, ' ');
    const trim  = clean(trimParts.join(' ')).replace(/\s+/g, ' ');

    return { title: s, year, make, model, trim };
  }

  // ---------- ensure lazy sections are visible ----------
  async function scrollAll() {
    const sc = document.scrollingElement || document.documentElement;
    for (let y = 0; y <= sc.scrollHeight - innerHeight; y += Math.max(300, innerHeight * 0.7)) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await sleep(120);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(80);
  }

  // ---------- UI ----------
  function buildUI() {
    if (document.getElementById('vp-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'vp-pill';
    pill.innerHTML = `
      <span>Vehicle Poster</span>
      <span class="btn secondary" id="vp-scan">Scan</span>
      <span class="btn" id="vp-open-fb">Open Facebook</span>`;
    document.body.appendChild(pill);

    const modal = document.createElement('div');
    modal.id = 'vp-modal';
    modal.innerHTML = `
      <div class="backdrop"></div>
      <div class="card">
        <div class="vp-head">
          <h3>Vehicle Preview</h3>
          <div class="vp-actions">
            <button class="btn secondary" id="vp-rescan">Rescan</button>
            <button class="btn" id="vp-save">Send to FB tab</button>
            <button class="btn secondary" id="vp-close">Close</button>
          </div>
        </div>
        <div class="vp-body"><table class="vp-grid" id="vp-grid"></table></div>
        <div class="vp-footer">Tip: Use “Open Facebook” to launch the Marketplace vehicle form. Photos must be added manually.</div>
      </div>`;
    document.body.appendChild(modal);

    const grid = document.getElementById('vp-grid');
    let payload = null;

    const scrapeAll = () => {
      const titleTxt = clean($site('h1', rootEl())?.textContent || '');
      // First pass
      let year  = asNumber(valueFromPreview(/^year$/i));
      let make  = clean(valueFromPreview(/^make$/i) || '');
      let model = clean(valueFromPreview(/^model$/i) || '');
      let trim  = clean(valueFromPreview(/^trim$/i) || '');

      // If missing, parse from the H1 title
      if (!year || !make || !model) {
        const t = parseYMMT();
        year  = year  || t.year || null;
        make  = make  || t.make || '';
        model = model || t.model || '';
        trim  = trim  || t.trim  || '';
      }

      const price   = priceFromPage();
      const mileage = asNumber(valueFromBasics('Mileage')) || asNumber(valueFromPreview(/^mileage$/i));
      const vin     = clean(valueFromBasics('VIN') || valueFromPreview(/^vin$/i) || '');

      const exteriorColor = normColor(valueFromBasics('Exterior color') || valueFromPreview(/^exterior color$/i));
      const interiorColor = normColor(valueFromBasics('Interior color') || valueFromPreview(/^interior color$/i));

      const drivetrain    = clean(valueFromBasics('Drivetrain') || valueFromPreview(/^drivetrain|drive\s*train$/i) || '');
      const transmission  = clean(valueFromBasics('Transmission') || valueFromPreview(/^transmission$/i) || '');
      const engine        = clean(valueFromBasics('Engine') || valueFromPreview(/^engine$/i) || '');

      const imgs = Array.from(new Set(
        $$site('img[src], source[srcset]', rootEl())
          .map(el => el.getAttribute('src') || el.getAttribute('srcset') || '')
          .flatMap(s => s.split(/\s*,\s*/))
          .map(s => s.replace(/\s+\d+w$/, ''))
          .filter(u => /^https?:\/\//i.test(u) && !/sprite|icon|logo/i.test(u))
      ));

      return {
        source: 'cars.com',
        url: location.href,
        title: titleTxt,
        year, make, model, trim,
        price: price ?? null,
        mileage: mileage ?? null,
        vin,
        exteriorColor: exteriorColor || null,
        interiorColor: interiorColor || null,
        drivetrain: drivetrain || null,
        transmission: transmission || null,
        engine: engine || null,
        images: imgs,
        imagesCount: imgs.length
      };
    };

    const render = async () => {
      await scrollAll();
      payload = scrapeAll();
      const rows = [
        ['Title', payload.title],
        ['Year', payload.year], ['Make', payload.make], ['Model', payload.model], ['Trim', payload.trim],
        ['Price', payload.price ?? ''],
        ['Mileage', payload.mileage ?? ''],
        ['VIN', payload.vin ?? ''],
        ['Exterior', payload.exteriorColor ?? ''],
        ['Interior', payload.interiorColor ?? ''],
        ['Drivetrain', payload.drivetrain ?? ''],
        ['Transmission', payload.transmission ?? ''],
        ['Engine', payload.engine ?? ''],
        ['Images', payload.imagesCount]
      ];
      grid.innerHTML = rows.map(([k, v]) => `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`).join('');
    };

    const show = async () => { await render(); document.getElementById('vp-modal').classList.add('show'); };
    const hide = () => document.getElementById('vp-modal').classList.remove('show');

    document.getElementById('vp-scan').addEventListener('click', show);
    document.getElementById('vp-rescan').addEventListener('click', render);
    document.querySelector('#vp-modal .backdrop').addEventListener('click', hide);
    document.getElementById('vp-close').addEventListener('click', hide);

    document.getElementById('vp-open-fb').addEventListener('click', async () => {
      await chrome.storage.local.set({ vehiclePayload: scrapeAll(), vehiclePayloadTs: Date.now() });
      window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
    });

    document.getElementById('vp-save').addEventListener('click', async () => {
      await chrome.storage.local.set({ vehiclePayload: payload || scrapeAll(), vehiclePayloadTs: Date.now() });
      alert('Saved. Switch to the Facebook tab and click “Autofill vehicle”.');
    });
  }

  document.addEventListener('readystatechange', buildUI);
  window.addEventListener('load', buildUI);
})();
