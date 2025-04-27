from django.shortcuts import render
from django.core.serializers import serialize
from .models import HealthCareFacility, KenyaCounty, KenyaConstituency, KenyaWard, PopulationDensity
from django.views.decorators.csrf import csrf_exempt
import rasterio
from rasterio.windows import from_bounds
import numpy as np
import json
import traceback
import pyproj
from shapely.geometry import shape, Point, Polygon, mapping
from shapely.ops import transform, unary_union
from functools import partial
import rasterio.mask
from django.http import JsonResponse
import networkx as nx
import osmnx as ox
from scipy.spatial import ConvexHull, Delaunay
import geopandas as gpd
import time
import os
import pickle
from shapely.affinity import scale
from decimal import Decimal



def facility_map(request):
    # Get Kisumu data
    kisumu_county = KenyaCounty.objects.get(county__iexact='KISUMU')
    kisumu_constituencies = KenyaConstituency.objects.filter(county_nam__iexact='KISUMU')
    kisumu_wards = KenyaWard.objects.filter(county__iexact='KISUMU')
    
    # Get selected facilities in Kisumu
    selected_facilities = HealthCareFacility.objects.exclude(
        facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)',
                            'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme',   
                            ]
    )

    # Serialize data to GeoJSON
    county_json = serialize('geojson', [kisumu_county],
        geometry_field='geom',
        fields=('county',)
    )

    # Get population density datasets
    population_datasets = PopulationDensity.objects.all().order_by('-year')

    constituencies_json = serialize('geojson', kisumu_constituencies,
        geometry_field='geom',
        fields=('const_name', 'const_no')
    )

    wards_json = serialize('geojson', kisumu_wards,
        geometry_field='geom',
        fields=('ward', 'pop2019', 'subcounty')
    )

    facilities_json = serialize('geojson', selected_facilities,
        geometry_field='location',
        fields=('name', 'facility_type', 'capacity')
    )

    context = {
        'county': county_json,
        'constituencies': constituencies_json,
        'wards': wards_json,
        'facilities': facilities_json,
        'population_datasets': population_datasets
    }

    return render(request, 'maps/facility_map.html', context)


@csrf_exempt
def get_population_density(request):
    """API endpoint to get population density data"""
    try:
        dataset = PopulationDensity.objects.first()
        
        if not dataset:
            return JsonResponse({'error': 'No population dataset available'}, status=404)
        
        # Get the map bounds from the request (if provided)
        bounds_str = request.GET.get('bounds')
        use_bounds = False
        
        if bounds_str:
            try:
                # Format: "south,west,north,east"
                south, west, north, east = map(float, bounds_str.split(','))
                bounds = (west, south, east, north)
                use_bounds = True
            except:
                use_bounds = False
        
       
        # Get Kisumu boundary for clipping
        kisumu_boundary = get_kisumu_boundary()

        # If bounds are provided, ensure they intersect with Kisumu
        if use_bounds and kisumu_boundary:
            # Create a box from the bounds
            from shapely.geometry import box
            bounds_box = box(west, south, east, north)
            
            # Check intersection
            if not bounds_box.intersects(kisumu_boundary):
                return JsonResponse({'error': 'The requested bounds do not intersect with Kisumu County'}, status=400)
            
            # Clip bounds to Kisumu
            intersection = bounds_box.intersection(kisumu_boundary)
            west, south, east, north = intersection.bounds
            bounds = (west, south, east, north)

        
        with rasterio.open(dataset.raster_file.path) as src:
            # If bounds are provided and we want to use them, read only that window
            if use_bounds:
                # Convert geographic bounds to pixel window
                window = from_bounds(*bounds, src.transform)
                # Read the data for the window
                data = src.read(1, window=window)
                # Get the window transform
                window_transform = rasterio.windows.transform(window, src.transform)
            else:
                # Read the entire dataset (should be manageable if clipped to Kisumu)
                data = src.read(1)
                window_transform = src.transform
            
            # Determine appropriate downsample factor based on data size
            total_pixels = data.shape[0] * data.shape[1]
            
            # Adjust downsampling based on total pixels
            if total_pixels > 1000000:  # 1 million pixels
                downsample_factor = max(1, int(np.sqrt(total_pixels / 10000)))
            elif total_pixels > 250000:  # 250,000 pixels
                downsample_factor = max(1, int(np.sqrt(total_pixels / 5000)))
            else:
                # For smaller datasets, use less aggressive downsampling
                downsample_factor = max(1, int(np.sqrt(total_pixels / 2500)))
            
            print(f"Total pixels: {total_pixels}, using downsample factor: {downsample_factor}")
            
            # Downsample the data
            downsampled = data[::downsample_factor, ::downsample_factor]
            
            # Create a list of [lon, lat, value] for each cell
            points = []
            for y in range(0, downsampled.shape[0]):
                for x in range(0, downsampled.shape[1]):
                    # Convert pixel coordinates to geographic coordinates
                    lon, lat = window_transform * (x * downsample_factor, y * downsample_factor)
                    value = float(downsampled[y, x])
                    
                    # Skip nodata values and zeros
                    if not np.isnan(value) and value > 0:
                        # Scale the value for better visualization (optional)
                        # For population density, log scale often works well
                        scaled_value = np.log1p(value)  # log(1+x) to handle zeros
                        points.append([lat, lon, scaled_value])  # Note: swapped to [lat, lon, value] for Leaflet
            
            # Calculate statistics from the data
            valid_data = data[~np.isnan(data) & (data > 0)]
            if len(valid_data) > 0:
                min_val = float(np.min(valid_data))
                max_val = float(np.max(valid_data))
                mean_val = float(np.mean(valid_data))
                
                # For log-scaled values
                log_min = float(np.log1p(min_val))
                log_max = float(np.log1p(max_val))
            else:
                min_val = max_val = mean_val = log_min = log_max = 0
            
            return JsonResponse({
                'name': dataset.name,
                'year': dataset.year,
                'points': points,
                'min': min_val,
                'max': max_val,
                'mean': mean_val,
                'log_min': log_min,
                'log_max': log_max,
                'downsample_factor': downsample_factor,
                'point_count': len(points)
            })
    
    except PopulationDensity.DoesNotExist:
        return JsonResponse({'error': 'Dataset not found'}, status=404)
    except Exception as e:
        import traceback
        return JsonResponse({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)


@csrf_exempt
def get_population_density_for_area(request):
    """API endpoint to get population density for a specific GeoJSON area"""
    # Debug request information
    print("Request method:", request.method)
    print("Content type:", request.content_type)
    print("Request body length:", len(request.body))
    
    try:
        # Check if this is a GET request
        if request.method == 'GET':
            return JsonResponse({
                'error': 'This endpoint requires a POST request with a JSON body',
                'example': {
                    'area': {
                        'type': 'Feature',
                        'geometry': {
                            'type': 'Polygon',
                            'coordinates': [[[34.7, -0.1], [34.8, -0.1], [34.8, -0.2], [34.7, -0.2], [34.7, -0.1]]]
                        }
                    }
                }
            }, status=400)
        
        # Check if body is empty
        if not request.body:
            return JsonResponse({
                'error': 'Empty request body',
                'message': 'The request body must contain a GeoJSON area'
            }, status=400)
        
        # Parse the request body
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError as e:
            return JsonResponse({
                'error': f'Invalid JSON: {str(e)}',
                'body_sample': request.body[:100].decode('utf-8', errors='replace')
            }, status=400)
        
        # Get the GeoJSON area
        geojson_area = data.get('area')
        if not geojson_area:
            return JsonResponse({'error': 'No area provided in the request body'}, status=400)
        
        # Log what we received
        print("Received GeoJSON type:", geojson_area.get('type'))
        
        # Handle FeatureCollection
        if geojson_area.get('type') == 'FeatureCollection':
            if not geojson_area.get('features') or len(geojson_area['features']) == 0:
                return JsonResponse({'error': 'Empty FeatureCollection'}, status=400)
            # Use the first feature
            geojson_area = geojson_area['features'][0]
            print("Extracted feature from collection")
        
        # SECTION 1: Convert GeoJSON to a shapely geometry
        try:
            print("Converting GeoJSON to shapely geometry")
            geom = shape(geojson_area['geometry'])
            print("Geometry type:", geom.geom_type)
            print("Geometry is valid:", geom.is_valid)
        except Exception as e:
            print("Error converting to shapely geometry:", str(e))
            return JsonResponse({'error': f'Error converting GeoJSON to shapely geometry: {str(e)}'}, status=400)
        
        # Get Kisumu boundary
        kisumu_boundary = get_kisumu_boundary()

        # Clip the input geometry to Kisumu boundary
        if kisumu_boundary:
            print("Clipping input geometry to Kisumu County boundary...")
            geom = geom.intersection(kisumu_boundary)
            if geom.is_empty:
                return JsonResponse({'error': 'The provided area does not intersect with Kisumu County'}, status=400)
        
        # SECTION 2: Calculate area in square kilometers
        try:
            print("Calculating area")
            # Define projections
            wgs84 = pyproj.CRS('EPSG:4326')  # WGS84 (lat/lon)
            utm = pyproj.CRS('EPSG:32736')   # UTM zone 36S (covers Kenya)

            # Create transformer using the newer API
            transformer = pyproj.Transformer.from_crs(wgs84, utm, always_xy=True)
            
            # Define a function that uses the transformer
            def transform_fn(x, y):
                return transformer.transform(x, y)
                    # Project geometry to UTM for accurate area calculation
            
            geom_utm = transform(transform_fn, geom)
            
            # Calculate area in square kilometers
            area_km2 = geom_utm.area / 1000000
            print(f"Calculated area: {area_km2} km²")
        except Exception as e:
            print("Error calculating area:", str(e))
            print(traceback.format_exc())
            
            # Fallback: calculate area using the unprojected geometry
            try:
                # This is less accurate but better than nothing
                area_m2 = geom.area * 111319 * 111319  # Rough conversion from degrees to meters
                area_km2 = area_m2 / 1000000
                print(f"Fallback area calculation: {area_km2} km²")
            except Exception as e2:
                print("Error in fallback area calculation:", str(e2))
                return JsonResponse({'error': f'Error calculating area: {str(e)} / {str(e2)}'}, status=500)
        
        # Get the population density dataset
        dataset = PopulationDensity.objects.first()
        if not dataset:
            return JsonResponse({'error': 'No population dataset available'}, status=404)
        
        print("Using dataset:", dataset.name, dataset.year)
        print("Raster file path:", dataset.raster_file.path)
        
        # SECTION 3: Open the raster file and process it
        try:
            print("Opening raster file")
            with rasterio.open(dataset.raster_file.path) as src:
                print("Raster CRS:", src.crs)
                print("Raster bounds:", src.bounds)
                print("Raster shape:", src.shape)
                
                # Create a mask for the geometry
                geometry = [geom]
                
                print("Creating mask for geometry")
                # This gets the data only within the geometry
                out_image, out_transform = rasterio.mask.mask(src, geometry, crop=True, all_touched=True)
                
                print("Mask created, processing data")
                print("Out image shape:", out_image.shape)
                
                # Get the valid data (non-nodata values)
                valid_data = out_image[0][~np.isnan(out_image[0]) & (out_image[0] > 0)]
                print("Valid data points:", len(valid_data))
                
                if len(valid_data) > 0:
                    # Calculate statistics
                    min_val = float(np.min(valid_data))
                    max_val = float(np.max(valid_data))
                    mean_val = float(np.mean(valid_data))
                    median_val = float(np.median(valid_data))
                    
                    print(f"Statistics - Min: {min_val}, Max: {max_val}, Mean: {mean_val}, Median: {median_val}")
                    
                    # Calculate total population in the area
                    total_population = int(mean_val * area_km2)
                    
                    # Calculate percentiles
                    percentiles = np.percentile(valid_data, [25, 50, 75, 90])
                    
                    return JsonResponse({
                        'name': dataset.name,
                        'year': dataset.year,
                        'min_density': min_val,
                        'max_density': max_val,
                        'mean_density': mean_val,
                        'median_density': median_val,
                        'percentile_25': float(percentiles[0]),
                        'percentile_50': float(percentiles[1]),
                        'percentile_75': float(percentiles[2]),
                        'percentile_90': float(percentiles[3]),
                        'area_km2': area_km2,
                        'estimated_population': total_population
                    })
                else:
                    return JsonResponse({
                        'error': 'No valid population data found in the specified area',
                        'area_km2': area_km2,
                        'mean_density': 0,
                        'estimated_population': 0
                    }, status=404)
        except Exception as e:
            print("Error processing raster:", str(e))
            print(traceback.format_exc())
            return JsonResponse({
                'error': f'Error processing raster: {str(e)}',
                'traceback': traceback.format_exc()
            }, status=500)
        
    except Exception as e:
        print("Error in API:", str(e))
        print(traceback.format_exc())
        return JsonResponse({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)

@csrf_exempt
def site_suitability_analysis(request):
    """API endpoint to identify optimal locations for new healthcare facilities"""
    from decimal import Decimal
    
    # Helper function to convert values to float
    def to_float(value):
        """Convert value to float, handling Decimal types"""
        if isinstance(value, Decimal):
            return float(value)
        return float(value) if value is not None else 0.0
    
    try:
        print("Starting site suitability analysis...")
        start_time = time.time()
        
        # Get facility type from request (optional)
        target_facility_type = request.GET.get('facility_type', 'Health Centre')
        print(f"Target facility type: {target_facility_type}")
        
        # Define buffer sizes for different facility types (in km)
        buffer_sizes = {
            'District Hospital': 8.0,                  # Larger radius for hospitals
            'Povincial General Hospital': 10.0,        # Medium radius for health centers
            'Medical Clinic': 3.0,                     # Standard radius for clinics
            'Other Hospital': 5.0,                     # Medium radius for medical centers
            'Sub-District Hospital': 6.0,              # Medium radius
            'Health Center': 3.0,
        }
        
        # Get buffer size for target facility type
        target_buffer_size = buffer_sizes.get(target_facility_type, 5.0)
        print(f"Using {target_buffer_size}km buffer for analysis")
        
        # Get existing facilities
        existing_facilities = HealthCareFacility.objects.exclude(
            facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)',
                              'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme']
        )
        
        # Get population density data
        population_dataset = PopulationDensity.objects.first()
        if not population_dataset:
            return JsonResponse({'error': 'No population dataset available'}, status=404)
        
        # Get Kisumu boundary
        kisumu_county = KenyaCounty.objects.get(county__iexact='KISUMU')
        kisumu_boundary = shape(json.loads(kisumu_county.geom.json))  # Convert to shapely geometry
        
        if not kisumu_boundary:
            return JsonResponse({'error': 'Could not retrieve Kisumu boundary'}, status=500)
        
        print(f"Processing {existing_facilities.count()} existing facilities...")
        
        # Create buffers around existing facilities based on their type
        facility_buffers = []
        for facility in existing_facilities:
            try:
                # Get facility point as shapely geometry
                facility_point = shape(json.loads(facility.location.json))
                
                # Get buffer size based on facility type
                facility_type = facility.facility_type
                buffer_size_km = buffer_sizes.get(facility_type, 5.0)
                
                # Create buffer
                lat = to_float(facility_point.y)
                lon = to_float(facility_point.x)
                
                # Calculate approximate degrees for buffer
                lat_km_per_degree = 111.0
                lon_km_per_degree = 111.0 * np.cos(np.radians(lat))
                
                # Convert buffer size to degrees
                lat_buffer = buffer_size_km / lat_km_per_degree
                
                # Create buffer
                buffer = Point(lon, lat).buffer(lat_buffer)
                
                # Scale to account for longitude distortion
                scale_factor = lon_km_per_degree / lat_km_per_degree
                buffer = scale(buffer, xfact=scale_factor, yfact=1.0, origin='center')
                
                # Ensure buffer is valid
                if not buffer.is_valid:
                    buffer = buffer.buffer(0)  # This often fixes invalid geometries
                
                if buffer.is_valid:
                    facility_buffers.append(buffer)
                    print(f"Created {buffer_size_km}km buffer for {facility.name} ({facility_type})")
            except Exception as e:
                print(f"Error creating buffer for facility: {str(e)}")
                continue
        
        print(f"Created {len(facility_buffers)} facility buffers")
        
        # Merge all buffers
        if not facility_buffers:
            return JsonResponse({'error': 'No valid facility buffers could be created'}, status=500)
        
        # Merge buffers in batches to avoid memory issues
        if len(facility_buffers) > 100:
            print("Large number of buffers, merging in batches")
            batch_size = 50
            merged_buffer = None
            
            for i in range(0, len(facility_buffers), batch_size):
                batch = facility_buffers[i:i+batch_size]
                batch_merged = unary_union(batch)
                
                if merged_buffer is None:
                    merged_buffer = batch_merged
                else:
                    merged_buffer = unary_union([merged_buffer, batch_merged])
                
                print(f"Merged batch {i//batch_size + 1}/{(len(facility_buffers)+batch_size-1)//batch_size}")
        else:
            merged_buffer = unary_union(facility_buffers)
        
        print("Merged all facility buffers")
        
        # Find areas outside the buffer (underserved areas)
        underserved_areas = kisumu_boundary.difference(merged_buffer)
        print(f"Identified underserved areas: {underserved_areas.area} square degrees")
        
        # If there are no underserved areas, return early
        if underserved_areas.is_empty:
            return JsonResponse({
                'message': f'No underserved areas found. The entire county is within service range of existing facilities.',
                'processing_time': time.time() - start_time
            })
        
        # Get all wards for later analysis
        kisumu_wards = list(KenyaWard.objects.filter(county__iexact='KISUMU'))
        ward_geometries = {}
        ward_populations = {}
        
        for ward in kisumu_wards:
            ward_geometries[ward.ward] = shape(json.loads(ward.geom.json))
            # Convert to float to avoid Decimal issues
            ward_populations[ward.ward] = to_float(ward.pop2019 or 0)
        
        print(f"Loaded {len(kisumu_wards)} wards with population data")
        
        # Now analyze population density in underserved areas
        print("Analyzing population density in underserved areas...")
        
        # Create a grid of potential facility locations
        # Adjust grid size based on county size
        county_area_km2 = to_float(underserved_areas.area) * (111 * 111)  # Rough conversion to km²
        
        # Adaptive grid size - smaller grid for smaller counties
        if county_area_km2 < 1000:
            grid_size = 0.005  # ~500m grid for small counties
        elif county_area_km2 < 3000:
            grid_size = 0.008  # ~800m grid for medium counties
        else:
            grid_size = 0.01   # ~1km grid for large counties
        
        print(f"Using grid size of {grid_size} degrees (~{grid_size*111:.1f}km)")
        
        # Get bounds of underserved areas
        minx, miny, maxx, maxy = underserved_areas.bounds
        
        print(f"Creating grid within bounds: {minx}, {miny}, {maxx}, {maxy}")
        
        # Create grid points
        grid_points = []
        for x in np.arange(minx, maxx, grid_size):
            for y in np.arange(miny, maxy, grid_size):
                point = Point(x, y)
                if point.within(underserved_areas):
                    grid_points.append(point)
        
        print(f"Created {len(grid_points)} grid points in underserved areas")
        
        # If no grid points were created, return early
        if not grid_points:
            return JsonResponse({
                'message': 'Could not create grid points in underserved areas.',
                'processing_time': time.time() - start_time
            })
        
        # Score each point based on population served
        scored_locations = []
        
        # Process points in batches to avoid memory issues
        batch_size = min(100, len(grid_points))
        num_batches = (len(grid_points) + batch_size - 1) // batch_size
        
        print(f"Processing {len(grid_points)} points in {num_batches} batches of {batch_size}")
        
        # Calculate county-wide statistics for normalization
        county_pop_total = sum(ward_populations.values())
        print(f"Total county population (2019): {county_pop_total}")
        
        # Open the raster file once for all points
        with rasterio.open(population_dataset.raster_file.path) as src:
            # Get county-wide population density statistics
            county_density_stats = {}
            try:
                # Create a mask for the county
                county_image, county_transform = rasterio.mask.mask(src, [kisumu_boundary], crop=True, all_touched=True)
                valid_county_data = county_image[0][~np.isnan(county_image[0]) & (county_image[0] > 0)]
                
                if len(valid_county_data) > 0:
                    county_density_stats = {
                        'min': float(np.min(valid_county_data)),
                        'max': float(np.max(valid_county_data)),
                        'mean': float(np.mean(valid_county_data)),
                        'median': float(np.median(valid_county_data)),
                        'p75': float(np.percentile(valid_county_data, 75)),
                        'p90': float(np.percentile(valid_county_data, 90))
                    }
                    print(f"County density stats: min={county_density_stats['min']:.1f}, "
                          f"max={county_density_stats['max']:.1f}, mean={county_density_stats['mean']:.1f}")
            except Exception as e:
                print(f"Error calculating county density stats: {str(e)}")
                county_density_stats = {'max': 1000.0, 'mean': 500.0}  # Fallback values
            
            for batch_idx in range(num_batches):
                start_idx = batch_idx * batch_size
                end_idx = min((batch_idx + 1) * batch_size, len(grid_points))
                batch_points = grid_points[start_idx:end_idx]
                
                print(f"Processing batch {batch_idx + 1}/{num_batches} ({len(batch_points)} points)")
                
                for point in batch_points:
                    try:
                        # Create a service area around this point based on target facility type
                        lat = to_float(point.y)
                        lon = to_float(point.x)
                        
                        # Calculate approximate degrees for buffer
                        lat_km_per_degree = 111.0
                        lon_km_per_degree = 111.0 * np.cos(np.radians(lat))
                        
                        # Convert target buffer size to degrees
                        lat_buffer = target_buffer_size / lat_km_per_degree
                        
                        # Create buffer
                        service_area = Point(lon, lat).buffer(lat_buffer)
                        
                        # Scale to account for longitude distortion
                        scale_factor = lon_km_per_degree / lat_km_per_degree
                        service_area = scale(service_area, xfact=scale_factor, yfact=1.0, origin='center')
                        
                        # Ensure service area is valid
                        if not service_area.is_valid:
                            service_area = service_area.buffer(0)
                        
                        if not service_area.is_valid:
                            continue
                        
                        # Calculate population served by this location
                        try:
                            # Create a mask for the service area
                            geometry = [service_area]
                            
                            # Get the data only within the service area
                            area_image, area_transform = rasterio.mask.mask(src, geometry, crop=True, all_touched=True)
                            
                            # Get the valid data (non-nodata values)
                            valid_data = area_image[0][~np.isnan(area_image[0]) & (area_image[0] > 0)]
                            
                            if len(valid_data) > 0:
                                # Calculate mean density
                                mean_density = float(np.mean(valid_data))
                                max_density = float(np.max(valid_data))
                                
                                # Calculate area in square kilometers
                                wgs84 = pyproj.CRS('EPSG:4326')
                                utm = pyproj.CRS('EPSG:32736')
                                transformer = pyproj.Transformer.from_crs(wgs84, utm, always_xy=True)
                                
                                def transform_fn(x, y):
                                    return transformer.transform(x, y)
                                
                                service_area_utm = transform(transform_fn, service_area)
                                area_km2 = to_float(service_area_utm.area) / 1000000
                                
                                # Calculate population served
                                population_served = int(mean_density * area_km2)
                                
                                # Find ward this point is in
                                ward = None
                                ward_obj = None
                                ward_pop = 0
                                
                                for ward_name, ward_geom in ward_geometries.items():
                                    if point.within(ward_geom):
                                        ward = ward_name
                                        ward_pop = to_float(ward_populations.get(ward_name, 0))
                                        break
                                
                                # Calculate ward coverage and population metrics
                                ward_coverage_percent = 0
                                ward_pop_density = 0
                                
                                if ward:
                                    # Calculate how much of the ward is already covered by existing facilities
                                    ward_geom = ward_geometries[ward]
                                    ward_area_utm = transform(transform_fn, ward_geom)
                                    ward_area_km2 = to_float(ward_area_utm.area) / 1000000
                                    
                                    # Calculate intersection with existing facility buffers
                                    ward_coverage = ward_geom.intersection(merged_buffer)
                                    ward_coverage_utm = transform(transform_fn, ward_coverage)
                                    coverage_km2 = to_float(ward_coverage_utm.area) / 1000000
                                    
                                    # Calculate percentage covered
                                    if ward_area_km2 > 0:
                                        ward_coverage_percent = (coverage_km2 / ward_area_km2) * 100
                                        ward_pop_density = ward_pop / ward_area_km2
                                
                                # Calculate scores for different factors
                                
                                # 1. Population density score (0-1)
                                # Normalize against county-wide statistics
                                density_max = to_float(county_density_stats.get('max', 1000))
                                density_score = min(mean_density / (density_max * 0.7), 1.0)
                                
                                # 2. Ward coverage score (0-1)
                                # Lower coverage is better for new facilities
                                coverage_score = 1.0 - min(ward_coverage_percent / 100, 1.0)
                                
                                # 3. Population served score (0-1)
                                # Normalize based on expected population for facility type
                                expected_pop = {
                                    'District Hospital': 300000,                  # Larger radius for hospitals
                                    'Povincial General Hospital': 800000,        # Medium radius for health centers
                                    'Medical Clinic': 7500,                       # Standard radius for clinics
                                    'Other Hospital': 5000,                       # Medium radius for medical centers
                                    'Sub-District Hospital': 100000,              # Medium radius
                                    'Health Center': 10000,
                                }
                                target_pop = to_float(expected_pop.get(target_facility_type, 30000))
                                population_score = min(population_served / target_pop, 1.0)
                                
                                # 4. Ward population score (0-1)
                                # Higher ward population is better
                                ward_pop_score = min(to_float(ward_pop) / 50000, 1.0)
                                
                                # 5. Accessibility score (0-1)
                                # Areas with higher max density might indicate urban centers with better access
                                accessibility_score = min(max_density / density_max, 1.0)
                                
                                # Calculate composite score with weighted factors
                                # Weights should sum to 1.0
                                weights = {
                                    'population_served': 0.35,  # Population served is most important
                                    'coverage': 0.25,          # Low existing coverage is important
                                    'ward_population': 0.15,   # Ward population is moderately important
                                    'density': 0.20,           # Population density is moderately important
                                    'accessibility': 0.15      # Accessibility is least important
                                }
                                
                                composite_score = (
                                    (weights['population_served'] * population_score) +
                                    (weights['coverage'] * coverage_score) +
                                    (weights['ward_population'] * ward_pop_score) +
                                    (weights['density'] * density_score) +
                                    (weights['accessibility'] * accessibility_score)
                                )
                                
                                # Score this location
                                scored_locations.append({
                                    'type': 'Feature',
                                    'geometry': mapping(point),
                                    'properties': {
                                        'population_served': population_served,
                                        'area_km2': float(area_km2),
                                        'mean_density': float(mean_density),
                                        'max_density': float(max_density),
                                        'ward': ward,
                                        'ward_population': float(ward_pop),
                                        'ward_coverage_percent': round(float(ward_coverage_percent), 1),
                                        'density_score': round(float(density_score), 2),
                                        'coverage_score': round(float(coverage_score), 2),
                                        'population_score': round(float(population_score), 2),
                                        'ward_pop_score': round(float(ward_pop_score), 2),
                                        'accessibility_score': round(float(accessibility_score), 2),
                                        'composite_score': round(float(composite_score), 2),
                                        'facility_type': target_facility_type,
                                        'buffer_km': float(target_buffer_size)
                                    }
                                })
                        except Exception as e:
                            print(f"Error analyzing point {point.wkt}: {str(e)}")
                    except Exception as e:
                        print(f"Error processing point: {str(e)}")
        
        print(f"Scored {len(scored_locations)} potential locations")
        
        # Sort locations by composite score (descending)
        scored_locations.sort(key=lambda x: x['properties']['composite_score'], reverse=True)
        
        # 1. Select the top location overall
        distributed_locations = []
        if scored_locations:
            distributed_locations.append(scored_locations[0])
            
            # 2. Define a minimum distance between recommended facilities (in degrees)
            # Adjust minimum distance based on facility type
            min_distance_km = {
                'District Hospital': 8.0,                  # Larger radius for hospitals
                'Povincial General Hospital': 10.0,        # Medium radius for health centers
                'Medical Clinic': 3.0,                     # Standard radius for clinics
                'Other Hospital': 5.0,                     # Medium radius for medical centers
                'Sub-District Hospital': 6.0,              # Medium radius
                'Health Center': 3.0,
            }.get(target_facility_type, 7.0)
            
            # Convert km to degrees (approximate)
            min_distance = min_distance_km / 111.0
            print(f"Using minimum distance of {min_distance_km}km between recommended facilities")
            
            # 3. Select remaining locations ensuring minimum distance
            remaining_candidates = scored_locations[1:]
            
            # Continue until we have 20 locations or run out of candidates
            while len(distributed_locations) < 20 and remaining_candidates:
                # For each candidate, check if it's far enough from already selected locations
                for i, candidate in enumerate(remaining_candidates):
                    candidate_point = shape(candidate['geometry'])
                    
                    # Check distance to all already selected locations
                    too_close = False
                    for selected in distributed_locations:
                        selected_point = shape(selected['geometry'])
                        distance = candidate_point.distance(selected_point)
                        
                        if distance < min_distance:
                            too_close = True
                            break
                    
                    # If this candidate is far enough from all selected locations, add it
                    if not too_close:
                        distributed_locations.append(candidate)
                        remaining_candidates.pop(i)
                        break
                else:
                    # If we checked all candidates and none were suitable,
                    # reduce the minimum distance requirement
                    min_distance *= 0.9
                    print(f"Reducing minimum distance to {min_distance*111:.1f}km")
                    
                    # If minimum distance gets too small, just take the highest scored remaining
                    if min_distance < 0.01:  # ~1km
                        print("Minimum distance too small, selecting highest scored remaining location")
                        distributed_locations.append(remaining_candidates[0])
                        remaining_candidates.pop(0)
        
        # Use the distributed locations instead of just the top 20
        top_locations = distributed_locations[:20]
        
        # Add rank to each location
        for i, location in enumerate(top_locations):
            location['properties']['rank'] = i + 1
        
        # Create GeoJSON for underserved areas
        underserved_geojson = mapping(underserved_areas)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        print(f"Site suitability analysis completed in {processing_time:.2f} seconds")
        
        # Create summary statistics for the results
        summary = {
            'facility_type': target_facility_type,
            'buffer_size_km': float(target_buffer_size),
            'total_locations_analyzed': len(scored_locations),
            'top_location_score': float(top_locations[0]['properties']['composite_score']) if top_locations else 0,
            'average_score': float(sum(loc['properties']['composite_score'] for loc in top_locations) / len(top_locations)) if top_locations else 0,
            'total_population_served': int(sum(loc['properties']['population_served'] for loc in top_locations)) if top_locations else 0,
            'wards_covered': len(set(loc['properties']['ward'] for loc in top_locations if loc['properties']['ward'])) if top_locations else 0,
            'processing_time_seconds': float(processing_time)
        }
        
        return JsonResponse({
            'type': 'FeatureCollection',
            'features': top_locations,
            'underserved_area': {
                'type': 'Feature',
                'geometry': underserved_geojson
            },
            'summary': summary
        })
    
    except Exception as e:
        print("Error in site suitability analysis:", str(e))
        print(traceback.format_exc())
        return JsonResponse({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)




def healthcare_dashboard(request):
    """View for the healthcare dashboard with real data calculations"""
    # Get Kisumu data
    kisumu_county = KenyaCounty.objects.get(county__iexact='KISUMU')
    kisumu_constituencies = KenyaConstituency.objects.filter(county_nam__iexact='KISUMU')
    kisumu_wards = KenyaWard.objects.filter(county__iexact='KISUMU')
    
    # Get selected facilities in Kisumu
    selected_facilities = HealthCareFacility.objects.exclude(
        facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)',
                          'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme']
    )
    
    # Serialize data to GeoJSON
    county_json = serialize('geojson', [kisumu_county],
        geometry_field='geom',
        fields=('county',)
    )
    constituencies_json = serialize('geojson', kisumu_constituencies,
        geometry_field='geom',
        fields=('const_name', 'const_no')
    )
    wards_json = serialize('geojson', kisumu_wards,
        geometry_field='geom',
        fields=('ward', 'pop2019', 'subcounty')
    )
    facilities_json = serialize('geojson', selected_facilities,
        geometry_field='location',
        fields=('name', 'facility_type', 'capacity')
    )
    
    # Count facilities by type
    facility_types = {}
    for facility in selected_facilities:
        facility_type = facility.facility_type
        facility_types[facility_type] = facility_types.get(facility_type, 0) + 1
    
    # Get population density dataset
    population_dataset = PopulationDensity.objects.first()
    if not population_dataset:
        return JsonResponse({'error': 'No population dataset available'}, status=404)
    
    # Get Kisumu boundary
    kisumu_boundary_django = get_kisumu_boundary()
    if hasattr(kisumu_boundary_django, 'wkt'):
        from shapely import wkt
        kisumu_boundary = wkt.loads(kisumu_boundary_django.wkt)
    else:
        kisumu_boundary = kisumu_boundary_django
    
    # Set up projection for area calculations
    wgs84 = pyproj.CRS('EPSG:4326')
    utm = pyproj.CRS('EPSG:32736')
    transformer = pyproj.Transformer.from_crs(wgs84, utm, always_xy=True)
    
    def transform_fn(x, y):
        return transformer.transform(x, y)
    
    # Calculate total population from ward data
    total_population = sum(ward.pop2019 or 0 for ward in kisumu_wards)
    print(f"Total population from ward data: {total_population}")
    
    # Calculate 5km service areas for coverage analysis
    facility_buffers = []
    for facility in selected_facilities:
        try:
            # Get facility point as shapely geometry
            facility_point = shape(json.loads(facility.location.json))
            
            # Create buffer (similar to merged_service_areas function)
            lat = facility_point.y
            lon = facility_point.x
            
            # Calculate approximate degrees for 5km buffer
            lat_km_per_degree = 111.0
            lon_km_per_degree = 111.0 * np.cos(np.radians(lat))
            
            # Convert 5km to degrees
            lat_buffer = 5.0 / lat_km_per_degree
            
            # Create buffer
            buffer = Point(lon, lat).buffer(lat_buffer)
            
            # Scale to account for longitude distortion
            scale_factor = lon_km_per_degree / lat_km_per_degree
            buffer = scale(buffer, xfact=scale_factor, yfact=1.0, origin='center')
            
            # Ensure buffer is valid
            if not buffer.is_valid:
                buffer = buffer.buffer(0)  # This often fixes invalid geometries
            
            if buffer.is_valid:
                facility_buffers.append(buffer)
        except Exception as e:
            print(f"Error creating buffer for facility: {str(e)}")
            continue
    
    # Merge all buffers to get total coverage area
    merged_buffer = unary_union(facility_buffers)
    
    # Clip to Kisumu boundary
    if kisumu_boundary:
        merged_buffer = merged_buffer.intersection(kisumu_boundary)
    
    # Calculate coverage statistics
    coverage_stats = {}
    underserved_areas = None
    underserved_population = 0
    coverage_percent = 0
    served_population = 0
    
    try:
        # Project geometries to UTM for accurate area calculation
        kisumu_utm = transform(transform_fn, kisumu_boundary)
        merged_buffer_utm = transform(transform_fn, merged_buffer)
        
        # Calculate areas in square kilometers
        kisumu_area_km2 = kisumu_utm.area / 1000000
        covered_area_km2 = merged_buffer_utm.area / 1000000
        
        # Calculate coverage percentage
        coverage_percent = (covered_area_km2 / kisumu_area_km2) * 100
        
        # Find underserved areas (areas outside the buffer)
        underserved_areas = kisumu_boundary.difference(merged_buffer)
        underserved_areas_utm = transform(transform_fn, underserved_areas)
        underserved_area_km2 = underserved_areas_utm.area / 1000000
        
        # Calculate served and underserved population using ward data
        served_population = 0
        underserved_population = 0
        
        for ward in kisumu_wards:
            try:
                ward_geom = shape(json.loads(ward.geom.json))
                ward_pop = ward.pop2019 or 0
                
                # Calculate intersection with facility buffers
                ward_coverage_geom = ward_geom.intersection(merged_buffer)
                ward_coverage_utm = transform(transform_fn, ward_coverage_geom)
                coverage_km2 = ward_coverage_utm.area / 1000000
                
                # Calculate uncovered area
                uncovered_geom = ward_geom.difference(merged_buffer)
                uncovered_utm = transform(transform_fn, uncovered_geom)
                uncovered_km2 = uncovered_utm.area / 1000000
                
                # Calculate ward area
                ward_utm = transform(transform_fn, ward_geom)
                ward_area_km2 = ward_utm.area / 1000000
                
                # Calculate percentage covered
                if ward_area_km2 > 0:
                    coverage_percent_ward = (coverage_km2 / ward_area_km2) * 100
                    uncovered_percent_ward = 100 - coverage_percent_ward
                else:
                    coverage_percent_ward = 0
                    uncovered_percent_ward = 0
                
                # Estimate served and underserved population based on area coverage
                ward_served_pop = int(ward_pop * (coverage_percent_ward / 100))
                ward_underserved_pop = ward_pop - ward_served_pop
                
                served_population += ward_served_pop
                underserved_population += ward_underserved_pop
                
            except Exception as e:
                print(f"Error calculating coverage for ward {ward.ward}: {str(e)}")
        
        # Calculate served percentage
        served_percent = (served_population / total_population) * 100 if total_population > 0 else 0
        underserved_percent = (underserved_population / total_population) * 100 if total_population > 0 else 0
        
        coverage_stats = {
            'covered_area_km2': round(covered_area_km2, 2),
            'total_area_km2': round(kisumu_area_km2, 2),
            'coverage_percent': round(coverage_percent, 1),
            'served_population': served_population,
            'served_percent': round(served_percent, 1),
            'underserved_area_km2': round(underserved_area_km2, 2),
            'underserved_population': underserved_population,
            'underserved_percent': round(underserved_percent, 1)
        }
    except Exception as e:
        print(f"Error calculating coverage statistics: {str(e)}")
        print(traceback.format_exc())
    
    # Identify priority wards based on population and coverage
    priority_wards = []
    ward_coverage = {}
    
    try:
        # Calculate coverage and population for each ward
        for ward in kisumu_wards:
            try:
                ward_name = ward.ward
                ward_geom = shape(json.loads(ward.geom.json))
                ward_pop = ward.pop2019 or 0
                
                # Calculate ward area
                ward_utm = transform(transform_fn, ward_geom)
                ward_area_km2 = ward_utm.area / 1000000
                
                # Calculate intersection with facility buffers
                ward_coverage_geom = ward_geom.intersection(merged_buffer)
                ward_coverage_utm = transform(transform_fn, ward_coverage_geom)
                coverage_km2 = ward_coverage_utm.area / 1000000
                
                # Calculate uncovered area
                uncovered_geom = ward_geom.difference(merged_buffer)
                uncovered_utm = transform(transform_fn, uncovered_geom)
                uncovered_km2 = uncovered_utm.area / 1000000
                
                # Calculate percentage covered
                if ward_area_km2 > 0:
                    coverage_percent_ward = (coverage_km2 / ward_area_km2) * 100
                    uncovered_percent_ward = 100 - coverage_percent_ward
                else:
                    coverage_percent_ward = 0
                    uncovered_percent_ward = 0
                
                # Calculate ward population density
                ward_density = ward_pop / ward_area_km2 if ward_area_km2 > 0 else 0
                
                # Estimate uncovered population based on area
                uncovered_population = int(ward_pop * (uncovered_percent_ward / 100))
                
                # Calculate priority score (higher is more priority)
                # Factors: uncovered population, population density, and coverage percentage
                priority_score = (uncovered_population * 0.6) + (ward_density * 0.2) + ((100 - coverage_percent_ward) * 0.2)
                
                # Store ward coverage data
                ward_coverage[ward_name] = {
                    'ward': ward_name,
                    'population': ward_pop,
                    'area_km2': round(ward_area_km2, 2),
                    'density': round(ward_density, 2),
                    'coverage_percent': round(coverage_percent_ward, 1),
                    'uncovered_percent': round(uncovered_percent_ward, 1),
                    'uncovered_population': uncovered_population,
                    'priority_score': round(priority_score, 2)
                }
            except Exception as e:
                print(f"Error calculating coverage for ward {ward.ward}: {str(e)}")
        
        # Sort wards by priority score (descending)
        sorted_wards = sorted(
            ward_coverage.values(),
            key=lambda x: x['priority_score'],
            reverse=True
        )
        
        # Take top 5 wards as priority
        priority_wards = [ward['ward'] for ward in sorted_wards[:5]]
    
    except Exception as e:
        print(f"Error identifying priority wards: {str(e)}")
        print(traceback.format_exc())
    
    # Calculate travel time coverage (simplified)
    # In a real implementation, you'd use your travel time analysis
    travel_time_coverage = {
        5: min(coverage_stats.get('served_percent', 0) * 0.4, 100),   # Estimate: 40% of 5km coverage
        10: min(coverage_stats.get('served_percent', 0) * 0.65, 100),  # Estimate: 65% of 5km coverage
        15: min(coverage_stats.get('served_percent', 0) * 0.85, 100),  # Estimate: 85% of 5km coverage
        30: min(coverage_stats.get('served_percent', 0) * 1.2, 100)    # Estimate: 120% of 5km coverage (capped at 100%)
    }
    
    # Create summary stats object
    summary_stats = {
        'total_population': total_population,
        'total_facilities': selected_facilities.count(),
        'facility_types': facility_types,
        'coverage_stats': coverage_stats,
        'travel_time_coverage': {k: round(v, 1) for k, v in travel_time_coverage.items()},
        'distribution_quality': 'unevenly' if coverage_stats.get('coverage_percent', 0) < 75 else 'moderately even',
        'priority_wards': priority_wards,
        'ward_coverage': ward_coverage
    }
    
    # Custom JSON encoder to handle Decimal objects
    class DecimalEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, Decimal):
                return float(obj)
            return super(DecimalEncoder, self).default(obj)
    
    context = {
        'county': county_json,
        'constituencies': constituencies_json,
        'wards': wards_json,
        'facilities': facilities_json,
        'summary_stats': json.dumps(summary_stats, cls=DecimalEncoder),
    }
    
    return render(request, 'maps/dashboard.html', context)



@csrf_exempt
def merged_service_areas(request):
    """API endpoint to generate merged service areas for all facilities with type-specific buffer sizes"""
    try:
        # Get facilities
        selected_facilities = HealthCareFacility.objects.exclude(
            facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)', 
                              'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme']
        )
        
        print(f"Creating buffers for {selected_facilities.count()} facilities")
        
        # Define buffer sizes for different facility types (in km)
        buffer_sizes = {
           'District Hospital': 10.0,                  # Larger radius for hospitals
            'Povincial General Hospital': 15,              # Medium radius for health centers
            'Medical Clinic': 5.0,             # Standard radius for clinics
            'Other Hospital': 5.0,             # Medium radius for medical centers
            'Sub-District Hospital': 6.0,       # Medium radius
            'Health Center' : 3,                 # Default radius
        }
        
        # Create buffer for each facility
        from shapely.geometry import Point
        buffers = []
        
        for facility in selected_facilities:
            try:
                # Get the appropriate buffer size for this facility type
                facility_type = facility.facility_type
                buffer_size_km = buffer_sizes.get(facility_type, 5.0)  # Default to 5km if type not found
                
                # Create a buffer with the appropriate size
                point = Point(facility.location.x, facility.location.y)
                
                # Convert km to degrees (approximate)
                lat = point.y
                lon = point.x
                
                # Calculate approximate degrees for the buffer
                lat_km_per_degree = 111.0  # km per degree of latitude
                lon_km_per_degree = 111.0 * np.cos(np.radians(lat))  # km per degree of longitude
                
                # Convert buffer size to degrees (different for lat and lon)
                lat_buffer = buffer_size_km / lat_km_per_degree
                
                # Create an elliptical buffer (more accurate than circular at non-equatorial latitudes)
                buffer = point.buffer(lat_buffer)
                
                # Scale to account for longitude distortion
                scale_factor = lon_km_per_degree / lat_km_per_degree
                buffer = scale(buffer, xfact=scale_factor, yfact=1.0, origin='center')
                
                # Ensure the buffer is valid
                if not buffer.is_valid:
                    buffer = buffer.buffer(0)  # This often fixes invalid geometries
                
                if buffer.is_valid:
                    buffers.append(buffer)
                    print(f"Created {buffer_size_km}km buffer for {facility.name} ({facility_type})")
                else:
                    print(f"Skipping invalid buffer for facility {facility.name}")
            except Exception as e:
                print(f"Error creating buffer for facility {facility.name}: {str(e)}")
        
        if not buffers:
            return JsonResponse({
                'error': 'No valid buffers could be created'
            }, status=500)
        
        print(f"Created {len(buffers)} valid buffers")
        
        # Merge all buffers
        from shapely.ops import unary_union
        try:
            # Make sure all buffers are valid before merging
            valid_buffers = []
            for i, buffer in enumerate(buffers):
                if buffer.is_valid:
                    valid_buffers.append(buffer)
                else:
                    print(f"Buffer {i} is invalid, attempting to fix")
                    fixed_buffer = buffer.buffer(0)
                    if fixed_buffer.is_valid:
                        valid_buffers.append(fixed_buffer)
                    else:
                        print(f"Could not fix buffer {i}, skipping")
            
            print(f"Merging {len(valid_buffers)} valid buffers")
            
            # If we have many buffers, merge them in batches to avoid memory issues
            if len(valid_buffers) > 100:
                print("Large number of buffers, merging in batches")
                batch_size = 50
                merged_buffer = None
                
                for i in range(0, len(valid_buffers), batch_size):
                    batch = valid_buffers[i:i+batch_size]
                    batch_merged = unary_union(batch)
                    
                    if merged_buffer is None:
                        merged_buffer = batch_merged
                    else:
                        merged_buffer = unary_union([merged_buffer, batch_merged])
                    
                    print(f"Merged batch {i//batch_size + 1}/{(len(valid_buffers)+batch_size-1)//batch_size}")
            else:
                merged_buffer = unary_union(valid_buffers)
            
            print(f"Successfully merged buffers: {merged_buffer.geom_type}")
            
            # Simplify the merged buffer to reduce complexity
            merged_buffer = merged_buffer.simplify(0.0001)
            print("Simplified merged buffer")
            
        except Exception as e:
            print(f"Error merging buffers: {str(e)}")
            print(traceback.format_exc())
            return JsonResponse({
                'error': f'Error merging buffers: {str(e)}'
            }, status=500)
        
        # Get Kisumu boundary
        try:
            kisumu_boundary = get_kisumu_boundary()
            print(f"Kisumu boundary type: {type(kisumu_boundary).__name__}")
            
            # Convert Django geometry to shapely geometry if needed
            if hasattr(kisumu_boundary, 'geom_type'):
                # Already a shapely geometry
                pass
            elif hasattr(kisumu_boundary, 'wkt'):
                # Convert from Django geometry to shapely
                from shapely import wkt
                kisumu_boundary = wkt.loads(kisumu_boundary.wkt)
            else:
                print("Kisumu boundary is not in a usable format")
                kisumu_boundary = None
            
            # Clip the buffer to Kisumu boundary if available
            if kisumu_boundary:
                print("Clipping buffer to Kisumu boundary")
                try:
                    # Ensure both geometries are valid
                    kisumu_boundary = kisumu_boundary.buffer(0)
                    merged_buffer = merged_buffer.buffer(0)
                    
                    # Now perform the intersection
                    merged_buffer = merged_buffer.intersection(kisumu_boundary)
                    print(f"Successfully clipped buffer: {merged_buffer.geom_type}")
                except Exception as e:
                    print(f"Error clipping buffer to boundary: {str(e)}")
                    print(traceback.format_exc())
                    # Continue with the unclipped buffer
                    print("Continuing with unclipped buffer")
            else:
                print("No valid Kisumu boundary available for clipping")
        except Exception as e:
            print(f"Error processing Kisumu boundary: {str(e)}")
            print(traceback.format_exc())
            # Continue with the unclipped buffer
        
        # Convert to GeoJSON
        from shapely.geometry import mapping
        try:
            merged_geojson = mapping(merged_buffer)
            print("Successfully converted to GeoJSON")
        except Exception as e:
            print(f"Error converting to GeoJSON: {str(e)}")
            return JsonResponse({
                'error': f'Error converting to GeoJSON: {str(e)}'
            }, status=500)
        
        # Return the GeoJSON
        return JsonResponse({
            'type': 'Feature',
            'geometry': merged_geojson,
            'properties': {
                'buffer_types': buffer_sizes,
                'facility_count': selected_facilities.count()
            }
        })
    
    except Exception as e:
        print("Error generating merged service areas:", str(e))
        print(traceback.format_exc())
        return JsonResponse({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)





def get_kisumu_boundary():
    """Helper function to get Kisumu County boundary as a shapely geometry"""
    try:
        kisumu_county = KenyaCounty.objects.get(county__iexact='KISUMU')
        return kisumu_county.geom
    except Exception as e:
        print(f"Error getting Kisumu boundary: {str(e)}")
        return None