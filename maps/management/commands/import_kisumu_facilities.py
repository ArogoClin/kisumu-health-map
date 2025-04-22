from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
from maps.models import HealthCareFacility
import csv

class Command(BaseCommand):
    help = 'Import Kisumu healthcare facilities from CSV file'

    def handle(self, *args, **kwargs):
        HealthCareFacility.objects.all().delete()
        
        count = 0
        with open('C:\\Users\\AROGO\\django_projects\\Church_Attendance\\HealthMapper\\maps\\management\\commands\\healthcare_facilities.csv', 'r') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                if row['County'].strip().lower() == 'kisumu':
                    try:
                        lat = float(row['Latitude'].strip())
                        lon = float(row['Longitude'].strip())
                        
                        facility = HealthCareFacility.objects.create(
                            name=row['Facility_N'].strip(),
                            facility_type=row['Type'].strip(),
                            location=Point(lon, lat, srid=4326),
                            capacity=None
                        )
                        count += 1
                        self.stdout.write(f"Added facility: {facility.name} at {lat}, {lon}")
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Error importing row: {row['Facility_N']} - {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f'Successfully imported {count} Kisumu facilities from CSV'))
