from django.urls import path
from .views import facility_map, get_population_density, get_population_density_for_area, site_suitability_analysis
from .views import healthcare_dashboard, merged_service_areas
urlpatterns = [
    path('map/', facility_map, name='facility_map'),
    path('api/population-density/', get_population_density, name='get_population_density'),
    path('api/population-density-for-area/', get_population_density_for_area, name='population_density_for_area'),
    path('api/site-suitability-analysis/', site_suitability_analysis, name='site_suitability_analysis'),
    path('dashboard/', healthcare_dashboard, name='healthcare_dashboard'),
    path('api/merged-service-areas/', merged_service_areas, name='merged_service_areas')




]
