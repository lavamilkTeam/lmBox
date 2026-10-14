//! Signed distribution packages and immutable installed snapshots. No business algorithms.
mod archive;
mod catalog;
mod cfd;
mod model;
mod store;

pub use catalog::{load_catalog, target, trusted_key};
pub use cfd::configure as configure_cfd;
pub use model::{Catalog, Package, Progress, Snapshot};
pub use store::{default_root, install, installed, package_path, read_ui, remove};
