// Initialize map with enhanced options for smoother zooming
const map = L.map('map', {
    center: [-0.1022, 34.7617],
    zoom: 10,
    zoomSnap: 0.5,         // Allow for half-zoom levels
    zoomDelta: 0.5,        // Smoother zoom steps
    wheelPxPerZoomLevel: 100, // More sensitive wheel zooming
    zoomAnimation: true,   // Enable zoom animations
    markerZoomAnimation: true, // Animate markers during zoom
    fadeAnimation: true,   // Fade in/out during zoom
    maxBounds: L.latLngBounds(
        [-0.5, 34.2],      // Southwest corner
        [0.3, 35.3]        // Northeast corner
    ),
    maxBoundsViscosity: 0.8 // How "sticky" the bounds are (0-1)
});

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

// Add base layers with more options
const basemaps = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }),
    "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri'
    }),
    "Light": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    })
};

// Add the default basemap
basemaps["OpenStreetMap"].addTo(map);

// Style definitions (keep your existing styles)
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

// Add a scale bar (professional touch)
L.control.scale({
    maxWidth: 200,
    metric: true,
    imperial: false,
    position: 'bottomleft'
}).addTo(map);

// Add a home button to reset view
const homeButton = L.control({position: 'topleft'});
homeButton.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    div.innerHTML = '<a href="#" title="Zoom to Kisumu County" style="font-size: 18px; display: flex; align-items: center; justify-content: center; text-decoration: none;">🏠</a>';
    div.onclick = function() {
        map.flyTo([-0.1022, 34.7617], 10, {
            duration: 1.5,
            easeLinearity: 0.25
        });
        return false;
    };
    return div;
};
homeButton.addTo(map);

// Add layer control with basemaps
const overlays = {}; // We'll add our data layers here
const layerControl = L.control.layers(basemaps, overlays, {
    position: 'topright',
    collapsed: true
}).addTo(map);

// Keep your existing debug helper function
function debugLayer(layer, name) {
    console.log(`${name} layer:`, layer);
    if (layer instanceof L.FeatureGroup) {
        console.log(`- Has ${layer.getLayers().length} sub-layers`);
    }
}

// Keep your existing debounce function
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

// Add smooth fly-to for feature clicks
function smoothlyZoomToFeature(layer) {
    map.flyToBounds(layer.getBounds(), {
        padding: [50, 50],
        duration: 1,
        easeLinearity: 0.5
    });
}

// Add loading indicator for smoother UX
map.on('zoomstart movestart', function() {
    document.body.classList.add('map-loading');
});

map.on('zoomend moveend', function() {
    document.body.classList.remove('map-loading');
});

// Add CSS for enhanced visuals
const style = document.createElement('style');
style.textContent = `
    .map-loading {
        cursor: progress !important;
    }
    
    .leaflet-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    .leaflet-control-layers, .leaflet-control-zoom, .leaflet-bar {
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.2);
    }
    
    .leaflet-control-zoom a, .leaflet-bar a {
        background-color: white;
        color: #333;
        transition: all 0.2s ease;
    }
    
    .leaflet-control-zoom a:hover, .leaflet-bar a:hover {
        background-color: #f4f4f4;
        color: #000;
    }
`;
document.head.appendChild(style);
