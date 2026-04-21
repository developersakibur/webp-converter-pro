# WebP Compressor Pro

A modern, high-performance Chrome extension to compress and convert images to WebP format directly in your browser.

## Features

- **Batch Conversion:** Drop multiple images and convert them all at once.
- **Smart Compression:** Adjust quality and set a maximum file size target. The extension uses a binary search algorithm to find the best quality within your size constraints.
- **ZIP Export:** Automatically bundles multiple converted images into a single ZIP file for easy downloading.
- **Context Menu Integration:** Right-click any image on any website and select "Save as WebP" to convert and download it instantly.
- **Privacy Focused:** All processing happens locally in your browser. No images are uploaded to any server.
- **Modern UI:** Clean, dark-themed interface with real-time status updates and compression statistics.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the project directory.

## Usage

### Using the Popup
1. Click the extension icon in your toolbar.
2. Drag and drop images or click the drop zone to select files.
3. Adjust the **Quality** slider and **Max Size (KB)** input as needed.
4. Click **Convert & Download**.

### Using the Context Menu
1. Right-click any image on a webpage.
2. Select **Save as WebP**.
3. The image will be processed using your last saved settings and downloaded automatically.

## Technologies Used

- JavaScript (ES6+)
- Chrome Extension API (Manifest V3)
- [JSZip](https://stuk.github.io/jszip/) for ZIP generation
- HTML5 Canvas & OffscreenCanvas for image processing
- CSS3 with modern features (Flexbox, Grid, Custom Properties)

## License

MIT License - feel free to use and modify for your own projects.

---
Created by [developersakibur](https://github.com/developersakibur)
