// Global variable for the needs analysis layer
let needsLayer = null;

// Function to analyze healthcare needs based on population density and coverage gaps
async function analyzeHealthcareNeeds() {
    // Show status message
    const statusDiv = document.getElementById('analysisStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = 'Analyzing healthcare needs...';
    
    try {
        // Ensure we have both population data and coverage analysis
        if (!populationLayer || !coverageGapLayer.getLayers().length) {
            alert("Please enable both population density and coverage gaps layers first");
            return null;
        }
        
        // Create a new layer for healthcare needs assessment
        const needsLayer = new L.FeatureGroup();
        
        // Get all coverage gaps
        const gaps = coverageGapLayer.getLayers();
        console.log(`Analyzing ${gaps.length} coverage gaps with population density`);
        
        // Process each gap
        for (const gapLayer of gaps) {
            // Get the gap's GeoJSON
            const gapGeoJSON = gapLayer.toGeoJSON();
            
            // Extract properties from the original gap
            const properties = gapLayer.feature ? gapLayer.feature.properties : {};
            
            // Get popup content if available
            let popupContent = '';
            if (gapLayer.getPopup()) {
                popupContent = gapLayer.getPopup().getContent();
                
                // Extract uncovered percentage from popup if not in properties
                if (!properties.uncoveredPercentage) {
                    const match = popupContent.match(/Uncovered Area:\s*(\d+)%/);
                    if (match && match[1]) {
                        properties.uncoveredPercentage = parseInt(match[1]);
                    }
                }
                
                // Extract ward name if not in properties
                if (!properties.ward) {
                    const wardMatch = popupContent.match(/Coverage Gap:\s*([^<]+)/);
                    if (wardMatch && wardMatch[1]) {
                        properties.ward = wardMatch[1].trim();
                    }
                }
            }
            
            // Calculate average population density within this gap
            statusDiv.innerHTML = `Analyzing area: ${properties.ward || 'Unknown'}...`;
            const avgDensity = await estimatePopulationDensityInArea(gapGeoJSON);
            
            // Calculate priority score based on both coverage and population
            const priorityScore = calculateCombinedPriorityScore(properties, avgDensity);
            
            // Determine color based on priority score
            const color = getPriorityColor(priorityScore);
            
            // Create a new layer with styling based on priority
            const needLayer = L.geoJSON(gapGeoJSON, {
                style: {
                    color: color.border,
                    fillColor: color.fill,
                    weight: 2,
                    fillOpacity: 0.6,
                    opacity: 0.8
                }
            });
            
            // Create enhanced popup with population density information
            const enhancedPopup = createEnhancedPopup(properties, avgDensity, priorityScore);
            needLayer.bindPopup(enhancedPopup);
            
            // Add to the needs layer
            needsLayer.addLayer(needLayer);
        }
        
        // Update status
        statusDiv.innerHTML = `Analysis complete: ${needsLayer.getLayers().length} areas analyzed`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
        
        // Add the needs layer to the map
        map.addLayer(needsLayer);
        
        // Return the layer
        return needsLayer;
    } catch (error) {
        console.error("Error in healthcare needs analysis:", error);
        statusDiv.innerHTML = "Error during analysis. See console for details.";
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
        return null;
    }
}

// Estimate population density in a given area using the backend API
async function estimatePopulationDensityInArea(geojson) {
    try {
        console.log("Processing GeoJSON:", geojson);
        
        // Handle FeatureCollection by extracting the first feature
        let processedGeojson = geojson;
        if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length > 0) {
            console.log("Converting FeatureCollection to Feature");
            processedGeojson = geojson.features[0];
        }
        
        // Make sure we have a valid GeoJSON feature
        if (!processedGeojson || !processedGeojson.geometry) {
            console.error("Invalid GeoJSON after processing:", processedGeojson);
            throw new Error("Invalid GeoJSON object");
        }
        
        // Now try to send the processed GeoJSON to the API
        const response = await fetch('/maps/api/population-density-for-area/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                area: processedGeojson
            })
        });
        
        if (!response.ok) {
            // Try to get error details
            let errorDetails = "Unknown error";
            try {
                const errorData = await response.json();
                errorDetails = errorData.error || errorDetails;
            } catch (e) {
                // If we can't parse the error response, use the status text
                errorDetails = response.statusText;
            }
            
            console.error(`API error (${response.status}):`, errorDetails);
            throw new Error(`API error: ${response.status} - ${errorDetails}`);
        }
        
        const data = await response.json();
        console.log("API response:", data);
        
        // Determine density category based on percentiles
        let densityCategory;
        if (data.mean_density < data.percentile_25) {
            densityCategory = "Very Low";
        } else if (data.mean_density < data.percentile_50) {
            densityCategory = "Low";
        } else if (data.mean_density < data.percentile_75) {
            densityCategory = "Medium";
        } else if (data.mean_density < data.percentile_90) {
            densityCategory = "High";
        } else {
            densityCategory = "Very High";
        }
        
        return {
            density: data.mean_density,
            densityCategory: densityCategory,
            minDensity: data.min_density,
            maxDensity: data.max_density,
            medianDensity: data.median_density,
            areaKm2: data.area_km2,
            estimatedPopulation: data.estimated_population,
            year: data.year
        };
    } catch (error) {
        console.error("Error estimating population density:", error);
        
        // Fallback to simplified estimation if API fails
        return simplifiedDensityEstimation(geojson);
    }
}

// Fallback function in case the API call fails
function simplifiedDensityEstimation(geojson) {
    console.log("Using simplified density estimation");
    
    // Handle FeatureCollection by extracting the first feature
    let processedGeojson = geojson;
    if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length > 0) {
        processedGeojson = geojson.features[0];
    }
    try {
        // Get the center point of the area
        const center = turf.center(processedGeojson);
        const centerPoint = [center.geometry.coordinates[1], center.geometry.coordinates[0]]; // [lat, lng]
        
        // Calculate area in square kilometers
        const areaKm2 = turf.area(processedGeojson) / 1000000; // Convert m² to km²
        
        // Estimate density based on global values and distance from map center
        let estimatedDensity = 0;
        
        if (globalMin !== null && globalMax !== null) {
            // Get map center
            const mapCenter = map.getCenter();
            
            // Calculate distance from center (simplified)
            const distance = Math.sqrt(
                Math.pow(centerPoint[0] - mapCenter.lat, 2) + 
                Math.pow(centerPoint[1] - mapCenter.lng, 2)
            );
            
            // Normalize distance (0-1 scale, where 0 is center and 1 is far)
            const normalizedDistance = Math.min(1, distance * 20);
            
            // Areas closer to center typically have higher density
            const densityFactor = 1 - (normalizedDistance * 0.7);
            
            // Calculate estimated density
            estimatedDensity = globalMin + ((globalMax - globalMin) * densityFactor);
            
            // Adjust based on area size (smaller areas often have higher density)
            const areaSizeFactor = Math.max(0.5, Math.min(1.5, 10 / areaKm2));
            estimatedDensity *= areaSizeFactor;
            
            // Ensure within bounds
            estimatedDensity = Math.max(globalMin, Math.min(globalMax, estimatedDensity));
        } else {
            // Fallback if no global values
            estimatedDensity = 500;
        }
        
        return {
            density: estimatedDensity,
            densityCategory: "Unknown (Estimated)",
            minDensity: estimatedDensity * 0.5,
            maxDensity: estimatedDensity * 1.5,
            medianDensity: estimatedDensity,
            areaKm2: areaKm2,
            estimatedPopulation: Math.round(estimatedDensity * areaKm2),
            year: "Unknown"
        };
    } catch (error) {
        console.error("Error in simplified estimation:", error);
        
        // Provide fallback values if something goes wrong
        return {
            density: 500,
            densityCategory: "Medium (Estimated)",
            minDensity: 100,
            maxDensity: 1000,
            medianDensity: 500,
            areaKm2: 10,
            estimatedPopulation: 5000,
            year: "Estimated"
        };
    }
}

// Calculate combined priority score
function calculateCombinedPriorityScore(properties, densityInfo) {
    // Extract existing priority score if available
    let existingScore = 50; // Default medium
    
    // Try to extract from properties
    if (properties.priorityScore) {
        existingScore = properties.priorityScore;
    } else if (properties.uncoveredPercentage) {
        // Calculate from uncovered percentage
        existingScore = Math.min(100, Math.round(properties.uncoveredPercentage));
    }
    
    // Calculate density factor (0-100)
    let densityFactor = 50; // Default medium
    
    if (densityInfo.densityCategory === "Very Low") densityFactor = 20;
    else if (densityInfo.densityCategory === "Low") densityFactor = 40;
    else if (densityInfo.densityCategory === "Medium") densityFactor = 60;
    else if (densityInfo.densityCategory === "High") densityFactor = 80;
    else if (densityInfo.densityCategory === "Very High") densityFactor = 100;
    
    // Calculate population factor based on estimated population
    let populationFactor = 50; // Default medium
    
    if (densityInfo.estimatedPopulation < 1000) populationFactor = 20;
    else if (densityInfo.estimatedPopulation < 5000) populationFactor = 40;
    else if (densityInfo.estimatedPopulation < 10000) populationFactor = 60;
    else if (densityInfo.estimatedPopulation < 20000) populationFactor = 80;
    else populationFactor = 100;
    
    // Combine scores with weights:
    // - 40% to coverage gaps
    // - 30% to population density
    // - 30% to total population affected
    return Math.round((existingScore * 0.4) + (densityFactor * 0.3) + (populationFactor * 0.3));
}

// Get color based on priority score
function getPriorityColor(score) {
    if (score >= 90) return { border: '#d62728', fill: '#ff8a80' }; // Critical need
    if (score >= 75) return { border: '#ff7f0e', fill: '#ffcc80' }; // High need
    if (score >= 60) return { border: '#9467bd', fill: '#ce93d8' }; // Moderate need
    if (score >= 45) return { border: '#2ca02c', fill: '#a5d6a7' }; // Low need
    return { border: '#1f77b4', fill: '#90caf9' };                  // Very low need
}

// Create enhanced popup
function createEnhancedPopup(properties, densityInfo, priorityScore) {
    const wardName = properties.ward || 'Unknown Area';
    const population = properties.pop2009 || 'Unknown';
    const uncoveredPercentage = properties.uncoveredPercentage || 'Unknown';
    
    let recommendation = "No specific recommendation";
    if (priorityScore >= 90) recommendation = "Critical need for new healthcare facility";
    else if (priorityScore >= 75) recommendation = "High priority for new healthcare facility";
    else if (priorityScore >= 60) recommendation = "Consider mobile clinic deployment";
    else if (priorityScore >= 45) recommendation = "Evaluate for outreach services";
    else recommendation = "Monitor access metrics";
    
    return `
        <div style="max-width: 300px;">
            <h4 style="margin-top: 0; color: #333;">Healthcare Needs Assessment</h4>
            <p><strong>Area:</strong> ${wardName}</p>
            <p><strong>Population:</strong> ${population}</p>
            <p><strong>Uncovered:</strong> ${typeof uncoveredPercentage === 'number' ? Math.round(uncoveredPercentage) + '%' : uncoveredPercentage}</p>
            <p><strong>Population Density:</strong> ${densityInfo.densityCategory} (${Math.round(densityInfo.density)} people/km²)</p>
            <p><strong>Estimated Population Affected:</strong> ${densityInfo.estimatedPopulation.toLocaleString()}</p>
            <p><strong>Area Size:</strong> ${densityInfo.areaKm2.toFixed(2)} km²</p>
            
            <div style="margin: 10px 0; background: #f5f5f5; padding: 8px; border-radius: 4px;">
                <div style="font-weight: bold; margin-bottom: 5px;">Priority Score: ${priorityScore}/100</div>
                <div class="priority-scale"></div>
                <div class="priority-marker">
                    <div class="priority-marker-pointer" style="left: ${priorityScore}%;">▲</div>
                </div>
            </div>
            
            <p style="font-weight: bold;">Recommendation:</p>
            <p>${recommendation}</p>
        </div>
    `;
}

// Add event listener for the analyze button
document.getElementById('analyzeNeedsBtn').addEventListener('click', async function() {
    // Check if population density and coverage gaps are enabled
    if (!document.getElementById('populationDensityToggle').checked) {
        alert("Please enable Population Density first");
        document.getElementById('populationDensityToggle').checked = true;
        document.getElementById('populationControls').style.display = 'block';
        loadPopulationData();
        return;
    }
    
    if (!document.getElementById('coverageGapToggle').checked) {
        alert("Please enable Coverage Gaps first");
        document.getElementById('coverageGapToggle').checked = true;
        
        // This will trigger the coverage gap analysis
        if (!map.hasLayer(bufferLayer)) {
            createServiceAreas();
            map.addLayer(bufferLayer);
            document.getElementById('bufferToggle').checked = true;
        }
        
        identifyCoverageGaps();
        map.addLayer(coverageGapLayer);
        return;
    }
    
    // Remove existing needs layer if any
    if (needsLayer) {
        map.removeLayer(needsLayer);
        
        // Remove from legend if it exists
        const needsLegendItems = document.querySelectorAll('.needs-legend-item');
        needsLegendItems.forEach(item => item.remove());
    }
    
    // Run the analysis
    needsLayer = await analyzeHealthcareNeeds();
    
    if (needsLayer) {
        // Add to legend
        const legend = document.querySelector('.legend');
        legend.innerHTML += `
            <div class="needs-legend-item" style="margin-top: 15px; font-weight: bold;">Healthcare Needs</div>
            <div class="needs-legend-item" style="margin-bottom: 5px">
                <span style="display: inline-block; width: 20px; height: 10px; background: #ff8a80; border: 1px solid #d62728;"></span> Critical Need
            </div>
            <div class="needs-legend-item" style="margin-bottom: 5px">
                <span style="display: inline-block; width: 20px; height: 10px; background: #ffcc80; border: 1px solid #ff7f0e;"></span> High Need
            </div>
            <div class="needs-legend-item" style="margin-bottom: 5px">
                <span style="display: inline-block; width: 20px; height: 10px; background: #ce93d8; border: 1px solid #9467bd;"></span> Moderate Need
            </div>
            <div class="needs-legend-item" style="margin-bottom: 5px">
                <span style="display: inline-block; width: 20px; height: 10px; background: #a5d6a7; border: 1px solid #2ca02c;"></span> Low Need
            </div>
            <div class="needs-legend-item" style="margin-bottom: 5px">
                <span style="display: inline-block; width: 20px; height: 10px; background: #90caf9; border: 1px solid #1f77b4;"></span> Very Low Need
            </div>
        `;
        
        // Show the generate report button
        document.getElementById('generateReportBtn').style.display = 'block';
    }
});

// Add event listener for the reset button
document.getElementById('resetAnalysisBtn').addEventListener('click', function() {
    if (needsLayer) {
        map.removeLayer(needsLayer);
        needsLayer = null;
        
        // Remove from legend
        const needsLegendItems = document.querySelectorAll('.needs-legend-item');
        needsLegendItems.forEach(item => item.remove());
        
        // Update status
        const statusDiv = document.getElementById('analysisStatus');
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = 'Analysis reset';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
        
        // Hide the generate report button
        document.getElementById('generateReportBtn').style.display = 'none';
    }
});

