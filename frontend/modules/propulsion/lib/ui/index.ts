export { default as QuantityField } from './QuantityField.vue'
export { default as ContourPlot } from './ContourPlot.vue'
export { default as PassagePlot } from './PassagePlot.vue'
export const formatQuantity = (value: number, scale = 1) => (value / scale).toLocaleString('en-US', { maximumSignificantDigits: 7, useGrouping: false })
export { default as EngineeringDrawing } from './EngineeringDrawing.vue'
export { drawingSvg, drawingDxf } from './drawing'
export type { DrawingSpec } from './drawing'
