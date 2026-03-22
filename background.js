// background.js - Handle downloads and Ollama requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImages') {
    handleImageDownloads(request.images, request.folderName)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  } else if (request.action === 'ollamaRequest') {
    handleOllamaRequest(request.url, request.method, request.body)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function handleOllamaRequest(url, method = 'GET', body = null) {
  try {
    console.log(`Making Ollama request to: ${url}`);

    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        // Ollama checks Origin header — spoof localhost to pass CORS check
        'Origin': 'http://localhost',
      }
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    console.log(`Ollama response status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}${text ? ' — ' + text.slice(0, 200) : ''}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: data,
      status: response.status
    };

  } catch (error) {
    console.error('Ollama request error:', error);

    // Give a helpful message if it's a 403
    let errorMsg = error.message;
    if (errorMsg.includes('403')) {
      errorMsg = `${errorMsg}\n\nTo fix: run Ollama with OLLAMA_ORIGINS="*" or set it in your Ollama config.`;
    }

    return {
      success: false,
      error: errorMsg,
      details: {
        name: error.name,
        cause: error.cause,
        stack: error.stack
      }
    };
  }
}

async function handleImageDownloads(images, folderName) {
  const downloadIds = [];
  const errors = [];
  
  try {
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      
      try {
        const extension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
        const filename = `${folderName}/image_${String(i + 1).padStart(2, '0')}.${extension}`;
        
        const downloadId = await chrome.downloads.download({
          url: imageUrl,
          filename: filename,
          saveAs: false
        });
        
        downloadIds.push(downloadId);
        
      } catch (error) {
        console.warn(`Error downloading image ${i + 1}:`, error);
        errors.push(`Image ${i + 1}: ${error.message}`);
      }
      
      // Small delay to avoid overwhelming the download system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      success: true,
      downloaded: downloadIds.length,
      total: images.length,
      errors: errors
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}