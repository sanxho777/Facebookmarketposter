# Vehicle Poster (Standalone)

A Chrome extension that scrapes vehicle information from Cars.com and automatically fills Facebook Marketplace vehicle forms, eliminating the need for manual data entry.

Check it out on the chrome web store https://chromewebstore.google.com/detail/vehicle-poster/cjjdcdandjacgmdmdggjbijgmcjjlhia?authuser=0&hl=en
or install manually using the steps below.

## Features

- **Scrape from Cars.com**: Extract vehicle details including year, make, model, trim, mileage, price, and more
- **Auto-fill Facebook Marketplace**: Automatically populate vehicle listing forms on Facebook Marketplace
- **Photo Download**: Download vehicle images from Cars.com listings
- **Standalone Operation**: No backend server required - everything runs locally in your browser
- **Smart Mapping**: Intelligently maps vehicle data between different platforms

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the project folder
5. The Vehicle Poster extension should now appear in your extensions list

## Usage

### Step 1: Scrape Vehicle Data
1. Navigate to any vehicle listing on Cars.com
2. Click the Vehicle Poster extension icon in your browser toolbar
3. Click the "Scan" button in the overlay that appears
4. Review the extracted vehicle information in the preview modal
5. Optionally download vehicle photos using the "Download Photos" button

### Step 2: Fill Facebook Marketplace Form
1. Open Facebook Marketplace and navigate to "Create → Vehicle"
2. Click the Vehicle Poster extension icon
3. Click "Autofill on current FB tab" to automatically populate the form with scraped data
4. Add photos manually (browser security prevents automatic photo uploads)
5. Review and publish your listing

## Technical Details

### Architecture
- **Manifest V3** Chrome extension
- **Content Scripts**: Separate scripts for Cars.com scraping and Facebook form filling
- **Service Worker**: Handles image downloads
- **Local Storage**: Stores scraped vehicle data between sessions

### File Structure
```
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── background.js          # Service worker for downloads
├── assets/                # Extension icons
└── content/
    ├── cars.js           # Cars.com scraping logic
    ├── facebook.js       # Facebook Marketplace form filling
    ├── util.js           # Shared utilities
    └── styles.css        # UI styling
```

### Permissions
- `storage`: Store scraped vehicle data
- `activeTab`: Access current tab for form filling
- `scripting`: Execute scripts for autofill functionality
- `downloads`: Download vehicle images
- Host permissions for Cars.com and Facebook.com

## Data Mapping

The extension intelligently maps data between platforms:

| Cars.com Field | Facebook Marketplace Field |
|----------------|---------------------------|
| Year, Make, Model | Vehicle identification |
| Mileage | Odometer reading |
| Price | Listing price |
| Exterior Color | Color selection |
| Body Style | Vehicle type |
| Transmission | Transmission type |
| Fuel Type | Fuel type |
| Engine | Engine details |

## Limitations

- Photos must be uploaded manually to Facebook due to browser security restrictions
- Only works with Cars.com as the source platform
- Requires manual review of auto-filled data for accuracy
- Some vehicle specifications may need manual adjustment

## Version History

- **v1.0.4** - Current version with improved photo quality and brand logic
- Previous versions included photo download enhancements and various bug fixes

## Support

This is a standalone tool that runs entirely in your browser. No data is sent to external servers, ensuring privacy and security of your vehicle listing information.
