use super::GraphicsIr;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettings {
    pub thickness: f64,
    pub margin: f64,
    pub compensation: f64,
    pub mirror: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design: Option<DesignSettings>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewRequest {
    pub protocol_version: String,
    pub project_id: String,
    pub job_id: String,
    pub input_revision: u64,
    pub ir: GraphicsIr,
    pub settings: ModelSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline: Option<GraphicsIr>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edits: Vec<ObjectEdit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub export_format: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Optimization {
    pub scale: f64,
    pub rounding: f64,
    pub grid: bool,
    pub grid_threshold: f64,
    pub grid_cell: f64,
    pub grid_web: f64,
    pub stagger: bool,
    pub gap: f64,
    pub stagger_offset: f64,
    pub stagger_shrink: f64,
    pub taper: f64,
    #[serde(default)]
    pub inverse_taper: bool,
    #[serde(default = "default_xy_mode")]
    pub xy_mode: String,
    #[serde(default = "default_xy_scale_x")]
    pub xy_scale_x: f64,
    #[serde(default = "default_xy_scale_y")]
    pub xy_scale_y: f64,
}
fn default_xy_mode() -> String {
    "off".into()
}
fn default_xy_scale_x() -> f64 {
    80.0
}
fn default_xy_scale_y() -> f64 {
    120.0
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesignSettings {
    pub kind: String,
    pub frame: String,
    pub extra_left: f64,
    pub extra_right: f64,
    pub extra_top: f64,
    pub extra_bottom: f64,
    pub corner_style: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_styles: Option<std::collections::BTreeMap<String, String>>,
    pub corner_t_l: f64,
    pub corner_t_r: f64,
    pub corner_b_l: f64,
    pub corner_b_r: f64,
    pub board_thickness: f64,
    pub clearance: f64,
    pub floor: f64,
    pub slot_width: f64,
    pub chamfer: f64,
    pub optimization: Optimization,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectEdit {
    pub id: String,
    pub dx: f64,
    pub dy: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub compensation: f64,
    pub deleted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub optimization: Option<Optimization>,
}

fn range(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && (min..=max).contains(&value)
}
impl Optimization {
    pub(crate) fn valid(&self) -> bool {
        range(self.scale, 10.0, 200.0)
            && range(self.rounding, 0.0, 2.0)
            && range(self.grid_threshold, 0.2, 20.0)
            && range(self.grid_cell, 0.2, 10.0)
            && range(self.grid_web, 0.1, 2.0)
            && range(self.gap, 0.05, 3.0)
            && range(self.stagger_offset, 0.0, 50.0)
            && range(self.stagger_shrink, 0.0, 70.0)
            && range(self.taper, 100.0, 200.0)
            && (!self.inverse_taper || self.taper < 200.0)
            && ["off", "upper", "whole", "opposed"].contains(&self.xy_mode.as_str())
            && range(self.xy_scale_x, 10.0, 200.0)
            && range(self.xy_scale_y, 10.0, 200.0)
            && (self.xy_mode != "opposed" || (self.xy_scale_x < 200.0 && self.xy_scale_y < 200.0))
    }
}
impl DesignSettings {
    pub(crate) fn valid(&self) -> bool {
        ["stencil", "base"].contains(&self.kind.as_str())
            && ["bounds", "outline"].contains(&self.frame.as_str())
            && range(self.extra_left, 0.0, 30.0)
            && range(self.extra_right, 0.0, 30.0)
            && range(self.extra_top, 0.0, 30.0)
            && range(self.extra_bottom, 0.0, 30.0)
            && ["round", "chamfer"].contains(&self.corner_style.as_str())
            && self.corner_styles.as_ref().is_none_or(|styles| {
                styles.len() == 4
                    && ["TL", "TR", "BL", "BR"].iter().all(|key| {
                        styles
                            .get(*key)
                            .is_some_and(|style| ["round", "chamfer"].contains(&style.as_str()))
                    })
            })
            && range(self.corner_t_l, 0.0, 20.0)
            && range(self.corner_t_r, 0.0, 20.0)
            && range(self.corner_b_l, 0.0, 20.0)
            && range(self.corner_b_r, 0.0, 20.0)
            && range(self.board_thickness, 0.2, 10.0)
            && range(self.clearance, 0.0, 2.0)
            && range(self.floor, 0.2, 10.0)
            && range(self.slot_width, 0.0, 20.0)
            && range(self.chamfer, 0.0, 2.0)
            && self.optimization.valid()
    }
}
impl ObjectEdit {
    pub(crate) fn valid(&self) -> bool {
        range(self.dx, -500.0, 500.0)
            && range(self.dy, -500.0, 500.0)
            && range(self.scale_x, 0.1, 3.0)
            && range(self.scale_y, 0.1, 3.0)
            && range(self.rotation, -360.0, 360.0)
            && range(self.compensation, -0.3, 0.5)
            && self.id.len() <= 40
            && self.id.split(':').count() == 3
            && self
                .id
                .split(':')
                .all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
            && self.optimization.as_ref().is_none_or(|o| o.valid())
    }
}
