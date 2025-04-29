// Global variable for the needs analysis layer
let needsLayer = null;

// Function to analyze healthcare needs based on population density and coverage gaps
async function analyzeHealthcareNeeds() {
    console.log("DEBUG: Starting healthcare needs analysis");
   
    // Show status message
    const statusDiv = document.getElementById('analysisStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = 'Analyzing healthcare needs...';
   
    try {
        // Ensure we have coverage analysis
        if (!coverageGapLayer.getLayers().length) {
            console.log("DEBUG: No coverage gaps found");
            alert("Please enable coverage gaps layer first");
            statusDiv.style.display = 'none';
            return null;
        }
       
        console.log("DEBUG: Creating new needs layer");
        // Create a new layer for healthcare needs assessment
        needsLayer = new L.FeatureGroup();
       
        // Get all coverage gaps
        const gaps = coverageGapLayer.getLayers();
        console.log(`DEBUG: Analyzing ${gaps.length} coverage gaps with population density`);
       
        // Process each gap
        for (let i = 0; i < gaps.length; i++) {
            const gapLayer = gaps[i];
            console.log(`DEBUG: Processing gap ${i+1}/${gaps.length}`);
           
            // Get the gap's GeoJSON
            const gapGeoJSON = gapLayer.toGeoJSON();
            console.log(`DEBUG: Gap ${i+1} GeoJSON type:`, gapGeoJSON.type);
           
            // Extract properties from the original gap
            const properties = gapLayer.feature ? {...gapLayer.feature.properties} : {};
            console.log(`DEBUG: Gap ${i+1} original properties:`, properties);
           
            // Get popup content if available
            let popupContent = '';
            if (gapLayer.getPopup()) {
                popupContent = gapLayer.getPopup().getContent();
                console.log(`DEBUG: Gap ${i+1} popup content:`, popupContent);
               
                // Extract uncovered percentage from popup if not in properties
                if (!properties.uncoveredPercentage) {
                    const match = popupContent.match(/Uncovered Area:\s*(\d+)%/);
                    if (match && match[1]) {
                        properties.uncoveredPercentage = parseInt(match[1]);
                        console.log(`DEBUG: Extracted uncovered percentage: ${properties.uncoveredPercentage}%`);
                    }
                }
               
                // Extract ward name if not in properties
                if (!properties.ward) {
                    const wardMatch = popupContent.match(/Coverage Gap:\s*([^<]+)/);
                    if (wardMatch && wardMatch[1]) {
                        properties.ward = wardMatch[1].trim();
                        console.log(`DEBUG: Extracted ward name: ${properties.ward}`);
                    }
                }
            }
           
            // Calculate average population density within this gap
            statusDiv.innerHTML = `Analyzing area ${i+1} of ${gaps.length}: ${properties.ward || 'Unknown'}...`;
            console.log(`DEBUG: Estimating population for ${properties.ward || 'Unknown'}`);
           
            const avgDensity = await estimatePopulationDensityInArea(gapGeoJSON);
            console.log(`DEBUG: Population data for ${properties.ward || 'Unknown'}:`, avgDensity);
           
            // Calculate priority score based on both coverage and population
            const priorityScore = calculateCombinedPriorityScore(properties, avgDensity);
            console.log(`DEBUG: Priority score for ${properties.ward || 'Unknown'}:`, priorityScore);
           
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
           
            // Create a new feature with all the properties
            const newFeature = {
                type: 'Feature',
                properties: {
                    ...properties,
                    priorityScore: priorityScore,
                    estimatedPopulation: avgDensity.estimatedPopulation,
                    populationDensity: avgDensity.density,
                    densityCategory: avgDensity.densityCategory,
                    areaKm2: avgDensity.areaKm2
                },
                geometry: gapGeoJSON.features ? gapGeoJSON.features[0].geometry : gapGeoJSON.geometry
            };
           
            console.log(`DEBUG: New feature for ${properties.ward || 'Unknown'}:`, newFeature);
           
            // Assign the feature to the layer
            needLayer.feature = newFeature;
           
            // Verify the feature was assigned correctly
            console.log(`DEBUG: Verifying feature assignment for ${properties.ward || 'Unknown'}:`,
                needLayer.feature ? "Feature assigned" : "Feature NOT assigned",
                needLayer.feature ? needLayer.feature.properties : "No properties");
           
            // Create enhanced popup with population density information
            const enhancedPopup = createEnhancedPopup(newFeature.properties, avgDensity, priorityScore);
            needLayer.bindPopup(enhancedPopup);
           
            // Add to the needs layer
            needsLayer.addLayer(needLayer);
            console.log(`DEBUG: Added layer ${i+1} to needs layer`);
        }
       
        // Update status
        statusDiv.innerHTML = `Analysis complete: ${needsLayer.getLayers().length} areas analyzed`;
        console.log(`DEBUG: Analysis complete: ${needsLayer.getLayers().length} areas analyzed`);
       
        // Show the generate report button and add direct click handler
        const reportBtn = document.getElementById('generateReportBtn');
        reportBtn.style.display = 'block';
        
        // Add direct click handler to ensure report generation works
        reportBtn.onclick = function() {
            console.log("DEBUG: Generate report button clicked from inline handler");
            if (typeof generateSummaryReport === 'function') {
                generateSummaryReport();
            } else if (typeof window.generateHealthcareReport === 'function') {
                window.generateHealthcareReport();
            } else {
                console.error("DEBUG: Report generation function not found");
                alert("Report generation function not available. Please check the console for errors.");
            }
        };
       
        // Add the needs layer to the map
        map.addLayer(needsLayer);
       
        // Verify the needs layer has the expected data
        console.log("DEBUG: Final needs layer:", needsLayer);
        console.log("DEBUG: Needs layer layers count:", needsLayer.getLayers().length);
        needsLayer.getLayers().forEach((layer, i) => {
            console.log(`DEBUG: Layer ${i+1} feature:`, layer.feature);
            console.log(`DEBUG: Layer ${i+1} properties:`, layer.feature ? layer.feature.properties : "No properties");
        });
       
        // Return the layer
        return needsLayer;
    } catch (error) {
        console.error("DEBUG: Error in healthcare needs analysis:", error);
        statusDiv.innerHTML = "Error during analysis. See console for details.";
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
        return null;
    }
}

// Function to estimate population density in a given area
async function estimatePopulationDensityInArea(geojson) {
    console.log("DEBUG: Starting population density estimation for area");
    console.log("DEBUG: Input GeoJSON:", JSON.stringify(geojson).substring(0, 200) + "...");
   
    // Ensure we have a Feature, not a FeatureCollection
    let processedGeojson = geojson;
    if (geojson.type === 'FeatureCollection') {
        console.log("DEBUG: Converting FeatureCollection to Feature");
        processedGeojson = geojson.features[0];
        console.log("DEBUG: Processed GeoJSON:", JSON.stringify(processedGeojson).substring(0, 200) + "...");
    }
   
    try {
        console.log("DEBUG: Preparing to call API");
       
        // Get CSRF token
        const csrfToken = getCsrfToken();
        console.log("DEBUG: CSRF Token available:", !!csrfToken);
       
        // First attempt to use the backend API
        const response = await fetch('/maps/api/population-density-for-area/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                area: processedGeojson
            })
        });
       
        console.log("DEBUG: API response status:", response.status);
       
        if (!response.ok) {
            throw new Error(`API response error: ${response.status}`);
        }
       
        const data = await response.json();
        console.log("DEBUG: API response data:", data);
       
        // Determine density category
        let densityCategory = 'Very Low';
        if (data.mean_density > 1000) densityCategory = 'Very High';
        else if (data.mean_density > 500) densityCategory = 'High';
        else if (data.mean_density > 100) densityCategory = 'Medium';
        else if (data.mean_density > 20) densityCategory = 'Low';
       
        const result = {
            density: data.mean_density || 0,
            densityCategory: densityCategory,
            minDensity: data.min_density || 0,
            maxDensity: data.max_density || 0,
            medianDensity: data.median_density || 0,
            areaKm2: data.area_km2 || 0,
            estimatedPopulation: Math.round(data.estimated_population) || 0,
            year: data.year || new Date().getFullYear()
        };
       
        console.log("DEBUG: Final density result:", result);
        return result;
    } catch (error) {
        console.error("DEBUG: Error getting population density from API:", error);
       
        // Fall back to simplified estimation
        console.log("DEBUG: Falling back to simplified estimation");
        const result = simplifiedDensityEstimation(geojson);
        console.log("DEBUG: Simplified estimation result:", result);
        return result;
    }
}

// Helper function to get CSRF token
function getCsrfToken() {
    const token = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value || '';
    console.log("DEBUG: CSRF token found:", !!token);
    return token;
}

// Simplified density estimation as fallback
function simplifiedDensityEstimation(geojson) {
    console.log("DEBUG: Using simplified density estimation");
   
    // Calculate area in square kilometers
    let area = 0;
    try {
        area = turf.area(geojson) / 1000000; // Convert from m² to km²
        console.log("DEBUG: Calculated area:", area, "km²");
    } catch (e) {
        console.error("DEBUG: Error calculating area:", e);
        area = 50; // Default fallback area
    }
   
    // Estimate population based on area and a simple density factor
    // Rural areas: ~50 people/km², Urban areas: ~1000 people/km²
    // We'll use a middle value as a rough estimate
    const estimatedDensity = 200; // people per km²
    const estimatedPopulation = Math.round(area * estimatedDensity);
   
    // Determine density category
    let densityCategory = 'Very Low';
    if (estimatedDensity > 1000) densityCategory = 'Very High';
    else if (estimatedDensity > 500) densityCategory = 'High';
    else if (estimatedDensity > 100) densityCategory = 'Medium';
    else if (estimatedDensity > 20) densityCategory = 'Low';
   
    return {
        density: estimatedDensity,
        densityCategory: densityCategory,
        minDensity: estimatedDensity,
        maxDensity: estimatedDensity,
        medianDensity: estimatedDensity,
        areaKm2: area,
        estimatedPopulation: estimatedPopulation,
        year: new Date().getFullYear()
    };
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

// Debug function to inspect layer structure
function debugInspectLayers() {
    console.log("DEBUG: Inspecting layers structure");
   
    if (!needsLayer) {
        console.log("DEBUG: No needs layer available");
        return;
    }
   
    const layers = needsLayer.getLayers();
    console.log(`DEBUG: Needs layer has ${layers.length} layers`);
   
    layers.forEach((layer, i) => {
        console.log(`DEBUG: Layer ${i+1} details:`);
        console.log(`  Type: ${layer.constructor.name}`);
        console.log(`  Has feature: ${!!layer.feature}`);
       
        if (layer.feature) {
            console.log(`  Feature type: ${layer.feature.type}`);
            console.log(`  Has properties: ${!!layer.feature.properties}`);
           
            if (layer.feature.properties) {
                const props = layer.feature.properties;
                console.log(`  Properties: ${JSON.stringify(props)}`);
                console.log(`  Ward: ${props.ward || 'Unknown'}`);
                console.log(`  Population: ${props.estimatedPopulation || 'N/A'}`);
                console.log(`  Area: ${props.areaKm2 || 'N/A'} km²`);
                console.log(`  Priority Score: ${props.priorityScore || 'N/A'}`);
            }
        }
       
        console.log(`  Has popup: ${!!layer.getPopup && !!layer.getPopup()}`);
        if (layer.getPopup && layer.getPopup()) {
            console.log(`  Popup content: ${layer.getPopup().getContent()}`);
        }
    });
}

// Add event listener for the analyze button
document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeNeedsBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async function() {
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
                const reportBtn = document.getElementById('generateReportBtn');
                reportBtn.style.display = 'block';
            }
        });
    }
    
    // Add event listener for the reset button
    const resetBtn = document.getElementById('resetAnalysisBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
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
    }
    
    // Add event listener for the generate report button
    const reportBtn = document.getElementById('generateReportBtn');
    if (reportBtn) {
        reportBtn.addEventListener('click', function() {
            console.log("DEBUG: Generate report button clicked");
            if (typeof generateSummaryReport === 'function') {
                generateSummaryReport();
            } else if (typeof window.generateHealthcareReport === 'function') {
                window.generateHealthcareReport();
            } else {
                console.error("DEBUG: Report generation function not found");
                alert("Report generation function not available. Please check the console for errors.");
            }
        });
    }
});

// Function to generate a summary report of healthcare needs
function generateSummaryReport() {
    console.log("DEBUG: Generating healthcare summary report");
    
    if (!needsLayer || !needsLayer.getLayers().length) {
        console.error("DEBUG: No needs analysis data available");
        alert("Please run the healthcare needs analysis first");
        return;
    }
    
    try {
        // Show loading indicator
        const statusDiv = document.getElementById('analysisStatus');
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = 'Generating report...';
        
        // Extract data from all analyzed areas
        const layers = needsLayer.getLayers();
        console.log(`DEBUG: Extracting data from ${layers.length} analyzed areas`);
        
        const reportData = layers.map(layer => {
            if (!layer.feature || !layer.feature.properties) {
                console.warn("DEBUG: Layer missing feature or properties");
                return null;
            }
            
            const props = layer.feature.properties;
            return {
                area: props.ward || 'Unknown Area',
                priorityScore: props.priorityScore || 0,
                population: props.estimatedPopulation || 0,
                density: props.populationDensity || 0,
                densityCategory: props.densityCategory || 'Unknown',
                uncoveredPercentage: props.uncoveredPercentage || 0,
                areaKm2: props.areaKm2 || 0
            };
        }).filter(item => item !== null);
        
        console.log(`DEBUG: Collected data for ${reportData.length} areas`);
        
        // Sort by priority score (highest first)
        reportData.sort((a, b) => b.priorityScore - a.priorityScore);
        
        // Calculate summary statistics
        const totalPopulation = reportData.reduce((sum, item) => sum + item.population, 0);
        const totalArea = reportData.reduce((sum, item) => sum + item.areaKm2, 0);
        const avgPriorityScore = reportData.reduce((sum, item) => sum + item.priorityScore, 0) / reportData.length;
        
        // Count areas by priority category
        const criticalNeedCount = reportData.filter(item => item.priorityScore >= 90).length;
        const highNeedCount = reportData.filter(item => item.priorityScore >= 75 && item.priorityScore < 90).length;
        const moderateNeedCount = reportData.filter(item => item.priorityScore >= 60 && item.priorityScore < 75).length;
        const lowNeedCount = reportData.filter(item => item.priorityScore >= 45 && item.priorityScore < 60).length;
        const veryLowNeedCount = reportData.filter(item => item.priorityScore < 45).length;
        
        // Generate HTML report
        let reportHtml = `
            <div class="report-container">
                <h2>Healthcare Needs Assessment Report</h2>
                <p class="report-date">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                
                <div class="report-summary">
                    <h3>Summary</h3>
                    <div class="summary-stats">
                        <div class="stat-box">
                            <div class="stat-value">${reportData.length}</div>
                            <div class="stat-label">Areas Analyzed</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${totalPopulation.toLocaleString()}</div>
                            <div class="stat-label">Total Population</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${totalArea.toFixed(2)} km²</div>
                            <div class="stat-label">Total Area</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${avgPriorityScore.toFixed(1)}</div>
                            <div class="stat-label">Avg Priority Score</div>
                        </div>
                    </div>
                    
                    <div class="priority-distribution">
                        <h4>Priority Distribution</h4>
                        <div class="priority-bars">
                            <div class="priority-bar critical" style="width: ${(criticalNeedCount/reportData.length)*100}%">
                                <span class="bar-label">Critical: ${criticalNeedCount}</span>
                            </div>
                            <div class="priority-bar high" style="width: ${(highNeedCount/reportData.length)*100}%">
                                <span class="bar-label">High: ${highNeedCount}</span>
                            </div>
                            <div class="priority-bar moderate" style="width: ${(moderateNeedCount/reportData.length)*100}%">
                                <span class="bar-label">Moderate: ${moderateNeedCount}</span>
                            </div>
                            <div class="priority-bar low" style="width: ${(lowNeedCount/reportData.length)*100}%">
                                <span class="bar-label">Low: ${lowNeedCount}</span>
                            </div>
                            <div class="priority-bar very-low" style="width: ${(veryLowNeedCount/reportData.length)*100}%">
                                <span class="bar-label">Very Low: ${veryLowNeedCount}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="report-details">
                    <h3>Priority Areas</h3>
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Priority</th>
                                <th>Area</th>
                                <th>Score</th>
                                <th>Population</th>
                                <th>Density</th>
                                <th>Uncovered</th>
                                <th>Size (km²)</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // Add rows for each area
        reportData.forEach((item, index) => {
            let priorityClass = 'very-low-priority';
                        // Determine priority class for styling
                        if (item.priorityScore >= 90) priorityClass = 'critical-priority';
                        else if (item.priorityScore >= 75) priorityClass = 'high-priority';
                        else if (item.priorityScore >= 60) priorityClass = 'moderate-priority';
                        else if (item.priorityScore >= 45) priorityClass = 'low-priority';
                        
                        reportHtml += `
                            <tr class="${priorityClass}">
                                <td>${index + 1}</td>
                                <td>${item.area}</td>
                                <td>${item.priorityScore}</td>
                                <td>${item.population.toLocaleString()}</td>
                                <td>${Math.round(item.density)} p/km²</td>
                                <td>${typeof item.uncoveredPercentage === 'number' ? Math.round(item.uncoveredPercentage) + '%' : item.uncoveredPercentage}</td>
                                <td>${item.areaKm2.toFixed(2)}</td>
                            </tr>
                        `;
                    });
                    
                    reportHtml += `
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="report-recommendations">
                                <h3>Recommendations</h3>
                                <div class="recommendations-content">
                    `;
                    
                    // Add recommendations based on analysis
                    if (criticalNeedCount > 0) {
                        reportHtml += `
                            <div class="recommendation critical">
                                <h4>Critical Priority Areas (${criticalNeedCount})</h4>
                                <p>These areas require immediate attention. Consider establishing new healthcare facilities to address severe coverage gaps affecting large populations.</p>
                                <ul>
                                    ${reportData.filter(item => item.priorityScore >= 90).map(item => 
                                        `<li><strong>${item.area}</strong>: Affecting approximately ${item.population.toLocaleString()} people with ${typeof item.uncoveredPercentage === 'number' ? Math.round(item.uncoveredPercentage) + '%' : item.uncoveredPercentage} uncovered.</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        `;
                    }
                    
                    if (highNeedCount > 0) {
                        reportHtml += `
                            <div class="recommendation high">
                                <h4>High Priority Areas (${highNeedCount})</h4>
                                <p>These areas should be addressed in the near term. Consider mobile clinics or smaller satellite facilities to improve healthcare access.</p>
                                <ul>
                                    ${reportData.filter(item => item.priorityScore >= 75 && item.priorityScore < 90).map(item => 
                                        `<li><strong>${item.area}</strong>: Affecting approximately ${item.population.toLocaleString()} people.</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        `;
                    }
                    
                    if (moderateNeedCount > 0) {
                        reportHtml += `
                            <div class="recommendation moderate">
                                <h4>Moderate Priority Areas (${moderateNeedCount})</h4>
                                <p>Consider implementing outreach programs or scheduled mobile health services to address these gaps.</p>
                            </div>
                        `;
                    }
                    
                    reportHtml += `
                                </div>
                            </div>
                            
                            <div class="report-footer">
                                <p>This report was generated using the Healthcare Access Analysis Tool. Data is based on current facility locations, population density estimates, and coverage analysis.</p>
                            </div>
                        </div>
                    `;
                    
                    // Create report styles
                    const reportStyles = `
                        <style>
                            .report-container {
                                font-family: Arial, sans-serif;
                                max-width: 1200px;
                                margin: 0 auto;
                                padding: 20px;
                                background-color: #fff;
                                color: #333;
                            }
                            
                            .report-date {
                                color: #666;
                                font-style: italic;
                            }
                            
                            .report-summary {
                                background-color: #f5f5f5;
                                padding: 15px;
                                border-radius: 5px;
                                margin-bottom: 20px;
                            }
                            
                            .summary-stats {
                                display: flex;
                                justify-content: space-between;
                                flex-wrap: wrap;
                                margin-bottom: 15px;
                            }
                            
                            .stat-box {
                                background-color: #fff;
                                border-radius: 5px;
                                padding: 15px;
                                text-align: center;
                                width: 22%;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            }
                            
                            .stat-value {
                                font-size: 24px;
                                font-weight: bold;
                                margin-bottom: 5px;
                            }
                            
                            .stat-label {
                                font-size: 14px;
                                color: #666;
                            }
                            
                            .priority-distribution {
                                margin-top: 20px;
                            }
                            
                            .priority-bars {
                                display: flex;
                                height: 30px;
                                border-radius: 4px;
                                overflow: hidden;
                            }
                            
                            .priority-bar {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-size: 12px;
                                min-width: 40px;
                            }
                            
                            .priority-bar.critical { background-color: #d62728; }
                            .priority-bar.high { background-color: #ff7f0e; }
                            .priority-bar.moderate { background-color: #9467bd; }
                            .priority-bar.low { background-color: #2ca02c; }
                            .priority-bar.very-low { background-color: #1f77b4; }
                            
                            .report-table {
                                width: 100%;
                                border-collapse: collapse;
                                margin-bottom: 20px;
                            }
                            
                            .report-table th, .report-table td {
                                padding: 10px;
                                text-align: left;
                                border-bottom: 1px solid #ddd;
                            }
                            
                            .report-table th {
                                background-color: #f2f2f2;
                                font-weight: bold;
                            }
                            
                            .critical-priority { background-color: rgba(214, 39, 40, 0.1); }
                            .high-priority { background-color: rgba(255, 127, 14, 0.1); }
                            .moderate-priority { background-color: rgba(148, 103, 189, 0.1); }
                            .low-priority { background-color: rgba(44, 160, 44, 0.1); }
                            
                            .recommendation {
                                margin-bottom: 15px;
                                padding: 15px;
                                border-radius: 5px;
                            }
                            
                            .recommendation.critical {
                                background-color: rgba(214, 39, 40, 0.1);
                                border-left: 5px solid #d62728;
                            }
                            
                            .recommendation.high {
                                background-color: rgba(255, 127, 14, 0.1);
                                border-left: 5px solid #ff7f0e;
                            }
                            
                            .recommendation.moderate {
                                background-color: rgba(148, 103, 189, 0.1);
                                border-left: 5px solid #9467bd;
                            }
                            
                            .report-footer {
                                margin-top: 30px;
                                padding-top: 15px;
                                border-top: 1px solid #ddd;
                                font-size: 12px;
                                color: #666;
                            }
                            
                            @media print {
                                body * {
                                    visibility: hidden;
                                }
                                .report-container, .report-container * {
                                    visibility: visible;
                                }
                                .report-container {
                                    position: absolute;
                                    left: 0;
                                    top: 0;
                                    width: 100%;
                                }
                            }
                        </style>
                    `;
                    
                    // Create a new window for the report
                    const reportWindow = window.open('', '_blank');
                    reportWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Healthcare Needs Assessment Report</title>
                            ${reportStyles}
                        </head>
                        <body>
                            ${reportHtml}
                            <div style="text-align: center; margin-top: 20px;">
                                <button onclick="window.print()">Print Report</button>
                                <button onclick="window.close()">Close</button>
                            </div>
                        </body>
                        </html>
                    `);
                    
                    // Update status
                    statusDiv.innerHTML = 'Report generated successfully';
                    setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
                    
                    console.log("DEBUG: Report generated successfully");
                    
                } catch (error) {
                    console.error("DEBUG: Error generating report:", error);
                    alert("Error generating report. Please check the console for details.");
                    
                    const statusDiv = document.getElementById('analysisStatus');
                    statusDiv.innerHTML = 'Error generating report';
                    setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
                }
            }
            
            // Make the function available globally
            window.generateHealthcareReport = generateSummaryReport;
            
            // Export functions for testing or external use
            if (typeof module !== 'undefined' && module.exports) {
                module.exports = {
                    analyzeHealthcareNeeds,
                    estimatePopulationDensityInArea,
                    calculateCombinedPriorityScore,
                    getPriorityColor,
                    createEnhancedPopup,
                    generateSummaryReport
                };
            }
            
