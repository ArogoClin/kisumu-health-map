// Create layers
const countyLayer = L.geoJSON(countyData, {
    style: styles.county,
    onEachFeature: (feature, layer) => {
        layer.bindPopup(`<h3>${feature.properties.county}</h3>`);
    }
}).addTo(map);

const constituencyLayer = L.geoJSON(constituenciesData, {
    style: styles.constituency,
    onEachFeature: (feature, layer) => {
        layer.bindPopup(`
            <h3>${feature.properties.const_name}</h3>
            <p>Constituency No: ${feature.properties.const_no}</p>
        `);
    }
}).addTo(map);

const wardLayer = L.geoJSON(wardsData, {
    style: styles.ward,
    onEachFeature: (feature, layer) => {
        layer.bindPopup(`
            <h3>${feature.properties.ward}</h3>
            <p>Population (2019): ${feature.properties.pop2019}</p>
            <p>Sub-county: ${feature.properties.subcounty}</p>
        `);
    }
}).addTo(map);

// Custom icon for facilities
const facilityIcon = L.icon({
    iconUrl: 'https://www.freeiconspng.com/uploads/ambulance-cross-hospital-icon-11.png',
    iconSize: [25, 25],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const facilitiesLayer = L.geoJSON(facilitiesData, {
    pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {icon: facilityIcon});
    },
    onEachFeature: (feature, layer) => {
        layer.bindPopup(`
            <div class="facility-popup">
                <h3>${feature.properties.name}</h3>
                <p><strong>Type:</strong> ${feature.properties.facility_type}</p>
            </div>
        `);
    }
}).addTo(map);

// Label management functions
function createLabel(feature, latlng, text) {
    return L.marker(latlng, {
        icon: L.divIcon({
            className: 'map-label',
            html: text,
            iconSize: [100, 20]
        })
    });
}

let constituencyLabels = [];
let wardLabels = [];

// Layer controls
document.getElementById('countyLayer').onchange = (e) => {
    if (e.target.checked) {
        map.addLayer(countyLayer);
    } else {
        map.removeLayer(countyLayer);
    }
};

document.getElementById('constituencyLayer').onchange = (e) => {
    if (e.target.checked) {
        map.addLayer(constituencyLayer);
    } else {
        map.removeLayer(constituencyLayer);
    }
};

document.getElementById('wardLayer').onchange = (e) => {
    if (e.target.checked) {
        map.addLayer(wardLayer);
    } else {
        map.removeLayer(wardLayer);
    }
};

document.getElementById('facilityLayer').onchange = (e) => {
    if (e.target.checked) {
        map.addLayer(facilitiesLayer);
    } else {
        map.removeLayer(facilitiesLayer);
    }
};

// Label toggles
document.getElementById('constituencyLabels').onchange = (e) => {
    if (e.target.checked) {
        constituencyLayer.eachLayer((layer) => {
            const center = layer.getBounds().getCenter();
            const label = createLabel(layer.feature, center, layer.feature.properties.const_name);
            constituencyLabels.push(label);
            map.addLayer(label);
        });
    } else {
        constituencyLabels.forEach(label => map.removeLayer(label));
        constituencyLabels = [];
    }
};

document.getElementById('wardLabels').onchange = (e) => {
    if (e.target.checked) {
        wardLayer.eachLayer((layer) => {
            const center = layer.getBounds().getCenter();
            const label = createLabel(layer.feature, center, layer.feature.properties.ward);
            wardLabels.push(label);
            map.addLayer(label);
        });
    } else {
        wardLabels.forEach(label => map.removeLayer(label));
        wardLabels = [];
    }
};

// Add dynamic legend
const legend = document.getElementById('mapLegend');
legend.innerHTML = `
    <h4>Legend</h4>
    <div style="margin-bottom: 10px">
        <img src="https://www.freeiconspng.com/uploads/ambulance-cross-hospital-icon-11.png" style="width: 20px"> Health Facilities
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 3px; background: ${styles.county.color}"></span> County Boundary
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 3px; background: ${styles.constituency.color}"></span> Constituencies
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 3px; background: ${styles.ward.color}"></span> Wards
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 10px; background: rgba(46, 204, 113, 0.2); border: 1px solid #27ae60;"></span> 5km Service Area
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 10px; background: rgba(231, 76, 60, 0.3); border: 1px solid #e74c3c;"></span> Underserved Areas
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 10px; background: rgba(142, 68, 173, 0.4); border: 1px solid #9b59b6;"></span> Coverage Gaps
    </div>
    <div style="margin-bottom: 5px">
        <span style="display: inline-block; width: 20px; height: 10px; background: linear-gradient(to right, blue, cyan, lime, yellow, orange, red);"></span> Population Density
    </div>
`;

// Fit map to county bounds
map.fitBounds(countyLayer.getBounds());
