// content/sidebar.js - Persistent sidebar for vehicle management
(() => {
  let sidebar = null;
  let selectedVehicle = null;
  let vehicleHistory = [];

  // Detect current site
  function getCurrentSite() {
    if (/cars\.com/i.test(location.hostname)) return 'cars';
    if (/facebook\.com/i.test(location.hostname)) return 'facebook';
    return 'unknown';
  }

  // Create the persistent sidebar
  function createSidebar() {
    if (sidebar) return;

    const currentSite = getCurrentSite();

    sidebar = document.createElement('div');
    sidebar.id = 'vp-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h2>🚗 Vehicle Poster</h2>
        <button id="vp-sidebar-close" class="close-btn">✕</button>
      </div>

      <div class="sidebar-content">
        <!-- Current Vehicle Status -->
        <div class="status-section">
          <h3>Current Vehicle</h3>
          <div id="vp-current-status" class="current-status">No vehicle scanned yet</div>
          <div id="vp-current-meta" class="current-meta"></div>
          <div class="action-buttons">
            ${currentSite === 'cars' ? '<button id="vp-scan-current" class="btn primary">Scan This Page</button>' : ''}
            ${currentSite === 'facebook' ? '<button id="vp-autofill-fb" class="btn primary">Autofill Vehicle Form</button>' : ''}
            ${currentSite === 'cars' ? '<button id="vp-open-fb" class="btn secondary">Open Facebook</button>' : ''}
            ${currentSite === 'facebook' ? '<button id="vp-open-photos" class="btn secondary">Open Photos</button>' : ''}
          </div>
        </div>

        <!-- AI Section -->
        <div class="ai-section">
          <h3>🤖 AI Descriptions</h3>

          <!-- Connection Settings -->
          <div class="settings-group">
            <label class="setting-label">Ollama Server:</label>
            <div class="input-group">
              <input type="text" id="vp-ollama-url" placeholder="http://localhost:11434" />
              <button id="vp-test-ollama" class="btn secondary small">Test</button>
            </div>
          </div>

          <!-- Model Selection -->
          <div class="settings-group">
            <label class="setting-label">AI Model:</label>
            <div class="input-group">
              <select id="vp-model-select" disabled>
                <option value="">Test connection first...</option>
              </select>
              <button id="vp-refresh-models" class="btn secondary small" disabled>↻</button>
            </div>
          </div>

          <div class="settings-group">
            <button id="vp-pull-model" class="btn secondary small" disabled>Pull Model</button>
          </div>

          <!-- Model Pull Dialog -->
          <div id="vp-pull-dialog" class="pull-dialog" style="display: none;">
            <div class="input-group">
              <input type="text" id="vp-model-to-pull" placeholder="e.g., llama3.2:3b" />
              <button id="vp-start-pull" class="btn primary small">Pull</button>
              <button id="vp-cancel-pull" class="btn secondary small">Cancel</button>
            </div>
            <div id="vp-pull-progress" class="pull-progress"></div>
          </div>

          <!-- Generation Controls -->
          <div class="settings-group">
            <button id="vp-generate-ai" class="btn primary" disabled>Generate Description</button>
            <div id="vp-ai-status" class="ai-status"></div>
            <div id="vp-model-info" class="model-info"></div>
          </div>

          <!-- Instructions -->
          <div class="settings-group">
            <label class="setting-label">Instructions:</label>
            <textarea id="vp-ai-instructions" placeholder="Write a compelling Facebook Marketplace description..."></textarea>
          </div>
        </div>

        <!-- Vehicle History -->
        <div class="history-section">
          <h3>Scraped Vehicles</h3>
          <div id="vp-vehicle-list" class="vehicle-list">
            <div class="empty-state">
              No vehicles scraped yet.<br>
              Click "Scan This Page" on a Cars.com vehicle page.
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);
    initializeSidebar();
  }

  // Remove sidebar
  function removeSidebar() {
    if (sidebar) {
      sidebar.remove();
      sidebar = null;
    }
  }

  // Initialize sidebar functionality
  async function initializeSidebar() {
    // Load saved data
    const data = await chrome.storage.local.get(['vehiclePayload', 'vehiclePayloadTs', 'vehicleHistory', 'ollamaUrl', 'aiInstructions', 'selectedModel']);

    if (data.vehiclePayload) {
      updateCurrentVehicle(data.vehiclePayload, data.vehiclePayloadTs);
    }

    vehicleHistory = data.vehicleHistory || [];
    document.getElementById('vp-ollama-url').value = data.ollamaUrl || 'http://localhost:11434';
    document.getElementById('vp-ai-instructions').value = data.aiInstructions || 'Write a compelling Facebook Marketplace description emphasizing key features, condition, and value within reason of course do not over do it. Also make sure the listing includes me Edgardo Sandoval and my contact info (408) 445-7251 to schedules test drive or for any questions. Mention the dealership as well Capitol Chevrolet.';

    if (data.selectedModel) {
      const modelSelect = document.getElementById('vp-model-select');
      modelSelect.innerHTML = `<option value="${data.selectedModel}">${data.selectedModel}</option>`;
      modelSelect.value = data.selectedModel;
      updateModelInfo(data.selectedModel);
    }

    updateVehicleList();
    setupEventListeners();
  }

  // Update current vehicle display
  function updateCurrentVehicle(v, ts) {
    const status = document.getElementById('vp-current-status');
    const meta = document.getElementById('vp-current-meta');

    if (v) {
      status.textContent = `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.trim || ''}`.replace(/\s+/g, ' ').trim();
      meta.textContent = `Scanned: ${new Date(ts).toLocaleString()}`;
      selectedVehicle = v;
    } else {
      status.textContent = 'No vehicle scanned yet';
      meta.textContent = '';
    }
  }

  // Update vehicle list
  function updateVehicleList() {
    const vehicleList = document.getElementById('vp-vehicle-list');

    if (vehicleHistory.length === 0) {
      vehicleList.innerHTML = `
        <div class="empty-state">
          No vehicles scraped yet.<br>
          Click "Scan This Page" on a Cars.com vehicle page.
        </div>`;
      return;
    }

    vehicleList.innerHTML = vehicleHistory.map((vehicle, index) => `
      <div class="vehicle-item ${selectedVehicle && selectedVehicle.url === vehicle.url ? 'selected' : ''}" data-index="${index}">
        <img class="vehicle-thumbnail" src="${vehicle.images && vehicle.images[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0Y5RkFGQiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIi8+'}" alt="Vehicle" />
        <div class="vehicle-info">
          <div class="vehicle-title">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
          <div class="vehicle-price">$${vehicle.price?.toLocaleString() || 'N/A'}</div>
          <div class="vehicle-details">${vehicle.mileage?.toLocaleString() || 'N/A'} mi • ${vehicle.exteriorColor || 'N/A'}</div>
          ${vehicle.aiDescription ? '<div class="ai-indicator">🤖 AI Description</div>' : ''}
        </div>
        <div class="vehicle-actions">
          <button class="btn primary small use-btn" data-index="${index}">Use</button>
          <button class="btn secondary small download-btn" data-index="${index}">Photos</button>
          <button class="btn danger small post-fb-btn" data-index="${index}">Post FB</button>
        </div>
      </div>
    `).join('');

    // Add event listeners for vehicle items
    setupVehicleListeners();
  }

  // Setup vehicle list event listeners
  function setupVehicleListeners() {
    document.querySelectorAll('.use-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        selectedVehicle = vehicle;
        await chrome.storage.local.set({ vehiclePayload: vehicle, vehiclePayloadTs: Date.now() });
        updateCurrentVehicle(vehicle, Date.now());
        updateVehicleList();
      };
    });

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        await downloadVehiclePhotos(vehicle);
      };
    });

    document.querySelectorAll('.post-fb-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        await chrome.storage.local.set({ vehiclePayload: vehicle, vehiclePayloadTs: Date.now() });
        window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
      };
    });

    document.querySelectorAll('.vehicle-item').forEach(item => {
      item.onclick = () => {
        const index = parseInt(item.dataset.index);
        const vehicle = vehicleHistory[index];
        selectedVehicle = vehicle;
        updateVehicleList();
      };
    });
  }

  // Download vehicle photos
  async function downloadVehiclePhotos(vehicle) {
    if (!vehicle.images || vehicle.images.length === 0) {
      alert('No images found for this vehicle.');
      return;
    }

    const vehicleTitle = vehicle.title || `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
    const folderName = vehicleTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'downloadImages',
        images: vehicle.images,
        folderName: folderName
      });

      if (response.success) {
        alert(`Started downloading ${response.downloaded}/${response.total} photos to Downloads/${folderName}/`);
      } else {
        throw new Error(response.error || 'Download failed');
      }
    } catch (error) {
      console.error('Error downloading photos:', error);
      alert('Error downloading photos. Check console for details.');
    }
  }

  // AI Functions
  function updateModelInfo(modelName) {
    const modelInfo = document.getElementById('vp-model-info');
    const generateBtn = document.getElementById('vp-generate-ai');

    if (!modelName) {
      modelInfo.textContent = '';
      generateBtn.disabled = true;
      return;
    }

    let displayName = modelName;
    if (modelName.includes(':')) {
      const [base, variant] = modelName.split(':');
      displayName = `${base} (${variant.toUpperCase()})`;
    }

    modelInfo.textContent = `Using: ${displayName}`;
    generateBtn.disabled = false;
  }

  async function fetchAvailableModels() {
    const url = document.getElementById('vp-ollama-url').value.trim();
    if (!url) return [];

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ollamaRequest',
        url: `${url}/api/tags`,
        method: 'GET'
      });

      if (response.success) {
        return response.data.models || [];
      } else {
        console.error('Error fetching models:', response.error);
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
    return [];
  }

  async function populateModelSelect() {
    const models = await fetchAvailableModels();
    const modelSelect = document.getElementById('vp-model-select');
    const currentValue = modelSelect.value;

    modelSelect.innerHTML = '';

    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      modelSelect.disabled = true;
      document.getElementById('vp-refresh-models').disabled = true;
      document.getElementById('vp-generate-ai').disabled = true;
      document.getElementById('vp-model-info').textContent = '';
      return;
    }

    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name} (${(model.size / 1e9).toFixed(1)}GB)`;
      modelSelect.appendChild(option);
    });

    modelSelect.disabled = false;
    document.getElementById('vp-refresh-models').disabled = false;
    document.getElementById('vp-pull-model').disabled = false;

    if (currentValue && models.find(m => m.name === currentValue)) {
      modelSelect.value = currentValue;
    } else if (models.length > 0) {
      modelSelect.value = models[0].name;
    }

    updateModelInfo(modelSelect.value);
    if (modelSelect.value) {
      chrome.storage.local.set({ selectedModel: modelSelect.value });
    }
  }

  async function testOllamaConnection() {
    const url = document.getElementById('vp-ollama-url').value.trim();
    const aiStatus = document.getElementById('vp-ai-status');

    if (!url) {
      aiStatus.textContent = 'Please enter Ollama URL';
      return;
    }

    aiStatus.textContent = 'Testing connection...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ollamaRequest',
        url: `${url}/api/tags`,
        method: 'GET'
      });

      if (response.success) {
        const data = response.data;
        aiStatus.textContent = `✅ Connected! Found ${data.models?.length || 0} models`;
        chrome.storage.local.set({ ollamaUrl: url });
        await populateModelSelect();
      } else {
        aiStatus.textContent = `❌ Connection failed: ${response.error}`;
        console.error('Ollama connection error:', response.error, response.details);
      }
    } catch (error) {
      aiStatus.textContent = `❌ Connection failed: ${error.message}`;
      console.error('Ollama connection error:', error);
    }
  }

  async function generateAIDescription() {
    if (!selectedVehicle) {
      alert('Please select a vehicle first');
      return;
    }

    const url = document.getElementById('vp-ollama-url').value.trim();
    const instructions = document.getElementById('vp-ai-instructions').value.trim();
    const selectedModelName = document.getElementById('vp-model-select').value;
    const aiStatus = document.getElementById('vp-ai-status');

    if (!url) {
      alert('Please enter Ollama URL and test connection first');
      return;
    }

    if (!selectedModelName) {
      alert('Please select a model first');
      return;
    }

    aiStatus.textContent = 'Generating description...';

    const vehicleData = `
Vehicle: ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.trim || ''}
Price: $${selectedVehicle.price?.toLocaleString() || 'N/A'}
Mileage: ${selectedVehicle.mileage?.toLocaleString() || 'N/A'} miles
Exterior Color: ${selectedVehicle.exteriorColor || 'N/A'}
Interior Color: ${selectedVehicle.interiorColor || 'N/A'}
Drivetrain: ${selectedVehicle.drivetrain || 'N/A'}
Transmission: ${selectedVehicle.transmission || 'N/A'}
Engine: ${selectedVehicle.engine || 'N/A'}
VIN: ${selectedVehicle.vin || 'N/A'}
    `.trim();

    const prompt = `${instructions}

Here's the vehicle information:
${vehicleData}

Write a Facebook Marketplace vehicle description that is engaging, informative, and likely to attract buyers. Keep it concise but compelling.`;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ollamaRequest',
        url: `${url}/api/generate`,
        method: 'POST',
        body: {
          model: selectedModelName,
          prompt: prompt,
          stream: false
        }
      });

      if (response.success) {
        const data = response.data;
        const description = data.response;

        selectedVehicle.aiDescription = description;
        selectedVehicle.aiModel = selectedModelName;

        const vehicleIndex = vehicleHistory.findIndex(v => v.url === selectedVehicle.url);
        if (vehicleIndex >= 0) {
          vehicleHistory[vehicleIndex].aiDescription = description;
          vehicleHistory[vehicleIndex].aiModel = selectedModelName;
          chrome.storage.local.set({ vehicleHistory });
        }

        chrome.storage.local.set({ vehiclePayload: selectedVehicle });

        aiStatus.textContent = `✅ AI description generated using ${selectedModelName}!`;
        updateVehicleList(); // Refresh to show AI indicator

        // Show description in a better format
        const descriptionDialog = document.createElement('div');
        descriptionDialog.className = 'description-dialog';
        descriptionDialog.innerHTML = `
          <div class="description-content">
            <h3>AI Generated Description (${selectedModelName})</h3>
            <div class="description-text">${description.replace(/\n/g, '<br>')}</div>
            <button onclick="this.parentElement.parentElement.remove()" class="btn primary">Close</button>
          </div>
        `;
        document.body.appendChild(descriptionDialog);

        setTimeout(() => descriptionDialog.remove(), 15000); // Auto remove after 15s
      } else {
        aiStatus.textContent = `❌ Failed to generate description: ${response.error}`;
        console.error('AI generation error:', response.error, response.details);
      }
    } catch (error) {
      console.error('Error generating AI description:', error);
      aiStatus.textContent = `❌ Error generating description: ${error.message}`;
    }
  }

  // Setup all event listeners
  function setupEventListeners() {
    const currentSite = getCurrentSite();

    // Sidebar close
    document.getElementById('vp-sidebar-close').onclick = () => {
      removeSidebar();
    };

    // Site-specific actions
    if (currentSite === 'cars') {
      // Cars.com specific actions
      const scanBtn = document.getElementById('vp-scan-current');
      if (scanBtn) {
        scanBtn.onclick = async () => {
          // Just trigger the same click as the bottom scan button
          const bottomScanButton = document.getElementById('vp-scan');
          if (bottomScanButton) {
            bottomScanButton.click();
          } else {
            alert('Bottom scan button not found. Make sure you are on a Cars.com vehicle details page.');
          }
        };
      }

      const openFbBtn = document.getElementById('vp-open-fb');
      if (openFbBtn) {
        openFbBtn.onclick = () => {
          window.open('https://www.facebook.com/marketplace/create/vehicle', '_blank');
        };
      }
    } else if (currentSite === 'facebook') {
      // Facebook specific actions
      const autofillBtn = document.getElementById('vp-autofill-fb');
      if (autofillBtn) {
        autofillBtn.onclick = async () => {
          // Just trigger the same click as the bottom autofill button
          const bottomAutofillButton = document.getElementById('vp-auto');
          if (bottomAutofillButton) {
            bottomAutofillButton.click();
          } else {
            alert('Bottom autofill button not found. Make sure you are on a Facebook vehicle creation page.');
          }
        };
      }

      const openPhotosBtn = document.getElementById('vp-open-photos');
      if (openPhotosBtn) {
        openPhotosBtn.onclick = () => {
          // Find and click the add photos button
          const addPhotosButton = findLabeled(/Add photos|Photos|Upload photos/i);
          if (addPhotosButton) {
            addPhotosButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(() => addPhotosButton.click(), 300);
          } else {
            alert('Could not find the "Add Photos" button. Please click it manually.');
          }
        };
      }
    }

    // AI controls
    document.getElementById('vp-test-ollama').onclick = testOllamaConnection;
    document.getElementById('vp-generate-ai').onclick = generateAIDescription;
    document.getElementById('vp-refresh-models').onclick = populateModelSelect;

    // Model selection
    document.getElementById('vp-model-select').onchange = () => {
      const selectedModel = document.getElementById('vp-model-select').value;
      updateModelInfo(selectedModel);
      if (selectedModel) {
        chrome.storage.local.set({ selectedModel });
      }
    };

    // Pull model dialog
    document.getElementById('vp-pull-model').onclick = () => {
      const dialog = document.getElementById('vp-pull-dialog');
      dialog.style.display = dialog.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('vp-start-pull').onclick = async () => {
      const modelName = document.getElementById('vp-model-to-pull').value.trim();
      if (!modelName) {
        alert('Please enter a model name');
        return;
      }

      const url = document.getElementById('vp-ollama-url').value.trim();
      if (!url) {
        alert('Please set Ollama URL first');
        return;
      }

      const pullProgress = document.getElementById('vp-pull-progress');
      const startPull = document.getElementById('vp-start-pull');

      startPull.disabled = true;
      pullProgress.textContent = `Pulling ${modelName}...`;

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'ollamaRequest',
          url: `${url}/api/pull`,
          method: 'POST',
          body: { name: modelName, stream: false }
        });

        if (response.success) {
          pullProgress.textContent = `✅ Successfully pulled ${modelName}`;
          await populateModelSelect();
          document.getElementById('vp-model-select').value = modelName;
          updateModelInfo(modelName);
          chrome.storage.local.set({ selectedModel: modelName });

          setTimeout(() => {
            document.getElementById('vp-pull-dialog').style.display = 'none';
            document.getElementById('vp-model-to-pull').value = '';
            pullProgress.textContent = '';
          }, 2000);
        } else {
          pullProgress.textContent = `❌ Failed to pull model: ${response.error}`;
        }
      } catch (error) {
        pullProgress.textContent = `❌ Error pulling model: ${error.message}`;
      } finally {
        startPull.disabled = false;
      }
    };

    document.getElementById('vp-cancel-pull').onclick = () => {
      document.getElementById('vp-pull-dialog').style.display = 'none';
      document.getElementById('vp-model-to-pull').value = '';
      document.getElementById('vp-pull-progress').textContent = '';
    };

    // Save settings
    document.getElementById('vp-ai-instructions').onchange = () => {
      chrome.storage.local.set({ aiInstructions: document.getElementById('vp-ai-instructions').value });
    };
  }

  // Scan current page - complete implementation with all helper functions
  async function scanCurrentPage() {
    try {
      // Use main scan function from cars.js if available
      if (typeof window.scan === 'function') {
        return await window.scan();
      }

      // Otherwise, use complete local implementation
      // Ensure basics are visible
      for (let i = 0; i < 6; i++) {
        window.scrollBy(0, Math.round(window.innerHeight * 0.7));
        await sleep(200);
        if (document.querySelectorAll('h2,h3').some(h => /basics/i.test(h.textContent || ''))) break;
      }

      const basic = scanFromBasics();
      const head = scanParseHeaderTitle();
      const price = scanParsePrice();

      const vehicle = {
        source: 'cars.com',
        url: location.href,
        title: head.title || scanTitleFromParts(head),
        year: head.year ?? null,
        make: head.make || '',
        model: head.model || '',
        trim: head.trim || '',
        price: price ?? null,
        mileage: basic.mileage ?? null,
        vin: basic.vin || '',
        exteriorColor: basic.exteriorColorRaw || '',
        interiorColor: basic.interiorColorRaw || '',
        drivetrain: basic.drivetrain || '',
        transmission: basic.transmission || '',
        fuel: basic.fuel || '',
        engine: basic.engine || '',
        images: scanGetImages(),
        imagesCount: scanGetImages().length,
        description: clean(document.querySelector('meta[name="description"]')?.content || '')
      };

      return vehicle;
    } catch (error) {
      console.error('Error scanning page:', error);
      alert('Error scanning page. Make sure you are on a Cars.com vehicle details page.');
      return null;
    }
  }

  // Helper functions for scanning (copied from cars.js)
  function scanFromBasics() {
    const heads = document.querySelectorAll('h2,h3');
    const basicsHead = Array.from(heads).find(h => /basics/i.test(h.textContent || ''));
    if (!basicsHead) return {};

    const block = basicsHead.closest('section,div') || basicsHead.parentElement;
    const leaves = Array.from(block.querySelectorAll('*')).filter(n => !n.children.length);

    const get = (re) => {
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const t = clean(leaf.textContent);
        if (re.test(t)) {
          if (i + 1 < leaves.length) {
            const nextLeaf = leaves[i + 1];
            const v = clean(nextLeaf.textContent || '');
            if (v && v !== t) return v;
          }
        }
      }
      return '';
    };

    return {
      exteriorColorRaw: get(/^\s*Exterior color/i),
      interiorColorRaw: get(/^\s*Interior color/i),
      drivetrain: get(/^\s*Drivetrain/i) || '',
      fuel: get(/^\s*Fuel type/i) || '',
      transmission: get(/^\s*Transmission/i) || '',
      engine: get(/^\s*Engine/i) || '',
      vin: get(/^\s*VIN/i) || '',
      mileage: asNumber(get(/^\s*Mileage/i))
    };
  }

  function scanParseHeaderTitle() {
    const h1 = document.querySelector('h1');
    const txt = clean(h1?.textContent || '');

    const multiWordBrands = [
      'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Rolls-Royce',
      'Mercedes-Benz', 'Lucid'
    ];

    let year = null, make = '', model = '', trim = '';

    const yearMatch = txt.match(/(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      const withoutYear = txt.replace(/^\d{4}\s*/, '').trim();

      let foundMultiWordBrand = false;
      for (const brand of multiWordBrands) {
        if (withoutYear.toLowerCase().startsWith(brand.toLowerCase())) {
          make = brand;
          const afterBrand = withoutYear.substring(brand.length).trim();
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

    return { year, make, model, trim, title: txt };
  }

  function scanParsePrice() {
    const money = /\$?\d{1,3}(?:,\d{3})+|\$\d{4,6}/;
    const nodes = document.querySelectorAll('h1,h2,h3,[data-test*="price"],[class*="price"],div,span');

    for (const n of Array.from(nodes).slice(0, 500)) {
      if (n.offsetParent === null) continue;
      const t = clean(n.textContent);
      const m = t.match(money);
      if (m) return asNumber(m[0]);
    }
    return null;
  }

  function scanGetImages() {
    const elements = document.querySelectorAll('img[src], source[srcset]');

    const allUrls = Array.from(elements)
      .map(el => el.getAttribute('src') || el.getAttribute('srcset') || '')
      .flatMap(s => s.split(/\s*,\s*/))
      .map(s => s.replace(/\s+\d+w$/, ''));

    const validUrls = allUrls.filter(u => /^https?:\/\//i.test(u));

    const highQualityCarImages = validUrls.filter(u => {
      if (!/\.(jpg|jpeg|png|webp)/i.test(u)) return false;
      if (/sprite|icon|logo|favicon|avatar|profile|thumbnail|thumb|small|mini/i.test(u)) return false;

      const sizeMatch = u.match(/(\d{2,4})x(\d{2,4})/);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1]);
        const height = parseInt(sizeMatch[2]);
        if (width < 400 || height < 300) return false;
      }

      return (
        u.includes('vehicle') ||
        u.includes('car') ||
        u.includes('auto') ||
        /photo|image|gallery/.test(u) ||
        /large|big|full|original|high|detail/i.test(u) ||
        /\d{3,4}x\d{3,4}/.test(u)
      );
    });

    return Array.from(new Set(highQualityCarImages)).slice(0, 20);
  }

  function scanTitleFromParts({ year, make, model, trim }) {
    return [year, make, model, trim].filter(Boolean).join(' ');
  }

  // Facebook autofill functionality - using the complete implementation from facebook.js
  async function runFacebookAutofill() {
    try {
      const { vehiclePayload: v } = await chrome.storage.local.get(['vehiclePayload']);
      if (!v) {
        alert('No saved vehicle data. Please scan a vehicle from Cars.com first.');
        return;
      }

      // Normalize values using the same logic as facebook.js
      const bodyStyle = 'Saloon';
      const extColor = v.exteriorColor || '';
      const intColor = v.interiorColor || '';
      const fuel = 'Gasoline';
      const trans = 'Automatic transmission';
      const title = clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '));

      // 0. preparation
      window.scrollTo({ top: 0, behavior: 'instant' });

      // 1. Vehicle type (required first to unlock all the combos)
      console.log('Setting vehicle type...');
      await setComboByLabel(/^vehicle type$/i, 'Car/van');
      await sleep(500);

      // 2. Wait for year/make controls to materialize (unlocked by vehicle type)
      await waitFor(() => findLabeled(/^year$/i));
      await waitFor(() => findLabeled(/^make$/i));

      // 3. Year
      console.log('Setting year...');
      if (v.year) {
        await setComboByLabel(/^year$/i, v.year);
        await sleep(500);
      }

      // 4. Make
      console.log('Setting make...');
      if (v.make) {
        await setComboByLabel(/^make$/i, v.make);
        await sleep(500);
      }

      // 5. Model
      console.log('Setting model...');
      if (v.model) {
        await setTextByLabel(/^model$/i, v.model);
        await sleep(400);
      }

      // 6. Body style
      console.log('Setting body style...');
      await setComboByLabel(/body style|bodytype/i, bodyStyle);
      await sleep(400);

      // 7. Condition
      console.log('Setting condition...');
      await setComboByLabel(/vehicle condition|condition/i, 'Good');
      await sleep(400);

      // 8. Mileage
      console.log('Setting mileage...');
      if (v.mileage) {
        await setTextByLabel(/^mileage|odometer$/i, v.mileage);
        await sleep(400);
      }

      // 9. Color exterior
      console.log('Setting exterior color...');
      if (extColor) {
        await setComboByLabel(/exterior colou?r/i, extColor);
        await sleep(400);
      }

      // 10. Color interior
      console.log('Setting interior color...');
      if (intColor) {
        await setComboByLabel(/interior colou?r/i, intColor);
        await sleep(400);
      }

      // 11. Fuel
      console.log('Setting fuel type...');
      await setComboByLabel(/fuel type|fuel/i, fuel);
      await sleep(400);

      // 12. Transmission
      console.log('Setting transmission...');
      await setComboByLabel(/transmission/i, trans);
      await sleep(400);

      // 13. Clean title
      console.log('Setting clean title...');
      await setCheckboxByLabel(/clean title/i, true);
      await sleep(400);

      // 14. Price
      console.log('Setting price...');
      if (v.price) {
        await setTextByLabel(/^price$/i, v.price);
        await sleep(400);
      }

      // 15. Title/name
      console.log('Setting title...');
      await setTextByLabel(/^title$/i, title);
      await sleep(400);

      // 16. Description (use AI description if available, otherwise generate one)
      console.log('Setting description...');
      let description = '';
      if (v.aiDescription) {
        description = clean(v.aiDescription);
      } else {
        const descParts = [
          title,
          clean(v.drivetrain || ''),
          clean(v.transmission || ''),
          clean(v.engine || ''),
          v.vin ? `VIN ${clean(v.vin)}` : ''
        ].filter(Boolean);
        description = (descParts.join('. ') + '.').replace(/\.\./g, '.');
      }

      if (description) {
        await setTextByLabel(/^description|about/i, description);
        await sleep(400);
      }

      alert('Autofill complete ✔️ Review and add photos.');
    } catch (e) {
      console.warn('Autofill error', e);
      alert('Autofill hit an error. See console for details.');
    }
  }

  // Facebook helper functions
  const formScope = () => {
    const within = document.querySelector('[role="main"]') || document.body;
    const anchor = Array.from(within.querySelectorAll('div,section'))
      .find(el => /about this vehicle/i.test(el.textContent || ''));
    return anchor || within;
  };

  async function waitFor(fn, {timeout=12000, interval=150} = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  function findLabeled(re, within=formScope()) {
    const rx = re instanceof RegExp ? re : new RegExp(re, 'i');

    // Direct aria-label
    const labeled = Array.from(within.querySelectorAll('*[aria-label]')).find(el => rx.test(el.getAttribute('aria-label') || ''));
    if (labeled) return labeled;

    // Text leaf near a control
    const leaves = Array.from(within.querySelectorAll('*')).filter(n => !n.children.length);
    for (const leaf of leaves) {
      const txt = clean(leaf.textContent || '');
      if (!rx.test(txt)) continue;

      // Up to a nearby control
      let cur = leaf;
      for (let i = 0; i < 5 && cur; i++) {
        const ctrl = cur.querySelector('input, textarea, [role="textbox"], [role="combobox"], div[role="button"]');
        if (ctrl) return ctrl;
        cur = cur.parentElement;
      }

      // Next sibling
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
                   host.closest('[role="combobox"]') ||
                   host.querySelector('[role="combobox"]') ||
                   host.querySelector('div[role="button"]') ||
                   host;

    opener.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(100);

    opener.click();
    await sleep(300);

    const menu = await waitFor(() => {
      const listbox = document.querySelector('[role="listbox"]');
      if (listbox && !listbox.closest('[data-testid*="notification"]')) {
        return listbox;
      }
      return null;
    }, {timeout: 3000});

    if (!menu) return false;

    const want = clean(String(value)).toLowerCase();
    const options = Array.from(menu.querySelectorAll('[role="option"], span, div'))
      .filter(el => clean(el.textContent || '').length > 0);

    // Try exact match first
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

    // Try partial match
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

    return false;
  }

  // Inference functions
  const inferBodyStyle = (v) => 'Saloon';
  const inferFuel = (v) => 'Gasoline';
  const inferTransmission = (v) => 'Automatic transmission';
  const conditionLabel = (miles) => 'Good';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Helper functions (copied from cars.js)
  function fromBasics() {
    const heads = document.querySelectorAll('h2,h3');
    const basicsHead = Array.from(heads).find(h => /basics/i.test(h.textContent || ''));
    if (!basicsHead) return {};

    const block = basicsHead.closest('section,div') || basicsHead.parentElement;
    const leaves = Array.from(block.querySelectorAll('*')).filter(n => !n.children.length);

    const get = (re) => {
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const t = clean(leaf.textContent);
        if (re.test(t)) {
          if (i + 1 < leaves.length) {
            const nextLeaf = leaves[i + 1];
            const v = clean(nextLeaf.textContent || '');
            if (v && v !== t) return v;
          }
        }
      }
      return '';
    };

    return {
      exteriorColorRaw: get(/^\s*Exterior color/i),
      interiorColorRaw: get(/^\s*Interior color/i),
      drivetrain: get(/^\s*Drivetrain/i) || '',
      fuel: get(/^\s*Fuel type/i) || '',
      transmission: get(/^\s*Transmission/i) || '',
      engine: get(/^\s*Engine/i) || '',
      vin: get(/^\s*VIN/i) || '',
      mileage: asNumber(get(/^\s*Mileage/i))
    };
  }

  function parseHeaderTitle() {
    const h1 = document.querySelector('h1');
    const txt = clean(h1?.textContent || '');

    const multiWordBrands = [
      'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Rolls-Royce',
      'Mercedes-Benz', 'Lucid'
    ];

    let year = null, make = '', model = '', trim = '';

    const yearMatch = txt.match(/(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      const withoutYear = txt.replace(/^\d{4}\s*/, '').trim();

      let foundMultiWordBrand = false;
      for (const brand of multiWordBrands) {
        if (withoutYear.toLowerCase().startsWith(brand.toLowerCase())) {
          make = brand;
          const afterBrand = withoutYear.substring(brand.length).trim();
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

    return { year, make, model, trim, title: txt };
  }

  function parsePrice() {
    const money = /\$?\d{1,3}(?:,\d{3})+|\$\d{4,6}/;
    const nodes = document.querySelectorAll('h1,h2,h3,[data-test*="price"],[class*="price"],div,span');

    for (const n of Array.from(nodes).slice(0, 500)) {
      if (n.offsetParent === null) continue;
      const t = clean(n.textContent);
      const m = t.match(money);
      if (m) return asNumber(m[0]);
    }
    return null;
  }

  function getImages() {
    const elements = document.querySelectorAll('img[src], source[srcset]');

    const allUrls = Array.from(elements)
      .map(el => el.getAttribute('src') || el.getAttribute('srcset') || '')
      .flatMap(s => s.split(/\s*,\s*/))
      .map(s => s.replace(/\s+\d+w$/, ''));

    const validUrls = allUrls.filter(u => /^https?:\/\//i.test(u));

    const highQualityCarImages = validUrls.filter(u => {
      if (!/\.(jpg|jpeg|png|webp)/i.test(u)) return false;
      if (/sprite|icon|logo|favicon|avatar|profile|thumbnail|thumb|small|mini/i.test(u)) return false;

      const sizeMatch = u.match(/(\d{2,4})x(\d{2,4})/);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1]);
        const height = parseInt(sizeMatch[2]);
        if (width < 400 || height < 300) return false;
      }

      return (
        u.includes('vehicle') ||
        u.includes('car') ||
        u.includes('auto') ||
        /photo|image|gallery/.test(u) ||
        /large|big|full|original|high|detail/i.test(u) ||
        /\d{3,4}x\d{3,4}/.test(u)
      );
    });

    return Array.from(new Set(highQualityCarImages)).slice(0, 20);
  }

  // Utility functions
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const asNumber = s => {
    const n = String(s).replace(/[^\d.]/g, '');
    return n ? parseFloat(n) : null;
  };
  const normColor = s => s; // Simplified for now

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.vehicleHistory) {
        vehicleHistory = changes.vehicleHistory.newValue || [];
        updateVehicleList();
      }
      if (changes.vehiclePayload) {
        updateCurrentVehicle(changes.vehiclePayload.newValue, changes.vehiclePayloadTs?.newValue || Date.now());
        updateVehicleList();
      }
    }
  });

  // Toggle sidebar visibility
  function toggleSidebar() {
    if (sidebar) {
      removeSidebar();
    } else {
      createSidebar();
    }
  }

  // Create toggle button
  function createToggleButton() {
    if (document.getElementById('vp-sidebar-toggle')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'vp-sidebar-toggle';
    toggleBtn.innerHTML = '🚗';
    toggleBtn.title = 'Toggle Vehicle Poster Sidebar';
    toggleBtn.onclick = toggleSidebar;
    document.body.appendChild(toggleBtn);
  }

  // Initialize based on current site
  const currentSite = getCurrentSite();

  if (currentSite === 'cars' || currentSite === 'facebook') {
    createToggleButton();

    // Auto-open sidebar
    if (currentSite === 'cars') {
      // Always open on Cars.com
      createSidebar();
    } else if (currentSite === 'facebook' && /marketplace\/create\/vehicle/i.test(location.pathname)) {
      // Only open on Facebook vehicle creation page
      createSidebar();
    }
  }
})();