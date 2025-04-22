// Population density layer
let populationLayer = null;
// Global variables for consistent scaling
let globalLogMin = null;
let globalLogMax = null;
let globalMin = null;
let globalMax = null;

document.getElementById('populationDensityToggle').addEventListener('change', function(e) {
    const controls = document.getElementById('populationControls');
    
    if (e.target.checked) {
        controls.style.display = 'block';
        loadPopulationData();
    } else {
        controls.style.display = 'none';
        if (populationLayer) {
            map.removeLayer(populationLayer);
        }
    }
});

document.getElementById('datasetSelect').addEventListener('change', function() {
    if (document.getElementById('populationDensityToggle').checked) {
        loadPopulationData();
    }
});

// Add reset button functionality
document.getElementById('resetDensityScale').addEventListener('click', function() {
    globalLogMin = null;
    globalLogMax = null;
    globalMin = null;
    globalMax = null;
    
    if (document.getElementById('populationDensityToggle').checked) {
        loadPopulationData();
    }
});

function loadPopulationData() {
    // Show loading indicator
    document.getElementById('densityLegend').innerHTML = 'Loading population data...';
    
    // Remove existing layer if any
    if (populationLayer) {
        map.removeLayer(populationLayer);
    }
    
    // Get current map bounds
    const bounds = map.getBounds();
    const boundsStr = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    // Fetch population density data
    fetch(`/maps/api/population-density/?bounds=${boundsStr}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log(`Loaded ${data.point_count} population points (downsampled by factor of ${data.downsample_factor})`);
            
            // Check if we have points data
            if (!data.points || data.points.length === 0) {
                document.getElementById('densityLegend').innerHTML = 'No population data available for this area';
                return;
            }

            // Store global min/max values if this is the first load
            if (globalLogMin === null) {
                globalLogMin = data.log_min;
                globalLogMax = data.log_max;
                globalMin = data.min;
                globalMax = data.max;
                console.log("Set global scale:", globalMin, "to", globalMax);
            }
            
            // Log sample data for debugging
            console.log('First point sample:', data.points[0]);
            
            // The backend already returns points in [lat, lon, value] format for Leaflet
            // No need to swap coordinates
            const heatData = data.points;
            
            console.log('Processed heat data sample:', heatData[0]);
            
            // Create a heatmap layer using the GLOBAL max value for consistent scaling
            if (heatData.length > 0 && typeof L.heatLayer === 'function') {
                populationLayer = L.heatLayer(heatData, {
                    radius: 15,
                    blur: 10,
                    maxZoom: 17,
                    max: globalLogMax, // Use global max instead of current view max
                    gradient: {
                        0.0: 'blue',
                        0.2: 'cyan',
                        0.4: 'lime',
                        0.6: 'yellow',
                        0.8: 'orange',
                        1.0: 'red'
                    }
                }).addTo(map);
                
                // Create legend
                createDensityLegend({
                    ...data,
                    min: globalMin,
                    max: globalMax,
                    log_min: globalLogMin,
                    log_max: globalLogMax
                });
            } else {
                throw new Error('Could not create heatmap layer');
            }
        })
        .catch(error => {
            console.error('Error loading population data:', error);
            document.getElementById('densityLegend').innerHTML = 'Error loading data';
        });
}

function createDensityLegend(data) {
    const legend = document.getElementById('densityLegend');
    
    // Get min/max values with fallbacks
    // Since your backend returns both raw and log-scaled values
    const min = data.min || 0;
    const max = data.max || 1000;
    const mean = data.mean || Math.round((min + max) / 2);
    const year = data.year || 'Current';
    
    // For display purposes, we might want to use the raw values
    // but space them according to the log scale
    const logMin = data.log_min || Math.log1p(min);
    const logMax = data.log_max || Math.log1p(max);
    
    // Calculate legend steps based on log scale
    const steps = 5;
    const logRange = logMax - logMin;
    const logStepSize = logRange / steps;
    
    let html = `
        <div style="font-weight: bold; margin-bottom: 5px;">
            Population Density (${year})
        </div>
        <div style="display: flex; flex-direction: column;">
    `;
    
    // Create gradient bar
    html += '<div style="display: flex; height: 20px; margin-bottom: 5px;">';
    const colors = ['blue', 'cyan', 'lime', 'yellow', 'orange', 'red'];
    for (let i = 0; i < colors.length; i++) {
        html += `<div style="flex: 1; background-color: ${colors[i]};"></div>`;
    }
    html += '</div>';
    
    // Create labels with values converted back from log scale
    html += '<div style="display: flex; justify-content: space-between;">';
    for (let i = 0; i <= steps; i++) {
        // Calculate log value at this step
        const logValue = logMin + (i * logStepSize);
        // Convert back to original scale (exp(log1p(x)) - 1 = x)
        const value = Math.round(Math.exp(logValue) - 1);
        html += `<div>${value}</div>`;
    }
    html += '</div>';
    
    html += `
        </div>
        <div style="font-size: 0.8em; margin-top: 5px;">
            Average: ${Math.round(mean)} people/km²
        </div>
    `;
    
    legend.innerHTML = html;
}

// Add event to reload population data when map is moved (with debounce)
map.on('moveend', debounce(function() {
    if (document.getElementById('populationDensityToggle').checked) {
        loadPopulationData();
    }
}, 300)); // 300ms debounce delay

