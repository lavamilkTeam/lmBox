/** Manual mapping of propulsion v1 and its embedded CEA result. SI unless named otherwise. */
export interface DesignIdentity { schemaVersion: 1; projectId: string; jobId: string; inputRevision: number }
export interface Reactant { species: string; massFraction: number; temperatureK: number }
export type RocketChemistry = 'equilibrium' | 'frozenAtChamber' | 'frozenAtThroat'
export type NozzleContour =
  | { type: 'conical'; halfAngleDeg: number; throatArcRadiusRatio: number }
  | { type: 'quadraticBell'; lengthOverThroatRadius: number; startAngleDeg: number; exitAngleDeg: number; throatArcRadiusRatio: number }
export interface NozzleRequest {
  identity: DesignIdentity; reactants: Reactant[]; chemistry: RocketChemistry
  chamberPressurePa: number; massFlowKgS: number; ambientPressurePa: number
  expansionRatio: number; segments: number; contour: NozzleContour; chamber?: ChamberRequest
}
export type ConvergentProfile =
  | { type: 'filletedCone'; halfAngleDeg: number; inletRadiusM: number; throatRadiusM: number }
  | { type: 'tangentArcs'; joinAngleDeg: number; throatRadiusFraction: number }
  | { type: 'cubicBezier'; lengthM: number; startHandleFraction: number; endHandleFraction: number }
export interface ChamberRequest { innerDiameterM: number; cylinderLengthM: number; convergence: ConvergentProfile }
export interface ChamberGeometry {
  inletXM: number; convergentStartXM: number; innerRadiusM: number; contractionRatio: number
  cylinderLengthM: number; convergentLengthM: number; totalLengthM: number
  inletArcRadiusM: number; throatArcRadiusM: number; joinAngleDeg: number
  firstPoint: { xM: number; radiusM: number }; secondPoint: { xM: number; radiusM: number }
  contour: { xM: number; radiusM: number }[]
}
export type LiquidPassage = { type: 'circular' } | { type: 'annular'; innerDiameterM: number }
export interface LiquidCircuit {
  densityKgM3: number; dynamicViscosityPaS: number; pressureDropPa: number
  dischargeCoefficient: number; elementCount: number; passage: LiquidPassage
}
export interface InjectorRequest {
  identity: DesignIdentity; totalMassFlowKgS: number; oxidizerFuelMassRatio: number
  oxidizer: LiquidCircuit; fuel: LiquidCircuit
}
export interface ThermodynamicState {
  temperatureK: number; pressurePa: number; densityKgM3: number; enthalpyJKg: number
  entropyJKgK: number; cpJKgK: number; gammaS: number; molecularWeightKgKmol: number
  species: { species: string; massFraction: number }[]
}
export interface RocketStation {
  kind: 'chamber' | 'throat' | 'exit'; state: ThermodynamicState; mach: number
  performance: null | { areaRatio: number; cStarMS: number; matchedThrustCoefficient: number; matchedSpecificImpulseS: number; vacuumSpecificImpulseS: number }
}
export interface CeaRocketResult extends DesignIdentity {
  engineVersion: string; converged: boolean; solution: { type: 'rocket'; stations: RocketStation[] }
}
export interface NozzleResult {
  identity: DesignIdentity; modelVersion: string; cea: CeaRocketResult
  throatAreaM2: number; exitAreaM2: number; throatRadiusM: number; exitRadiusM: number
  divergentLengthM: number; massFlowKgS: number; idealThrustN: number
  idealSpecificImpulseS: number; idealThrustCoefficient: number; conicalDivergenceFactor: number | null
  chamberGeometry?: ChamberGeometry
  contour: { xM: number; radiusM: number }[]; assumptions: string[]; warnings: string[]
}
export interface LiquidCircuitResult {
  massFlowKgS: number; massFlowPerElementKgS: number; totalFlowAreaM2: number; areaPerElementM2: number
  innerDiameterM: number; outerDiameterM: number; hydraulicDiameterM: number; meanVelocityMS: number; reynoldsNumber: number
}
export interface InjectorResult {
  identity: DesignIdentity; modelVersion: string; oxidizer: LiquidCircuitResult; fuel: LiquidCircuitResult; assumptions: string[]
}
export type DesignRequest = { type: 'nozzle'; request: NozzleRequest } | { type: 'injector'; request: InjectorRequest }
export type DesignResult = { type: 'nozzle'; result: NozzleResult } | { type: 'injector'; result: InjectorResult }
