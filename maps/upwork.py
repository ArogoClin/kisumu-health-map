import pandas as pd
from openpyxl import Workbook

# Load Excel File
df = pd.read_excel("applicants.xlsx")

# Standardize AWS Certification Column
df['AWS Certification'] = df['AWS Certification'].str.strip().str.lower()

# Define Salary Multipliers
aws_bonus = 1.2  # 20% increase for AWS-certified applicants
experience_salary = {
    "0-2 years": 50000,
    "3-5 years": 70000,
    "6-10 years": 100000,
    "10+ years": 130000
}

# Function to determine base salary
def determine_salary(exp, aws_certified):
    base_salary = experience_salary.get(exp, 50000)
    if aws_certified:
        return base_salary * aws_bonus  # Increase salary if AWS certified
    return base_salary

# Apply Salary Calculation
df["AWS Certified"] = df["AWS Certification"].apply(lambda x: x == "yes")
df["Recommended Salary"] = df.apply(lambda row: determine_salary(row["Experience"], row["AWS Certified"]), axis=1)

# Save results to a new Excel file
df.to_excel("salary_recommendations.xlsx", index=False, engine="openpyxl")

print("Salary recommendations file has been generated successfully!")
