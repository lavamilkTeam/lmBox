use lmbox::contracts::{
    ApertureShape, ArcDirection, Exposure, GraphicObject, MacroShape, Polarity, Segment, Unit,
};
use lmbox::parse_gerber;

fn approx(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-6, "expected {a}, got {b}");
}

#[test]
fn parses_templates_and_flashes_in_millimetres() {
    let ir = parse_gerber(include_str!("fixtures/basic.gbr")).unwrap();
    assert_eq!(ir.unit, Unit::Mm);
    assert_eq!(ir.apertures.len(), 4);

    assert!(matches!(
        &ir.apertures[0].shape,
        ApertureShape::Circle { diameter, hole_diameter: None } if (diameter - 0.5).abs() < 1e-9
    ));
    assert!(matches!(
        &ir.apertures[1].shape,
        ApertureShape::Rectangle { width, height, hole_diameter: None }
            if (width - 1.0).abs() < 1e-9 && (height - 2.0).abs() < 1e-9
    ));
    assert!(matches!(
        &ir.apertures[2].shape,
        ApertureShape::Obround { width, height, .. }
            if (width - 1.5).abs() < 1e-9 && (height - 0.8).abs() < 1e-9
    ));

    assert_eq!(ir.objects.len(), 3);
    match &ir.objects[0] {
        GraphicObject::Flash {
            polarity,
            aperture,
            at,
            ..
        } => {
            assert_eq!(*polarity, Polarity::Dark);
            assert_eq!(*aperture, 10);
            approx(at.x, 1.5);
            approx(at.y, 2.5);
        }
        other => panic!("expected flash, got {other:?}"),
    }
    match &ir.objects[2] {
        GraphicObject::Flash { aperture, at, .. } => {
            assert_eq!(*aperture, 11);
            approx(at.x, 1.0);
            approx(at.y, 4.0);
        }
        other => panic!("expected flash, got {other:?}"),
    }
}

#[test]
fn preserves_lines_and_arcs_in_draw_order() {
    let ir = parse_gerber(include_str!("fixtures/draw_arc.gbr")).unwrap();
    assert_eq!(ir.objects.len(), 1);
    let GraphicObject::Stroke {
        start, segments, ..
    } = &ir.objects[0]
    else {
        panic!("expected a stroke");
    };
    assert_eq!(*start, lmbox::contracts::Point::new(0.0, 0.0));
    assert_eq!(segments.len(), 4);

    assert!(
        matches!(&segments[0], Segment::Line { to } if (to.x - 1.0).abs() < 1e-9 && to.y == 0.0)
    );

    match &segments[1] {
        Segment::Arc {
            to,
            center,
            direction,
            full_circle,
        } => {
            approx(to.x, 0.0);
            approx(to.y, 1.0);
            approx(center.x, 0.0);
            approx(center.y, 0.0);
            assert_eq!(*direction, ArcDirection::CounterClockwise);
            assert!(!full_circle);
        }
        other => panic!("expected arc, got {other:?}"),
    }

    // A clockwise arc whose end equals its start is a full circle.
    match &segments[3] {
        Segment::Arc {
            center,
            direction,
            full_circle,
            ..
        } => {
            approx(center.x, 0.5);
            approx(center.y, 0.0);
            assert_eq!(*direction, ArcDirection::Clockwise);
            assert!(full_circle);
        }
        other => panic!("expected arc, got {other:?}"),
    }
}

#[test]
fn regions_record_clear_polarity_and_contours() {
    let ir = parse_gerber(include_str!("fixtures/region_polarity.gbr")).unwrap();
    assert_eq!(ir.objects.len(), 1);
    let GraphicObject::Region {
        polarity, contours, ..
    } = &ir.objects[0]
    else {
        panic!("expected a region");
    };
    assert_eq!(*polarity, Polarity::Clear);
    assert_eq!(contours.len(), 1);
    assert_eq!(contours[0].start, lmbox::contracts::Point::new(0.0, 0.0));
    assert_eq!(contours[0].segments.len(), 4);
    assert!(contours[0]
        .segments
        .iter()
        .all(|s| matches!(s, Segment::Line { .. })));
}

#[test]
fn evaluates_aperture_macro_primitives() {
    let ir = parse_gerber(include_str!("fixtures/macro.gbr")).unwrap();
    let ApertureShape::Macro { name, primitives } = &ir.apertures[0].shape else {
        panic!("expected a macro aperture");
    };
    assert_eq!(name, "ROUNDRECT");
    assert_eq!(primitives.len(), 2);

    let MacroShape::CenterLine {
        width,
        height,
        center,
        ..
    } = &primitives[0].shape
    else {
        panic!("expected centre-line primitive");
    };
    assert_eq!(primitives[0].exposure, Exposure::On);
    approx(*width, 2.0);
    approx(*height, 3.0);
    approx(center.x, 0.0);
    approx(center.y, 0.0);

    let MacroShape::Circle { diameter, .. } = &primitives[1].shape else {
        panic!("expected circle primitive");
    };
    approx(*diameter, 0.5);
}

#[test]
fn normalizes_inches_to_millimetres() {
    let ir = parse_gerber(include_str!("fixtures/inches.gbr")).unwrap();
    assert_eq!(ir.source.original_unit, lmbox::contracts::OriginalUnit::In);
    let ApertureShape::Circle { diameter, .. } = &ir.apertures[0].shape else {
        panic!("expected circle");
    };
    approx(*diameter, 2.54); // 0.1 inch
    let GraphicObject::Flash { at, .. } = &ir.objects[0] else {
        panic!("expected flash");
    };
    approx(at.x, 25.4);
    approx(at.y, 25.4);
}

#[test]
fn records_step_and_repeat() {
    let ir = parse_gerber(include_str!("fixtures/step_repeat.gbr")).unwrap();
    let sr = ir.step_and_repeat.expect("step and repeat present");
    assert_eq!(sr.x_count, 2);
    assert_eq!(sr.y_count, 3);
    approx(sr.x_step, 1.0);
    approx(sr.y_step, 2.0);
}

#[test]
fn rejects_coordinates_before_format() {
    let err = parse_gerber("X1000Y1000D02*\nM02*").unwrap_err();
    assert!(err.message.contains("%FS%"));
}

#[test]
fn rejects_undefined_apertures_and_unknown_commands() {
    let err = parse_gerber("%FSLAX34Y34*%\n%MOMM*%\nD99*\nX1000Y1000D03*\nM02*").unwrap_err();
    assert!(err.message.contains("D99"), "got: {}", err.message);

    let err = parse_gerber("%FSLAX34Y34*%\n%MOMM*%\n%ZZUNKNOWN*%").unwrap_err();
    assert!(
        err.message.contains("unsupported extended command"),
        "got: {}",
        err.message
    );
}

#[test]
fn ir_round_trips_through_schema_valid_json() {
    let ir = parse_gerber(include_str!("fixtures/macro.gbr")).unwrap();
    let value = serde_json::to_value(&ir).unwrap();

    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v2/graphics.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    if let Err(e) = validator.validate(&value) {
        panic!("IR failed schema validation: {e}");
    }

    let back: lmbox::contracts::GraphicsIr = serde_json::from_value(value).unwrap();
    assert_eq!(back, ir);
}

#[test]
fn flash_object_field_names_match_schema() {
    let ir = parse_gerber(include_str!("fixtures/basic.gbr")).unwrap();
    let value = serde_json::to_value(&ir.objects[0]).unwrap();
    let obj = value.as_object().unwrap();
    assert_eq!(obj["kind"], "flash");
    assert_eq!(obj["polarity"], "dark");
    assert!(obj.contains_key("sourceOffset"));
    assert_eq!(obj["at"]["x"], 1.5);
    assert_eq!(obj["at"]["y"], 2.5);
}

#[test]
fn browser_demo_matches_parser_output_and_supported_sample_shapes() {
    let ir = parse_gerber(include_str!("fixtures/demo.gbr")).unwrap();
    let browser: serde_json::Value =
        serde_json::from_str(include_str!("../../src/platform/desktop/lib/demo-ir.json")).unwrap();
    assert_eq!(serde_json::to_value(&ir).unwrap(), browser);
    assert_eq!(ir.objects.len(), 124);
    assert!(ir.objects.iter().all(|obj| matches!(
        obj,
        GraphicObject::Flash {
            polarity: Polarity::Dark,
            ..
        }
    )));
    assert!(ir.apertures.iter().all(|a| matches!(
        a.shape,
        ApertureShape::Circle {
            hole_diameter: None,
            ..
        } | ApertureShape::Rectangle {
            hole_diameter: None,
            ..
        }
    )));
}

#[test]
fn all_preview_fixtures_follow_the_graphics_schema() {
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v2/graphics.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    for source in [
        include_str!("fixtures/demo.gbr"),
        include_str!("fixtures/preview-shapes.gbr"),
        include_str!("fixtures/draw_arc.gbr"),
        include_str!("fixtures/region_polarity.gbr"),
        include_str!("fixtures/step_repeat.gbr"),
    ] {
        let ir = parse_gerber(source).unwrap();
        validator
            .validate(&serde_json::to_value(ir).unwrap())
            .unwrap();
    }
}

#[test]
fn region_starts_at_the_current_position_without_an_extra_move() {
    let ir = parse_gerber("%FSLAX34Y34*%\n%MOMM*%\nX10000Y20000D02*\nG36*\nX30000Y20000D01*\nX10000Y40000D01*\nX10000Y20000D01*\nG37*\nM02*").unwrap();
    let GraphicObject::Region { contours, .. } = &ir.objects[0] else {
        panic!("expected a region");
    };
    assert_eq!(contours[0].start, lmbox::contracts::Point::new(1.0, 2.0));
}

#[test]
fn revised_graphics_are_not_mislabeled_as_v1() {
    let ir = parse_gerber(include_str!("fixtures/draw_arc.gbr")).unwrap();
    assert_eq!(ir.schema_version, "2");
    let old_schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/graphics.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::validator_for(&old_schema).unwrap();
    assert!(validator
        .validate(&serde_json::to_value(ir).unwrap())
        .is_err());
}

#[test]
fn preserves_modal_draws_and_flashes_without_adding_a_g54_flash() {
    let ir=parse_gerber("%FSLAX34Y34*%\n%MOMM*%\n%ADD10C,1*%\nG54D10*\nX0Y0D02*\nX10000Y0D01*\nX20000Y0*\nX30000Y0D03*\nX40000Y0*\nM02*").unwrap();
    assert_eq!(ir.objects.len(), 3);
    let GraphicObject::Stroke { segments, .. } = &ir.objects[0] else {
        panic!("expected stroke")
    };
    assert_eq!(segments.len(), 2);
    assert!(matches!(&ir.objects[2],GraphicObject::Flash{at,..} if at.x==4.0));
}

#[test]
fn repeat_scope_and_single_quadrant_arcs_cannot_silently_change_geometry() {
    let prefix = "%FSLAX34Y34*%\n%MOMM*%\n%ADD10C,1*%\nD10*\n";
    assert!(parse_gerber(&format!("{prefix}G74*\nX0Y0D02*")).is_err());
    assert!(parse_gerber(&format!("{prefix}X0Y0D03*\n%SRX2Y2I5J5*%")).is_err());
    let repeated = format!("{prefix}%SRX2Y2I5J5*%\nX0Y0D03*\n%SR*%\n");
    assert!(parse_gerber(&format!("{repeated}M02*")).is_ok());
    assert!(parse_gerber(&format!("{repeated}X10000Y10000D03*")).is_err());
}
