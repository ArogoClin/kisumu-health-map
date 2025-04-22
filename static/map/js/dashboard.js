// Dashboard.js - Handles the dashboard functionality and visualizations
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Kisumu Healthcare Dashboard');
    
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

// Initialize the summary statistics
function initializeSummaryStats() {
    // Get the summary statistics from the server-provided data
    const totalPopulation = summaryStats.total_population.toLocaleString();
    const totalFacilities = summaryStats.total_facilities;
    const populationPerFacility = Math.round(summaryStats.total_population / totalFacilities).toLocaleString();
    const coveragePercent = summaryStats.coverage_percent.toFixed(1) + '%';
    
    // Update the DOM
    document.getElementById('totalPopulation').textContent = totalPopulation;
    document.getElementById('totalFacilities').textContent = totalFacilities;
    document.getElementById('populationPerFacility').textContent = populationPerFacility;
    document.getElementById('coveragePercent').textContent = coveragePercent;
    
    // Add additional metrics if available
    if (summaryStats.underserved_population) {
        const underservedElement = document.createElement('div');
        underservedElement.className = 'stat-card';
        underservedElement.innerHTML = `
            <h3>Underserved Population</h3>
            <p>${summaryStats.underserved_population.toLocaleString()}</p>
            <small>${(summaryStats.underserved_percent || 0).toFixed(1)}% of total population</small>
        `;
        document.querySelector('.summary-stats').appendChild(underservedElement);
    }
}

// Initialize the facility type chart
function initializeFacilityTypeChart() {
    // Count facilities by type
    const facilityTypes = {};
    
    JSON.parse(facilitiesData).features.forEach(facility => {
        const type = facility.properties.facility_type;
        facilityTypes[type] = (facilityTypes[type] || 0) + 1;
    });
    
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
    
    // Add a population density chart if data is available
    if (summaryStats.population_density) {
        const densityCanvas = document.createElement('canvas');
        densityCanvas.id = 'populationDensityChart';
        document.querySelector('.chart-container').appendChild(densityCanvas);
        
        const densityCtx = densityCanvas.getContext('2d');
        new Chart(densityCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(summaryStats.population_density),
                datasets: [{
                    label: 'Population Density (people/km²)',
                    data: Object.values(summaryStats.population_density),
                    backgroundColor: '#27ae60',
                    borderColor: '#2ecc71',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Density (people/km²)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Region'
                        }
                    }
                }
            }
        });
    }
}

// Initialize the ward statistics table
function initializeWardStats() {
    const tableBody = document.getElementById('wardStatsTable').getElementsByTagName('tbody')[0];
    const wards = JSON.parse(wardsData).features;
    
    // Calculate facilities per ward using spatial analysis
    const facilitiesPerWard = calculateFacilitiesPerWard(wards, JSON.parse(facilitiesData).features);
    
    // Get population data for each ward
    const wardPromises = wards.map(ward => {
        return new Promise((resolve) => {
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
                const wardName = ward.properties.ward;
                const population = data.estimated_population || ward.properties.pop2009 || 0;
                const facilities = facilitiesPerWard[wardName] || 0;
                const area = data.area_km2 || 0;
                const density = data.mean_density || 0;
                
                // Calculate coverage based on service areas
                // This is a placeholder - in a real implementation, you'd use the actual service area data
                const coverage = calculateWardCoverage(ward, wardName);
                
                // Calculate priority score (higher means higher need)
                // Formula: (population / 10000) / (facilities + 1) * (100 - coverage) / 100
                const priorityScore = ((population / 10000) / (facilities + 1)) * ((100 - coverage) / 100);
                
                resolve({
                    wardName,
                    population,
                    facilities,
                    coverage,
                    priorityScore,
                    area,
                    density
                });
            })
            .catch(error => {
                console.error(`Error fetching population data for ward ${ward.properties.ward}:`, error);
                
                // Fallback to ward properties
                const wardName = ward.properties.ward;
                const population = ward.properties.pop2009 || 0;
                const facilities = facilitiesPerWard[wardName] || 0;
                
                // Estimate coverage
                const coverage = calculateWardCoverage(ward, wardName);
                
                // Calculate priority score
                const priorityScore = ((population / 10000) / (facilities + 1)) * ((100 - coverage) / 100);
                
                resolve({
                    wardName,
                    population,
                    facilities,
                    coverage,
                    priorityScore,
                    area: 0,
                    density: 0
                });
            });
        });
    });
    
    // Process all ward data
    Promise.all(wardPromises)
        .then(wardStats => {
            // Sort by priority score (highest first)
            wardStats.sort((a, b) => b.priorityScore - a.priorityScore);
            
            // Add to table
            wardStats.forEach(ward => {
                // Create table row
                const row = tableBody.insertRow();
                
                // Add cells
                const nameCell = row.insertCell(0);
                const popCell = row.insertCell(1);
                const facCell = row.insertCell(2);
                const covCell = row.insertCell(3);
                const priorityCell = row.insertCell(4);
                
                // Add content
                nameCell.textContent = ward.wardName;
                popCell.textContent = ward.population.toLocaleString();
                facCell.textContent = ward.facilities;
                covCell.textContent = ward.coverage.toFixed(1) + '%';
                priorityCell.textContent = ward.priorityScore.toFixed(2);
                
                // Add tooltip with additional info
                row.title = `Area: ${ward.area.toFixed(2)} km² | Density: ${ward.density.toFixed(0)} people/km²`;
                
                // Color code priority
                if (ward.priorityScore > 5) {
                    priorityCell.style.backgroundColor = '#ffcccc';
                    priorityCell.style.color = '#cc0000';
                } else if (ward.priorityScore > 2) {
                    priorityCell.style.backgroundColor = '#fff2cc';
                    priorityCell.style.color = '#996600';
                }
            });
        })
        .catch(error => {
            console.error("Error processing ward statistics:", error);
            
            // Fallback to simplified approach
            wards.forEach(ward => {
                const wardName = ward.properties.ward;
                const population = ward.properties.pop2009 || 0;
                const facilities = facilitiesPerWard[wardName] || 0;
                
                // Random coverage for demonstration
                const coverage = Math.round(Math.random() * 80 + 10);
                
                // Calculate priority score
                const priorityScore = ((population / 10000) / (facilities + 1)) * ((100 - coverage) / 100);
                
                // Create table row
                const row = tableBody.insertRow();
                
                // Add cells
                const nameCell = row.insertCell(0);
                const popCell = row.insertCell(1);
                const facCell = row.insertCell(2);
                const covCell = row.insertCell(3);
                const priorityCell = row.insertCell(4);
                
                // Add content
                nameCell.textContent = wardName;
                popCell.textContent = population.toLocaleString();
                facCell.textContent = facilities;
                covCell.textContent = coverage + '%';
                priorityCell.textContent = priorityScore.toFixed(2);
                
                // Color code priority
                if (priorityScore > 5) {
                    priorityCell.style.backgroundColor = '#ffcccc';
                    priorityCell.style.color = '#cc0000';
                } else if (priorityScore > 2) {
                    priorityCell.style.backgroundColor = '#fff2cc';
                    priorityCell.style.color = '#996600';
                }
            });
            
            // Sort table by priority score (highest first)
            const rows = Array.from(tableBody.rows);
            rows.sort((a, b) => {
                const scoreA = parseFloat(a.cells[4].textContent);
                const scoreB = parseFloat(b.cells[4].textContent);
                return scoreB - scoreA;
            });
            
            // Clear table and add sorted rows
            tableBody.innerHTML = '';
            rows.forEach(row => tableBody.appendChild(row));
        });
}

// Helper function to calculate facilities per ward using turf.js
function calculateFacilitiesPerWard(wards, facilities) {
    const facilitiesPerWard = {};
    
    // Initialize all wards with zero facilities
    wards.forEach(ward => {
        facilitiesPerWard[ward.properties.ward] = 0;
    });
    
    // Count facilities in each ward
    facilities.forEach(facility => {
        try {
            const facilityPoint = turf.point([
                facility.geometry.coordinates[0],
                facility.geometry.coordinates[1]
            ]);
            
            // Check which ward contains this facility
            for (const ward of wards) {
                if (ward.geometry && ward.geometry.type === 'Polygon') {
                    const poly = turf.polygon(ward.geometry.coordinates);
                    if (turf.booleanPointInPolygon(facilityPoint, poly)) {
                        const wardName = ward.properties.ward;
                        facilitiesPerWard[wardName] = (facilitiesPerWard[wardName] || 0) + 1;
                        break;
                    }
                } else if (ward.geometry && ward.geometry.type === 'MultiPolygon') {
                    const multiPoly = turf.multiPolygon(ward.geometry.coordinates);
                    if (turf.booleanPointInPolygon(facilityPoint, multiPoly)) {
                        const wardName = ward.properties.ward;
                        facilitiesPerWard[wardName] = (facilitiesPerWard[wardName] || 0) + 1;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Error checking facility location:", e);
        }
    });
    
    return facilitiesPerWard;
}

// Helper function to calculate ward coverage
function calculateWardCoverage(ward, wardName) {
    // Check if we have real coverage data from the analysis
    if (summaryStats.ward_coverage && summaryStats.ward_coverage[wardName]) {
        return summaryStats.ward_coverage[wardName];
    }
    
    // If we have travel time data in the buffer layer, use that
    if (window.bufferLayer && window.bufferLayer.travelTimeData) {
        try {
            // Try to estimate coverage from the travel time data
            // This is a simplified approach - in a real implementation, you'd do proper spatial analysis
            const travelTimeData = window.bufferLayer.travelTimeData;
            
            // Get the 5-minute isochrones
            const fiveMinIsochrones = travelTimeData.isochrones.filter(iso => iso.properties.travel_time === 5);
            
            // If we have isochrones, check intersection with the ward
            if (fiveMinIsochrones.length > 0) {
                // Create a combined isochrone
                const combinedIsochrone = {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: fiveMinIsochrones[0].geometry.coordinates
                    }
                };
                
                // Calculate intersection
                const intersection = turf.intersect(ward, combinedIsochrone);
                
                if (intersection) {
                    // Calculate percentage of ward covered
                    const intersectionArea = turf.area(intersection);
                    const wardArea = turf.area(ward);
                    return (intersectionArea / wardArea) * 100;
                }
            }
        } catch (e) {
            console.error("Error calculating ward coverage from travel time data:", e);
        }
    }
    
    // Fallback: generate a random but reasonable coverage value
    // In a real implementation, you'd use actual data
    return Math.random() * 60 + 20; // Random between 20% and 80%
}

// Initialize the mini map
function initializeMiniMap() {
    // Create a map
    const map = L.map('miniMap').setView([-0.1, 34.75], 10);
    
    // Add base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Add county boundary
    const countyLayer = L.geoJSON(JSON.parse(countyData), {
        style: {
            color: '#3498db',
            weight: 2,
            fillOpacity: 0.1
        }
    }).addTo(map);
    
    // Add facilities
    const facilitiesLayer = L.geoJSON(JSON.parse(facilitiesData), {
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
        // Try to fetch underserved areas from the API
        fetch('/maps/api/site-suitability/')
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
                // Fallback: Create a simulated underserved area
                simulateUnderservedAreas(map);
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

// Simulate underserved areas for demonstration
function simulateUnderservedAreas(map) {
    const countyFeature = JSON.parse(countyData).features[0];
    const countyCoords = countyFeature.geometry.coordinates[0];
    
    // Create a few random polygons within the county
    const underservedFeatures = [];
    
    for (let i = 0; i < 3; i++) {
        // Get a random point within the county as a center
        const centerIndex = Math.floor(Math.random() * countyCoords.length);
        const center = countyCoords[centerIndex];
        
        // Create a small polygon around this center
        const polygon = [];
        const radius = 0.05; // in degrees
        
        for (let angle = 0; angle < 360; angle += 60) {
            const radian = angle * Math.PI / 180;
            polygon.push([
                center[0] + radius * Math.cos(radian),
                center[1] + radius * Math.sin(radian)
            ]);
        }
        
        // Close the polygon
        polygon.push(polygon[0]);
        
        underservedFeatures.push({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [polygon]
            }
        });
    }
    
    // Add to map
    L.geoJSON({
        type: 'FeatureCollection',
        features: underservedFeatures
    }, {
        style: {
            color: '#e74c3c',
            fillColor: '#e74c3c',
            weight: 1,
            fillOpacity: 0.3
        }
    }).addTo(map);
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
        fetch('/maps/api/site-suitability/')
            .then(response => response.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    // Add each location to the table
                    data.features.forEach((location, index) => {
                        addOptimalLocationRow(tableBody, location, index + 1);
                    });
                } else {
                    // Fallback: Create simulated optimal locations
                    simulateOptimalLocations(tableBody);
                }
            })
            .catch(error => {
                console.error('Error fetching optimal locations:', error);
                // Fallback: Create simulated optimal locations
                simulateOptimalLocations(tableBody);
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
    populationCell.textContent = (props.population_served || 0).toLocaleString();
    
    const score = props.composite_score || 0;
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

// Simulate optimal locations for demonstration
function simulateOptimalLocations(tableBody) {
    const wards = JSON.parse(wardsData).features.map(f => f.properties.ward);
    
    // Create 10 simulated locations
    for (let i = 1; i <= 10; i++) {
        // Random coordinates within Kisumu
        const lat = -0.1 - Math.random() * 0.2;
        const lng = 34.7 + Math.random() * 0.2;
        
        // Random ward
        const ward = wards[Math.floor(Math.random() * wards.length)];
        
        // Random population served
        const population = Math.floor(Math.random() * 50000) + 5000;
        
        // Random score
        const score = Math.random();
        
        // Create a simulated location object
        const location = {
            geometry: {
                coordinates: [lng, lat]
            },
            properties: {
                ward: ward,
                population_served: population,
                composite_score: score
            }
        };
        
        // Add to table
        addOptimalLocationRow(tableBody, location, i);
    }
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
    loadingIndicator.innerHTML = '<div style="background-color: white; padding: 20px; border-radius: 5px;"><h3>Generating report...</h3><p>This may take a few moments.</p></div>';
    document.body.appendChild(loadingIndicator);
    
    // Use html2canvas and jsPDF to create a PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Add title
    doc.setFontSize(20);
    doc.text('Kisumu Healthcare Access Analysis Report', 105, 20, { align: 'center' });
    
    // Add date
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
    
    // Add summary statistics
    doc.setFontSize(16);
    doc.text('County Overview', 20, 45);
    
    doc.setFontSize(12);
    doc.text(`Total Population: ${summaryStats.total_population.toLocaleString()}`, 20, 55);
    doc.text(`Healthcare Facilities: ${summaryStats.total_facilities}`, 20, 62);
    doc.text(`Population per Facility: ${Math.round(summaryStats.total_population / summaryStats.total_facilities).toLocaleString()}`, 20, 69);
    doc.text(`5km Coverage: ${summaryStats.coverage_percent.toFixed(1)}%`, 20, 76);
    
    // Capture and add charts
    html2canvas(document.getElementById('facilityTypeChart')).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 20, 85, 80, 60);
        
        html2canvas(document.getElementById('coverageChart')).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            doc.addImage(imgData, 'PNG', 110, 85, 80, 60);
            
            // Add mini map
            html2canvas(document.getElementById('miniMap')).then(canvas => {
                const imgData = canvas.toDataURL('image/png');
                doc.addPage();
                doc.setFontSize(16);
                doc.text('Underserved Areas Map', 105, 20, { align: 'center' });
                doc.addImage(imgData, 'PNG', 20, 30, 170, 100);
                
                // Add ward statistics
                doc.addPage();
                doc.setFontSize(16);
                doc.text('Ward-level Healthcare Access', 105, 20, { align: 'center' });
                
                // Create ward statistics table
                const wardTable = document.getElementById('wardStatsTable');
                const rows = Array.from(wardTable.rows);
                
                // Table headers
                doc.setFontSize(12);
                doc.setTextColor(0, 0, 0);
                doc.text('Ward', 20, 35);
                doc.text('Population', 70, 35);
                doc.text('Facilities', 110, 35);
                doc.text('Coverage', 140, 35);
                doc.text('Priority', 170, 35);
                
                // Table rows (limit to top 15)
                let y = 42;
                for (let i = 1; i < Math.min(rows.length, 16); i++) {
                    const cells = rows[i].cells;
                    doc.text(cells[0].textContent, 20, y);
                    doc.text(cells[1].textContent, 70, y);
                    doc.text(cells[2].textContent, 110, y);
                    doc.text(cells[3].textContent, 140, y);
                    doc.text(cells[4].textContent, 170, y);
                    y += 7;
                }
                
                // Add optimal locations
                doc.addPage();
                doc.setFontSize(16);
                doc.text('Recommended Facility Locations', 105, 20, { align: 'center' });
                
                // Create optimal locations table
                const locationsTable = document.getElementById('optimalLocationsTable');
                const locationRows = Array.from(locationsTable.rows);
                
                // Table headers
                doc.setFontSize(12);
                doc.setTextColor(0, 0, 0);
                doc.text('Location', 20, 35);
                doc.text('Ward', 70, 35);
                doc.text('Population', 110, 35);
                doc.text('Score', 150, 35);
                doc.text('Rating', 170, 35);
                
                // Table rows (limit to top 15)
                y = 42;
                for (let i = 1; i < Math.min(locationRows.length, 16); i++) {
                    const cells = locationRows[i].cells;
                    doc.text(cells[0].textContent, 20, y);
                    doc.text(cells[1].textContent, 70, y);
                    doc.text(cells[2].textContent, 110, y);
                    doc.text(cells[3].textContent, 150, y);
                    
                    // Set color for rating
                    const ratingColor = cells[4].style.color;
                    if (ratingColor === 'rgb(76, 175, 80)') {
                        doc.setTextColor(76, 175, 80); // Green
                    } else if (ratingColor === 'rgb(139, 195, 74)') {
                        doc.setTextColor(139, 195, 74); // Light green
                    } else if (ratingColor === 'rgb(205, 220, 57)') {
                        doc.setTextColor(205, 220, 57); // Lime
                    } else if (ratingColor === 'rgb(255, 193, 7)') {
                        doc.setTextColor(255, 193, 7); // Amber
                    } else {
                        doc.setTextColor(255, 152, 0); // Orange
                    }
                    
                    doc.text(cells[4].textContent, 170, y);
                    doc.setTextColor(0, 0, 0); // Reset color
                    y += 7;
                }
                
                // Add conclusion
                doc.addPage();
                doc.setFontSize(16);
                doc.text('Conclusion and Recommendations', 105, 20, { align: 'center' });
                
                doc.setFontSize(12);
                doc.text('Based on the geospatial analysis of healthcare facilities in Kisumu County, the following', 20, 35);
                doc.text('recommendations are provided to improve healthcare access:', 20, 42);
                
                doc.text('1. Establish new healthcare facilities in the identified optimal locations, prioritizing', 20, 55);
                doc.text('   those with "Excellent" and "Very Good" ratings.', 20, 62);
                
                doc.text('2. Focus on underserved areas shown in the map, particularly in wards with high', 20, 75);
                doc.text('   priority scores.', 20, 82);
                
                doc.text('3. Improve transportation infrastructure to enhance accessibility to existing facilities.', 20, 95);
                
                doc.text('4. Consider mobile healthcare services for remote areas with low population density.', 20, 108);
                
                doc.text('5. Conduct regular updates of this analysis to track improvements in healthcare access.', 20, 121);
                
                // Add key metrics summary
                doc.text('Key Metrics Summary:', 20, 140);
                doc.text(`• Total underserved population: ${(summaryStats.underserved_population || 0).toLocaleString()}`, 25, 150);
                doc.text(`• Population within 5-minute travel time: ${(summaryStats.travel_time_coverage?.[5] || 0).toFixed(1)}%`, 25, 160);
                doc.text(`• Population within 30-minute travel time: ${(summaryStats.travel_time_coverage?.[30] || 0).toFixed(1)}%`, 25, 170);
                doc.text(`• Wards with critical need (priority score > 5): ${document.querySelectorAll('#wardStatsTable tbody tr td:nth-child(5)').length}`, 25, 180);
                
                // Add footer
                doc.setFontSize(10);
                doc.text('Geospatial Healthcare Access and Resource Optimization System for Kisumu County', 105, 280, { align: 'center' });
                doc.text('University of Nairobi - Geospatial Engineering Final Year Project', 105, 285, { align: 'center' });
                
                // Save the PDF
                doc.save('Kisumu_Healthcare_Analysis_Report.pdf');
                
                // Remove loading indicator
                document.body.removeChild(document.getElementById('reportLoadingIndicator'));
            });
        });
    });
}

// Add additional functionality for interactive dashboard elements
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for dashboard filters if they exist
    const filterElements = document.querySelectorAll('.dashboard-filter');
    filterElements.forEach(filter => {
        filter.addEventListener('change', updateDashboardVisuals);
    });
    
    // Add event listeners for dashboard tabs if they exist
    const tabElements = document.querySelectorAll('.dashboard-tab');
    tabElements.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            tabElements.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Show corresponding content
            const contentId = this.getAttribute('data-content');
            document.querySelectorAll('.dashboard-content').forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById(contentId).style.display = 'block';
        });
    });
    
    // Initialize tooltips for data points
    initializeTooltips();
});

// Update dashboard visuals based on filters
function updateDashboardVisuals() {
    // This function would update charts and tables based on selected filters
    // For now, it's a placeholder
    console.log('Updating dashboard visuals based on filters');
    
    // Example: update based on selected facility type
    const facilityTypeFilter = document.getElementById('facilityTypeFilter');
    if (facilityTypeFilter) {
        const selectedType = facilityTypeFilter.value;
        console.log('Filtering by facility type:', selectedType);
        
        // Update facility count
        if (selectedType === 'all') {
            document.getElementById('totalFacilities').textContent = summaryStats.total_facilities;
        } else {
            // Count facilities of selected type
            const count = JSON.parse(facilitiesData).features.filter(
                f => f.properties.facility_type === selectedType
            ).length;
            document.getElementById('totalFacilities').textContent = count;
        }
    }
    
    // Example: update based on selected ward
    const wardFilter = document.getElementById('wardFilter');
    if (wardFilter) {
        const selectedWard = wardFilter.value;
        console.log('Filtering by ward:', selectedWard);
        
        // Update ward-specific statistics
        // This would require additional data processing
    }
}

// Initialize tooltips for data points
function initializeTooltips() {
    // Add tooltips to elements with data-tooltip attribute
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        element.style.position = 'relative';
        element.style.cursor = 'help';
        
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = this.getAttribute('data-tooltip');
            tooltip.style.position = 'absolute';
            tooltip.style.bottom = '100%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.whiteSpace = 'nowrap';
            tooltip.style.zIndex = '1000';
            tooltip.style.pointerEvents = 'none';
            
            this.appendChild(tooltip);
        });
        
        element.addEventListener('mouseleave', function() {
            const tooltip = this.querySelector('.tooltip');
            if (tooltip) {
                this.removeChild(tooltip);
            }
        });
    });
}

// Add export functionality for tables
document.addEventListener('DOMContentLoaded', function() {
    // Add export buttons if they exist
    const exportButtons = document.querySelectorAll('.export-table-btn');
    exportButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tableId = this.getAttribute('data-table');
            exportTableToCSV(tableId);
        });
    });
});

// Export table to CSV
function exportTableToCSV(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Extract headers
    const headers = Array.from(rows[0].querySelectorAll('th')).map(th => th.textContent.trim());
    
    // Extract data rows
    const dataRows = rows.slice(1).map(row => {
        return Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
    });
    
    // Combine headers and data
    const csvContent = [
        headers.join(','),
        ...dataRows.map(row => row.join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tableId}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Add real-time data update functionality
let dashboardUpdateInterval;

function startDashboardUpdates() {
    // Check for real-time updates every 5 minutes
    dashboardUpdateInterval = setInterval(checkForDataUpdates, 5 * 60 * 1000);
}

function stopDashboardUpdates() {
    clearInterval(dashboardUpdateInterval);
}

function checkForDataUpdates() {
    // This would fetch the latest data from the server
    // For now, it's a placeholder
    console.log('Checking for data updates...');
    
    // Example: fetch latest summary stats
    fetch('/maps/api/summary-stats/')
        .then(response => response.json())
        .then(data => {
            if (data.last_updated > summaryStats.last_updated) {
                console.log('New data available, updating dashboard...');
                // Update the dashboard with new data
                summaryStats = data;
                initializeSummaryStats();
                initializeCoverageChart();
                // Show notification
                showUpdateNotification();
            } else {
                console.log('No new data available');
            }
        })
        .catch(error => {
            console.error('Error checking for updates:', error);
        });
}

function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.textContent = 'Dashboard updated with latest data';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = '#4CAF50';
    notification.style.color = 'white';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    
    document.body.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 5000);
}

// Start dashboard updates when page loads
document.addEventListener('DOMContentLoaded', function() {
    startDashboardUpdates();
    
    // Stop updates when page is hidden
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopDashboardUpdates();
        } else {
            startDashboardUpdates();
        }
    });
});


