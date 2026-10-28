//! Deterministic digital logic sessions, shared by native callers and WASM.
mod circuit;
mod lcd;
mod simulation;

pub use simulation::Simulator;
