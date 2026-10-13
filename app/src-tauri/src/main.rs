// Prevents an extra console from opening on Windows when running the release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ourabox_lib::run()
}
