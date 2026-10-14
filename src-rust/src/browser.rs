//! Thin browser ABI. Import policy and parsing remain in board_import.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn import_board(name: &str, bytes: &[u8]) -> Result<String, JsValue> {
    let result = crate::modules::stencil::import_board(name, bytes)
        .map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&result).map_err(|_| JsValue::from_str("图形结果编码失败。"))
}
