use crate::contracts::thermochemistry::{Calculation, CeaRequest};
use std::collections::HashSet;

pub(crate) fn validate(request: &CeaRequest) -> Result<(), String> {
    if request.schema_version != 1 {
        return Err("unsupported thermochemistry schemaVersion".into());
    }
    for id in [&request.project_id, &request.job_id] {
        if id.trim().is_empty() || id.len() > 128 || id.chars().any(char::is_control) {
            return Err("projectId and jobId must contain 1–128 non-control bytes".into());
        }
    }
    if request.reactants.is_empty() || request.reactants.len() > 32 {
        return Err("expected 1–32 reactants".into());
    }
    let mut names = HashSet::new();
    let mut total = 0.0;
    for r in &request.reactants {
        if r.species.is_empty()
            || r.species.len() > 15
            || !r.species.bytes().all(|b| b.is_ascii_graphic())
            || !names.insert(&r.species)
        {
            return Err("reactant names must be unique CEA names of 1–15 ASCII characters".into());
        }
        positive(r.mass_fraction, "massFraction")?;
        positive(r.temperature_k, "temperatureK")?;
        total += r.mass_fraction;
    }
    if (total - 1.0).abs() > 1e-8 {
        return Err("reactant mass fractions must sum to 1".into());
    }
    match &request.calculation {
        Calculation::Tp {
            temperature_k,
            pressure_pa,
        } => {
            positive(*temperature_k, "temperatureK")?;
            positive(*pressure_pa, "pressurePa")?;
        }
        Calculation::Hp { pressure_pa } => positive(*pressure_pa, "pressurePa")?,
        Calculation::Rocket {
            chamber_pressure_pa,
            exit_area_ratios,
            ..
        } => {
            positive(*chamber_pressure_pa, "chamberPressurePa")?;
            if exit_area_ratios.is_empty()
                || exit_area_ratios.len() > 32
                || exit_area_ratios.iter().any(|v| !v.is_finite() || *v <= 1.0)
                || exit_area_ratios.windows(2).any(|p| p[0] >= p[1])
            {
                return Err(
                    "expected 1–32 strictly increasing supersonic exit area ratios above 1".into(),
                );
            }
        }
    }
    Ok(())
}

fn positive(value: f64, field: &str) -> Result<(), String> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(format!("{field} must be finite and positive"))
    }
}
