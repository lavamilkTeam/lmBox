//! Minimal declarations from NASA CEA v3.3.4 cea.h / cea_enum.h.
//! Only the public recovery-enabled C symbols are loaded, never *_fortran.
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_void, CStr},
    path::Path,
};

pub(super) type Ptr = *mut c_void;
pub(super) type Destroy = unsafe extern "C" fn(*mut Ptr) -> c_int;

macro_rules! api {
    ($($name:ident($($arg:ty),*);)*) => {
        pub(super) struct Api {
            $(pub $name: unsafe extern "C" fn($($arg),*) -> c_int,)*
            _library: Library,
        }
        impl Api {
            pub fn load(path: &Path) -> Result<Self, String> {
                // SAFETY: the host selects a trusted, locally compiled CEA library.
                // Signatures match the pinned header, symbols stay valid until drop.
                unsafe {
                    let library = Library::new(path).map_err(|e| e.to_string())?;
                    Ok(Self {
                        $($name: *library.get(concat!(stringify!($name), "\0").as_bytes())
                            .map_err(|e| e.to_string())?,)*
                        _library: library,
                    })
                }
            }
        }
    };
}

api! {
    cea_version_major(*mut c_int);
    cea_version_minor(*mut c_int);
    cea_version_patch(*mut c_int);
    cea_set_log_level(c_int);
    cea_last_error_message_buf(*mut c_char, c_int);
    cea_init_thermo(*const c_char);
    cea_reactant_get_valid_temperature_range(*const c_char, *mut f64, *mut f64);
    cea_mixture_create(*mut Ptr, c_int, *const *const c_char);
    cea_mixture_create_from_reactants(*mut Ptr, c_int, *const *const c_char, c_int, *const *const c_char);
    cea_mixture_destroy(*mut Ptr);
    cea_mixture_get_num_species(Ptr, *mut c_int);
    cea_mixture_get_species_names_buf(*const Ptr, c_int, *mut c_char, c_int);
    cea_mixture_calc_property_multitemp(Ptr, c_int, c_int, *const f64, c_int, *const f64, *mut f64);
    cea_eqsolver_create_with_reactants(*mut Ptr, Ptr, Ptr);
    cea_eqsolver_destroy(*mut Ptr);
    cea_eqsolution_create(*mut Ptr, Ptr);
    cea_eqsolution_destroy(*mut Ptr);
    cea_eqsolver_solve(Ptr, c_int, f64, f64, *const f64, Ptr);
    cea_eqsolution_get_converged(Ptr, *mut c_int);
    cea_eqsolution_get_property(Ptr, c_int, *mut f64);
    cea_eqsolution_get_species_amounts(Ptr, c_int, *mut f64, bool);
    cea_rocket_solver_create_with_reactants(*mut Ptr, Ptr, Ptr);
    cea_rocket_solver_destroy(*mut Ptr);
    cea_rocket_solution_create(*mut Ptr, Ptr);
    cea_rocket_solution_destroy(*mut Ptr);
    cea_rocket_solver_solve_iac(Ptr, Ptr, *const f64, f64, *const f64, c_int, *const f64, c_int, *const f64, c_int, c_int, f64, bool, f64, bool);
    cea_rocket_solution_get_converged(Ptr, *mut c_int);
    cea_rocket_solution_get_size(Ptr, *mut c_int);
    cea_rocket_solution_get_property(Ptr, c_int, c_int, *mut f64);
    cea_rocket_solution_get_species_amounts(Ptr, c_int, c_int, *mut f64, bool);
}

impl Api {
    pub fn check(&self, code: c_int, operation: &str) -> Result<(), String> {
        if code == 0 {
            return Ok(());
        }
        let mut message = [0 as c_char; 2048];
        // SAFETY: valid, bounded caller-owned buffer; serialized by runtime lock.
        unsafe {
            (self.cea_last_error_message_buf)(message.as_mut_ptr(), 2048);
        }
        message[2047] = 0;
        let message = unsafe { CStr::from_ptr(message.as_ptr()) }.to_string_lossy();
        Err(format!(
            "{operation}: CEA error {code}{} ({message})",
            if code == 8 { " (not converged)" } else { "" }
        ))
    }
}

pub(super) struct Handle<'a> {
    pub ptr: Ptr,
    destroy: Destroy,
    _api: &'a Api,
}

impl<'a> Handle<'a> {
    pub fn new(api: &'a Api, destroy: Destroy) -> Self {
        Self {
            ptr: std::ptr::null_mut(),
            destroy,
            _api: api,
        }
    }
}

impl Drop for Handle<'_> {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            // SAFETY: exclusively owned handle, correct destructor, live library;
            // the enclosing solve retains the process-wide lock through all drops.
            unsafe {
                (self.destroy)(&mut self.ptr);
            }
        }
    }
}
