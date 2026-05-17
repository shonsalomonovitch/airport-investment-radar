export interface FaaAirportProfile {
  locid: string;
  name: string;
  city: string;
  state: string;
  region: string;
  hubSize: 'large' | 'medium' | 'small' | 'non-hub';
  hubSizeRaw: number;
  servedVolume: number;
  hasControlTower: boolean;
  isOep35: boolean; // FAA top-35 OEP airport
}

export interface FaaOperationsRow {
  locid: string;
  scenario: number;
  year: number;
  airCarrierItinerant: number;
  airTaxiItinerant: number;
  generalAviationItinerant: number;
  militaryItinerant: number;
  localGa: number;
  localMilitary: number;
  overflights: number;
  totalOperations: number;
}

export interface FaaEnplanementsRow {
  locid: string;
  scenario: number;
  year: number;
  airCarrier: number;
  airTaxi: number;
  commuter: number;
  usFlag: number;
  foreignFlag: number;
  totalEnplanements: number;
}

export interface FaaDemandSnapshot {
  iata: string;
  name: string;
  state: string;
  hubSize: string;
  currentYear: number;
  forecastYear: number;
  currentOperations: number;
  forecastOperations: number;
  operationsGrowthPct: number;
  currentEnplanements: number;
  forecastEnplanements: number;
  enplanementGrowthPct: number;
  source: string;
  uncertainty?: string;
}

export interface FaaResult<T> {
  data: T;
  source: string;
  uncertainty?: string;
}
