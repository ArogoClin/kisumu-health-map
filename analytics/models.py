from django.db import models

# Create your models here.

class Consituency(models.Model):
    name = models.CharField(max_length=100, unique=True)
    population = models.IntegerField()
    area_km2 = models.FloatField()
    population_density = models.FloatField()

    def __str__(self):
        return self.name
    
class Ward(models.Model):
    name = models.CharField(max_length=100, unique=True)
    population = models.IntegerField()
    area_km2 = models.FloatField()
    population_density = models.FloatField()
    constituency = models.ForeignKey(Consituency, on_delete=models.CASCADE)

    def __str__(self):
        return self.name
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            