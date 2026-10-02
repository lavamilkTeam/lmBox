use crate::contracts::PreviewRequest;

/// Business validation precedes any external computation.
pub fn validate_preview(request: &PreviewRequest) -> Result<(), String> {
    if request.protocol_version != "1" || request.ir.schema_version != "2" {
        return Err("模型请求版本不受支持。".into());
    }
    if [&request.project_id, &request.job_id]
        .iter()
        .any(|id| id.is_empty() || id.len() > 100)
    {
        return Err("模型任务标识无效。".into());
    }
    let s = &request.settings;
    if !s.thickness.is_finite()
        || !(0.05..=3.0).contains(&s.thickness)
        || !s.margin.is_finite()
        || !(1.0..=30.0).contains(&s.margin)
        || !s.compensation.is_finite()
        || !(-0.3..=0.5).contains(&s.compensation)
    {
        return Err("模板尺寸参数超出范围。".into());
    }
    if request.ir.objects.is_empty() || request.ir.objects.len() > 20000 {
        return Err("图层为空或图形数量超出三维预览限制。".into());
    }
    Ok(())
}
