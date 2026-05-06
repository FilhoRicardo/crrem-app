# CRREM Technical Blueprint — v1.0

Asset- and portfolio-level assessment specification. Intended for developers and AI coding agents building CRREM-aligned tools from scratch.

Generated 2026-04-29 from the canonical workbook. Canonical page: <https://crrem.org/library/technical-blueprint>.


## Dependencies

A CRREM-aligned tool consumes four reference datasets published open-access on the Library's Pathways & Datasets page:

- **CRREM Global Pathways** (required) — year-by-year energy + carbon budgets by region × property type, 2020–2050.
- **Emission Factors** (required) — EFs per carrier, per country, per year. Grid EFs decline annually.
- **Postal Code Lookup** (conditional) — sub-national region resolution for USA, Canada, Australia.
- **HDD/CDD Projections** (optional) — climate-adjusted EUI projection under SSP scenarios.


## Asset-level · Step 1 — Input data collection

### Identification

| Field | Unit | Required | Description |
|---|---|---|---|
| `Asset_Name` | — | yes | Free-text label. |
| `Asset_ID` | — | optional | Unique identifier per asset. |
| `GAV` | currency | optional | Gross Asset Value. Not used in intensity calculations. _Must be entered in a consistent currency across all assets in a portfolio._ |

### Location

| Field | Unit | Required | Description |
|---|---|---|---|
| `Country` | — | yes | Country name. Must match Pathways and Emission Factors sheets exactly. _For USA, Canada, Australia, Country alone is not sufficient — Postal_Code is also required._ |
| `Postal_Code` | text | conditional | Required only for countries with sub-national pathways (USA, CAN, AUS). _Store as text to preserve leading zeros. Resolved via Postal Code Lookup in Step 5.1._ |

### Use and floor area

| Field | Unit | Required | Description |
|---|---|---|---|
| `Property_Type` | — | yes | One of the canonical CRREM property types, or 'Mixed Use'. _See Property Types & Definitions reference._ |
| `MU_[Type]_Pct` | % | mixed-use only | Floor-area share per use type (e.g. MU_Office_Pct = 70). _All MU_* columns must sum to 100%. Ignored for single-use assets._ |
| `GIA` | m² | yes | Gross Internal Area. Denominator for all intensity calculations. _Must be > 0. Excludes indoor parking._ |
| `Reporting_Year` | yyyy | yes | Year the consumption data refers to. _Must exist as a column in Pathways and Emission Factors datasets._ |

### Energy consumption (whole-building, landlord + tenant, kWh/yr, ≥ 0)

| Field | Unit | Required | Description |
|---|---|---|---|
| `Elec_Grid` | kWh/yr | yes | Grid electricity consumption. |
| `Gas` | kWh/yr | if applicable | Natural gas consumption. _Enter 0 if unused._ |
| `Oil` | kWh/yr | if applicable | Heating oil consumption. |
| `District_Heating` | kWh/yr | if applicable | District heating consumption. |
| `District_Cooling` | kWh/yr | if applicable | District cooling consumption. |
| `Biomass` | kWh/yr | if applicable | Biomass energy consumption. |
| `Other_Fuels` | kWh/yr | if applicable | Coal, LPG, or other fuels. |
| `Renew_Consumed` | kWh/yr | if applicable | On-site renewable energy generated AND consumed on-site. _EF = 0 for carbon. Counts toward Total_Energy._ |
| `Renew_Exported` | kWh/yr | if applicable | On-site renewable energy exported to grid. _NOT in Total_Energy. Used only for grid export credit in Step 4, capped at CO2_Elec._ |


## Asset-level · Step 2 — Whole-building energy & EUI

```
Total_Energy = Elec_Grid + Gas + Oil + District_Heating + District_Cooling
             + Biomass + Other_Fuels + Renew_Consumed
             # Renew_Exported is NOT included
EUI = Total_Energy / GIA     # kWh/m²/yr — KEY OUTPUT
```


## Asset-level · Step 3 — Emission factors

| Carrier | Unit | Varies | Lookup |
|---|---|---|---|
| Grid Electricity | kgCO2e/kWh | annually | INDEX/MATCH on EF table: Country row, Reporting_Year column |
| Natural Gas      | kgCO2e/kWh | constant | Single value per carrier (~0.202 kgCO2e/kWh default) |
| Oil / Heating Oil| kgCO2e/kWh | constant | Single value (~0.281 kgCO2e/kWh) |
| District Heating | kgCO2e/kWh | country-specific | Site-specific preferred; legacy fallback available |
| District Cooling | kgCO2e/kWh | country-specific | Same logic as DH |
| Biomass          | kgCO2e/kWh | constant | Dataset-defined |
| Other_Fuels      | kgCO2e/kWh | constant | Dataset-defined |
| Renew_Consumed   | kgCO2e/kWh | hard-coded | EF = 0 by definition |


## Asset-level · Step 4 — Carbon intensity

```
# Per-carrier emissions
CO2_Elec    = Elec_Grid        * EF_Electricity(country, Reporting_Year)
CO2_Gas     = Gas              * EF_Gas
CO2_Oil     = Oil              * EF_Oil
CO2_DH      = District_Heating * EF_DH
CO2_DC      = District_Cooling * EF_DC
CO2_Biomass = Biomass          * EF_Biomass
CO2_Other   = Other_Fuels      * EF_Other
CO2_Renew   = Renew_Consumed   * 0     # hard-coded
Total_CO2   = SUM(CO2_Elec : CO2_Renew)

# Grid export credit — CRITICAL: capped at grid electricity emissions
Raw_Export_Credit  = Renew_Exported * EF_Electricity
Max_Credit         = Elec_Grid      * EF_Electricity
Grid_Export_Credit = MIN(Raw_Export_Credit, Max_Credit)

Net_CO2          = Total_CO2 - Grid_Export_Credit
Carbon_Intensity = Net_CO2 / GIA   # kgCO2e/m²/yr — KEY OUTPUT
```


## Asset-level · Step 5 — Pathway selection

Resolve CRREM_Region, then INDEX/MATCH into the Pathways dataset on CRREM_Region × Property_Type × year.

### Resolution procedure

1. **Read Country** — From asset input. Starting point.
2. **Check sub-national split** — If USA, CAN, or AUS → lookup. Otherwise: CRREM_Region = Country.
3. **Resolve postal code** — Lookup Postal_Code in the external Postal Code Lookup table.
4. **Select pathway row** — INDEX/MATCH CRREM_Region & Property_Type in Pathways dataset.

### Sub-national examples

- USA (eGRID subregion + climate zone): `ZIP 10005` → `NYSTc_Mixed mild_4A`
- Canada (province-level): `FSA T2P` → `Alberta`
- Australia (NCC climate zone): `Postcode 2170` → `NCC Zone 6`

### Mixed-use blending

```
# For EACH year t separately:
Blended_Pathway(t) = SUM_over_i( MU_Pct[i] * Pathway(Country, Type[i], t) )
# Example: 70% Office / 30% Retail at 2030:
#   = 0.70 * Pathway(Country, 'Office', 2030) + 0.30 * Pathway(Country, 'Retail High Street', 2030)
```


## Asset-level · Step 6 — Misalignment year

**No-retrofit baseline assumptions:**

- Energy demand held constant from Reporting_Year (flat EUI).
- Grid electricity EF declines annually.
- All other EFs constant. Exception: DH/DC legacy fallback tracks grid trajectory.

```
for t in range(Reporting_Year, 2051):
    CO2(t)                = Elec_Grid * EF_Elec(t) + Gas * EF_Gas + ... + Renew_Consumed * 0
    Grid_Export_Credit(t) = MIN(Renew_Exported * EF_Elec(t), Elec_Grid * EF_Elec(t))
    Carbon_Intensity(t)   = (CO2(t) - Grid_Export_Credit(t)) / GIA

CO2_Misalignment_Year = first t where Carbon_Intensity(t) > CO2_Pathway(t)
EUI_Misalignment_Year = first t where EUI(t) > EUI_Pathway(t)
# Report Reporting_Year if already misaligned, or 'Beyond 2050' if no crossing
```


### 6.1a · Optional climate-adjusted EUI

Requires HDD/CDD projections dataset and an SSP scenario choice.

```
HDD_Ratio(t)   = HDD(t, scenario) / HDD_Base     # set 0 if HDD_Base = 0
CDD_Ratio(t)   = CDD(t, scenario) / CDD_Base
Energy_Heating = Gas + Oil + District_Heating + Biomass           # simplified split
Energy_Cooling = District_Cooling                                 # (or share of Elec_Grid)
Energy_Baseload= Total_Energy - Energy_Heating - Energy_Cooling
Total_Energy(t)= Energy_Heating * HDD_Ratio(t) + Energy_Cooling * CDD_Ratio(t) + Energy_Baseload
EUI(t, scenario) = Total_Energy(t) / GIA
```


## Portfolio-level · Step 1 — Assemble asset results

Carry forward per asset from the asset-level assessment:
`Asset_ID, Asset_Name, GIA, Carbon_Intensity, EUI, CO2_Pathway(t), EUI_Pathway(t)`. Optional: `GAV, CRREM_Region`. Every portfolio asset must have a completed asset-level result including the full year-by-year pathway time series.


## Portfolio-level · Step 2 — GIA-weighted aggregation

```
Total_GIA     = SUM(GIA_j)
GIA_Weight_j  = GIA_j / Total_GIA                                 # must sum to 100%

# Reporting-year snapshot
Portfolio_Carbon_Intensity = SUM_over_j( GIA_Weight_j * Carbon_Intensity_j )
Portfolio_EUI              = SUM_over_j( GIA_Weight_j * EUI_j )

# Forward projection (per year)
Portfolio_Carbon_Intensity(t) = SUM_over_j( GIA_Weight_j * Carbon_Intensity_j(t) )
Portfolio_EUI(t)              = SUM_over_j( GIA_Weight_j * EUI_j(t) )
```


## Portfolio-level · Step 3 — Weighted pathway

```
Portfolio_CO2_Pathway(t) = SUM_over_j( GIA_Weight_j * CO2_Pathway_j(t) )   # for each t in 2020..2050
Portfolio_EUI_Pathway(t) = SUM_over_j( GIA_Weight_j * EUI_Pathway_j(t) )
```


## Portfolio-level · Step 4 — Compare against pathway

```
Portfolio_CO2_Misalignment_Year = first t where Portfolio_Carbon_Intensity(t) > Portfolio_CO2_Pathway(t)
Portfolio_EUI_Misalignment_Year = first t where Portfolio_EUI(t)              > Portfolio_EUI_Pathway(t)
```


## Edge cases (must-get-right)

### Grid export credit cap (critical)
Credit for exported on-site renewables is capped at grid electricity emissions. You cannot offset gas, oil, or district heating emissions with surplus solar export.
```
Grid_Export_Credit = MIN(Renew_Exported * EF_Elec, Elec_Grid * EF_Elec)
```

### Mixed-use pathway blending (critical)
For mixed-use buildings there is no single pathway row. Compute a floor-area-weighted blend of the per-use pathways, separately for every year from 2020 to 2050.
```
Blended_Pathway(t) = SUM_over_i( MU_Pct[i] * Pathway(Country, Type[i], t) )
```

### Renew_Consumed counts for EUI, not CO2 (behavior)
On-site renewables consumed on-site are real energy consumption and are included in Total_Energy. Their emission factor is 0, so they do not affect Carbon_Intensity. This asymmetry is by design.

### District heating/cooling EF — legacy fallback (legacy)
If no site-specific EF is supplied, the legacy fallback scales the UK default (0.20431) against the local grid trajectory.
```
EF_DH(country, t) = 0.20431 * EF_Grid(country, t) / EF_Grid(UK, 2020)
```

### Climate-adjusted EUI projection (HDD/CDD) (optional)
Default is flat demand. If HDD/CDD projections are supplied, scale heating and cooling shares of energy separately.
```
Total_Energy(t) = Energy_Heating * HDD_Ratio(t) + Energy_Cooling * CDD_Ratio(t) + Energy_Baseload
```

### Forward projection basis (behavior)
Energy demand held constant. Grid EFs decline annually per the Emission Factors dataset. All other EFs are constant (exception: DH/DC legacy fallback follows the grid trajectory). This produces a year-by-year declining Carbon_Intensity curve even without retrofits.


## Validation

A compliant tool must reproduce the outputs of the four worked examples exactly (Midtown Tower · Pacific Plaza Mall · Northgate Quarter · Eastfield Logistics) plus the portfolio aggregate. Fixtures live in the companion workbook and on the Reference Implementations page.


## Citation

CRREM Foundation (2026). *CRREM Technical Blueprint: Asset & Portfolio Assessment Specification* v1.0. Amsterdam. <https://crrem.org/library/technical-blueprint>

