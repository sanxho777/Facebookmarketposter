// content/houseofthunder.js — House of Thunder HD motorcycle scraper + overlay
// Targets: https://www.houseofthunderhd.com/Motorcycles/All-Inventory
//          https://www.houseofthunderhd.com/Motorcycles/*/*  (detail pages)
(() => {
  console.log('[HouseOfThunder] Script loaded. URL:', location.href, 'readyState:', document.readyState);
  const U = window.vputil || {};
  const { $, $$, clean, asNumber, sleep, normColor, titleFromParts } = U;

  // ─────────────────────────────────────────────────────────────────────────
  //  Detect which page we're on
  //  Inventory list:  /Motorcycles/All-Inventory  or  /Motorcycles/
  //  Detail page:     everything else under Motorcycles*
  // ─────────────────────────────────────────────────────────────────────────
  const isInventoryList = () =>
    /\/Motorcycles(\/All-Inventory|\/?\??$)/i.test(location.pathname);

  // ─────────────────────────────────────────────────────────────────────────
  //  Shared UI builders (pill + modal, same pattern as capitol.js)
  // ─────────────────────────────────────────────────────────────────────────
  function buildPill() {
    if (document.getElementById('vp-pill')) return; // already there

    const body = document.body;
    if (!body) {
      console.warn('[HouseOfThunder] buildPill: document.body not ready, will retry');
      return false; // signal failure
    }

    try {
      const pill = document.createElement('div');
      pill.id = 'vp-pill';
      pill.innerHTML = `
        <span class="label">Moto Poster</span>
        <span class="btn secondary" id="vp-scan">Scan</span>
        <span class="btn" id="vp-open-fb">Open Facebook</span>`;
      body.appendChild(pill);
      console.log('[HouseOfThunder] Pill injected ✓');
    } catch(e) {
      console.error('[HouseOfThunder] buildPill error:', e);
      return false;
    }

    const modal = document.createElement('div');
    modal.id = 'vp-modal';
    modal.innerHTML = `
      <div class="backdrop"></div>
      <div class="card">
        <div class="vp-head">
          <h3>Motorcycle Preview</h3>
          <div class="vp-actions">
            <span class="btn secondary" id="vp-rescan">Rescan</span>
            <span class="btn" id="vp-send">Send to FB tab</span>
            <span class="btn secondary" id="vp-download">Download Photos</span>
            <span class="close" id="vp-close">Close</span>
          </div>
        </div>
        <div class="vp-body">
          <table class="vp-grid" id="vp-grid"></table>
        </div>
        <div class="vp-footer">
          Tip: Click "Open Facebook" → open the Motorcycle listing form.
          Photos must be added manually due to browser security.
        </div>
      </div>`;
    body.appendChild(modal);

    const grid = document.getElementById('vp-grid');
    let payload = null;

    async function scanAndRender() {
      payload = await scan();
      const rows = [
        ['Title',         payload.title        || ''],
        ['Year',          payload.year         ?? ''],
        ['Make',          payload.make         || ''],
        ['Model',         payload.model        || ''],
        ['Trim',          payload.trim         || ''],
        ['Type',          payload.bikeType     || ''],
        ['Price',         payload.price === 0 ? 'Call for Price ($0 on FB)' : payload.price != null ? `$${payload.price.toLocaleString()}` : '(not found)'],
        ['Mileage',       payload.mileage != null && payload.mileage < 300 ? '300 (FB minimum)' : (payload.mileage ?? '')],
        ['VIN',           payload.vin          || ''],
        ['Stock #',       payload.stockNumber  || ''],
        ['Color (raw)',   payload.colorRaw     || ''],
        ['Color (FB)',    payload.exteriorColor|| ''],
        ['Engine',        payload.engine       || ''],
        ['Images',        payload.imagesCount  ?? 0],
      ];
      grid.innerHTML = rows
        .map(([k, v]) => `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`)
        .join('');
    }

    const show = async () => {
      await scanAndRender();
      document.getElementById('vp-modal').classList.add('show');
    };
    const hide = () => document.getElementById('vp-modal').classList.remove('show');

    document.getElementById('vp-scan').addEventListener('click', show);
    document.getElementById('vp-rescan').addEventListener('click', scanAndRender);
    document.querySelector('#vp-modal .backdrop').addEventListener('click', hide);
    document.getElementById('vp-close').addEventListener('click', hide);

    document.getElementById('vp-open-fb').addEventListener('click', () => {
      window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
    });

    document.getElementById('vp-send').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      await chrome.storage.local.set({ vehiclePayload: payload, vehiclePayloadTs: Date.now() });

      const { vehicleHistory = [] } = await chrome.storage.local.get(['vehicleHistory']);
      const idx = vehicleHistory.findIndex(v => v.url === payload.url);
      if (idx >= 0) {
        vehicleHistory[idx] = { ...vehicleHistory[idx], ...payload, scrapedAt: Date.now() };
      } else {
        vehicleHistory.unshift({ ...payload, scrapedAt: Date.now() });
        if (vehicleHistory.length > 20) vehicleHistory.splice(20);
      }
      await chrome.storage.local.set({ vehicleHistory });
      alert('Saved! Switch to the Facebook tab and click "Autofill motorcycle".');
    });

    document.getElementById('vp-download').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      await downloadPhotos(payload);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Photo download (delegates to background.js, same as capitol.js)
  // ─────────────────────────────────────────────────────────────────────────
  async function downloadPhotos(payload) {
    if (!payload.images || payload.images.length === 0) {
      alert('No images found to download.');
      return;
    }
    const btn = document.getElementById('vp-download');
    const orig = btn.textContent;
    try {
      btn.textContent = 'Starting downloads…';
      btn.disabled = true;
      const name = (payload.title || `${payload.year} ${payload.make} ${payload.model}`)
        .replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const resp = await chrome.runtime.sendMessage({
        action: 'downloadImages',
        images: payload.images,
        folderName: name
      });
      if (resp.success) {
        alert(`Started downloading ${resp.downloaded}/${resp.total} photos to Downloads/${name}/`);
      } else {
        throw new Error(resp.error || 'Download failed');
      }
    } catch (e) {
      alert('Error downloading photos. Check console for details.');
      console.error(e);
    } finally {
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SCRAPE — detail page
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  //  Title / Year / Make / Model parser
  //  JSON-LD has perfect data: name, model, brand, productionDate
  // ─────────────────────────────────────────────────────────────────────────
  function parseTitle() {
    // 1. JSON-LD Product — most reliable
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'Product') {
          const year  = parseInt(data.productionDate, 10) || null;
          const make  = data.brand?.name || '';
          // model field: "CVO™ Road Glide® ST" — strip trademark symbols
          const model = (data.model || '').replace(/[®™©]/g, '').trim();
          const title = `${year || ''} ${make} ${model}`.replace(/\s+/g, ' ').trim();
          return { year, make, model, trim: '', title };
        }
      } catch (_) {}
    }

    // 2. shiftDigital script data
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"year"\s*:\s*"(\d{4})"[^}]*"make"\s*:\s*"([^"]+)"[^}]*"model"\s*:\s*"([^"]+)"/);
      if (m) {
        const year = parseInt(m[1], 10);
        const make = m[2];
        const model = m[3];
        return { year, make, model, trim: '', title: `${year} ${make} ${model}` };
      }
    }

    // 3. H1 fallback
    const h1 = document.querySelector('h1');
    let raw = clean(h1?.textContent || '')
      .replace(/[®™©]/g, '')
      .replace(/\s+for\s+sale\s*$/i, '')
      .replace(/\s+/g, ' ').trim();

    const yearMatch = raw.match(/^(\d{4})\s+/);
    let year = null;
    if (yearMatch) { year = parseInt(yearMatch[1], 10); raw = raw.slice(yearMatch[0].length).trim(); }

    const knownMakes = ['Harley-Davidson','Indian Motorcycle','Royal Enfield','Zero Motorcycles','Can-Am'];
    let make = '', model = raw;
    for (const mk of knownMakes) {
      if (raw.toUpperCase().startsWith(mk.toUpperCase())) {
        make  = mk;
        model = raw.slice(mk.length).trim();
        // Title-case model
        model = model.replace(/\b\w/g, c => c.toUpperCase());
        break;
      }
    }
    if (!make) { const parts = raw.split(/\s+/); make = parts[0]; model = parts.slice(1).join(' '); }

    return { year, make, model, trim: '', title: `${year||''} ${make} ${model}`.trim() };
  }

  /** Scroll to trigger lazy-loaded content */
  async function ensureContentLoaded() {
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      await sleep(250);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(300);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Images — DX1/Dominion platform: all bike photos are on cdpcdn.dx1app.com
  //  URLs are protocol-relative (//cdpcdn...) with pattern:
  //    //cdpcdn.dx1app.com/products-private/prod/{dealer}/{store}/{0s}/{hash}/{listing-guid}/{seq}.jpg
  //  Full-size = no suffix, thumbnails = _480px suffix — prefer full-size.
  // ─────────────────────────────────────────────────────────────────────────
  async function getImages() {
    // Trigger lazy loading via scroll
    for (let i = 0; i < 4; i++) {
      window.scrollBy(0, window.innerHeight * 0.8);
      await sleep(150);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(300);

    // Click any swiper next button to force all slides to load
    const nextBtn = document.querySelector('.swiper-button-next, [class*="swiper-button-next"]');
    for (let i = 0; i < 25; i++) { nextBtn?.click(); await sleep(80); }
    await sleep(300);

    // Collect ALL URLs from the ENTIRE document — not just a gallery container
    // The diagnostic confirmed all 15 images are in the DOM as protocol-relative //cdpcdn URLs
    const allUrls = new Set();
    const imgAttrs = ['src','data-src','data-lazy-src','data-lazy','data-original','data-full-src','data-image'];

    document.querySelectorAll('img, source, [data-src], [data-lazy-src], [data-lazy]').forEach(el => {
      imgAttrs.forEach(attr => {
        const v = el.getAttribute(attr);
        if (v) allUrls.add(v);
      });
      ['srcset','data-srcset'].forEach(attr => {
        const v = el.getAttribute(attr);
        if (v) v.split(',').map(s => s.trim().split(/\s+/)[0]).forEach(u => { if (u) allUrls.add(u); });
      });
    });

    // Also check background styles
    document.querySelectorAll('[style*="background"]').forEach(el => {
      const m = (el.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/);
      if (m) allUrls.add(m[1]);
    });

    console.log('[HouseOfThunder] Total URL candidates:', allUrls.size, Array.from(allUrls).slice(0,3));

    // PRIORITY 1: cdpcdn.dx1app.com/products-private — these are the bike photos
    // Diagnostic confirmed: //cdpcdn.dx1app.com/products-private/prod/{...}/{guid}/6000000001.jpg etc.
    const bikeImages = [];
    const seenSeq = new Set();

    for (const url of allUrls) {
      if (!/cdpcdn\.dx1app\.com\/products-private\/prod/i.test(url)) continue;

      // Normalize protocol-relative to https
      const normalized = url.startsWith('//') ? 'https:' + url : url;

      // Extract sequence number: 6000000001, 6000000002, etc.
      const seqMatch = normalized.match(/(\d{10})(_\d+px)?\.jpg/i);
      if (!seqMatch) continue;

      const seq = seqMatch[1];
      const isThumb = !!seqMatch[2]; // _480px suffix = thumbnail

      if (!isThumb && !seenSeq.has(seq)) {
        seenSeq.add(seq);
        bikeImages.push({ seq, url: normalized });
      } else if (isThumb && !seenSeq.has(seq)) {
        // Keep thumb as fallback if no full-size found yet
        bikeImages.push({ seq, url: normalized.replace(/_\d+px\.jpg/i, '.jpg') });
        seenSeq.add(seq);
      }
    }

    bikeImages.sort((a, b) => a.seq.localeCompare(b.seq));

    if (bikeImages.length > 0) {
      const urls = bikeImages.map(x => x.url);
      console.log('[HouseOfThunder] Final image count:', urls.length);
      console.log('[HouseOfThunder] Top 5 images:', urls.slice(0, 5));
      return urls.slice(0, 24);
    }

    // PRIORITY 2: any cdpcdn URL (incentive images etc. excluded)
    const anyCdp = Array.from(allUrls)
      .filter(u => /cdpcdn\.dx1app\.com/i.test(u) && /products-private\/prod/i.test(u))
      .map(u => u.startsWith('//') ? 'https:' + u : u);

    if (anyCdp.length > 0) {
      console.log('[HouseOfThunder] Fallback cdpcdn:', anyCdp.length);
      return [...new Set(anyCdp)].slice(0, 24);
    }

    // PRIORITY 3: generic — any image URL that's not an icon/logo/social
    const generic = Array.from(allUrls)
      .filter(u => /\.(jpg|jpeg|png|webp)/i.test(u))
      .filter(u => !/logo|icon|favicon|social|loading|sprite|button|X-white|color_grey/i.test(u))
      .map(u => u.startsWith('//') ? 'https:' + u : u);

    console.log('[HouseOfThunder] Generic fallback:', generic.length);
    return [...new Set(generic)].slice(0, 24);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Color — from JSON-LD (most reliable), then DOM selector span.spec-info
  //  inside .detail-color, then subtitle span.model-color
  // ─────────────────────────────────────────────────────────────────────────
  function getColor() {
    // 1. JSON-LD — color field is exact e.g. "Citrus Heat Re-Entry"
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.color && data['@type'] === 'Product') return data.color;
      } catch (_) {}
    }

    // 2. shiftDigitalAnalyticsVehicleData inline script
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const s of scripts) {
      const m = s.textContent.match(/"exteriorColor"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }

    // 3. DOM: .detail-color contains the primary color spec row
    const detailColor = document.querySelector('.detail-color .spec-info, .detail-color [class*="spec-info"]');
    if (detailColor) return clean(detailColor.textContent);

    // 4. Subtitle span: "CITRUS HEAT RE-ENTRY •"
    const subtitle = document.querySelector('.model-color, [class*="model-color"]');
    if (subtitle) {
      return clean(subtitle.textContent).replace(/\s*[•·].*$/, '').trim();
    }

    // 5. Any spec-info whose sibling spec-title says "Color"
    const specTitles = Array.from(document.querySelectorAll('.spec-title'));
    const colorLabel = specTitles.find(el => /^color$/i.test(el.textContent.trim()));
    if (colorLabel) {
      const info = colorLabel.closest('[class*="th"]')?.nextElementSibling?.querySelector('.spec-info');
      if (info) return clean(info.textContent);
    }

    return '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Color → FB color mapping — keep H-D color names, map to FB options
  // ─────────────────────────────────────────────────────────────────────────
  function mapColorToFB(raw) {
    if (!raw) return '';
    const s = raw.toLowerCase();
    const rules = [
      [/vivid\s*black|black\s*denim|midnight|jet|onyx|ebony/, 'Black'],
      [/white|ivory|alabaster|birch|bright\s*white/, 'White'],
      [/silver|platinum|slate|graphite|titanium|stone\s*washed/, 'Silver'],
      [/charcoal|gunpowder|dark\s*gray|dark\s*grey/, 'Charcoal'],
      [/citrus|amber|gold\s*dust|sunburst|yellow/, 'Orange'],  // Citrus Heat is orange
      [/electric\s*coast|steel\s*blue|river\s*rock|laguna|sonic\s*blue|blue/, 'Blue'],
      [/red|crimson|cardinal|ruby|cherry|scarlet|apple|snake|wicked/, 'Red'],
      [/orange|sunfire|barracuda/, 'Orange'],
      [/green|jade|olive|forest/, 'Green'],
      [/purple|plum|violet/, 'Purple'],
      [/bronze|brown|chocolate|espresso|copper|whiskey/, 'Brown'],
      [/gray|grey|pewter/, 'Grey'],
      [/gold/, 'Gold'],
    ];
    for (const [re, label] of rules) {
      if (re.test(s)) return label;
    }
    // Fallback to generic normColor
    return normColor ? normColor(raw) : raw;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Price — read the DISPLAYED sale price only. Never use hidden MSRP from analytics.
  //  The page shows: label "Price" + "$17,999" in the top-right panel.
  //  For call-for-price bikes there is no dollar amount visible → return 0.
  // ─────────────────────────────────────────────────────────────────────────
  function parsePrice() {
    // 1. "Call for price" check — if present with no dollar amount, return 0 immediately
    const hasCallForPrice = /call\s+for\s+(price|pricing)|call\s+to\s+order/i.test(document.body.innerText);

    // 2. Target the specific price display element on HouseOfThunder/DX1 pages.
    //    Exclude our own sidebar which may show prices from previously scanned bikes.
    const sidebar = document.getElementById('vp-sidebar');

    const allLeaves = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        if (!el.offsetParent || el.children.length) return false;
        if (sidebar && sidebar.contains(el)) return false; // exclude our sidebar
        return true;
      });

    for (let i = 0; i < allLeaves.length; i++) {
      const txt = (allLeaves[i].innerText || '').trim();
      // Found a "Price" label
      if (/^price$/i.test(txt)) {
        // Check next few siblings/cousins for a dollar amount
        for (let j = i + 1; j < Math.min(i + 8, allLeaves.length); j++) {
          const val = (allLeaves[j].innerText || '').trim();
          const m = val.match(/^\$\s*([\d,]+)$/);
          if (m) {
            const n = parseInt(m[1].replace(/,/g, ''), 10);
            if (n >= 100) return n;
          }
          // Stop if we hit another label-like element
          if (val.length > 0 && val.length < 30 && !/\d/.test(val) && j > i + 1) break;
        }
      }
    }

    // 3. Any visible dollar amount in a price-specific class
    const priceSelectors = [
      '[class*="sale-price"]', '[class*="selling-price"]', '[class*="our-price"]',
      '[class*="final-price"]', '[class*="price-value"]', '[class*="price-display"]',
      '[class*="vehicle-price"]', '[class*="list-price"]',
    ];
    for (const sel of priceSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!el.offsetParent) continue;
        if (sidebar && sidebar.contains(el)) continue; // exclude sidebar
        const m = (el.innerText || '').match(/\$\s*([\d,]+)/);
        if (m) {
          const n = parseInt(m[1].replace(/,/g, ''), 10);
          if (n >= 100) return n;
        }
      }
    }

    // 4. displayedPrice — the actual price the dealer chose to show (0.00 = GET PRICE)
    //    currentPrice is similar but displayedPrice is more reliable
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"displayedPrice"\s*:\s*"([\d.]+)"/);
      if (m) {
        const n = parseFloat(m[1]);
        if (n >= 100) return Math.round(n);
        break; // displayedPrice of 0 = GET PRICE, fall through to MSRP
      }
    }

    // 5. currentPrice fallback
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"currentPrice"\s*:\s*"([\d.]+)"/);
      if (m) {
        const n = parseFloat(m[1]);
        if (n >= 100) return Math.round(n);
        break;
      }
    }

    // 6. JSON-LD offers.price
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const p = Number(data?.offers?.price);
        if (p >= 100) return Math.round(p);
      } catch (_) {}
    }

    // 7. MSRP — only reached for GET PRICE bikes. Value is "49499.00" format.
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"msrp"\s*:\s*"([\d.]+)"/);
      if (m) {
        const n = parseFloat(m[1]);
        if (n >= 1000) return Math.round(n);
      }
    }

    return hasCallForPrice ? 0 : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Stock number — label is "Stock Number" (not "Stock #") in spec-title
  // ─────────────────────────────────────────────────────────────────────────
  function getStockNumber() {
    // 1. JSON-LD sku field
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        if (data.sku && data['@type'] === 'Product') return data.sku;
      } catch (_) {}
    }

    // 2. DOM: spec-title "Stock Number" → sibling spec-info
    const specTitles = Array.from(document.querySelectorAll('.spec-title'));
    const stockLabel = specTitles.find(el => /stock\s*(number|#)/i.test(el.textContent.trim()));
    if (stockLabel) {
      const info = stockLabel.closest('[class*="th"]')?.nextElementSibling?.querySelector('.spec-info')
                || stockLabel.parentElement?.nextElementSibling?.querySelector('.spec-info');
      if (info) return clean(info.textContent);
    }

    // 3. Text scan
    const m = document.body.innerText.match(/stock\s*(number|#)\s*:?\s*([A-Z][A-Z0-9-]{3,})/i);
    return m ? m[2] : '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Mileage — "Miles: 5" or spec-title "Miles" → spec-info
  // ─────────────────────────────────────────────────────────────────────────
  function getMileage() {
    // DOM spec rows
    const specTitles = Array.from(document.querySelectorAll('.spec-title'));
    const milesLabel = specTitles.find(el => /^miles?$|^mileage$|^odometer$/i.test(el.textContent.trim()));
    if (milesLabel) {
      const info = milesLabel.closest('[class*="th"]')?.nextElementSibling?.querySelector('.spec-info')
                || milesLabel.parentElement?.nextElementSibling?.querySelector('.spec-info');
      if (info) return asNumber(info.textContent) ?? null;
    }

    // Text scan
    const m = document.body.innerText.match(/\bMiles?\s*:\s*([\d,]+)/i);
    if (m) return asNumber(m[1]);

    // JSON-LD
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const mi = data?.mileageFromOdometer?.value;
        if (mi != null) return Number(mi);
      } catch (_) {}
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Engine — spec-title "Engine" → spec-info, strip trailing junk
  // ─────────────────────────────────────────────────────────────────────────
  function getEngine() {
    const specTitles = Array.from(document.querySelectorAll('.spec-title'));
    const engineLabel = specTitles.find(el => /^engine(\s*size)?$/i.test(el.textContent.trim()));
    if (engineLabel) {
      const infoEl = engineLabel.closest('[class*="th"]')?.nextElementSibling?.querySelector('.spec-info')
                  || engineLabel.parentElement?.nextElementSibling?.querySelector('.spec-info');
      if (infoEl) {
        // Get only the first text node to avoid child element junk (ratings, counts etc.)
        const firstText = Array.from(infoEl.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .filter(Boolean)[0];
        if (firstText) return clean(firstText);
        // Fallback: full text but strip trailing digits/symbols
        return clean(infoEl.textContent).replace(/\s*\d+\s*$/, '').trim();
      }
    }

    // JSON-LD description often mentions engine
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'Product') {
          const m = data.description?.match(/Milwaukee-Eight[®\s]*\d+|[\d,]+ ?cc|[\d.]+ ?ci/i);
          if (m) return m[0].replace(/[®™©]/g, '').trim();
        }
      } catch (_) {}
    }

    const m = document.body.innerText.match(/\bEngine(?:\s*Size)?\s*:\s*(.+?)(?:\n|$)/i);
    return m ? m[1].trim() : '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Fuel type — motorcycles are almost always Petrol/Gasoline
  //  But check specs in case of electric (LiveWire etc.)
  // ─────────────────────────────────────────────────────────────────────────
  function getFuelType() {
    const specTitles = Array.from(document.querySelectorAll('.spec-title'));
    const fuelLabel = specTitles.find(el => /^fuel(\s*type)?$/i.test(el.textContent.trim()));
    if (fuelLabel) {
      const infoEl = fuelLabel.closest('[class*="th"]')?.nextElementSibling?.querySelector('.spec-info')
                  || fuelLabel.parentElement?.nextElementSibling?.querySelector('.spec-info');
      if (infoEl) return clean(infoEl.textContent);
    }

    // Check model name for electric
    const title = document.querySelector('h1')?.textContent || '';
    if (/livewire|electric|ev\b/i.test(title)) return 'Electric';

    return 'Petrol'; // default for H-D gas bikes
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Description — from JSON-LD (richest source on DX1 platform)
  // ─────────────────────────────────────────────────────────────────────────
  function getDescription() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'Product' && data.description?.length > 20) {
          return clean(data.description);
        }
      } catch (_) {}
    }

    const headings = Array.from(document.querySelectorAll('h2,h3,h4'));
    const dh = headings.find(h => /description|overview|about|features|highlight/i.test(h.textContent));
    if (dh) {
      const container = dh.closest('section,div') || dh.parentElement;
      const paras = Array.from(container.querySelectorAll('p'))
        .map(p => clean(p.textContent)).filter(t => t.length > 20);
      if (paras.length) return paras.join('\n\n');
    }

    return clean(document.querySelector('meta[name="description"]')?.content || '');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  VIN — JSON-LD vehicleIdentificationNumber or labeled text
  // ─────────────────────────────────────────────────────────────────────────
  function getVIN() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const vin = data?.vehicleIdentificationNumber || data?.vin;
        if (vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return vin.toUpperCase();
      } catch (_) {}
    }

    // shiftDigital script
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"vin"\s*:\s*"([A-HJ-NPR-Z0-9]{17})"/i);
      if (m) return m[1].toUpperCase();
    }

    const labeled = document.body.innerText.match(/\bVIN[#:\s]+([A-HJ-NPR-Z0-9]{17})\b/i);
    if (labeled) return labeled[1].toUpperCase();

    return '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  inferMotoType — from JSON-LD category + model name
  // ─────────────────────────────────────────────────────────────────────────
  function inferMotoType(model) {
    const s = model.toLowerCase();
    if (/road glide|street glide|electra glide|road king|ultra|bagger|tour/.test(s)) return 'Touring';
    if (/sportster|iron|forty|nightster|sport/.test(s)) return 'Sport';
    if (/softail|fat boy|heritage|breakout|street bob|low rider|deluxe|cruiser/.test(s)) return 'Cruiser';
    if (/dirt|trail|enduro|motocross/.test(s)) return 'Dirt bike';
    if (/scooter/.test(s)) return 'Scooter';
    return 'Cruiser';
  }


  // ─────────────────────────────────────────────────────────────────────────
  //  Image extraction — DX1/Dominion platform
  //  All bike photos: cdpcdn.dx1app.com/products-private/prod/.../{guid}/{seq}.jpg
  //  Critical: URLs are protocol-relative (//cdpcdn...) — must NOT filter by http://
  // ─────────────────────────────────────────────────────────────────────────
  async function getImages() {
    // Trigger lazy loading
    for (let i = 0; i < 4; i++) {
      window.scrollBy(0, window.innerHeight * 0.8);
      await sleep(150);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(300);

    // Click swiper next to force slides to render
    const nextBtn = document.querySelector('.swiper-button-next, [class*="slick-next"]');
    for (let i = 0; i < 20; i++) { nextBtn?.click(); await sleep(80); }

    // Collect ALL URLs from ENTIRE document (no gallery scoping — was causing misses)
    const allUrls = new Set();
    const attrs = ['src','data-src','data-lazy-src','data-lazy','data-original','data-full-src','data-image','data-url'];

    document.querySelectorAll('img, source, [data-src], [data-lazy-src]').forEach(el => {
      attrs.forEach(a => {
        const v = el.getAttribute(a);
        if (v && v.trim()) allUrls.add(v.trim()); // accept // protocol-relative too
      });
      ['srcset','data-srcset'].forEach(a => {
        const v = el.getAttribute(a);
        if (v) v.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).forEach(u => allUrls.add(u));
      });
    });

    console.log('[HouseOfThunder] Total raw URLs:', allUrls.size);

    // PRIORITY: cdpcdn.dx1app.com/products-private/prod — actual bike photos
    // Pattern: .../{listing-guid}/{10-digit-seq}.jpg  (no suffix = full size)
    //          .../{listing-guid}/{10-digit-seq}_480px.jpg  (thumbnail)
    const bySeq = new Map(); // seq -> {url, isThumb}

    for (const raw of allUrls) {
      if (!/cdpcdn\.dx1app\.com\/products-private\/prod\//i.test(raw)) continue;
      const url = raw.startsWith('//') ? 'https:' + raw : raw;
      const m = url.match(/\/(\d{10})(_\d+px)?\.jpg/i);
      if (!m) continue;
      const seq = m[1], isThumb = !!m[2];
      const existing = bySeq.get(seq);
      // Keep full-size over thumb; first-seen wins for same type
      if (!existing || (existing.isThumb && !isThumb)) {
        bySeq.set(seq, { url, isThumb });
      }
    }

    if (bySeq.size > 0) {
      const sorted = Array.from(bySeq.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { url }]) => url);
      console.log('[HouseOfThunder] Bike photos:', sorted.length, sorted[0]);
      return sorted.slice(0, 24);
    }

    // Fallback: any cdpcdn image
    const fallback = Array.from(allUrls)
      .filter(u => /cdpcdn\.dx1app\.com/i.test(u) && /\.(jpg|jpeg|png|webp)/i.test(u))
      .filter(u => !/logo|loading|spinner/i.test(u))
      .map(u => u.startsWith('//') ? 'https:' + u : u);

    console.log('[HouseOfThunder] Fallback images:', fallback.length);
    return [...new Set(fallback)].slice(0, 24);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Main scan function
  // ─────────────────────────────────────────────────────────────────────────
  async function scan() {
    await ensureContentLoaded();

    const head   = parseTitle();
    const price  = parsePrice();
    const vin    = getVIN();
    const stock  = getStockNumber();
    const desc   = getDescription();
    const images = await getImages();
    const mileage = getMileage();
    const engine  = getEngine();
    const rawColor = getColor();
    const fbColor  = mapColorToFB(rawColor);
    const bikeType = inferMotoType(head.model);
    const fuelType = getFuelType();

    // FB requires mileage >= 300 for used, but new bikes show 5 miles.
    // Use actual mileage for display; autofill will handle the FB minimum.
    const mileageDisplay = mileage ?? null;

    const v = {
      source: 'houseofthunderhd.com',
      url: location.href,
      vehicleCategory: 'motorcycle',

      title:  head.title,
      year:   head.year  ?? null,
      make:   head.make  || '',
      model:  head.model || '',
      trim:   head.trim  || '',

      bikeType,
      price:       price   ?? null,
      mileage:     mileageDisplay,
      vin:         vin     || '',
      stockNumber: stock   || '',

      exteriorColor: fbColor,
      colorRaw:      rawColor,
      interiorColor: '',
      engine,
      transmission: '',
      fuel:         fuelType,
      drivetrain:   '',

      images,
      imagesCount: images.length,
      description: desc
    };

    console.log('[HouseOfThunder] Final motorcycle data:', v);
    return v;
  }

  // Expose scan globally so sidebar.js pill click can invoke it
  window.__hotScan = scan;
  window.__hotShowModal = async function() {
    // Build modal if not present (in case buildPill was skipped)
    if (!document.getElementById('vp-modal')) {
      buildPill(); // will no-op on pill since it exists, but creates modal
    }
    const payload = await scan();
    const modal = document.getElementById('vp-modal');
    const grid  = document.getElementById('vp-grid');
    if (modal && grid) {
      const rows = [
        ['Title',       payload.title        || ''],
        ['Year',        payload.year         ?? ''],
        ['Make',        payload.make         || ''],
        ['Model',       payload.model        || ''],
        ['Type',        payload.bikeType     || ''],
        ['Price',       payload.price === 0 ? 'Call for Price ($0 on FB)' : payload.price != null ? `$${payload.price.toLocaleString()}` : '(not found)'],
        ['Mileage',     payload.mileage      ?? ''],
        ['VIN',         payload.vin          || ''],
        ['Stock #',     payload.stockNumber  || ''],
        ['Color (raw)', payload.colorRaw     || ''],
        ['Color (FB)',  payload.exteriorColor|| ''],
        ['Engine',      payload.engine       || ''],
        ['Images',      payload.imagesCount  ?? 0],
      ];
      grid.innerHTML = rows.map(([k,v]) =>
        `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`).join('');
      modal.classList.add('show');

      // Wire close if not already wired
      const close = document.getElementById('vp-close');
      if (close && !close.dataset.wired) {
        close.dataset.wired = '1';
        close.addEventListener('click', () => modal.classList.remove('show'));
        document.querySelector('#vp-modal .backdrop')
          ?.addEventListener('click', () => modal.classList.remove('show'));
      }

      // Wire Send to FB
      const send = document.getElementById('vp-send');
      if (send && !send.dataset.wired) {
        send.dataset.wired = '1';
        send.addEventListener('click', async () => {
          await chrome.storage.local.set({ vehiclePayload: payload, vehiclePayloadTs: Date.now() });
          const { vehicleHistory = [] } = await chrome.storage.local.get(['vehicleHistory']);
          const idx = vehicleHistory.findIndex(v => v.url === payload.url);
          if (idx >= 0) vehicleHistory[idx] = { ...vehicleHistory[idx], ...payload, scrapedAt: Date.now() };
          else { vehicleHistory.unshift({ ...payload, scrapedAt: Date.now() }); if (vehicleHistory.length > 20) vehicleHistory.splice(20); }
          await chrome.storage.local.set({ vehicleHistory });
          alert('Saved! Switch to the Facebook tab and click "Autofill motorcycle".');
        });
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Boot — wait for document.body then inject UI
  // ─────────────────────────────────────────────────────────────────────────
  function boot() {
    const path = location.pathname;
    console.log('[HouseOfThunder] boot() called, path:', path, 'body:', !!document.body);

    if (!document.body) {
      // Body not ready yet — wait for it
      console.warn('[HouseOfThunder] body not ready, waiting...');
      document.addEventListener('DOMContentLoaded', boot, { once: true });
      return;
    }

    // Inventory list page — no pill needed, sidebar handles it
    if (/\/Motorcycles(\/All-Inventory|\/?\??$)/i.test(path)) {
      console.log('[HouseOfThunder] Inventory list page detected');
      return;
    }

    // All other Motorcycles* pages are detail pages — inject pill
    if (document.getElementById('vp-pill')) {
      console.log('[HouseOfThunder] Pill already exists');
      return;
    }

    console.log('[HouseOfThunder] Injecting pill on detail page...');
    buildPill();
  }

  // Fire at every possible timing point
  boot();
  document.addEventListener('DOMContentLoaded', boot, { once: true });
  window.addEventListener('load', boot, { once: true });
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);
})();
