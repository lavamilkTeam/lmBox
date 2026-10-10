#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use lmbox::{app::CeaBackend, contracts::thermochemistry::CeaRequest};
    use std::io::{self, Read};
    let run = || -> Result<(), Box<dyn std::error::Error>> {
        let mut args = std::env::args_os().skip(1);
        let runtime = args
            .next()
            .ok_or("usage: cea <trusted-runtime-directory> < request.json")?;
        if args.next().is_some() {
            return Err("expected one runtime directory".into());
        }
        let mut input = Vec::new();
        io::stdin().take(65537).read_to_end(&mut input)?;
        if input.len() > 65536 {
            return Err("CEA request exceeds 64 KiB".into());
        }
        let request: CeaRequest = serde_json::from_slice(&input)?;
        let result = CeaBackend::load(runtime)?.solve(&request)?;
        serde_json::to_writer(io::stdout().lock(), &result)?;
        println!();
        Ok(())
    };
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(target_arch = "wasm32")]
fn main() {}
