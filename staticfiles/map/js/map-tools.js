// Toggle measurement tool
document.getElementById('measurementTool').addEventListener('change', function(e) {
    if (e.target.checked) {
        map.addControl(drawControl);
    } else {
        map.removeControl(drawControl);
        drawnItems.clearLayers();
    }
});

// Handle the draw events
map.on('draw:created', function(e) {
    const layer = e.layer;
    drawnItems.addLayer(layer);
    
    if (e.layerType === 'polyline') {
        const distance = calculateDistance(layer);
        layer.bindPopup(`Distance: ${distance.toFixed(2)} km`).openPopup();
    }
});

// Calculate distance function
function calculateDistance(layer) {
    const latlngs = layer.getLatLngs();
    let distance = 0;
    
    for (let i = 0; i < latlngs.length - 1; i++) {
        distance += latlngs[i].distanceTo(latlngs[i + 1]);
    }
    
    return distance / 1000; // Convert to kilometers
}
