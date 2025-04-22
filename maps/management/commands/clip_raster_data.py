from django.core.management.base import BaseCommand
import os
import rasterio
import geopandas as gpd
from rasterio.mask import mask
from shapely.geometry import mapping

class Command(BaseCommand):
    help = 'Clip a Kenya-wide population density raster to Kisumu County boundary'

    def add_arguments(self, parser):
        parser.add_argument('--input', type=str, required=True, help='Path to input GeoTIFF file')
        parser.add_argument('--boundary', type=str, required=True, help='Path to boundary shapefile')
        parser.add_argument('--output', type=str, required=True, help='Path for output GeoTIFF file')

    def handle(self, *args, **options):
        input_raster = options['input']
        boundary_shapefile = options['boundary']
        output_raster = options['output']
        
        self.stdout.write(self.style.SUCCESS(f'Starting to clip raster {input_raster}'))
        
        try:
            # Read the boundary shapefile
            self.stdout.write('Loading boundary shapefile...')
            boundary_gdf = gpd.read_file(boundary_shapefile)
            self.stdout.write(str(boundary_gdf.crs))

            
            # Find Kisumu County
            if 'county' in boundary_gdf.columns:
                kisumu_boundary = boundary_gdf[boundary_gdf['county'] == 'Kisumu']
            elif 'COUNTY' in boundary_gdf.columns:
                kisumu_boundary = boundary_gdf[boundary_gdf['COUNTY'] == 'Kisumu']
            elif 'County' in boundary_gdf.columns:
                kisumu_boundary = boundary_gdf[boundary_gdf['County'] == 'Kisumu']
            elif 'name' in boundary_gdf.columns:
                kisumu_boundary = boundary_gdf[boundary_gdf['name'] == 'Kisumu']
            else:
                self.stdout.write(self.style.WARNING(
                    'Could not find a column to filter by county name. Using the first feature.'
                ))
                kisumu_boundary = boundary_gdf.iloc[[0]]
            
            # Check if we found Kisumu
            if len(kisumu_boundary) == 0:
                self.stdout.write(self.style.ERROR('Could not find Kisumu County in the shapefile'))
                return
            
            self.stdout.write(f'Found Kisumu boundary with area: {kisumu_boundary.geometry.area.values[0]:.2f} square units')
            
            # Get the geometry as a GeoJSON-like dict
            geometry = [mapping(geom) for geom in kisumu_boundary.geometry]
            
            # Open the raster file
            self.stdout.write('Opening raster file...')
            with rasterio.open(input_raster) as src:
                # Perform the clip
                self.stdout.write('Clipping raster to Kisumu boundary...')
                self.stdout.write(str(src.crs))
                out_image, out_transform = mask(src, geometry, crop=True)
                
                # Copy the metadata
                out_meta = src.meta.copy()
                
                # Update the metadata
                out_meta.update({
                    "driver": "GTiff",
                    "height": out_image.shape[1],
                    "width": out_image.shape[2],
                    "transform": out_transform
                })
                
                # Create output directory if it doesn't exist
                os.makedirs(os.path.dirname(output_raster), exist_ok=True)
                
                # Write the clipped raster
                self.stdout.write('Writing clipped raster...')
                with rasterio.open(output_raster, "w", **out_meta) as dest:
                    dest.write(out_image)
            
            self.stdout.write(self.style.SUCCESS(f'Successfully clipped raster to {output_raster}'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))
