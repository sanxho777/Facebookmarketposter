// content/themotorcafe.js — The Motor Cafe motorcycle scraper + overlay
// Platform: ARI/Endeavor Suite  |  themotorcafe.com/inventory/*
(() => {
  const U = window.vputil || {};
  const { clean, asNumber, sleep, normColor } = U;

  // ---------- UI ----------
  function ensureUI() {
    if (document.getElementById('vp-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'vp-pill';
    pill.innerHTML = `
      <span class="label">Moto Poster</span>
      <span class="btn secondary" id="vp-scan">Scan</span>
      <span class="btn" id="vp-open-fb">Open Facebook</span>`;
    document.body.appendChild(pill);

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
        <div class="vp-footer">Tip: Use "Open Facebook" to launch the Marketplace form. Photos must be added manually.</div>
      </div>`;
    document.body.appendChild(modal);

    const grid = document.getElementById('vp-grid');
    let payload = null;

    async function scanAndRender() {
      payload = await scan();
      const rows = [
        ['Title',   payload.title         || ''],
        ['Year',    payload.year          ?? ''],
        ['Make',    payload.make          || ''],
        ['Model',   payload.model         || ''],
        ['Trim',    payload.trim          || ''],
        ['Price',   payload.price != null ? '$' + Number(payload.price).toLocaleString() : ''],
        ['Mileage', payload.mileage != null && payload.mileage < 300 ? '300 (FB min)' : (payload.mileage ?? '')],
        ['VIN',     payload.vin           || ''],
        ['Stock #', payload.stockNumber   || ''],
        ['Color',   payload.exteriorColor || ''],
        ['Engine',  payload.engine        || ''],
        ['Fuel',    payload.fuel          || ''],
        ['Trans',   payload.transmission  || ''],
        ['Images',  payload.imagesCount   ?? 0],
      ];
      grid.innerHTML = rows.map(function(r) {
        return '<tr><td class="key">' + r[0] + '</td><td>' + (r[1] ?? '') + '</td></tr>';
      }).join('');
    }

    const show = async () => { await scanAndRender(); document.getElementById('vp-modal').classList.add('show'); };
    const hide = () => document.getElementById('vp-modal').classList.remove('show');

    document.getElementById('vp-scan').addEventListener('click', show);
    document.getElementById('vp-rescan').addEventListener('click', scanAndRender);
    document.querySelector('#vp-modal .backdrop').addEventListener('click', hide);
    document.getElementById('vp-close').addEventListener('click', hide);
    document.getElementById('vp-open-fb').addEventListener('click', function() {
      window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
    });

    document.getElementById('vp-send').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      payload.vehicleCategory = 'motorcycle';
      await chrome.storage.local.set({ vehiclePayload: payload, vehiclePayloadTs: Date.now() });
      const { vehicleHistory = [] } = await chrome.storage.local.get(['vehicleHistory']);
      const idx = vehicleHistory.findIndex(function(v) { return v.url === payload.url; });
      if (idx >= 0) vehicleHistory[idx] = Object.assign({}, vehicleHistory[idx], payload, { scrapedAt: Date.now() });
      else { vehicleHistory.unshift(Object.assign({}, payload, { scrapedAt: Date.now() })); if (vehicleHistory.length > 20) vehicleHistory.splice(20); }
      await chrome.storage.local.set({ vehicleHistory });
      alert('Saved. Switch to the Facebook tab and click "Autofill".');
    });

    document.getElementById('vp-download').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      if (!payload.images || !payload.images.length) { alert('No images found.'); return; }
      const btn = document.getElementById('vp-download');
      btn.textContent = 'Starting...'; btn.disabled = true;
      try {
        const name = (payload.title || payload.year + ' ' + payload.make + ' ' + payload.model)
          .replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
        const resp = await chrome.runtime.sendMessage({ action: 'downloadImages', images: payload.images, folderName: name });
        if (resp.success) alert('Downloading ' + resp.downloaded + '/' + resp.total + ' photos to Downloads/' + name + '/');
        else throw new Error(resp.error);
      } catch(e) { alert('Download error: ' + e.message); }
      finally { setTimeout(function() { btn.textContent = 'Download Photos'; btn.disabled = false; }, 2000); }
    });

    window.__hotShowModal = show;
  }

  // ---------- SCRAPE ----------

  function fromJsonLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      try {
        const d = JSON.parse(scripts[i].textContent);
        if (d['@type'] === 'Product') return d;
      } catch(e) {}
    }
    return null;
  }

  function fromOverviewTable() {
    const out = {};
    const table = document.querySelector('.brochure-overview-table');
    if (!table) return out;
    const rows = table.querySelectorAll('tr');
    rows.forEach(function(tr) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;
      const label = (cells[0].textContent || '').trim().toLowerCase();
      const value = (cells[1].textContent || '').trim();
      if (/^vin$/.test(label))               out.vin         = value;
      if (/primary color|color/.test(label)) out.color       = value;
      if (/usage|mileage|miles/.test(label)) out.mileageRaw  = value;
      if (/stock/.test(label))               out.stockNumber = value;
    });
    return out;
  }

  function fromSpecTables() {
    const out = {};
    const tables = document.querySelectorAll('table.table-striped');
    tables.forEach(function(table) {
      const rows = table.querySelectorAll('tr');
      rows.forEach(function(tr) {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 2) return;
        const label = (cells[0].textContent || '').trim().toLowerCase();
        const value = (cells[1].textContent || '').trim();
        if (/engine type/.test(label))           out.engineType   = value;
        if (/displacement/.test(label))          out.displacement = value;
        if (/fuel system|fuel type/.test(label)) out.fuelRaw      = value;
        if (/^transmission$/.test(label))        out.transmission = value;
      });
    });
    return out;
  }

  function parsePrice(ld) {
    const ldPrice = Number(ld && ld.offers && ld.offers.price);
    if (ldPrice >= 100) return ldPrice;
    const el = document.querySelector('span.value, span[itemprop="price"]');
    if (el) {
      const n = asNumber(el.textContent);
      if (n >= 100) return n;
    }
    return null;
  }

  function getImages(ld) {
    if (ld && ld.image) {
      const raw = Array.isArray(ld.image) ? ld.image : [ld.image];
      const urls = raw
        .map(function(u) { return u.startsWith('//') ? 'https:' + u : u; })
        .filter(function(u) { return /\.(jpg|jpeg|png|webp)/i.test(u); });
      const inventory = urls.filter(function(u) { return /\/inventory\//i.test(u); });
      const catalog   = urls.filter(function(u) { return !/\/inventory\//i.test(u); });
      return inventory.concat(catalog).slice(0, 24);
    }
    const found = new Set();
    document.querySelectorAll('img[src], [data-src]').forEach(function(el) {
      ['src','data-src'].forEach(function(a) {
        const v = el.getAttribute(a);
        if (v && /cdnmedia\.endeavorsuite\.com/i.test(v) && /\.(jpg|jpeg|png|webp)/i.test(v))
          found.add(v.startsWith('//') ? 'https:' + v : v);
      });
    });
    return Array.from(found).slice(0, 24);
  }

  function parseTitle(ld) {
    const raw = ((ld && ld.name) || (document.querySelector('h1') && document.querySelector('h1').textContent) || '').trim();
    const m = raw.match(/^(\d{4})\s+(\S+)\s+(.+)$/);
    if (m) {
      const year  = parseInt(m[1], 10);
      const make  = m[2];
      const parts = m[3].split(/\s+/);
      return { year: year, make: make, model: parts[0], trim: parts.slice(1).join(' '), title: raw };
    }
    return { year: null, make: '', model: raw, trim: '', title: raw };
  }

  async function scan() {
    for (let i = 0; i < 4; i++) { window.scrollBy(0, window.innerHeight * 0.7); await sleep(150); }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(200);

    const ld       = fromJsonLD();
    const overview = fromOverviewTable();
    const specs    = fromSpecTables();
    const head     = parseTitle(ld);
    const price    = parsePrice(ld);
    const images   = getImages(ld);

    const mileageStr = (overview.mileageRaw || '').replace(/miles?/i, '').trim();
    const mileage = asNumber(mileageStr) != null ? asNumber(mileageStr) : null;

    const engine = [specs.engineType, specs.displacement].filter(Boolean).join(' — ');

    const fuel = /electric/i.test(specs.fuelRaw || '') ? 'Electric'
               : /hybrid/i.test(specs.fuelRaw || '')   ? 'Hybrid'
               : 'Petrol';

    const transmission = /auto/i.test(specs.transmission || '')
      ? 'Automatic transmission' : 'Manual transmission';

    const colorRaw = overview.color || '';
    const exteriorColor = normColor ? normColor(colorRaw) : colorRaw;

    const v = {
      source:          'themotorcafe.com',
      url:             location.href,
      vehicleCategory: 'motorcycle',
      title:           head.title,
      year:            head.year,
      make:            head.make,
      model:           head.model,
      trim:            head.trim,
      price:           price,
      mileage:         mileage,
      vin:             overview.vin || '',
      stockNumber:     overview.stockNumber || (ld && ld.sku) || '',
      exteriorColor:   exteriorColor,
      engine:          engine,
      fuel:            fuel,
      transmission:    transmission,
      images:          images,
      imagesCount:     images.length,
      description:     ((ld && ld.description) || (document.querySelector('meta[name="description"]') && document.querySelector('meta[name="description"]').content) || '').trim(),
    };

    console.log('[MotorCafe] Scraped:', v);
    return v;
  }

  // ---------- BOOT ----------
  const isDetailPage = function() { return /\/inventory\/[^/]+/i.test(location.pathname); };

  if (isDetailPage()) {
    ensureUI();
  }

  window.__hotShowModal = async function() {
    ensureUI();
    const btn = document.getElementById('vp-scan');
    if (btn) btn.click();
  };
})();
