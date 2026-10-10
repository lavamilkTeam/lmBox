use lmbox::{contracts::LayerRole, features::board_import::import_board};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;

const GERBER: &[u8] = include_bytes!("fixtures/basic.gbr");

fn archive(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in files {
        writer
            .start_file(
                *name,
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
            )
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn imports_actual_geometry_and_classifies_layers() {
    let bytes = archive(&[
        ("board-F_Paste.gbr", GERBER),
        ("board-B_Paste.gbr", GERBER),
        ("board-Edge_Cuts.gbr", GERBER),
    ]);
    let result = import_board("board.zip", &bytes).unwrap();
    assert_eq!(result.layers.len(), 3);
    assert_eq!(result.layers[0].role, LayerRole::TopPaste);
    assert_eq!(result.layers[1].role, LayerRole::BottomPaste);
    assert_eq!(result.layers[2].role, LayerRole::Outline);
    assert_eq!(result.layers[0].ir.as_ref().unwrap().objects.len(), 3);
}

#[test]
fn failures_are_located_per_layer_and_never_replaced_with_demo_data() {
    let bytes = archive(&[
        ("top.gtp", GERBER),
        ("bad.gbp", b"%FSLAX34Y34*%\n%ZZ*%"),
        ("board.dxf", b"DXF"),
    ]);
    let result = import_board("board.zip", &bytes).unwrap();
    assert!(result.layers[0].ir.is_some());
    assert!(result.layers[1].ir.is_none());
    assert_eq!(result.layers[1].diagnostic.as_ref().unwrap().line, Some(2));
    assert_eq!(
        result.layers[2].diagnostic.as_ref().unwrap().code,
        "unsupported_format"
    );
    let empty = import_board("empty.gtp", b"G04 no geometry*\nM02*").unwrap();
    assert_eq!(
        empty.layers[0].diagnostic.as_ref().unwrap().code,
        "empty_geometry"
    );
}

#[test]
fn rejects_unsafe_corrupt_and_oversized_inputs() {
    assert!(import_board("broken.zip", b"bad zip").is_err());
    assert!(import_board("unsafe.zip", &archive(&[("../top.gtp", GERBER)])).is_err());
    assert!(import_board("unsafe.zip", &archive(&[("folder\\..\\top.gtp", GERBER)])).is_err());
    assert!(import_board("empty.zip", &archive(&[])).is_err());
    assert!(import_board("large.gtp", &vec![0; 30 * 1024 * 1024 + 1]).is_err());
    let bad = import_board("encoding.gtp", &[0xff]).unwrap();
    assert_eq!(
        bad.layers[0].diagnostic.as_ref().unwrap().code,
        "invalid_encoding"
    );
}

#[test]
fn import_response_matches_shared_schema() {
    let graphics = serde_json::from_str(include_str!(
        "../../contracts/schemas/v2/graphics.schema.json"
    ))
    .unwrap();
    let schema = serde_json::from_str(include_str!(
        "../../contracts/schemas/v1/import.schema.json"
    ))
    .unwrap();
    let validator = jsonschema::options()
        .with_resource(
            "https://lmbox.local/contracts/schemas/v2/graphics.schema.json",
            jsonschema::Resource::from_contents(graphics).unwrap(),
        )
        .build(&schema)
        .unwrap();
    for bytes in [GERBER, b"%BAD*%", b"G04 empty*"].iter() {
        let result = import_board("top.gtp", bytes).unwrap();
        validator
            .validate(&serde_json::to_value(result).unwrap())
            .unwrap();
    }
}
