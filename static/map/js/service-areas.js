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
            
            console.log("Received merged service areas data from server");
            
            if (data.error) {
                console.error("Server returned error:", data.error);
                throw new Error(data.error);
            }
            
            // Add the merged service areas to the map
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
                <strong>Healthcare Service Areas</strong><br>
                <em>Areas within service range of healthcare facilities</em><br>
                <small>Buffer sizes vary by facility type:</small>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Hospitals: 10-15km</li>
                    <li>Health Centers: 3-7km</li>
                    <li>Clinics: 5km</li>
                </ul>
            `);
            
            // Add to buffer layer group
            bufferLayer.addLayer(bufferLayerItem);
            
            // Store the full data for later use
            bufferLayer.serviceAreaData = data;
            
            console.log("Added service areas to map");
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
    
    // Define buffer sizes for different facility types (in km)
    const bufferSizes = {
        'District Hospital': 10.0,
        'Povincial General Hospital': 15.0,
        'Medical Clinic': 5.0,
        'Other Hospital': 5.0,
        'Sub-District Hospital': 6.0,
        'Health Center': 3.0,
        'Health Centre': 7.0,
        'Medical Center': 6.0,
        'Faith Based Facility': 6.0,
        'Stand-alone': 3.0,
        'Other': 5.0
    };
    
    // Create appropriate buffers around each facility
    facilitiesData.features.forEach(function(facility) {
        try {
            // Get buffer size based on facility type
            const facilityType = facility.properties.facility_type;
            const bufferSize = bufferSizes[facilityType] || 5.0; // Default to 5km
            
            // Create a buffer using turf.js
            const buffer = turf.buffer(facility, bufferSize, {units: 'kilometers'});
            
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
            bufferLayerItem.bindPopup(`
                <strong>${facilityName}</strong><br>
                Type: ${facilityType}<br>
                Service Area: ${bufferSize}km radius
            `);
            
            // Add to buffer layer group
            bufferLayer.addLayer(bufferLayerItem);
        } catch (e) {
            console.error("Error creating buffer for facility:", facility.properties.name, e);
        }
    });
    
    console.log(`Created ${bufferLayer.getLayers().length} buffer layers`);
    
    // Try to merge the buffers client-side
    try {
        mergeClientSideBuffers();
    } catch (e) {
        console.error("Error merging client-side buffers:", e);
    }
}

// Function to merge client-side buffers
function mergeClientSideBuffers() {
    // Only attempt if we have turf.js available
    if (typeof turf === 'undefined') {
        console.log("Turf.js not available for merging buffers");
        return;
    }
    
    console.log("Attempting to merge buffers client-side");
    
    // Get all buffer features
    const bufferFeatures = [];
    bufferLayer.eachLayer(layer => {
        if (layer.toGeoJSON) {
            const geojson = layer.toGeoJSON();
            if (geojson.type === 'FeatureCollection') {
                bufferFeatures.push(...geojson.features);
            } else {
                bufferFeatures.push(geojson);
            }
        }
    });
    
    if (bufferFeatures.length <= 1) {
        console.log("Not enough buffers to merge");
        return;
    }
    
    try {
        // Create a feature collection
        const featureCollection = {
            type: 'FeatureCollection',
            features: bufferFeatures
        };
        
        // Use turf.union to merge all polygons
        // We need to reduce the collection to a single feature
        let merged = featureCollection.features[0];
        
        for (let i = 1; i < featureCollection.features.length; i++) {
            try {
                merged = turf.union(merged, featureCollection.features[i]);
            } catch (e) {
                console.error(`Error merging buffer ${i}:`, e);
            }
        }
        
        // Clear existing buffers
        bufferLayer.clearLayers();
        
        // Add the merged buffer
        const mergedLayer = L.geoJSON(merged, {
            style: {
                color: '#27ae60',
                fillColor: '#2ecc71',
                fillOpacity: 0.2,
                weight: 1
            }
        });
        
        mergedLayer.bindPopup(`
            <strong>Merged Service Areas</strong><br>
            <em>Combined service areas for all healthcare facilities</em>
        `);
        
        bufferLayer.addLayer(mergedLayer);
        console.log("Successfully merged buffers client-side");
    } catch (e) {
        console.error("Failed to merge buffers client-side:", e);
    }
}

// Function to identify underserved areas
function identifyUnderservedAreas() {
    // Clear previous underserved areas
    underservedLayer.clearLayers();
    
    console.log("Identifying underserved areas...");
    
    // Show loading indicator
    showLoading('Analyzing underserved areas...');
    
    // Use the site suitability analysis endpoint to get underserved areas
    fetch('/maps/api/site-suitability-analysis/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            hideLoading();
            
            if (data.error) {
                console.error("Server returned error:", data.error);
                throw new Error(data.error);
            }
            
            console.log("Received site suitability analysis data");
            
            // Add the underserved area to the map
            if (data.underserved_area) {
                const underservedAreaLayer = L.geoJSON(data.underserved_area, {
                    style: {
                        color: "#e74c3c",
                        weight: 2,
                        fillOpacity: 0.3,
                        fillColor: "#e74c3c"
                    }
                });
                
                underservedAreaLayer.bindPopup(`
                    <strong>Underserved Areas</strong><br>
                    <p>Areas outside the service range of existing healthcare facilities</p>
                    <p><em>These areas may benefit from new healthcare facilities</em></p>
                `);
                
                underservedLayer.addLayer(underservedAreaLayer);
                
                // Also add the top recommended locations
                if (data.features && data.features.length > 0) {
                    // Create a layer for the recommended locations
                    const recommendedLocationsLayer = L.geoJSON(data, {
                        pointToLayer: function(feature, latlng) {
                            return L.circleMarker(latlng, {
                                radius: 8,
                                fillColor: "#f39c12",
                                color: "#d35400",
                                weight: 2,
                                opacity: 1,
                                fillOpacity: 0.8
                            });
                        },
                        onEachFeature: function(feature, layer) {
                            if (feature.properties) {
                                const props = feature.properties;
                                layer.bindPopup(`
                                    <strong>Recommended Facility Location #${props.rank}</strong><br>
                                    <p><strong>Ward:</strong> ${props.ward || 'Unknown'}</p>
                                    <p><strong>Population Served:</strong> ${props.population_served.toLocaleString()}</p>
                                    <p><strong>Area Coverage:</strong> ${props.area_km2.toFixed(2)} km²</p>
                                    <p><strong>Suitability Score:</strong> ${props.composite_score * 100}/100</p>
                                    <p><strong>Recommended Facility Type:</strong> ${props.facility_type}</p>
                                `);
                            }
                        }
                    });
                    
                    underservedLayer.addLayer(recommendedLocationsLayer);
                }
                
                console.log("Added underserved areas and recommended locations to map");
            } else {
                console.log("No underserved areas found");
                alert("No underserved areas found. The entire county appears to be within service range of existing facilities.");
            }
            
            // Add summary information if available
            if (data.summary) {
                console.log("Analysis summary:", data.summary);
            }
        })
        .catch(error => {
            console.error('Error fetching underserved areas:', error);
            hideLoading();
            
            // Fallback to ward-based analysis
            console.log("Falling back to ward-based underserved analysis");
            processUnderservedAreasWithWards();
        });
}

// Fallback function for ward-based underserved area analysis
function processUnderservedAreasWithWards() {
    console.log("Processing underserved areas using ward data");
    
    // Get ward data
    const wardsData = wardLayer.toGeoJSON();
    
    if (wardsData.features.length === 0) {
        console.log("No ward data available");
        return;
    }
    
    // Check if buffer layer has features
    if (!bufferLayer || bufferLayer.getLayers().length === 0) {
        console.log("No buffer data available - creating service areas first");
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
                                                const isWithinBuffer = turf.booleanPointInPolygon(
                                                    wardCenter.geometry.coordinates, 
                                                    bufferGeometry.geometry
                                                );
                                                
                                                if (isWithinBuffer) {
                                                    isUnderserved = false;
                                                }
                                            } catch (e) {
                                                console.error("Error in fallback intersection check:", e);
                                            }
                                        }
                                        
                                        // If this ward is underserved, add it to the underserved layer
                                        if (isUnderserved) {
                                            console.log("Found underserved ward:", ward.properties.ward);
                                            
                                            // Use population density API to get accurate population data
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
                                                const wardName = ward.properties.ward;
                                                const wardPopulation = data.estimated_population || ward.properties.pop2009 || 'Unknown';
                                                const wardDensity = data.mean_density || 'Unknown';
                                                
                                                // Calculate priority score
                                                const priorityScore = calculatePriorityScore(
                                                    wardPopulation,
                                                    100 // 100% underserved
                                                );
                                                
                                                // Add to underserved layer with styling
                                                const underservedWardLayer = L.geoJSON(ward, {
                                                    style: {
                                                        color: "#e74c3c",
                                                        weight: 2,
                                                        fillOpacity: 0.3,
                                                        fillColor: "#e74c3c"
                                                    }
                                                });
                                                
                                                // Add popup with information
                                                underservedWardLayer.bindPopup(`
                                                    <strong>Underserved Area: ${wardName}</strong><br>
                                                    <p><strong>Population:</strong> ${wardPopulation.toLocaleString()}</p>
                                                    <p><strong>Population Density:</strong> ${(wardDensity !== 'Unknown' ? wardDensity.toFixed(0) : 'Unknown')} people/km²</p>
                                                    <p><strong>Priority Score:</strong> ${priorityScore}/100</p>
                                                    <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                                                `);
                                                
                                                // Add to the underserved layer group
                                                underservedLayer.addLayer(underservedWardLayer);
                                                resolve(underservedWardLayer);
                                            })
                                            .catch(error => {
                                                console.error("Error fetching population data:", error);
                                                
                                                // Fallback to ward properties
                                                const wardName = ward.properties.ward;
                                                const wardPopulation = ward.properties.pop2009 || 'Unknown';
                                                
                                                // Calculate priority score
                                                const priorityScore = calculatePriorityScore(
                                                    wardPopulation,
                                                    100 // 100% underserved
                                                );
                                                
                                                // Add to underserved layer with styling
                                                const underservedWardLayer = L.geoJSON(ward, {
                                                    style: {
                                                        color: "#e74c3c",
                                                        weight: 2,
                                                        fillOpacity: 0.3,
                                                        fillColor: "#e74c3c"
                                                    }
                                                });
                                                
                                                // Add popup with information
                                                underservedWardLayer.bindPopup(`
                                                    <strong>Underserved Area: ${wardName}</strong><br>
                                                    <p><strong>Population:</strong> ${wardPopulation.toLocaleString()}</p>
                                                    <p><strong>Priority Score:</strong> ${priorityScore}/100</p>
                                                    <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                                                `);
                                                
                                                // Add to the underserved layer group
                                                underservedLayer.addLayer(underservedWardLayer);
                                                resolve(underservedWardLayer);
                                            });
                                        } else {
                                            resolve(null);
                                        }
                                    } catch (e) {
                                        console.error("Error processing ward for underserved analysis:", e);
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
                        
                        // Function to process underserved areas using population data
                        function processUnderservedAreasWithPopulation(wardsData) {
                            console.log("Processing underserved areas using population data");
                            
                            // Process each ward based on population density
                            const wardPromises = wardsData.features.map(ward => {
                                return new Promise((resolve) => {
                                    // Skip if the ward has no geometry
                                    if (!ward.geometry) {
                                        resolve(null);
                                        return;
                                    }
                                    
                                    try {
                                        // Use population density API to get population data
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
                                            const wardName = ward.properties.ward;
                                            const wardPopulation = data.estimated_population || ward.properties.pop2009 || 0;
                                            const wardDensity = data.mean_density || 0;
                                            
                                            // Calculate a priority score based on population and density
                                            // Higher population and density = higher priority
                                            const populationScore = Math.min(60, wardPopulation / 1000);
                                            const densityScore = Math.min(40, wardDensity / 25);
                                            const priorityScore = Math.min(100, populationScore + densityScore);
                                            
                                            // Only show wards with high priority scores
                                            if (priorityScore > 40) {
                                                // Add to underserved layer with styling
                                                const underservedWardLayer = L.geoJSON(ward, {
                                                    style: {
                                                        color: "#e74c3c",
                                                        weight: 2,
                                                        fillOpacity: 0.3,
                                                        fillColor: "#e74c3c"
                                                    }
                                                });
                                                
                                                // Add popup with information
                                                underservedWardLayer.bindPopup(`
                                                    <strong>Potential Underserved Area: ${wardName}</strong><br>
                                                    <p><strong>Population:</strong> ${wardPopulation.toLocaleString()}</p>
                                                    <p><strong>Population Density:</strong> ${wardDensity.toFixed(0)} people/km²</p>
                                                    <p><strong>Priority Score:</strong> ${priorityScore.toFixed(0)}/100</p>
                                                    <p><em>Recommendation: ${getRecommendation(priorityScore)}</em></p>
                                                `);
                                                
                                                // Add to the underserved layer group
                                                underservedLayer.addLayer(underservedWardLayer);
                                                resolve(underservedWardLayer);
                                            } else {
                                                resolve(null);
                                            }
                                        })
                                        .catch(error => {
                                            console.error("Error fetching population data:", error);
                                            resolve(null);
                                        });
                                    } catch (e) {
                                        console.error("Error processing ward for population analysis:", e);
                                        resolve(null);
                                    }
                                });
                            });
                            
                            // Wait for all ward processing to complete
                            Promise.all(wardPromises)
                                .then(results => {
                                    const validResults = results.filter(r => r !== null);
                                    hideLoading();
                                    console.log(`Found ${validResults.length} potential underserved wards based on population`);
                                })
                                .catch(error => {
                                    console.error("Error processing population-based underserved areas:", error);
                                    hideLoading();
                                });
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
                            
                            if (wardsData.features.length === 0) {
                                console.log("No ward data available for coverage gap analysis");
                                hideLoading();
                                return;
                            }
                            
                            // Check if buffer layer has features
                            if (!bufferLayer || bufferLayer.getLayers().length === 0) {
                                console.log("No buffer data available - creating service areas first");
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
                                        console.log("Timeout waiting for service areas");
                                        hideLoading();
                                        alert("Could not create service areas for coverage gap analysis.");
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
document.addEventListener('DOMContentLoaded', function() {
    // Buffer toggle
    const bufferToggle = document.getElementById('bufferToggle');
    if (bufferToggle) {
        bufferToggle.addEventListener('change', function(e) {
            if (e.target.checked) {
                console.log("Buffer toggle checked");
                createServiceAreas();
                map.addLayer(bufferLayer);
            } else {
                console.log("Buffer toggle unchecked");
                map.removeLayer(bufferLayer);
            }
        });
    }
    
    // Underserved toggle
    const underservedToggle = document.getElementById('underservedToggle');
    if (underservedToggle) {
        underservedToggle.addEventListener('change', function(e) {
            if (e.target.checked) {
                console.log("Underserved toggle checked");
                
                // We need service areas to identify underserved areas
                if (!map.hasLayer(bufferLayer)) {
                    createServiceAreas();
                    map.addLayer(bufferLayer);
                    if (bufferToggle) bufferToggle.checked = true;
                }
                
                identifyUnderservedAreas();
                map.addLayer(underservedLayer);
            } else {
                console.log("Underserved toggle unchecked");
                map.removeLayer(underservedLayer);
            }
        });
    }
    
    // Coverage gap toggle
    const coverageGapToggle = document.getElementById('coverageGapToggle');
    if (coverageGapToggle) {
        coverageGapToggle.addEventListener('change', function(e) {
            if (e.target.checked) {
                console.log("Coverage gap toggle checked");
                
                // We need service areas to identify coverage gaps
                if (!map.hasLayer(bufferLayer)) {
                    createServiceAreas();
                    map.addLayer(bufferLayer);
                    if (bufferToggle) bufferToggle.checked = true;
                }
                
                identifyCoverageGaps();
                map.addLayer(coverageGapLayer);
            } else {
                console.log("Coverage gap toggle unchecked");
                map.removeLayer(coverageGapLayer);
            }
        });
    }
});

// Debug function to inspect layers
function debugLayer(layer, name) {
    if (!layer) {
        console.log(`Layer ${name} is undefined`);
        return;
    }
    
    console.log(`Layer ${name}:`, layer);
    console.log(`- Has ${layer.getLayers().length} sublayers`);
    
    if (layer.getBounds) {
        try {
            const bounds = layer.getBounds();
            console.log(`- Bounds: ${JSON.stringify(bounds)}`);
        } catch (e) {
            console.log(`- No bounds available: ${e.message}`);
        }
    }
}

// Debug function to inspect all layers
function debugInspectLayers() {
    console.log("=== DEBUG: INSPECTING LAYERS ===");
    
    // Inspect map layers
    console.log("Map has the following layers:");
    map.eachLayer(function(layer) {
        console.log(" - Layer:", layer);
    });
    
    // Inspect our specific layers
    debugLayer(bufferLayer, "Buffer Layer");
    debugLayer(underservedLayer, "Underserved Layer");
    debugLayer(coverageGapLayer, "Coverage Gap Layer");
    debugLayer(wardLayer, "Ward Layer");
    debugLayer(facilityLayer, "Facility Layer");
    
    console.log("=== END DEBUG ===");
}
