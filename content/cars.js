// content/cars.js — cars.com scraper + overlay (Scan-button starts it)
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
      <span class="label">Vehicle Poster</span>
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
            <span class="btn secondary" id="vp-rescan">Rescan</span>
            <span class="btn" id="vp-send">Send to FB tab</span>
            <span class="btn secondary" id="vp-download">Download Photos</span>
            <span class="close" id="vp-close">Close</span>
          </div>
        </div>
        <div class="vp-body">
          <table class="vp-grid" id="vp-grid"></table>
        </div>
        <div class="vp-footer">Tip: Use “Open Facebook” to launch the Marketplace vehicle form. Photos must be added manually (browser security).</div>
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
        ['Interior', payload.interiorColor || ''],
        ['Drivetrain', payload.drivetrain || ''],
        ['Transmission', payload.transmission || ''],
        ['Engine', payload.engine || ''],
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
      window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
    });

    document.getElementById('vp-send').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      await chrome.storage.local.set({ vehiclePayload: payload, vehiclePayloadTs: Date.now() });

      // Add to vehicle history
      const { vehicleHistory = [] } = await chrome.storage.local.get(['vehicleHistory']);

      // Check if vehicle already exists in history (by URL)
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
      alert('Saved. Switch to the Facebook tab and click "Autofill vehicle".');
    });

    document.getElementById('vp-download').addEventListener('click', async () => {
      if (!payload) payload = await scan();
      await downloadPhotosAsZip(payload);
    });
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
      if ($$('h2,h3').some(h => /basics/i.test(h.textContent || ''))) break;
    }
  }

  function fromBasics() {
    const heads = $$('h2,h3').filter(h => /basics/i.test(h.textContent || ''));
    if (!heads.length) return {};
    const block = heads[0].closest('section,div') || heads[0].parentElement;

    const get = (re) => {
      const leaves = $$('*', block).filter(n => !n.children.length);
      
      // First try to find the value in the next leaf node
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const t = clean(leaf.textContent);
        if (re.test(t)) {
          // Check the next leaf node for the value
          if (i + 1 < leaves.length) {
            const nextLeaf = leaves[i + 1];
            const v = clean(nextLeaf.textContent || '');
            if (v && v !== t) return v; // Make sure it's not the same text
          }
        }
      }
      
      // Fallback to original DOM sibling logic
      for (const leaf of leaves) {
        const t = clean(leaf.textContent);
        if (!re.test(t)) continue;

        const p = leaf.parentElement;
        if (p && p.children.length >= 2) {
          const idx = Array.from(p.children).indexOf(leaf);
          const right = p.children[idx + 1] || p.children[p.children.length - 1];
          const v = clean(right?.textContent || '');
          if (v) return v;
        }
        const sib = leaf.nextElementSibling;
        if (sib) {
          const v = clean(sib.textContent || '');
          if (v) return v;
        }
      }
      return '';
    };

    const ext  = get(/^\s*Exterior color/i);
    const intr = get(/^\s*Interior color/i);
    const drive= get(/^\s*Drivetrain/i);
    const fuel = get(/^\s*Fuel type/i);
    const trans= get(/^\s*Transmission/i);
    const engine= get(/^\s*Engine/i);
    const vin  = get(/^\s*VIN/i);
    const miles= get(/^\s*Mileage/i);

    return {
      exteriorColorRaw: ext, interiorColorRaw: intr,
      drivetrain: drive || '',
      fuel: fuel || '',
      transmission: trans || '',
      engine: engine || '',
      vin: vin || '',
      mileage: U.asNumber ? U.asNumber(miles) : asNumber(miles)
    };
  }

  function parseHeaderTitle() {
    const h1 = $('h1', document);
    const txt = clean(h1?.textContent || '');
    
    // Multi-word brands that need special handling
    const multiWordBrands = [
      'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Rolls-Royce', 
      'Mercedes-Benz', 'Lucid'
    ];
    
    let year = null, make = '', model = '', trim = '';
    
    // Extract year first
    const yearMatch = txt.match(/(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      
      // Remove year from string to parse the rest
      const withoutYear = txt.replace(/^\d{4}\s*/, '').trim();
      
      // Check for multi-word brands first
      let foundMultiWordBrand = false;
      for (const brand of multiWordBrands) {
        if (withoutYear.toLowerCase().startsWith(brand.toLowerCase())) {
          make = brand;
          const afterBrand = withoutYear.substring(brand.length).trim();
          
          // Parse model and trim from remaining text
          const parts = afterBrand.split(/\s+/);
          if (parts.length > 0 && parts[0]) {
            model = parts[0];
            if (parts.length > 1) {
              trim = parts.slice(1).join(' ');
            }
          }
          foundMultiWordBrand = true;
          break;
        }
      }
      
      // If no multi-word brand found, use original logic
      if (!foundMultiWordBrand) {
        const parts = withoutYear.split(/\s+/);
        if (parts.length >= 2) {
          make = parts[0];
          model = parts[1];
          if (parts.length > 2) {
            trim = parts.slice(2).join(' ');
          }
        }
      }
    }
    
    return {year, make, model, trim, title: txt};
  }

  function parsePrice() {
    // Accept "$17,229" OR "$17229"
    const money = /\$?\d{1,3}(?:,\d{3})+|\$\d{4,6}/;
    const nodes = $$('h1,h2,h3,[data-test*="price"],[class*="price"],div,span', document)
      .filter(el => el.offsetParent !== null) // visible-ish
      .slice(0, 500);

    for (const n of nodes) {
      const t = clean(n.textContent);
      const m = t.match(money);
      if (m) return U.asNumber ? U.asNumber(m[0]) : asNumber(m[0]);
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
    
    // Filter for high-quality car images only
    const highQualityCarImages = validUrls.filter(u => {
      // Must be a valid image format
      if (!/\.(jpg|jpeg|png|webp)/i.test(u)) return false;
      
      // Exclude common non-car images
      if (/sprite|icon|logo|favicon|avatar|profile|thumbnail|thumb|small|mini/i.test(u)) return false;
      
      // Exclude very small images (likely thumbnails)
      const sizeMatch = u.match(/(\d{2,4})x(\d{2,4})/);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1]);
        const height = parseInt(sizeMatch[2]);
        // Exclude images smaller than 400x300 (likely thumbnails)
        if (width < 400 || height < 300) return false;
      }
      
      // Include images that are clearly vehicle-related or high quality
      return (
        u.includes('vehicle') || 
        u.includes('car') || 
        u.includes('auto') || 
        /photo|image|gallery/.test(u) ||
        /large|big|full|original|high|detail/i.test(u) ||
        // Include larger dimension patterns (high quality indicators)
        /\d{3,4}x\d{3,4}/.test(u)
      );
    });
    
    // Remove duplicates and limit to exactly 20 high-quality images
    const uniqueImages = Array.from(new Set(highQualityCarImages));
    return uniqueImages.slice(0, 20);
  }

  async function scan() {
    await ensureBasicsVisible();

    const basic = fromBasics();
    const head  = parseHeaderTitle();
    const price = parsePrice();

    const v = {
      source: 'cars.com',
      url: location.href,
      title: head.title || titleFromParts(head),

      year: head.year ?? null,
      make: head.make || '',
      model: head.model || '',
      trim: head.trim || '',

      price: price ?? null,
      mileage: basic.mileage ?? null,
      vin: basic.vin || '',

      exteriorColor: normColor(basic.exteriorColorRaw || ''),
      interiorColor: normColor(basic.interiorColorRaw || ''),
      drivetrain: basic.drivetrain || '',
      transmission: basic.transmission || '',
      fuel: basic.fuel || '',
      engine: basic.engine || '',

      images: getImages(),
      imagesCount: getImages().length,
      description: clean(document.querySelector('meta[name="description"]')?.content || '')
    };

    return v;
  }

  // boot
  ensureUI();
})();
