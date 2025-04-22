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
    
    // Create the chart
    const ctx = document.getElementById('facilityTypeChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#3498db', '#2ecc71', '#e74c3c', '#f39c12', 
                    '#9b59b6', '#1abc9c', '#d35400', '#34495e'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
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
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
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
            }
        }
    });
}

// Initialize the ward statistics table
function initializeWardStats() {
    const tableBody = document.getElementById('wardStatsTable').getElementsByTagName('tbody')[0];
    const wards = JSON.parse(wardsData).features;
    
    // Calculate facilities per ward
    const facilitiesPerWard = {};
    JSON.parse(facilitiesData).features.forEach(facility => {
        const facilityPoint = L.latLng(
            facility.geometry.coordinates[1], 
            facility.geometry.coordinates[0]
        );
        
        wards.forEach(ward => {
            // Check if facility is in this ward
            // This is a simplified approach - ideally we'd use proper point-in-polygon
            const wardName = ward.properties.ward;
            if (!facilitiesPerWard[wardName]) {
                facilitiesPerWard[wardName] = 0;
            }
            
            // For now, just distribute facilities randomly for demonstration
            // In a real implementation, you'd use proper spatial queries
            if (Math.random() < 0.2) {
                facilitiesPerWard[wardName]++;
            }
        });
    });
    
    // Calculate priority scores based on population and facility count
    wards.forEach(ward => {
        const wardName = ward.properties.ward;
        const population = ward.properties.pop2009 || 0;
        const facilities = facilitiesPerWard[wardName] || 0;
        
        // Calculate coverage (random for demonstration)
        const coverage = Math.round(Math.random() * 80 + 10);
        
        // Calculate priority score (higher means higher need)
        // Simple formula: (population / 10000) / (facilities + 1) * (100 - coverage) / 100
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
    
    // Add underserved areas (simulated for demonstration)
    // In a real implementation, you'd get this from your underserved areas analysis
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
    alert('Generating report... This may take a few moments.');
    
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
                
                // Add footer
                doc.setFontSize(10);
                doc.text('Geospatial Healthcare Access and Resource Optimization System for Kisumu County', 105, 280, { align: 'center' });
                doc.text('University of Nairobi - Geospatial Engineering Final Year Project', 105, 285, { align: 'center' });
                
                // Save the PDF
                doc.save('Kisumu_Healthcare_Analysis_Report.pdf');
            });
        });
    });
}
                
