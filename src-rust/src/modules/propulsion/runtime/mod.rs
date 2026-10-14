pub(super) mod cea;
pub(super) mod design;

/// Load only the canonical library path selected by the native host.
///
/// # Safety
/// The caller must trust the library and its initialization/destruction routines.
unsafe fn load_library(path: &std::path::Path) -> Result<libloading::Library, libloading::Error> {
    #[cfg(target_os = "windows")]
    {
        use libloading::os::windows::{Library, LOAD_WITH_ALTERED_SEARCH_PATH};

        // Resolve bundled GCC DLLs beside the requested library without changing
        // the process-wide DLL directory. Preserve PATH for source-built runtimes.
        // SAFETY: the host canonicalizes the trusted library's parent directory.
        unsafe { Library::load_with_flags(path, LOAD_WITH_ALTERED_SEARCH_PATH).map(Into::into) }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // SAFETY: the caller guarantees the trusted native library's lifecycle.
        unsafe { libloading::Library::new(path) }
    }
}
