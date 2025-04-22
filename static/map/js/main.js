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

        if (typeof TravelTimeAnalysis !== 'undefined' && typeof map !== 'undefined') {
            console.log('Initializing Travel Time Analysis module');
            TravelTimeAnalysis.init(map);
        } else {
            console.error('Could not initialize Travel Time Analysis: map or module not available');
        }


    }, 2000);
});


// Add debug button event listener
document.getElementById('debugBtn').addEventListener('click', debugInspectLayers);

// Show debug button in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.getElementById('debugBtn').style.display = 'block';
}

