from django.contrib import admin
from django.contrib import admin
from .models import HealthCareFacility
from leaflet.admin import LeafletGeoAdmin
from django.contrib.gis.geos import Point
from .forms import HealthCareFacilityForm

@admin.register(HealthCareFacility)
class HealthcareFacilityAdmin(LeafletGeoAdmin):
    form = HealthCareFacilityForm
    list_display = ('name', 'facility_type', 'capacity', 'latitude', 'longitude')
    search_fields = ('name', 'facility_type')

    def get_fields(self, request, obj=None):
        fields = ['name', 'facility_type', 'capacity', 'latitude', 'longitude']
        return fields
    
