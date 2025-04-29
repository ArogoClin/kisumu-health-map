document.addEventListener('DOMContentLoaded', function() {
    console.log('Test map script loaded');
    console.log('Leaflet available:', typeof L !== 'undefined');
    
    try {
        // Initialize a basic map
        const map = L.map('map').setView([-0.1022, 34.7617], 10);
        
        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
});
