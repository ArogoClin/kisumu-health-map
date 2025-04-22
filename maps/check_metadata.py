import rasterio

file = "D:\\AROGO\\Documents\\ken_general_2020_geotiff\\ken_general_2020.tif"

with rasterio.open(file) as src:
    metadata = src.meta
    print(metadata)
    print(src.crs)
    print(src.bounds)
    print(src.transform)

    