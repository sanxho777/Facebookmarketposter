// background.js - Handle downloads from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImages') {
    handleImageDownloads(request.images, request.folderName)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

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