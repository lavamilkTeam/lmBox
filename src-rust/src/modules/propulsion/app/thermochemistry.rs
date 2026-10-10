use super::super::{features::thermochemistry, runtime::cea};
use crate::contracts::thermochemistry::{CeaRequest, CeaResult};
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum CeaError {
    #[error("invalid CEA request: {0}")]
    InvalidRequest(String),
    #[error("CEA runtime: {0}")]
    Runtime(String),
}

/// Synchronous native backend. Runtime directory is trusted host configuration,
/// never a path supplied inside a calculation request. No result is persisted.
pub struct CeaBackend {
    runtime_dir: PathBuf,
}

impl CeaBackend {
    pub fn load(runtime_dir: impl AsRef<Path>) -> Result<Self, CeaError> {
        let runtime_dir = runtime_dir
            .as_ref()
            .canonicalize()
            .map_err(|e| CeaError::Runtime(e.to_string()))?;
        cea::initialize(&runtime_dir).map_err(CeaError::Runtime)?;
        Ok(Self { runtime_dir })
    }

    pub fn solve(&self, request: &CeaRequest) -> Result<CeaResult, CeaError> {
        thermochemistry::validate(request).map_err(CeaError::InvalidRequest)?;
        let solution = cea::solve(&self.runtime_dir, request).map_err(CeaError::Runtime)?;
        Ok(CeaResult {
            schema_version: 1,
            project_id: request.project_id.clone(),
            job_id: request.job_id.clone(),
            input_revision: request.input_revision,
            engine_version: "NASA CEA 3.3.4 (Fortran)".into(),
            converged: true,
            solution,
        })
    }
}
