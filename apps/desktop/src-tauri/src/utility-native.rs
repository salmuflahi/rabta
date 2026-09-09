use serde_json::Value;

/// Private allowlisted bridge. Never expose the operation argument as a Tauri command.
pub(super) fn call(operation: &str, request: Value) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::{CStr, CString};
        use std::os::raw::c_char;
        extern "C" {
            fn rabta_native_toolkit(operation: *const c_char, json: *const c_char) -> *mut c_char;
            fn rabta_native_free(value: *mut c_char);
        }
        let operation = CString::new(operation).map_err(|_| "Invalid operation.")?;
        let request = CString::new(request.to_string()).map_err(|_| "Invalid request.")?;
        // The Objective-C entrypoint catches native exceptions, and malloc-owned
        // output is always released before parsing or returning an error.
        let response = unsafe {
            let pointer = rabta_native_toolkit(operation.as_ptr(), request.as_ptr());
            if pointer.is_null() { return Err("The native service is unavailable.".into()); }
            let response = CStr::from_ptr(pointer).to_string_lossy().into_owned();
            rabta_native_free(pointer);
            response
        };
        if response.len() > 2_000_000 { return Err("The native response exceeded its size limit.".into()); }
        let value: Value = serde_json::from_str(&response).map_err(|_| "Could not read the native response.")?;
        if let Some(error) = value.get("error").and_then(Value::as_str) { return Err(error.to_string()); }
        Ok(value)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (operation, request);
        Err("This control requires the Rabta macOS app.".into())
    }
}
