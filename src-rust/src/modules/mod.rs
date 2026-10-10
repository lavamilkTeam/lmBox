#[cfg(not(target_arch = "wasm32"))]
pub mod cfd;
#[cfg(not(target_arch = "wasm32"))]
pub mod propulsion;
pub mod stencil;
