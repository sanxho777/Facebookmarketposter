// content/themotorcafe.js — The Motor Cafe motorcycle scraper + overlay (Scan-button starts it)
(() => {
  const U = window.vputil || {};
  const {
    $, $$, clean, asNumber, sleep,
    normColor, titleFromParts
  } = U;

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
        <div class="vp-footer">Tip: Use "Open Facebook" to launch the Marketplace motorcycle form. Photos must be added manually (browser security).</div>
      </div>`;
    document.body.appendChild(modal);

    const grid = document.getElementById('vp-grid');
    let payload = null;

    async function scanAndRender() {
      payload = await scan();
      const rows = [
        ['Title', payload.title || ''],
        ['Year', payload.year ?? ''],
        ['Make', payload.make || ''],
        ['Model', payload.model || ''],
        ['Trim', payload.trim || ''],
        ['Price', payload.price ?? ''],
        ['Mileage', payload.mileage ?? ''],
        ['VIN', payload.vin || ''],
        ['Exterior', payload.exteriorColor || ''],
        ['Engine', payload.engine || ''],
        ['Fuel', payload.fuel || ''],
        ['Images', payload.imagesCount ?? 0]
      ];
      grid.innerHTML = rows.map(([k, v]) =>
        `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`).join('');
    }

    const show = async () => { await scanAndRender(); document.getElementById('vp-modal').classList.add('show'); };
    const hide = () => document.getElementById('vp-modal').classList.remove('show');

    document.getElementById('vp-scan').addEventListener('click', show);
    document.getElementById('vp-rescan').addEventListener('click', scanAndRender);
    document.querySelector('#vp-modal .backdrop').addEventListener('click', hide);
    document.getElementById('vp-close').addEventListener('click', hide);

    document.getElementById('vp-open-fb').addEventListener('click', () => {
      window.open('https://www.facebook.com/marketplace/create/motorcycle', '_blank');
    });

    document.getElementById('vp-send').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      payload.vehicleCategory = 'motorcycle';
      await chrome.storage.local.set({ vehiclePayload: payload, vehiclePayloadTs: Date.now() });

      // Add to vehicle history
      const { vehicleHistory = [] } = await chrome.storage.local.get(['vehicleHistory']);

      // Check if motorcycle already exists in history (by URL)
      const existingIndex = vehicleHistory.findIndex(v => v.url === payload.url);
      if (existingIndex >= 0) {
        // Update existing entry
        vehicleHistory[existingIndex] = { ...vehicleHistory[existingIndex], ...payload, scrapedAt: Date.now() };
      } else {
        // Add new entry at the beginning
        vehicleHistory.unshift({ ...payload, scrapedAt: Date.now() });

        // Keep only last 20 vehicles
        if (vehicleHistory.length > 20) {
          vehicleHistory.splice(20);
        }
      }

      await chrome.storage.local.set({ vehicleHistory });
      alert('Saved. Switch to the Facebook tab and click "Autofill motorcycle".');
    });

    document.getElementById('vp-download').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      await downloadPhotosAsZip(payload);
    });

    // Expose showModal for sidebar
    window.__hotShowModal = show;
  }

  // ---------- DOWNLOAD ----------
  async function downloadPhotosAsZip(payload) {
    if (!payload.images || payload.images.length === 0) {
      alert('No images found to download.');
      return;
    }

    const downloadBtn = document.getElementById('vp-download');
    const originalText = downloadBtn.textContent;
    
    try {
      downloadBtn.textContent = 'Starting downloads...';
      downloadBtn.disabled = true;

      const vehicleTitle = payload.title || `${payload.year} ${payload.make} ${payload.model}`.trim();
      const folderName = vehicleTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      
      // Send message to background script to handle downloads
      const response = await chrome.runtime.sendMessage({
        action: 'downloadImages',
        images: payload.images,
        folderName: folderName
      });
      
      if (response.success) {
        alert(`Started downloading ${response.downloaded}/${response.total} photos to Downloads/${folderName}/\n\nImages will appear in your Downloads folder shortly.`);
        
        if (response.errors.length > 0) {
          console.warn('Some downloads failed:', response.errors);
        }
      } else {
        throw new Error(response.error || 'Download failed');
      }
      
    } catch (error) {
      console.error('Error downloading photos:', error);
      alert('Error downloading photos. Check console for details.');
    } finally {
      setTimeout(() => {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
      }, 2000);
    }
  }

  // ---------- SCRAPE ----------
  async function ensureBasicsVisible() {
    for (let i = 0; i < 6; i++) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.7));
      await sleep(200);
      if ($$('h2,h3').some(h => /specifications|details/i.test(h.textContent || ''))) break;
    }
  }

  function fromBasics() {
    // Look for "Specifications" or "Details" section
    const heads = $$('h2,h3').filter(h => /specifications|details/i.test(h.textContent || ''));

    // Use the section if found, otherwise search entire document
    const block = heads.length > 0
      ? (heads[0].closest('section,div') || heads[0].parentElement)
      : document.body;

    // Helper to extract value from text labels
    const extractValue = (text, keyword) => {
      const pattern1 = new RegExp(`^(.+?)\\s+${keyword}\\s*$`, 'i');
      const match1 = text.match(pattern1);
      if (match1) return match1[1].trim();

      const pattern2 = new RegExp(`^${keyword}\\s*:\\s*(.+)$`, 'i');
      const match2 = text.match(pattern2);
      if (match2) return match2[1].trim();

      return null;
    };

    // Search all text nodes for keyword patterns
    const findByKeyword = (keywords, currentKeyword) => {
      const allText = $$('*', block)
        .filter(n => n.offsetParent !== null) // visible elements
        .map(n => clean(n.textContent))
        .filter(t => t.length > 0 && t.length < 200); // shorter text = more specific

      for (const keyword of keywords) {
        for (const text of allText) {
          const value = extractValue(text, keyword);
          if (value) {
            return value;
          }
        }
      }
      return '';
    };

    const ext   = findByKeyword(['color', 'exterior'], 'color');
    const engine= findByKeyword(['engine', 'displacement'], 'engine');
    const fuel  = findByKeyword(['fuel type', 'fuel'], 'fuel type');
    const trans = findByKeyword(['transmission'], 'transmission');
    const miles = asNumber(findByKeyword(['mileage', 'miles'], 'mileage'));

    return {
      exteriorColorRaw: ext || '',
      engine: engine || '',
      fuel: fuel || '',
      transmission: trans || '',
      mileage: miles
    };
  }

  function parseHeaderTitle() {
    const h1 = $('h1,h2', document);
    let txt = clean(h1?.textContent || '');

    // Remove "New" or "Used" prefix
    txt = txt.replace(/^(Used|New)\s+/i, '');

    let year = null, make = '', model = '', trim = '';

    // Extract year
    const yearMatch = txt.match(/(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      const withoutYear = txt.replace(/^\d{4}\s*/, '').trim();
      const parts = withoutYear.split(/\s+/);
      if (parts.length >= 2) {
        make = parts[0];
        model = parts[1];
        if (parts.length > 2) {
          trim = parts.slice(2).join(' ');
        }
      }
    }

    return {year, make, model, trim, title: clean(h1?.textContent || '')};
  }

  function parsePrice() {
    const money = /\$?\d{1,3}(?:,\d{3})+|\$\d{4,6}/;
    const nodes = $$('h1,h2,h3,[data-test*="price"],[class*="price"],div,span', document)
      .filter(el => el.offsetParent !== null)
      .slice(0, 500);

    for (const n of nodes) {
      const t = clean(n.textContent);
      const m = t.match(money);
      if (m) return asNumber(m[0]);
    }
    return null;
  }

  function getImages() {
    const elements = $$('img[src], source[srcset]', document);
    
    const allUrls = elements
      .map(el => el.getAttribute('src') || el.getAttribute('srcset') || '')
      .flatMap(s => s.split(/\s*,\s*/))
      .map(s => s.replace(/\s+\d+w$/, ''));
    
    const validUrls = allUrls.filter(u => /^https?:\/\//i.test(u));
    
    // Filter for high-quality motorcycle images
    const highQualityImages = validUrls.filter(u => {
      // Must be a valid image format
      if (!/\.(jpg|jpeg|png|webp)/i.test(u)) return false;
      
      // Exclude common non-product images
      if (/sprite|icon|logo|favicon|avatar|profile|thumbnail|thumb|small|mini/i.test(u)) return false;
      
      // Exclude very small images
      const sizeMatch = u.match(/(\d{2,4})x(\d{2,4})/);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1]);
        const height = parseInt(sizeMatch[2]);
        if (width < 400 || height < 300) return false;
      }
      
      // Include motorcycle-related or high quality images
      return (
        u.includes('motorcycle') || 
        u.includes('bike') || 
        u.includes('moto') || 
        /photo|image|gallery|product/.test(u) ||
        /large|big|full|original|high|detail/i.test(u) ||
        /\d{3,4}x\d{3,4}/.test(u)
      );
    });
    
    return Array.from(new Set(highQualityImages)).slice(0, 20);
  }

  async function scan() {
    await ensureBasicsVisible();

    const basic = fromBasics();
    const head  = parseHeaderTitle();
    const price = parsePrice();

    const v = {
      source: 'themotorcafe.com',
      url: location.href,
      title: head.title || titleFromParts(head),

      year: head.year ?? null,
      make: head.make || '',
      model: head.model || '',
      trim: head.trim || '',

      price: price ?? null,
      mileage: basic.mileage ?? null,
      vin: '',

      exteriorColor: normColor(basic.exteriorColorRaw || ''),
      engine: basic.engine || '',
      fuel: basic.fuel || '',
      transmission: basic.transmission || '',

      images: getImages(),
      imagesCount: getImages().length,
      description: clean(document.querySelector('meta[name="description"]')?.content || '')
    };

    return v;
  }

  // boot
  ensureUI();
})();
