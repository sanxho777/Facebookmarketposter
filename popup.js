(async () => {
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');
  const { vehiclePayload: v, vehiclePayloadTs } = await chrome.storage.local.get(['vehiclePayload','vehiclePayloadTs']);

  if (v) {
    status.textContent = `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.trim || ''}`.replace(/\s+/g,' ').trim();
    meta.textContent = (new Date(vehiclePayloadTs)).toLocaleString();
  }

  document.getElementById('openFB').onclick = () => chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/create/vehicle' });

  document.getElementById('autofill').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab || !/facebook\.com\/marketplace\/create\/vehicle/.test(tab.url || '')) {
      alert('Open the Facebook “Create → Vehicle” page first.');
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { document.getElementById('vp-autofill')?.click(); }
    });
    window.close();
  };
})();
