// Function to generate a summary report
function generateSummaryReport() {
    console.log("Generating summary report");
    
    // Check if needs layer exists and has data
    if (!needsLayer) {
        console.error("No needs layer available");
        alert("No analysis data available. Please run the analysis first.");
        return;
    }
    
    const layers = needsLayer.getLayers();
    console.log(`Found ${layers.length} layers to analyze`);
    
    if (layers.length === 0) {
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
        layers.forEach(layer => {
            try {
                // Get properties from the layer
                const feature = layer.feature || {};
                const properties = feature.properties || {};
                
                // Extract priority score
                let priorityScore = 50; // Default medium
                
                // Try to get priority score from properties
                if (properties.priorityScore) {
                    priorityScore = properties.priorityScore;
                } else {
                    // Try to extract from popup content
                    if (layer.getPopup) {
                        const popup = layer.getPopup();
                        if (popup) {
                            const content = popup.getContent();
                            const match = content.match(/Priority Score: (\d+)\/100/);
                            if (match && match[1]) {
                                priorityScore = parseInt(match[1]);
                            }
                        }
                    }
                }
                
                // Count by priority level
                if (priorityScore >= 90) criticalNeedCount++;
                else if (priorityScore >= 75) highNeedCount++;
                else if (priorityScore >= 60) moderateNeedCount++;
                else if (priorityScore >= 45) lowNeedCount++;
                else veryLowNeedCount++;
                
                // Add to totals
                if (properties.estimatedPopulation) {
                    totalPopulationAffected += properties.estimatedPopulation;
                }
                
                if (properties.areaKm2) {
                    totalUncoveredArea += properties.areaKm2;
                }
            } catch (error) {
                console.error("Error processing layer for report:", error);
            }
        });
        
        console.log("Report statistics:", {
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
                        
                        ${criticalNeedCount + highNeedCount > 0 ? `
                        <h3>Implementation Strategy</h3>
                        <p>For critical and high-need areas, consider the following approach:</p>
                        <ul>
                            <li>Conduct detailed site assessments in the identified areas</li>
                            <li>Engage with local communities to understand specific healthcare needs</li>
                            <li>Develop phased implementation plan, prioritizing areas with highest population density</li>
                            <li>Explore public-private partnerships to accelerate facility development</li>
                        </ul>
                        ` : ''}
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
            const reportWindow = window.open('', 'Healthcare Needs Assessment Report', 'width=900,height=700');
            if (!reportWindow) {
                alert("Pop-up blocked! Please allow pop-ups for this site to view the report.");
                return;
            }
            
            reportWindow.document.write(reportHTML);
            reportWindow.document.close();
            console.log("Report generated successfully");
        } catch (error) {
            console.error("Error opening report window:", error);
            alert("Error generating report: " + error.message);
        }
    }
    
    // Add event listener for the generate report button
    document.getElementById('generateReportBtn').addEventListener('click', function() {
        console.log("Generate report button clicked");
        generateSummaryReport();
    });
    
