from django.contrib import admin
from .models import Consituency, Ward

# Register your models here.
@admin.register(Consituency)
class ConsituencyAdmin(admin.ModelAdmin):
    list_display = ('name', 'population', 'area_km2', 'population_density')
    search_fields = ('name',)

@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    list_display = ('name', 'population', 'area_km2', 'population_density', 'constituency')
    search_fields = ('name',)
    list_filter = ('constituency',)