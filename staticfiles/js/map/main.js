// main.js - Main entry point for the application

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Kisumu Health Facilities Map');
    
    // Check if Leaflet is loaded
    console.log('Leaflet loaded:', typeof L !== 'undefined');
    console.log('L.heatLayer available:', typeof L !== 'undefined' && typeof L.heatLayer === 'function');
    
    // Initialize debug logging for layers
    setTimeout(() => {
        debugLayer(bufferLayer, "Buffer");
        debugLayer(underservedLayer, "Underserved");
        debugLayer(coverageGapLayer, "Coverage Gap");
    }, 2000);
});
