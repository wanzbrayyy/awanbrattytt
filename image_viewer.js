const express = require('express');
const open = require('open');
const path = require('path');

const app = express();
const port = 3000;

// Get image path and URL from command line arguments
const imagePath = process.argv[2];
const urlToOpen = process.argv[3];

if (!imagePath || !urlToOpen) {
    console.error('Usage: node image_viewer.js <path_to_image> <url_to_open>');
    process.exit(1);
}

// Serve the image
app.get('/image', (req, res) => {
    res.sendFile(path.resolve(imagePath));
});

app.listen(port, () => {
    console.log(`Image viewer running at http://localhost:${port}`);
    // Open the image in the default image viewer
    open(`http://localhost:${port}/image`);
    // Open the URL in the default browser
    open(urlToOpen);
});
