
const TravelTimeAnalysis = (function() {
    // Private variables
    let map;
    let isochrones = [];
    let isochroneLayers = {};
    let isAnalysisRunning = false;
    let legendControl;
    let populationCoverage = {};
    
    // Color scheme for different travel times
    const travelTimeColors = {
        5: '#1a9641',   // Green
        10: '#a6d96a',  // Light green
        15: '#ffffbf',  // Yellow
        30: '#fdae61'   // Orange
    };
    
    // Initialize the module
    function init(mapInstance) {
        map = mapInstance;
        
        // Add UI controls
        setupControls();
        
        // Create legend control
        legendControl = L.control({position: 'bottomright'});
        legendControl.onAdd = function() {
            const div = L.DomUtil.create('div', 'info legend travel-time-legend');
            div.style.display = 'none';
            div.innerHTML = '<h4>Travel Time</h4>';
            return div;
        };
        legendControl.addTo(map);
    }
    
    // Set up UI controls
    function setupControls() {
        // Add travel time analysis section to sidebar
        const sidebarSection = document.createElement('div');
        sidebarSection.innerHTML = `
            <h4>Travel Time Analysis</h4>
            <div class="travel-time-toggles">
                <label><input type="checkbox" id="travelTimeToggle"> Show Travel Time Isochrones</label>
                <div id="travelTimeControls" style="display: none; margin-top: 10px;">
                    <button id="runTravelTimeAnalysis" class="analysis-btn">Run Travel Time Analysis</button>
                    <div id="travelTimeStatus" style="margin-top: 5px; font-size: 0.9em; display: none;"></div>
                    <div id="populationCoverageStats" style="margin-top: 10px; display: none;"></div>
                </div>
            </div>
        `;
        
        // Insert after service area analysis
        const serviceAreaSection = document.querySelector('.service-area-toggles');
        if (serviceAreaSection) {
            serviceAreaSection.parentNode.insertBefore(sidebarSection, serviceAreaSection.nextSibling);
        } else {
            // Fallback if service area section not found
            const analysisTools = document.querySelector('.analysis-tools');
            if (analysisTools) {
                analysisTools.parentNode.insertBefore(sidebarSection, analysisTools);
            }
        }
        
        // Add event listeners
        const travelTimeToggle = document.getElementById('travelTimeToggle');
        if (travelTimeToggle) {
            travelTimeToggle.addEventListener('change', function(e) {
                const controls = document.getElementById('travelTimeControls');
                const legend = document.querySelector('.travel-time-legend');
                
                if (e.target.checked) {
                    controls.style.display = 'block';
                    if (legend) legend.style.display = 'block';
                    updateLegend();
                } else {
                    controls.style.display = 'none';
                    if (legend) legend.style.display = 'none';
                    clearIsochrones();
                }
            });
        }
        
        const runButton = document.getElementById('runTravelTimeAnalysis');
        if (runButton) {
            runButton.addEventListener('click', runAnalysis);
        }
    }
    
    // Run the travel time analysis
    function runAnalysis() {
        if (isAnalysisRunning) return;
        
        isAnalysisRunning = true;
        const statusElement = document.getElementById('travelTimeStatus');
        const button = document.getElementById('runTravelTimeAnalysis');
        
        if (!statusElement || !button) {
            console.error('Required DOM elements not found');
            isAnalysisRunning = false;
            return;
        }
        
        statusElement.style.display = 'block';
        statusElement.innerHTML = 'Running travel time analysis... This may take a minute.';
        button.disabled = true;
        
        // Clear any existing isochrones
        clearIsochrones();
        
        // Make API request
        fetch('/maps/travel-time-analysis/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Store the isochrones data
            isochrones = Array.isArray(data.isochrones) ? data.isochrones : [];
            
            // Store population coverage data with validation
            populationCoverage = data.population_coverage || {};
            
            // Display isochrones if we have any
            if (isochrones.length > 0) {
                displayIsochrones();
            } else {
                console.warn('No isochrones data received');
            }
            
            // Display population coverage stats
            displayPopulationStats();
            
            // Update status
            const method = data.stats && data.stats.method === 'simplified_buffer' ?
                'simplified buffer-based' : 'network-based';
            
            const isochroneCount = data.stats && data.stats.isochrones_generated ? 
                data.stats.isochrones_generated : isochrones.length;
            
            const processingTime = data.stats && data.stats.processing_time_seconds ? 
                parseFloat(data.stats.processing_time_seconds).toFixed(1) : 'unknown';
            
            statusElement.innerHTML = `Analysis complete! Used ${method} approach. ` +
                `Generated ${isochroneCount} isochrones in ` +
                `${processingTime} seconds.`;
            
            button.disabled = false;
        })
        .catch(error => {
            console.error('Error running travel time analysis:', error);
            statusElement.innerHTML = `Error: ${error.message}. Please try again.`;
            button.disabled = false;
        })
        .finally(() => {
            isAnalysisRunning = false;
        });
    }
    
    // Display isochrones on the map
    function displayIsochrones() {
        if (!map || !isochrones || isochrones.length === 0) {
            console.warn('Cannot display isochrones: missing data or map');
            return;
        }
        
        try {
            // Group isochrones by travel time
            const isochronesByTime = {};
            
            isochrones.forEach(isochrone => {
                if (!isochrone || !isochrone.properties) return;
                
                const time = isochrone.properties.travel_time;
                if (!time) return;
                
                if (!isochronesByTime[time]) {
                    isochronesByTime[time] = [];
                }
                isochronesByTime[time].push(isochrone);
            });
            
            // Create a layer for each travel time
            Object.keys(isochronesByTime).forEach(time => {
                const color = travelTimeColors[time] || '#ff7f00';
                
                try {
                    const layer = L.geoJSON(isochronesByTime[time], {
                        style: {
                            color: color,
                            weight: 2,
                            opacity: 0.8,
                            fillColor: color,
                            fillOpacity: 0.2
                        },
                        onEachFeature: function(feature, layer) {
                            // Add popup with facility info
                            if (feature && feature.properties) {
                                const props = feature.properties;
                                layer.bindPopup(`
                                    <strong>${props.facility_name || 'Unknown Facility'}</strong><br>
                                    Type: ${props.facility_type || 'Unknown'}<br>
                                    Travel Time: ${props.travel_time || '?'} minutes
                                `);
                            }
                        }
                    }).addTo(map);
                    
                    isochroneLayers[time] = layer;
                } catch (err) {
                    console.error(`Error creating layer for ${time} min isochrones:`, err);
                }
            });
            
            // Update the legend
            updateLegend();
        } catch (error) {
            console.error('Error displaying isochrones:', error);
        }
    }
    
    // Display population coverage statistics
    function displayPopulationStats() {
        const statsElement = document.getElementById('populationCoverageStats');
        if (!statsElement) return;
        
        try {
            if (!populationCoverage || Object.keys(populationCoverage).length === 0) {
                statsElement.style.display = 'none';
                return;
            }
            
            let html = '<h4>Population Coverage</h4>';
            html += '<table class="population-stats-table" style="width:100%; border-collapse: collapse;">';
            html += '<tr><th style="text-align:left; padding:3px; border-bottom:1px solid #ddd;">Travel Time</th>' +
                    '<th style="text-align:right; padding:3px; border-bottom:1px solid #ddd;">Population</th>' +
                    '<th style="text-align:right; padding:3px; border-bottom:1px solid #ddd;">Coverage</th></tr>';
            
            // Sort travel times numerically
            const times = Object.keys(populationCoverage).sort((a, b) => parseInt(a) - parseInt(b));
            
            times.forEach(time => {
                const data = populationCoverage[time] || {};
                
                // Format population with commas
                let population = '0';
                if (data.estimated_population !== undefined) {
                    const popValue = parseInt(data.estimated_population);
                    population = !isNaN(popValue) ? popValue.toLocaleString() : '0';
                }
                
                // Ensure coverage_percentage is a number before using toFixed
                let coverage = 'N/A';
                if (data.coverage_percentage !== undefined) {
                    const coverageValue = parseFloat(data.coverage_percentage);
                    coverage = !isNaN(coverageValue) ? `${coverageValue.toFixed(1)}%` : 'N/A';
                }
                
                html += `<tr>
                    <td style="padding:3px; border-bottom:1px solid #eee;">${time} min</td>
                    <td style="text-align:right; padding:3px; border-bottom:1px solid #eee;">${population}</td>
                    <td style="text-align:right; padding:3px; border-bottom:1px solid #eee;">${coverage}</td>
                </tr>`;
            });
            
            html += '</table>';
            
            // Add area information
            if (times.length > 0) {
                const maxTime = times[times.length - 1];
                const data = populationCoverage[maxTime] || {};
                
                let areaDisplay = 'N/A';
                if (data.area_km2 !== undefined) {
                    const areaValue = parseFloat(data.area_km2);
                    areaDisplay = !isNaN(areaValue) ? `${areaValue.toFixed(1)} km²` : 'N/A';
                }
                
                html += `<div style="margin-top:5px; font-size:0.9em;">
                    Total service area: ${areaDisplay}
                </div>`;
            }
            
            statsElement.innerHTML = html;
            statsElement.style.display = 'block';
        } catch (error) {
            console.error('Error displaying population stats:', error);
            statsElement.innerHTML = '<div class="error">Error displaying population statistics</div>';
            statsElement.style.display = 'block';
        }
    }
    
    // Update the legend with travel time colors
    function updateLegend() {
        const div = document.querySelector('.travel-time-legend');
        if (!div) return;
        
        try {
            let html = '<h4>Travel Time</h4>';
            
            // Sort travel times numerically
            const times = Object.keys(travelTimeColors).sort((a, b) => parseInt(a) - parseInt(b));
            
            times.forEach(time => {
                const color = travelTimeColors[time];
                html += `<div>
                    <i style="background:${color}; opacity:0.7;"></i>
                    ${time} minutes
                </div>`;
            });
            
            div.innerHTML = html;
        } catch (error) {
            console.error('Error updating legend:', error);
        }
    }
    
    // Clear all isochrones from the map
    function clearIsochrones() {
        try {
            Object.values(isochroneLayers).forEach(layer => {
                if (map && layer) {
                    map.removeLayer(layer);
                }
            });
            isochroneLayers = {};
            
            // Clear population stats
            const statsElement = document.getElementById('populationCoverageStats');
            if (statsElement) {
                statsElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Error clearing isochrones:', error);
        }
    }
    
    // Helper function to get CSRF token
    function getCsrfToken() {
        try {
            const cookieValue = document.cookie
                .split('; ')
                .find(row => row.startsWith('csrftoken='))
                ?.split('=')[1];
            return cookieValue || '';
        } catch (error) {
            console.error('Error getting CSRF token:', error);
            return '';
        }
    }
    
    // Public API
    return {
        init: init,
        runAnalysis: runAnalysis,
        clearIsochrones: clearIsochrones
    };
})();

// Add CSS styles
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .travel-time-legend {
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            line-height: 1.5;
        }
        
        .travel-time-legend i {
            width: 18px;
            height: 18px;
            float: left;
            margin-right: 8px;
            opacity: 0.7;
        }
        
        .travel-time-legend h4 {
            margin: 0 0 5px;
            font-size: 14px;
        }
        
        .population-stats-table {
            font-size: 0.9em;
            background: #f9f9f9;
            border-radius: 3px;
        }
        
        .error {
            color: #e74c3c;
            padding: 5px;
            background: #fadbd8;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
})();
