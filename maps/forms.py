from django import forms
from .models import HealthCareFacility
from django.contrib.gis.geos import Point

class HealthCareFacilityForm(forms.ModelForm):
    latitude = forms.FloatField(
        required=True,
        help_text='Enter Latitude of the facility'
    )
    longitude = forms.FloatField(
        required=True,
        help_text='Enter Longitude of the facility'
    )

    class Meta:
        model = HealthCareFacility
        fields = ['name', 'facility_type', 'capacity']  # Remove 'location' from fields

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.location:
            self.fields['latitude'].initial = self.instance.latitude()
            self.fields['longitude'].initial = self.instance.longitude()

    def clean(self):
        cleaned_data = super().clean()
        lat = cleaned_data.get('latitude')
        lon = cleaned_data.get('longitude')
        
        if lat and lon:
            cleaned_data['location'] = Point(lon, lat)
        return cleaned_data
