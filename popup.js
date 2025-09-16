(async () => {
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');
  const aiStatus = document.getElementById('aiStatus');
  const ollamaUrl = document.getElementById('ollamaUrl');
  const aiInstructions = document.getElementById('aiInstructions');
  const vehicleList = document.getElementById('vehicleList');
  const modelSelect = document.getElementById('modelSelect');
  const modelInfo = document.getElementById('modelInfo');
  const pullModelDialog = document.getElementById('pullModelDialog');
  const modelToPull = document.getElementById('modelToPull');

  let selectedVehicle = null;
  let vehicleHistory = [];

  // Load saved data
  const data = await chrome.storage.local.get(['vehiclePayload', 'vehiclePayloadTs', 'vehicleHistory', 'ollamaUrl', 'aiInstructions', 'selectedModel']);

  if (data.vehiclePayload) {
    updateCurrentVehicle(data.vehiclePayload, data.vehiclePayloadTs);
  }

  vehicleHistory = data.vehicleHistory || [];
  ollamaUrl.value = data.ollamaUrl || 'http://localhost:11434';
  aiInstructions.value = data.aiInstructions || 'Write a compelling Facebook Marketplace description emphasizing key features, condition, and value.';

  // Set selected model if available
  if (data.selectedModel) {
    modelSelect.innerHTML = `<option value="${data.selectedModel}">${data.selectedModel}</option>`;
    modelSelect.value = data.selectedModel;
    updateModelInfo(data.selectedModel);
  }

  // Update vehicle list display
  updateVehicleList();

  function updateCurrentVehicle(v, ts) {
    if (v) {
      status.textContent = `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.trim || ''}`.replace(/\s+/g,' ').trim();
      meta.textContent = (new Date(ts)).toLocaleString();
      selectedVehicle = v;
    }
  }

  function updateVehicleList() {
    if (vehicleHistory.length === 0) {
      vehicleList.innerHTML = `
        <div class="empty-state">
          No vehicles scraped yet.<br>
          Visit Cars.com and click "Scan" to add vehicles.
        </div>`;
      return;
    }

    vehicleList.innerHTML = vehicleHistory.map((vehicle, index) => `
      <div class="vehicle-item" data-index="${index}" ${selectedVehicle && selectedVehicle.url === vehicle.url ? 'class="vehicle-item selected"' : ''}>
        <img class="vehicle-thumbnail" src="${vehicle.images && vehicle.images[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMjUgNzVIMTc1VjEyNUgxMjVWNzVaIiBmaWxsPSIjOUNBM0FGIi8+CjwvZ3ZnPg=='}" alt="Vehicle" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMjUgNzVIMTc1VjEyNUgxMjVWNzVaIiBmaWxsPSIjOUNBM0FGIi8+PC9zdmc+'" />
        <div class="vehicle-title">${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}</div>
        <div class="vehicle-price">$${vehicle.price?.toLocaleString() || 'N/A'}</div>
        <div class="vehicle-details">${vehicle.mileage?.toLocaleString() || 'N/A'} mi • ${vehicle.exteriorColor || 'N/A'}</div>
        <div class="vehicle-actions">
          <button class="primary use-btn" data-index="${index}">Use</button>
          <button class="secondary download-btn" data-index="${index}">Photos</button>
          <button class="danger post-fb-btn" data-index="${index}">Post FB</button>
        </div>
      </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('.use-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        selectedVehicle = vehicle;
        chrome.storage.local.set({ vehiclePayload: vehicle, vehiclePayloadTs: Date.now() });
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
      btn.onclick = (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const vehicle = vehicleHistory[index];
        chrome.storage.local.set({ vehiclePayload: vehicle, vehiclePayloadTs: Date.now() });
        chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/create/vehicle' });
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

  function updateModelInfo(modelName) {
    if (!modelName) {
      modelInfo.textContent = '';
      document.getElementById('generateAI').disabled = true;
      return;
    }

    // Extract model info from name (e.g., "llama3.2:3b" -> "Llama 3.2 (3B params)")
    let displayName = modelName;
    if (modelName.includes(':')) {
      const [base, variant] = modelName.split(':');
      displayName = `${base} (${variant.toUpperCase()})`;
    }

    modelInfo.textContent = `Using: ${displayName}`;
    document.getElementById('generateAI').disabled = false;
  }

  async function fetchAvailableModels() {
    const url = ollamaUrl.value.trim();
    if (!url) return [];

    try {
      const response = await fetch(`${url}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return data.models || [];
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
    return [];
  }

  async function populateModelSelect() {
    const models = await fetchAvailableModels();
    const currentValue = modelSelect.value;

    modelSelect.innerHTML = '';

    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      modelSelect.disabled = true;
      document.getElementById('refreshModels').disabled = true;
      document.getElementById('generateAI').disabled = true;
      modelInfo.textContent = '';
      return;
    }

    // Add models to dropdown
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name} (${(model.size / 1e9).toFixed(1)}GB)`;
      modelSelect.appendChild(option);
    });

    // Enable controls
    modelSelect.disabled = false;
    document.getElementById('refreshModels').disabled = false;
    document.getElementById('pullModel').disabled = false;

    // Restore or set default selection
    if (currentValue && models.find(m => m.name === currentValue)) {
      modelSelect.value = currentValue;
    } else if (models.length > 0) {
      // Default to first available model
      modelSelect.value = models[0].name;
    }

    // Update model info and save selection
    updateModelInfo(modelSelect.value);
    if (modelSelect.value) {
      chrome.storage.local.set({ selectedModel: modelSelect.value });
    }
  }

  async function testOllamaConnection() {
    const url = ollamaUrl.value.trim();
    if (!url) {
      aiStatus.textContent = 'Please enter Ollama URL';
      return;
    }

    aiStatus.textContent = 'Testing connection...';

    try {
      const response = await fetch(`${url}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        aiStatus.textContent = `✅ Connected! Found ${data.models?.length || 0} models`;
        chrome.storage.local.set({ ollamaUrl: url });

        // Populate model dropdown
        await populateModelSelect();
      } else {
        aiStatus.textContent = '❌ Connection failed - check URL and ensure Ollama is running';
      }
    } catch (error) {
      aiStatus.textContent = '❌ Connection failed - check URL and ensure Ollama is running';
    }
  }

  async function pullModel() {
    const modelName = modelToPull.value.trim();
    if (!modelName) {
      alert('Please enter a model name to pull');
      return;
    }

    const url = ollamaUrl.value.trim();
    if (!url) {
      alert('Please set Ollama URL first');
      return;
    }

    const pullProgress = document.getElementById('pullProgress');
    const startPull = document.getElementById('startPull');
    const cancelPull = document.getElementById('cancelPull');

    startPull.disabled = true;
    pullProgress.textContent = `Pulling ${modelName}...`;

    try {
      const response = await fetch(`${url}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false })
      });

      if (response.ok) {
        pullProgress.textContent = `✅ Successfully pulled ${modelName}`;
        // Refresh model list
        await populateModelSelect();
        // Auto-select the new model
        modelSelect.value = modelName;
        updateModelInfo(modelName);
        chrome.storage.local.set({ selectedModel: modelName });

        setTimeout(() => {
          pullModelDialog.style.display = 'none';
          modelToPull.value = '';
          pullProgress.textContent = '';
        }, 2000);
      } else {
        const error = await response.text();
        pullProgress.textContent = `❌ Failed to pull model: ${error}`;
      }
    } catch (error) {
      pullProgress.textContent = `❌ Error pulling model: ${error.message}`;
    } finally {
      startPull.disabled = false;
    }
  }

  async function generateAIDescription() {
    if (!selectedVehicle) {
      alert('Please select a vehicle first');
      return;
    }

    const url = ollamaUrl.value.trim();
    const instructions = aiInstructions.value.trim();
    const selectedModelName = modelSelect.value;

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
      const response = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModelName,
          prompt: prompt,
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        const description = data.response;

        // Update the vehicle with AI description
        selectedVehicle.aiDescription = description;
        selectedVehicle.aiModel = selectedModelName;

        // Update in history
        const vehicleIndex = vehicleHistory.findIndex(v => v.url === selectedVehicle.url);
        if (vehicleIndex >= 0) {
          vehicleHistory[vehicleIndex].aiDescription = description;
          vehicleHistory[vehicleIndex].aiModel = selectedModelName;
          chrome.storage.local.set({ vehicleHistory });
        }

        // Update current vehicle
        chrome.storage.local.set({ vehiclePayload: selectedVehicle });

        aiStatus.textContent = `✅ AI description generated using ${selectedModelName}!`;

        // Show the description in an alert for now
        alert(`AI Generated Description (${selectedModelName}):\n\n${description}`);
      } else {
        const error = await response.text();
        aiStatus.textContent = `❌ Failed to generate description: ${error}`;
      }
    } catch (error) {
      console.error('Error generating AI description:', error);
      aiStatus.textContent = '❌ Error generating description';
    }
  }

  // Save AI instructions when changed
  aiInstructions.onchange = () => {
    chrome.storage.local.set({ aiInstructions: aiInstructions.value });
  };

  // Model selection change handler
  modelSelect.onchange = () => {
    const selectedModel = modelSelect.value;
    updateModelInfo(selectedModel);
    if (selectedModel) {
      chrome.storage.local.set({ selectedModel });
    }
  };

  // Event listeners
  document.getElementById('testOllama').onclick = testOllamaConnection;
  document.getElementById('generateAI').onclick = generateAIDescription;
  document.getElementById('refreshModels').onclick = populateModelSelect;

  document.getElementById('pullModel').onclick = () => {
    pullModelDialog.style.display = pullModelDialog.style.display === 'none' ? 'block' : 'none';
  };

  document.getElementById('startPull').onclick = pullModel;
  document.getElementById('cancelPull').onclick = () => {
    pullModelDialog.style.display = 'none';
    modelToPull.value = '';
    document.getElementById('pullProgress').textContent = '';
  };

  document.getElementById('openFB').onclick = () => chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/create/vehicle' });

  document.getElementById('autofill').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab || !/facebook\.com\/marketplace\/create\/vehicle/.test(tab.url || '')) {
      alert('Open the Facebook "Create → Vehicle" page first.');
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { document.getElementById('vp-auto')?.click(); }
    });
    window.close();
  };

  // Listen for storage changes to update vehicle history
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
})();
