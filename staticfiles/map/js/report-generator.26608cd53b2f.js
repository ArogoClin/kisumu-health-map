// Function to generate a summary report
function generateSummaryReport() {
    console.log("DEBUG: Generate report button clicked");
    console.log("DEBUG: Generating summary report");
   
    // Check if needs layer exists and has data
    if (!needsLayer) {
        console.error("DEBUG: No needs layer available");
        alert("No analysis data available. Please run the analysis first.");
        return;
    }
   
    const layers = needsLayer.getLayers();
    console.log(`DEBUG: Found ${layers.length} layers to analyze`);
   
    if (layers.length === 0) {
        console.log("DEBUG: No layers in needs layer");
        alert("No analysis data available. Please run the analysis first.");
        return;
    }
   
    // Initialize counters and accumulators
    let criticalNeedCount = 0;
    let highNeedCount = 0;
    let moderateNeedCount = 0;
    let lowNeedCount = 0;
    let veryLowNeedCount = 0;
    let totalPopulationAffected = 0;
    let totalUncoveredArea = 0;
   
    // Process each analyzed area
    layers.forEach((layer, index) => {
        try {
            console.log(`DEBUG: Processing layer ${index + 1} for report`);
            console.log(`DEBUG: Layer ${index + 1} type:`, layer.constructor.name);
            console.log(`DEBUG: Layer ${index + 1} has feature:`, !!layer.feature);
           
            // Get properties from the layer
            const feature = layer.feature || {};
            console.log(`DEBUG: Layer ${index + 1} feature:`, feature);
           
            const properties = feature.properties || {};
            console.log(`DEBUG: Layer ${index + 1} properties:`, properties);
           
            // Extract priority score
            let priorityScore = properties.priorityScore || 50; // Default medium if not found
            console.log(`DEBUG: Layer ${index + 1} priority score:`, priorityScore);
           
            // Count by priority level
            if (priorityScore >= 90) {
                criticalNeedCount++;
                console.log(`DEBUG: Layer ${index + 1} counted as Critical`);
            }
            else if (priorityScore >= 75) {
                highNeedCount++;
                console.log(`DEBUG: Layer ${index + 1} counted as High`);
            }
            else if (priorityScore >= 60) {
                moderateNeedCount++;
                console.log(`DEBUG: Layer ${index + 1} counted as Moderate`);
            }
            else if (priorityScore >= 45) {
                lowNeedCount++;
                console.log(`DEBUG: Layer ${index + 1} counted as Low`);
            }
            else {
                veryLowNeedCount++;
                console.log(`DEBUG: Layer ${index + 1} counted as Very Low`);
            }
           
            // Add to totals - ensure we're working with numbers
            if (properties.estimatedPopulation !== undefined) {
                const population = parseInt(properties.estimatedPopulation) || 0;
                totalPopulationAffected += population;
                console.log(`DEBUG: Added population: ${population}, total now: ${totalPopulationAffected}`);
            } else {
                console.warn(`DEBUG: Layer ${index + 1} missing estimatedPopulation property`);
               
                // Try to extract from popup content as fallback
                if (layer.getPopup) {
                    const popup = layer.getPopup();
                    if (popup) {
                        const content = popup.getContent();
                        console.log(`DEBUG: Layer ${index + 1} popup content:`, content);
                       
                        const match = content.match(/Estimated Population Affected:\s*([0-9,]+)/);
                        if (match && match[1]) {
                            const population = parseInt(match[1].replace(/,/g, '')) || 0;
                            totalPopulationAffected += population;
                            console.log(`DEBUG: Extracted population from popup: ${population}, total now: ${totalPopulationAffected}`);
                        }
                    }
                }
            }
           
            if (properties.areaKm2 !== undefined) {
                const area = parseFloat(properties.areaKm2) || 0;
                totalUncoveredArea += area;
                console.log(`DEBUG: Added area: ${area}, total now: ${totalUncoveredArea}`);
            } else {
                console.warn(`DEBUG: Layer ${index + 1} missing areaKm2 property`);
               
                // Try to extract from popup content as fallback
                if (layer.getPopup) {
                    const popup = layer.getPopup();
                    if (popup) {
                        const content = popup.getContent();
                        const match = content.match(/Area Size:\s*([0-9.]+)\s*km²/);
                        if (match && match[1]) {
                            const area = parseFloat(match[1]) || 0;
                            totalUncoveredArea += area;
                            console.log(`DEBUG: Extracted area from popup: ${area}, total now: ${totalUncoveredArea}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`DEBUG: Error processing layer ${index + 1} for report:`, error);
        }
    });

    console.log("DEBUG: Report statistics:", {
        criticalNeedCount,
        highNeedCount,
        moderateNeedCount,
        lowNeedCount,
        veryLowNeedCount,
        totalPopulationAffected,
        totalUncoveredArea
    });

    // Create report HTML
    const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Healthcare Needs Assessment Report</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 0 15px rgba(0,0,0,0.1);
                }
                h1, h2, h3 {
                    color: #2c3e50;
                    margin-top: 0;
                }
                .summary-box {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .priority-grid {
                    display: flex;
                    margin-bottom: 20px;
                    text-align: center;
                    border-radius: 5px;
                    overflow: hidden;
                }
                .priority-cell {
                    flex: 1;
                    padding: 15px 10px;
                    color: #333;
                }
                .priority-number {
                    font-size: 28px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .recommendations {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 5px;
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 0.9em;
                    color: #7f8c8d;
                }
                ul {
                    padding-left: 20px;
                }
                li {
                    margin-bottom: 10px;
                }
                .debug-info {
                    margin-top: 30px;
                    padding: 15px;
                    background: #f1f1f1;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    font-family: monospace;
                    font-size: 12px;
                    white-space: pre-wrap;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 style="text-align: center;">Healthcare Needs Assessment Report</h1>
                <p style="text-align: center; color: #7f8c8d;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
               
                <div class="summary-box">
                    <h2>Summary</h2>
                    <p><strong>Total Areas Analyzed:</strong> ${layers.length}</p>
                    <p><strong>Total Population Affected:</strong> ${totalPopulationAffected.toLocaleString()} people</p>
                    <p><strong>Total Uncovered Area:</strong> ${totalUncoveredArea.toFixed(2)} km²</p>
                </div>
               
                <h2>Priority Breakdown</h2>
                <div class="priority-grid">
                    <div class="priority-cell" style="background: #ff8a80;">
                        <div class="priority-number">${criticalNeedCount}</div>
                        <div>Critical</div>
                    </div>
                    <div class="priority-cell" style="background: #ffcc80;">
                        <div class="priority-number">${highNeedCount}</div>
                        <div>High</div>
                    </div>
                    <div class="priority-cell" style="background: #ce93d8;">
                        <div class="priority-number">${moderateNeedCount}</div>
                        <div>Moderate</div>
                    </div>
                    <div class="priority-cell" style="background: #a5d6a7;">
                        <div class="priority-number">${lowNeedCount}</div>
                        <div>Low</div>
                    </div>
                    <div class="priority-cell" style="background: #90caf9;">
                        <div class="priority-number">${veryLowNeedCount}</div>
                        <div>Very Low</div>
                    </div>
                </div>
               
                <div class="recommendations">
                    <h2>Recommendations</h2>
                    <ul>
                        ${criticalNeedCount > 0 ? `<li><strong>Critical Need Areas (${criticalNeedCount}):</strong> Immediate action required. Consider establishing new healthcare facilities in these areas to address significant gaps in healthcare access.</li>` : ''}
                       
                        ${highNeedCount > 0 ? `<li><strong>High Need Areas (${highNeedCount}):</strong> Prioritize for new facilities or mobile clinics in the next planning cycle. These areas have substantial populations with limited healthcare access.</li>` : ''}
                       
                        ${moderateNeedCount > 0 ? `<li><strong>Moderate Need Areas (${moderateNeedCount}):</strong> Evaluate for mobile clinic deployment or outreach services. Regular healthcare services should be scheduled to visit these areas.</li>` : ''}
                       
                        ${lowNeedCount + veryLowNeedCount > 0 ? `<li><strong>Low/Very Low Need Areas (${lowNeedCount + veryLowNeedCount}):</strong> Monitor access metrics and consider for future planning. These areas have better healthcare coverage but should still be included in long-term planning.</li>` : ''}
                    </ul>
                   
                    <h3>Implementation Strategy</h3>
                    <p>For the identified areas, consider the following approach:</p>
                    <ul>
                        <li>Conduct detailed site assessments in the identified areas</li>
                        <li>Engage with local communities to understand specific healthcare needs</li>
                        <li>Develop phased implementation plan, prioritizing areas with highest population density</li>
                        <li>Explore public-private partnerships to accelerate facility development</li>
                    </ul>
                </div>
               
                <div class="debug-info">
                    <h3>Debug Information</h3>
                    <p>Total Layers: ${layers.length}</p>
                    <p>Layer Properties:</p>
                    ${layers.map((layer, i) => {
                        const props = layer.feature?.properties || {};
                        return `Layer ${i+1}: ${props.ward || 'Unknown'} - Pop: ${props.estimatedPopulation || 'N/A'}, Area: ${props.areaKm2 || 'N/A'} km²`;
                    }).join('<br>')}
                </div>
               
                <div class="footer">
                    <p>This report was generated based on population density data and healthcare facility coverage analysis.</p>
                    <p>For more detailed information, please refer to the interactive map.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    // Create a popup window with the report
    try {
        console.log("DEBUG: Opening report window");
        const reportWindow = window.open('', 'Healthcare Needs Assessment Report', 'width=900,height=700');
        if (!reportWindow) {
            console.error("DEBUG: Pop-up blocked");
            alert("Pop-up blocked! Please allow pop-ups for this site to view the report.");
            return;
        }
       
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
        console.log("DEBUG: Report generated successfully");
    } catch (error) {
        console.error("DEBUG: Error opening report window:", error);
        alert("Error generating report: " + error.message);
    }
}

// Add event listener for the Generate Report button
document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG: Setting up report generator event listener");
    const reportBtn = document.getElementById('generateReportBtn');
    
    if (reportBtn) {
        console.log("DEBUG: Report button found");
        reportBtn.addEventListener('click', function() {
            console.log("DEBUG: Generate report button clicked from event listener");
            generateSummaryReport();
        });
    } else {
        console.error("DEBUG: Report button not found during DOMContentLoaded");
        
        // Try again after a short delay in case the button is added dynamically
        setTimeout(() => {
            const delayedReportBtn = document.getElementById('generateReportBtn');
            if (delayedReportBtn) {
                console.log("DEBUG: Report button found after delay");
                delayedReportBtn.addEventListener('click', function() {
                    console.log("DEBUG: Generate report button clicked from delayed event listener");
                    generateSummaryReport();
                });
            } else {
                console.error("DEBUG: Report button still not found after delay");
            }
        }, 2000);
    }
});

// Add direct event listener in case the button is added after page load
// This is a fallback approach
window.addEventListener('load', function() {
    console.log("DEBUG: Window loaded, adding fallback event listener");
    
    // Add the event listener directly to the button if it exists
    const reportBtn = document.getElementById('generateReportBtn');
    if (reportBtn) {
        console.log("DEBUG: Report button found on window load");
        reportBtn.addEventListener('click', function() {
            console.log("DEBUG: Generate report button clicked from window load listener");
            generateSummaryReport();
        });
    }
    
        // Also add an event listener to the parent element to catch events through delegation
        const analysisTools = document.querySelector('.analysis-tools');
        if (analysisTools) {
            console.log("DEBUG: Analysis tools container found, adding delegation listener");
            analysisTools.addEventListener('click', function(event) {
                if (event.target && event.target.id === 'generateReportBtn') {
                    console.log("DEBUG: Generate report button clicked through delegation");
                    generateSummaryReport();
                }
            });
        } else {
            console.error("DEBUG: Analysis tools container not found");
        }
    });
    
    // Alternative approach: check periodically for the button
    let buttonCheckInterval = setInterval(function() {
        const reportBtn = document.getElementById('generateReportBtn');
        if (reportBtn && !reportBtn.hasReportListener) {
            console.log("DEBUG: Report button found during interval check");
            reportBtn.addEventListener('click', function() {
                console.log("DEBUG: Generate report button clicked from interval listener");
                generateSummaryReport();
            });
            reportBtn.hasReportListener = true; // Mark the button as having a listener
            
            // Stop checking once we've added the listener
            clearInterval(buttonCheckInterval);
        }
    }, 1000); // Check every second
    
    // Stop checking after 10 seconds to avoid infinite checking
    setTimeout(function() {
        if (buttonCheckInterval) {
            console.log("DEBUG: Stopping button check interval");
            clearInterval(buttonCheckInterval);
        }
    }, 10000);
    
    // Direct function to call from other scripts
    window.generateHealthcareReport = function() {
        console.log("DEBUG: Generate report called from external function");
        generateSummaryReport();
    };
    
