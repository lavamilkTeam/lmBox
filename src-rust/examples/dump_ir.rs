//! Prints the parsed graphics IR of `demo.gbr` as pretty JSON. Used to produce
//! the frontend's sample graphics data so the browser adapter can exercise the
//! renderer against real parser output before the Rust/WASM bridge lands.

fn main() {
    let source = include_str!("../tests/fixtures/demo.gbr");
    let ir = lmbox::parse_gerber(source).expect("demo.gbr must parse");
    println!(
        "{}",
        serde_json::to_string_pretty(&ir).expect("graphics IR must serialize")
    );
}
