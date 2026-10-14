#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod cfd;
mod commands;
mod modules;
mod propulsion;

fn main() {
    commands::run();
}
