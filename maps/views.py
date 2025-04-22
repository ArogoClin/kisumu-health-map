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
        fields=('ward', 'pop2009', 'subcounty')
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
    try:
        print("Starting site suitability analysis...")
        start_time = time.time()
        
        # Get existing facilities
        existing_facilities = HealthCareFacility.objects.exclude(
            facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)', 'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme',  ]
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
        
        # Create 5km buffers around existing facilities
        facility_buffers = []
        for facility in existing_facilities:
            try:
                # Get facility point as shapely geometry
                facility_point = shape(json.loads(facility.location.json))
                
                # Create buffer (similar to your existing code)
                lat = facility_point.y
                lon = facility_point.x
                
                # Calculate approximate degrees for 5km buffer
                lat_km_per_degree = 111.0
                lon_km_per_degree = 111.0 * np.cos(np.radians(lat))
                
                # Convert 5km to degrees
                lat_buffer = 5.0 / lat_km_per_degree
                lon_buffer = 5.0 / lon_km_per_degree
                
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
        
        print(f"Created {len(facility_buffers)} facility buffers")
        
        # Merge all buffers
        if not facility_buffers:
            return JsonResponse({'error': 'No valid facility buffers could be created'}, status=500)
        
        merged_buffer = unary_union(facility_buffers)
        print("Merged all facility buffers")
        
        # Find areas outside the buffer (underserved areas)
        underserved_areas = kisumu_boundary.difference(merged_buffer)
        print(f"Identified underserved areas: {underserved_areas.area} square degrees")
        
        # If there are no underserved areas, return early
        if underserved_areas.is_empty:
            return JsonResponse({
                'message': 'No underserved areas found. The entire county is within 5km of an existing facility.',
                'processing_time': time.time() - start_time
            })
        
        # Now analyze population density in underserved areas
        print("Analyzing population density in underserved areas...")
        
        # Create a grid of potential facility locations
        grid_size = 0.01  # Approximately 1km grid
        
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
        
        # Open the raster file once for all points
        with rasterio.open(population_dataset.raster_file.path) as src:
            for batch_idx in range(num_batches):
                start_idx = batch_idx * batch_size
                end_idx = min((batch_idx + 1) * batch_size, len(grid_points))
                batch_points = grid_points[start_idx:end_idx]
                
                print(f"Processing batch {batch_idx + 1}/{num_batches} ({len(batch_points)} points)")
                
                for point in batch_points:
                    try:
                        # Create a small buffer around the point for raster analysis
                        # This helps avoid the "inhomogeneous shape" error
                        analysis_buffer = point.buffer(0.001)  # Small buffer for analysis
                        
                        # Create a 5km service area around this point
                        lat = point.y
                        lon = point.x
                        
                        # Calculate approximate degrees for 5km buffer
                        lat_km_per_degree = 111.0
                        lon_km_per_degree = 111.0 * np.cos(np.radians(lat))
                        
                        # Convert 5km to degrees
                        lat_buffer = 5.0 / lat_km_per_degree
                        
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
                                
                                # Calculate area in square kilometers
                                wgs84 = pyproj.CRS('EPSG:4326')
                                utm = pyproj.CRS('EPSG:32736')
                                transformer = pyproj.Transformer.from_crs(wgs84, utm, always_xy=True)
                                
                                def transform_fn(x, y):
                                    return transformer.transform(x, y)
                                
                                service_area_utm = transform(transform_fn, service_area)
                                area_km2 = service_area_utm.area / 1000000
                                
                                # Calculate population served
                                population_served = int(mean_density * area_km2)
                                
                                # Find ward this point is in
                                ward = None
                                ward_obj = None
                                for w in KenyaWard.objects.filter(county__iexact='KISUMU'):
                                    ward_geom = shape(json.loads(w.geom.json))
                                    if point.within(ward_geom):
                                        ward = w.ward
                                        ward_obj = w
                                        break
                                
                                # Calculate additional metrics
                                # 1. Population density score (higher is better)
                                density_score = min(mean_density / 1000, 1.0)  # Normalize to 0-1
                                
                                # 2. Existing coverage score (lower coverage is better for new facilities)
                                coverage_score = 0.0
                                if ward_obj:
                                    # Calculate how much of the ward is already covered
                                    ward_geom = shape(json.loads(ward_obj.geom.json))
                                    ward_area_utm = transform(transform_fn, ward_geom)
                                    ward_area_km2 = ward_area_utm.area / 1000000
                                    
                                    # Calculate intersection with existing facility buffers
                                    ward_coverage = ward_geom.intersection(merged_buffer)
                                    ward_coverage_utm = transform(transform_fn, ward_coverage)
                                    coverage_km2 = ward_coverage_utm.area / 1000000
                                    
                                    # Calculate percentage covered
                                    if ward_area_km2 > 0:
                                        coverage_percent = (coverage_km2 / ward_area_km2) * 100
                                        # Invert so lower coverage gets higher score
                                        coverage_score = 1.0 - min(coverage_percent / 100, 1.0)
                                
                                # 3. Calculate composite score (weighted average)
                                # Population served is the primary factor (60%)
                                # Low existing coverage is secondary (30%)
                                # Population density is tertiary (10%)
                                population_score = min(population_served / 50000, 1.0)  # Normalize to 0-1
                                composite_score = (0.7 * population_score) + (0.4 * coverage_score) + (0.2 * density_score)
                                
                                # Score this location
                                scored_locations.append({
                                    'type': 'Feature',
                                    'geometry': mapping(point),
                                    'properties': {
                                        'population_served': population_served,
                                        'area_km2': area_km2,
                                        'mean_density': mean_density,
                                        'ward': ward,
                                        'density_score': density_score,
                                        'coverage_score': coverage_score,
                                        'population_score': population_score,
                                        'composite_score': composite_score
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
            # ~5km in degrees is roughly 0.045 degrees
            min_distance = 0.045
            
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
                    print(f"Reducing minimum distance to {min_distance} degrees")
                    
                    # If minimum distance gets too small, just take the highest scored remaining
                    if min_distance < 0.01:  # ~1km
                        print("Minimum distance too small, selecting highest scored remaining location")
                        distributed_locations.append(remaining_candidates[0])
                        remaining_candidates.pop(0)
        
        # Use the distributed locations instead of just the top 20
        top_locations = distributed_locations[:20]
        
        # Create GeoJSON for underserved areas
        underserved_geojson = mapping(underserved_areas)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        print(f"Site suitability analysis completed in {processing_time:.2f} seconds")
        
        return JsonResponse({
            'type': 'FeatureCollection',
            'features': top_locations,
            'underserved_area': underserved_geojson,
            'total_locations_analyzed': len(scored_locations),
            'processing_time': processing_time
        })
    
    except Exception as e:
        print("Error in site suitability analysis:", str(e))
        print(traceback.format_exc())
        return JsonResponse({
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=500)


def healthcare_dashboard(request):
    """View for the healthcare dashboard"""
    # Get Kisumu data
    kisumu_county = KenyaCounty.objects.get(county__iexact='KISUMU')
    kisumu_constituencies = KenyaConstituency.objects.filter(county_nam__iexact='KISUMU')
    kisumu_wards = KenyaWard.objects.filter(county__iexact='KISUMU')
    
    # Get selected facilities in Kisumu
    selected_facilities = HealthCareFacility.objects.exclude(
        facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)', 'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme',  ]
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
        fields=('ward', 'pop2009', 'subcounty')
    )

    facilities_json = serialize('geojson', selected_facilities,
        geometry_field='location',
        fields=('name', 'facility_type', 'capacity')
    )
    
    # Calculate summary statistics
    total_population = sum(ward.pop2009 or 0 for ward in kisumu_wards)
    total_facilities = selected_facilities.count()
    
    # Calculate coverage (simplified for demonstration)
    # In a real implementation, you'd use your service area analysis
    coverage_percent = 65.3  # Example value
    
    # Travel time coverage (simplified for demonstration)
    # In a real implementation, you'd use your travel time analysis
    travel_time_coverage = {
        5: 25.7,   # 5 minutes: 25.7% coverage
        10: 42.3,  # 10 minutes: 42.3% coverage
        15: 58.1,  # 15 minutes: 58.1% coverage
        30: 78.9   # 30 minutes: 78.9% coverage
    }
    
    # Create summary stats object
    summary_stats = {
        'total_population': float(total_population) if isinstance(total_population, Decimal) else total_population,
        'total_facilities': total_facilities,
        'coverage_percent': coverage_percent,
        'travel_time_coverage': travel_time_coverage
    }

    # Custom JSON to handle Decimal objects
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
    """API endpoint to generate merged 5km service areas for all facilities"""
    try:
        # Get facilities
        selected_facilities = HealthCareFacility.objects.exclude(
            facility_type__in=['Dispensary', 'Pharmacy', 'VCT Centre (Stand-Alone)', 'Laboratory (Stand-alone)', 'Nursing Home', 'Health Programme',  ]
        )
        
        print(f"Creating buffers for {selected_facilities.count()} facilities")
        
        # Create buffer for each facility
        from shapely.geometry import Point
        buffers = []
        
        for facility in selected_facilities:
            try:
                # Create a 5km buffer
                point = Point(facility.location.x, facility.location.y)
                
                # Convert km to degrees (approximate)
                # 1 degree latitude is about 111 km
                # 1 degree longitude varies with latitude, roughly 111 * cos(latitude) km
                lat = point.y
                lon = point.x
                
                # Calculate approximate degrees for the buffer
                lat_km_per_degree = 111.0  # km per degree of latitude
                lon_km_per_degree = 111.0 * np.cos(np.radians(lat))  # km per degree of longitude
                
                # Convert 5km to degrees (different for lat and lon)
                lat_buffer = 5.0 / lat_km_per_degree
                lon_buffer = 5.0 / lon_km_per_degree
                
                # Create an elliptical buffer (more accurate than circular at non-equatorial latitudes)
                buffer = point.buffer(lat_buffer)
                buffer = scale(buffer, xfact=lon_km_per_degree/lat_km_per_degree, yfact=1.0, origin='center')
                
                # Ensure the buffer is valid
                if not buffer.is_valid:
                    buffer = buffer.buffer(0)  # This often fixes invalid geometries
                
                if buffer.is_valid:
                    buffers.append(buffer)
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
            merged_buffer = unary_union(buffers)
            print(f"Successfully merged buffers: {merged_buffer.geom_type}")
        except Exception as e:
            print(f"Error merging buffers: {str(e)}")
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
                    # Use prepared geometries for better performance
                    from shapely.prepared import prep
                    prepared_boundary = prep(kisumu_boundary)
                    
                    # Check if the merged buffer intersects with the boundary
                    if prepared_boundary.intersects(merged_buffer):
                        # Use a small buffer to avoid topology errors
                        kisumu_boundary = kisumu_boundary.buffer(0)
                        merged_buffer = merged_buffer.buffer(0)
                        
                        # Now perform the intersection
                        merged_buffer = merged_buffer.intersection(kisumu_boundary)
                        print(f"Successfully clipped buffer: {merged_buffer.geom_type}")
                    else:
                        print("Merged buffer does not intersect with Kisumu boundary")
                except Exception as e:
                    print(f"Error clipping buffer to boundary: {str(e)}")
                    # Continue with the unclipped buffer
                    print("Continuing with unclipped buffer")
            else:
                print("No valid Kisumu boundary available for clipping")
        except Exception as e:
            print(f"Error processing Kisumu boundary: {str(e)}")
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
            'geometry': merged_geojson
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
