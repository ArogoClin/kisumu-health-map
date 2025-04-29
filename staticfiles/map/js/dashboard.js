// Dashboard.js - Handles the dashboard functionality and visualizations
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Kisumu Healthcare Dashboard');
    
    // Check if required data is available
    if (!window.summaryStats) {
        console.error('Summary statistics not available');
        showErrorMessage('Summary statistics data is missing. Please try refreshing the page.');
        return;
    }
    
    if (!window.facilitiesData) {
        console.error('Facilities data not available');
        showErrorMessage('Facilities data is missing. Please try refreshing the page.');
        return;
    }
    
    if (!window.wardsData) {
        console.error('Wards data not available');
        showErrorMessage('Wards data is missing. Please try refreshing the page.');
        return;
    }
    
    if (!window.countyData) {
        console.error('County data not available');
        showErrorMessage('County data is missing. Please try refreshing the page.');
        return;
    }
    
    // Initialize the dashboard components
    initializeSummaryStats();
    initializeFacilityTypeChart();
    initializeCoverageChart();
    initializeWardStats();
    initializeMiniMap();
    initializeOptimalLocations();
    
    // Set up event listeners
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);
    document.getElementById('returnToMapBtn').addEventListener('click', function() {
        window.location.href = '/maps/';
    });
});

// Helper function to show error messages
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.color = '#721c24';
    errorDiv.style.padding = '15px';
    errorDiv.style.margin = '15px 0';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.textAlign = 'center';
    errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
    
    // Find a good place to insert the error message
    const container = document.querySelector('.dashboard-container') || document.body;
    container.insertBefore(errorDiv, container.firstChild);
}

// Initialize the summary statistics
function initializeSummaryStats() {
    // Calculate total population using 2019 data where available
    let totalPopulation = 0;
    
    // Parse wards data if it's a string
    const wardsDataObj = typeof wardsData === 'string'
        ? JSON.parse(wardsData)
        : wardsData;
    
    // Calculate total population from ward data, preferring 2019 data
    wardsDataObj.features.forEach(ward => {
        if (ward.properties && ward.properties.pop2019) {
            totalPopulation += parseInt(ward.properties.pop2019);
        } else if (ward.properties && ward.properties.pop2009) {
            totalPopulation += parseInt(ward.properties.pop2009);
        }
    });
    
    // Update summary stats with the new population total
    if (totalPopulation > 0) {
        summaryStats.total_population = totalPopulation;
    }
    
    // Format the population for display
    const formattedPopulation = summaryStats.total_population.toLocaleString();
    const totalFacilities = summaryStats.total_facilities;
    const populationPerFacility = Math.round(summaryStats.total_population / totalFacilities).toLocaleString();
    
    // Get coverage percentage from coverage_stats
    const coveragePercent = (summaryStats.coverage_stats && summaryStats.coverage_stats.coverage_percent)
        ? summaryStats.coverage_stats.coverage_percent.toFixed(1) + '%'
        : '0.0%';
    
    // Update the DOM
    document.getElementById('totalPopulation').textContent = formattedPopulation;
    document.getElementById('totalFacilities').textContent = totalFacilities;
    document.getElementById('populationPerFacility').textContent = populationPerFacility;
    document.getElementById('coveragePercent').textContent = coveragePercent;
    
    // Add additional metrics if available
    if (summaryStats.coverage_stats && summaryStats.coverage_stats.underserved_population) {
        const underservedElement = document.createElement('div');
        underservedElement.className = 'stat-card';
        underservedElement.innerHTML = `
            <h3>Underserved Population</h3>
            <p>${summaryStats.coverage_stats.underserved_population.toLocaleString()}</p>
            <small>${summaryStats.coverage_stats.underserved_percent.toFixed(1)}% of total population</small>
        `;
        document.querySelector('.summary-stats').appendChild(underservedElement);
    }
}

// Initialize the facility type chart
function initializeFacilityTypeChart() {
    // Use facility types from summary stats if available
    const facilityTypes = summaryStats.facility_types || {};
    
    // If not available, count facilities by type
    if (Object.keys(facilityTypes).length === 0) {
        // Check if facilitiesData is already an object or a JSON string
        const facilitiesDataObj = typeof facilitiesData === 'string'
            ? JSON.parse(facilitiesData)
            : facilitiesData;
        
        facilitiesDataObj.features.forEach(facility => {
            const type = facility.properties.facility_type;
            facilityTypes[type] = (facilityTypes[type] || 0) + 1;
        });
    }
    
    // Prepare data for Chart.js
    const labels = Object.keys(facilityTypes);
    const data = Object.values(facilityTypes);
    
    // Create a color palette
    const colorPalette = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12',
        '#9b59b6', '#1abc9c', '#d35400', '#34495e'
    ];
    
    // Create the chart
    const ctx = document.getElementById('facilityTypeChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colorPalette.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: {
                            size: 12
                        },
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Initialize the coverage chart
function initializeCoverageChart() {
    // Use the travel time coverage data from summary stats
    const travelTimes = Object.keys(summaryStats.travel_time_coverage).map(Number).sort((a, b) => a - b);
    const coverageData = travelTimes.map(time => summaryStats.travel_time_coverage[time]);
    
    // Create the chart
    const ctx = document.getElementById('coverageChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: travelTimes.map(time => `${time} minutes`),
            datasets: [{
                label: 'Population Coverage (%)',
                data: coverageData,
                backgroundColor: '#3498db',
                borderColor: '#2980b9',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Coverage (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Travel Time'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Coverage: ${context.raw.toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });
}

// Function to populate the ward statistics table
function initializeWardStats() {
    console.log("Populating ward statistics table...");
    const tableBody = document.querySelector('#wardStatsTable tbody');
    
    // Clear loading row
    tableBody.innerHTML = '';
    
    if (!window.summaryStats || !window.summaryStats.ward_coverage) {
        console.error("Ward coverage data not available");
        tableBody.innerHTML = '<tr><td colspan="5">Ward data not available</td></tr>';
        return;
    }
    
    // Get ward coverage data
    const wardCoverage = window.summaryStats.ward_coverage;
    
    // Sort wards by priority score (descending)
    const sortedWards = Object.values(wardCoverage).sort((a, b) => b.priority_score - a.priority_score);
    
    // Create table rows
    sortedWards.forEach(ward => {
        const row = document.createElement('tr');
        
        // Ward name
        const nameCell = document.createElement('td');
        nameCell.textContent = ward.ward;
        row.appendChild(nameCell);
        
        // Population
        const popCell = document.createElement('td');
        popCell.textContent = ward.population.toLocaleString();
        row.appendChild(popCell);
        
        // Facilities - use the count from the backend
        const facilitiesCell = document.createElement('td');
        facilitiesCell.textContent = ward.facilities || 0;
        row.appendChild(facilitiesCell);
        
        // Coverage
        const coverageCell = document.createElement('td');
        coverageCell.textContent = `${ward.coverage_percent.toFixed(1)}%`;
        
        // Add color coding based on coverage
        if (ward.coverage_percent < 40) {
            coverageCell.style.color = '#e74c3c'; // Red for low coverage
        } else if (ward.coverage_percent < 70) {
            coverageCell.style.color = '#f39c12'; // Orange for medium coverage
        } else {
            coverageCell.style.color = '#27ae60'; // Green for good coverage
        }
        
        row.appendChild(coverageCell);
        
        // Priority Score
        const priorityCell = document.createElement('td');
        
        // Calculate priority score with a more reasonable scale
        const priorityScore = ward.priority_score;
        
        // Display the priority score
        priorityCell.textContent = priorityScore.toFixed(1);
        
        // Add color coding based on priority score
        if (priorityScore > 7) {
            priorityCell.style.color = '#e74c3c'; // Red for high priority
            priorityCell.style.fontWeight = 'bold';
        } else if (priorityScore > 4) {
            priorityCell.style.color = '#f39c12'; // Orange for medium priority
        } else {
            priorityCell.style.color = '#27ae60'; // Green for low priority
        }
        
        // Add explanation tooltip
        priorityCell.title = `Priority Score: Higher values indicate greater need for healthcare facilities.
Population: ${ward.population.toLocaleString()}
Facilities: ${ward.facilities || 0}
Coverage: ${ward.coverage_percent.toFixed(1)}%`;
        
        row.appendChild(priorityCell);
        
        // Add row to table
        tableBody.appendChild(row);
    });
    
    console.log(`Populated table with ${sortedWards.length} wards`);
}

                    
                    // Initialize the mini map
                    function initializeMiniMap() {
                        // Create a map
                        const map = L.map('miniMap').setView([-0.1, 34.75], 10);
                        
                        // Add base map
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }).addTo(map);
                        
                        // Check if countyData is already an object or a JSON string
                        const countyDataObj = typeof countyData === 'string'
                            ? JSON.parse(countyData)
                            : countyData;
                        
                        // Add county boundary
                        const countyLayer = L.geoJSON(countyDataObj, {
                            style: {
                                color: '#3498db',
                                weight: 2,
                                fillOpacity: 0.1
                            }
                        }).addTo(map);
                        
                        // Check if facilitiesData is already an object or a JSON string
                        const facilitiesDataObj = typeof facilitiesData === 'string'
                            ? JSON.parse(facilitiesData)
                            : facilitiesData;
                        
                        // Add facilities
                        const facilitiesLayer = L.geoJSON(facilitiesDataObj, {
                            pointToLayer: function(feature, latlng) {
                                return L.circleMarker(latlng, {
                                    radius: 4,
                                    fillColor: '#e74c3c',
                                    color: '#c0392b',
                                    weight: 1,
                                    opacity: 1,
                                    fillOpacity: 0.8
                                });
                            }
                        }).addTo(map);
                        
                        // Add underserved areas from analysis results
                        if (summaryStats.underserved_areas) {
                            L.geoJSON(summaryStats.underserved_areas, {
                                style: {
                                    color: '#e74c3c',
                                    fillColor: '#e74c3c',
                                    weight: 1,
                                    fillOpacity: 0.3
                                }
                            }).addTo(map);
                        } else {
                            // Fetch underserved areas from the API
                            fetch('/maps/api/site-suitability-analysis/')
                                .then(response => response.json())
                                .then(data => {
                                    if (data.underserved_area) {
                                        L.geoJSON(data.underserved_area, {
                                            style: {
                                                color: '#e74c3c',
                                                fillColor: '#e74c3c',
                                                weight: 1,
                                                fillOpacity: 0.3
                                            }
                                        }).addTo(map);
                                    }
                                })
                                .catch(error => {
                                    console.error('Error fetching underserved areas:', error);
                                });
                        }
                        
                        // Add coverage gaps if available
                        if (summaryStats.coverage_gaps) {
                            L.geoJSON(summaryStats.coverage_gaps, {
                                style: {
                                    color: '#9b59b6',
                                    fillColor: '#8e44ad',
                                    weight: 1,
                                    fillOpacity: 0.3
                                }
                            }).addTo(map);
                        }
                        
                        // Fit map to county bounds
                        map.fitBounds(countyLayer.getBounds());
                    }
                    
                    // Initialize the optimal locations table
                    function initializeOptimalLocations() {
                        const tableBody = document.getElementById('optimalLocationsTable').getElementsByTagName('tbody')[0];
                        
                        // Check if we have optimal locations in the summary stats
                        if (summaryStats.optimal_locations && summaryStats.optimal_locations.length > 0) {
                            // Add each location to the table
                            summaryStats.optimal_locations.forEach((location, index) => {
                                addOptimalLocationRow(tableBody, location, index + 1);
                            });
                        } else {
                            // Fetch optimal locations from the API
                            fetch('/maps/api/site-suitability-analysis/')
                                .then(response => response.json())
                                .then(data => {
                                    if (data.suitable_sites && data.suitable_sites.features && data.suitable_sites.features.length > 0) {
                                        // Add each location to the table
                                        data.suitable_sites.features.forEach((location, index) => {
                                            addOptimalLocationRow(tableBody, location, index + 1);
                                        });
                                    } else if (data.features && data.features.length > 0) {
                                        // Alternative format
                                        data.features.forEach((location, index) => {
                                            addOptimalLocationRow(tableBody, location, index + 1);
                                        });
                                    } else {
                                        console.error('No suitable sites found in API response');
                                        tableBody.innerHTML = '<tr><td colspan="5">No optimal locations found. Please try again later.</td></tr>';
                                    }
                                })
                                .catch(error => {
                                    console.error('Error fetching optimal locations:', error);
                                    tableBody.innerHTML = '<tr><td colspan="5">Error loading optimal locations. Please try again later.</td></tr>';
                                });
                        }
                    }
                    
                    // Add a row to the optimal locations table
                    function addOptimalLocationRow(tableBody, location, index) {
                        const props = location.properties;
                        const coords = location.geometry.coordinates;
                        
                        // Create table row
                        const row = tableBody.insertRow();
                        
                        // Add cells
                        const locationCell = row.insertCell(0);
                        const wardCell = row.insertCell(1);
                        const populationCell = row.insertCell(2);
                        const scoreCell = row.insertCell(3);
                        const ratingCell = row.insertCell(4);
                        
                        // Format coordinates
                        const lat = coords[1].toFixed(4);
                        const lng = coords[0].toFixed(4);
                        
                        // Add content
                        locationCell.textContent = `Location ${index} (${lat}, ${lng})`;
                        wardCell.textContent = props.ward || 'Unknown';
                        
                        // Use population_served or estimated_population
                        const population = props.population_served || props.estimated_population || 0;
                        populationCell.textContent = population.toLocaleString();
                        
                        // Use composite_score or suitability_score
                        const score = props.composite_score || props.suitability_score || 0;
                        scoreCell.textContent = score.toFixed(2);
                        
                        // Determine rating based on score
                        let rating;
                        let ratingColor;
                        
                        if (score >= 0.8) {
                            rating = 'Excellent';
                            ratingColor = '#4CAF50';
                        } else if (score >= 0.6) {
                            rating = 'Very Good';
                            ratingColor = '#8BC34A';
                        } else if (score >= 0.4) {
                            rating = 'Good';
                            ratingColor = '#CDDC39';
                        } else if (score >= 0.2) {
                            rating = 'Fair';
                            ratingColor = '#FFC107';
                        } else {
                            rating = 'Poor';
                            ratingColor = '#FF9800';
                        }
                        
                        ratingCell.textContent = rating;
                        ratingCell.style.color = ratingColor;
                        ratingCell.style.fontWeight = 'bold';
                        
                        // Add click event to show location on mini map
                        row.style.cursor = 'pointer';
                        row.addEventListener('click', function() {
                            highlightLocationOnMap(coords);
                        });
                    }
                    
                    // Highlight a location on the mini map
                    function highlightLocationOnMap(coords) {
                        const miniMap = document.getElementById('miniMap')._leaflet_map;
                        
                        // Remove any existing highlight marker
                        if (window.highlightMarker) {
                            miniMap.removeLayer(window.highlightMarker);
                        }
                        
                        // Create a new highlight marker
                        window.highlightMarker = L.marker([coords[1], coords[0]], {
                            icon: L.divIcon({
                                className: 'highlight-marker',
                                html: '<div style="background-color: #f1c40f; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #f39c12;"></div>',
                                iconSize: [16, 16],
                                iconAnchor: [8, 8]
                            })
                        }).addTo(miniMap);
                        
                        // Pan to the location
                        miniMap.panTo([coords[1], coords[0]]);
                    }
                    
                    // Generate a comprehensive PDF report
                    function generateReport() {
                        // Show loading indicator
                        const loadingIndicator = document.createElement('div');
                        loadingIndicator.id = 'reportLoadingIndicator';
                        loadingIndicator.style.position = 'fixed';
                        loadingIndicator.style.top = '0';
                        loadingIndicator.style.left = '0';
                        loadingIndicator.style.width = '100%';
                        loadingIndicator.style.height = '100%';
                        loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        loadingIndicator.style.display = 'flex';
                        loadingIndicator.style.justifyContent = 'center';
                        loadingIndicator.style.alignItems = 'center';
                        loadingIndicator.style.zIndex = '9999';
                        loadingIndicator.innerHTML = `
                            <div style="background-color: white; padding: 20px; border-radius: 5px; text-align: center;">
                                <h3>Generating Report...</h3>
                                <p>This may take a few moments.</p>
                                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; margin: 10px auto; animation: spin 2s linear infinite;"></div>
                            </div>
                            <style>
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            </style>
                        `;
                        document.body.appendChild(loadingIndicator);
                        
                        // Use html2canvas and jsPDF to generate the report
                        setTimeout(() => {
                            try {
                                import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
                                .then(() => import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'))
                                .then(() => {
                                    const { jsPDF } = window.jspdf;
                                    const doc = new jsPDF('p', 'mm', 'a4');
                                    const pageWidth = doc.internal.pageSize.getWidth();
                                    const pageHeight = doc.internal.pageSize.getHeight();
                                    const margin = 10;
                                    let yPosition = margin;
                                    
                                    // Add title
                                    doc.setFontSize(18);
                                    doc.setTextColor(0, 51, 102);
                                    doc.text('Kisumu County Healthcare Facilities Analysis Report', pageWidth / 2, yPosition, { align: 'center' });
                                    yPosition += 10;
                                    
                                    // Add date
                                    doc.setFontSize(10);
                                    doc.setTextColor(100, 100, 100);
                                    const today = new Date();
                                    doc.text(`Generated on: ${today.toLocaleDateString()} at ${today.toLocaleTimeString()}`, pageWidth / 2, yPosition, { align: 'center' });
                                    yPosition += 15;
                                    
                                    // Add summary section
                                    doc.setFontSize(14);
                                    doc.setTextColor(0, 0, 0);
                                    doc.text('Executive Summary', margin, yPosition);
                                    yPosition += 7;
                                    
                                    doc.setFontSize(10);
                                    doc.setTextColor(60, 60, 60);
                                    const summaryText = `This report provides an analysis of healthcare facilities in Kisumu County, Kenya.
                                    The county has a total of ${summaryStats.total_facilities || 'N/A'} healthcare facilities serving a population of
                                    ${(summaryStats.total_population || 0).toLocaleString()} people (2019 census). The analysis shows that approximately
                                    ${summaryStats.coverage_stats && summaryStats.coverage_stats.coverage_percent ?
                                      summaryStats.coverage_stats.coverage_percent.toFixed(1) : 'N/A'}% of the population
                                    has access to healthcare facilities within a 5km radius.`;
                                    
                                    const splitSummary = doc.splitTextToSize(summaryText, pageWidth - (margin * 2));
                                    doc.text(splitSummary, margin, yPosition);
                                    yPosition += splitSummary.length * 5;
                                    
                                    // Add key findings
                                    yPosition += 5;
                                    doc.setFontSize(14);
                                    doc.text('Key Findings', margin, yPosition);
                                    yPosition += 7;
                                    
                                    doc.setFontSize(10);
                                    const findings = [
                                        `Population Coverage: ${summaryStats.coverage_stats && summaryStats.coverage_stats.coverage_percent ?
                                          summaryStats.coverage_stats.coverage_percent.toFixed(1) : 'N/A'}% of the population has access to healthcare within 5km.`,
                                        `Underserved Areas: ${summaryStats.coverage_stats && summaryStats.coverage_stats.underserved_count ?
                                          summaryStats.coverage_stats.underserved_count : 'Several'} areas identified with limited healthcare access.`,
                                        `Facility Distribution: Healthcare facilities are ${summaryStats.distribution_quality || 'unevenly'} distributed across the county.`,
                                        `Priority Wards: ${summaryStats.priority_wards ? summaryStats.priority_wards.join(', ') : 'Several wards'} require additional healthcare facilities.`
                                    ];
                                    
                                    findings.forEach(finding => {
                                        const splitFinding = doc.splitTextToSize(`• ${finding}`, pageWidth - (margin * 2) - 2);
                                        doc.text(splitFinding, margin + 2, yPosition);
                                        yPosition += splitFinding.length * 5;
                                    });
                                    
                                    // Capture and add the mini map
                                    yPosition += 5;
                                    doc.setFontSize(14);
                                    doc.text('Geographical Overview', margin, yPosition);
                                    yPosition += 10;
                                    
                                    html2canvas(document.getElementById('miniMap'), { useCORS: true }).then(canvas => {
                                        const imgData = canvas.toDataURL('image/png');
                                        const imgWidth = pageWidth - (margin * 2);
                                        const imgHeight = (canvas.height * imgWidth) / canvas.width;
                                        
                                        // Check if we need a new page
                                        if (yPosition + imgHeight > pageHeight - margin) {
                                            doc.addPage();
                                            yPosition = margin;
                                        }
                                        
                                        doc.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                                        yPosition += imgHeight + 10;
                                        
                                        // Add facility statistics
                                        doc.setFontSize(14);
                                        doc.text('Facility Statistics', margin, yPosition);
                                        yPosition += 7;
                                        
                                        // Capture and add the facility stats chart
                                        html2canvas(document.getElementById('facilityTypeChart')).then(canvas => {
                                            const imgData = canvas.toDataURL('image/png');
                                            const imgWidth = pageWidth - (margin * 2);
                                            const imgHeight = (canvas.height * imgWidth) / canvas.width;
                                            
                                            // Check if we need a new page
                                            if (yPosition + imgHeight > pageHeight - margin) {
                                                doc.addPage();
                                                yPosition = margin;
                                            }
                                            
                                            doc.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                                            yPosition += imgHeight + 10;
                                            
                                            // Add coverage analysis
                                            doc.setFontSize(14);
                                            doc.text('Coverage Analysis', margin, yPosition);
                                            yPosition += 7;
                                            
                                            // Capture and add the coverage chart
                                            html2canvas(document.getElementById('coverageChart')).then(canvas => {
                                                const imgData = canvas.toDataURL('image/png');
                                                const imgWidth = pageWidth - (margin * 2);
                                                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                                                
                                                // Check if we need a new page
                                                if (yPosition + imgHeight > pageHeight - margin) {
                                                    doc.addPage();
                                                    yPosition = margin;
                                                }
                                                
                                                doc.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
                                                yPosition += imgHeight + 10;
                                                
                                                // Add optimal locations section
                                                doc.addPage();
                                                yPosition = margin;
                                                
                                                doc.setFontSize(14);
                                                doc.text('Recommended New Facility Locations', margin, yPosition);
                                                yPosition += 7;
                                                
                                                doc.setFontSize(10);
                                                const optimalText = `Based on the analysis of population density, existing healthcare coverage,
                                                and accessibility factors, the following locations are recommended for new healthcare facilities.
                                                These recommendations aim to maximize population coverage and reduce healthcare disparities
                                                across Kisumu County.`;
                                                
                                                const splitOptimal = doc.splitTextToSize(optimalText, pageWidth - (margin * 2));
                                                doc.text(splitOptimal, margin, yPosition);
                                                yPosition += splitOptimal.length * 5 + 5;
                                                
                                                // Create a table for optimal locations
                                                const optimalLocations = document.getElementById('optimalLocationsTable');
                                                const rows = optimalLocations.querySelectorAll('tbody tr');
                                                
                                                // Table headers
                                                doc.setFontSize(10);
                                                doc.setTextColor(255, 255, 255);
                                                doc.setFillColor(41, 128, 185);
                                                doc.rect(margin, yPosition, pageWidth - (margin * 2), 7, 'F');
                                                
                                                doc.text('Location', margin + 5, yPosition + 5);
                                                doc.text('Ward', margin + 50, yPosition + 5);
                                                doc.text('Population', margin + 90, yPosition + 5);
                                                doc.text('Score', margin + 130, yPosition + 5);
                                                doc.text('Rating', margin + 150, yPosition + 5);
                                                
                                                yPosition += 10;
                                                
                                                // Table rows
                                                doc.setTextColor(0, 0, 0);
                                                let rowCount = 0;
                                                
                                                Array.from(rows).slice(0, 5).forEach(row => {
                                                    const cells = row.querySelectorAll('td');
                                                    
                                                    // Alternate row colors
                                                    if (rowCount % 2 === 0) {
                                                        doc.setFillColor(240, 240, 240);
                                                        doc.rect(margin, yPosition - 5, pageWidth - (margin * 2), 7, 'F');
                                                    }
                                                    
                                                    doc.text(cells[0].textContent, margin + 5, yPosition);
                                                    doc.text(cells[1].textContent, margin + 50, yPosition);
                                                    doc.text(cells[2].textContent, margin + 90, yPosition);
                                                    doc.text(cells[3].textContent, margin + 130, yPosition);
                                                    
                                                    // Rating with color
                                                    const rating = cells[4].textContent;
                                                    let ratingColor;
                                                    
                                                    switch (rating) {
                                                        case 'Excellent': ratingColor = [76, 175, 80]; break;
                                                        case 'Very Good': ratingColor = [139, 195, 74]; break;
                                                        case 'Good': ratingColor = [205, 220, 57]; break;
                                                        case 'Fair': ratingColor = [255, 193, 7]; break;
                                                        default: ratingColor = [255, 152, 0];
                                                    }
                                                    
                                                    doc.setTextColor(ratingColor[0], ratingColor[1], ratingColor[2]);
                                                    doc.text(rating, margin + 150, yPosition);
                                                    doc.setTextColor(0, 0, 0);
                                                    
                                                    yPosition += 7;
                                                    rowCount++;
                                                });
                                                
                                                // Add recommendations section
                                                yPosition += 10;
                                                doc.setFontSize(14);
                                                doc.text('Recommendations', margin, yPosition);
                                                yPosition += 7;
                                                
                                                doc.setFontSize(10);
                                                const recommendations = [
                                                    'Prioritize establishing new healthcare facilities in the identified underserved areas.',
                                                    'Improve transportation infrastructure to enhance accessibility to existing facilities.',
                                                    'Consider mobile healthcare units for remote areas with low population density.',
                                                    'Upgrade existing facilities in high-demand areas to handle increased patient loads.',
                                                    'Implement community health worker programs to extend healthcare reach.'
                                                ];
                                                
                                                recommendations.forEach(recommendation => {
                                                    const splitRecommendation = doc.splitTextToSize(`• ${recommendation}`, pageWidth - (margin * 2) - 2);
                                                    doc.text(splitRecommendation, margin + 2, yPosition);
                                                    yPosition += splitRecommendation.length * 5;
                                                });
                                                
                                                // Add footer
                                                doc.setFontSize(8);
                                                doc.setTextColor(100, 100, 100);
                                                const pageCount = doc.internal.getNumberOfPages();
                                                
                                                for (let i = 1; i <= pageCount; i++) {
                                                    doc.setPage(i);
                                                    doc.text(`Kisumu County Healthcare Analysis Report - Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
                                                }
                                                
                                                // Save the PDF
                                                doc.save('Kisumu_Healthcare_Analysis_Report.pdf');
                                                
                                                // Remove loading indicator
                                                document.body.removeChild(loadingIndicator);
                                            });
                                        });
                                    });
                                });
                        } catch (error) {
                            console.error('Error generating report:', error);
                            // Remove loading indicator
                            document.body.removeChild(loadingIndicator);
                            
                            // Show error message
                            alert('Error generating report. Please try again later.');
                        }
                    }, 500);
                }
                 
                    
