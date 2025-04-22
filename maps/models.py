from django.contrib.gis.db import models
from django.contrib.gis.geos import Point

# Create your models here.
class HealthCareFacility(models.Model):
    name = models.CharField(max_length=100) # Name of the facility
    facility_type = models.CharField(max_length=100, blank=True, null=True) # Type of facility e.g. Hospital, Clinic
    location = models.PointField(srid=4326) # GeoDjango PointField
    capacity = models.IntegerField(blank=True, null=True) # Number of patients the facility can hold

    def __str__(self):
        return self.name
    
    def latitude(self):
        return self.location.y if self.location else None
    
    def longitude(self):
        return self.location.x if self.location else None


class FacilityServiceArea(models.Model):
    facility = models.ForeignKey(HealthCareFacility, on_delete=models.CASCADE)
    buffer_radius = models.FloatField() # Buffer radius in meters
    service_area = models.PolygonField(srid=4326) # GeoDjango PolygonField
    population_served = models.IntegerField() # Number of people served by the facility


class KenyaCounty(models.Model):
    # map existing kenya_counties table

    class Meta:
        managed = False
        db_table = 'kenya_counties'

    gid = models.AutoField(primary_key=True)
    county = models.CharField(max_length=100)
    geom = models.MultiPolygonField(srid=4326)

    def __str__(self):
        return self.county


class KenyaConstituency(models.Model):
    # map existing kenya_constituencies table

    class Meta:
        managed = False
        db_table = 'kenya_constituencies'

    gid = models.AutoField(primary_key=True)
    const_no = models.IntegerField()
    const_name = models.CharField(max_length=100)
    county_nam = models.CharField(max_length=100)
    geom = models.MultiPolygonField(srid=4326)

    def __str__(self):
        return self.const_name


class KenyaWard(models.Model):
    # map existing kenya_wards table

    class Meta:
        managed = False
        db_table = 'kenya_wards'

    gid = models.AutoField(primary_key=True)
    ward = models.CharField(max_length=100)
    subcounty = models.CharField(max_length=100)
    county = models.CharField(max_length=100)
    geom = models.MultiPolygonField(srid=4326)
    uid = models.CharField(max_length=100)
    pop2009 = models.IntegerField()

    def __str__(self):
        return self.ward


class PopulationDensity(models.Model):
    """Model to store raster population density data"""
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    year = models.IntegerField()
    raster_file = models.FileField(upload_to='population_density/')
    source = models.CharField(max_length=255, blank=True)
    
    def __str__(self):
        return f"{self.name} ({self.year})"
    
    class Meta:
        verbose_name_plural = "Population Density Datasets"
