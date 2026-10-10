#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cfd;
mod commands;
mod propulsion;

fn main() {
    commands::run();
}
