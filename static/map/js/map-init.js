// Initialize map and base layers
const map = L.map('map').setView([-0.1022, 34.7617], 10);

// Initialize the FeatureGroup for the drawControl
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Configure the draw control
const drawControl = new L.Control.Draw({
    draw: {
        polygon: false,
        circle: false,
        rectangle: false,
        circlemarker: false,
        marker: false,
        polyline: {
            metric: true,
            showLength: true,
            feet: false
        }
    },
    edit: {
        featureGroup: drawnItems,
        remove: true
    }
});

// Add base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Style definitions
const styles = {
    county: {
        color: "#34495e",        // Darker blue-gray
        weight: 3,
        fillOpacity: 0.1
    },
    constituency: {
        color: "#16a085",        // Teal
        weight: 2,
        fillOpacity: 0.1
    },
    ward: {
        color: "#8e44ad",        // Darker purple
        weight: 2,
        fillOpacity: 0.05
    }
};

// Debug helper function
function debugLayer(layer, name) {
    console.log(`${name} layer:`, layer);
    if (layer instanceof L.FeatureGroup) {
        console.log(`- Has ${layer.getLayers().length} sub-layers`);
    }
}

// Add debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}
