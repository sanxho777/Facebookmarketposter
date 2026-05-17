// content/sidebar.js - Persistent sidebar for vehicle management
(() => {
  let sidebar = null;
  let selectedVehicle = null;
  let vehicleHistory = [];

  // Detect current site
  function getCurrentSite() {
    if (/cars\.com/i.test(location.hostname)) return 'cars';
    if (/capitolchevysj\.com/i.test(location.hostname)) return 'capitol';
    if (/houseofthunderhd\.com/i.test(location.hostname)) return 'houseofthunder';
    if (/themotorcafe\.com/i.test(location.hostname)) return 'themotorcafe';
    if (/facebook\.com/i.test(location.hostname)) return 'facebook';
    return 'unknown';
  }

  // Create the persistent sidebar
  function createSidebar() {
    if (sidebar) return;

    const currentSite = getCurrentSite();

    sidebar = document.createElement('div');
    sidebar.id = 'vp-sidebar';
    const isMoto = getCurrentSite() === 'houseofthunder' || getCurrentSite() === 'themotorcafe';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h2>${isMoto ? '🏍️ Moto Poster' : '🚗 Vehicle Poster'}</h2>
        <button id="vp-sidebar-close" class="close-btn">✕</button>
      </div>

      <div class="sidebar-content">
        <!-- Current Vehicle Status -->
        <div class="status-section">
          <h3>Current Vehicle</h3>
          <div id="vp-current-status" class="current-status">No vehicle scanned yet</div>
          <div id="vp-current-meta" class="current-meta"></div>
          <div class="action-buttons">
            ${currentSite === 'cars' || currentSite === 'capitol' || currentSite === 'houseofthunder' || currentSite === 'themotorcafe' ? '<button id="vp-scan-current" class="btn primary">Scan This Page</button>' : ''}
            ${currentSite === 'facebook' ? '<button id="vp-autofill-fb" class="btn primary">Autofill Vehicle Form</button>' : ''}
            ${currentSite === 'cars' || currentSite === 'capitol' ? '<button id="vp-open-fb" class="btn secondary">Open Facebook</button>' : ''}
            ${currentSite === 'houseofthunder' || currentSite === 'themotorcafe' ? '<button id="vp-open-fb" class="btn secondary">Open Facebook (Moto)</button>' : ''}
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
              Click "Scan This Page" on a vehicle page.
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
      // Remember it was closed
      sessionStorage.setItem('vp-sidebar-closed', '1');
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
    document.getElementById('vp-ai-instructions').value = data.aiInstructions || 'Write a compelling Facebook Marketplace description emphasizing key features, condition, and value.';

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
          Click "Scan This Page" on a vehicle page.
        </div>`;
      return;
    }

    vehicleList.innerHTML = vehicleHistory.map((vehicle, index) => `
      <div class="vehicle-item ${selectedVehicle && selectedVehicle.url === vehicle.url ? 'selected' : ''}" data-index="${index}">
        <button class="vehicle-delete-btn" data-index="${index}" title="Remove vehicle">✕</button>
        <img class="vehicle-thumbnail" src="${vehicle.images && vehicle.images[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGOUZBRkIiLz48L3N2Zz4='}" />
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
    document.querySelectorAll('.vehicle-delete-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];

        if (confirm(`Remove ${vehicle.year} ${vehicle.make} ${vehicle.model} from history?`)) {
          vehicleHistory.splice(index, 1);
          await chrome.storage.local.set({ vehicleHistory });

          // If this was the selected vehicle, clear it
          if (selectedVehicle && selectedVehicle.url === vehicle.url) {
            selectedVehicle = null;
            await chrome.storage.local.set({ vehiclePayload: null });
            updateCurrentVehicle(null, null);
          }

          updateVehicleList();
        }
      };
    });

    document.querySelectorAll('.use-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
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
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        console.log('Download photos clicked for vehicle:', vehicle);
        await downloadVehiclePhotos(vehicle);
      };
    });

    document.querySelectorAll('.post-fb-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        console.log('Post to FB clicked for vehicle:', vehicle);
        await chrome.storage.local.set({ vehiclePayload: vehicle, vehiclePayloadTs: Date.now() });
        const fbUrl = vehicle.vehicleCategory === 'motorcycle'
          ? 'https://www.facebook.com/marketplace/create/motorcycle'
          : 'https://www.facebook.com/marketplace/create/vehicle';
        window.open(fbUrl, '_blank');
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
    if (currentSite === 'cars' || currentSite === 'capitol' || currentSite === 'houseofthunder' || currentSite === 'themotorcafe') {
      const scanBtn = document.getElementById('vp-scan-current');
      if (scanBtn) {
        scanBtn.onclick = async () => {
          // Try pill's scan button first
          const pillScan = document.getElementById('vp-scan');
          if (pillScan) { pillScan.click(); return; }

          // For houseofthunder and themotorcafe, use the exposed scan function directly
          if (currentSite === 'houseofthunder' || currentSite === 'themotorcafe') {
            scanBtn.textContent = 'Scanning…';
            scanBtn.disabled = true;
            try {
              let attempts = 0;
              while (!window.__hotShowModal && attempts < 30) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
              }
              if (window.__hotShowModal) {
                await window.__hotShowModal();
              } else {
                alert('Scanner not ready. Please refresh the page and try again.');
              }
            } finally {
              scanBtn.textContent = 'Scan This Page';
              scanBtn.disabled = false;
            }
            return;
          }

          alert('Scan button not found. Make sure you are on a vehicle details page.');
        };
      }

      const openFbBtn = document.getElementById('vp-open-fb');
      if (openFbBtn) {
        openFbBtn.onclick = () => {
          const fbUrl = currentSite === 'houseofthunder' || currentSite === 'themotorcafe'
            ? 'https://www.facebook.com/marketplace/create/motorcycle'
            : 'https://www.facebook.com/marketplace/create/vehicle';
          window.open(fbUrl, '_blank');
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
      sessionStorage.removeItem('vp-sidebar-closed');
      createSidebar();
    }
  }

  // Create toggle button
  function createToggleButton() {
    if (document.getElementById('vp-sidebar-toggle')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'vp-sidebar-toggle';
    toggleBtn.innerHTML = (getCurrentSite() === 'houseofthunder' || getCurrentSite() === 'themotorcafe') ? '🏍️' : '🚗';
    toggleBtn.title = 'Toggle Vehicle Poster Sidebar';
    toggleBtn.onclick = toggleSidebar;
    document.body.appendChild(toggleBtn);
  }

  // Initialize based on current site
  const currentSite = getCurrentSite();

  if (currentSite === 'cars' || currentSite === 'capitol' || currentSite === 'houseofthunder' || currentSite === 'themotorcafe' || currentSite === 'facebook') {
    createToggleButton();

    // For moto detail pages, also inject the scan pill
    // (themotorcafe.js builds this too, but sidebar.js is guaranteed to run)
    if ((currentSite === 'houseofthunder' || currentSite === 'themotorcafe') && !document.getElementById('vp-pill')) {
      const isListPage = /\/(Motorcycles|search\/inventory)(\/.*)?(\?.*)?$/i.test(location.pathname);
      if (!isListPage) {
        const pill = document.createElement('div');
        pill.id = 'vp-pill';
        pill.innerHTML = `
          <span class="label">Moto Poster</span>
          <span class="btn secondary" id="vp-scan">Scan</span>
          <span class="btn" id="vp-open-fb">Open Facebook</span>`;
        document.body.appendChild(pill);
        console.log('[sidebar] Moto pill injected');

        document.getElementById('vp-open-fb').addEventListener('click', () => {
          window.open('https://www.facebook.com/marketplace/create/motorcycle', '_blank');
        });

        document.getElementById('vp-scan').addEventListener('click', async () => {
          // Wait up to 3s for moto scan to be available
          let attempts = 0;
          while (!window.__hotShowModal && attempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (window.__hotShowModal) {
            window.__hotShowModal();
          } else {
            alert('Scanner not ready. Please refresh the page and try again.');
          }
        });
      }
    }

    const userClosed = sessionStorage.getItem('vp-sidebar-closed') === '1';

    // Auto-open sidebar
    if ((currentSite === 'cars' || currentSite === 'capitol' || currentSite === 'houseofthunder' || currentSite === 'themotorcafe') && !userClosed) {
      createSidebar();
    } else if (currentSite === 'facebook' && /marketplace\/create\/(vehicle|motorcycle)/i.test(location.pathname) && !userClosed) {
      createSidebar();
    }
  };
})();
