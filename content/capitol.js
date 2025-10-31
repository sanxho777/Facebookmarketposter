// content/capitol.js — Capitol Chevrolet scraper + overlay
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
        <div class="vp-footer">Tip: Use "Open Facebook" to launch the Marketplace vehicle form. Photos must be added manually (browser security).</div>
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
    // Scroll to make sure all info is loaded
    for (let i = 0; i < 6; i++) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.7));
      await sleep(200);
      if ($$('h2,h3').some(h => /basic\s*info|dealer\s*comments|key\s*features/i.test(h.textContent || ''))) break;
    }
  }

  function parseHeaderTitle() {
    // Look for the main title - it's in an h1 or similar heading
    // Format: "PRE-OWNED 2018 Chevrolet Equinox Premier Front Wheel Drive SUV"
    const h1 = $('h1', document);
    let txt = clean(h1?.textContent || '');

    // Remove "PRE-OWNED", "Used", "New", etc.
    txt = txt.replace(/^(PRE-OWNED|Used|New|USED|NEW)\s+/i, '');

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
      let withoutYear = txt.replace(/^\d{4}\s*/, '').trim();

      // Remove common suffixes like "Front Wheel Drive SUV", "AWD Sedan", etc.
      withoutYear = withoutYear.replace(/\s+(Front Wheel Drive|AWD|4WD|RWD|FWD)\s+(SUV|Sedan|Coupe|Truck|Van|Wagon|Hatchback)$/i, '').trim();

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

    // Return the original h1 text for the title
    return {year, make, model, trim, title: clean(h1?.textContent || '')};
  }

  function getVIN() {
    // Look for VIN in the page - it's typically displayed near the stock number
    // Format: "VIN: 2GNAXMEV1J6102807    STOCK: UC14647"
    const vinText = $$('*', document)
      .map(el => clean(el.textContent))
      .find(t => /VIN:/i.test(t));

    if (vinText) {
      const match = vinText.match(/VIN:\s*([A-HJ-NPR-Z0-9]{17})/i);
      if (match) return match[1];
    }

    // Also check for standalone VIN pattern
    const allText = $$('*', document)
      .map(el => clean(el.textContent))
      .filter(t => t.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(t));

    return allText[0] || '';
  }

  function parsePrice() {
    // Look for "Sale Price" section
    // The price is typically displayed near the top with "Sale Price" label
    const priceElements = $$('*', document)
      .filter(el => el.offsetParent !== null);

    for (const el of priceElements) {
      const text = clean(el.textContent);
      // Look for price pattern near "Sale Price" text
      if (/Sale\s*Price/i.test(text)) {
        const match = text.match(/\$(\d{1,3}(?:,\d{3})+|\d{4,6})/);
        if (match) {
          return U.asNumber ? U.asNumber(match[0]) : asNumber(match[0]);
        }
      }
    }

    // Fallback: search for any price-like pattern near the top
    const money = /\$(\d{1,3}(?:,\d{3})+|\d{4,6})/;
    const topElements = $$('h1,h2,h3,div,span', document)
      .filter(el => el.offsetParent !== null)
      .slice(0, 300);

    for (const el of topElements) {
      const text = clean(el.textContent);
      const match = text.match(money);
      if (match) {
        return U.asNumber ? U.asNumber(match[0]) : asNumber(match[0]);
      }
    }

    return null;
  }

  function fromBasicInfo() {
    // Look for the "Basic Info" section
    const basicInfoHeading = $$('h2,h3,h4', document)
      .find(h => /Basic\s*Info/i.test(h.textContent || ''));

    console.log('[Capitol Scraper] Basic Info heading found:', !!basicInfoHeading);

    if (!basicInfoHeading) {
      // Fallback to searching entire page
      console.log('[Capitol Scraper] Using fallback extraction');
      return extractFromWholePage();
    }

    // Find the container that holds the basic info data
    const container = basicInfoHeading.closest('section,div') || basicInfoHeading.parentElement;
    console.log('[Capitol Scraper] Container found:', !!container);

    // Helper to find value by label in the basic info section
    const findByLabel = (label, isNumeric = false) => {
      const elements = $$('*', container).filter(el => el.offsetParent !== null);

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const text = clean(el.textContent);

        // Check if this element contains the label
        if (new RegExp(`^${label}:?\\s*$`, 'i').test(text)) {
          // Look for the value in next siblings or parent's next element
          const parent = el.parentElement;
          if (parent) {
            const children = Array.from(parent.children);
            const labelIndex = children.indexOf(el);
            if (labelIndex >= 0 && labelIndex + 1 < children.length) {
              const nextEl = children[labelIndex + 1];
              // For numeric values, only get the direct text content of that element
              if (isNumeric) {
                // Get only the immediate text nodes, not nested elements
                let textContent = '';
                for (let node of nextEl.childNodes) {
                  if (node.nodeType === Node.TEXT_NODE) {
                    textContent += node.textContent;
                  }
                }
                return clean(textContent) || clean(nextEl.textContent);
              }
              return clean(nextEl.textContent);
            }
          }
        }

        // Also check for "Label: Value" format
        // Updated regex to better handle color names with multiple capitalized words
        const match = text.match(new RegExp(`^${label}:\\s*(.+?)$`, 'i'));
        if (match && match[1]) {
          // Remove any trailing labels from the captured text
          let value = match[1].trim();
          // Remove text after common next labels
          value = value.replace(/\s+(Interior|Engine|Mileage|Body Style|Drivetrain|Transmission|Fuel):.*$/i, '');
          return value.trim();
        }
      }

      return '';
    };

    const exterior = findByLabel('Exterior');
    const interior = findByLabel('Interior');
    const engine = findByLabel('Engine');
    const mileage = findByLabel('Mileage', true);
    const drivetrain = findByLabel('Drivetrain');
    const transmission = findByLabel('Transmission');
    const fuelEff = findByLabel('Fuel Efficiency');

    console.log('[Capitol Scraper] Extracted values:', {
      exterior,
      interior,
      engine,
      mileage,
      drivetrain,
      transmission,
      fuelEff
    });

    return {
      exteriorColorRaw: exterior,
      interiorColorRaw: interior,
      engine: engine,
      mileage: mileage ? (U.asNumber ? U.asNumber(mileage) : asNumber(mileage)) : null,
      drivetrain: drivetrain,
      transmission: transmission,
      fuelEfficiency: fuelEff
    };
  }

  function extractFromWholePage() {
    // Fallback: search entire page for key-value patterns
    console.log('[Capitol Scraper] Using extractFromWholePage fallback');

    const allElements = $$('*', document).filter(el => el.offsetParent !== null);

    const data = {
      exteriorColorRaw: '',
      interiorColorRaw: '',
      engine: '',
      mileage: null,
      drivetrain: '',
      transmission: '',
      fuelEfficiency: ''
    };

    for (const el of allElements) {
      const text = clean(el.textContent);

      if (!data.exteriorColorRaw && /^Exterior:/i.test(text)) {
        // Try to extract just the color value, stopping before the next field
        const match = text.match(/^Exterior:\s*([^0-9]+?)(?:\s*Interior:|Engine:|Mileage:|$)/i);
        if (match) {
          data.exteriorColorRaw = match[1].trim();
          console.log('[Capitol Scraper] Found exterior (whole page):', data.exteriorColorRaw);
        }
      }

      if (!data.interiorColorRaw && /^Interior:/i.test(text)) {
        const match = text.match(/^Interior:\s*(.+?)(?:\s*Engine:|Mileage:|$)/i);
        if (match) {
          data.interiorColorRaw = match[1].trim();
          console.log('[Capitol Scraper] Found interior (whole page):', data.interiorColorRaw);
        }
      }

      if (!data.engine && /Engine:/i.test(text)) {
        const match = text.match(/Engine:\s*(.+?)(?:\s*Mileage:|$)/i);
        if (match) data.engine = match[1].trim();
      }

      if (!data.mileage && /Mileage:/i.test(text)) {
        // Extract only the numeric part with commas
        const match = text.match(/Mileage:\s*([\d,]+)/i);
        if (match) {
          data.mileage = U.asNumber ? U.asNumber(match[1]) : asNumber(match[1]);
        }
      }

      if (!data.drivetrain && /Drivetrain:/i.test(text)) {
        const match = text.match(/Drivetrain:\s*(.+?)(?:\s*Transmission:|$)/i);
        if (match) data.drivetrain = match[1].trim();
      }

      if (!data.transmission && /Transmission:/i.test(text)) {
        const match = text.match(/Transmission:\s*(.+?)(?:\s*Fuel Efficiency:|$)/i);
        if (match) data.transmission = match[1].trim();
      }

      if (!data.fuelEfficiency && /Fuel Efficiency:/i.test(text)) {
        const match = text.match(/Fuel Efficiency:\s*(.+?)$/i);
        if (match) data.fuelEfficiency = match[1].trim();
      }
    }

    return data;
  }

  function getDescription() {
    // Look for dealer comments section
    const dealerCommentsHeading = $$('h2,h3,h4', document)
      .find(h => /Dealer\s*Comments/i.test(h.textContent || ''));

    if (dealerCommentsHeading) {
      const container = dealerCommentsHeading.closest('section,div') || dealerCommentsHeading.parentElement;
      const paragraphs = $$('p', container).map(p => clean(p.textContent)).filter(t => t.length > 0);
      return paragraphs.join('\n\n');
    }

    // Fallback to meta description
    return clean(document.querySelector('meta[name="description"]')?.content || '');
  }

  function getImages() {
    // Get the VIN from the page to filter images for this specific vehicle
    const pageVin = getVIN();
    console.log('[Capitol Scraper] Current vehicle VIN:', pageVin);

    // FIRST: Try to find images in data attributes or gallery-specific elements
    // Many sites store the full image list in a data attribute or specific gallery container
    const galleryContainer = document.querySelector('[class*="gallery"], [class*="photos"], [class*="slider"], [id*="gallery"], [id*="photos"]');
    console.log('[Capitol Scraper] Gallery container found:', !!galleryContainer);

    if (galleryContainer) {
      console.log('[Capitol Scraper] Gallery container class:', galleryContainer.className);
      console.log('[Capitol Scraper] Gallery container id:', galleryContainer.id);
      console.log('[Capitol Scraper] Gallery container HTML:', galleryContainer.outerHTML.substring(0, 500));
    }

    // Look for data attributes that might contain image URLs
    let dataImages = [];
    if (galleryContainer) {
      // Check all data attributes
      const allDataAttrs = Array.from(galleryContainer.attributes).filter(attr => attr.name.startsWith('data-'));
      console.log('[Capitol Scraper] Gallery data attributes:', allDataAttrs.map(a => a.name));

      const dataAttr = galleryContainer.getAttribute('data-images') ||
                      galleryContainer.getAttribute('data-gallery') ||
                      galleryContainer.getAttribute('data-photos') ||
                      galleryContainer.getAttribute('data-src') ||
                      galleryContainer.getAttribute('data-srcset');
      if (dataAttr) {
        try {
          const parsed = JSON.parse(dataAttr);
          dataImages = Array.isArray(parsed) ? parsed : [];
          console.log('[Capitol Scraper] Found images in data attribute:', dataImages.length);
        } catch (e) {
          console.log('[Capitol Scraper] Could not parse data attribute:', e.message);
        }
      }
    }

    // Strategy: Find the main content area (exclude sidebars and "similar vehicles")
    // Look for the primary vehicle display section
    const mainContent = document.querySelector('main') ||
                       document.querySelector('article') ||
                       document.querySelector('[role="main"]') ||
                       document.querySelector('.container') ||
                       document.body;

    console.log('[Capitol Scraper] Main content area:', mainContent.tagName);

    // Exclude sections that typically contain other vehicles
    const excludedSections = $$('[class*="similar"], [class*="related"], [class*="recommend"], [id*="similar"], [id*="related"]', mainContent);
    console.log('[Capitol Scraper] Excluded sections found:', excludedSections.length);

    // Get all vehicle images from main content, but prioritize those in gallery container
    // First try to find images with vehicle-images in src
    let allImages = $$('img[src*="vehicle-images"]', galleryContainer || mainContent);
    console.log('[Capitol Scraper] Images with "vehicle-images" in src:', allImages.length);

    // If no images found, try ALL images in gallery container
    if (allImages.length === 0 && galleryContainer) {
      allImages = $$('img', galleryContainer);
      console.log('[Capitol Scraper] All images in gallery container:', allImages.length);
    }

    // Also check for lazy-loaded images
    const lazyImages = $$('img[data-src], img[data-lazy], img[data-original]', galleryContainer || mainContent);
    console.log('[Capitol Scraper] Lazy-loaded images found:', lazyImages.length);

    console.log('[Capitol Scraper] Total vehicle images in search area:', allImages.length);

    // Filter out images that are in excluded sections
    const galleryImages = allImages.filter(img => {
      // Check if image is inside an excluded section
      for (const excludedSection of excludedSections) {
        if (excludedSection.contains(img)) {
          console.log('[Capitol Scraper] Excluding image from similar/related section');
          return false;
        }
      }

      const src = img.getAttribute('src') || '';

      // Must be from vehicle-images CDN
      if (!/vehicle-images\.dealerinspire\.com/i.test(src)) return false;

      // Must be a photo (not badge/logo)
      if (!/\.(jpg|jpeg|png|webp)/i.test(src)) return false;
      if (/sprite|icon|logo|favicon|avatar|profile|banner|badge|button|validation|edmunds|cars-good|cars-fair|find-new-roads/i.test(src)) {
        console.log('[Capitol Scraper] Excluding badge/logo:', src);
        return false;
      }

      // Use VIN filtering ONLY if the image clearly has a different VIN
      // (not if it just doesn't have a VIN at all)
      if (pageVin && src.includes('/')) {
        // Extract VIN pattern from URL (17 alphanumeric characters)
        const vinMatch = src.match(/[A-HJ-NPR-Z0-9]{17}/);
        if (vinMatch && vinMatch[0] !== pageVin) {
          console.log('[Capitol Scraper] Excluding image with different VIN:', vinMatch[0]);
          return false;
        }
      }

      return true;
    });

    console.log('[Capitol Scraper] Filtered gallery images:', galleryImages.length);

    // Extract the URLs and convert to full-size
    // Check both src and srcset attributes, plus lazy-load attributes
    const galleryUrls = galleryImages
      .flatMap(img => {
        const urls = [];

        // Get src
        let src = img.getAttribute('src') || '';
        if (src) urls.push(src);

        // Get lazy-load attributes
        const dataSrc = img.getAttribute('data-src') || '';
        if (dataSrc) urls.push(dataSrc);

        const dataLazy = img.getAttribute('data-lazy') || '';
        if (dataLazy) urls.push(dataLazy);

        const dataOriginal = img.getAttribute('data-original') || '';
        if (dataOriginal) urls.push(dataOriginal);

        // Get srcset (which often has higher quality images)
        const srcset = img.getAttribute('srcset') || '';
        if (srcset) {
          // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
          const srcsetUrls = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
          urls.push(...srcsetUrls);
        }

        const dataSrcset = img.getAttribute('data-srcset') || '';
        if (dataSrcset) {
          const srcsetUrls = dataSrcset.split(',').map(s => s.trim().split(/\s+/)[0]);
          urls.push(...srcsetUrls);
        }

        return urls;
      })
      .map(url => {
        console.log('[Capitol Scraper] Original image URL:', url);
        // Remove size/thumbnail paths to get full-size
        let normalized = url.replace(/\/thumbnails\/[^/]+\//g, '/');
        normalized = normalized.replace(/\/\d{2,4}x\d{2,4}\//g, '/');
        console.log('[Capitol Scraper] Normalized image URL:', normalized);
        return normalized;
      })
      .filter(u => /^https?:\/\//i.test(u));

    console.log('[Capitol Scraper] Total gallery URLs before deduplication:', galleryUrls.length);

    // Remove duplicates
    let uniqueImages = Array.from(new Set(galleryUrls));
    console.log('[Capitol Scraper] Unique gallery images:', uniqueImages.length);
    console.log('[Capitol Scraper] Duplicates removed:', galleryUrls.length - uniqueImages.length);

    // If we still don't have enough, fallback to broader search
    if (uniqueImages.length < 15) {
      console.log('[Capitol Scraper] Not enough gallery images, using fallback search');

      const elements = $$('img[src], source[srcset]', document);
      const allUrls = elements
        .map(el => el.getAttribute('src') || el.getAttribute('srcset') || '')
        .flatMap(s => s.split(/\s*,\s*/))
        .map(s => s.replace(/\s+\d+w$/, '').trim())
        .filter(u => /^https?:\/\//i.test(u));

      const highQualityCarImages = allUrls.filter(u => {
        if (!/\.(jpg|jpeg|png|webp)/i.test(u)) return false;

        // More aggressive exclusions
        if (/sprite|icon|logo|favicon|avatar|profile|banner|badge|button|nav|menu|header|footer|validation|edmunds|cars-good|cars-fair|find-new-roads/i.test(u)) return false;

        // Use VIN filtering ONLY if the image has a different VIN (same logic as above)
        if (pageVin && /vehicle-images\.dealerinspire\.com/i.test(u)) {
          const vinMatch = u.match(/[A-HJ-NPR-Z0-9]{17}/);
          if (vinMatch && vinMatch[0] !== pageVin) {
            console.log('[Capitol Scraper] Fallback: Excluding image with different VIN:', vinMatch[0]);
            return false;
          }
        }

        const sizeMatch = u.match(/(\d{2,4})x(\d{2,4})/);
        if (sizeMatch) {
          const width = parseInt(sizeMatch[1]);
          const height = parseInt(sizeMatch[2]);
          if (width < 400 || height < 300) return false;
        }

        const isCapitolDomain = /capitolchevysj\.com|dealerinspire\.com|ddccdn\.com|ddc\.com|dealer\.com/i.test(u);
        if (isCapitolDomain) return true;

        return (
          u.includes('vehicle') ||
          u.includes('car') ||
          u.includes('auto') ||
          /photo|image|gallery|media/i.test(u) ||
          /large|big|full|original|high|detail/i.test(u)
        );
      });

      uniqueImages = Array.from(new Set([...uniqueImages, ...highQualityCarImages]));
      console.log('[Capitol Scraper] Combined unique images:', uniqueImages.length);
    }

    console.log('[Capitol Scraper] Final image count:', Math.min(uniqueImages.length, 20));
    return uniqueImages.slice(0, 20);
  }

  async function scan() {
    await ensureBasicsVisible();

    const head = parseHeaderTitle();
    const basic = fromBasicInfo();
    const price = parsePrice();
    const vin = getVIN();
    const description = getDescription();

    console.log('[Capitol Scraper] Raw colors before normalization:', {
      exteriorColorRaw: basic.exteriorColorRaw,
      interiorColorRaw: basic.interiorColorRaw
    });

    const normalizedExterior = U.normColor ? U.normColor(basic.exteriorColorRaw || '') : (basic.exteriorColorRaw || '');
    const normalizedInterior = U.normColor ? U.normColor(basic.interiorColorRaw || '') : (basic.interiorColorRaw || '');

    console.log('[Capitol Scraper] Normalized colors:', {
      exteriorColor: normalizedExterior,
      interiorColor: normalizedInterior
    });

    const v = {
      source: 'capitolchevysj.com',
      url: location.href,
      title: head.title || titleFromParts(head),

      year: head.year ?? null,
      make: head.make || '',
      model: head.model || '',
      trim: head.trim || '',

      price: price ?? null,
      mileage: basic.mileage ?? null,
      vin: vin || '',

      exteriorColor: normalizedExterior,
      interiorColor: normalizedInterior,
      drivetrain: basic.drivetrain || '',
      transmission: basic.transmission || '',
      engine: basic.engine || '',
      fuel: basic.fuelEfficiency || '',

      images: getImages(),
      imagesCount: getImages().length,
      description: description
    };

    console.log('[Capitol Scraper] Final vehicle data:', v);

    return v;
  }

  // boot
  ensureUI();
})();
