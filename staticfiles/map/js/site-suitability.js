// site-suitability.js - Handles site suitability analysis functionality

// Global variables
let suitabilityLayer = null;
let suitabilityUnderservedLayer = null;
let suitabilityLegend = null;
let isAnalyzing = false;

// Initialize site suitability functionality
function initSiteSuitability() {
    console.log('Initializing site suitability analysis functionality');
    
    // Add event listener to the analyze button
    document.getElementById('analyzeSuitabilityBtn').addEventListener('click', analyzeSuitability);
}

// Function to analyze site suitability
async function analyzeSuitability() {
    if (isAnalyzing) {
        alert('Analysis is already in progress. Please wait.');
        return;
    }
    
    try {
        isAnalyzing = true;
        
        // Update status
        const statusElement = document.getElementById('analysisStatus');
        statusElement.textContent = 'Analyzing optimal locations for new facilities...';
        statusElement.style.display = 'block';
        
        // Clear existing layers
        clearSuitabilityLayers();
        
        // Show loading indicator
        document.getElementById('analyzeSuitabilityBtn').disabled = true;
        document.getElementById('analyzeSuitabilityBtn').textContent = 'Analyzing...';
        
        // Make API request
        const response = await fetch('/maps/api/site-suitability-analysis/');
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Display results
        displaySuitabilityResults(data);
        
        // Update status
        statusElement.textContent = `Analysis complete. Found ${data.features.length} optimal locations.`;
        
        // Enable generate report button
        document.getElementById('generateReportBtn').style.display = 'block';
        
    } catch (error) {
        console.error('Error in site suitability analysis:', error);
        document.getElementById('analysisStatus').textContent = `Error: ${error.message}`;
    } finally {
        // Reset button
        document.getElementById('analyzeSuitabilityBtn').disabled = false;
        document.getElementById('analyzeSuitabilityBtn').textContent = 'Analyze Optimal Locations';
        isAnalyzing = false;
    }
}

// Function to display site suitability results
function displaySuitabilityResults(data) {
    // Add underserved areas layer
    if (data.underserved_area) {
        suitabilityUnderservedLayer = L.geoJSON(data.underserved_area, {
            style: {
                color: '#ff9800',
                weight: 1,
                fillColor: '#ff9800',
                fillOpacity: 0.2
            }
        }).addTo(map);
    }
    
    // Create markers for optimal locations
    suitabilityLayer = L.geoJSON(data, {
        pointToLayer: function(feature, latlng) {
            // Get score for color
            const score = feature.properties.composite_score;
            
            // Calculate color based on score (green for high scores, yellow for medium, orange for lower)
            const color = getColorForScore(score);
            
            // Create marker with rank number
            const rank = data.features.indexOf(feature) + 1;
            
            // Create custom icon with rank
            const icon = L.divIcon({
                className: 'rank-marker',
                html: `<div style="background-color:${color}; width:30px; height:30px; border-radius:50%; display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; border:2px solid white;">${rank}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            return L.marker(latlng, {icon: icon});
        },
        onEachFeature: function(feature, layer) {
            // Create popup content
            const props = feature.properties;
            const rank = data.features.indexOf(feature) + 1;
            
            let popupContent = `
                <div class="suitability-popup">
                    <h3>Optimal Location #${rank}</h3>
                    <p><strong>Population Served:</strong> ${props.population_served.toLocaleString()} people</p>
                    <p><strong>Area Covered:</strong> ${props.area_km2.toFixed(2)} km²</p>
                    <p><strong>Population Density:</strong> ${props.mean_density.toFixed(2)} people/km²</p>
            `;
            
            if (props.ward) {
                popupContent += `<p><strong>Ward:</strong> ${props.ward}</p>`;
            }
            
            popupContent += `
                    <p><strong>Suitability Score:</strong> ${(props.composite_score * 100).toFixed(1)}%</p>
                    <hr>
                    <p><strong>Score Breakdown:</strong></p>
                    <ul>
                        <li>Population Score: ${(props.population_score * 100).toFixed(1)}%</li>
                        <li>Coverage Need Score: ${(props.coverage_score * 100).toFixed(1)}%</li>
                        <li>Density Score: ${(props.density_score * 100).toFixed(1)}%</li>
                    </ul>
                    <button class="select-location-btn" onclick="selectLocation(${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]}, ${rank})">Select This Location</button>
                </div>
            `;
            
            layer.bindPopup(popupContent);
        }
    }).addTo(map);
    
    // Add legend
    addSuitabilityLegend();
    
    // Fit map to suitability layer
    if (suitabilityLayer.getBounds().isValid()) {
        map.fitBounds(suitabilityLayer.getBounds());
    }
}

// Function to get color based on score
function getColorForScore(score) {
    // Score is between 0 and 1
    if (score >= 0.8) return '#4CAF50';      // Green for top scores
    else if (score >= 0.6) return '#8BC34A';  // Light green
    else if (score >= 0.4) return '#CDDC39';  // Lime
    else if (score >= 0.2) return '#FFC107';  // Amber
    else return '#FF9800';                    // Orange for lower scores
}

// Function to add legend
function addSuitabilityLegend() {
    if (suitabilityLegend) {
        map.removeControl(suitabilityLegend);
    }
    
    suitabilityLegend = L.control({position: 'bottomright'});
    
    suitabilityLegend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `
            <h4>Optimal Locations</h4>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #4CAF50; width: 20px; height: 20px; border-radius: 50%; margin-right: 5px;"></div>
                <span>Excellent (80-100%)</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #8BC34A; width: 20px; height: 20px; border-radius: 50%; margin-right: 5px;"></div>
                <span>Very Good (60-80%)</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #CDDC39; width: 20px; height: 20px; border-radius: 50%; margin-right: 5px;"></div>
                <span>Good (40-60%)</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #FFC107; width: 20px; height: 20px; border-radius: 50%; margin-right: 5px;"></div>
                <span>Fair (20-40%)</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #FF9800; width: 20px; height: 20px; border-radius: 50%; margin-right: 5px;"></div>
                <span>Poor (0-20%)</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <div style="background-color: #ff9800; width: 20px; height: 20px; opacity: 0.2; margin-right: 5px;"></div>
                <span>Underserved Areas</span>
            </div>
        `;
        return div;
    };
    
    suitabilityLegend.addTo(map);
}

// Function to clear suitability layers
function clearSuitabilityLayers() {
    if (suitabilityLayer) {
        map.removeLayer(suitabilityLayer);
        suitabilityLayer = null;
    }
    
    if (suitabilityUnderservedLayer) {
        map.removeLayer(suitabilityUnderservedLayer);
        suitabilityUnderservedLayer = null;
    }
    
    if (suitabilityLegend) {
        map.removeControl(suitabilityLegend);
        suitabilityLegend = null;
    }
}

// Function to select a specific location
function selectLocation(lat, lng, rank) {
    // Center map on the selected location
    map.setView([lat, lng], 14);
    
    // You could add more functionality here, like:
    // - Highlighting the selected location
    // - Showing additional details
    // - Adding it to a "selected locations" list
    
    // For now, just show a message
    document.getElementById('analysisStatus').textContent = `Selected optimal location #${rank}`;
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if the button exists before initializing
    if (document.getElementById('analyzeSuitabilityBtn')) {
        initSiteSuitability();
    } else {
        console.log('Site suitability button not found, will initialize when available');
        // Try again when the map is initialized
        document.addEventListener('mapInitialized', function() {
            if (document.getElementById('analyzeSuitabilityBtn')) {
                initSiteSuitability();
            } else {
                console.warn('Site suitability button not found after map initialization');
            }
        });
    }
});

// Add to window object for global access
window.analyzeSuitability = analyzeSuitability;
window.clearSuitabilityLayers = clearSuitabilityLayers;
window.selectLocation = selectLocation;
