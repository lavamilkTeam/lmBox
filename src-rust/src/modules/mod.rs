#[cfg(not(target_arch = "wasm32"))]
pub mod ai;
#[cfg(not(target_arch = "wasm32"))]
pub mod cfd;
pub mod digital_logic;
#[cfg(not(target_arch = "wasm32"))]
pub mod propulsion;
pub mod stencil;
