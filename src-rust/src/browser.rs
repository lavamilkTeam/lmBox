//! Thin browser ABI. Import policy and parsing remain in board_import.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn import_board(name: &str, bytes: &[u8]) -> Result<String, JsValue> {
    let result = crate::modules::stencil::import_board(name, bytes)
        .map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&result).map_err(|_| JsValue::from_str("图形结果编码失败。"))
}

/// One browser worker owns one Rust simulation session.
#[wasm_bindgen]
#[derive(Default)]
pub struct DigitalLogicSimulator {
    simulator: crate::modules::digital_logic::Simulator,
}

#[wasm_bindgen]
impl DigitalLogicSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn request(&mut self, json: &str) -> Result<String, JsValue> {
        if json.len() > 1024 * 1024 {
            return Err(JsValue::from_str("数字逻辑请求超过大小限制。"));
        }
        let request =
            serde_json::from_str(json).map_err(|_| JsValue::from_str("数字逻辑请求格式无效。"))?;
        let response = self
            .simulator
            .request(request)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_json::to_string(&response).map_err(|_| JsValue::from_str("数字逻辑结果编码失败。"))
    }
}
