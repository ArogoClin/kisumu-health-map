// Create buffer and analysis layers
const bufferLayer = new L.FeatureGroup();
const underservedLayer = new L.FeatureGroup();
const coverageGapLayer = new L.FeatureGroup();

// Function to create service area buffers around facilities
function createServiceAreas() {
    // Clear previous buffers
    bufferLayer.clearLayers();
    
    console.log("Creating service areas...");
    
    // Show loading indicator
    showLoading('Loading service areas...');
    
    // Fetch merged service areas from the server
    fetch('/maps/api/merged-service-areas/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            hideLoading();
            
            console.log("Received merged buffer data from server");
            
            // Add the merged buffer to the map
            const bufferLayerItem = L.geoJSON(data, {
                style: {
                    color: '#27ae60',
                    fillColor: '#2ecc71',
                    fillOpacity: 0.2,
                    weight: 1
                }
            });
            
            // Add a popup explaining this is a service area
            bufferLayerItem.bindPopup(`
                <strong>Healthcare Service Area</strong><br>
                <em>Areas within 5km of healthcare facilities</em>
            `);
            
            // Add to buffer layer group
            bufferLayer.addLayer(bufferLayerItem);
            
            console.log("Added merged buffer to map");
        })
        .catch(error => {
            console.error('Error fetching merged service areas:', error);
            hideLoading();
            
            // Fallback to client-side buffer creation
            console.log("Falling back to client-side buffer creation");
            createClientSideBuffers();
        });
}

// Fallback function for client-side buffer creation
function createClientSideBuffers() {
    console.log("Creating buffers on client-side...");
    
    // Get all facility points as GeoJSON
    const facilitiesData = facilitiesLayer.toGeoJSON();
    
    if (facilitiesData.features.length === 0) {
        console.log("No facilities found to create buffers");
        return;
    }
    
    console.log(`Creating buffers for ${facilitiesData.features.length} facilities`);
    
    // Create 5km buffers around each facility
    facilitiesData.features.forEach(function(facility) {
        try {
            // Create a 5km buffer using turf.js
            const buffer = turf.buffer(facility, 5, {units: 'kilometers'});
            
            // Convert turf.js buffer to Leaflet layer
            const bufferLayerItem = L.geoJSON(buffer, {
                style: {
                    color: '#27ae60',
                    fillColor: '#2ecc71',
                    fillOpacity: 0.2,
                    weight: 1
                }
            });
            
            // Add facility information to buffer popup
            const facilityName = facility.properties.name;
            const facilityType = facility.properties.facility_type;
            bufferLayerItem.bindPopup(`
                <strong>${facilityName}</strong><br>
                Type: ${facilityType}<br>
                Service Area: 5km radius
            `);
            
            // Add to buffer layer group
            bufferLayer.addLayer(bufferLayerItem);
        } catch (e) {
            console.error("Error creating buffer for facility:", facility.properties.name, e);
        }
    });
    console.log(`Created ${bufferLayer.getLayers().length} buffer layers`);
}

// Function to identify underserved areas
function identifyUnderservedAreas() {
    // Clear previous underserved areas
    underservedLayer.clearLayers();
    
    console.log("Identifying underserved areas...");
    
    // Show loading indicator
    showLoading('Analyzing underserved areas...');
    
    // Get ward data and buffer data
    const wardsData = wardLayer.toGeoJSON();
    const buffersData = bufferLayer.toGeoJSON();
    
    if (wardsData.features.length === 0) {
        console.log("No ward data available");
        hideLoading();
        return;
    }
    
    if (buffersData.features.length === 0) {
        console.log("No buffer data available");
        hideLoading();
        return;
    }
    
    console.log(`Processing ${wardsData.features.length} wards against ${buffersData.features.length} buffers`);
    
    // Process each ward to check coverage
    wardsData.features.forEach(function(ward) {
        let isUnderserved = true;
        
        // Skip if the ward has no geometry
        if (!ward.geometry) {
            console.log("Ward has no geometry:", ward.properties.ward);
            return;
        }
        
        // Check if this ward intersects with any facility buffer
        for (let i = 0; i < buffersData.features.length; i++) {
            const buffer = buffersData.features[i];
            
            // Skip if the buffer has no geometry
            if (!buffer.geometry) continue;
            
            try {
                const intersection = turf.intersect(ward, buffer);
                if (intersection) {
                    // Calculate the area of intersection
                    const intersectionArea = turf.area(intersection);
                    const wardArea = turf.area(ward);
                    
                    // If more than 30% of the ward is covered, it's not underserved
                    if (intersectionArea / wardArea > 0.3) {
                        isUnderserved = false;
                        break;
                    }
                }
            } catch (e) {
                console.error("Error in intersection calculation:", e);
            }
        }
        
        // If the ward is underserved, add it to the underserved layer
        if (isUnderserved) {
            try {
                console.log("Found underserved ward:", ward.properties.ward);
                
                // Add to underserved layer with styling
                const underservedWardLayer = L.geoJSON(ward, {
                    style: {
                        color: "#e74c3c",
                        weight: 2,
                        fillOpacity: 0.3,
                        fillColor: "#e74c3c"
                    }
                });
                
                // Add a popup explaining this is an underserved area
                const wardName = ward.properties.ward;
                const population = ward.properties.pop2009;
                
                underservedWardLayer.bindPopup(`
                    <strong>Underserved Area: ${wardName}</strong><br>
                    Population (2009): ${population || 'N/A'}<br>
                    <em>This area has limited access to healthcare facilities within 5km</em>
                `);
                
                // Add to the underserved layer group
                underservedLayer.addLayer(underservedWardLayer);
            } catch (e) {
                console.error("Error adding underserved ward to layer:", e);
            }
        }
    });
    
    hideLoading();
    console.log(`Found ${underservedLayer.getLayers().length} underserved wards`);
}

// Function to identify coverage gaps
function identifyCoverageGaps() {
    // Clear previous coverage gaps
    coverageGapLayer.clearLayers();
    
    console.log("Identifying coverage gaps...");
    
    // Show loading indicator
    showLoading('Analyzing coverage gaps...');
    
    // Get ward data and buffer data
    const wardsData = wardLayer.toGeoJSON();
    const buffersData = bufferLayer.toGeoJSON();
    
    if (wardsData.features.length === 0 || buffersData.features.length === 0) {
        console.log("Missing data for coverage gap analysis");
        hideLoading();
        return;
    }
    
    // Since we're now using a merged buffer from the server, we don't need to combine them again
    // The buffersData should already contain the merged buffer
    
    // Process each ward to find gaps
    wardsData.features.forEach(function(ward) {
        // Skip if the ward has no geometry
        if (!ward.geometry) return;
        
        try {
            // Find the difference between the ward and the buffer
            // Since buffersData should now be a single merged feature, we can use the first feature
            const buffer = buffersData.features[0];
            
            if (!buffer) {
                console.log("No buffer data available for difference operation");
                return;
            }
            
            // Find the difference between the ward and the buffer
            const difference = turf.difference(ward, buffer);
            
            // If there's a difference and it has significant area
            if (difference) {
                // Calculate what percentage of the ward is uncovered
                const wardArea = turf.area(ward);
                const uncoveredArea = turf.area(difference);
                const uncoveredPercentage = (uncoveredArea / wardArea) * 100;
                
                // Only consider it a gap if more than 40% is uncovered
                if (uncoveredPercentage > 40) {
                    console.log("Found coverage gap in ward:", ward.properties.ward,
                                "Uncovered:", uncoveredPercentage.toFixed(1) + "%");
                    
                    // Get population data
                    const population = ward.properties.pop2009 || 'Unknown';
                    const wardName = ward.properties.ward;
                    
                    // Estimate uncovered population (simple proportion)
                    const estimatedUncoveredPopulation =
                        population !== 'Unknown'
                            ? Math.round(population * (uncoveredArea / wardArea))
                            : 'Unknown';
                    
                    // Calculate priority score
                    const priorityScore = calculatePriorityScore(population, uncoveredPercentage);
                    
                    // Add to coverage gap layer with styling
                    const gapLayer = L.geoJSON(difference, {
                        style: {
                            color: "#9b59b6",
                            weight: 2,
                            fillOpacity: 0.4,
                            fillColor: "#8e44ad"
                        }
                    });
                    
                    // Add popup with information
                    gapLayer.bindPopup(`
                        <strong>Coverage Gap: ${wardName}</strong><br>
                        <p><strong>Uncovered Area:</strong> ${Math.round(uncoveredPercentage)}% of ward</p>
                        <p><strong>Est. Population Affected:</strong> ${estimatedUncoveredPopulation}</p>
                        <p><strong>Priority Score:</strong> ${priorityScore}/100</p>
                        <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                    `);
                    
                    // Add to the coverage gap layer group
                    coverageGapLayer.addLayer(gapLayer);
                }
            }
        } catch (e) {
            console.error("Error calculating coverage gap for ward:", ward.properties.ward, e);
        }
    });
    
    hideLoading();
    console.log(`Found ${coverageGapLayer.getLayers().length} coverage gaps`);
}

// Helper function to calculate priority score for decision making
function calculatePriorityScore(population, uncoveredPercentage) {
    // Convert population to number if it's a string
    const pop = typeof population === 'string' ? 0 : population;
    
    // Calculate population density factor (0-60 points)
    // Higher population gets higher priority
    let populationFactor = 0;
    if (pop > 0) {
        if (pop < 5000) populationFactor = 20;
        else if (pop < 10000) populationFactor = 30;
        else if (pop < 20000) populationFactor = 40;
        else if (pop < 30000) populationFactor = 50;
        else populationFactor = 60;
    }
    
    // Calculate coverage factor (0-40 points)
    // Higher uncovered percentage gets higher priority
    const coverageFactor = Math.min(40, Math.round(uncoveredPercentage * 0.4));
    
    // Combined score (0-100)
    return Math.min(100, populationFactor + coverageFactor);
}

// Helper function to generate recommendations based on priority score
function getRecommendation(score) {
    if (score >= 80) {
        return "High priority for new healthcare facility";
    } else if (score >= 60) {
        return "Consider mobile clinic deployment";
    } else if (score >= 40) {
        return "Evaluate for outreach services";
    } else {
        return "Monitor access metrics";
    }
}

// Helper functions for loading indicator
function showLoading(message) {
    // Create loading div if it doesn't exist
    if (!document.getElementById('loadingIndicator')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingIndicator';
        loadingDiv.style.position = 'absolute';
        loadingDiv.style.top = '50%';
        loadingDiv.style.left = '50%';
        loadingDiv.style.transform = 'translate(-50%, -50%)';
        loadingDiv.style.padding = '15px';
        loadingDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        loadingDiv.style.color = 'white';
        loadingDiv.style.borderRadius = '5px';
        loadingDiv.style.zIndex = '1000';
        document.body.appendChild(loadingDiv);
    }
    
    // Update message
    document.getElementById('loadingIndicator').textContent = message;
    document.getElementById('loadingIndicator').style.display = 'block';
}

function hideLoading() {
    const loadingDiv = document.getElementById('loadingIndicator');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// Add event listeners for the controls
document.getElementById('bufferToggle').addEventListener('change', function(e) {
    if (e.target.checked) {
        console.log("Buffer toggle checked");
        createServiceAreas();
        map.addLayer(bufferLayer);
    } else {
        console.log("Buffer toggle unchecked");
        map.removeLayer(bufferLayer);
    }
});

document.getElementById('underservedToggle').addEventListener('change', function(e) {
    if (e.target.checked) {
        console.log("Underserved toggle checked");
        
        // We need service areas to identify underserved areas
        if (!map.hasLayer(bufferLayer)) {
            createServiceAreas();
            map.addLayer(bufferLayer);
            document.getElementById('bufferToggle').checked = true;
        }
        
        identifyUnderservedAreas();
        map.addLayer(underservedLayer);
    } else {
        console.log("Underserved toggle unchecked");
        map.removeLayer(underservedLayer);
    }
});

document.getElementById('coverageGapToggle').addEventListener('change', function(e) {
    if (e.target.checked) {
        console.log("Coverage gap toggle checked");
        
        // We need service areas to identify coverage gaps
        if (!map.hasLayer(bufferLayer)) {
            createServiceAreas();
            map.addLayer(bufferLayer);
            document.getElementById('bufferToggle').checked = true;
        }
        
        identifyCoverageGaps();
        map.addLayer(coverageGapLayer);
    } else {
        console.log("Coverage gap toggle unchecked");
        map.removeLayer(coverageGapLayer);
    }
});

