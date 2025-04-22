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
    fetch('/maps/api/travel-time-analysis/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            hideLoading();
            
            console.log("Received travel time analysis data from server");
            
            if (data.error) {
                console.error("Server returned error:", data.error);
                throw new Error(data.error);
            }
            
            // Use the 5-minute isochrones as service areas
            const serviceAreas = {
                type: 'FeatureCollection',
                features: data.isochrones.filter(iso => iso.properties.travel_time === 5)
            };
            
            // Add the service areas to the map
            const bufferLayerItem = L.geoJSON(serviceAreas, {
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
                <em>Areas within 5-minute travel time of healthcare facilities</em>
            `);
            
            // Add to buffer layer group
            bufferLayer.addLayer(bufferLayerItem);
            
            // Store the full data for later use
            bufferLayer.travelTimeData = data;
            
            console.log("Added service areas to map");
        })
        .catch(error => {
            console.error('Error fetching travel time analysis:', error);
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
    
    // Get ward data
    const wardsData = wardLayer.toGeoJSON();
    
    if (wardsData.features.length === 0) {
        console.log("No ward data available");
        hideLoading();
        return;
    }
    
    // Check if buffer layer has features
    if (!bufferLayer || bufferLayer.getLayers().length === 0) {
        console.log("No buffer data available - creating service areas first");
        
        // Create service areas then process underserved areas
        createServiceAreas();
        
        // Wait for service areas to be created before continuing
        const checkBufferInterval = setInterval(() => {
            if (bufferLayer.getLayers().length > 0) {
                clearInterval(checkBufferInterval);
                const buffersData = bufferLayer.toGeoJSON();
                processUnderservedAreas(wardsData, buffersData);
            }
        }, 1000);
        
        // Set a timeout to prevent infinite waiting
        setTimeout(() => {
            clearInterval(checkBufferInterval);
            if (bufferLayer.getLayers().length === 0) {
                console.log("Timeout waiting for service areas - using ward centers");
                processUnderservedAreasWithPopulation(wardsData);
            }
        }, 10000);
    } else {
        // Use existing buffer layer
        const buffersData = bufferLayer.toGeoJSON();
        processUnderservedAreas(wardsData, buffersData);
    }
}

// Helper function to process underserved areas
function processUnderservedAreas(wardsData, buffersData) {
    console.log(`Processing ${wardsData.features.length} wards against buffer data`);
    
    // Process each ward to check coverage
    const wardPromises = wardsData.features.map(ward => {
        return new Promise((resolve) => {
            let isUnderserved = true;
            
            // Skip if the ward has no geometry
            if (!ward.geometry) {
                console.log("Ward has no geometry:", ward.properties.ward);
                resolve(null);
                return;
            }
            
            try {
                // Check if this ward intersects with the buffer
                // If buffersData is a FeatureCollection, use the first feature
                let bufferGeometry;
                if (buffersData.type === 'FeatureCollection') {
                    if (buffersData.features.length > 0) {
                        bufferGeometry = buffersData.features[0];
                    } else {
                        console.log("Empty buffer feature collection");
                        resolve(null);
                        return;
                    }
                } else {
                    // Assume it's a single Feature
                    bufferGeometry = buffersData;
                }
                
                if (!bufferGeometry || !bufferGeometry.geometry) {
                    console.log("Invalid buffer geometry");
                    resolve(null);
                    return;
                }
                
                // Use try-catch for the intersection operation as it might fail
                try {
                    const intersection = turf.intersect(ward, bufferGeometry);
                    
                    if (intersection) {
                        // Calculate the area of intersection
                        const intersectionArea = turf.area(intersection);
                        const wardArea = turf.area(ward);
                        
                        // If more than 30% of the ward is covered, it's not underserved
                        if (intersectionArea / wardArea > 0.3) {
                            isUnderserved = false;
                        }
                    }
                } catch (intersectError) {
                    console.error("Error in turf.intersect:", intersectError);
                    // If intersection fails, try a simpler approach
                    try {
                        // Check if the ward center is within the buffer
                        const wardCenter = turf.center(ward);
                        const isWithin = turf.booleanPointInPolygon(
                            wardCenter, 
                            bufferGeometry.geometry.type === 'MultiPolygon' 
                                ? turf.multiPolygon(bufferGeometry.geometry.coordinates)
                                : bufferGeometry
                        );
                        
                        if (isWithin) {
                            isUnderserved = false;
                        }
                    } catch (pointInPolyError) {
                        console.error("Error in point-in-polygon check:", pointInPolyError);
                    }
                }
                
                // If the ward is underserved, get population data and add to layer
                if (isUnderserved) {
                    // Use population density API to get accurate population
                    fetch('/maps/api/population-density-for-area/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ area: ward })
                    })
                    .then(response => response.json())
                    .then(data => {
                        // Get population from API or fallback to ward properties
                        const population = data.estimated_population || ward.properties.pop2009 || 'Unknown';
                        
                        // Create the underserved ward layer
                        const underservedWardLayer = L.geoJSON(ward, {
                            style: {
                                color: "#e74c3c",
                                weight: 2,
                                fillOpacity: 0.3,
                                fillColor: "#e74c3c"
                            }
                        });
                        
                        // Add a popup with population information
                        const wardName = ward.properties.ward;
                        underservedWardLayer.bindPopup(`
                            <strong>Underserved Area: ${wardName}</strong><br>
                            <p><strong>Population:</strong> ${population.toLocaleString()}</p>
                            <p><strong>Area:</strong> ${(data.area_km2 || 0).toFixed(2)} km²</p>
                            <p><strong>Population Density:</strong> ${(data.mean_density || 0).toFixed(0)} people/km²</p>
                            <p><em>This area has limited access to healthcare facilities within 5km</em></p>
                        `);
                        
                        // Add to the underserved layer group
                        underservedLayer.addLayer(underservedWardLayer);
                        resolve(underservedWardLayer);
                    })
                    .catch(error => {
                        console.error("Error fetching population data:", error);
                        
                        // Fallback to basic ward information
                        const underservedWardLayer = L.geoJSON(ward, {
                            style: {
                                color: "#e74c3c",
                                weight: 2,
                                fillOpacity: 0.3,
                                fillColor: "#e74c3c"
                            }
                        });
                        
                        const wardName = ward.properties.ward;
                        const population = ward.properties.pop2009 || 'Unknown';
                        
                        underservedWardLayer.bindPopup(`
                            <strong>Underserved Area: ${wardName}</strong><br>
                            Population (2009): ${population}<br>
                            <em>This area has limited access to healthcare facilities within 5km</em>
                        `);
                        
                        underservedLayer.addLayer(underservedWardLayer);
                        resolve(underservedWardLayer);
                    });
                } else {
                    resolve(null);
                }
            } catch (e) {
                console.error("Error in intersection calculation:", e);
                resolve(null);
            }
        });
    });
    
    // Wait for all ward processing to complete
    Promise.all(wardPromises)
        .then(results => {
            const validResults = results.filter(r => r !== null);
            hideLoading();
            console.log(`Found ${validResults.length} underserved wards`);
        })
        .catch(error => {
            console.error("Error processing underserved areas:", error);
            hideLoading();
        });
}

// Alternative function when buffer data isn't available
function processUnderservedAreasWithPopulation(wardsData) {
    console.log("Processing underserved areas using population density data");
    
    // Get all facilities
    const facilitiesData = facilitiesLayer.toGeoJSON();
    
    // Process each ward
    wardsData.features.forEach(ward => {
        // Skip if the ward has no geometry
        if (!ward.geometry) return;
        
        try {
            // Get the ward center
            const wardCenter = turf.center(ward);
            
            // Check if any facility is within 5km of the ward center
            let hasNearbyFacility = false;
            
            for (const facility of facilitiesData.features) {
                const distance = turf.distance(
                    wardCenter,
                    facility,
                    { units: 'kilometers' }
                );
                
                if (distance <= 5) {
                    hasNearbyFacility = true;
                    break;
                }
            }
            
            // If no nearby facility, mark as underserved
            if (!hasNearbyFacility) {
                // Use population density API to get accurate population
                fetch('/maps/api/population-density-for-area/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ area: ward })
                })
                .then(response => response.json())
                .then(data => {
                    // Create the underserved ward layer
                    const underservedWardLayer = L.geoJSON(ward, {
                        style: {
                            color: "#e74c3c",
                            weight: 2,
                            fillOpacity: 0.3,
                            fillColor: "#e74c3c"
                        }
                    });
                    
                    // Add a popup with population information
                    const wardName = ward.properties.ward;
                    const population = data.estimated_population || ward.properties.pop2009 || 'Unknown';
                    
                    underservedWardLayer.bindPopup(`
                        <strong>Underserved Area: ${wardName}</strong><br>
                        <p><strong>Population:</strong> ${population.toLocaleString()}</p>
                        <p><strong>Area:</strong> ${(data.area_km2 || 0).toFixed(2)} km²</p>
                        <p><strong>Population Density:</strong> ${(data.mean_density || 0).toFixed(0)} people/km²</p>
                        <p><em>This area has no healthcare facilities within 5km</em></p>
                    `);
                    
                    // Add to the underserved layer group
                    underservedLayer.addLayer(underservedWardLayer);
                })
                .catch(error => {
                    console.error("Error fetching population data:", error);
                    
                    // Fallback to basic ward information
                    const underservedWardLayer = L.geoJSON(ward, {
                        style: {
                            color: "#e74c3c",
                            weight: 2,
                            fillOpacity: 0.3,
                            fillColor: "#e74c3c"
                        }
                    });
                    
                    const wardName = ward.properties.ward;
                    const population = ward.properties.pop2009 || 'Unknown';
                    
                    underservedWardLayer.bindPopup(`
                        <strong>Underserved Area: ${wardName}</strong><br>
                        Population (2009): ${population}<br>
                        <em>This area has no healthcare facilities within 5km</em>
                    `);
                    
                    underservedLayer.addLayer(underservedWardLayer);
                });
            }
        } catch (e) {
            console.error("Error processing ward for underserved analysis:", e);
        }
    });
    
    hideLoading();
}

// Function to identify coverage gaps
function identifyCoverageGaps() {
    // Clear previous coverage gaps
    coverageGapLayer.clearLayers();
    
    console.log("Identifying coverage gaps...");
    
    // Show loading indicator
    showLoading('Analyzing coverage gaps...');
    
    // Get ward data
    const wardsData = wardLayer.toGeoJSON();
    
    // Check if buffer layer has features
    if (!bufferLayer || bufferLayer.getLayers().length === 0) {
        console.log("No buffer data available - creating service areas first");
        
        // Create service areas then process coverage gaps
        createServiceAreas();
        
        // Wait for service areas to be created before continuing
        const checkBufferInterval = setInterval(() => {
            if (bufferLayer.getLayers().length > 0) {
                clearInterval(checkBufferInterval);
                const buffersData = bufferLayer.toGeoJSON();
                processCoverageGaps(wardsData, buffersData);
            }
        }, 1000);
        
        // Set a timeout to prevent infinite waiting
        setTimeout(() => {
            clearInterval(checkBufferInterval);
            if (bufferLayer.getLayers().length === 0) {
                console.log("Timeout waiting for service areas - using ward centers");
                hideLoading();
                alert("Could not create service areas. Please try again.");
            }
        }, 10000);
    } else {
        // Use existing buffer layer
        const buffersData = bufferLayer.toGeoJSON();
        processCoverageGaps(wardsData, buffersData);
    }
}

// Helper function to process coverage gaps
function processCoverageGaps(wardsData, buffersData) {
    if (wardsData.features.length === 0) {
        console.log("No ward data available for coverage gap analysis");
        hideLoading();
        return;
    }
    
    // Get the buffer geometry
    let bufferGeometry;
    if (buffersData.type === 'FeatureCollection') {
        if (buffersData.features.length > 0) {
            bufferGeometry = buffersData.features[0];
        } else {
            console.log("Empty buffer feature collection");
            hideLoading();
            return;
        }
    } else {
        // Assume it's a single Feature
        bufferGeometry = buffersData;
    }
    
    if (!bufferGeometry || !bufferGeometry.geometry) {
        console.log("Invalid buffer geometry for coverage gap analysis");
        hideLoading();
        return;
    }
    
    // Process each ward to find gaps
    const wardPromises = wardsData.features.map(ward => {
        return new Promise((resolve) => {
            // Skip if the ward has no geometry
            if (!ward.geometry) {
                resolve(null);
                return;
            }
            
            try {
                // Find the difference between the ward and the buffer
                let difference;
                
                try {
                    difference = turf.difference(ward, bufferGeometry);
                } catch (diffError) {
                    console.error("Error in turf.difference:", diffError);
                    // If difference fails, try a simpler approach
                    resolve(null);
                    return;
                }
                
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
                        
                        // Use population density API to get accurate population for the uncovered area
                        fetch('/maps/api/population-density-for-area/', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ area: difference })
                        })
                        .then(response => response.json())
                        .then(data => {
                            // Get population from API or fallback to ward properties
                            const wardName = ward.properties.ward;
                            const totalPopulation = ward.properties.pop2009 || 'Unknown';
                            
                            // Get the estimated population in the uncovered area
                            const uncoveredPopulation = data.estimated_population || 
                                (totalPopulation !== 'Unknown' 
                                    ? Math.round(totalPopulation * (uncoveredArea / wardArea))
                                    : 'Unknown');
                            
                            // Calculate priority score
                            const priorityScore = calculatePriorityScore(
                                uncoveredPopulation, 
                                uncoveredPercentage
                            );
                            
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
                                <p><strong>Est. Population Affected:</strong> ${uncoveredPopulation.toLocaleString()}</p>
                                <p><strong>Population Density:</strong> ${(data.mean_density || 0).toFixed(0)} people/km²</p>
                                <p><strong>Priority Score:</strong> ${priorityScore}/100</p>
                                <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                            `);
                            
                            // Add to the coverage gap layer group
                            coverageGapLayer.addLayer(gapLayer);
                            resolve(gapLayer);
                        })
                        .catch(error => {
                            console.error("Error fetching population data for gap:", error);
                            
                            // Fallback to proportional calculation
                            const wardName = ward.properties.ward;
                            const totalPopulation = ward.properties.pop2009 || 'Unknown';
                            
                            // Calculate uncovered population proportionally
                            const uncoveredPopulation = totalPopulation !== 'Unknown' 
                                ? Math.round(totalPopulation * (uncoveredArea / wardArea))
                                : 'Unknown';
                            
                            // Calculate priority score
                            const priorityScore = calculatePriorityScore(
                                uncoveredPopulation,
                                uncoveredPercentage
                            );
                            
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
                                <p><strong>Est. Population Affected:</strong> ${uncoveredPopulation.toLocaleString()}</p>
                                <p><strong>Priority Score:</strong> ${priorityScore}/100</p>
                                <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                            `);
                            
                            // Add to the coverage gap layer group
                            coverageGapLayer.addLayer(gapLayer);
                            resolve(gapLayer);
                        });
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            } catch (e) {
                console.error("Error processing ward for coverage gap analysis:", e);
                resolve(null);
            }
        });
    });
    
    // Wait for all ward processing to complete
    Promise.all(wardPromises)
        .then(results => {
            const validResults = results.filter(r => r !== null);
            hideLoading();
            console.log(`Found ${validResults.length} coverage gaps`);
        })
        .catch(error => {
            console.error("Error processing coverage gaps:", error);
            hideLoading();
        });
}

// Helper function to calculate priority score for decision making
function calculatePriorityScore(population, uncoveredPercentage) {
    // Convert population to number if it's a string
    const pop = typeof population === 'string' ? 0 : population;
    
    // Calculate population factor (0-60 points)
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


