#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use lmbox::{
        app::{CeaBackend, PropulsionBackend},
        contracts::propulsion::{DesignRequest, DesignResult},
    };
    use std::io::{self, Read};
    let run = || -> Result<(), Box<dyn std::error::Error>> {
        let mut args = std::env::args_os().skip(1);
        let native_runtime = args.next().ok_or(
            "usage: propulsion <trusted-propulsion-runtime> [trusted-CEA-runtime] < request.json",
        )?;
        let runtime = args.next();
        if args.next().is_some() {
            return Err("usage: propulsion <trusted-propulsion-runtime> [trusted-CEA-runtime] < request.json".into());
        }
        let mut input = Vec::new();
        io::stdin().take(65_537).read_to_end(&mut input)?;
        if input.len() > 65_536 {
            return Err("design request exceeds 64 KiB".into());
        }
        let request: DesignRequest = serde_json::from_slice(&input)?;
        let backend = PropulsionBackend::load(native_runtime)?;
        let result = match request {
            DesignRequest::Nozzle(request) => {
                let runtime =
                    runtime.ok_or("nozzle design requires a trusted CEA runtime directory")?;
                DesignResult::Nozzle(Box::new(
                    backend.design_nozzle(&CeaBackend::load(runtime)?, &request)?,
                ))
            }
            DesignRequest::Injector(request) => {
                DesignResult::Injector(Box::new(backend.design_injector(&request)?))
            }
        };
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
